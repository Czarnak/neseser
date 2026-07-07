import { Project, Task } from './models';
import { addDays, dayKey, mondayIndex, rescheduleDue } from './calendar-data';
import { compareProjects, compareTasks, dueDateKey } from './view-data';

/**
 * Pure timeline math and row shaping for the Gantt view. All dates are
 * wall-clock (vault-local) day keys; pixel math stays here so the React
 * layer only renders. Closed tasks are kept — the view filters them.
 */

export type GanttZoom = 'week' | 'month' | 'quarter';

export interface GanttWindow {
	/** Contiguous wall-clock day keys for every visible column. */
	days: string[];
	dayWidthPx: number;
}

export interface HeaderSegment {
	/** Stable React key: the first day key of the run. */
	key: string;
	/** Caption shown for the run (month name or week label). */
	label: string;
	/** Day columns the run covers, ≥ 1. */
	span: number;
}

export interface GanttRow {
	task: Task;
	/** First day of the bar: start ?? due, clamped to ≤ endKey. */
	startKey: string;
	/** Last day of the bar: the due day. */
	endKey: string;
}

export interface GanttLane {
	project: Project;
	rows: GanttRow[];
}

export interface BarGeometry {
	/** 0-based column index of the bar's first visible day. */
	offset: number;
	/** Visible columns the bar covers, ≥ 1. */
	span: number;
	clippedStart: boolean;
	clippedEnd: boolean;
}

export interface MarkerGeometry {
	/** 0-based column index of the marker's day. */
	offset: number;
	/** Marker grid width; kept at one day so absolute positioning centers in the day cell. */
	span: number;
}

export interface SpanDates {
	start?: string;
	due: string;
}

const DAY_MS = 86_400_000;
const DAY_WIDTH_PX: Record<GanttZoom, number> = { week: 96, month: 36, quarter: 14 };
const MONTHS_PER_ZOOM: Record<Exclude<GanttZoom, 'week'>, number> = { month: 1, quarter: 3 };

function dayKeyMs(key: string): number {
	return Date.parse(`${key}T00:00:00Z`);
}

/** Calendar-day arithmetic on day keys; UTC-based, so DST can't shift it. */
export function shiftDayKey(key: string, days: number): string {
	const ms = dayKeyMs(key);
	if (Number.isNaN(ms)) return key;
	return new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

/** Signed day distance between two day keys; NaN when either is invalid. */
export function dayDiff(from: string, to: string): number {
	return Math.round((dayKeyMs(to) - dayKeyMs(from)) / DAY_MS);
}

function windowStart(anchor: Date, zoom: GanttZoom): Date {
	if (zoom === 'week') return addDays(anchor, -mondayIndex(anchor));
	if (zoom === 'month') return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
	return new Date(anchor.getFullYear(), Math.floor(anchor.getMonth() / 3) * 3, 1);
}

function windowLength(first: Date, zoom: GanttZoom): number {
	if (zoom === 'week') return 7;
	const end = new Date(first.getFullYear(), first.getMonth() + MONTHS_PER_ZOOM[zoom], 1);
	return Math.round((end.getTime() - first.getTime()) / DAY_MS);
}

/** The calendar-aligned window (Monday week / month / quarter) around the anchor. */
export function ganttWindow(anchor: Date, zoom: GanttZoom): GanttWindow {
	const first = windowStart(anchor, zoom);
	const days: string[] = [];
	for (let i = 0; i < windowLength(first, zoom); i++) {
		days.push(dayKey(addDays(first, i)));
	}
	return { days, dayWidthPx: DAY_WIDTH_PX[zoom] };
}

/** Prev/next navigation; month and quarter land on a first-of-month to avoid overflow. */
export function shiftAnchor(anchor: Date, zoom: GanttZoom, direction: 1 | -1): Date {
	if (zoom === 'week') return addDays(anchor, 7 * direction);
	return new Date(anchor.getFullYear(), anchor.getMonth() + MONTHS_PER_ZOOM[zoom] * direction, 1);
}

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
] as const;

/** ISO 8601 week number (1–53) for a day key; Thursday-of-week rule, UTC-based. */
export function isoWeekNumber(key: string): number {
	const ms = dayKeyMs(key);
	if (Number.isNaN(ms)) return 0;
	const dow = (new Date(ms).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
	const thursday = ms + (3 - dow) * DAY_MS;
	const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
	return Math.floor((thursday - yearStart) / DAY_MS / 7) + 1;
}

/** The Monday day key of the week containing the given day; identity for week grouping. */
function mondayKey(key: string): string {
	const ms = dayKeyMs(key);
	if (Number.isNaN(ms)) return key;
	return shiftDayKey(key, -((new Date(ms).getUTCDay() + 6) % 7));
}

/** Collapse a contiguous day run into labelled header segments by a grouping identity. */
function buildSegments(
	days: string[],
	identityOf: (key: string) => string,
	labelOf: (key: string) => string,
): HeaderSegment[] {
	const segments: HeaderSegment[] = [];
	let currentId: string | null = null;
	for (const day of days) {
		const id = identityOf(day);
		const last = segments[segments.length - 1];
		if (id === currentId && last) {
			segments[segments.length - 1] = { ...last, span: last.span + 1 };
		} else {
			currentId = id;
			segments.push({ key: day, label: labelOf(day), span: 1 });
		}
	}
	return segments;
}

/** Header segments for the month tier: one run per calendar month, labelled by name. */
export function monthSegments(days: string[]): HeaderSegment[] {
	return buildSegments(
		days,
		(key) => key.slice(0, 7),
		(key) => MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? key.slice(0, 7),
	);
}

/** Header segments for the week tier: one run per ISO week, labelled `W<number>`. */
export function weekSegments(days: string[]): HeaderSegment[] {
	return buildSegments(days, mondayKey, (key) => `W${isoWeekNumber(key)}`);
}

function clampStartKey(start: string | undefined, endKey: string): string {
	if (start === undefined) return endKey;
	const key = dueDateKey(start);
	return key === null || key > endKey ? endKey : key;
}

/** Bar rows for one project's tasks: due required, sorted by start then end day. */
export function ganttRows(tasks: Task[]): GanttRow[] {
	const rows: GanttRow[] = [];
	for (const task of tasks) {
		if (task.due === undefined) continue;
		const endKey = dueDateKey(task.due);
		if (endKey === null) continue;
		rows.push({ task, startKey: clampStartKey(task.start, endKey), endKey });
	}
	return rows.sort(
		(a, b) =>
			a.startKey.localeCompare(b.startKey) ||
			a.endKey.localeCompare(b.endKey) ||
			compareTasks(a.task, b.task),
	);
}

/** One swimlane per project (even empty ones), in dashboard project order. */
export function ganttLanes(
	projects: Project[],
	tasksByProject: ReadonlyMap<string, Task[]>,
): GanttLane[] {
	return [...projects].sort(compareProjects).map((project) => ({
		project,
		rows: ganttRows(tasksByProject.get(project.name) ?? []),
	}));
}

/** Column offset + span of a row's bar inside the window; null when fully outside. */
export function barGeometry(row: GanttRow, window: GanttWindow): BarGeometry | null {
	const first = window.days[0];
	if (first === undefined) return null;
	const lastIndex = window.days.length - 1;
	const startIndex = dayDiff(first, row.startKey);
	const endIndex = dayDiff(first, row.endKey);
	if (Number.isNaN(startIndex) || Number.isNaN(endIndex)) return null;
	if (endIndex < 0 || startIndex > lastIndex) return null;
	const offset = Math.max(0, startIndex);
	return {
		offset,
		span: Math.min(lastIndex, endIndex) - offset + 1,
		clippedStart: startIndex < 0,
		clippedEnd: endIndex > lastIndex,
	};
}

/** Column index of a day marker (today, project deadline); null when outside the window. */
export function markerOffset(key: string | null, window: GanttWindow): number | null {
	const first = window.days[0];
	if (key === null || first === undefined) return null;
	const index = dayDiff(first, key);
	return index >= 0 && index < window.days.length ? index : null;
}

/** Grid geometry of a day marker; null when outside the window. */
export function markerGeometry(key: string | null, window: GanttWindow): MarkerGeometry | null {
	const offset = markerOffset(key, window);
	return offset === null ? null : { offset, span: 1 };
}

/** Drag delta in whole days for a horizontal pixel delta. */
export function daysFromPixels(dx: number, dayWidthPx: number): number {
	return dayWidthPx > 0 ? Math.round(dx / dayWidthPx) : 0;
}

/** Move the whole bar: start and due shift together, time suffixes preserved. */
export function shiftSpan(start: string | undefined, due: string, dayDelta: number): SpanDates {
	const dueKey = dueDateKey(due);
	if (dueKey === null || dayDelta === 0) return { start, due };
	const moved = (value: string, key: string) => rescheduleDue(value, shiftDayKey(key, dayDelta));
	return {
		start: start === undefined ? undefined : moved(start, dueDateKey(start) ?? dueKey),
		due: moved(due, dueKey),
	};
}

/**
 * Drag the bar's left edge. Landing on (or past) the due day collapses the
 * task back to the due-only form — a one-day bar has no `start`.
 */
export function resizeStart(start: string | undefined, due: string, dayDelta: number): SpanDates {
	const dueKey = dueDateKey(due);
	if (dueKey === null) return { start, due };
	const baseKey = start === undefined ? dueKey : (dueDateKey(start) ?? dueKey);
	const newKey = shiftDayKey(baseKey, dayDelta);
	if (newKey >= dueKey) return { due };
	return { start: start === undefined ? newKey : rescheduleDue(start, newKey), due };
}

/**
 * Drag the bar's right edge; the due day never moves before the start day.
 * Landing on the start day collapses the task back to the due-only form.
 */
export function resizeEnd(start: string | undefined, due: string, dayDelta: number): SpanDates {
	const dueKey = dueDateKey(due);
	if (dueKey === null) return { start, due };
	const startKey = start === undefined ? dueKey : (dueDateKey(start) ?? dueKey);
	const newKey = shiftDayKey(dueKey, dayDelta);
	const clampedKey = newKey < startKey ? startKey : newKey;
	const due2 = rescheduleDue(due, clampedKey);
	if (start !== undefined && clampedKey === startKey) return { due: due2 };
	return { start, due: due2 };
}

/**
 * Translate a move-bar drag event into the new span dates for the task.
 * Returns null when the task has no due date (no-op in the view).
 */
export function computeMoveResult(
	taskStart: string | undefined,
	taskDue: string | undefined,
	dayDelta: number,
): SpanDates | null {
	if (!taskDue) return null;
	return shiftSpan(taskStart, taskDue, dayDelta);
}

/**
 * Translate a resize-edge drag event into the new span dates for the task.
 * Returns null when the task has no due date (no-op in the view).
 */
export function computeResizeResult(
	taskStart: string | undefined,
	taskDue: string | undefined,
	dayDelta: number,
	edge: 'start' | 'end',
): SpanDates | null {
	if (!taskDue) return null;
	return edge === 'start'
		? resizeStart(taskStart, taskDue, dayDelta)
		: resizeEnd(taskStart, taskDue, dayDelta);
}
