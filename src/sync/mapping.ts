import { Priority, Task, isTaskClosed } from '../core/models';
import type { TaskTreeNode } from '../core/task-index';

/**
 * TickTick Open API task shapes. Field names per developer.ticktick.com docs
 * (training-data sourced; verified against the live API during Phase 2 testing).
 */
export interface TickTickChecklistItem {
	id?: string;
	title: string;
	/** 0 = normal, 1 = completed */
	status: 0 | 1;
}

export interface TickTickTaskDraft {
	id?: string;
	projectId: string;
	title: string;
	/** 0 none, 1 low, 3 medium, 5 high */
	priority: number;
	/** 0 = normal, 2 = completed; sent on update so a reopen sticks remotely */
	status?: number;
	/**
	 * Always sent when dueDate is: the span start when the task has one, else
	 * equal to dueDate — app-edited tasks carry a startDate, and a dueDate-only
	 * update leaves it behind, turning the task into a multi-day span the app
	 * still shows on the old date. All-day spans use an exclusive dueDate (the
	 * midnight after the last day, live-probe verified); startDate === dueDate
	 * is the single-day form the app itself uses.
	 */
	startDate?: string;
	dueDate?: string;
	isAllDay?: boolean;
	timeZone?: string;
	reminders?: string[];
	items?: TickTickChecklistItem[];
}

/** Remote fields the pull path reads; structural subset of the client's TickTickTask. */
export interface RemoteTaskFields {
	title: string;
	status?: number;
	startDate?: string;
	dueDate?: string;
	priority?: number;
	items?: TickTickChecklistItem[];
}

export interface MappingOptions {
	projectId: string;
	timeZone: string;
}

const PRIORITY_MAP: Record<Priority, number> = { none: 0, low: 1, medium: 3, high: 5 };
const PRIORITY_REVERSE: Record<number, Priority> = { 0: 'none', 1: 'low', 3: 'medium', 5: 'high' };
const ALL_DAY_REMINDER = 'TRIGGER:P0DT9H0M0S';
const ON_TIME_REMINDER = 'TRIGGER:PT0S';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function priorityToTickTick(priority: Priority): number {
	return PRIORITY_MAP[priority];
}

export function priorityFromTickTick(level: number | undefined): Priority {
	return PRIORITY_REVERSE[level ?? 0] ?? 'none';
}

/** "2026-06-15" / "2026-06-15T09:30" wall-clock strings in the given zone. */
function wallClock(date: Date, timeZone: string): { date: string; time: string } {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(date);
	const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return {
		date: `${byType['year']}-${byType['month']}-${byType['day']}`,
		time: `${byType['hour']}:${byType['minute']}`,
	};
}

/** Parses TickTick's "+0000"-suffixed timestamps to epoch ms; NaN when unparseable. */
export function parseApiDateMs(value: string): number {
	// "+0000" → "+00:00" so the string parses everywhere.
	return Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
}

/** TickTick UTC dueDate → local frontmatter `due` (date-only when all-day). */
export function remoteDueToLocal(
	dueDate: string,
	isAllDay: boolean,
	timeZone: string,
): string | undefined {
	const ms = parseApiDateMs(dueDate);
	if (Number.isNaN(ms)) return undefined;
	const { date, time } = wallClock(new Date(ms), timeZone);
	return isAllDay ? date : `${date}T${time}`;
}

/** "2026-06-15T07:30:00+0000" — TickTick's UTC timestamp format. */
function toApiDateTime(date: Date): string {
	return `${date.toISOString().slice(0, 19)}+0000`;
}

/** Calendar-day arithmetic on "YYYY-MM-DD" strings; never touches zones, so DST can't shift it. */
function shiftDay(dateOnly: string, days: number): string {
	const [year, month, day] = dateOnly.split('-').map(Number);
	return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days)).toISOString().slice(0, 10);
}

/** Local frontmatter date → Date: date-only at local midnight, timed as local wall time. */
function parseLocal(value: string): Date {
	return new Date(DATE_ONLY.test(value) ? `${value}T00:00:00` : value);
}

interface ApiDates {
	startDate: string;
	dueDate: string;
	isAllDay: boolean;
}

/**
 * Local start/due → API instants. All-day spans get an exclusive dueDate
 * (midnight after the due day); start ≥ due (including the typo case) falls
 * back to the single-day form, per the design decisions.
 */
function pushDates(start: string | undefined, due: string): ApiDates {
	const dueObj = parseLocal(due);
	const dueAllDay = DATE_ONLY.test(due);
	const single: ApiDates = {
		startDate: toApiDateTime(dueObj),
		dueDate: toApiDateTime(dueObj),
		isAllDay: dueAllDay,
	};
	if (start === undefined) return single;

	const startObj = parseLocal(start);
	if (!(startObj.getTime() < dueObj.getTime())) return single;

	const isAllDay = dueAllDay && DATE_ONLY.test(start);
	return {
		startDate: toApiDateTime(startObj),
		dueDate: isAllDay ? toApiDateTime(parseLocal(shiftDay(due, 1))) : toApiDateTime(dueObj),
		isAllDay,
	};
}

export interface LocalDates {
	start?: string;
	due?: string;
}

/**
 * Remote startDate/dueDate → local frontmatter dates. All-day spans carry an
 * exclusive dueDate (live-probe verified), so local `due` is the day before
 * it; startDate === dueDate is the single-day form and yields no `start`.
 */
export function remoteDatesToLocal(
	startDate: string | undefined,
	dueDate: string | undefined,
	isAllDay: boolean,
	timeZone: string,
): LocalDates {
	if (dueDate === undefined) return {};
	const due = remoteDueToLocal(dueDate, isAllDay, timeZone);
	if (due === undefined) return {};
	if (startDate === undefined) return { due };

	const startMs = parseApiDateMs(startDate);
	if (Number.isNaN(startMs) || startMs >= parseApiDateMs(dueDate)) return { due };

	const start = remoteDueToLocal(startDate, isAllDay, timeZone);
	if (start === undefined) return { due };
	if (!isAllDay) return { start, due };

	const lastDay = shiftDay(due, -1);
	return start < lastDay ? { start, due: lastDay } : { due: lastDay };
}

function flattenItems(children: TaskTreeNode[]): TickTickChecklistItem[] {
	const items: TickTickChecklistItem[] = [];
	for (const child of children) {
		items.push({ title: child.task.title, status: isTaskClosed(child.task) ? 1 : 0 });
		items.push(...flattenItems(child.children));
	}
	return items;
}

export function taskToTickTick(
	task: Task,
	children: TaskTreeNode[],
	opts: MappingOptions,
): TickTickTaskDraft {
	const draft: TickTickTaskDraft = {
		projectId: opts.projectId,
		title: task.title,
		priority: priorityToTickTick(task.priority),
		status: isTaskClosed(task) ? 2 : 0,
	};

	if (task.due) {
		const dates = pushDates(task.start, task.due);
		draft.startDate = dates.startDate;
		draft.dueDate = dates.dueDate;
		draft.isAllDay = dates.isAllDay;
		draft.timeZone = opts.timeZone;
		draft.reminders = [dates.isAllDay ? ALL_DAY_REMINDER : ON_TIME_REMINDER];
	}

	if (children.length > 0) {
		draft.items = flattenItems(children);
	}

	return draft;
}

/**
 * Epoch ms when parseable so the "+0000" draft rendering and the server's
 * canonical ".000+0000" echo compare equal; raw string otherwise.
 */
function fingerprintDue(dueDate: string | undefined): number | string | null {
	if (dueDate === undefined) return null;
	const ms = parseApiDateMs(dueDate);
	return Number.isNaN(ms) ? dueDate : ms;
}

/** Stable digest of the remote fields we sync; detects remote edits between runs. */
export function remoteFingerprint(remote: RemoteTaskFields): string {
	return JSON.stringify({
		title: remote.title,
		closed: remote.status === 2,
		start: fingerprintDue(remote.startDate),
		due: fingerprintDue(remote.dueDate),
		priority: remote.priority ?? 0,
		items: (remote.items ?? []).map((item) => ({ title: item.title, status: item.status })),
	});
}

/** Stable digest of everything push cares about; compared against the last-sync snapshot. */
export function pushFingerprint(task: Task, children: TaskTreeNode[]): string {
	return JSON.stringify({
		title: task.title,
		status: task.status,
		start: task.start ?? null,
		due: task.due ?? null,
		priority: task.priority,
		items: flattenItems(children),
	});
}
