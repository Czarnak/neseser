import { beforeEach, describe, expect, test } from 'vitest';
import type { Frontmatter, Project, Task } from '../../src/core/models';
import type { InvalidEntry, TaskTreeNode } from '../../src/core/task-index';
import type { TickTickTaskDraft } from '../../src/sync/mapping';
import { NewLocalTask, SyncEngine } from '../../src/sync/sync-engine';
import { SyncSnapshot, emptySnapshot } from '../../src/sync/sync-state';
import { TickTickApiError, TickTickTask } from '../../src/sync/ticktick-client';

/** In-memory TickTick: tracks per-project tasks including completed ones. */
class FakeClient {
	calls: { method: string; args: unknown[] }[] = [];
	failOn: string | null = null;
	private remote = new Map<string, Map<string, TickTickTask>>();
	private nextId = 1;

	async createProject(name: string): Promise<{ id: string; name: string }> {
		this.record('createProject', name);
		const id = `ttp-${this.nextId++}`;
		this.remote.set(id, new Map());
		return { id, name };
	}

	async createTask(draft: TickTickTaskDraft): Promise<{ id: string } & TickTickTaskDraft> {
		this.record('createTask', draft);
		const task: TickTickTask = { ...draft, id: `tt-${this.nextId++}` };
		this.project(draft.projectId).set(task.id, task);
		return task;
	}

	async updateTask(draft: TickTickTaskDraft & { id: string }): Promise<{ id: string }> {
		this.record('updateTask', draft);
		const existing = this.project(draft.projectId).get(draft.id);
		this.project(draft.projectId).set(draft.id, { ...existing, ...draft });
		return { id: draft.id };
	}

	async completeTask(projectId: string, taskId: string): Promise<void> {
		this.record('completeTask', projectId, taskId);
		const existing = this.project(projectId).get(taskId);
		if (existing) this.project(projectId).set(taskId, { ...existing, status: 2 });
	}

	async deleteTask(projectId: string, taskId: string): Promise<void> {
		this.record('deleteTask', projectId, taskId);
		this.project(projectId).delete(taskId);
	}

	async getProjectData(
		projectId: string,
	): Promise<{ project: { id: string; name: string }; tasks: TickTickTask[] }> {
		this.record('getProjectData', projectId);
		// The official endpoint returns only uncompleted tasks.
		const tasks = [...this.project(projectId).values()].filter((t) => (t.status ?? 0) !== 2);
		return { project: { id: projectId, name: projectId }, tasks };
	}

	async getTask(projectId: string, taskId: string): Promise<TickTickTask> {
		this.record('getTask', projectId, taskId);
		const task = this.project(projectId).get(taskId);
		if (!task) throw new TickTickApiError(404, 'task not found');
		return task;
	}

	/** Test seam: mutate remote state as if the phone app did it. */
	editRemote(projectId: string, taskId: string, patch: Partial<TickTickTask>): void {
		const existing = this.project(projectId).get(taskId);
		if (!existing) throw new Error(`no remote task ${taskId}`);
		this.project(projectId).set(taskId, { ...existing, ...patch });
	}

	seedRemote(projectId: string, fields: Partial<TickTickTask> & { title: string }): TickTickTask {
		const task: TickTickTask = {
			id: `tt-${this.nextId++}`,
			projectId,
			priority: 0,
			status: 0,
			...fields,
		};
		this.project(projectId).set(task.id, task);
		return task;
	}

	remoteTask(projectId: string, taskId: string): TickTickTask | undefined {
		return this.project(projectId).get(taskId);
	}

	callsOf(method: string): { method: string; args: unknown[] }[] {
		return this.calls.filter((c) => c.method === method);
	}

	private project(projectId: string): Map<string, TickTickTask> {
		let map = this.remote.get(projectId);
		if (!map) {
			map = new Map();
			this.remote.set(projectId, map);
		}
		return map;
	}

	private record(method: string, ...args: unknown[]): void {
		if (this.failOn === method) throw new Error(`fake ${method} failure`);
		this.calls.push({ method, args });
	}
}

class FakeStore {
	written = new Map<string, Frontmatter>();
	trashed: string[] = [];
	createdNotes: NewLocalTask[] = [];
	mtimes = new Map<string, number>();

	async updateFrontmatter(path: string, updater: (fm: Frontmatter) => void): Promise<void> {
		const fm = this.written.get(path) ?? {};
		updater(fm);
		this.written.set(path, fm);
	}

	async createTaskNote(input: NewLocalTask): Promise<{ path: string }> {
		this.createdNotes.push(input);
		return { path: `Projects/${input.projectName}/Tasks/${input.title}.md` };
	}

	async trashNote(path: string): Promise<void> {
		this.trashed.push(path);
	}

	getMtime(path: string): number | null {
		return this.mtimes.get(path) ?? null;
	}
}

class FakeIndex {
	projects: Project[] = [];
	trees = new Map<string, TaskTreeNode[]>();
	invalid: InvalidEntry[] = [];

	getAllProjects(): Project[] {
		return this.projects;
	}

	getTaskTree(projectName: string): TaskTreeNode[] {
		return this.trees.get(projectName) ?? [];
	}

	getInvalid(): InvalidEntry[] {
		return this.invalid;
	}
}

function makeProject(name: string, overrides: Partial<Project> = {}): Project {
	return { path: `Projects/${name}/${name}.md`, name, status: 'active', ...overrides };
}

function makeTask(title: string, overrides: Partial<Task> = {}): Task {
	return {
		path: `Projects/Alpha/Tasks/${title}.md`,
		title,
		status: 'todo',
		priority: 'none',
		...overrides,
	};
}

function leaf(task: Task): TaskTreeNode {
	return { task, children: [] };
}

const FIXED_NOW = new Date('2026-06-11T12:00:00.000Z');

describe('SyncEngine.syncAll', () => {
	let client: FakeClient;
	let store: FakeStore;
	let index: FakeIndex;
	let snapshot: SyncSnapshot;
	let persisted: number;
	let engine: SyncEngine;

	beforeEach(() => {
		client = new FakeClient();
		store = new FakeStore();
		index = new FakeIndex();
		snapshot = emptySnapshot();
		persisted = 0;
		engine = new SyncEngine(
			client,
			snapshot,
			async () => {
				persisted++;
			},
			store,
			'Europe/Warsaw',
			() => FIXED_NOW,
		);
	});

	describe('push side (Phase 2 parity)', () => {
		test('creates a TickTick project and writes the id back to project frontmatter', async () => {
			index.projects = [makeProject('Alpha')];

			const summary = await engine.syncAll(index);

			expect(summary.createdProjects).toBe(1);
			expect(snapshot.projects['Alpha']).toBe('ttp-1');
			expect(store.written.get('Projects/Alpha/Alpha.md')).toMatchObject({
				'ticktick-project-id': 'ttp-1',
			});
		});

		test('reuses project id from frontmatter without creating', async () => {
			index.projects = [makeProject('Alpha', { ticktickProjectId: 'ttp-77' })];

			await engine.syncAll(index);

			expect(client.callsOf('createProject')).toHaveLength(0);
			expect(snapshot.projects['Alpha']).toBe('ttp-77');
		});

		test('creates a new open task and writes back its ticktick-id', async () => {
			index.projects = [makeProject('Alpha')];
			index.trees.set('Alpha', [leaf(makeTask('Build parser', { due: '2026-06-15', priority: 'high' }))]);

			const summary = await engine.syncAll(index);

			expect(summary.created).toBe(1);
			const draft = client.callsOf('createTask')[0]?.args[0] as TickTickTaskDraft;
			expect(draft).toMatchObject({ projectId: 'ttp-1', title: 'Build parser', priority: 5 });
			expect(store.written.get('Projects/Alpha/Tasks/Build parser.md')).toMatchObject({
				'ticktick-id': 'tt-2',
			});
			expect(snapshot.tasks['Projects/Alpha/Tasks/Build parser.md']?.ticktickId).toBe('tt-2');
		});

		test('does not create tasks that were already closed before ever syncing', async () => {
			index.projects = [makeProject('Alpha')];
			index.trees.set('Alpha', [leaf(makeTask('Old', { status: 'done' }))]);

			const summary = await engine.syncAll(index);

			expect(client.callsOf('createTask')).toHaveLength(0);
			expect(summary.skipped).toBe(1);
		});

		test('skips unchanged tasks on a second sync', async () => {
			index.projects = [makeProject('Alpha')];
			index.trees.set('Alpha', [leaf(makeTask('T'))]);
			await engine.syncAll(index);
			client.calls = [];

			const summary = await engine.syncAll(index);

			expect(client.callsOf('createTask')).toHaveLength(0);
			expect(client.callsOf('updateTask')).toHaveLength(0);
			expect(summary.skipped).toBe(1);
		});

		test('updates a previously-pushed task whose fields changed locally', async () => {
			index.projects = [makeProject('Alpha')];
			index.trees.set('Alpha', [leaf(makeTask('T'))]);
			await engine.syncAll(index);
			index.trees.set('Alpha', [leaf(makeTask('T', { priority: 'high' }))]);

			const summary = await engine.syncAll(index);

			expect(summary.updated).toBe(1);
			const draft = client.callsOf('updateTask')[0]?.args[0] as { id: string; priority: number };
			expect(draft.id).toBe('tt-2');
			expect(draft.priority).toBe(5);
		});

		test('does not misread the server\'s canonical ".000+0000" date echo as a remote edit after a push', async () => {
			index.projects = [makeProject('Alpha')];
			index.trees.set('Alpha', [leaf(makeTask('T', { due: '2026-06-15' }))]);
			await engine.syncAll(index);
			index.trees.set('Alpha', [leaf(makeTask('T', { due: '2026-06-17' }))]);
			await engine.syncAll(index);
			// The live API stores timestamps with milliseconds; simulate its canonical echo.
			const id = snapshot.tasks['Projects/Alpha/Tasks/T.md']!.ticktickId;
			const remote = client.remoteTask('ttp-1', id)!;
			client.editRemote('ttp-1', id, { dueDate: remote.dueDate!.replace('+0000', '.000+0000') });
			client.calls = [];

			const summary = await engine.syncAll(index);

			expect(summary.pulledUpdated).toBe(0);
			expect(summary.skipped).toBe(1);
			expect(client.callsOf('updateTask')).toHaveLength(0);
		});

		test('completes a synced task once when it is done locally', async () => {
			index.projects = [makeProject('Alpha')];
			index.trees.set('Alpha', [leaf(makeTask('T'))]);
			await engine.syncAll(index);
			index.trees.set('Alpha', [leaf(makeTask('T', { status: 'done' }))]);

			const summary = await engine.syncAll(index);
			const secondSummary = await engine.syncAll(index);

			expect(summary.completed).toBe(1);
			expect(client.callsOf('completeTask')).toHaveLength(1);
			expect(client.callsOf('completeTask')[0]?.args).toEqual(['ttp-1', 'tt-2']);
			expect(secondSummary.completed).toBe(0);
		});

		test('a completed-both-sides task causes no disambiguation GET on later runs', async () => {
			index.projects = [makeProject('Alpha')];
			index.trees.set('Alpha', [leaf(makeTask('T'))]);
			await engine.syncAll(index);
			index.trees.set('Alpha', [leaf(makeTask('T', { status: 'done' }))]);
			await engine.syncAll(index);
			client.calls = [];

			await engine.syncAll(index);

			expect(client.callsOf('getTask')).toHaveLength(0);
		});

		test('a child change triggers a parent update', async () => {
			const parent = makeTask('Parent');
			const child = makeTask('Child', { path: 'Projects/Alpha/Tasks/Child.md' });
			index.projects = [makeProject('Alpha')];
			index.trees.set('Alpha', [{ task: parent, children: [leaf(child)] }]);
			await engine.syncAll(index);
			index.trees.set('Alpha', [{ task: parent, children: [leaf({ ...child, status: 'done' })] }]);

			const summary = await engine.syncAll(index);

			expect(summary.updated).toBe(1);
			const draft = client.callsOf('updateTask')[0]?.args[0] as TickTickTaskDraft;
			expect(draft.items).toEqual([{ title: 'Child', status: 1 }]);
		});

		test('one failing task does not abort the rest, error is reported, state persists', async () => {
			index.projects = [makeProject('Alpha')];
			index.trees.set('Alpha', [leaf(makeTask('Fails')), leaf(makeTask('Works'))]);
			client.failOn = 'createTask';
			const first = await engine.syncAll(index);
			client.failOn = null;

			expect(first.errors).toHaveLength(2);
			expect(persisted).toBeGreaterThan(0);

			const second = await engine.syncAll(index);
			expect(second.created).toBe(2);
			expect(second.errors).toHaveLength(0);
		});

		test('project creation failure skips its tasks but continues with other projects', async () => {
			index.projects = [makeProject('Alpha'), makeProject('Beta', { ticktickProjectId: 'ttp-9' })];
			index.trees.set('Alpha', [leaf(makeTask('A'))]);
			index.trees.set('Beta', [leaf(makeTask('B', { path: 'Projects/Beta/Tasks/B.md' }))]);
			client.failOn = 'createProject';

			const summary = await engine.syncAll(index);

			expect(summary.errors).toHaveLength(1);
			expect(summary.created).toBe(1);
			expect(snapshot.tasks['Projects/Beta/Tasks/B.md']).toBeDefined();
		});

		test('locally reopened task is pushed as an update with status 0 (Phase-2 limitation fixed)', async () => {
			index.projects = [makeProject('Alpha')];
			index.trees.set('Alpha', [leaf(makeTask('T'))]);
			await engine.syncAll(index);
			index.trees.set('Alpha', [leaf(makeTask('T', { status: 'done' }))]);
			await engine.syncAll(index);
			index.trees.set('Alpha', [leaf(makeTask('T', { status: 'todo' }))]);
			client.calls = [];

			const summary = await engine.syncAll(index);

			expect(summary.updated).toBe(1);
			const draft = client.callsOf('updateTask')[0]?.args[0] as TickTickTaskDraft;
			expect(draft.status).toBe(0);
			expect(snapshot.tasks['Projects/Alpha/Tasks/T.md']?.completedPushed).toBe(false);
		});

		test('an unreachable project (getProjectData fails) is skipped whole with an error', async () => {
			index.projects = [makeProject('Alpha', { ticktickProjectId: 'ttp-1' })];
			index.trees.set('Alpha', [leaf(makeTask('T', { priority: 'high' }))]);
			client.failOn = 'getProjectData';

			const summary = await engine.syncAll(index);

			expect(summary.errors).toHaveLength(1);
			expect(client.callsOf('createTask')).toHaveLength(0);
			expect(summary.created).toBe(0);
		});
	});

	const TASK_PATH = 'Projects/Alpha/Tasks/T.md';

	/** Sync one open task 'T' so both sides share a baseline. */
	async function seedSynced(): Promise<{ projectId: string; taskId: string }> {
		index.projects = [makeProject('Alpha')];
		index.trees.set('Alpha', [leaf(makeTask('T'))]);
		await engine.syncAll(index);
		client.calls = [];
		const projectId = snapshot.projects['Alpha'];
		const taskId = snapshot.tasks[TASK_PATH]?.ticktickId;
		if (!projectId || !taskId) throw new Error('seed failed');
		return { projectId, taskId };
	}

	describe('pull side', () => {
		test('remote field edits are pulled into the local note', async () => {
			const { projectId, taskId } = await seedSynced();
			client.editRemote(projectId, taskId, {
				priority: 5,
				dueDate: '2026-06-15T07:30:00+0000',
				isAllDay: false,
				modifiedTime: '2026-06-11T09:00:00+0000',
			});

			const summary = await engine.syncAll(index);

			expect(summary.pulledUpdated).toBe(1);
			expect(client.callsOf('updateTask')).toHaveLength(0);
			expect(store.written.get(TASK_PATH)).toMatchObject({
				priority: 'high',
				due: '2026-06-15T09:30',
			});
		});

		test('a pulled edit updates the baseline so the next run is quiet', async () => {
			const { projectId, taskId } = await seedSynced();
			client.editRemote(projectId, taskId, { priority: 5 });
			await engine.syncAll(index);
			// The vault note now matches what was pulled.
			index.trees.set('Alpha', [leaf(makeTask('T', { priority: 'high' }))]);
			client.calls = [];

			const summary = await engine.syncAll(index);

			expect(summary.pulledUpdated).toBe(0);
			expect(summary.updated).toBe(0);
			expect(summary.skipped).toBe(1);
		});

		test('remote completion closes the local note', async () => {
			const { projectId, taskId } = await seedSynced();
			client.editRemote(projectId, taskId, {
				status: 2,
				modifiedTime: '2026-06-11T09:00:00+0000',
			});

			const summary = await engine.syncAll(index);

			expect(summary.pulledCompleted).toBe(1);
			expect(client.callsOf('completeTask')).toHaveLength(0);
			expect(store.written.get(TASK_PATH)).toMatchObject({
				status: 'done',
				'completed-at': FIXED_NOW.toISOString(),
			});
			expect(snapshot.tasks[TASK_PATH]?.completedPushed).toBe(true);
		});

		test('remote deletion trashes the local note and drops the record', async () => {
			const { projectId, taskId } = await seedSynced();
			await client.deleteTask(projectId, taskId);
			client.calls = [];

			const summary = await engine.syncAll(index);

			expect(summary.pulledDeleted).toBe(1);
			expect(store.trashed).toEqual([TASK_PATH]);
			expect(snapshot.tasks[TASK_PATH]).toBeUndefined();
		});

		test('remote reopen of a completed task reopens the local note', async () => {
			const { projectId, taskId } = await seedSynced();
			index.trees.set('Alpha', [leaf(makeTask('T', { status: 'done' }))]);
			await engine.syncAll(index); // completion pushed
			client.editRemote(projectId, taskId, { status: 0 }); // reopened on the phone
			client.calls = [];

			const summary = await engine.syncAll(index);

			expect(summary.pulledUpdated).toBe(1);
			const fm = store.written.get(TASK_PATH) ?? {};
			expect(fm['status']).toBe('todo');
			expect(fm['completed-at']).toBeUndefined();
			expect(snapshot.tasks[TASK_PATH]?.completedPushed).toBe(false);
		});

		test('a new remote task is materialized as a local note', async () => {
			index.projects = [makeProject('Alpha', { ticktickProjectId: 'ttp-9' })];
			const remote = client.seedRemote('ttp-9', {
				title: 'From phone',
				priority: 3,
				dueDate: '2026-06-14T22:00:00+0000',
				isAllDay: true,
			});

			const summary = await engine.syncAll(index);

			expect(summary.pulledCreated).toBe(1);
			expect(store.createdNotes).toEqual([
				{
					projectName: 'Alpha',
					title: 'From phone',
					priority: 'medium',
					due: '2026-06-15',
					ticktickId: remote.id,
				},
			]);
			expect(snapshot.tasks['Projects/Alpha/Tasks/From phone.md']?.ticktickId).toBe(remote.id);
		});

		test('a materialized remote task is not re-created or re-pulled next run', async () => {
			index.projects = [makeProject('Alpha', { ticktickProjectId: 'ttp-9' })];
			client.seedRemote('ttp-9', { title: 'From phone' });
			await engine.syncAll(index);
			// The vault note now exists and is indexed.
			index.trees.set('Alpha', [
				leaf(makeTask('From phone', { path: 'Projects/Alpha/Tasks/From phone.md' })),
			]);
			client.calls = [];

			const summary = await engine.syncAll(index);

			expect(summary.pulledCreated).toBe(0);
			expect(store.createdNotes).toHaveLength(1);
			expect(summary.skipped).toBe(1);
		});

		test('a malformed task note is excluded: no remote delete, record kept, surfaced', async () => {
			const { taskId } = await seedSynced();
			index.trees.set('Alpha', []); // note no longer parses as a task…
			index.invalid = [{ path: TASK_PATH, reason: 'invalid status: maybe' }];

			const summary = await engine.syncAll(index);

			expect(summary.invalid).toBe(1);
			expect(client.callsOf('deleteTask')).toHaveLength(0);
			expect(client.callsOf('getTask')).toHaveLength(0);
			expect(snapshot.tasks[TASK_PATH]?.ticktickId).toBe(taskId);
		});
	});

	describe('conflicts: both sides changed (last-writer-wins, Obsidian wins ties)', () => {
		const LOCAL_EDIT_TIME = Date.parse('2026-06-11T10:00:00Z');
		const REMOTE_EARLIER = '2026-06-11T08:00:00+0000';
		const REMOTE_LATER = '2026-06-11T11:00:00+0000';

		test.each([
			{ name: 'older remote edit', patch: { priority: 5, modifiedTime: REMOTE_EARLIER }, winner: 'local' },
			{ name: 'newer remote edit', patch: { priority: 5, modifiedTime: REMOTE_LATER }, winner: 'remote' },
			{ name: 'remote edit without modifiedTime (tie)', patch: { priority: 5 }, winner: 'local' },
			{ name: 'older remote completion', patch: { status: 2, modifiedTime: REMOTE_EARLIER }, winner: 'local' },
			{ name: 'newer remote completion', patch: { status: 2, modifiedTime: REMOTE_LATER }, winner: 'remote' },
		])('local edit × $name → $winner wins', async ({ patch, winner }) => {
			const { projectId, taskId } = await seedSynced();
			index.trees.set('Alpha', [leaf(makeTask('T', { priority: 'low' }))]);
			store.mtimes.set(TASK_PATH, LOCAL_EDIT_TIME);
			client.editRemote(projectId, taskId, patch);

			const summary = await engine.syncAll(index);

			expect(summary.conflicts).toBe(1);
			if (winner === 'local') {
				const draft = client.callsOf('updateTask')[0]?.args[0] as TickTickTaskDraft;
				expect(draft).toMatchObject({ priority: 1, status: 0 });
				expect(store.written.get(TASK_PATH)?.['priority']).toBeUndefined();
			} else {
				expect(client.callsOf('updateTask')).toHaveLength(0);
				const fm = store.written.get(TASK_PATH) ?? {};
				if (patch.status === 2) expect(fm['status']).toBe('done');
				else expect(fm['priority']).toBe('high');
			}
		});

		test('local completion × older remote edit → completion is pushed', async () => {
			const { projectId, taskId } = await seedSynced();
			index.trees.set('Alpha', [leaf(makeTask('T', { status: 'done' }))]);
			store.mtimes.set(TASK_PATH, LOCAL_EDIT_TIME);
			client.editRemote(projectId, taskId, { priority: 5, modifiedTime: REMOTE_EARLIER });

			const summary = await engine.syncAll(index);

			expect(summary.conflicts).toBe(1);
			expect(client.callsOf('completeTask')).toHaveLength(1);
			expect(store.written.get(TASK_PATH)?.['priority']).toBeUndefined();
		});

		test('local completion × newer remote edit → local note reopens with remote fields', async () => {
			const { projectId, taskId } = await seedSynced();
			index.trees.set('Alpha', [leaf(makeTask('T', { status: 'done' }))]);
			store.mtimes.set(TASK_PATH, LOCAL_EDIT_TIME);
			client.editRemote(projectId, taskId, { priority: 5, modifiedTime: REMOTE_LATER });

			const summary = await engine.syncAll(index);

			expect(summary.conflicts).toBe(1);
			expect(client.callsOf('completeTask')).toHaveLength(0);
			expect(store.written.get(TASK_PATH)).toMatchObject({ status: 'todo', priority: 'high' });
			expect(snapshot.tasks[TASK_PATH]?.completedPushed).toBe(false);
		});

		test('completed on both sides → both agree, no API writes', async () => {
			const { projectId, taskId } = await seedSynced();
			index.trees.set('Alpha', [leaf(makeTask('T', { status: 'done' }))]);
			client.editRemote(projectId, taskId, { status: 2 });

			const summary = await engine.syncAll(index);

			expect(client.callsOf('completeTask')).toHaveLength(0);
			expect(client.callsOf('updateTask')).toHaveLength(0);
			expect(summary.skipped).toBe(1);
			expect(snapshot.tasks[TASK_PATH]?.completedPushed).toBe(true);
		});

		test('local edit × remote delete → Obsidian wins, task recreated remotely', async () => {
			const { projectId, taskId } = await seedSynced();
			index.trees.set('Alpha', [leaf(makeTask('T', { priority: 'low' }))]);
			await client.deleteTask(projectId, taskId);
			client.calls = [];

			const summary = await engine.syncAll(index);

			expect(summary.created).toBe(1);
			const draft = client.callsOf('createTask')[0]?.args[0] as TickTickTaskDraft;
			expect(draft).toMatchObject({ title: 'T', priority: 1 });
			expect(snapshot.tasks[TASK_PATH]?.ticktickId).toBe('tt-3');
			expect(store.written.get(TASK_PATH)).toMatchObject({ 'ticktick-id': 'tt-3' });
		});

		test('local completion × remote delete → record dropped, nothing recreated', async () => {
			const { projectId, taskId } = await seedSynced();
			index.trees.set('Alpha', [leaf(makeTask('T', { status: 'done' }))]);
			await client.deleteTask(projectId, taskId);
			client.calls = [];

			const summary = await engine.syncAll(index);

			expect(client.callsOf('createTask')).toHaveLength(0);
			expect(store.trashed).toHaveLength(0);
			expect(snapshot.tasks[TASK_PATH]).toBeUndefined();
			expect(summary.errors).toHaveLength(0);
		});

		test('local delete × unchanged remote → remote task deleted', async () => {
			const { projectId, taskId } = await seedSynced();
			index.trees.set('Alpha', []);

			const summary = await engine.syncAll(index);

			expect(summary.deletedRemotely).toBe(1);
			expect(client.callsOf('deleteTask')[0]?.args).toEqual([projectId, taskId]);
			expect(snapshot.tasks[TASK_PATH]).toBeUndefined();
		});

		test('local delete × remote edit → Obsidian wins, remote task deleted', async () => {
			const { projectId, taskId } = await seedSynced();
			index.trees.set('Alpha', []);
			client.editRemote(projectId, taskId, { priority: 5, modifiedTime: REMOTE_LATER });

			const summary = await engine.syncAll(index);

			expect(summary.deletedRemotely).toBe(1);
			expect(snapshot.tasks[TASK_PATH]).toBeUndefined();
		});

		test('local delete × remote completion → record dropped, no remote delete', async () => {
			const { projectId, taskId } = await seedSynced();
			index.trees.set('Alpha', []);
			client.editRemote(projectId, taskId, { status: 2 });

			const summary = await engine.syncAll(index);

			expect(client.callsOf('deleteTask')).toHaveLength(0);
			expect(summary.deletedRemotely).toBe(0);
			expect(snapshot.tasks[TASK_PATH]).toBeUndefined();
		});
	});
});
