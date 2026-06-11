import { describe, expect, test } from 'vitest';
import type { Task } from '../../src/core/models';
import type { TaskTreeNode } from '../../src/core/task-index';
import {
	priorityFromTickTick,
	priorityToTickTick,
	pushFingerprint,
	remoteDueToLocal,
	remoteFingerprint,
	taskToTickTick,
} from '../../src/sync/mapping';
import type { TickTickTask } from '../../src/sync/ticktick-client';

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

	test('includes TickTick status 0 for open and 2 for closed tasks (enables remote reopen)', () => {
		expect(taskToTickTick(makeTask({ status: 'todo' }), [], OPTS).status).toBe(0);
		expect(taskToTickTick(makeTask({ status: 'in-progress' }), [], OPTS).status).toBe(0);
		expect(taskToTickTick(makeTask({ status: 'done' }), [], OPTS).status).toBe(2);
		expect(taskToTickTick(makeTask({ status: 'cancelled' }), [], OPTS).status).toBe(2);
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

describe('priorityFromTickTick', () => {
	test('maps TickTick numeric levels back to the four priorities', () => {
		expect(priorityFromTickTick(0)).toBe('none');
		expect(priorityFromTickTick(1)).toBe('low');
		expect(priorityFromTickTick(3)).toBe('medium');
		expect(priorityFromTickTick(5)).toBe('high');
	});

	test('unknown or missing levels fall back to none', () => {
		expect(priorityFromTickTick(2)).toBe('none');
		expect(priorityFromTickTick(undefined)).toBe('none');
	});
});

describe('remoteDueToLocal', () => {
	test('all-day due becomes a date-only string in the local time zone', () => {
		// Midnight 2026-06-15 in Warsaw (UTC+2 in summer) = 22:00 UTC the day before.
		expect(remoteDueToLocal('2026-06-14T22:00:00+0000', true, 'Europe/Warsaw')).toBe('2026-06-15');
	});

	test('timed due becomes local wall-clock YYYY-MM-DDTHH:mm', () => {
		expect(remoteDueToLocal('2026-06-15T07:30:00+0000', false, 'Europe/Warsaw')).toBe(
			'2026-06-15T09:30',
		);
	});

	test('unparseable due returns undefined', () => {
		expect(remoteDueToLocal('not-a-date', false, 'Europe/Warsaw')).toBeUndefined();
	});
});

describe('remoteFingerprint', () => {
	function remote(overrides: Partial<TickTickTask> = {}): TickTickTask {
		return { id: 'tt-1', projectId: 'ttp-1', title: 'T', priority: 0, ...overrides };
	}

	test('is stable for identical remote state', () => {
		expect(remoteFingerprint(remote())).toBe(remoteFingerprint(remote()));
	});

	test('treats missing status as open and missing items as empty', () => {
		expect(remoteFingerprint(remote())).toBe(remoteFingerprint(remote({ status: 0, items: [] })));
	});

	test('changes when a synced field changes', () => {
		const base = remoteFingerprint(remote());

		expect(remoteFingerprint(remote({ title: 'X' }))).not.toBe(base);
		expect(remoteFingerprint(remote({ status: 2 }))).not.toBe(base);
		expect(remoteFingerprint(remote({ dueDate: '2026-06-15T07:30:00+0000' }))).not.toBe(base);
		expect(remoteFingerprint(remote({ priority: 5 }))).not.toBe(base);
		expect(remoteFingerprint(remote({ items: [{ title: 'C', status: 0 }] }))).not.toBe(base);
	});

	test('ignores volatile fields like modifiedTime and checklist item ids', () => {
		expect(remoteFingerprint(remote({ modifiedTime: '2026-06-11T10:00:00+0000' }))).toBe(
			remoteFingerprint(remote({ modifiedTime: '2026-06-12T10:00:00+0000' })),
		);
		expect(remoteFingerprint(remote({ items: [{ id: 'a', title: 'C', status: 0 }] }))).toBe(
			remoteFingerprint(remote({ items: [{ id: 'b', title: 'C', status: 0 }] })),
		);
	});
});
