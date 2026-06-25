import type { Project } from './models';

/** A category as configured in settings: a display name and a chip color. */
export interface CategoryDef {
	name: string;
	color: string;
}

/**
 * A category offered in the filter bar (registry entries + values found in notes).
 * Structurally a {@link CategoryDef}; aliased so the resolved-for-display intent is
 * named at call sites without duplicating the shape.
 */
export type CategoryOption = CategoryDef;

/** Bucket for projects that declare no category. */
export const UNCATEGORIZED = 'Uncategorized';

const UNCATEGORIZED_COLOR = '#8a8a8a';

/** Distinct hues for categories that carry no registry color (observed-only values). */
const FALLBACK_PALETTE = [
	'#4f9cf9',
	'#22c55e',
	'#f59e0b',
	'#a855f7',
	'#ef4444',
	'#14b8a6',
	'#ec4899',
	'#84cc16',
];

/** The project's category, or the Uncategorized sentinel when it has none. */
export function categoryOf(project: Pick<Project, 'category'>): string {
	const trimmed = project.category?.trim();
	return trimmed ? trimmed : UNCATEGORIZED;
}

/** Deterministic palette color for a name with no registry entry, stable across runs. */
function fallbackColor(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	}
	return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length]!;
}

/** Chip color for a category: registry color, neutral grey for Uncategorized, else a stable fallback. */
export function colorForCategory(name: string, registry: readonly CategoryDef[]): string {
	if (name === UNCATEGORIZED) return UNCATEGORIZED_COLOR;
	const def = registry.find((entry) => entry.name.trim() === name);
	return def ? def.color : fallbackColor(name);
}

/**
 * Categories to show in the filter: registry order first, then values present in
 * notes but not registered (sorted), then Uncategorized last — but only if some
 * project actually lacks a category. Registered categories always appear, even
 * with no projects, so the user can see their whole set.
 */
export function availableCategories(
	registry: readonly CategoryDef[],
	projects: readonly Pick<Project, 'category'>[],
): CategoryOption[] {
	const options: CategoryOption[] = [];
	const seen = new Set<string>();

	for (const def of registry) {
		const name = def.name.trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		options.push({ name, color: def.color });
	}

	const observed = new Set<string>();
	let hasUncategorized = false;
	for (const project of projects) {
		const name = project.category?.trim();
		if (!name) {
			hasUncategorized = true;
			continue;
		}
		if (!seen.has(name)) observed.add(name);
	}

	for (const name of [...observed].sort()) {
		seen.add(name);
		options.push({ name, color: fallbackColor(name) });
	}

	if (hasUncategorized) {
		options.push({ name: UNCATEGORIZED, color: UNCATEGORIZED_COLOR });
	}

	return options;
}

/** True when the active filter admits this category (`null` = All). */
export function matchesActive(category: string, active: string | null): boolean {
	return active === null || category === active;
}

/** Projects kept by the active filter; the full list when no filter is active. */
export function filterProjectsByCategory<T extends Pick<Project, 'category'>>(
	projects: readonly T[],
	active: string | null,
): T[] {
	if (active === null) return [...projects];
	return projects.filter((project) => matchesActive(categoryOf(project), active));
}

/**
 * Names of the projects admitted by the active filter, or `null` when no filter
 * is active (meaning "all projects" — callers skip filtering entirely).
 */
export function allowedProjectNames(
	projects: readonly Project[],
	active: string | null,
): Set<string> | null {
	if (active === null) return null;
	return new Set(filterProjectsByCategory(projects, active).map((project) => project.name));
}

/**
 * Tasks whose owning project is in the allowed set; the full list when `allowed`
 * is `null`. Resolution from task path to project name is injected so this stays
 * pure and testable.
 */
export function filterTasksByCategory<T extends { path: string }>(
	tasks: readonly T[],
	allowed: Set<string> | null,
	projectNameForPath: (path: string) => string | null,
): T[] {
	if (allowed === null) return [...tasks];
	return tasks.filter((task) => {
		const name = projectNameForPath(task.path);
		return name !== null && allowed.has(name);
	});
}
