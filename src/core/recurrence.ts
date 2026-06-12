import { Task } from './models';
import { rescheduleDue } from './calendar-data';
import { dayDiff, shiftDayKey } from './gantt-data';
import { dueDateKey } from './view-data';

/**
 * Pure math for local-only recurring tasks: where the next instance lands
 * and what carries over. Regeneration IO lives in ProjectManager.
 */

export interface NextOccurrence {
	due: string;
	start?: string;
}

const TRAILING_DATE = /\s\d{4}-\d{2}-\d{2}$/;

/** Strips exactly ONE trailing ' YYYY-MM-DD' so regenerated titles never stack dates. */
export function stripDateSuffix(title: string): string {
	return title.replace(TRAILING_DATE, '');
}

export function nextInstanceTitle(title: string, newDueKey: string): string {
	return `${stripDateSuffix(title)} ${newDueKey}`;
}

/**
 * Next due/start after completion: advance by the interval, then roll forward
 * until the candidate is not in the past. Start keeps its distance to due.
 */
export function nextOccurrence(
	task: Pick<Task, 'due' | 'start' | 'recurrence'>,
	todayKey: string,
): NextOccurrence | null {
	if (!task.due) return null;
	const dueKey = dueDateKey(task.due);
	if (dueKey === null) return null;

	const interval = task.recurrence === 'daily' ? 1 : 7;
	let candidate = shiftDayKey(dueKey, interval);
	while (candidate < todayKey) candidate = shiftDayKey(candidate, interval);

	const result: NextOccurrence = { due: rescheduleDue(task.due, candidate) };

	if (task.start) {
		const startKey = dueDateKey(task.start);
		if (startKey !== null) {
			const delta = dayDiff(dueKey, candidate);
			result.start = rescheduleDue(task.start, shiftDayKey(startKey, delta));
		}
	}
	return result;
}

const LEADING_FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** Content after the closing frontmatter fence; '' if nothing follows; unchanged without leading fm. */
export function noteBody(content: string): string {
	if (!content.startsWith('---')) return content;
	return content.replace(LEADING_FRONTMATTER, '');
}
