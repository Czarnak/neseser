import { Frontmatter, Project, Task, parseProject, parseTask } from './models';

export interface InvalidEntry {
	path: string;
	reason: string;
}

export interface TaskTreeNode {
	task: Task;
	children: TaskTreeNode[];
}

type Listener = () => void;

/**
 * In-memory index of all projects and tasks under the projects root.
 * Fed file events by the plugin (metadataCache/vault wiring lives in main.ts);
 * views read snapshots and subscribe for changes. Single source of truth.
 */
export class TaskIndex {
	private tasks = new Map<string, Task>();
	private projects = new Map<string, Project>();
	private invalid = new Map<string, InvalidEntry>();
	private listeners = new Set<Listener>();

	constructor(private projectsRoot: string) {}

	onFileChanged(path: string, fm: Frontmatter | undefined): void {
		if (!this.isUnderRoot(path)) return;

		const hadEntry = this.removeEntries(path);
		const added = this.addEntries(path, fm);
		if (hadEntry || added) this.notify();
	}

	onFileDeleted(path: string): void {
		if (!this.isUnderRoot(path)) return;
		if (this.removeEntries(path)) this.notify();
	}

	onFileRenamed(oldPath: string, newPath: string, fm: Frontmatter | undefined): void {
		const removed = this.isUnderRoot(oldPath) && this.removeEntries(oldPath);
		const added = this.isUnderRoot(newPath) && this.addEntries(newPath, fm);
		if (removed || added) this.notify();
	}

	getAllTasks(): Task[] {
		return [...this.tasks.values()];
	}

	getAllProjects(): Project[] {
		return [...this.projects.values()];
	}

	getInvalid(): InvalidEntry[] {
		return [...this.invalid.values()];
	}

	getTaskByPath(path: string): Task | undefined {
		return this.tasks.get(path);
	}

	getTasksForProject(projectName: string): Task[] {
		return this.getAllTasks().filter((t) => this.projectNameForPath(t.path) === projectName);
	}

	/** Project = first folder segment under the projects root, null outside it. */
	projectNameForPath(path: string): string | null {
		if (!this.isUnderRoot(path)) return null;
		const rest = path.slice(this.projectsRoot.length + 1);
		const segments = rest.split('/');
		return segments.length > 1 ? (segments[0] ?? null) : null;
	}

	/** Tasks nested by parent link; tasks with missing parents become roots. */
	getTaskTree(projectName?: string): TaskTreeNode[] {
		const tasks = projectName ? this.getTasksForProject(projectName) : this.getAllTasks();
		const nodes = new Map<string, TaskTreeNode>();
		for (const task of tasks) {
			nodes.set(this.treeKey(task.path, task.title), { task, children: [] });
		}

		const roots: TaskTreeNode[] = [];
		for (const node of nodes.values()) {
			const parentKey = node.task.parent
				? this.treeKey(node.task.path, node.task.parent)
				: null;
			const parentNode = parentKey ? nodes.get(parentKey) : undefined;
			if (parentNode && parentNode !== node) {
				parentNode.children.push(node);
			} else {
				roots.push(node);
			}
		}
		return roots;
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Parent links are sibling note titles, so scope keys to the task's project. */
	private treeKey(path: string, title: string): string {
		return `${this.projectNameForPath(path) ?? ''}::${title}`;
	}

	private isUnderRoot(path: string): boolean {
		return path.startsWith(`${this.projectsRoot}/`);
	}

	private removeEntries(path: string): boolean {
		const had = this.tasks.has(path) || this.projects.has(path) || this.invalid.has(path);
		this.tasks.delete(path);
		this.projects.delete(path);
		this.invalid.delete(path);
		return had;
	}

	private addEntries(path: string, fm: Frontmatter | undefined): boolean {
		const taskResult = parseTask(path, fm);
		if (taskResult.kind === 'task') {
			this.tasks.set(path, taskResult.task);
			return true;
		}
		if (taskResult.kind === 'invalid') {
			this.invalid.set(path, { path, reason: taskResult.reason });
			return true;
		}

		const projectResult = parseProject(path, fm);
		if (projectResult.kind === 'project') {
			this.projects.set(path, projectResult.project);
			return true;
		}
		if (projectResult.kind === 'invalid') {
			this.invalid.set(path, { path, reason: projectResult.reason });
			return true;
		}
		return false;
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}
