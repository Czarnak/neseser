import { beforeEach, describe, expect, test } from 'vitest';
import type { Frontmatter, Project, Task } from '../../src/core/models';
import type { TaskTreeNode } from '../../src/core/task-index';
import { SyncEngine } from '../../src/sync/sync-engine';
import { SyncSnapshot, emptySnapshot } from '../../src/sync/sync-state';
import type { TickTickTaskDraft } from '../../src/sync/mapping';

class FakeClient {
	calls: { method: string; args: unknown[] }[] = [];
	failOn: string | null = null;
	private nextId = 1;

	async createProject(name: string): Promise<{ id: string; name: string }> {
		this.record('createProject', name);
		return { id: `ttp-${this.nextId++}`, name };
	}

	async createTask(draft: TickTickTaskDraft): Promise<{ id: string } & TickTickTaskDraft> {
		this.record('createTask', draft);
		return { ...draft, id: `tt-${this.nextId++}` };
	}

	async updateTask(draft: TickTickTaskDraft & { id: string }): Promise<{ id: string }> {
		this.record('updateTask', draft);
		return { id: draft.id };
	}

	async completeTask(projectId: string, taskId: string): Promise<void> {
		this.record('completeTask', projectId, taskId);
	}

	callsOf(method: string): { method: string; args: unknown[] }[] {
		return this.calls.filter((c) => c.method === method);
	}

	private record(method: string, ...args: unknown[]): void {
		if (this.failOn === method) throw new Error(`fake ${method} failure`);
		this.calls.push({ method, args });
	}
}

class FakeWriter {
	written = new Map<string, Frontmatter>();

	async updateFrontmatter(path: string, updater: (fm: Frontmatter) => void): Promise<void> {
		const fm = this.written.get(path) ?? {};
		updater(fm);
		this.written.set(path, fm);
	}
}

class FakeIndex {
	projects: Project[] = [];
	trees = new Map<string, TaskTreeNode[]>();

	getAllProjects(): Project[] {
		return this.projects;
	}

	getTaskTree(projectName: string): TaskTreeNode[] {
		return this.trees.get(projectName) ?? [];
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

describe('SyncEngine.pushAll', () => {
	let client: FakeClient;
	let writer: FakeWriter;
	let index: FakeIndex;
	let snapshot: SyncSnapshot;
	let persisted: number;
	let engine: SyncEngine;

	beforeEach(() => {
		client = new FakeClient();
		writer = new FakeWriter();
		index = new FakeIndex();
		snapshot = emptySnapshot();
		persisted = 0;
		engine = new SyncEngine(
			client,
			snapshot,
			async () => {
				persisted++;
			},
			writer,
			'Europe/Warsaw',
		);
	});

	test('creates a TickTick project and writes the id back to project frontmatter', async () => {
		index.projects = [makeProject('Alpha')];

		const summary = await engine.pushAll(index);

		expect(summary.createdProjects).toBe(1);
		expect(snapshot.projects['Alpha']).toBe('ttp-1');
		expect(writer.written.get('Projects/Alpha/Alpha.md')).toMatchObject({
			'ticktick-project-id': 'ttp-1',
		});
	});

	test('reuses project id from frontmatter without creating', async () => {
		index.projects = [makeProject('Alpha', { ticktickProjectId: 'ttp-77' })];

		await engine.pushAll(index);

		expect(client.callsOf('createProject')).toHaveLength(0);
		expect(snapshot.projects['Alpha']).toBe('ttp-77');
	});

	test('creates a new open task and writes back its ticktick-id', async () => {
		index.projects = [makeProject('Alpha')];
		index.trees.set('Alpha', [leaf(makeTask('Build parser', { due: '2026-06-15', priority: 'high' }))]);

		const summary = await engine.pushAll(index);

		expect(summary.created).toBe(1);
		const draft = client.callsOf('createTask')[0]?.args[0] as TickTickTaskDraft;
		expect(draft).toMatchObject({ projectId: 'ttp-1', title: 'Build parser', priority: 5 });
		expect(writer.written.get('Projects/Alpha/Tasks/Build parser.md')).toMatchObject({
			'ticktick-id': 'tt-2',
		});
		expect(snapshot.tasks['Projects/Alpha/Tasks/Build parser.md']?.ticktickId).toBe('tt-2');
	});

	test('does not create tasks that were already closed before ever syncing', async () => {
		index.projects = [makeProject('Alpha')];
		index.trees.set('Alpha', [leaf(makeTask('Old', { status: 'done' }))]);

		const summary = await engine.pushAll(index);

		expect(client.callsOf('createTask')).toHaveLength(0);
		expect(summary.skipped).toBe(1);
	});

	test('skips unchanged tasks on a second push', async () => {
		index.projects = [makeProject('Alpha')];
		index.trees.set('Alpha', [leaf(makeTask('T'))]);
		await engine.pushAll(index);
		client.calls = [];

		const summary = await engine.pushAll(index);

		expect(client.callsOf('createTask')).toHaveLength(0);
		expect(client.callsOf('updateTask')).toHaveLength(0);
		expect(summary.skipped).toBe(1);
	});

	test('updates a previously-pushed task whose fields changed', async () => {
		index.projects = [makeProject('Alpha')];
		index.trees.set('Alpha', [leaf(makeTask('T'))]);
		await engine.pushAll(index);
		index.trees.set('Alpha', [leaf(makeTask('T', { priority: 'high' }))]);

		const summary = await engine.pushAll(index);

		expect(summary.updated).toBe(1);
		const draft = client.callsOf('updateTask')[0]?.args[0] as { id: string; priority: number };
		expect(draft.id).toBe('tt-2');
		expect(draft.priority).toBe(5);
	});

	test('completes a synced task once when it is done locally', async () => {
		index.projects = [makeProject('Alpha')];
		index.trees.set('Alpha', [leaf(makeTask('T'))]);
		await engine.pushAll(index);
		index.trees.set('Alpha', [leaf(makeTask('T', { status: 'done' }))]);

		const summary = await engine.pushAll(index);
		const secondSummary = await engine.pushAll(index);

		expect(summary.completed).toBe(1);
		expect(client.callsOf('completeTask')).toHaveLength(1);
		expect(client.callsOf('completeTask')[0]?.args).toEqual(['ttp-1', 'tt-2']);
		expect(secondSummary.completed).toBe(0);
	});

	test('a child change triggers a parent update', async () => {
		const parent = makeTask('Parent');
		const child = makeTask('Child', { path: 'Projects/Alpha/Tasks/Child.md' });
		index.projects = [makeProject('Alpha')];
		index.trees.set('Alpha', [{ task: parent, children: [leaf(child)] }]);
		await engine.pushAll(index);
		index.trees.set('Alpha', [
			{ task: parent, children: [leaf({ ...child, status: 'done' })] },
		]);

		const summary = await engine.pushAll(index);

		expect(summary.updated).toBe(1);
		const draft = client.callsOf('updateTask')[0]?.args[0] as TickTickTaskDraft;
		expect(draft.items).toEqual([{ title: 'Child', status: 1 }]);
	});

	test('one failing task does not abort the rest, error is reported, state persists', async () => {
		index.projects = [makeProject('Alpha')];
		index.trees.set('Alpha', [leaf(makeTask('Fails')), leaf(makeTask('Works'))]);
		client.failOn = 'createTask';
		const first = await engine.pushAll(index);
		client.failOn = null;

		expect(first.errors).toHaveLength(2);
		expect(persisted).toBeGreaterThan(0);

		const second = await engine.pushAll(index);
		expect(second.created).toBe(2);
		expect(second.errors).toHaveLength(0);
	});

	test('project creation failure skips its tasks but continues with other projects', async () => {
		index.projects = [makeProject('Alpha'), makeProject('Beta', { ticktickProjectId: 'ttp-9' })];
		index.trees.set('Alpha', [leaf(makeTask('A'))]);
		index.trees.set('Beta', [leaf(makeTask('B', { path: 'Projects/Beta/Tasks/B.md' }))]);
		client.failOn = 'createProject';

		const summary = await engine.pushAll(index);

		expect(summary.errors).toHaveLength(1);
		expect(summary.created).toBe(1);
		expect(snapshot.tasks['Projects/Beta/Tasks/B.md']).toBeDefined();
	});
});
