import { Frontmatter, Priority, Recurrence, Task, TaskStatus } from './models';
import { dayKey } from './calendar-data';
import { nextInstanceTitle, nextOccurrence, noteBody } from './recurrence';
import { dueDateKey } from './view-data';

/** Thin boundary over Obsidian vault IO so core stays testable; main.ts provides the real one. */
export interface VaultAdapter {
	exists(path: string): Promise<boolean>;
	createFolder(path: string): Promise<void>;
	createNote(path: string, content: string): Promise<void>;
	readNote(path: string): Promise<string>;
	updateFrontmatter(path: string, updater: (fm: Frontmatter) => void): Promise<void>;
}

export interface ProjectManagerSettings {
	projectsRoot: string;
}

export interface CreateProjectInput {
	name: string;
	deadline?: string;
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

/** YAML needs quotes around values like wikilinks; bare enum/date tokens stay unquoted. */
function yamlValue(value: string): string {
	if (/^[A-Za-z0-9][A-Za-z0-9 _\-.:]*$/.test(value) && !/:\s/.test(value)) return value;
	return `"${value.replace(/"/g, '\\"')}"`;
}

function frontmatterBlock(fm: Record<string, string>): string {
	const lines = Object.entries(fm).map(([key, value]) => `${key}: ${yamlValue(value)}`);
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
		if (input.deadline) fm['deadline'] = input.deadline;

		const indexPath = `${projectDir}/${name}.md`;
		await this.vault.createNote(indexPath, frontmatterBlock(fm));
		return { indexPath };
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

		const fm: Record<string, string> = {
			type: 'task',
			status: 'todo',
			priority: input.priority ?? 'none',
			created: isoDate(this.now()),
		};
		if (input.start) fm['start'] = input.start;
		if (input.due) fm['due'] = input.due;
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

		const next = nextOccurrence(task, dayKey(this.now()));
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
		await removeRecurrence();
		return { kind: 'created', path };
	}

	private taskPath(projectName: string, title: string): string {
		return `${this.settings.projectsRoot}/${projectName}/Tasks/${sanitizeName(title)}.md`;
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
