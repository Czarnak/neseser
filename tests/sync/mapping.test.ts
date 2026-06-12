import { describe, expect, test } from 'vitest';
import type { Task } from '../../src/core/models';
import type { TaskTreeNode } from '../../src/core/task-index';
import {
	priorityFromTickTick,
	priorityToTickTick,
	pushFingerprint,
	remoteDatesToLocal,
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
		expect(draft.startDate).toBeUndefined();
		expect(draft.reminders).toBeUndefined();
	});

	test('sends startDate equal to dueDate so a date change moves app-edited tasks off their old startDate', () => {
		const allDay = taskToTickTick(makeTask({ due: '2026-06-15' }), [], OPTS);
		expect(allDay.startDate).toBe(allDay.dueDate);

		const timed = taskToTickTick(makeTask({ due: '2026-06-15T09:30' }), [], OPTS);
		expect(timed.startDate).toBe(timed.dueDate);
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

describe('taskToTickTick spans', () => {
	// Span encodings are asserted against single-date drafts so the
	// expectations hold in any system time zone the tests run under.
	const draftFor = (due: string) => taskToTickTick(makeTask({ due }), [], OPTS);

	test('all-day span: startDate at start midnight, dueDate exclusive (midnight after the due day)', () => {
		const span = taskToTickTick(makeTask({ start: '2026-06-16', due: '2026-06-17' }), [], OPTS);

		expect(span.isAllDay).toBe(true);
		expect(span.startDate).toBe(draftFor('2026-06-16').startDate);
		expect(span.dueDate).toBe(draftFor('2026-06-18').dueDate); // exclusive end, live-probe verified
		expect(span.reminders).toEqual(['TRIGGER:P0DT9H0M0S']);
	});

	test('start equal to due collapses to the single-day all-day form', () => {
		const span = taskToTickTick(makeTask({ start: '2026-06-16', due: '2026-06-16' }), [], OPTS);

		expect(span).toEqual(draftFor('2026-06-16'));
	});

	test('start after due falls back to the single-day form', () => {
		const span = taskToTickTick(makeTask({ start: '2026-06-20', due: '2026-06-16' }), [], OPTS);

		expect(span).toEqual(draftFor('2026-06-16'));
	});

	test('timed span keeps exact instants and is not all-day', () => {
		const span = taskToTickTick(
			makeTask({ start: '2026-06-15T09:00', due: '2026-06-16T17:30' }),
			[],
			OPTS,
		);

		expect(span.isAllDay).toBe(false);
		expect(span.startDate).toBe(draftFor('2026-06-15T09:00').startDate);
		expect(span.dueDate).toBe(draftFor('2026-06-16T17:30').dueDate);
		expect(span.reminders).toEqual(['TRIGGER:PT0S']);
	});

	test('mixed date-only start with timed due is not all-day; start parses as local midnight', () => {
		const span = taskToTickTick(makeTask({ start: '2026-06-15', due: '2026-06-16T17:30' }), [], OPTS);

		expect(span.isAllDay).toBe(false);
		expect(span.startDate).toBe(draftFor('2026-06-15').startDate);
	});

	test('start without due sends no date fields', () => {
		const draft = taskToTickTick(makeTask({ start: '2026-06-15' }), [], OPTS);

		expect(draft.startDate).toBeUndefined();
		expect(draft.dueDate).toBeUndefined();
	});
});

describe('remoteDatesToLocal', () => {
	const TZ = 'Europe/Warsaw';

	test('all-day span: exclusive dueDate maps back to the last included day', () => {
		// Jun 16 00:00 and Jun 18 00:00 Warsaw midnights — the app shows Jun 16–17 (live-probe verified).
		expect(
			remoteDatesToLocal('2026-06-15T22:00:00.000+0000', '2026-06-17T22:00:00.000+0000', true, TZ),
		).toEqual({ start: '2026-06-16', due: '2026-06-17' });
	});

	test('all-day with startDate equal to dueDate is a single day with no start', () => {
		expect(
			remoteDatesToLocal('2026-06-14T22:00:00.000+0000', '2026-06-14T22:00:00+0000', true, TZ),
		).toEqual({ due: '2026-06-15' });
	});

	test('all-day one-day exclusive span [D, D+1) is a single day with no start', () => {
		expect(
			remoteDatesToLocal('2026-06-21T22:00:00.000+0000', '2026-06-22T22:00:00.000+0000', true, TZ),
		).toEqual({ due: '2026-06-22' });
	});

	test('timed span keeps exact local wall-clock instants', () => {
		// The app-created probe task: Jun 22 07:30 → Jun 24 08:30 Warsaw.
		expect(
			remoteDatesToLocal('2026-06-22T05:30:00.000+0000', '2026-06-24T06:30:00.000+0000', false, TZ),
		).toEqual({ start: '2026-06-22T07:30', due: '2026-06-24T08:30' });
	});

	test('timed with startDate equal to dueDate (across renderings) has no start', () => {
		expect(
			remoteDatesToLocal('2026-06-22T05:30:00+0000', '2026-06-22T05:30:00.000+0000', false, TZ),
		).toEqual({ due: '2026-06-22T07:30' });
	});

	test('missing startDate behaves like the v1 due-only pull', () => {
		expect(remoteDatesToLocal(undefined, '2026-06-14T22:00:00+0000', true, TZ)).toEqual({
			due: '2026-06-15',
		});
	});

	test('startDate without dueDate is ignored', () => {
		expect(remoteDatesToLocal('2026-06-14T22:00:00+0000', undefined, true, TZ)).toEqual({});
	});

	test('unparseable dates degrade gracefully', () => {
		expect(remoteDatesToLocal('garbage', '2026-06-14T22:00:00+0000', true, TZ)).toEqual({
			due: '2026-06-15',
		});
		expect(remoteDatesToLocal('2026-06-14T22:00:00+0000', 'garbage', true, TZ)).toEqual({});
	});

	test('startDate after dueDate degrades to due only', () => {
		expect(
			remoteDatesToLocal('2026-06-20T22:00:00+0000', '2026-06-14T22:00:00+0000', true, TZ),
		).toEqual({ due: '2026-06-15' });
	});

	test('all-day span crossing the spring DST change keeps calendar days intact', () => {
		// Mar 28 00:00 CET → exclusive Mar 30 00:00 CEST (clocks jump Mar 29): span Mar 28–29.
		expect(
			remoteDatesToLocal('2026-03-27T23:00:00.000+0000', '2026-03-29T22:00:00.000+0000', true, TZ),
		).toEqual({ start: '2026-03-28', due: '2026-03-29' });
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

	test('changes when start changes', () => {
		const base = pushFingerprint(makeTask({ due: '2026-06-17' }), []);

		expect(pushFingerprint(makeTask({ start: '2026-06-15', due: '2026-06-17' }), [])).not.toBe(base);
	});

	test('ignores fields that are not pushed (e.g. created)', () => {
		expect(pushFingerprint(makeTask({ created: '2026-01-01' }), [])).toBe(
			pushFingerprint(makeTask({ created: '2026-02-02' }), []),
		);
	});

	test('ignores recurrence (local-only field never triggers a push)', () => {
		expect(pushFingerprint(makeTask({ recurrence: 'daily' }), [])).toBe(
			pushFingerprint(makeTask(), []),
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

	test('matches across "+0000" draft and ".000+0000" server renderings of the same instant', () => {
		expect(remoteFingerprint(remote({ dueDate: '2026-06-16T22:00:00+0000' }))).toBe(
			remoteFingerprint(remote({ dueDate: '2026-06-16T22:00:00.000+0000' })),
		);
	});

	test('changes when startDate changes (span edits are remote edits)', () => {
		const base = remoteFingerprint(remote({ dueDate: '2026-06-17T22:00:00+0000' }));

		expect(
			remoteFingerprint(
				remote({ startDate: '2026-06-15T22:00:00+0000', dueDate: '2026-06-17T22:00:00+0000' }),
			),
		).not.toBe(base);
	});

	test('startDate matches across draft and server renderings of the same instant', () => {
		expect(remoteFingerprint(remote({ startDate: '2026-06-16T22:00:00+0000' }))).toBe(
			remoteFingerprint(remote({ startDate: '2026-06-16T22:00:00.000+0000' })),
		);
	});

	test('still distinguishes different instants and tolerates unparseable dates', () => {
		expect(remoteFingerprint(remote({ dueDate: '2026-06-16T22:00:00+0000' }))).not.toBe(
			remoteFingerprint(remote({ dueDate: '2026-06-17T22:00:00+0000' })),
		);
		expect(remoteFingerprint(remote({ dueDate: 'garbage' }))).not.toBe(remoteFingerprint(remote()));
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
