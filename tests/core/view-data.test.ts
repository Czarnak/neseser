import { describe, expect, test } from 'vitest';
import { Project, TASK_STATUSES, Task } from '../../src/core/models';
import {
	DeadlineEntry,
	buildKanbanColumns,
	compareTasks,
	taskProgress,
	upcomingDeadlines,
} from '../../src/core/view-data';

function task(title: string, overrides: Partial<Task> = {}): Task {
	return {
		path: `Projects/Alpha/Tasks/${title}.md`,
		title,
		status: 'todo',
		priority: 'none',
		...overrides,
	};
}

function project(name: string, overrides: Partial<Project> = {}): Project {
	return {
		path: `Projects/${name}/${name}.md`,
		name,
		status: 'active',
		...overrides,
	};
}

const NOW = new Date(2026, 5, 11); // 2026-06-11 local time

describe('compareTasks', () => {
	test('sorts by due date ascending with undated tasks last', () => {
		const dated = task('dated', { due: '2026-06-12' });
		const later = task('later', { due: '2026-07-01' });
		const undated = task('undated');

		const sorted = [undated, later, dated].sort(compareTasks);

		expect(sorted.map((t) => t.title)).toEqual(['dated', 'later', 'undated']);
	});

	test('breaks due-date ties by priority, high first', () => {
		const low = task('low', { due: '2026-06-12', priority: 'low' });
		const high = task('high', { due: '2026-06-12', priority: 'high' });
		const none = task('none', { due: '2026-06-12' });

		const sorted = [low, none, high].sort(compareTasks);

		expect(sorted.map((t) => t.title)).toEqual(['high', 'low', 'none']);
	});
});

describe('buildKanbanColumns', () => {
	test('returns one column per task status in canonical order', () => {
		const columns = buildKanbanColumns([]);

		expect(columns.map((c) => c.status)).toEqual([...TASK_STATUSES]);
		expect(columns.every((c) => c.tasks.length === 0)).toBe(true);
	});

	test('groups tasks into their status column sorted by due then priority', () => {
		const tasks = [
			task('b-todo', { due: '2026-06-20' }),
			task('doing', { status: 'in-progress' }),
			task('a-todo', { due: '2026-06-12' }),
			task('finished', { status: 'done' }),
		];

		const columns = buildKanbanColumns(tasks);
		const byStatus = new Map(columns.map((c) => [c.status, c.tasks.map((t) => t.title)]));

		expect(byStatus.get('todo')).toEqual(['a-todo', 'b-todo']);
		expect(byStatus.get('in-progress')).toEqual(['doing']);
		expect(byStatus.get('done')).toEqual(['finished']);
		expect(byStatus.get('cancelled')).toEqual([]);
	});
});

describe('taskProgress', () => {
	test('counts done tasks against a total that excludes cancelled tasks', () => {
		const tasks = [
			task('done-1', { status: 'done' }),
			task('open-1'),
			task('open-2', { status: 'in-progress' }),
			task('dropped', { status: 'cancelled' }),
		];

		expect(taskProgress(tasks)).toEqual({ done: 1, total: 3 });
	});

	test('returns zero progress for no tasks', () => {
		expect(taskProgress([])).toEqual({ done: 0, total: 0 });
	});
});

describe('upcomingDeadlines', () => {
	test('includes open tasks due within the horizon sorted by date', () => {
		const tasks = [
			task('later', { due: '2026-06-18' }),
			task('sooner', { due: '2026-06-12' }),
		];

		const entries = upcomingDeadlines([], tasks, NOW, 14);

		expect(entries.map((e) => e.title)).toEqual(['sooner', 'later']);
		expect(entries.every((e) => e.kind === 'task' && !e.overdue)).toBe(true);
	});

	test('marks tasks due before today as overdue', () => {
		const entries = upcomingDeadlines([], [task('late', { due: '2026-06-01' })], NOW, 14);

		expect(entries).toHaveLength(1);
		expect(entries[0]?.overdue).toBe(true);
	});

	test('treats a task due today as not overdue', () => {
		const entries = upcomingDeadlines([], [task('today', { due: '2026-06-11' })], NOW, 14);

		expect(entries[0]?.overdue).toBe(false);
	});

	test('excludes closed tasks, undated tasks, and tasks beyond the horizon', () => {
		const tasks = [
			task('finished', { status: 'done', due: '2026-06-12' }),
			task('dropped', { status: 'cancelled', due: '2026-06-12' }),
			task('undated'),
			task('far-future', { due: '2026-08-01' }),
		];

		expect(upcomingDeadlines([], tasks, NOW, 14)).toEqual([]);
	});

	test('includes deadlines of active and on-hold projects only', () => {
		const projects = [
			project('Alpha', { deadline: '2026-06-15' }),
			project('Beta', { status: 'on-hold', deadline: '2026-06-13' }),
			project('Shipped', { status: 'done', deadline: '2026-06-14' }),
			project('Old', { status: 'archived', deadline: '2026-06-14' }),
		];

		const entries = upcomingDeadlines(projects, [], NOW, 14);

		expect(entries.map((e) => [e.kind, e.title])).toEqual([
			['project', 'Beta'],
			['project', 'Alpha'],
		]);
	});

	test('uses the wall-clock date of datetime due values', () => {
		const entries = upcomingDeadlines([], [task('timed', { due: '2026-06-11T09:30:00' })], NOW, 14);

		expect(entries).toHaveLength(1);
		expect(entries[0]?.overdue).toBe(false);
	});

	test('parses non-ISO due formats that the frontmatter validator accepts', () => {
		const entries = upcomingDeadlines([], [task('prose-date', { due: 'June 12, 2026' })], NOW, 14);

		expect(entries).toHaveLength(1);
		expect(entries[0]?.overdue).toBe(false);
	});

	test('skips tasks whose due date cannot be parsed at all', () => {
		const entries = upcomingDeadlines([], [task('garbage', { due: 'not a date' })], NOW, 14);

		expect(entries).toEqual([]);
	});

	test('exposes path and due string so the UI can open and render entries', () => {
		const entries = upcomingDeadlines([], [task('sooner', { due: '2026-06-12' })], NOW, 14);

		const expected: Partial<DeadlineEntry> = {
			kind: 'task',
			title: 'sooner',
			path: 'Projects/Alpha/Tasks/sooner.md',
			due: '2026-06-12',
		};
		expect(entries[0]).toMatchObject(expected);
	});
});
