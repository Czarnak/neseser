import { beforeEach, describe, expect, test } from 'vitest';
import type { Frontmatter, Task } from '../../src/core/models';
import { ProjectManager, VaultAdapter } from '../../src/core/project-manager';

class FakeVault implements VaultAdapter {
	folders = new Set<string>();
	notes = new Map<string, string>();
	frontmatters = new Map<string, Frontmatter>();

	async exists(path: string): Promise<boolean> {
		return this.folders.has(path) || this.notes.has(path);
	}

	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}

	async createNote(path: string, content: string): Promise<void> {
		this.notes.set(path, content);
	}

	async listFolders(path: string): Promise<string[]> {
		const prefix = `${path}/`;
		return [...this.folders]
			.filter((folder) => folder.startsWith(prefix))
			.map((folder) => folder.slice(prefix.length))
			.filter((rest) => rest.length > 0 && !rest.includes('/'))
			.sort();
	}

	async listMarkdownFiles(path: string): Promise<string[]> {
		const prefix = `${path}/`;
		return [...this.notes.keys()]
			.filter((notePath) => notePath.startsWith(prefix) && notePath.endsWith('.md'))
			.sort();
	}

	async copyFolder(sourcePath: string, destinationPath: string): Promise<void> {
		if (await this.exists(destinationPath)) throw new Error(`Destination exists: ${destinationPath}`);
		this.folders.add(destinationPath);
		for (const folder of [...this.folders]) {
			if (folder.startsWith(`${sourcePath}/`)) {
				this.folders.add(`${destinationPath}/${folder.slice(sourcePath.length + 1)}`);
			}
		}
		for (const [notePath, content] of [...this.notes.entries()]) {
			if (notePath.startsWith(`${sourcePath}/`)) {
				this.notes.set(`${destinationPath}/${notePath.slice(sourcePath.length + 1)}`, content);
			}
		}
	}

	async renamePath(path: string, newPath: string): Promise<void> {
		const note = this.notes.get(path);
		if (note !== undefined) {
			this.notes.delete(path);
			this.notes.set(newPath, note);
			return;
		}
		if (this.folders.has(path)) {
			this.folders.delete(path);
			this.folders.add(newPath);
			return;
		}
		throw new Error(`Missing path: ${path}`);
	}

	async readNote(path: string): Promise<string> {
		const content = this.notes.get(path);
		if (content === undefined) throw new Error(`Missing note: ${path}`);
		return content;
	}

	async updateFrontmatter(path: string, updater: (fm: Frontmatter) => void): Promise<void> {
		const fm = this.frontmatters.get(path) ?? {};
		updater(fm);
		this.frontmatters.set(path, fm);
	}
}

const FIXED_NOW = new Date('2026-06-10T12:00:00.000Z');

describe('ProjectManager', () => {
	let vault: FakeVault;
	let manager: ProjectManager;

	beforeEach(() => {
		vault = new FakeVault();
		manager = new ProjectManager(vault, { projectsRoot: 'Projects' }, () => FIXED_NOW);
	});

	function addTemplate(name: string, files: Record<string, string>): void {
		const root = `NeseserTemplates/${name}`;
		vault.folders.add('NeseserTemplates');
		vault.folders.add(root);
		for (const relativePath of Object.keys(files)) {
			const segments = relativePath.split('/');
			for (let index = 1; index < segments.length; index += 1) {
				vault.folders.add(`${root}/${segments.slice(0, index).join('/')}`);
			}
			vault.notes.set(`${root}/${relativePath}`, files[relativePath] ?? '');
		}
	}

	describe('createProject', () => {
		test('creates project folder, Tasks subfolder, and index note', async () => {
			const { indexPath } = await manager.createProject({ name: 'Alpha' });

			expect(indexPath).toBe('Projects/Alpha/Alpha.md');
			expect(vault.folders.has('Projects/Alpha')).toBe(true);
			expect(vault.folders.has('Projects/Alpha/Tasks')).toBe(true);
			const content = vault.notes.get('Projects/Alpha/Alpha.md') ?? '';
			expect(content).toContain('type: project');
			expect(content).toContain('status: active');
		});

		test('includes deadline in index note when given', async () => {
			await manager.createProject({ name: 'Alpha', deadline: '2026-12-31' });

			expect(vault.notes.get('Projects/Alpha/Alpha.md')).toContain('deadline: 2026-12-31');
		});

		test('includes category in index note when given', async () => {
			await manager.createProject({ name: 'Alpha', category: 'University' });

			expect(vault.notes.get('Projects/Alpha/Alpha.md')).toContain('category: University');
		});

		test('omits category when blank or absent', async () => {
			await manager.createProject({ name: 'Alpha', category: '   ' });
			await manager.createProject({ name: 'Beta' });

			expect(vault.notes.get('Projects/Alpha/Alpha.md')).not.toContain('category:');
			expect(vault.notes.get('Projects/Beta/Beta.md')).not.toContain('category:');
		});

		test('escapes backslashes in quoted YAML values so a trailing backslash cannot swallow the closing quote', async () => {
			// A naive `replace(/"/g, '\\"')` leaves a lone trailing backslash untouched, so
			// wrapping "Foo\" in quotes yields `"Foo\"` — the backslash escapes the closing
			// quote instead of ending the string, leaving the frontmatter YAML unterminated
			// and any content that follows swallowed into the same scalar.
			await manager.createProject({ name: 'Alpha', category: 'Foo\\' });

			const content = vault.notes.get('Projects/Alpha/Alpha.md') ?? '';
			const line = content.split('\n').find((l) => l.startsWith('category:'));
			expect(line).toBe('category: "Foo\\\\"');
		});

		test('escapes an injected quote+key sequence so it cannot add a bogus frontmatter field', async () => {
			// Without escaping the backslash first, a value like `x\", evil: "y` turns the
			// preceding backslash + added escape backslash into `\\"`, which YAML reads as an
			// escaped backslash followed by a real closing quote — breaking out of the string
			// and injecting an arbitrary `evil:` key into the frontmatter. Correctly escaped,
			// `evil:` still appears in the file, but only as inert data inside one quoted YAML
			// scalar — never as a sibling key parseable on its own line.
			await manager.createProject({ name: 'Alpha', category: 'x\\", evil: "y' });

			const content = vault.notes.get('Projects/Alpha/Alpha.md') ?? '';
			const lines = content.split('\n');
			expect(lines).not.toContain('evil: "y"');
			const line = lines.find((l) => l.startsWith('category:'));
			expect(line).toBe('category: "x\\\\\\", evil: \\"y"');
		});

		test('sanitizes characters that are illegal in file names', async () => {
			const { indexPath } = await manager.createProject({ name: 'Ship/it: now?' });

			expect(indexPath).toBe('Projects/Ship it now/Ship it now.md');
		});

		test('rejects empty project name', async () => {
			await expect(manager.createProject({ name: '???' })).rejects.toThrow(/name/i);
		});

		test('rejects when project already exists', async () => {
			await manager.createProject({ name: 'Alpha' });

			await expect(manager.createProject({ name: 'Alpha' })).rejects.toThrow(/exists/i);
		});
	});

	describe('folder project templates', () => {
		test('lists only direct project-shaped folders from NeseserTemplates', async () => {
			addTemplate('Launch', { 'Launch.md': '---\ntype: project\n---\n', 'Tasks/Kickoff.md': '---\ntype: task\n---\n' });
			vault.folders.add('NeseserTemplates/Empty');
			vault.folders.add('NeseserTemplates/Nested/Child');
			vault.notes.set('NeseserTemplates/Nested/Child/Child.md', '---\ntype: project\n---\n');

			await expect(manager.listProjectTemplates()).resolves.toEqual([
				{
					name: 'Launch',
					path: 'NeseserTemplates/Launch',
					projectNotePath: 'NeseserTemplates/Launch/Launch.md',
				},
			]);
		});

		test('returns an empty list when the templates root is missing', async () => {
			await expect(manager.listProjectTemplates()).resolves.toEqual([]);
		});

		test('copies full template structure and renames only the copied project note', async () => {
			addTemplate('Launch', {
				'Launch.md': '---\ntype: project\ncategory: Research\n---\nTemplate body',
				'Tasks/Kickoff.md': '---\ntype: task\npriority: high\n---\nTask body',
				'Notes/Brief.md': 'Brief body with [[Launch]] link left unchanged',
			});

			const result = await manager.createProjectFromTemplate({ name: 'Alpha', templateName: 'Launch' });

			expect(result).toEqual({ indexPath: 'Projects/Alpha/Alpha.md', projectName: 'Alpha' });
			expect(vault.folders.has('Projects')).toBe(true);
			expect(vault.folders.has('Projects/Alpha')).toBe(true);
			expect(vault.folders.has('Projects/Alpha/Tasks')).toBe(true);
			expect(vault.folders.has('Projects/Alpha/Notes')).toBe(true);
			expect(vault.notes.has('Projects/Alpha/Launch.md')).toBe(false);
			expect(vault.notes.get('Projects/Alpha/Alpha.md')).toBe(
				'---\ntype: project\ncategory: Research\n---\nTemplate body',
			);
			expect(vault.notes.get('Projects/Alpha/Tasks/Kickoff.md')).toContain('priority: high');
			expect(vault.notes.get('Projects/Alpha/Notes/Brief.md')).toContain('[[Launch]]');
		});

		test('rejects invalid template folders before writing anything', async () => {
			vault.folders.add('NeseserTemplates');
			vault.folders.add('NeseserTemplates/Launch');
			vault.notes.set('NeseserTemplates/Launch/Readme.md', 'No project note');

			await expect(manager.createProjectFromTemplate({ name: 'Alpha', templateName: 'Launch' })).rejects.toThrow(
				/template/i,
			);

			expect(vault.folders.has('Projects')).toBe(false);
			expect(vault.notes.has('Projects/Alpha/Alpha.md')).toBe(false);
		});

		test('rejects project note rename conflicts before writing anything', async () => {
			addTemplate('Launch', {
				'Launch.md': '---\ntype: project\n---\n',
				'Alpha.md': 'Already present in template',
			});

			await expect(manager.createProjectFromTemplate({ name: 'Alpha', templateName: 'Launch' })).rejects.toThrow(
				/conflict/i,
			);

			expect(vault.folders.has('Projects')).toBe(false);
			expect(vault.notes.has('Projects/Alpha/Launch.md')).toBe(false);
		});

		test('rejects templates with TickTick sync identity frontmatter before writing anything', async () => {
			addTemplate('Launch', {
				'Launch.md': '---\ntype: project\n---\n',
				'Tasks/Synced.md': '---\ntype: task\nticktick-id: tt-1\n---\n',
			});

			await expect(manager.createProjectFromTemplate({ name: 'Alpha', templateName: 'Launch' })).rejects.toThrow(
				/TickTick/i,
			);

			expect(vault.folders.has('Projects')).toBe(false);
			expect(vault.notes.has('Projects/Alpha/Alpha.md')).toBe(false);
		});

		test('keeps existing duplicate-project behavior', async () => {
			addTemplate('Launch', { 'Launch.md': '---\ntype: project\n---\n' });
			await manager.createProject({ name: 'Alpha' });

			await expect(manager.createProjectFromTemplate({ name: 'Alpha', templateName: 'Launch' })).rejects.toThrow(
				/exists/i,
			);
		});
	});

	describe('createTask', () => {
		beforeEach(async () => {
			await manager.createProject({ name: 'Alpha' });
		});

		test('creates task note under Tasks/ with frontmatter and created date', async () => {
			const { path } = await manager.createTask({ projectName: 'Alpha', title: 'Build parser' });

			expect(path).toBe('Projects/Alpha/Tasks/Build parser.md');
			const content = vault.notes.get(path) ?? '';
			expect(content).toContain('type: task');
			expect(content).toContain('status: todo');
			expect(content).toContain('created: 2026-06-10');
		});

		test('writes optional fields: due, priority, parent wikilink', async () => {
			const { path } = await manager.createTask({
				projectName: 'Alpha',
				title: 'Write tests',
				due: '2026-06-15',
				priority: 'high',
				parent: 'Build parser',
			});

			const content = vault.notes.get(path) ?? '';
			expect(content).toContain('due: 2026-06-15');
			expect(content).toContain('priority: high');
			expect(content).toContain('parent: "[[Build parser]]"');
		});

		test('quotes frontmatter values containing colon-space to keep YAML valid', async () => {
			const { path } = await manager.createTask({
				projectName: 'Alpha',
				title: 'T',
				reminder: 'at 9: 00',
			});

			expect(vault.notes.get(path)).toContain('reminder: "at 9: 00"');
		});

		test('writes start when given', async () => {
			const { path } = await manager.createTask({
				projectName: 'Alpha',
				title: 'Span',
				start: '2026-06-12',
				due: '2026-06-15',
			});

			const content = vault.notes.get(path) ?? '';
			expect(content).toContain('start: 2026-06-12');
			expect(content).toContain('due: 2026-06-15');
		});

		test('writes ticktick-id when given (pull-created tasks)', async () => {
			const { path } = await manager.createTask({
				projectName: 'Alpha',
				title: 'From phone',
				ticktickId: 'tt-9',
			});

			expect(vault.notes.get(path)).toContain('ticktick-id: tt-9');
		});

		test('writes recurrence when given', async () => {
			const { path } = await manager.createTask({
				projectName: 'Alpha',
				title: 'Habit',
				recurrence: 'weekly',
			});

			expect(vault.notes.get(path)).toContain('recurrence: weekly');
		});

		test('appends the body after the frontmatter block', async () => {
			const { path } = await manager.createTask({
				projectName: 'Alpha',
				title: 'With body',
				body: 'Step one.\n',
			});

			const content = vault.notes.get(path) ?? '';
			expect(content.endsWith('---\nStep one.\n')).toBe(true);
		});

		test('rejects duplicate task title in same project', async () => {
			await manager.createTask({ projectName: 'Alpha', title: 'T' });

			await expect(manager.createTask({ projectName: 'Alpha', title: 'T' })).rejects.toThrow(
				/exists/i,
			);
		});

		test('rejects task in nonexistent project', async () => {
			await expect(manager.createTask({ projectName: 'Ghost', title: 'T' })).rejects.toThrow(
				/project/i,
			);
		});
	});

	describe('status updates', () => {
		test('completeTask sets status done and completed-at', async () => {
			await manager.completeTask('Projects/Alpha/Tasks/T.md');

			expect(vault.frontmatters.get('Projects/Alpha/Tasks/T.md')).toMatchObject({
				status: 'done',
				'completed-at': FIXED_NOW.toISOString(),
			});
		});

		test('updateTaskStatus away from done clears completed-at', async () => {
			await manager.completeTask('Projects/Alpha/Tasks/T.md');
			await manager.updateTaskStatus('Projects/Alpha/Tasks/T.md', 'todo');

			const fm = vault.frontmatters.get('Projects/Alpha/Tasks/T.md') ?? {};
			expect(fm['status']).toBe('todo');
			expect(fm['completed-at']).toBeUndefined();
		});

		test('updateTaskDue rewrites the due frontmatter', async () => {
			await manager.updateTaskDue('Projects/Alpha/Tasks/T.md', '2026-06-15');

			expect(vault.frontmatters.get('Projects/Alpha/Tasks/T.md')).toMatchObject({
				due: '2026-06-15',
			});
		});

		test('updateTaskDates writes start and due', async () => {
			await manager.updateTaskDates('Projects/Alpha/Tasks/T.md', {
				start: '2026-06-12',
				due: '2026-06-15',
			});

			expect(vault.frontmatters.get('Projects/Alpha/Tasks/T.md')).toMatchObject({
				start: '2026-06-12',
				due: '2026-06-15',
			});
		});

		test('updateTaskDates without start removes an existing start', async () => {
			await manager.updateTaskDates('Projects/Alpha/Tasks/T.md', {
				start: '2026-06-12',
				due: '2026-06-15',
			});
			await manager.updateTaskDates('Projects/Alpha/Tasks/T.md', { due: '2026-06-16' });

			const fm = vault.frontmatters.get('Projects/Alpha/Tasks/T.md') ?? {};
			expect(fm['due']).toBe('2026-06-16');
			expect(fm['start']).toBeUndefined();
		});
	});

	describe('regenerateRecurringInstance', () => {
		const OLD_PATH = 'Projects/Alpha/Tasks/Daily standup.md';

		function recurringTask(overrides: Partial<Task> = {}): Task {
			return {
				path: OLD_PATH,
				title: 'Daily standup',
				status: 'done',
				priority: 'none',
				due: '2026-06-09',
				recurrence: 'daily',
				...overrides,
			};
		}

		beforeEach(async () => {
			await manager.createProject({ name: 'Alpha' });
			vault.notes.set(
				OLD_PATH,
				'---\ntype: task\nstatus: done\ndue: 2026-06-09\nrecurrence: daily\n---\nChecklist body.\n',
			);
			vault.frontmatters.set(OLD_PATH, { type: 'task', recurrence: 'daily' });
		});

		test('creates the next instance with shifted dates and copied fields', async () => {
			const result = await manager.regenerateRecurringInstance(
				recurringTask({
					start: '2026-06-08',
					priority: 'high',
					parent: 'Build parser',
				}),
				'Alpha',
			);

			expect(result).toEqual({
				kind: 'created',
				path: 'Projects/Alpha/Tasks/Daily standup 2026-06-10.md',
			});
			const content = vault.notes.get('Projects/Alpha/Tasks/Daily standup 2026-06-10.md') ?? '';
			expect(content).toContain('status: todo');
			expect(content).toContain('created: 2026-06-10');
			expect(content).toContain('start: 2026-06-09');
			expect(content).toContain('due: 2026-06-10');
			expect(content).toContain('priority: high');
			expect(content).toContain('parent: "[[Build parser]]"');
			expect(content).toContain('recurrence: daily');
			expect(content).toContain('Checklist body.');
		});

		test('does not copy reminder, ticktick fields, or completed-at', async () => {
			await manager.regenerateRecurringInstance(
				recurringTask({
					reminder: '2026-06-09T09:00',
					ticktickId: 'tt-1',
					ticktickEtag: 'e-1',
					completedAt: '2026-06-09T18:00:00.000Z',
				}),
				'Alpha',
			);

			const content = vault.notes.get('Projects/Alpha/Tasks/Daily standup 2026-06-10.md') ?? '';
			expect(content).not.toContain('reminder');
			expect(content).not.toContain('ticktick-id');
			expect(content).not.toContain('ticktick-etag');
			expect(content).not.toContain('completed-at');
		});

		test('deletes recurrence from the completed note after creating the new one', async () => {
			await manager.regenerateRecurringInstance(recurringTask(), 'Alpha');

			expect('recurrence' in (vault.frontmatters.get(OLD_PATH) ?? {})).toBe(false);
		});

		test('returns skipped-exists on collision and still deletes the old recurrence key', async () => {
			vault.notes.set('Projects/Alpha/Tasks/Daily standup 2026-06-10.md', 'existing');

			const result = await manager.regenerateRecurringInstance(recurringTask(), 'Alpha');

			expect(result).toEqual({ kind: 'skipped-exists' });
			expect(vault.notes.get('Projects/Alpha/Tasks/Daily standup 2026-06-10.md')).toBe('existing');
			expect('recurrence' in (vault.frontmatters.get(OLD_PATH) ?? {})).toBe(false);
		});

		test('returns skipped-no-due and keeps recurrence when due is missing', async () => {
			const result = await manager.regenerateRecurringInstance(
				recurringTask({ due: undefined }),
				'Alpha',
			);

			expect(result).toEqual({ kind: 'skipped-no-due' });
			expect(vault.frontmatters.get(OLD_PATH)?.['recurrence']).toBe('daily');
		});

		test('returns skipped-no-due and keeps recurrence when due is unparseable', async () => {
			const result = await manager.regenerateRecurringInstance(
				recurringTask({ due: 'whenever' }),
				'Alpha',
			);

			expect(result).toEqual({ kind: 'skipped-no-due' });
			expect(vault.frontmatters.get(OLD_PATH)?.['recurrence']).toBe('daily');
		});

		test('replaces the old date suffix instead of stacking a second one', async () => {
			const path = 'Projects/Alpha/Tasks/Water plants 2026-06-12.md';
			vault.notes.set(path, '---\ntype: task\ndue: 2026-06-12\nrecurrence: daily\n---\n');

			const result = await manager.regenerateRecurringInstance(
				recurringTask({ path, title: 'Water plants 2026-06-12', due: '2026-06-12' }),
				'Alpha',
			);

			expect(result).toEqual({
				kind: 'created',
				path: 'Projects/Alpha/Tasks/Water plants 2026-06-13.md',
			});
		});

		test('copies an empty body for a frontmatter-only note', async () => {
			vault.notes.set(OLD_PATH, '---\ntype: task\ndue: 2026-06-09\nrecurrence: daily\n---\n');

			await manager.regenerateRecurringInstance(recurringTask(), 'Alpha');

			const content = vault.notes.get('Projects/Alpha/Tasks/Daily standup 2026-06-10.md') ?? '';
			expect(content.endsWith('---\n')).toBe(true);
		});

		test('rolls a long-overdue daily task to today', async () => {
			const result = await manager.regenerateRecurringInstance(
				recurringTask({ due: '2026-05-31' }),
				'Alpha',
			);

			expect(result).toEqual({
				kind: 'created',
				path: 'Projects/Alpha/Tasks/Daily standup 2026-06-10.md',
			});
			const content = vault.notes.get('Projects/Alpha/Tasks/Daily standup 2026-06-10.md') ?? '';
			expect(content).toContain('due: 2026-06-10');
		});
	});
});
