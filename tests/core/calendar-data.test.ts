import { describe, expect, test } from 'vitest';
import { Task } from '../../src/core/models';
import { monthGrid, rescheduleDue, tasksByDueDay, weekRow } from '../../src/core/calendar-data';

function task(title: string, overrides: Partial<Task> = {}): Task {
	return {
		path: `Projects/Alpha/Tasks/${title}.md`,
		title,
		status: 'todo',
		priority: 'none',
		...overrides,
	};
}

const TODAY = new Date(2026, 5, 11); // Thursday 2026-06-11

describe('monthGrid', () => {
	test('covers June 2026 in five Monday-started weeks', () => {
		const weeks = monthGrid(2026, 5, TODAY);

		expect(weeks).toHaveLength(5);
		expect(weeks.every((w) => w.length === 7)).toBe(true);
		expect(weeks[0]?.[0]?.key).toBe('2026-06-01');
		expect(weeks[4]?.[6]?.key).toBe('2026-07-05');
	});

	test('flags padding cells from neighboring months', () => {
		const weeks = monthGrid(2026, 6, TODAY); // July 2026 starts on Wednesday

		expect(weeks[0]?.[0]?.key).toBe('2026-06-29');
		expect(weeks[0]?.[0]?.inCurrentMonth).toBe(false);
		expect(weeks[0]?.[2]?.key).toBe('2026-07-01');
		expect(weeks[0]?.[2]?.inCurrentMonth).toBe(true);
	});

	test('marks only the today cell as today', () => {
		const cells = monthGrid(2026, 5, TODAY).flat();

		expect(cells.filter((c) => c.isToday).map((c) => c.key)).toEqual(['2026-06-11']);
	});

	test('exposes day-of-month numbers for rendering', () => {
		const weeks = monthGrid(2026, 5, TODAY);

		expect(weeks[0]?.map((c) => c.dayOfMonth)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});
});

describe('weekRow', () => {
	test('returns the Monday-to-Sunday week around the anchor date', () => {
		const days = weekRow(new Date(2026, 5, 11), TODAY);

		expect(days.map((d) => d.key)).toEqual([
			'2026-06-08',
			'2026-06-09',
			'2026-06-10',
			'2026-06-11',
			'2026-06-12',
			'2026-06-13',
			'2026-06-14',
		]);
		expect(days[3]?.isToday).toBe(true);
		expect(days.every((d) => d.inCurrentMonth)).toBe(true);
	});

	test('handles an anchor that is already a Monday', () => {
		const days = weekRow(new Date(2026, 5, 8), TODAY);

		expect(days[0]?.key).toBe('2026-06-08');
		expect(days[6]?.key).toBe('2026-06-14');
	});
});

describe('tasksByDueDay', () => {
	test('groups tasks under the wall-clock date of their due value', () => {
		const tasks = [
			task('dated', { due: '2026-06-12' }),
			task('timed', { due: '2026-06-12T09:30:00' }),
			task('other-day', { due: '2026-06-13' }),
		];

		const byDay = tasksByDueDay(tasks);

		expect(byDay.get('2026-06-12')?.map((t) => t.title)).toEqual(['dated', 'timed']);
		expect(byDay.get('2026-06-13')?.map((t) => t.title)).toEqual(['other-day']);
	});

	test('sorts tasks within a day, higher priority first on equal due', () => {
		const tasks = [
			task('casual', { due: '2026-06-12' }),
			task('urgent', { due: '2026-06-12', priority: 'high' }),
		];

		expect(tasksByDueDay(tasks).get('2026-06-12')?.map((t) => t.title)).toEqual([
			'urgent',
			'casual',
		]);
	});

	test('skips undated and unparseable due values but keeps closed tasks', () => {
		const tasks = [
			task('undated'),
			task('garbage', { due: 'not a date' }),
			task('finished', { due: '2026-06-12', status: 'done' }),
		];

		const byDay = tasksByDueDay(tasks);

		expect([...byDay.keys()]).toEqual(['2026-06-12']);
		expect(byDay.get('2026-06-12')?.map((t) => t.title)).toEqual(['finished']);
	});
});

describe('rescheduleDue', () => {
	test('replaces a date-only due with the target day', () => {
		expect(rescheduleDue('2026-06-12', '2026-06-15')).toBe('2026-06-15');
	});

	test('keeps the time suffix of a datetime due', () => {
		expect(rescheduleDue('2026-06-12T09:30:00', '2026-06-15')).toBe('2026-06-15T09:30:00');
	});

	test('falls back to the target day when there was no due', () => {
		expect(rescheduleDue(undefined, '2026-06-15')).toBe('2026-06-15');
	});

	test('replaces non-ISO due formats wholesale', () => {
		expect(rescheduleDue('June 12, 2026', '2026-06-15')).toBe('2026-06-15');
	});
});
