import { App, Notice, Plugin, TFile, WorkspaceLeaf, requestUrl } from 'obsidian';
import { Frontmatter } from './core/models';
import { ProjectManager, VaultAdapter } from './core/project-manager';
import { TaskIndex } from './core/task-index';
import { runOAuthFlow } from './sync/oauth-flow';
import { SyncEngine } from './sync/sync-engine';
import { SyncSnapshot, emptySnapshot } from './sync/sync-state';
import { HttpClient, TickTickApiError, TickTickClient } from './sync/ticktick-client';
import { DEFAULT_SETTINGS, NeseserSettingTab, NeseserSettings, isTickTickConnected } from './settings';
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

const obsidianHttp: HttpClient = async (req) => {
	const response = await requestUrl({
		url: req.url,
		method: req.method,
		headers: req.headers,
		body: req.body,
		throw: false,
	});
	let json: unknown = null;
	try {
		json = response.json;
	} catch {
		json = null;
	}
	return { status: response.status, json };
};

interface PersistedData {
	settings: NeseserSettings;
	syncState: SyncSnapshot;
}

export default class NeseserPlugin extends Plugin {
	settings: NeseserSettings = DEFAULT_SETTINGS;
	syncState: SyncSnapshot = emptySnapshot();
	index!: TaskIndex;
	manager!: ProjectManager;
	private vaultAdapter!: ObsidianVaultAdapter;
	private statusBar!: HTMLElement;
	private pushInFlight = false;

	override async onload(): Promise<void> {
		await this.loadPersisted();

		this.vaultAdapter = new ObsidianVaultAdapter(this.app);
		this.index = new TaskIndex(this.settings.projectsRoot);
		this.manager = new ProjectManager(this.vaultAdapter, {
			projectsRoot: this.settings.projectsRoot,
		});

		this.registerView(VIEW_TYPE_TASK_LIST, (leaf) => new TaskListView(leaf, this.index, this.manager));
		this.addSettingTab(new NeseserSettingTab(this.app, this));
		this.statusBar = this.addStatusBarItem();
		this.setStatus('idle');
		this.registerCommands();

		this.app.workspace.onLayoutReady(() => {
			this.buildInitialIndex();
			this.registerVaultEvents();
		});
	}

	override onunload(): void {
		// Obsidian detaches registered views and events automatically.
	}

	async loadPersisted(): Promise<void> {
		const raw = ((await this.loadData()) ?? {}) as Partial<PersistedData> & Partial<NeseserSettings>;
		// Legacy shape (pre-sync): settings fields at the root of data.json.
		const settings = raw.settings ?? raw;
		this.settings = { ...DEFAULT_SETTINGS, ...settings };
		this.syncState = raw.syncState ?? emptySnapshot();
	}

	async saveSettings(): Promise<void> {
		await this.persistAll();
	}

	async persistAll(): Promise<void> {
		const data: PersistedData = { settings: this.settings, syncState: this.syncState };
		await this.saveData(data);
	}

	async connectTickTick(): Promise<void> {
		const { ticktickClientId, ticktickClientSecret, ticktickPort } = this.settings;
		if (!ticktickClientId || !ticktickClientSecret) {
			throw new Error('Set the TickTick client ID and client secret first');
		}

		const tokens = await runOAuthFlow({
			clientId: ticktickClientId,
			clientSecret: ticktickClientSecret,
			port: ticktickPort,
			http: obsidianHttp,
			openBrowser: (url) => {
				window.open(url);
			},
		});

		this.settings.ticktickAccessToken = tokens.accessToken;
		this.settings.ticktickTokenExpiresAt = Date.now() + tokens.expiresIn * 1000;
		await this.persistAll();
	}

	async pushToTickTick(): Promise<void> {
		if (this.pushInFlight) {
			new Notice('Neseser: push already running');
			return;
		}
		if (!isTickTickConnected(this.settings)) {
			new Notice('Neseser: connect TickTick first (plugin settings)');
			return;
		}

		this.pushInFlight = true;
		this.setStatus('pushing…');
		try {
			const client = new TickTickClient(obsidianHttp, () => this.settings.ticktickAccessToken);
			const engine = new SyncEngine(
				client,
				this.syncState,
				() => this.persistAll(),
				this.vaultAdapter,
				Intl.DateTimeFormat().resolvedOptions().timeZone,
			);
			const summary = await engine.pushAll(this.index);

			const parts = [
				summary.createdProjects && `${summary.createdProjects} projects`,
				summary.created && `${summary.created} created`,
				summary.updated && `${summary.updated} updated`,
				summary.completed && `${summary.completed} completed`,
			].filter(Boolean);
			const okText = parts.length > 0 ? parts.join(', ') : 'nothing to push';

			if (summary.errors.length > 0) {
				const unauthorized = summary.errors.some((e) => e.message.includes('(401)'));
				new Notice(
					unauthorized
						? 'Neseser: TickTick rejected the token — reconnect in plugin settings'
						: `Neseser: push finished with ${summary.errors.length} errors (${okText}). See console.`,
				);
				console.warn('[neseser] push errors', summary.errors);
				this.setStatus(`push: ${summary.errors.length} errors`);
			} else {
				new Notice(`Neseser: pushed to TickTick — ${okText}`);
				this.setStatus(`pushed ${new Date().toLocaleTimeString()}`);
			}
		} catch (error) {
			const message =
				error instanceof TickTickApiError && error.status === 401
					? 'Neseser: TickTick rejected the token — reconnect in plugin settings'
					: `Neseser: push failed — ${error instanceof Error ? error.message : String(error)}`;
			new Notice(message);
			this.setStatus('push failed');
		} finally {
			this.pushInFlight = false;
		}
	}

	private setStatus(text: string): void {
		this.statusBar.setText(`Neseser: ${text}`);
	}

	private registerCommands(): void {
		this.addRibbonIcon('list-checks', 'Neseser: open task list', () => void this.activateTaskList());

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

		this.addCommand({
			id: 'connect-ticktick',
			name: 'Connect TickTick',
			callback: () => {
				this.connectTickTick()
					.then(() => new Notice('Neseser connected to TickTick'))
					.catch((error: unknown) =>
						new Notice(error instanceof Error ? error.message : String(error)),
					);
			},
		});

		this.addCommand({
			id: 'push-ticktick',
			name: 'Push to TickTick now',
			callback: () => void this.pushToTickTick(),
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
