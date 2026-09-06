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

	test('finds an indexed project by its note path', () => {
		index.onFileChanged('Projects/Alpha/Alpha.md', { type: 'project', status: 'on-hold' });

		expect(index.getProjectByPath('Projects/Alpha/Alpha.md')).toMatchObject({
			name: 'Alpha',
			status: 'on-hold',
		});
	});

	test('returns undefined for a path that is not a project note', () => {
		index.onFileChanged('Projects/Alpha/Tasks/Build parser.md', taskFm());

		expect(index.getProjectByPath('Projects/Alpha/Tasks/Build parser.md')).toBeUndefined();
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

	describe('onTaskCompleted', () => {
		const PATH = 'Projects/Alpha/Tasks/T.md';

		test('fires exactly once with the new task on todo to done', () => {
			const listener = vi.fn();
			index.onTaskCompleted(listener);

			index.onFileChanged(PATH, taskFm({ status: 'todo' }));
			index.onFileChanged(PATH, taskFm({ status: 'done', recurrence: 'daily' }));

			expect(listener).toHaveBeenCalledTimes(1);
			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({ path: PATH, status: 'done', recurrence: 'daily' }),
			);
		});

		test('fires on in-progress to done', () => {
			const listener = vi.fn();
			index.onTaskCompleted(listener);

			index.onFileChanged(PATH, taskFm({ status: 'in-progress' }));
			index.onFileChanged(PATH, taskFm({ status: 'done' }));

			expect(listener).toHaveBeenCalledTimes(1);
		});

		test('fires on cancelled to done', () => {
			const listener = vi.fn();
			index.onTaskCompleted(listener);

			index.onFileChanged(PATH, taskFm({ status: 'cancelled' }));
			index.onFileChanged(PATH, taskFm({ status: 'done' }));

			expect(listener).toHaveBeenCalledTimes(1);
		});

		test('does not fire on done to done (duplicate metadata event)', () => {
			const listener = vi.fn();
			index.onTaskCompleted(listener);

			index.onFileChanged(PATH, taskFm({ status: 'todo' }));
			index.onFileChanged(PATH, taskFm({ status: 'done' }));
			index.onFileChanged(PATH, taskFm({ status: 'done' }));

			expect(listener).toHaveBeenCalledTimes(1);
		});

		test('does not fire when the first sighting is already done (startup build)', () => {
			const listener = vi.fn();
			index.onTaskCompleted(listener);

			index.onFileChanged(PATH, taskFm({ status: 'done' }));

			expect(listener).not.toHaveBeenCalled();
		});

		test('does not fire on done to todo, then fires again on the next completion', () => {
			const listener = vi.fn();
			index.onTaskCompleted(listener);

			index.onFileChanged(PATH, taskFm({ status: 'todo' }));
			index.onFileChanged(PATH, taskFm({ status: 'done' }));
			index.onFileChanged(PATH, taskFm({ status: 'todo' }));
			expect(listener).toHaveBeenCalledTimes(1);

			index.onFileChanged(PATH, taskFm({ status: 'done' }));
			expect(listener).toHaveBeenCalledTimes(2);
		});

		test('unsubscribe stops completion events', () => {
			const listener = vi.fn();
			const unsubscribe = index.onTaskCompleted(listener);
			unsubscribe();

			index.onFileChanged(PATH, taskFm({ status: 'todo' }));
			index.onFileChanged(PATH, taskFm({ status: 'done' }));

			expect(listener).not.toHaveBeenCalled();
		});

		test('does not fire when the previous state was invalid frontmatter', () => {
			const listener = vi.fn();
			index.onTaskCompleted(listener);

			index.onFileChanged(PATH, taskFm({ status: 'doing' }));
			index.onFileChanged(PATH, taskFm({ status: 'done' }));

			expect(listener).not.toHaveBeenCalled();
		});

		test('never fires for project notes', () => {
			const listener = vi.fn();
			index.onTaskCompleted(listener);

			index.onFileChanged('Projects/Alpha/Alpha.md', { type: 'project', status: 'active' });
			index.onFileChanged('Projects/Alpha/Alpha.md', { type: 'project', status: 'done' });

			expect(listener).not.toHaveBeenCalled();
		});

		test('never fires from onFileDeleted or onFileRenamed', () => {
			const listener = vi.fn();
			index.onTaskCompleted(listener);

			index.onFileChanged(PATH, taskFm({ status: 'todo' }));
			index.onFileRenamed(PATH, 'Projects/Alpha/Tasks/R.md', taskFm({ status: 'done' }));
			index.onFileDeleted('Projects/Alpha/Tasks/R.md');

			expect(listener).not.toHaveBeenCalled();
		});

		test('completion transitions still notify re-render subscribers', () => {
			const renderListener = vi.fn();
			index.subscribe(renderListener);

			index.onFileChanged(PATH, taskFm({ status: 'todo' }));
			index.onFileChanged(PATH, taskFm({ status: 'done' }));

			expect(renderListener).toHaveBeenCalledTimes(2);
		});

		test('a throwing first listener does not prevent second listener from firing, and onFileChanged does not throw', () => {
			const throwing = vi.fn().mockImplementation(() => { throw new Error('boom'); });
			const safe = vi.fn();
			index.onTaskCompleted(throwing);
			index.onTaskCompleted(safe);

			index.onFileChanged(PATH, taskFm({ status: 'todo' }));
			expect(() => {
				index.onFileChanged(PATH, taskFm({ status: 'done' }));
			}).not.toThrow();

			expect(throwing).toHaveBeenCalledTimes(1);
			expect(safe).toHaveBeenCalledTimes(1);
		});
	});
});
