import { describe, expect, test } from 'vitest';
import {
	PROJECT_TEMPLATES_ROOT,
	findSyncIdentityKeys,
	isTemplateFolderSegment,
	templateFolderPath,
	templateProjectNotePath,
} from '../../src/core/project-templates';

describe('folder project templates', () => {
	test('uses the fixed vault-root templates folder', () => {
		expect(PROJECT_TEMPLATES_ROOT).toBe('NeseserTemplates');
	});

	test('builds template folder and project note paths from the direct folder name', () => {
		expect(templateFolderPath('Launch Plan')).toBe('NeseserTemplates/Launch Plan');
		expect(templateProjectNotePath('Launch Plan')).toBe('NeseserTemplates/Launch Plan/Launch Plan.md');
	});

	test('accepts only direct template folder segments', () => {
		expect(isTemplateFolderSegment('Launch Plan')).toBe(true);
		expect(isTemplateFolderSegment('Nested/Launch')).toBe(false);
		expect(isTemplateFolderSegment('Nested\\Launch')).toBe(false);
		expect(isTemplateFolderSegment('   ')).toBe(false);
	});

	test('detects TickTick sync identity fields in frontmatter', () => {
		const content = [
			'---',
			'type: task',
			'ticktick-id: abc',
			'ticktick-etag: etag-1',
			'---',
			'Body with ticktick-id: text outside frontmatter',
		].join('\n');

		expect(findSyncIdentityKeys(content)).toEqual(['ticktick-id', 'ticktick-etag']);
	});

	test('ignores TickTick sync identity field names outside frontmatter', () => {
		const content = ['# Notes', '', 'ticktick-project-id: mentioned in body'].join('\n');

		expect(findSyncIdentityKeys(content)).toEqual([]);
	});
});
