import { describe, expect, test } from 'vitest';
import type { Task } from '../../src/core/models';
import type { TaskTreeNode } from '../../src/core/task-index';
import { priorityToTickTick, pushFingerprint, taskToTickTick } from '../../src/sync/mapping';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		path: 'Projects/Alpha/Tasks/T.md',
		title: 'T',
		status: 'todo',
		priority: 'none',
		...overrides,
	};
}

function node(task: Task, children: TaskTreeNode[] = []): TaskTreeNode {
	return { task, children };
}

const OPTS = { projectId: 'ttp-1', timeZone: 'Europe/Warsaw' };

describe('priorityToTickTick', () => {
	test('maps the four priorities to TickTick numeric levels', () => {
		expect(priorityToTickTick('none')).toBe(0);
		expect(priorityToTickTick('low')).toBe(1);
		expect(priorityToTickTick('medium')).toBe(3);
		expect(priorityToTickTick('high')).toBe(5);
	});
});

describe('taskToTickTick', () => {
	test('maps title, project, and priority; no due fields when due absent', () => {
		const draft = taskToTickTick(makeTask({ title: 'Ship it', priority: 'high' }), [], OPTS);

		expect(draft).toMatchObject({ projectId: 'ttp-1', title: 'Ship it', priority: 5 });
		expect(draft.dueDate).toBeUndefined();
		expect(draft.reminders).toBeUndefined();
	});

	test('date-only due becomes all-day with 9am reminder trigger', () => {
		const draft = taskToTickTick(makeTask({ due: '2026-06-15' }), [], OPTS);

		expect(draft.isAllDay).toBe(true);
		expect(draft.dueDate).toMatch(/^2026-06-1[45]T\d{2}:\d{2}:\d{2}\+0000$/);
		expect(draft.reminders).toEqual(['TRIGGER:P0DT9H0M0S']);
		expect(draft.timeZone).toBe('Europe/Warsaw');
	});

	test('timed due becomes non-all-day with on-time reminder', () => {
		const draft = taskToTickTick(makeTask({ due: '2026-06-15T09:30' }), [], OPTS);

		expect(draft.isAllDay).toBe(false);
		expect(draft.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+0000$/);
		expect(draft.reminders).toEqual(['TRIGGER:PT0S']);
	});

	test('flattens descendant subtasks depth-first into checklist items with mapped status', () => {
		const grandchild = node(makeTask({ title: 'GC', status: 'done', path: 'p/gc.md' }));
		const childA = node(makeTask({ title: 'A', status: 'todo', path: 'p/a.md' }), [grandchild]);
		const childB = node(makeTask({ title: 'B', status: 'cancelled', path: 'p/b.md' }));

		const draft = taskToTickTick(makeTask(), [childA, childB], OPTS);

		expect(draft.items).toEqual([
			{ title: 'A', status: 0 },
			{ title: 'GC', status: 1 },
			{ title: 'B', status: 1 },
		]);
	});
});

describe('pushFingerprint', () => {
	test('is stable for identical input', () => {
		expect(pushFingerprint(makeTask(), [])).toBe(pushFingerprint(makeTask(), []));
	});

	test('changes when a pushed field changes', () => {
		const base = pushFingerprint(makeTask(), []);

		expect(pushFingerprint(makeTask({ title: 'X' }), [])).not.toBe(base);
		expect(pushFingerprint(makeTask({ due: '2026-06-15' }), [])).not.toBe(base);
		expect(pushFingerprint(makeTask({ priority: 'low' }), [])).not.toBe(base);
		expect(pushFingerprint(makeTask({ status: 'done' }), [])).not.toBe(base);
	});

	test('changes when a child status changes', () => {
		const child = (status: 'todo' | 'done') =>
			node(makeTask({ title: 'C', status, path: 'p/c.md' }));

		expect(pushFingerprint(makeTask(), [child('todo')])).not.toBe(
			pushFingerprint(makeTask(), [child('done')]),
		);
	});

	test('ignores fields that are not pushed (e.g. created)', () => {
		expect(pushFingerprint(makeTask({ created: '2026-01-01' }), [])).toBe(
			pushFingerprint(makeTask({ created: '2026-02-02' }), []),
		);
	});
});
