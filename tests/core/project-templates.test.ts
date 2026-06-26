import { describe, expect, test } from 'vitest';
import {
	cloneProjectTemplates,
	createProjectTemplateId,
	normalizeProjectTemplates,
} from '../../src/core/project-templates';

describe('project templates', () => {
	test('normalizes invalid persisted data to an empty template list', () => {
		expect(normalizeProjectTemplates(null)).toEqual([]);
		expect(normalizeProjectTemplates({ name: 'Not an array' })).toEqual([]);
	});

	test('normalizes persisted templates and defaults invalid task priorities to none', () => {
		const templates = normalizeProjectTemplates([
			{
				id: ' discovery ',
				name: ' Discovery ',
				tasks: [
					{ title: ' Kickoff ', priority: 'high' },
					{ title: 'Plan next steps', priority: 'urgent' },
					{ title: '   ', priority: 'low' },
				],
			},
			{ id: '', name: '', tasks: 'bad' },
			'bad',
		]);

		expect(templates).toEqual([
			{
				id: 'discovery',
				name: 'Discovery',
				tasks: [
					{ title: 'Kickoff', priority: 'high' },
					{ title: 'Plan next steps', priority: 'none' },
				],
			},
			{ id: 'template-1', name: 'Untitled template', tasks: [] },
		]);
	});

	test('assigns a new id when persisted template ids collide', () => {
		const templates = normalizeProjectTemplates([
			{ id: 'template-1', name: 'First', tasks: [] },
			{ id: 'template-1', name: 'Second', tasks: [] },
		]);

		expect(templates.map((template) => template.id)).toEqual(['template-1', 'template-2']);
	});

	test('clones template arrays and objects', () => {
		const templates = [{ id: 't1', name: 'Launch', tasks: [{ title: 'Kickoff', priority: 'low' as const }] }];

		const cloned = cloneProjectTemplates(templates);

		expect(cloned).toEqual(templates);
		expect(cloned).not.toBe(templates);
		const clonedTemplate = cloned[0]!;
		const originalTemplate = templates[0]!;
		expect(clonedTemplate).not.toBe(originalTemplate);
		expect(clonedTemplate.tasks).not.toBe(originalTemplate.tasks);
		expect(clonedTemplate.tasks[0]).not.toBe(originalTemplate.tasks[0]);
	});

	test('creates stable new ids from the first free template number', () => {
		expect(createProjectTemplateId([])).toBe('template-1');
		expect(
			createProjectTemplateId([
				{ id: 'template-1' },
				{ id: 'template-3' },
			]),
		).toBe('template-2');
	});
});
