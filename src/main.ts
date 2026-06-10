import { App, Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { Frontmatter } from './core/models';
import { ProjectManager, VaultAdapter } from './core/project-manager';
import { TaskIndex } from './core/task-index';
import { DEFAULT_SETTINGS, ProjectHubSettingTab, ProjectHubSettings } from './settings';
import { NewProjectModal, NewTaskModal } from './ui/modals';
import { TaskListView, VIEW_TYPE_TASK_LIST } from './views/task-list-view';

class ObsidianVaultAdapter implements VaultAdapter {
	constructor(private app: App) {}

	async exists(path: string): Promise<boolean> {
		return this.app.vault.getAbstractFileByPath(path) !== null;
	}

	async createFolder(path: string): Promise<void> {
		await this.app.vault.createFolder(path);
	}

	async createNote(path: string, content: string): Promise<void> {
		await this.app.vault.create(path, content);
	}

	async updateFrontmatter(path: string, updater: (fm: Frontmatter) => void): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`Not a file: ${path}`);
		await this.app.fileManager.processFrontMatter(file, updater);
	}
}

export default class ProjectHubPlugin extends Plugin {
	settings: ProjectHubSettings = DEFAULT_SETTINGS;
	index!: TaskIndex;
	manager!: ProjectManager;

	override async onload(): Promise<void> {
		await this.loadSettings();

		this.index = new TaskIndex(this.settings.projectsRoot);
		this.manager = new ProjectManager(new ObsidianVaultAdapter(this.app), {
			projectsRoot: this.settings.projectsRoot,
		});

		this.registerView(VIEW_TYPE_TASK_LIST, (leaf) => new TaskListView(leaf, this.index, this.manager));
		this.addSettingTab(new ProjectHubSettingTab(this.app, this));
		this.registerCommands();

		this.app.workspace.onLayoutReady(() => {
			this.buildInitialIndex();
			this.registerVaultEvents();
		});
	}

	override onunload(): void {
		// Obsidian detaches registered views and events automatically.
	}

	async loadSettings(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private registerCommands(): void {
		this.addRibbonIcon('list-checks', 'Project Hub: open task list', () => void this.activateTaskList());

		this.addCommand({
			id: 'open-task-list',
			name: 'Open task list',
			callback: () => void this.activateTaskList(),
		});

		this.addCommand({
			id: 'create-project',
			name: 'Create project',
			callback: () => {
				new NewProjectModal(this.app, async (input) => {
					const { indexPath } = await this.manager.createProject(input);
					new Notice(`Project created: ${input.name}`);
					await this.app.workspace.openLinkText(indexPath, '', false);
				}).open();
			},
		});

		this.addCommand({
			id: 'create-task',
			name: 'Create task',
			callback: () => {
				new NewTaskModal(this.app, this.index, async (input) => {
					await this.manager.createTask(input);
					new Notice(`Task created: ${input.title}`);
				}).open();
			},
		});
	}

	private async activateTaskList(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_LIST)[0];
		if (existing) {
			await this.app.workspace.revealLeaf(existing);
			return;
		}
		const leaf: WorkspaceLeaf | null = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE_TASK_LIST, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	private buildInitialIndex(): void {
		for (const file of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			this.index.onFileChanged(file.path, fm);
		}
	}

	private registerVaultEvents(): void {
		this.registerEvent(
			this.app.metadataCache.on('changed', (file, _data, cache) => {
				this.index.onFileChanged(file.path, cache?.frontmatter);
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				this.index.onFileDeleted(file.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				const fm = file instanceof TFile ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined;
				this.index.onFileRenamed(oldPath, file.path, fm);
			}),
		);
	}
}
