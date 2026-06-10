import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TaskIndex } from '../../src/core/task-index';

const ROOT = 'Projects';

function taskFm(extra: Record<string, unknown> = {}): Record<string, unknown> {
	return { type: 'task', ...extra };
}

describe('TaskIndex', () => {
	let index: TaskIndex;

	beforeEach(() => {
		index = new TaskIndex(ROOT);
	});

	test('indexes a task note inside the projects root', () => {
		index.onFileChanged('Projects/Alpha/Tasks/Build parser.md', taskFm());

		expect(index.getAllTasks()).toHaveLength(1);
		expect(index.getAllTasks()[0]).toMatchObject({ title: 'Build parser', status: 'todo' });
	});

	test('indexes a project index note', () => {
		index.onFileChanged('Projects/Alpha/Alpha.md', { type: 'project', status: 'active' });

		expect(index.getAllProjects()).toHaveLength(1);
		expect(index.getAllProjects()[0]).toMatchObject({ name: 'Alpha', status: 'active' });
	});

	test('ignores files outside the projects root', () => {
		index.onFileChanged('Daily/2026-06-10.md', taskFm());

		expect(index.getAllTasks()).toHaveLength(0);
	});

	test('ignores notes without task or project frontmatter', () => {
		index.onFileChanged('Projects/Alpha/Meeting notes.md', { tags: ['meeting'] });

		expect(index.getAllTasks()).toHaveLength(0);
		expect(index.getAllProjects()).toHaveLength(0);
	});

	test('records malformed task as invalid, not as task', () => {
		index.onFileChanged('Projects/Alpha/Tasks/Bad.md', taskFm({ status: 'doing' }));

		expect(index.getAllTasks()).toHaveLength(0);
		expect(index.getInvalid()).toHaveLength(1);
		expect(index.getInvalid()[0]?.reason).toContain('status');
	});

	test('updates an already-indexed task in place', () => {
		const path = 'Projects/Alpha/Tasks/T.md';
		index.onFileChanged(path, taskFm({ status: 'todo' }));
		index.onFileChanged(path, taskFm({ status: 'done' }));

		expect(index.getAllTasks()).toHaveLength(1);
		expect(index.getAllTasks()[0]?.status).toBe('done');
	});

	test('removes task when its note stops being a task', () => {
		const path = 'Projects/Alpha/Tasks/T.md';
		index.onFileChanged(path, taskFm());
		index.onFileChanged(path, { tags: ['archived'] });

		expect(index.getAllTasks()).toHaveLength(0);
	});

	test('clears invalid entry when frontmatter is fixed', () => {
		const path = 'Projects/Alpha/Tasks/T.md';
		index.onFileChanged(path, taskFm({ status: 'doing' }));
		index.onFileChanged(path, taskFm({ status: 'in-progress' }));

		expect(index.getInvalid()).toHaveLength(0);
		expect(index.getAllTasks()).toHaveLength(1);
	});

	test('onFileDeleted removes the entry', () => {
		const path = 'Projects/Alpha/Tasks/T.md';
		index.onFileChanged(path, taskFm());
		index.onFileDeleted(path);

		expect(index.getAllTasks()).toHaveLength(0);
	});

	test('onFileRenamed re-keys the task and updates its title', () => {
		index.onFileChanged('Projects/Alpha/Tasks/Old name.md', taskFm());
		index.onFileRenamed('Projects/Alpha/Tasks/Old name.md', 'Projects/Alpha/Tasks/New name.md', taskFm());

		expect(index.getAllTasks()).toHaveLength(1);
		expect(index.getAllTasks()[0]).toMatchObject({
			path: 'Projects/Alpha/Tasks/New name.md',
			title: 'New name',
		});
	});

	test('getTasksForProject returns only that project\'s tasks', () => {
		index.onFileChanged('Projects/Alpha/Tasks/A.md', taskFm());
		index.onFileChanged('Projects/Beta/Tasks/B.md', taskFm());

		const alpha = index.getTasksForProject('Alpha');
		expect(alpha).toHaveLength(1);
		expect(alpha[0]?.title).toBe('A');
	});

	test('projectNameForPath derives project from folder under root', () => {
		index.onFileChanged('Projects/Alpha/Tasks/A.md', taskFm());

		expect(index.projectNameForPath('Projects/Alpha/Tasks/A.md')).toBe('Alpha');
		expect(index.projectNameForPath('Elsewhere/A.md')).toBeNull();
	});

	test('getTaskTree nests subtasks under parents across multiple levels', () => {
		index.onFileChanged('Projects/Alpha/Tasks/Root.md', taskFm());
		index.onFileChanged('Projects/Alpha/Tasks/Child.md', taskFm({ parent: '[[Root]]' }));
		index.onFileChanged('Projects/Alpha/Tasks/Grandchild.md', taskFm({ parent: '[[Child]]' }));

		const tree = index.getTaskTree('Alpha');
		expect(tree).toHaveLength(1);
		expect(tree[0]?.task.title).toBe('Root');
		expect(tree[0]?.children[0]?.task.title).toBe('Child');
		expect(tree[0]?.children[0]?.children[0]?.task.title).toBe('Grandchild');
	});

	test('task with missing parent becomes a root', () => {
		index.onFileChanged('Projects/Alpha/Tasks/Orphan.md', taskFm({ parent: '[[Ghost]]' }));

		const tree = index.getTaskTree('Alpha');
		expect(tree).toHaveLength(1);
		expect(tree[0]?.task.title).toBe('Orphan');
	});

	test('notifies subscribers on relevant mutations only', () => {
		const listener = vi.fn();
		index.subscribe(listener);

		index.onFileChanged('Projects/Alpha/Tasks/T.md', taskFm());
		index.onFileChanged('Elsewhere/Note.md', taskFm());

		expect(listener).toHaveBeenCalledTimes(1);
	});

	test('unsubscribe stops notifications', () => {
		const listener = vi.fn();
		const unsubscribe = index.subscribe(listener);
		unsubscribe();

		index.onFileChanged('Projects/Alpha/Tasks/T.md', taskFm());

		expect(listener).not.toHaveBeenCalled();
	});
});
