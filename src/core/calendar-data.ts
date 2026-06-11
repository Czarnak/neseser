import { Task } from './models';
import { compareTasks, dueDateKey } from './view-data';

/**
 * Pure date-grid math and task grouping for the calendar view.
 * Weeks start on Monday; all dates are wall-clock (vault-local) days.
 */

export interface CalendarDay {
	key: string;
	dayOfMonth: number;
	inCurrentMonth: boolean;
	isToday: boolean;
}

const WEEK_LENGTH = 7;

function dayKey(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** 0 for Monday … 6 for Sunday. */
function mondayIndex(date: Date): number {
	return (date.getDay() + 6) % 7;
}

function makeDay(date: Date, month0: number | null, today: Date): CalendarDay {
	return {
		key: dayKey(date),
		dayOfMonth: date.getDate(),
		inCurrentMonth: month0 === null || date.getMonth() === month0,
		isToday: dayKey(date) === dayKey(today),
	};
}

/** Full weeks covering the month; leading/trailing cells come from neighbors. */
export function monthGrid(year: number, month0: number, today: Date): CalendarDay[][] {
	const first = new Date(year, month0, 1);
	const weeks: CalendarDay[][] = [];
	let cursor = addDays(first, -mondayIndex(first));
	do {
		const week: CalendarDay[] = [];
		for (let i = 0; i < WEEK_LENGTH; i++) {
			week.push(makeDay(cursor, month0, today));
			cursor = addDays(cursor, 1);
		}
		weeks.push(week);
	} while (cursor.getMonth() === month0);
	return weeks;
}

/** The Monday-to-Sunday week containing the anchor date. */
export function weekRow(anchor: Date, today: Date): CalendarDay[] {
	const monday = addDays(anchor, -mondayIndex(anchor));
	const days: CalendarDay[] = [];
	for (let i = 0; i < WEEK_LENGTH; i++) {
		days.push(makeDay(addDays(monday, i), null, today));
	}
	return days;
}

/** Tasks keyed by their due day, each day's list sorted by due then priority. */
export function tasksByDueDay(tasks: Task[]): Map<string, Task[]> {
	const byDay = new Map<string, Task[]>();
	for (const task of [...tasks].sort(compareTasks)) {
		if (task.due === undefined) continue;
		const key = dueDateKey(task.due);
		if (key === null) continue;
		const list = byDay.get(key);
		if (list) {
			list.push(task);
		} else {
			byDay.set(key, [task]);
		}
	}
	return byDay;
}

/** New due value for a task dropped on a day; keeps a time suffix when present. */
export function rescheduleDue(oldDue: string | undefined, newDayKey: string): string {
	const trimmed = oldDue?.trim() ?? '';
	if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return newDayKey + trimmed.slice(10);
	return newDayKey;
}
