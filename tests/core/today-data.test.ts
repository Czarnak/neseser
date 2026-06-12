import { describe, expect, test } from 'vitest';
import { Task } from '../../src/core/models';
import { overdueDays, todayGroups } from '../../src/core/today-data';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		path: 'Projects/Alpha/Tasks/task.md',
		title: 'task',
		status: 'todo',
		priority: 'none',
		...overrides,
	};
}

// Fixed "now" for all tests: 2026-06-12 10:30 local time
const NOW = new Date(2026, 5, 12, 10, 30);

// ---------------------------------------------------------------------------
// todayGroups
// ---------------------------------------------------------------------------

describe('todayGroups', () => {
	test('places a task due today in the today group', () => {
		const t = makeTask({ due: '2026-06-12' });
		const { today, overdue } = todayGroups([t], NOW);
		expect(today).toHaveLength(1);
		expect(overdue).toHaveLength(0);
	});

	test('places a task due yesterday in the overdue group', () => {
		const t = makeTask({ due: '2026-06-11' });
		const { today, overdue } = todayGroups([t], NOW);
		expect(overdue).toHaveLength(1);
		expect(today).toHaveLength(0);
	});

	test('excludes a task due tomorrow', () => {
		const t = makeTask({ due: '2026-06-13' });
		const { today, overdue } = todayGroups([t], NOW);
		expect(today).toHaveLength(0);
		expect(overdue).toHaveLength(0);
	});

	test('excludes a task with no due date', () => {
		const t = makeTask();
		const { today, overdue } = todayGroups([t], NOW);
		expect(today).toHaveLength(0);
		expect(overdue).toHaveLength(0);
	});

	test('excludes a task with an unparseable due date', () => {
		const t = makeTask({ due: 'not a date' });
		const { today, overdue } = todayGroups([t], NOW);
		expect(today).toHaveLength(0);
		expect(overdue).toHaveLength(0);
	});

	test('excludes done tasks even when overdue', () => {
		const t = makeTask({ due: '2026-06-01', status: 'done' });
		const { today, overdue } = todayGroups([t], NOW);
		expect(overdue).toHaveLength(0);
	});

	test('excludes cancelled tasks even when overdue', () => {
		const t = makeTask({ due: '2026-06-01', status: 'cancelled' });
		const { today, overdue } = todayGroups([t], NOW);
		expect(overdue).toHaveLength(0);
	});

	test('includes in-progress tasks', () => {
		const t = makeTask({ due: '2026-06-12', status: 'in-progress' });
		const { today } = todayGroups([t], NOW);
		expect(today).toHaveLength(1);
	});

	test('treats a time-suffixed due of today as today', () => {
		const t = makeTask({ due: '2026-06-12T09:00' });
		const { today, overdue } = todayGroups([t], NOW);
		expect(today).toHaveLength(1);
		expect(overdue).toHaveLength(0);
	});

	test('treats a time-suffixed due of yesterday as overdue', () => {
		const t = makeTask({ due: '2026-06-11T23:59' });
		const { today, overdue } = todayGroups([t], NOW);
		expect(overdue).toHaveLength(1);
		expect(today).toHaveLength(0);
	});

	test('orders overdue tasks oldest-first', () => {
		const older = makeTask({ path: 'p/older.md', title: 'older', due: '2026-06-01' });
		const newer = makeTask({ path: 'p/newer.md', title: 'newer', due: '2026-06-10' });
		const { overdue } = todayGroups([newer, older], NOW);
		expect(overdue.map((t) => t.title)).toEqual(['older', 'newer']);
	});

	test('orders today tasks by time suffix then priority (compareTasks)', () => {
		const early = makeTask({ path: 'p/early.md', title: 'early', due: '2026-06-12T08:00' });
		const late = makeTask({ path: 'p/late.md', title: 'late', due: '2026-06-12T14:00' });
		const noTime = makeTask({ path: 'p/notime.md', title: 'notime', due: '2026-06-12', priority: 'high' });
		const { today } = todayGroups([late, noTime, early], NOW);
		// compareTasks: due asc, then priority — '2026-06-12T08:00' < '2026-06-12T14:00' < '2026-06-12' (no T suffix)
		// Wait: '2026-06-12' < '2026-06-12T...' lexicographically; compareTasks uses localeCompare on raw .due
		// '2026-06-12' < '2026-06-12T08:00' < '2026-06-12T14:00'
		expect(today.map((t) => t.title)).toEqual(['notime', 'early', 'late']);
	});

	test('returns empty groups for empty input', () => {
		const { today, overdue } = todayGroups([], NOW);
		expect(today).toHaveLength(0);
		expect(overdue).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// overdueDays
// ---------------------------------------------------------------------------

describe('overdueDays', () => {
	test('returns 1 for a task due yesterday', () => {
		expect(overdueDays('2026-06-11', NOW)).toBe(1);
	});

	test('returns 3 for a task due three days ago', () => {
		expect(overdueDays('2026-06-09', NOW)).toBe(3);
	});

	test('returns 0 for a task due today (not overdue)', () => {
		expect(overdueDays('2026-06-12', NOW)).toBe(0);
	});

	test('handles month boundary: May 31 is 12 days before June 12', () => {
		expect(overdueDays('2026-05-31', NOW)).toBe(12);
	});

	test('handles DST window: Mar 29 2026 (DST changeover) is exact day count', () => {
		// 2026-03-29 is the EU DST switch day. dayDiff is UTC-based so DST cannot shift it.
		const nowApril = new Date(2026, 3, 5); // 2026-04-05
		expect(overdueDays('2026-03-29', nowApril)).toBe(7);
	});

	test('returns null for an unparseable due string', () => {
		expect(overdueDays('not a date', NOW)).toBeNull();
	});
});
