export const PROJECT_TEMPLATES_ROOT = 'NeseserTemplates';

export const SYNC_ID_FRONTMATTER_KEYS = ['ticktick-project-id', 'ticktick-id', 'ticktick-etag'] as const;

export interface ProjectTemplateInfo {
	name: string;
	path: string;
	projectNotePath: string;
}

export function isTemplateFolderSegment(value: string): boolean {
	const trimmed = value.trim();
	return trimmed.length > 0 && !trimmed.includes('/') && !trimmed.includes('\\');
}

export function templateFolderPath(templateName: string): string {
	return `${PROJECT_TEMPLATES_ROOT}/${templateName}`;
}

export function templateProjectNotePath(templateName: string): string {
	return `${templateFolderPath(templateName)}/${templateName}.md`;
}

export function findSyncIdentityKeys(content: string): string[] {
	const lines = content.split(/\r?\n/);
	if (lines[0] !== '---') return [];

	const found = new Set<string>();
	for (const line of lines.slice(1)) {
		if (line === '---') break;
		const key = line.split(':', 1)[0]?.trim();
		if (key && (SYNC_ID_FRONTMATTER_KEYS as readonly string[]).includes(key)) {
			found.add(key);
		}
	}
	return SYNC_ID_FRONTMATTER_KEYS.filter((key) => found.has(key));
}
