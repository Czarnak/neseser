import { describe, expect, test } from 'vitest';
import { Task } from '../../src/core/models';
import { dayKey, addDays } from '../../src/core/calendar-data';
import {
	BURNDOWN_DAYS,
	BurndownPoint,
	burndownSeries,
	localDayOf,
	SparklineGeometry,
	sparklineGeometry,
} from '../../src/core/burndown-data';

const NOW = new Date(2026, 5, 12, 10, 0); // 2026-06-12 10:00 local

function task(title: string, overrides: Partial<Task> = {}): Task {
	return {
		path: `Tasks/${title}.md`,
		title,
		status: 'todo',
		priority: 'none',
		...overrides,
	};
}

function seriesValues(tasks: Task[], now = NOW, days?: number): number[] {
	return burndownSeries(tasks, now, days).map((p) => p.open);
}

// ─── burndownSeries ───────────────────────────────────────────────────────────

describe('burndownSeries', () => {
	test('default window produces 28 consecutive day keys ending today', () => {
		const points = burndownSeries([], NOW);
		expect(points).toHaveLength(28);
		points.forEach((p, i) => {
			expect(p.dayKey).toBe(dayKey(addDays(NOW, -(27 - i))));
		});
		expect(points[27]!.dayKey).toBe(dayKey(NOW));
	});

	test('days override controls window length', () => {
		const points = burndownSeries([], NOW, 7);
		expect(points).toHaveLength(7);
		expect(points[6]!.dayKey).toBe(dayKey(NOW));
	});

	test('BURNDOWN_DAYS constant equals 28', () => {
		expect(BURNDOWN_DAYS).toBe(28);
	});

	test('open task created before window is counted on every day', () => {
		const t = task('old-open', { created: '2026-05-01', status: 'todo' });
		const values = seriesValues([t]);
		expect(values).toHaveLength(28);
		expect(values.every((v) => v === 1)).toBe(true);
	});

	test('open task created mid-window steps from 0 to 1 at creation day', () => {
		// created 2026-06-05 → window starts 2026-05-15; days 0..20 are 0, days 21..27 are 1
		const createdKey = '2026-06-05';
		const t = task('mid-open', { created: createdKey, status: 'todo' });
		const points = burndownSeries([t], NOW);
		points.forEach((p) => {
			if (p.dayKey < createdKey) {
				expect(p.open).toBe(0);
			} else {
				expect(p.open).toBe(1);
			}
		});
	});

	test('open task created today appears only on the last point', () => {
		const todayKey = dayKey(NOW);
		const t = task('today-open', { created: todayKey, status: 'todo' });
		const points = burndownSeries([t], NOW);
		points.forEach((p) => {
			expect(p.open).toBe(p.dayKey === todayKey ? 1 : 0);
		});
	});

	test('done task completed 2026-06-10T12:00:00.000Z counted through 2026-06-09, 0 from completion day', () => {
		const completedAt = '2026-06-10T12:00:00.000Z';
		const completionLocalDay = localDayOf(completedAt)!;
		const t = task('done-task', {
			status: 'done',
			created: '2026-05-01',
			completedAt,
		});
		const points = burndownSeries([t], NOW);
		points.forEach((p) => {
			if (p.dayKey < completionLocalDay) {
				expect(p.open).toBe(1);
			} else {
				expect(p.open).toBe(0);
			}
		});
	});

	test('UTC→local boundary: T23:30Z drops on dayKey(new Date(Date.parse(ts)))', () => {
		const ts = '2026-06-10T23:30:00.000Z';
		const expectedDay = dayKey(new Date(Date.parse(ts)));
		const t = task('boundary', {
			status: 'done',
			created: '2026-05-01',
			completedAt: ts,
		});
		const points = burndownSeries([t], NOW);
		points.forEach((p) => {
			if (p.dayKey < expectedDay) {
				expect(p.open).toBe(1);
			} else {
				expect(p.open).toBe(0);
			}
		});
		// localDayOf must agree with the direct expression
		expect(localDayOf(ts)).toBe(expectedDay);
	});

	test('cancelled task is 0 on every day', () => {
		const t = task('cancelled', { created: '2026-05-01', status: 'cancelled' });
		const values = seriesValues([t]);
		expect(values.every((v) => v === 0)).toBe(true);
	});

	test('task with missing created is counted from window start', () => {
		const t = task('no-created', { status: 'todo' });
		const values = seriesValues([t]);
		expect(values.every((v) => v === 1)).toBe(true);
	});

	test('done task without completedAt is 0 always', () => {
		const t = task('done-no-ts', { status: 'done', created: '2026-05-01' });
		const values = seriesValues([t]);
		expect(values.every((v) => v === 0)).toBe(true);
	});

	test('done task with unparseable completedAt is 0 always', () => {
		const t = task('done-bad-ts', {
			status: 'done',
			created: '2026-05-01',
			completedAt: 'not-a-date',
		});
		const values = seriesValues([t]);
		expect(values.every((v) => v === 0)).toBe(true);
	});

	test('todo task with stray completedAt is still counted on every day since creation', () => {
		const createdKey = '2026-05-01';
		const t = task('todo-stray', {
			status: 'todo',
			created: createdKey,
			completedAt: '2026-06-01T12:00:00.000Z',
		});
		const points = burndownSeries([t], NOW);
		points.forEach((p) => {
			expect(p.open).toBe(1);
		});
	});

	test('in-progress task with stray completedAt is still counted on every day since creation', () => {
		const createdKey = '2026-05-01';
		const t = task('inprogress-stray', {
			status: 'in-progress',
			created: createdKey,
			completedAt: '2026-06-01T12:00:00.000Z',
		});
		const points = burndownSeries([t], NOW);
		points.forEach((p) => {
			expect(p.open).toBe(1);
		});
	});

	test('task created after today is 0 on every day', () => {
		const t = task('future', { created: '2026-07-01', status: 'todo' });
		const values = seriesValues([t]);
		expect(values.every((v) => v === 0)).toBe(true);
	});

	test('3-task mixed fixture sums correctly', () => {
		// open-forever: created 2026-05-01, todo → 1 on every day
		// created-mid: created 2026-06-05, todo → 0 before 06-05, 1 from 06-05
		// completed-mid: created 2026-05-01, done, completedAt 2026-06-05T12:00:00.000Z
		//   → localDayOf gives the local day of that timestamp
		const completedAt = '2026-06-05T12:00:00.000Z';
		const completionDay = localDayOf(completedAt)!;
		const tasks = [
			task('open-forever', { created: '2026-05-01', status: 'todo' }),
			task('created-mid', { created: '2026-06-05', status: 'todo' }),
			task('completed-mid', { created: '2026-05-01', status: 'done', completedAt }),
		];
		const points = burndownSeries(tasks, NOW);
		points.forEach((p) => {
			const openForever = 1;
			const createdMid = p.dayKey >= '2026-06-05' ? 1 : 0;
			const completedMid = p.dayKey < completionDay ? 1 : 0;
			expect(p.open).toBe(openForever + createdMid + completedMid);
		});
	});

	test('DST window stays N unique consecutive keys', () => {
		// Window over 2026-04-10 (around US DST spring-forward 2026-03-08)
		const dstNow = new Date(2026, 3, 10, 10, 0);
		const points = burndownSeries([], dstNow, 14);
		expect(points).toHaveLength(14);
		const keys = points.map((p) => p.dayKey);
		const unique = new Set(keys);
		expect(unique.size).toBe(14);
		// consecutive: each key is one calendar day after the previous
		// (compare via UTC midnight stamps to avoid DST ambiguity)
		for (let i = 1; i < keys.length; i++) {
			const prevMs = Date.parse(keys[i - 1] + 'T00:00:00Z');
			const currMs = Date.parse(keys[i] + 'T00:00:00Z');
			expect(currMs - prevMs).toBe(24 * 60 * 60 * 1000);
		}
	});
});

// ─── localDayOf ──────────────────────────────────────────────────────────────

describe('localDayOf', () => {
	test('returns local dayKey for a valid ISO UTC timestamp', () => {
		const ts = '2026-06-10T12:00:00.000Z';
		const result = localDayOf(ts);
		expect(result).toBe(dayKey(new Date(Date.parse(ts))));
	});

	test('returns null for an unparseable string', () => {
		expect(localDayOf('not-a-date')).toBeNull();
	});

	test('returns null for empty string', () => {
		expect(localDayOf('')).toBeNull();
	});

	test('does NOT return the bare UTC day prefix for a near-midnight UTC timestamp', () => {
		// T23:30Z could be next local day; localDayOf must NOT just slice the prefix
		const ts = '2026-06-10T23:30:00.000Z';
		const result = localDayOf(ts);
		// Must equal the local day interpretation
		expect(result).toBe(dayKey(new Date(Date.parse(ts))));
		// Must NOT blindly strip the date prefix (that would always be '2026-06-10')
		// The assertion is machine-independent — both sides use the same local clock
	});
});

// ─── sparklineGeometry ───────────────────────────────────────────────────────

describe('sparklineGeometry', () => {
	test('all-zero values produce flat line at y=height', () => {
		const { line, area } = sparklineGeometry([0, 0, 0], 120, 28);
		// All y values should equal height (28)
		const points = line.split(' ').map((p) => {
			const [, y] = p.split(',').map(Number);
			return y;
		});
		expect(points.every((y) => y === 28)).toBe(true);
	});

	test('n=1 produces a horizontal two-point line with no NaN', () => {
		const { line, area } = sparklineGeometry([5], 120, 28);
		expect(line).not.toContain('NaN');
		expect(area).not.toContain('NaN');
		const pts = line.split(' ');
		expect(pts).toHaveLength(2);
		const ys = pts.map((p) => Number(p.split(',')[1]));
		expect(ys[0]).toBe(ys[1]);
	});

	test('max value maps to y=0, zero maps to y=height', () => {
		const { line } = sparklineGeometry([10, 0], 120, 28);
		const pts = line.split(' ').map((p) => p.split(',').map(Number));
		// First point (value 10 = max) → y=0
		expect(pts[0]![1]!).toBe(0);
		// Second point (value 0) → y=28
		expect(pts[1]![1]!).toBe(28);
	});

	test('area polygon starts and ends at baseline corners', () => {
		const { area } = sparklineGeometry([5, 10, 3], 120, 28);
		const pts = area.split(' ');
		// Last two points must be width,height and 0,height
		const last = pts[pts.length - 1];
		const secondLast = pts[pts.length - 2];
		expect(secondLast).toBe('120,28');
		expect(last).toBe('0,28');
	});

	test('no NaN substring in line or area for any standard input', () => {
		const inputs: number[][] = [
			[],
			[0],
			[1],
			[0, 0, 0],
			[1, 2, 3],
			[10, 0, 5],
			Array.from({ length: 28 }, (_, i) => i),
		];
		for (const vals of inputs) {
			const { line, area } = sparklineGeometry(vals, 120, 28);
			expect(line).not.toContain('NaN');
			expect(area).not.toContain('NaN');
		}
	});

	test('coordinates are rounded to 2 decimal places', () => {
		const { line } = sparklineGeometry([1, 2, 3], 100, 30);
		const coords = line.split(' ').flatMap((p) => p.split(','));
		coords.forEach((c) => {
			const parts = c.split('.');
			if (parts.length > 1) {
				expect(parts[1]!.length).toBeLessThanOrEqual(2);
			}
		});
	});

	test('empty values array produces no NaN', () => {
		const { line, area } = sparklineGeometry([], 120, 28);
		expect(line).not.toContain('NaN');
		expect(area).not.toContain('NaN');
	});
});
