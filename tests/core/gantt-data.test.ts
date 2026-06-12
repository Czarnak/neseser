import { describe, expect, test } from 'vitest';
import { Project, Task } from '../../src/core/models';
import {
	barGeometry,
	dayDiff,
	daysFromPixels,
	ganttLanes,
	ganttRows,
	ganttWindow,
	markerOffset,
	resizeEnd,
	resizeStart,
	shiftAnchor,
	shiftDayKey,
	shiftSpan,
} from '../../src/core/gantt-data';

function task(title: string, overrides: Partial<Task> = {}): Task {
	return {
		path: `Projects/Alpha/Tasks/${title}.md`,
		title,
		status: 'todo',
		priority: 'none',
		...overrides,
	};
}

function project(name: string, overrides: Partial<Project> = {}): Project {
	return { path: `Projects/${name}/${name}.md`, name, status: 'active', ...overrides };
}

const ANCHOR = new Date(2026, 5, 11); // Thursday 2026-06-11

describe('ganttWindow', () => {
	test('week zoom covers the Monday-to-Sunday week around the anchor', () => {
		const window = ganttWindow(ANCHOR, 'week');

		expect(window.days[0]).toBe('2026-06-08');
		expect(window.days[window.days.length - 1]).toBe('2026-06-14');
		expect(window.days).toHaveLength(7);
	});

	test('month zoom covers the anchor month exactly', () => {
		const window = ganttWindow(ANCHOR, 'month');

		expect(window.days[0]).toBe('2026-06-01');
		expect(window.days[window.days.length - 1]).toBe('2026-06-30');
		expect(window.days).toHaveLength(30);
	});

	test('quarter zoom covers the calendar quarter of the anchor', () => {
		const window = ganttWindow(ANCHOR, 'quarter'); // Q2: April–June

		expect(window.days[0]).toBe('2026-04-01');
		expect(window.days[window.days.length - 1]).toBe('2026-06-30');
		expect(window.days).toHaveLength(91);
	});

	test('days are contiguous calendar days', () => {
		const window = ganttWindow(ANCHOR, 'quarter');

		for (let i = 1; i < window.days.length; i++) {
			expect(dayDiff(window.days[i - 1] ?? '', window.days[i] ?? '')).toBe(1);
		}
	});

	test('a month containing the autumn DST change still has all its days', () => {
		const window = ganttWindow(new Date(2026, 9, 15), 'month'); // October 2026

		expect(window.days).toHaveLength(31);
		expect(window.days[24]).toBe('2026-10-25'); // the changeover day itself
	});

	test('wider zoom means narrower day columns', () => {
		const week = ganttWindow(ANCHOR, 'week').dayWidthPx;
		const month = ganttWindow(ANCHOR, 'month').dayWidthPx;
		const quarter = ganttWindow(ANCHOR, 'quarter').dayWidthPx;

		expect(week).toBeGreaterThan(month);
		expect(month).toBeGreaterThan(quarter);
		expect(quarter).toBeGreaterThan(0);
	});
});

describe('shiftAnchor', () => {
	test('week zoom moves by seven days either way', () => {
		expect(shiftAnchor(ANCHOR, 'week', 1).getDate()).toBe(18);
		expect(shiftAnchor(ANCHOR, 'week', -1).getDate()).toBe(4);
	});

	test('month zoom lands on the first of the neighboring month', () => {
		const next = shiftAnchor(ANCHOR, 'month', 1);
		const prev = shiftAnchor(ANCHOR, 'month', -1);

		expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 6, 1]);
		expect([prev.getFullYear(), prev.getMonth(), prev.getDate()]).toEqual([2026, 4, 1]);
	});

	test('month zoom does not overflow short months from a late anchor day', () => {
		const next = shiftAnchor(new Date(2026, 0, 31), 'month', 1);

		expect(ganttWindow(next, 'month').days[0]).toBe('2026-02-01');
	});

	test('quarter zoom lands in the neighboring quarter', () => {
		expect(ganttWindow(shiftAnchor(ANCHOR, 'quarter', 1), 'quarter').days[0]).toBe('2026-07-01');
		expect(ganttWindow(shiftAnchor(ANCHOR, 'quarter', -1), 'quarter').days[0]).toBe('2026-01-01');
	});

	test('quarter navigation crosses year boundaries', () => {
		const prev = shiftAnchor(new Date(2026, 1, 10), 'quarter', -1); // Q1 2026 → Q4 2025

		expect(ganttWindow(prev, 'quarter').days[0]).toBe('2025-10-01');
	});
});

describe('ganttRows', () => {
	test('excludes tasks without a due and with an unparseable due', () => {
		const rows = ganttRows([task('undated'), task('garbage', { due: 'not a date' })]);

		expect(rows).toEqual([]);
	});

	test('a due-only task is a one-day bar on its due day', () => {
		const rows = ganttRows([task('single', { due: '2026-06-12' })]);

		expect(rows).toEqual([
			{ task: expect.objectContaining({ title: 'single' }), startKey: '2026-06-12', endKey: '2026-06-12' },
		]);
	});

	test('a span uses the wall-clock days of start and due, times stripped', () => {
		const rows = ganttRows([task('span', { start: '2026-06-10T09:00', due: '2026-06-12T17:00' })]);

		expect(rows[0]).toMatchObject({ startKey: '2026-06-10', endKey: '2026-06-12' });
	});

	test('start after due clamps the bar to the due day', () => {
		const rows = ganttRows([task('typo', { start: '2026-06-20', due: '2026-06-12' })]);

		expect(rows[0]).toMatchObject({ startKey: '2026-06-12', endKey: '2026-06-12' });
	});

	test('an unparseable start clamps to the due day instead of invalidating the row', () => {
		const rows = ganttRows([task('odd', { start: 'garbage', due: '2026-06-12' })]);

		expect(rows[0]).toMatchObject({ startKey: '2026-06-12', endKey: '2026-06-12' });
	});

	test('rows sort by start day, then end day', () => {
		const rows = ganttRows([
			task('late-long', { start: '2026-06-10', due: '2026-06-15' }),
			task('late-short', { start: '2026-06-10', due: '2026-06-12' }),
			task('early', { due: '2026-06-09' }),
		]);

		expect(rows.map((r) => r.task.title)).toEqual(['early', 'late-short', 'late-long']);
	});

	test('rows with identical days fall back to task order (higher priority first)', () => {
		const rows = ganttRows([
			task('casual', { due: '2026-06-12' }),
			task('urgent', { due: '2026-06-12', priority: 'high' }),
		]);

		expect(rows.map((r) => r.task.title)).toEqual(['urgent', 'casual']);
	});

	test('keeps closed tasks (the view decides whether to show them)', () => {
		const rows = ganttRows([task('finished', { due: '2026-06-12', status: 'done' })]);

		expect(rows).toHaveLength(1);
	});
});

describe('ganttLanes', () => {
	test('lanes follow project order: status rank, then name', () => {
		const projects = [project('Zeta'), project('Held', { status: 'on-hold' }), project('Alpha')];

		const lanes = ganttLanes(projects, new Map());

		expect(lanes.map((l) => l.project.name)).toEqual(['Alpha', 'Zeta', 'Held']);
	});

	test('a project without tasks still gets an (empty) lane', () => {
		const lanes = ganttLanes([project('Alpha')], new Map());

		expect(lanes).toEqual([{ project: expect.objectContaining({ name: 'Alpha' }), rows: [] }]);
	});

	test('rows come from the matching project entry', () => {
		const tasks = new Map([['Alpha', [task('one', { due: '2026-06-12' })]]]);

		const lanes = ganttLanes([project('Alpha'), project('Beta')], tasks);

		expect(lanes[0]?.rows).toHaveLength(1);
		expect(lanes[1]?.rows).toEqual([]);
	});
});

describe('barGeometry', () => {
	const JUNE = ganttWindow(ANCHOR, 'month');
	const row = (startKey: string, endKey: string) => ({
		task: task('T'),
		startKey,
		endKey,
	});

	test('a bar fully inside the window maps to offset and span', () => {
		expect(barGeometry(row('2026-06-10', '2026-06-12'), JUNE)).toEqual({
			offset: 9,
			span: 3,
			clippedStart: false,
			clippedEnd: false,
		});
	});

	test('a one-day bar on the first day occupies the first column', () => {
		expect(barGeometry(row('2026-06-01', '2026-06-01'), JUNE)).toEqual({
			offset: 0,
			span: 1,
			clippedStart: false,
			clippedEnd: false,
		});
	});

	test('a bar starting before the window is clipped at the left edge', () => {
		expect(barGeometry(row('2026-05-28', '2026-06-02'), JUNE)).toEqual({
			offset: 0,
			span: 2,
			clippedStart: true,
			clippedEnd: false,
		});
	});

	test('a bar ending after the window is clipped at the right edge', () => {
		expect(barGeometry(row('2026-06-29', '2026-07-03'), JUNE)).toEqual({
			offset: 28,
			span: 2,
			clippedStart: false,
			clippedEnd: true,
		});
	});

	test('a bar covering the whole window is clipped on both edges', () => {
		expect(barGeometry(row('2026-05-01', '2026-07-31'), JUNE)).toEqual({
			offset: 0,
			span: 30,
			clippedStart: true,
			clippedEnd: true,
		});
	});

	test('bars fully outside the window yield null', () => {
		expect(barGeometry(row('2026-05-01', '2026-05-30'), JUNE)).toBeNull();
		expect(barGeometry(row('2026-07-01', '2026-07-10'), JUNE)).toBeNull();
	});
});

describe('markerOffset', () => {
	const JUNE = ganttWindow(ANCHOR, 'month');

	test('returns the column index of a day inside the window', () => {
		expect(markerOffset('2026-06-11', JUNE)).toBe(10);
		expect(markerOffset('2026-06-01', JUNE)).toBe(0);
	});

	test('returns null for days outside the window and for null keys', () => {
		expect(markerOffset('2026-05-31', JUNE)).toBeNull();
		expect(markerOffset('2026-07-01', JUNE)).toBeNull();
		expect(markerOffset(null, JUNE)).toBeNull();
	});
});

describe('daysFromPixels', () => {
	test('rounds a pixel delta to the nearest whole day', () => {
		expect(daysFromPixels(96, 32)).toBe(3);
		expect(daysFromPixels(49, 32)).toBe(2);
		expect(daysFromPixels(15, 32)).toBe(0);
		expect(daysFromPixels(-49, 32)).toBe(-2);
	});

	test('a non-positive day width yields no movement', () => {
		expect(daysFromPixels(100, 0)).toBe(0);
	});
});

describe('shiftDayKey / dayDiff', () => {
	test('shiftDayKey crosses month and year boundaries', () => {
		expect(shiftDayKey('2026-06-30', 1)).toBe('2026-07-01');
		expect(shiftDayKey('2026-01-01', -1)).toBe('2025-12-31');
	});

	test('shiftDayKey is immune to DST changeovers', () => {
		expect(shiftDayKey('2026-03-28', 2)).toBe('2026-03-30'); // spring change on Mar 29
		expect(shiftDayKey('2026-10-24', 2)).toBe('2026-10-26'); // autumn change on Oct 25
	});

	test('dayDiff is the signed day distance', () => {
		expect(dayDiff('2026-06-10', '2026-06-15')).toBe(5);
		expect(dayDiff('2026-06-15', '2026-06-10')).toBe(-5);
		expect(dayDiff('2026-06-10', '2026-06-10')).toBe(0);
	});
});

describe('shiftSpan', () => {
	test('moves start and due together, dates only', () => {
		expect(shiftSpan('2026-06-10', '2026-06-12', 3)).toEqual({
			start: '2026-06-13',
			due: '2026-06-15',
		});
	});

	test('preserves time suffixes on both ends', () => {
		expect(shiftSpan('2026-06-10T09:00', '2026-06-12T17:00', -2)).toEqual({
			start: '2026-06-08T09:00',
			due: '2026-06-10T17:00',
		});
	});

	test('a due-only task moves without growing a start', () => {
		expect(shiftSpan(undefined, '2026-06-12', 2)).toEqual({ start: undefined, due: '2026-06-14' });
	});

	test('zero delta changes nothing', () => {
		expect(shiftSpan('2026-06-10', '2026-06-12', 0)).toEqual({
			start: '2026-06-10',
			due: '2026-06-12',
		});
	});

	test('an unparseable due is left untouched', () => {
		expect(shiftSpan(undefined, 'not a date', 3)).toEqual({ start: undefined, due: 'not a date' });
	});

	test('crosses month boundaries', () => {
		expect(shiftSpan('2026-06-29', '2026-06-30', 2)).toEqual({
			start: '2026-07-01',
			due: '2026-07-02',
		});
	});
});

describe('resizeStart', () => {
	test('dragging the left edge out of a due-only task creates a span', () => {
		expect(resizeStart(undefined, '2026-06-15', -3)).toEqual({
			start: '2026-06-12',
			due: '2026-06-15',
		});
	});

	test('moves an existing start and keeps its time suffix', () => {
		expect(resizeStart('2026-06-10T09:00', '2026-06-15', 1)).toEqual({
			start: '2026-06-11T09:00',
			due: '2026-06-15',
		});
	});

	test('shrinking onto the due day collapses back to the due-only form', () => {
		expect(resizeStart('2026-06-10', '2026-06-15', 5)).toEqual({ due: '2026-06-15' });
	});

	test('overshooting past the due day clamps to the due-only form', () => {
		expect(resizeStart('2026-06-10', '2026-06-15', 99)).toEqual({ due: '2026-06-15' });
	});

	test('dragging right on a due-only task stays due-only', () => {
		expect(resizeStart(undefined, '2026-06-15', 2)).toEqual({ due: '2026-06-15' });
	});

	test('an unparseable due is left untouched', () => {
		expect(resizeStart('2026-06-10', 'not a date', -1)).toEqual({
			start: '2026-06-10',
			due: 'not a date',
		});
	});
});

describe('resizeEnd', () => {
	test('dragging the right edge extends the due day', () => {
		expect(resizeEnd(undefined, '2026-06-15', 3)).toEqual({ start: undefined, due: '2026-06-18' });
	});

	test('preserves the due time suffix', () => {
		expect(resizeEnd(undefined, '2026-06-15T17:00', 2)).toEqual({
			start: undefined,
			due: '2026-06-17T17:00',
		});
	});

	test('keeps the start when growing a span', () => {
		expect(resizeEnd('2026-06-10', '2026-06-15', 2)).toEqual({
			start: '2026-06-10',
			due: '2026-06-17',
		});
	});

	test('shrinking onto the start day collapses to the due-only form', () => {
		expect(resizeEnd('2026-06-10', '2026-06-15', -5)).toEqual({ due: '2026-06-10' });
	});

	test('overshooting past the start day clamps to the start day', () => {
		expect(resizeEnd('2026-06-10', '2026-06-15', -99)).toEqual({ due: '2026-06-10' });
	});

	test('a due-only task cannot shrink below its single day', () => {
		expect(resizeEnd(undefined, '2026-06-15', -4)).toEqual({ start: undefined, due: '2026-06-15' });
	});

	test('an unparseable due is left untouched', () => {
		expect(resizeEnd('2026-06-10', 'not a date', 2)).toEqual({
			start: '2026-06-10',
			due: 'not a date',
		});
	});
});
