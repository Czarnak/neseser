import type { Frontmatter, Project, Task } from '../core/models';
import type { TaskTreeNode } from '../core/task-index';
import { TickTickTaskDraft, pushFingerprint, taskToTickTick } from './mapping';
import type { SyncSnapshot } from './sync-state';

/** Subset of TickTickClient the push path needs; structural for testability. */
export interface PushClient {
	createProject(name: string): Promise<{ id: string; name: string }>;
	createTask(draft: TickTickTaskDraft): Promise<{ id: string } & TickTickTaskDraft>;
	updateTask(draft: TickTickTaskDraft & { id: string }): Promise<unknown>;
	completeTask(projectId: string, taskId: string): Promise<void>;
}

export interface FrontmatterWriter {
	updateFrontmatter(path: string, updater: (fm: Frontmatter) => void): Promise<void>;
}

export interface IndexReader {
	getAllProjects(): Project[];
	getTaskTree(projectName: string): TaskTreeNode[];
}

export interface PushSummary {
	createdProjects: number;
	created: number;
	updated: number;
	completed: number;
	skipped: number;
	errors: { path: string; message: string }[];
}

function isClosed(task: Task): boolean {
	return task.status === 'done' || task.status === 'cancelled';
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * One-way push: Obsidian → TickTick. Pull/reconciliation arrives in Phase 3.
 * Known v1 limitation: a task reopened locally after its completion was pushed
 * gets a field update but is not reopened in TickTick (official API has no
 * documented un-complete; revisited in Phase 3 with the pull path).
 */
export class SyncEngine {
	constructor(
		private client: PushClient,
		private snapshot: SyncSnapshot,
		private persist: () => Promise<void>,
		private writer: FrontmatterWriter,
		private timeZone: string,
	) {}

	async pushAll(index: IndexReader): Promise<PushSummary> {
		const summary: PushSummary = {
			createdProjects: 0,
			created: 0,
			updated: 0,
			completed: 0,
			skipped: 0,
			errors: [],
		};

		try {
			for (const project of index.getAllProjects()) {
				const projectId = await this.resolveProjectId(project, summary);
				if (!projectId) continue;
				for (const node of index.getTaskTree(project.name)) {
					await this.pushTask(node, projectId, summary);
				}
			}
		} finally {
			await this.persist();
		}
		return summary;
	}

	private async resolveProjectId(project: Project, summary: PushSummary): Promise<string | null> {
		const known = project.ticktickProjectId ?? this.snapshot.projects[project.name];
		if (known) {
			this.snapshot.projects[project.name] = known;
			return known;
		}

		try {
			const created = await this.client.createProject(project.name);
			this.snapshot.projects[project.name] = created.id;
			await this.writer.updateFrontmatter(project.path, (fm) => {
				fm['ticktick-project-id'] = created.id;
			});
			summary.createdProjects++;
			return created.id;
		} catch (error) {
			summary.errors.push({ path: project.path, message: errorMessage(error) });
			return null;
		}
	}

	private async pushTask(node: TaskTreeNode, projectId: string, summary: PushSummary): Promise<void> {
		const { task, children } = node;
		const record = this.snapshot.tasks[task.path];
		const fingerprint = pushFingerprint(task, children);

		try {
			if (!record) {
				if (isClosed(task)) {
					summary.skipped++;
					return;
				}
				const draft = taskToTickTick(task, children, { projectId, timeZone: this.timeZone });
				const created = await this.client.createTask(draft);
				this.snapshot.tasks[task.path] = { ticktickId: created.id, fingerprint };
				await this.writer.updateFrontmatter(task.path, (fm) => {
					fm['ticktick-id'] = created.id;
				});
				summary.created++;
				return;
			}

			if (record.fingerprint === fingerprint) {
				summary.skipped++;
				return;
			}

			if (isClosed(task) && !record.completedPushed) {
				await this.client.completeTask(projectId, record.ticktickId);
				record.completedPushed = true;
				record.fingerprint = fingerprint;
				summary.completed++;
				return;
			}

			const draft = taskToTickTick(task, children, { projectId, timeZone: this.timeZone });
			await this.client.updateTask({ ...draft, id: record.ticktickId });
			record.fingerprint = fingerprint;
			if (!isClosed(task)) record.completedPushed = false;
			summary.updated++;
		} catch (error) {
			summary.errors.push({ path: task.path, message: errorMessage(error) });
		}
	}
}
