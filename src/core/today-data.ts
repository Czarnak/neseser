import { Task, isTaskClosed } from './models';
import { dayKey } from './calendar-data';
import { compareTasks, dueDateKey } from './view-data';
import { dayDiff } from './gantt-data';

export interface TodayGroups {
	overdue: Task[];
	today: Task[];
}

/**
 * Partitions open tasks into overdue (due before today) and today (due today).
 * Tasks with no due date, unparseable due, or closed status are excluded.
 * Overdue: sorted oldest-first (compareTasks gives due-asc).
 * Today: sorted by compareTasks (due asc = time-suffix order, then priority).
 */
export function todayGroups(tasks: Task[], now: Date): TodayGroups {
	const todayKey = dayKey(now);
	const overdue: Task[] = [];
	const today: Task[] = [];

	for (const task of tasks) {
		if (isTaskClosed(task) || task.due === undefined) continue;
		const key = dueDateKey(task.due);
		if (key === null) continue;
		if (key < todayKey) {
			overdue.push(task);
		} else if (key === todayKey) {
			today.push(task);
		}
	}

	overdue.sort(compareTasks);
	today.sort(compareTasks);

	return { overdue, today };
}

/**
 * Number of calendar days between the due date and today.
 * Returns 0 when due is today, positive when overdue, null when unparseable.
 */
export function overdueDays(due: string, now: Date): number | null {
	const dueKey = dueDateKey(due);
	if (dueKey === null) return null;
	const todayKey = dayKey(now);
	return dayDiff(dueKey, todayKey);
}
