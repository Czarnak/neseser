import { beforeEach, describe, expect, test } from 'vitest';
import type { Frontmatter } from '../../src/core/models';
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
	});
});
