/**
 * Pure burndown-chart data helpers for the dashboard sparklines.
 *
 * Counting approximations (documented):
 *   - cancelled tasks are never counted.
 *   - todo / in-progress tasks are counted for every day ≥ createdKey;
 *     a stray completedAt on these statuses is ignored.
 *   - done tasks are counted for createdKey ≤ day < localDayOf(completedAt);
 *     when completedAt is missing or unparseable the task is never counted.
 *   - missing or unparseable created → counted from the window start.
 *   - deleted tasks vanish from history (they are simply absent from the array).
 *   - created is a UTC day stamp; evening creations may shift one calendar day.
 *
 * Day-axis formula: dayKey(addDays(now, -(days - 1 - i))) for index i.
 * All comparisons are string day-key comparisons (DST-proof).
 * createdKey is derived via dueDateKey(task.created) (bare-date passthrough).
 * localDayOf uses Date.parse → dayKey(new Date(ms)) — never dueDateKey.
 */

import { Task } from './models';
import { dayKey, addDays } from './calendar-data';
import { dueDateKey } from './view-data';

export const BURNDOWN_DAYS = 28;

export interface BurndownPoint {
	dayKey: string;
	open: number;
}

export interface SparklineGeometry {
	line: string;
	area: string;
}

/**
 * Convert an ISO timestamp string to the local wall-clock day key.
 * Uses Date.parse → new Date(ms) → dayKey so that the local timezone
 * governs day attribution (e.g. T23:30Z may land on the next local day).
 * Returns null when the string is empty or unparseable.
 */
export function localDayOf(timestamp: string): string | null {
	if (!timestamp) return null;
	const ms = Date.parse(timestamp);
	if (Number.isNaN(ms)) return null;
	return dayKey(new Date(ms));
}

/**
 * Build a 28-day (or `days`-day) open-task burndown series ending on `now`.
 * Each point carries the count of tasks that were open on that day.
 */
export function burndownSeries(tasks: Task[], now: Date, days = BURNDOWN_DAYS): BurndownPoint[] {
	const windowStart = dayKey(addDays(now, -(days - 1)));
	const todayKey = dayKey(now);

	const axis: string[] = [];
	for (let i = 0; i < days; i++) {
		axis.push(dayKey(addDays(now, -(days - 1 - i))));
	}

	return axis.map((dk) => {
		let open = 0;
		for (const t of tasks) {
			if (t.status === 'cancelled') continue;

			// Resolve the creation day (bare-date passthrough via dueDateKey)
			const createdKey: string = t.created ? (dueDateKey(t.created) ?? windowStart) : windowStart;

			// Task not yet created on this day
			if (dk < createdKey) continue;

			// Task created after today → never shown
			if (createdKey > todayKey) continue;

			if (t.status === 'done') {
				// done without completedAt or with unparseable completedAt → never counted
				if (!t.completedAt) continue;
				const completionDay = localDayOf(t.completedAt);
				if (completionDay === null) continue;
				// counted for days strictly before the completion day
				if (dk >= completionDay) continue;
			}
			// todo / in-progress: stray completedAt is ignored; always counted

			open++;
		}
		return { dayKey: dk, open };
	});
}

/**
 * Convert an array of open-task counts into SVG polyline/polygon point strings.
 * Width and height are the SVG viewport dimensions.
 *
 * Geometry rules:
 *   - max = Math.max(...values, 1)  (prevents division by zero)
 *   - x: i / (n - 1) * width  (n=1 → two-point horizontal segment at x=0 and x=width)
 *   - y: height - (v / max) * height
 *   - coordinates rounded to 2 decimal places
 *   - area polygon appends width,height then 0,height to close the baseline
 */
export function sparklineGeometry(values: number[], width: number, height: number): SparklineGeometry {
	if (values.length === 0) {
		return { line: '', area: '' };
	}

	const max = Math.max(...values, 1);
	const n = values.length;

	const pts = values.map((v, i) => {
		const x = n === 1 ? 0 : (i / (n - 1)) * width;
		const y = height - (v / max) * height;
		return `${round2(x)},${round2(y)}`;
	});

	// n=1: emit a two-point horizontal segment
	const firstPt = pts[0] ?? '0,0';
	const linePts = n === 1 ? [firstPt, `${round2(width)},${firstPt.split(',')[1] ?? '0'}`] : pts;

	const line = linePts.join(' ');
	const area = [...linePts, `${width},${height}`, `0,${height}`].join(' ');

	return { line, area };
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
