import { Frontmatter, Priority, Recurrence, Task, TaskStatus } from './models';
import { dayKey } from './calendar-data';
import {
	PROJECT_TEMPLATES_ROOT,
	ProjectTemplateInfo,
	findSyncIdentityKeys,
	isTemplateFolderSegment,
	templateFolderPath,
	templateProjectNotePath,
} from './project-templates';
import { nextInstanceTitle, nextOccurrence, noteBody } from './recurrence';
import { dueDateKey } from './view-data';

/** Thin boundary over Obsidian vault IO so core stays testable; main.ts provides the real one. */
export interface VaultAdapter {
	exists(path: string): Promise<boolean>;
	createFolder(path: string): Promise<void>;
	createNote(path: string, content: string): Promise<void>;
	listFolders(path: string): Promise<string[]>;
	listMarkdownFiles(path: string): Promise<string[]>;
	copyFolder(sourcePath: string, destinationPath: string): Promise<void>;
	renamePath(path: string, newPath: string): Promise<void>;
	readNote(path: string): Promise<string>;
	updateFrontmatter(path: string, updater: (fm: Frontmatter) => void): Promise<void>;
}

export interface ProjectManagerSettings {
	projectsRoot: string;
}

export interface CreateProjectInput {
	name: string;
	category?: string;
	deadline?: string;
}

export interface CreateProjectFromTemplateInput {
	name: string;
	templateName: string;
}

export interface CreateProjectFromTemplateResult {
	indexPath: string;
	projectName: string;
}

export interface CreateTaskInput {
	projectName: string;
	title: string;
	start?: string;
	due?: string;
	priority?: Priority;
	parent?: string;
	recurrence?: Recurrence;
	reminder?: string;
	/** Set when the note materializes a task pulled from TickTick. */
	ticktickId?: string;
	/** Note content below the frontmatter block. */
	body?: string;
}

export type RegenerationResult =
	| { kind: 'created'; path: string }
	| { kind: 'skipped-exists' }
	| { kind: 'skipped-no-due' };

const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

function sanitizeName(raw: string): string {
	const cleaned = raw.replace(ILLEGAL_NAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
	return cleaned.replace(/[. ]+$/, '');
}

/** Characters that are meaningful inside a YAML double-quoted scalar and must be escaped. */
const YAML_QUOTED_ESCAPES: Record<string, string> = {
	'\\': '\\\\',
	'"': '\\"',
	'\n': '\\n',
	'\r': '\\r',
	'\t': '\\t',
};

/**
 * YAML needs quotes around values like wikilinks; bare enum/date tokens stay unquoted.
 *
 * Escaping runs as a single pass over one combined character class so backslashes are always
 * escaped together with (and before) the characters that introduce new backslashes — a
 * two-step `replace(quote)` then `replace(backslash)` (or the reverse, done wrong) can leave a
 * value like `x\"` re-opening the string it's meant to be contained in.
 */
function yamlValue(value: string): string {
	if (/^[A-Za-z0-9][A-Za-z0-9 _\-.:]*$/.test(value) && !/:\s/.test(value)) return value;
	const escaped = value.replace(/[\\"\n\r\t]/g, (char) => YAML_QUOTED_ESCAPES[char] ?? char);
	return `"${escaped}"`;
}

/**
 * A `null` value emits a bare `key:` (YAML null) rather than an empty scalar. It must
 * bypass yamlValue: that would render `""`, and a quoted empty string is not a parseable
 * date, so every guaranteed-but-unset `start`/`due` would make its task invalid.
 */
function frontmatterBlock(fm: Record<string, string | null>): string {
	const lines = Object.entries(fm).map(([key, value]) =>
		value === null ? `${key}:` : `${key}: ${yamlValue(value)}`,
	);
	return `---\n${lines.join('\n')}\n---\n`;
}

function isoDate(now: Date): string {
	return now.toISOString().slice(0, 10);
}

export class ProjectManager {
	constructor(
		private vault: VaultAdapter,
		private settings: ProjectManagerSettings,
		private now: () => Date = () => new Date(),
	) {}

	async createProject(input: CreateProjectInput): Promise<{ indexPath: string }> {
		const name = sanitizeName(input.name);
		if (!name) throw new Error(`Invalid project name: "${input.name}"`);

		const root = this.settings.projectsRoot;
		const projectDir = `${root}/${name}`;
		if (await this.vault.exists(projectDir)) {
			throw new Error(`Project "${name}" already exists`);
		}

		if (!(await this.vault.exists(root))) await this.vault.createFolder(root);
		await this.vault.createFolder(projectDir);
		await this.vault.createFolder(`${projectDir}/Tasks`);

		const fm: Record<string, string> = { type: 'project', status: 'active' };
		const category = input.category?.trim();
		if (category) fm['category'] = category;
		if (input.deadline) fm['deadline'] = input.deadline;

		const indexPath = `${projectDir}/${name}.md`;
		await this.vault.createNote(indexPath, frontmatterBlock(fm));
		return { indexPath };
	}

	async listProjectTemplates(): Promise<ProjectTemplateInfo[]> {
		if (!(await this.vault.exists(PROJECT_TEMPLATES_ROOT))) return [];

		const folderNames = await this.vault.listFolders(PROJECT_TEMPLATES_ROOT);
		const templates: ProjectTemplateInfo[] = [];
		for (const name of folderNames) {
			if (!isTemplateFolderSegment(name)) continue;
			const path = templateFolderPath(name);
			const projectNotePath = templateProjectNotePath(name);
			if (await this.vault.exists(projectNotePath)) {
				templates.push({ name, path, projectNotePath });
			}
		}
		return templates.sort((a, b) => a.name.localeCompare(b.name));
	}

	async createProjectFromTemplate(input: CreateProjectFromTemplateInput): Promise<CreateProjectFromTemplateResult> {
		const projectName = sanitizeName(input.name);
		if (!projectName) throw new Error(`Invalid project name: "${input.name}"`);

		const templateName = input.templateName.trim();
		if (!isTemplateFolderSegment(templateName)) {
			throw new Error(`Invalid project template: "${input.templateName}"`);
		}

		const root = this.settings.projectsRoot;
		const projectDir = `${root}/${projectName}`;
		if (await this.vault.exists(projectDir)) {
			throw new Error(`Project "${projectName}" already exists`);
		}

		const templateDir = templateFolderPath(templateName);
		const templateNote = templateProjectNotePath(templateName);
		if (!(await this.vault.exists(templateDir)) || !(await this.vault.exists(templateNote))) {
			throw new Error(`Project template "${templateName}" is invalid or no longer exists`);
		}

		const markdownFiles = await this.vault.listMarkdownFiles(templateDir);
		if (!markdownFiles.includes(templateNote)) {
			throw new Error(`Project template "${templateName}" is invalid or no longer exists`);
		}

		const indexPath = `${projectDir}/${projectName}.md`;
		const copiedTemplateNote = `${projectDir}/${templateName}.md`;
		if (projectName !== templateName && markdownFiles.includes(`${templateDir}/${projectName}.md`)) {
			throw new Error(
				`Project template "${templateName}" has a project note rename conflict with "${projectName}.md"`,
			);
		}

		for (const path of markdownFiles) {
			const keys = findSyncIdentityKeys(await this.vault.readNote(path));
			if (keys.length > 0) {
				throw new Error(
					`Project template "${templateName}" contains TickTick sync metadata in ${path}: ${keys.join(', ')}`,
				);
			}
		}

		if (!(await this.vault.exists(root))) await this.vault.createFolder(root);
		await this.vault.copyFolder(templateDir, projectDir);
		if (copiedTemplateNote !== indexPath) {
			await this.vault.renamePath(copiedTemplateNote, indexPath);
		}
		return { indexPath, projectName };
	}

	async createTask(input: CreateTaskInput): Promise<{ path: string }> {
		const title = sanitizeName(input.title);
		if (!title) throw new Error(`Invalid task title: "${input.title}"`);

		const projectDir = `${this.settings.projectsRoot}/${input.projectName}`;
		if (!(await this.vault.exists(projectDir))) {
			throw new Error(`Project "${input.projectName}" does not exist`);
		}

		const tasksDir = `${projectDir}/Tasks`;
		if (!(await this.vault.exists(tasksDir))) await this.vault.createFolder(tasksDir);

		const path = this.taskPath(input.projectName, title);
		if (await this.vault.exists(path)) {
			throw new Error(`Task "${title}" already exists in ${input.projectName}`);
		}

		// start/due are always written, null when unset, so both are present to click in
		// Obsidian's Properties panel without the user adding the property first.
		const fm: Record<string, string | null> = {
			type: 'task',
			status: 'todo',
			priority: input.priority ?? 'none',
			start: input.start ?? null,
			due: input.due ?? null,
			created: isoDate(this.now()),
		};
		if (input.parent) fm['parent'] = `[[${input.parent}]]`;
		if (input.recurrence) fm['recurrence'] = input.recurrence;
		if (input.reminder) fm['reminder'] = input.reminder;
		if (input.ticktickId) fm['ticktick-id'] = input.ticktickId;

		await this.vault.createNote(path, frontmatterBlock(fm) + (input.body ?? ''));
		return { path };
	}

	/**
	 * Spawns the next instance of a completed recurring task as a fresh note,
	 * then removes `recurrence` from the completed note so the chain lives in
	 * exactly one place. Create-before-delete: a crash in between leaves a
	 * duplicate key, which the collision branch heals on the next completion.
	 */
	async regenerateRecurringInstance(task: Task, projectName: string): Promise<RegenerationResult> {
		if (!task.due) return { kind: 'skipped-no-due' };
		if (!task.recurrence) return { kind: 'skipped-no-due' };

		const next = nextOccurrence(
			{ due: task.due, start: task.start, recurrence: task.recurrence },
			dayKey(this.now()),
		);
		if (next === null) return { kind: 'skipped-no-due' };
		const newDueKey = dueDateKey(next.due);
		if (newDueKey === null) return { kind: 'skipped-no-due' };

		const removeRecurrence = (): Promise<void> =>
			this.vault.updateFrontmatter(task.path, (fm) => {
				delete fm['recurrence'];
			});

		const title = nextInstanceTitle(task.title, newDueKey);
		if (await this.vault.exists(this.taskPath(projectName, title))) {
			await removeRecurrence();
			return { kind: 'skipped-exists' };
		}

		const body = noteBody(await this.vault.readNote(task.path));
		const { path } = await this.createTask({
			projectName,
			title,
			due: next.due,
			start: next.start,
			priority: task.priority,
			parent: task.parent,
			recurrence: task.recurrence,
			body,
		});
		// Intentionally NOT in a finally: a crash before this line self-heals via the exists-check on the next completion.
		await removeRecurrence();
		return { kind: 'created', path };
	}

	/** Resolves the vault path for a task; sanitizes rawTitle internally (idempotent for already-sanitized callers). */
	private taskPath(projectName: string, rawTitle: string): string {
		return `${this.settings.projectsRoot}/${projectName}/Tasks/${sanitizeName(rawTitle)}.md`;
	}

	async completeTask(path: string): Promise<void> {
		await this.updateTaskStatus(path, 'done');
	}

	async updateTaskStatus(path: string, status: TaskStatus): Promise<void> {
		await this.vault.updateFrontmatter(path, (fm) => {
			fm['status'] = status;
			if (status === 'done') {
				fm['completed-at'] = this.now().toISOString();
			} else {
				delete fm['completed-at'];
			}
		});
	}

	async updateTaskDue(path: string, due: string): Promise<void> {
		await this.vault.updateFrontmatter(path, (fm) => {
			fm['due'] = due;
		});
	}

	async updateTaskDates(path: string, dates: { start?: string; due: string }): Promise<void> {
		await this.vault.updateFrontmatter(path, (fm) => {
			if (dates.start !== undefined) fm['start'] = dates.start;
			else delete fm['start'];
			fm['due'] = dates.due;
		});
	}
}
