import { PRIORITIES, Priority } from './models';

export interface ProjectTemplateTask {
	title: string;
	priority: Priority;
}

export interface ProjectTemplate {
	id: string;
	name: string;
	tasks: ProjectTemplateTask[];
}

const UNTITLED_TEMPLATE = 'Untitled template';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function cleanString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const cleaned = value.trim();
	return cleaned ? cleaned : null;
}

function normalizePriority(value: unknown): Priority {
	return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value)
		? (value as Priority)
		: 'none';
}

export function createProjectTemplateId(existing: readonly Pick<ProjectTemplate, 'id'>[]): string {
	const ids = new Set(existing.map((template) => template.id));
	let next = 1;
	while (ids.has(`template-${next}`)) next += 1;
	return `template-${next}`;
}

export function cloneProjectTemplates(templates: readonly ProjectTemplate[]): ProjectTemplate[] {
	return templates.map((template) => ({
		...template,
		tasks: template.tasks.map((task) => ({ ...task })),
	}));
}

export function normalizeProjectTemplates(value: unknown): ProjectTemplate[] {
	if (!Array.isArray(value)) return [];

	return value.reduce<ProjectTemplate[]>((templates, candidate) => {
		if (!isRecord(candidate)) return templates;

		const requestedId = cleanString(candidate['id']);
		const id =
			requestedId && !templates.some((template) => template.id === requestedId)
				? requestedId
				: createProjectTemplateId(templates);
		const name = cleanString(candidate['name']) ?? UNTITLED_TEMPLATE;
		const rawTasks = Array.isArray(candidate['tasks']) ? candidate['tasks'] : [];
		const tasks = rawTasks.reduce<ProjectTemplateTask[]>((items, rawTask) => {
			if (!isRecord(rawTask)) return items;
			const title = cleanString(rawTask['title']);
			if (!title) return items;
			return [...items, { title, priority: normalizePriority(rawTask['priority']) }];
		}, []);

		return [...templates, { id, name, tasks }];
	}, []);
}
