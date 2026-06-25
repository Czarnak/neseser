import { describe, expect, test } from 'vitest';
import type { Project } from '../../src/core/models';
import {
	CategoryDef,
	UNCATEGORIZED,
	allowedProjectNames,
	availableCategories,
	categoryOf,
	colorForCategory,
	filterProjectsByCategory,
	filterTasksByCategory,
	matchesActive,
} from '../../src/core/category-data';

function project(name: string, category?: string): Project {
	return { path: `Projects/${name}/${name}.md`, name, status: 'active', category };
}

const REGISTRY: CategoryDef[] = [
	{ name: 'Work', color: '#111111' },
	{ name: 'University', color: '#222222' },
];

describe('categoryOf', () => {
	test('returns the trimmed category', () => {
		expect(categoryOf(project('A', '  Work  '))).toBe('Work');
	});

	test('falls back to Uncategorized when absent or blank', () => {
		expect(categoryOf(project('A'))).toBe(UNCATEGORIZED);
		expect(categoryOf(project('B', '   '))).toBe(UNCATEGORIZED);
	});
});

describe('colorForCategory', () => {
	test('uses the registry color when the category is registered', () => {
		expect(colorForCategory('Work', REGISTRY)).toBe('#111111');
	});

	test('returns a neutral grey for Uncategorized', () => {
		expect(colorForCategory(UNCATEGORIZED, REGISTRY)).toBe('#8a8a8a');
	});

	test('returns a stable fallback color for unregistered names', () => {
		const first = colorForCategory('Hobby', REGISTRY);
		const second = colorForCategory('Hobby', REGISTRY);
		expect(first).toBe(second);
		expect(first).toMatch(/^#[0-9a-f]{6}$/);
	});
});

describe('availableCategories', () => {
	test('lists registry entries in order, even with no projects', () => {
		const options = availableCategories(REGISTRY, []);
		expect(options.map((o) => o.name)).toEqual(['Work', 'University']);
		expect(options[0]?.color).toBe('#111111');
	});

	test('appends observed-but-unregistered categories, sorted', () => {
		const projects = [project('A', 'Research'), project('B', 'Admin')];
		const options = availableCategories(REGISTRY, projects);
		expect(options.map((o) => o.name)).toEqual(['Work', 'University', 'Admin', 'Research']);
	});

	test('does not duplicate a category that is both registered and observed', () => {
		const options = availableCategories(REGISTRY, [project('A', 'Work')]);
		expect(options.map((o) => o.name)).toEqual(['Work', 'University']);
	});

	test('appends Uncategorized last when some project lacks a category', () => {
		const options = availableCategories(REGISTRY, [project('A'), project('B', 'Work')]);
		expect(options.map((o) => o.name)).toEqual(['Work', 'University', UNCATEGORIZED]);
	});

	test('omits Uncategorized when every project has a category', () => {
		const options = availableCategories(REGISTRY, [project('A', 'Work')]);
		expect(options.map((o) => o.name)).not.toContain(UNCATEGORIZED);
	});

	test('skips blank registry names', () => {
		const options = availableCategories([{ name: '  ', color: '#000' }, ...REGISTRY], []);
		expect(options.map((o) => o.name)).toEqual(['Work', 'University']);
	});

	test('falls back to observed values when the registry is empty', () => {
		const options = availableCategories([], [project('A', 'Solo')]);
		expect(options.map((o) => o.name)).toEqual(['Solo']);
	});
});

describe('matchesActive', () => {
	test('admits everything when active is null', () => {
		expect(matchesActive('Work', null)).toBe(true);
		expect(matchesActive(UNCATEGORIZED, null)).toBe(true);
	});

	test('admits only the exact category otherwise', () => {
		expect(matchesActive('Work', 'Work')).toBe(true);
		expect(matchesActive('University', 'Work')).toBe(false);
	});
});

describe('filterProjectsByCategory', () => {
	const projects = [project('A', 'Work'), project('B', 'University'), project('C')];

	test('returns all projects when no filter is active', () => {
		expect(filterProjectsByCategory(projects, null)).toHaveLength(3);
	});

	test('keeps only projects in the active category', () => {
		expect(filterProjectsByCategory(projects, 'Work').map((p) => p.name)).toEqual(['A']);
	});

	test('matches uncategorized projects under the Uncategorized filter', () => {
		expect(filterProjectsByCategory(projects, UNCATEGORIZED).map((p) => p.name)).toEqual(['C']);
	});
});

describe('allowedProjectNames', () => {
	const projects = [project('A', 'Work'), project('B', 'Work'), project('C', 'University')];

	test('returns null when no filter is active', () => {
		expect(allowedProjectNames(projects, null)).toBeNull();
	});

	test('returns the set of project names in the active category', () => {
		expect(allowedProjectNames(projects, 'Work')).toEqual(new Set(['A', 'B']));
	});
});

describe('filterTasksByCategory', () => {
	const tasks = [
		{ path: 'Projects/A/Tasks/one.md' },
		{ path: 'Projects/B/Tasks/two.md' },
		{ path: 'Loose/note.md' },
	];
	const projectNameForPath = (path: string): string | null => {
		const match = /^Projects\/([^/]+)\//.exec(path);
		return match?.[1] ?? null;
	};

	test('returns all tasks when allowed is null', () => {
		expect(filterTasksByCategory(tasks, null, projectNameForPath)).toHaveLength(3);
	});

	test('keeps tasks whose project is allowed', () => {
		const kept = filterTasksByCategory(tasks, new Set(['A']), projectNameForPath);
		expect(kept.map((t) => t.path)).toEqual(['Projects/A/Tasks/one.md']);
	});

	test('drops tasks that resolve to no project', () => {
		const kept = filterTasksByCategory(tasks, new Set(['A', 'B']), projectNameForPath);
		expect(kept.map((t) => t.path)).not.toContain('Loose/note.md');
	});
});
