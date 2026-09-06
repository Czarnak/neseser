export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'cancelled';
export type ProjectStatus = 'active' | 'on-hold' | 'done' | 'archived';
export type Priority = 'none' | 'low' | 'medium' | 'high';
export type Recurrence = 'daily' | 'weekly';

export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in-progress', 'done', 'cancelled'];
export const PROJECT_STATUSES: readonly ProjectStatus[] = ['active', 'on-hold', 'done', 'archived'];
export const PRIORITIES: readonly Priority[] = ['none', 'low', 'medium', 'high'];
/** Task and project statuses combined, each listed once; 'done' belongs to both. */
export const ALL_STATUSES: readonly string[] = [
	...TASK_STATUSES,
	...PROJECT_STATUSES.filter((status) => !(TASK_STATUSES as readonly string[]).includes(status)),
];

/**
 * The statuses a note may legitimately hold. Obsidian assigns property widgets by key
 * name across the whole vault, so one `status` dropdown serves task and project notes
 * alike and has to narrow the list itself — offering `active` on a task note would let
 * the user write a value parseTask rejects, dropping the task out of every view.
 *
 * The note's `type` decides it. Failing that, a current value belonging to exactly one
 * set still identifies the note; `done` sits in both and settles nothing, so the union
 * is the last resort rather than the default.
 */
export function statusOptionsFor(noteType: unknown, currentStatus: unknown): readonly string[] {
	if (noteType === 'task') return TASK_STATUSES;
	if (noteType === 'project') return PROJECT_STATUSES;

	const inTask = typeof currentStatus === 'string' && (TASK_STATUSES as readonly string[]).includes(currentStatus);
	const inProject =
		typeof currentStatus === 'string' && (PROJECT_STATUSES as readonly string[]).includes(currentStatus);
	if (inTask && !inProject) return TASK_STATUSES;
	if (inProject && !inTask) return PROJECT_STATUSES;
	return ALL_STATUSES;
}

export const RECURRENCES: readonly Recurrence[] = ['daily', 'weekly'];

export interface Task {
	path: string;
	title: string;
	status: TaskStatus;
	priority: Priority;
	/** Span start for the Gantt view; tasks without it are single-day (due only). */
	start?: string;
	due?: string;
	parent?: string;
	/** Local-only repeat rule; never synced to TickTick. */
	recurrence?: Recurrence;
	reminder?: string;
	created?: string;
	completedAt?: string;
	ticktickId?: string;
	ticktickEtag?: string;
}

export interface Project {
	path: string;
	name: string;
	status: ProjectStatus;
	/** Free-form, user-defined grouping; absent when the project has none. */
	category?: string;
	deadline?: string;
	ticktickProjectId?: string;
}

export type Frontmatter = Record<string, unknown>;

export type TaskParseResult =
	| { kind: 'task'; task: Task }
	| { kind: 'not-task' }
	| { kind: 'invalid'; path: string; reason: string };

export type ProjectParseResult =
	| { kind: 'project'; project: Project }
	| { kind: 'not-project' }
	| { kind: 'invalid'; path: string; reason: string };

export function isTaskClosed(task: Pick<Task, 'status'>): boolean {
	return task.status === 'done' || task.status === 'cancelled';
}

export function titleFromPath(path: string): string {
	const base = path.split('/').pop() ?? path;
	return base.replace(/\.md$/, '');
}

export function parseWikilink(value: unknown): string | null {
	if (typeof value !== 'string' || value.length === 0) return null;
	const match = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(value.trim());
	if (match?.[1]) return match[1].trim();
	return value.trim();
}

function optionalString(fm: Frontmatter, key: string): string | undefined {
	const value = fm[key];
	if (value === null || value === undefined) return undefined;
	return String(value);
}

function parseEnum<T extends string>(
	fm: Frontmatter,
	key: string,
	allowed: readonly T[],
	fallback: T,
): { value: T } | { error: string } {
	const raw = fm[key];
	if (raw === null || raw === undefined) return { value: fallback };
	if (typeof raw === 'string' && (allowed as readonly string[]).includes(raw)) {
		return { value: raw as T };
	}
	return { error: `invalid ${key}: ${String(raw)} (allowed: ${allowed.join(', ')})` };
}

/** Like parseEnum, but the key is genuinely optional: absence means undefined, not a fallback. */
function parseOptionalEnum<T extends string>(
	fm: Frontmatter,
	key: string,
	allowed: readonly T[],
): { value: T | undefined } | { error: string } {
	const raw = fm[key];
	if (raw === null || raw === undefined) return { value: undefined };
	if (typeof raw === 'string' && (allowed as readonly string[]).includes(raw)) {
		return { value: raw as T };
	}
	return { error: `invalid ${key}: ${String(raw)} (allowed: ${allowed.join(', ')})` };
}

function parseDate(fm: Frontmatter, key: string): { value: string | undefined } | { error: string } {
	const raw = optionalString(fm, key);
	if (raw === undefined) return { value: undefined };
	// Clearing a date in Obsidian's Properties panel writes an empty string rather
	// than removing the key; that means "unset", not "unparseable".
	if (raw.trim() === '') return { value: undefined };
	if (Number.isNaN(Date.parse(raw))) {
		return { error: `unparseable ${key} date: ${raw}` };
	}
	return { value: raw };
}

export function parseTask(path: string, fm: Frontmatter | undefined): TaskParseResult {
	if (!fm || fm['type'] !== 'task') return { kind: 'not-task' };

	const status = parseEnum(fm, 'status', TASK_STATUSES, 'todo');
	if ('error' in status) return { kind: 'invalid', path, reason: status.error };

	const priority = parseEnum(fm, 'priority', PRIORITIES, 'none');
	if ('error' in priority) return { kind: 'invalid', path, reason: priority.error };

	const recurrence = parseOptionalEnum(fm, 'recurrence', RECURRENCES);
	if ('error' in recurrence) return { kind: 'invalid', path, reason: recurrence.error };

	const start = parseDate(fm, 'start');
	if ('error' in start) return { kind: 'invalid', path, reason: start.error };

	const due = parseDate(fm, 'due');
	if ('error' in due) return { kind: 'invalid', path, reason: due.error };

	const parentRaw = fm['parent'];
	const parent =
		parentRaw === null || parentRaw === undefined ? undefined : (parseWikilink(parentRaw) ?? undefined);

	return {
		kind: 'task',
		task: {
			path,
			title: titleFromPath(path),
			status: status.value,
			priority: priority.value,
			start: start.value,
			due: due.value,
			parent,
			recurrence: recurrence.value,
			reminder: optionalString(fm, 'reminder'),
			created: optionalString(fm, 'created'),
			completedAt: optionalString(fm, 'completed-at'),
			ticktickId: optionalString(fm, 'ticktick-id'),
			ticktickEtag: optionalString(fm, 'ticktick-etag'),
		},
	};
}

export function parseProject(path: string, fm: Frontmatter | undefined): ProjectParseResult {
	if (!fm || fm['type'] !== 'project') return { kind: 'not-project' };

	const status = parseEnum(fm, 'status', PROJECT_STATUSES, 'active');
	if ('error' in status) return { kind: 'invalid', path, reason: status.error };

	const deadline = parseDate(fm, 'deadline');
	if ('error' in deadline) return { kind: 'invalid', path, reason: deadline.error };

	const categoryRaw = optionalString(fm, 'category')?.trim();
	const category = categoryRaw ? categoryRaw : undefined;

	return {
		kind: 'project',
		project: {
			path,
			name: titleFromPath(path),
			status: status.value,
			category,
			deadline: deadline.value,
			ticktickProjectId: optionalString(fm, 'ticktick-project-id'),
		},
	};
}

export function taskToFrontmatter(task: Task): Frontmatter {
	const fm: Frontmatter = {
		type: 'task',
		status: task.status,
		priority: task.priority,
	};
	if (task.start !== undefined) fm['start'] = task.start;
	if (task.due !== undefined) fm['due'] = task.due;
	if (task.parent !== undefined) fm['parent'] = `[[${task.parent}]]`;
	if (task.recurrence !== undefined) fm['recurrence'] = task.recurrence;
	if (task.reminder !== undefined) fm['reminder'] = task.reminder;
	if (task.created !== undefined) fm['created'] = task.created;
	if (task.completedAt !== undefined) fm['completed-at'] = task.completedAt;
	if (task.ticktickId !== undefined) fm['ticktick-id'] = task.ticktickId;
	if (task.ticktickEtag !== undefined) fm['ticktick-etag'] = task.ticktickEtag;
	return fm;
}
