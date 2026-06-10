import { Frontmatter, Priority, Project, Task, isTaskClosed, titleFromPath } from '../core/models';
import type { InvalidEntry, TaskTreeNode } from '../core/task-index';
import {
	TickTickTaskDraft,
	parseApiDateMs,
	priorityFromTickTick,
	pushFingerprint,
	remoteDueToLocal,
	remoteFingerprint,
	taskToTickTick,
} from './mapping';
import type { SyncSnapshot, TaskSyncRecord } from './sync-state';
import { TickTickApiError, TickTickTask } from './ticktick-client';

/** Subset of TickTickClient the engine needs; structural for testability. */
export interface SyncClient {
	createProject(name: string): Promise<{ id: string; name: string }>;
	createTask(draft: TickTickTaskDraft): Promise<{ id: string } & TickTickTaskDraft>;
	updateTask(draft: TickTickTaskDraft & { id: string }): Promise<unknown>;
	completeTask(projectId: string, taskId: string): Promise<void>;
	deleteTask(projectId: string, taskId: string): Promise<void>;
	getProjectData(projectId: string): Promise<{ tasks: TickTickTask[] }>;
	getTask(projectId: string, taskId: string): Promise<TickTickTask>;
}

export interface NewLocalTask {
	projectName: string;
	title: string;
	due?: string;
	priority?: Priority;
	ticktickId: string;
}

/** Local vault IO the engine needs; main.ts adapts the Obsidian vault. */
export interface LocalStore {
	updateFrontmatter(path: string, updater: (fm: Frontmatter) => void): Promise<void>;
	createTaskNote(input: NewLocalTask): Promise<{ path: string }>;
	trashNote(path: string): Promise<void>;
	getMtime(path: string): number | null;
}

export interface IndexReader {
	getAllProjects(): Project[];
	getTaskTree(projectName: string): TaskTreeNode[];
	getInvalid(): InvalidEntry[];
}

export interface SyncSummary {
	createdProjects: number;
	/** pushed to TickTick */
	created: number;
	updated: number;
	completed: number;
	deletedRemotely: number;
	/** pulled from TickTick */
	pulledCreated: number;
	pulledUpdated: number;
	pulledCompleted: number;
	pulledDeleted: number;
	/** both sides changed; resolved last-writer-wins */
	conflicts: number;
	skipped: number;
	/** malformed task notes excluded from sync */
	invalid: number;
	errors: { path: string; message: string }[];
}

type RemoteState =
	| { kind: 'unchanged' }
	| { kind: 'edited'; task: TickTickTask }
	| { kind: 'completed'; task: TickTickTask }
	| { kind: 'deleted' };

function emptySummary(): SyncSummary {
	return {
		createdProjects: 0,
		created: 0,
		updated: 0,
		completed: 0,
		deletedRemotely: 0,
		pulledCreated: 0,
		pulledUpdated: 0,
		pulledCompleted: 0,
		pulledDeleted: 0,
		conflicts: 0,
		skipped: 0,
		invalid: 0,
		errors: [],
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Two-way sync: per-project diff of local tasks and TickTick against the
 * last-sync snapshot. One-sided changes are mirrored; both-sided changes are
 * resolved last-writer-wins (file mtime vs remote modifiedTime), Obsidian
 * winning ties. Limitations (v1): remote title renames and checklist-item
 * edits are absorbed into the baseline but not applied to local notes.
 */
export class SyncEngine {
	constructor(
		private client: SyncClient,
		private snapshot: SyncSnapshot,
		private persist: () => Promise<void>,
		private store: LocalStore,
		private timeZone: string,
		private now: () => Date = () => new Date(),
	) {}

	async syncAll(index: IndexReader): Promise<SyncSummary> {
		const summary = emptySummary();
		const invalidPaths = new Set(index.getInvalid().map((entry) => entry.path));
		summary.invalid = invalidPaths.size;

		try {
			for (const project of index.getAllProjects()) {
				const projectId = await this.resolveProjectId(project, summary);
				if (!projectId) continue;
				await this.reconcileProject(project, projectId, index, invalidPaths, summary);
			}
		} finally {
			await this.persist();
		}
		return summary;
	}

	private async resolveProjectId(project: Project, summary: SyncSummary): Promise<string | null> {
		const known = project.ticktickProjectId ?? this.snapshot.projects[project.name];
		if (known) {
			this.snapshot.projects[project.name] = known;
			return known;
		}

		try {
			const created = await this.client.createProject(project.name);
			this.snapshot.projects[project.name] = created.id;
			await this.store.updateFrontmatter(project.path, (fm) => {
				fm['ticktick-project-id'] = created.id;
			});
			summary.createdProjects++;
			return created.id;
		} catch (error) {
			summary.errors.push({ path: project.path, message: errorMessage(error) });
			return null;
		}
	}

	private async reconcileProject(
		project: Project,
		projectId: string,
		index: IndexReader,
		invalidPaths: Set<string>,
		summary: SyncSummary,
	): Promise<void> {
		let remoteById: Map<string, TickTickTask>;
		try {
			const data = await this.client.getProjectData(projectId);
			remoteById = new Map(data.tasks.map((task) => [task.id, task]));
		} catch (error) {
			// Without remote state no diff is safe; retry next run (backoff).
			summary.errors.push({ path: project.path, message: errorMessage(error) });
			return;
		}

		// Pair every known record with its remote task first, so whatever is
		// left in remoteById afterwards is genuinely new on the remote side.
		const projectDir = project.path.slice(0, project.path.lastIndexOf('/') + 1);
		const recordPaths = Object.keys(this.snapshot.tasks).filter((path) =>
			path.startsWith(projectDir),
		);
		const pairedRemote = new Map<string, TickTickTask | null>();
		for (const path of recordPaths) {
			const record = this.snapshot.tasks[path];
			if (!record) continue;
			pairedRemote.set(path, remoteById.get(record.ticktickId) ?? null);
			remoteById.delete(record.ticktickId);
		}

		const seenRootPaths = new Set<string>();
		for (const node of index.getTaskTree(project.name)) {
			seenRootPaths.add(node.task.path);
			try {
				const record = this.snapshot.tasks[node.task.path];
				if (!record) {
					await this.pushNew(node, projectId, summary);
				} else {
					await this.reconcileKnown(node, record, pairedRemote.get(node.task.path) ?? null, projectId, summary);
				}
			} catch (error) {
				summary.errors.push({ path: node.task.path, message: errorMessage(error) });
			}
		}

		// Records with no matching root note: locally deleted (or demoted to a
		// child, which syncs as its parent's checklist item from now on).
		for (const path of recordPaths) {
			if (seenRootPaths.has(path)) continue;
			if (invalidPaths.has(path)) continue; // malformed, not deleted — leave both sides alone
			const record = this.snapshot.tasks[path];
			if (!record) continue;
			try {
				await this.reconcileLocallyDeleted(path, pairedRemote.get(path) ?? null, projectId, summary);
			} catch (error) {
				summary.errors.push({ path, message: errorMessage(error) });
			}
		}

		// Remote tasks no record claimed: created on the TickTick side.
		for (const remote of remoteById.values()) {
			try {
				await this.pullCreate(project.name, remote, summary);
			} catch (error) {
				summary.errors.push({ path: `${projectDir}${remote.title}`, message: errorMessage(error) });
			}
		}
	}

	/** Local task that has never been synced: create remotely unless already closed. */
	private async pushNew(node: TaskTreeNode, projectId: string, summary: SyncSummary): Promise<void> {
		if (isTaskClosed(node.task)) {
			summary.skipped++;
			return;
		}
		await this.recreateRemote(node, projectId, summary, pushFingerprint(node.task, node.children));
	}

	private async reconcileKnown(
		node: TaskTreeNode,
		record: TaskSyncRecord,
		remote: TickTickTask | null,
		projectId: string,
		summary: SyncSummary,
	): Promise<void> {
		const { task, children } = node;
		const localFp = pushFingerprint(task, children);
		const localChanged = localFp !== record.fingerprint;

		// Completed on both sides and locally untouched: nothing can have
		// diverged that we would act on — skip the disambiguation GET.
		if (remote === null && record.completedPushed && !localChanged && isTaskClosed(task)) {
			summary.skipped++;
			return;
		}

		const state = await this.classifyRemote(record, remote, projectId);

		if (!localChanged) {
			switch (state.kind) {
				case 'unchanged':
					summary.skipped++;
					return;
				case 'edited':
					await this.pullFields(node, record, state.task);
					summary.pulledUpdated++;
					return;
				case 'completed':
					await this.pullCompletion(node, record, state.task);
					summary.pulledCompleted++;
					return;
				case 'deleted':
					await this.pullDeletion(task.path, summary);
					return;
			}
		}

		if (state.kind === 'unchanged') {
			await this.pushDirty(node, record, remote, projectId, summary, localFp);
			return;
		}

		if (state.kind === 'deleted') {
			if (isTaskClosed(task)) {
				// Done here, gone there — nothing worth resurrecting.
				delete this.snapshot.tasks[task.path];
				return;
			}
			// Obsidian wins (a deletion carries no timestamp): recreate remotely.
			await this.recreateRemote(node, projectId, summary, localFp);
			return;
		}

		// Both sides changed: last writer wins.
		if (state.kind === 'completed' && isTaskClosed(task)) {
			// Completed independently on both sides — they already agree.
			record.fingerprint = localFp;
			record.remoteFingerprint = remoteFingerprint(state.task);
			record.completedPushed = true;
			summary.skipped++;
			return;
		}

		summary.conflicts++;
		if (this.localWins(task.path, state.task)) {
			await this.pushDirty(node, record, remote, projectId, summary, localFp);
		} else if (state.kind === 'completed') {
			await this.pullCompletion(node, record, state.task);
			summary.pulledCompleted++;
		} else {
			await this.pullFields(node, record, state.task);
			summary.pulledUpdated++;
		}
	}

	/** Note edit time vs remote modifiedTime; missing data counts as a tie, Obsidian wins ties. */
	private localWins(path: string, remote: TickTickTask): boolean {
		const localTime = this.store.getMtime(path);
		const remoteTime = remote.modifiedTime ? parseApiDateMs(remote.modifiedTime) : NaN;
		if (localTime === null || Number.isNaN(remoteTime)) return true;
		return localTime >= remoteTime;
	}

	/** Create the remote task: first push of a local task, or remote-deleted × local-edited. */
	private async recreateRemote(
		node: TaskTreeNode,
		projectId: string,
		summary: SyncSummary,
		localFp: string,
	): Promise<void> {
		const { task, children } = node;
		const draft = taskToTickTick(task, children, { projectId, timeZone: this.timeZone });
		const created = await this.client.createTask(draft);
		this.snapshot.tasks[task.path] = {
			ticktickId: created.id,
			fingerprint: localFp,
			remoteFingerprint: remoteFingerprint(created),
		};
		await this.store.updateFrontmatter(task.path, (fm) => {
			fm['ticktick-id'] = created.id;
		});
		summary.created++;
	}

	/** due/priority of a remote task as they should appear in local frontmatter. */
	private remoteFieldsToLocal(remote: TickTickTask): { due: string | undefined; priority: Priority } {
		return {
			due: remote.dueDate
				? remoteDueToLocal(remote.dueDate, remote.isAllDay ?? false, this.timeZone)
				: undefined,
			priority: priorityFromTickTick(remote.priority),
		};
	}

	/** Remote edit, local untouched (or remote won): apply remote fields to the note. */
	private async pullFields(node: TaskTreeNode, record: TaskSyncRecord, remote: TickTickTask): Promise<void> {
		const { task, children } = node;
		const { due, priority } = this.remoteFieldsToLocal(remote);
		const reopen = isTaskClosed(task); // remote is open whenever we land here

		await this.store.updateFrontmatter(task.path, (fm) => {
			if (due !== undefined) fm['due'] = due;
			else delete fm['due'];
			fm['priority'] = priority;
			if (reopen) {
				fm['status'] = 'todo';
				delete fm['completed-at'];
			}
		});

		// Remote title renames and checklist edits are absorbed into the
		// baseline but not written to the vault (note filename = task title).
		const pulled: Task = { ...task, due, priority, status: reopen ? 'todo' : task.status };
		record.fingerprint = pushFingerprint(pulled, children);
		record.remoteFingerprint = remoteFingerprint(remote);
		if (reopen) record.completedPushed = false;
	}

	/** Completed on the phone: close the local note. */
	private async pullCompletion(node: TaskTreeNode, record: TaskSyncRecord, remote: TickTickTask): Promise<void> {
		const { task, children } = node;
		await this.store.updateFrontmatter(task.path, (fm) => {
			fm['status'] = 'done';
			fm['completed-at'] = this.now().toISOString();
		});
		record.fingerprint = pushFingerprint({ ...task, status: 'done' }, children);
		record.remoteFingerprint = remoteFingerprint(remote);
		record.completedPushed = true;
	}

	/** Deleted on the phone, local untouched: the note goes to the trash. */
	private async pullDeletion(path: string, summary: SyncSummary): Promise<void> {
		await this.store.trashNote(path);
		delete this.snapshot.tasks[path];
		summary.pulledDeleted++;
	}

	/** Task created remotely: materialize it as a local note. */
	private async pullCreate(projectName: string, remote: TickTickTask, summary: SyncSummary): Promise<void> {
		const { due, priority } = this.remoteFieldsToLocal(remote);
		const { path } = await this.store.createTaskNote({
			projectName,
			title: remote.title,
			due,
			priority,
			ticktickId: remote.id,
		});
		// Fingerprint what the index will parse (title comes from the file name,
		// which may be a sanitized variant of the remote title).
		const local: Task = { path, title: titleFromPath(path), status: 'todo', priority, due };
		this.snapshot.tasks[path] = {
			ticktickId: remote.id,
			fingerprint: pushFingerprint(local, []),
			remoteFingerprint: remoteFingerprint(remote),
		};
		summary.pulledCreated++;
	}

	/** What happened on the TickTick side since the last sync? */
	private async classifyRemote(
		record: TaskSyncRecord,
		remote: TickTickTask | null,
		projectId: string,
	): Promise<RemoteState> {
		if (remote !== null) {
			// Present in project data ⇒ open remotely.
			const rfp = remoteFingerprint(remote);
			if (record.remoteFingerprint === undefined) {
				// Phase-2 record: adopt the current remote as the baseline —
				// unless we completed this task and it is open again, which
				// can only mean someone reopened it remotely.
				if (record.completedPushed) return { kind: 'edited', task: remote };
				record.remoteFingerprint = rfp;
				return { kind: 'unchanged' };
			}
			return rfp === record.remoteFingerprint ? { kind: 'unchanged' } : { kind: 'edited', task: remote };
		}

		// Absent from project data ⇒ completed or deleted remotely; the
		// project endpoint hides completed tasks, so ask for the task itself.
		let fetched: TickTickTask;
		try {
			fetched = await this.client.getTask(projectId, record.ticktickId);
		} catch (error) {
			if (error instanceof TickTickApiError && error.status === 404) return { kind: 'deleted' };
			throw error;
		}
		if ((fetched.status ?? 0) === 2) {
			const rfp = remoteFingerprint(fetched);
			// A completion we pushed (or already pulled) is not a new remote event.
			return rfp === record.remoteFingerprint
				? { kind: 'unchanged' }
				: { kind: 'completed', task: fetched };
		}
		// Open yet missing from project data (e.g. moved): treat as an edit.
		return { kind: 'edited', task: fetched };
	}

	/** Push a locally-changed task whose remote side did not move. */
	private async pushDirty(
		node: TaskTreeNode,
		record: TaskSyncRecord,
		remote: TickTickTask | null,
		projectId: string,
		summary: SyncSummary,
		localFp: string,
	): Promise<void> {
		const { task, children } = node;

		if (isTaskClosed(task) && !record.completedPushed) {
			await this.client.completeTask(projectId, record.ticktickId);
			record.completedPushed = true;
			record.fingerprint = localFp;
			// Remote keeps its fields, now closed.
			const base = remote ?? taskToTickTick(task, children, { projectId, timeZone: this.timeZone });
			record.remoteFingerprint = remoteFingerprint({ ...base, status: 2 });
			summary.completed++;
			return;
		}

		// The draft carries status 0|2, so this also reopens a task that was
		// completed remotely but reopened in Obsidian (Phase-2 limitation fixed).
		const draft = taskToTickTick(task, children, { projectId, timeZone: this.timeZone });
		await this.client.updateTask({ ...draft, id: record.ticktickId });
		record.fingerprint = localFp;
		record.remoteFingerprint = remoteFingerprint(draft);
		if (!isTaskClosed(task)) record.completedPushed = false;
		summary.updated++;
	}

	/** Local note gone: the remote task (if still open) goes too. Obsidian wins. */
	private async reconcileLocallyDeleted(
		path: string,
		remote: TickTickTask | null,
		projectId: string,
		summary: SyncSummary,
	): Promise<void> {
		const record = this.snapshot.tasks[path];
		if (!record) return;
		if (remote !== null) {
			await this.client.deleteTask(projectId, record.ticktickId);
			summary.deletedRemotely++;
		}
		// Absent remote = completed or already deleted there; nothing to remove.
		delete this.snapshot.tasks[path];
	}
}
