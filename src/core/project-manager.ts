import { Frontmatter, Priority, TaskStatus } from './models';

/** Thin boundary over Obsidian vault IO so core stays testable; main.ts provides the real one. */
export interface VaultAdapter {
	exists(path: string): Promise<boolean>;
	createFolder(path: string): Promise<void>;
	createNote(path: string, content: string): Promise<void>;
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
	reminder?: string;
	/** Set when the note materializes a task pulled from TickTick. */
	ticktickId?: string;
}

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

		const path = `${tasksDir}/${title}.md`;
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
		if (input.reminder) fm['reminder'] = input.reminder;
		if (input.ticktickId) fm['ticktick-id'] = input.ticktickId;

		await this.vault.createNote(path, frontmatterBlock(fm));
		return { path };
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
