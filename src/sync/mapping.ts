import { Priority, Task } from '../core/models';
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
	dueDate?: string;
	isAllDay?: boolean;
	timeZone?: string;
	reminders?: string[];
	items?: TickTickChecklistItem[];
}

export interface MappingOptions {
	projectId: string;
	timeZone: string;
}

const PRIORITY_MAP: Record<Priority, number> = { none: 0, low: 1, medium: 3, high: 5 };
const ALL_DAY_REMINDER = 'TRIGGER:P0DT9H0M0S';
const ON_TIME_REMINDER = 'TRIGGER:PT0S';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function priorityToTickTick(priority: Priority): number {
	return PRIORITY_MAP[priority];
}

/** "2026-06-15T07:30:00+0000" — TickTick's UTC timestamp format. */
function toApiDateTime(date: Date): string {
	return `${date.toISOString().slice(0, 19)}+0000`;
}

function isClosed(task: Task): boolean {
	return task.status === 'done' || task.status === 'cancelled';
}

function flattenItems(children: TaskTreeNode[]): TickTickChecklistItem[] {
	const items: TickTickChecklistItem[] = [];
	for (const child of children) {
		items.push({ title: child.task.title, status: isClosed(child.task) ? 1 : 0 });
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
	};

	if (task.due) {
		const isAllDay = DATE_ONLY.test(task.due);
		// Date-only strings get a local-midnight Date; timed strings parse as local wall time.
		const due = new Date(isAllDay ? `${task.due}T00:00:00` : task.due);
		draft.dueDate = toApiDateTime(due);
		draft.isAllDay = isAllDay;
		draft.timeZone = opts.timeZone;
		draft.reminders = [isAllDay ? ALL_DAY_REMINDER : ON_TIME_REMINDER];
	}

	if (children.length > 0) {
		draft.items = flattenItems(children);
	}

	return draft;
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
