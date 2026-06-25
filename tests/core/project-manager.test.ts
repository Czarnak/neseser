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
