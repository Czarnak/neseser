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
	 * Always sent equal to dueDate: app-edited tasks carry a startDate, and a
	 * dueDate-only update leaves it behind — the task becomes a multi-day span
	 * the app still shows on the old date. (Genuine remote spans collapse to
	 * the due day on push; v1 models a single date.)
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
		const isAllDay = DATE_ONLY.test(task.due);
		// Date-only strings get a local-midnight Date; timed strings parse as local wall time.
		const due = new Date(isAllDay ? `${task.due}T00:00:00` : task.due);
		draft.startDate = toApiDateTime(due);
		draft.dueDate = draft.startDate;
		draft.isAllDay = isAllDay;
		draft.timeZone = opts.timeZone;
		draft.reminders = [isAllDay ? ALL_DAY_REMINDER : ON_TIME_REMINDER];
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
		due: task.due ?? null,
		priority: task.priority,
		items: flattenItems(children),
	});
}
