import { describe, expect, test } from 'vitest';
import {
	parseTask,
	parseProject,
	parseWikilink,
	taskToFrontmatter,
	titleFromPath,
} from '../../src/core/models';

describe('parseTask', () => {
	test('parses minimal task frontmatter with defaults', () => {
		const result = parseTask('Projects/Alpha/Tasks/Build parser.md', { type: 'task' });

		expect(result.kind).toBe('task');
		if (result.kind !== 'task') return;
		expect(result.task).toMatchObject({
			path: 'Projects/Alpha/Tasks/Build parser.md',
			title: 'Build parser',
			status: 'todo',
			priority: 'none',
		});
	});

	test('parses full task frontmatter', () => {
		const result = parseTask('Projects/Alpha/Tasks/Write tests.md', {
			type: 'task',
			status: 'in-progress',
			due: '2026-06-15',
			priority: 'high',
			parent: '[[Build parser]]',
			reminder: '2026-06-15T09:00',
			created: '2026-06-10',
			'completed-at': null,
			'ticktick-id': 'tt-123',
			'ticktick-etag': 'etag-1',
		});

		expect(result.kind).toBe('task');
		if (result.kind !== 'task') return;
		expect(result.task).toMatchObject({
			title: 'Write tests',
			status: 'in-progress',
			due: '2026-06-15',
			priority: 'high',
			parent: 'Build parser',
			reminder: '2026-06-15T09:00',
			created: '2026-06-10',
			ticktickId: 'tt-123',
			ticktickEtag: 'etag-1',
		});
		expect(result.task.completedAt).toBeUndefined();
	});

	test('returns not-task when frontmatter is missing', () => {
		expect(parseTask('Projects/Alpha/Notes.md', undefined).kind).toBe('not-task');
	});

	test('returns not-task when type is not task', () => {
		expect(parseTask('Projects/Alpha/Alpha.md', { type: 'project' }).kind).toBe('not-task');
	});

	test('returns invalid for unknown status value', () => {
		const result = parseTask('Projects/Alpha/Tasks/Bad.md', { type: 'task', status: 'doing' });

		expect(result.kind).toBe('invalid');
		if (result.kind !== 'invalid') return;
		expect(result.reason).toContain('status');
	});

	test('returns invalid for unparseable due date', () => {
		const result = parseTask('Projects/Alpha/Tasks/Bad.md', { type: 'task', due: 'next tuesday' });

		expect(result.kind).toBe('invalid');
		if (result.kind !== 'invalid') return;
		expect(result.reason).toContain('due');
	});

	test('returns invalid for unknown priority value', () => {
		const result = parseTask('Projects/Alpha/Tasks/Bad.md', { type: 'task', priority: 'urgent' });

		expect(result.kind).toBe('invalid');
	});

	test('parses start date field', () => {
		const result = parseTask('Projects/Alpha/Tasks/Span.md', {
			type: 'task',
			start: '2026-06-12',
			due: '2026-06-15',
		});

		expect(result.kind).toBe('task');
		if (result.kind !== 'task') return;
		expect(result.task.start).toBe('2026-06-12');
	});

	test('returns invalid for unparseable start date', () => {
		const result = parseTask('Projects/Alpha/Tasks/Bad.md', { type: 'task', start: 'someday' });

		expect(result.kind).toBe('invalid');
		if (result.kind !== 'invalid') return;
		expect(result.reason).toContain('start');
	});

	test('parses daily recurrence', () => {
		const result = parseTask('Projects/Alpha/Tasks/Water plants.md', {
			type: 'task',
			recurrence: 'daily',
		});

		expect(result.kind).toBe('task');
		if (result.kind !== 'task') return;
		expect(result.task.recurrence).toBe('daily');
	});

	test('parses weekly recurrence', () => {
		const result = parseTask('Projects/Alpha/Tasks/Review.md', {
			type: 'task',
			recurrence: 'weekly',
		});

		expect(result.kind).toBe('task');
		if (result.kind !== 'task') return;
		expect(result.task.recurrence).toBe('weekly');
	});

	test('absent recurrence parses as undefined', () => {
		const result = parseTask('Projects/Alpha/Tasks/T.md', { type: 'task' });

		expect(result.kind).toBe('task');
		if (result.kind !== 'task') return;
		expect(result.task.recurrence).toBeUndefined();
	});

	test('returns invalid for unknown recurrence value', () => {
		const result = parseTask('Projects/Alpha/Tasks/Bad.md', {
			type: 'task',
			recurrence: 'monthly',
		});

		expect(result.kind).toBe('invalid');
		if (result.kind !== 'invalid') return;
		expect(result.reason).toContain('recurrence');
		expect(result.reason).toContain('daily, weekly');
	});
});

describe('parseProject', () => {
	test('parses minimal project frontmatter with defaults', () => {
		const result = parseProject('Projects/Alpha/Alpha.md', { type: 'project' });

		expect(result.kind).toBe('project');
		if (result.kind !== 'project') return;
		expect(result.project).toMatchObject({
			path: 'Projects/Alpha/Alpha.md',
			name: 'Alpha',
			status: 'active',
		});
	});

	test('parses full project frontmatter', () => {
		const result = parseProject('Projects/Alpha/Alpha.md', {
			type: 'project',
			status: 'on-hold',
			category: 'Work',
			deadline: '2026-12-31',
			'ticktick-project-id': 'ttp-9',
		});

		expect(result.kind).toBe('project');
		if (result.kind !== 'project') return;
		expect(result.project).toMatchObject({
			status: 'on-hold',
			category: 'Work',
			deadline: '2026-12-31',
			ticktickProjectId: 'ttp-9',
		});
	});

	test('trims the category and treats blank as absent', () => {
		const trimmed = parseProject('Projects/Alpha/Alpha.md', { type: 'project', category: '  Research  ' });
		expect(trimmed.kind === 'project' && trimmed.project.category).toBe('Research');

		const blank = parseProject('Projects/Alpha/Alpha.md', { type: 'project', category: '   ' });
		expect(blank.kind === 'project' && blank.project.category).toBeUndefined();
	});

	test('leaves category undefined when the key is absent', () => {
		const result = parseProject('Projects/Alpha/Alpha.md', { type: 'project' });
		expect(result.kind === 'project' && result.project.category).toBeUndefined();
	});

	test('returns invalid for unknown project status', () => {
		const result = parseProject('Projects/Alpha/Alpha.md', { type: 'project', status: 'paused' });

		expect(result.kind).toBe('invalid');
	});

	test('returns not-project for task frontmatter', () => {
		expect(parseProject('Projects/Alpha/Tasks/T.md', { type: 'task' }).kind).toBe('not-project');
	});
});

describe('parseWikilink', () => {
	test('extracts target from plain wikilink', () => {
		expect(parseWikilink('[[Build parser]]')).toBe('Build parser');
	});

	test('extracts target from aliased wikilink', () => {
		expect(parseWikilink('[[Build parser|the parser one]]')).toBe('Build parser');
	});

	test('passes through bare string', () => {
		expect(parseWikilink('Build parser')).toBe('Build parser');
	});

	test('returns null for empty or non-string values', () => {
		expect(parseWikilink('')).toBeNull();
		expect(parseWikilink(undefined)).toBeNull();
		expect(parseWikilink(42)).toBeNull();
	});
});

describe('taskToFrontmatter', () => {
	test('round-trips through parseTask', () => {
		const fm = taskToFrontmatter({
			path: 'Projects/Alpha/Tasks/Ship it.md',
			title: 'Ship it',
			status: 'done',
			priority: 'medium',
			due: '2026-07-01',
			parent: 'Build parser',
			completedAt: '2026-06-09T18:00',
		});

		const result = parseTask('Projects/Alpha/Tasks/Ship it.md', fm);
		expect(result.kind).toBe('task');
		if (result.kind !== 'task') return;
		expect(result.task).toMatchObject({
			status: 'done',
			priority: 'medium',
			due: '2026-07-01',
			parent: 'Build parser',
			completedAt: '2026-06-09T18:00',
		});
	});

	test('omits absent optional fields instead of writing null', () => {
		const fm = taskToFrontmatter({
			path: 'Projects/Alpha/Tasks/T.md',
			title: 'T',
			status: 'todo',
			priority: 'none',
		});

		expect(fm.type).toBe('task');
		expect('due' in fm).toBe(false);
		expect('start' in fm).toBe(false);
		expect('parent' in fm).toBe(false);
		expect('ticktick-id' in fm).toBe(false);
	});

	test('round-trips start through parseTask', () => {
		const fm = taskToFrontmatter({
			path: 'Projects/Alpha/Tasks/Span.md',
			title: 'Span',
			status: 'todo',
			priority: 'none',
			start: '2026-06-12',
			due: '2026-06-15',
		});

		const result = parseTask('Projects/Alpha/Tasks/Span.md', fm);
		expect(result.kind).toBe('task');
		if (result.kind !== 'task') return;
		expect(result.task.start).toBe('2026-06-12');
	});

	test('round-trips recurrence through parseTask', () => {
		const fm = taskToFrontmatter({
			path: 'Projects/Alpha/Tasks/Water plants.md',
			title: 'Water plants',
			status: 'todo',
			priority: 'none',
			recurrence: 'weekly',
		});

		expect(fm['recurrence']).toBe('weekly');
		const result = parseTask('Projects/Alpha/Tasks/Water plants.md', fm);
		expect(result.kind).toBe('task');
		if (result.kind !== 'task') return;
		expect(result.task.recurrence).toBe('weekly');
	});

	test('omits recurrence key when unset', () => {
		const fm = taskToFrontmatter({
			path: 'Projects/Alpha/Tasks/T.md',
			title: 'T',
			status: 'todo',
			priority: 'none',
		});

		expect('recurrence' in fm).toBe(false);
	});
});

describe('titleFromPath', () => {
	test('strips directories and extension', () => {
		expect(titleFromPath('Projects/Alpha/Tasks/Build parser.md')).toBe('Build parser');
	});
});
