import { Project, TASK_STATUSES, Task, TaskStatus, isTaskClosed } from './models';

/**
 * Pure data shaping for the dashboard and kanban views. Callers pick the task
 * scope (all tasks vs one project's) via TaskIndex; nothing here touches the vault.
 */

export interface KanbanColumn {
	status: TaskStatus;
	tasks: Task[];
}

export interface TaskProgress {
	done: number;
	/** Open + done tasks; cancelled tasks are not counted as work. */
	total: number;
}

export interface DeadlineEntry {
	kind: 'task' | 'project';
	title: string;
	path: string;
	due: string;
	overdue: boolean;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };
const DAY_MS = 86_400_000;

export function compareTasks(a: Task, b: Task): number {
	const dueCompare = (a.due ?? '9999').localeCompare(b.due ?? '9999');
	if (dueCompare !== 0) return dueCompare;
	return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
}

export function buildKanbanColumns(tasks: Task[]): KanbanColumn[] {
	return TASK_STATUSES.map((status) => ({
		status,
		tasks: tasks.filter((t) => t.status === status).sort(compareTasks),
	}));
}

export function taskProgress(tasks: Task[]): TaskProgress {
	const counted = tasks.filter((t) => t.status !== 'cancelled');
	return {
		done: counted.filter((t) => t.status === 'done').length,
		total: counted.length,
	};
}

/** Day index of a date string's wall-clock date, or null when unparseable. */
function dueDayNumber(value: string): number | null {
	const literal = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
	if (literal) {
		return Date.UTC(Number(literal[1]), Number(literal[2]) - 1, Number(literal[3])) / DAY_MS;
	}
	const ms = Date.parse(value);
	if (Number.isNaN(ms)) return null;
	const date = new Date(ms);
	return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

export function upcomingDeadlines(
	projects: Project[],
	tasks: Task[],
	now: Date,
	horizonDays = 14,
): DeadlineEntry[] {
	const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
	const lastDay = today + horizonDays;
	const dated: Array<DeadlineEntry & { day: number }> = [];

	for (const task of tasks) {
		if (task.due === undefined || isTaskClosed(task)) continue;
		const day = dueDayNumber(task.due);
		if (day === null || day > lastDay) continue;
		dated.push({ kind: 'task', title: task.title, path: task.path, due: task.due, day, overdue: day < today });
	}

	for (const project of projects) {
		if (project.deadline === undefined) continue;
		if (project.status !== 'active' && project.status !== 'on-hold') continue;
		const day = dueDayNumber(project.deadline);
		if (day === null || day > lastDay) continue;
		dated.push({
			kind: 'project',
			title: project.name,
			path: project.path,
			due: project.deadline,
			day,
			overdue: day < today,
		});
	}

	return dated
		.sort((a, b) => a.day - b.day || a.title.localeCompare(b.title))
		.map(({ day: _day, ...entry }) => entry);
}
