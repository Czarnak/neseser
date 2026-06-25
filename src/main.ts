import { App, Notice, Plugin, TFile, WorkspaceLeaf, requestUrl } from 'obsidian';
import { CategoryFilterStore } from './core/category-filter';
import { Frontmatter, Task, titleFromPath } from './core/models';
import { ProjectManager, VaultAdapter } from './core/project-manager';
import { TaskIndex } from './core/task-index';
import { runOAuthFlow } from './sync/oauth-flow';
import { ExponentialBackoff, SyncScheduler } from './sync/scheduler';
import { LocalStore, NewLocalTask, SyncEngine, SyncSummary } from './sync/sync-engine';
import { SyncSnapshot, emptySnapshot } from './sync/sync-state';
import { SyncStatus, SyncStatusStore, formatSyncStatus } from './sync/sync-status';
import { HttpClient, TickTickApiError, TickTickClient } from './sync/ticktick-client';
import { DEFAULT_SETTINGS, NeseserSettingTab, NeseserSettings, isTickTickConnected } from './settings';
import { NewProjectModal, NewTaskModal } from './ui/modals';
import { CalendarView, VIEW_TYPE_CALENDAR } from './views/calendar-view';
import { DashboardView, VIEW_TYPE_DASHBOARD } from './views/dashboard-view';
import { GanttView, VIEW_TYPE_GANTT } from './views/gantt-view';
import { KanbanView, VIEW_TYPE_KANBAN } from './views/kanban-view';
import { NavigationView, VIEW_TYPE_NAVIGATION } from './views/navigation-view';
import { TodayView, VIEW_TYPE_TODAY } from './views/today-view';

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

	async readNote(path: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`Not a file: ${path}`);
		return this.app.vault.read(file);
	}

	async updateFrontmatter(path: string, updater: (fm: Frontmatter) => void): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`Not a file: ${path}`);
		await this.app.fileManager.processFrontMatter(file, updater);
	}
}

/** Vault IO the sync engine needs beyond frontmatter updates. */
class ObsidianEngineStore implements LocalStore {
	constructor(
		private app: App,
		private vault: ObsidianVaultAdapter,
		private manager: ProjectManager,
	) {}

	updateFrontmatter(path: string, updater: (fm: Frontmatter) => void): Promise<void> {
		return this.vault.updateFrontmatter(path, updater);
	}

	async createTaskNote(input: NewLocalTask): Promise<{ path: string }> {
		return this.manager.createTask({
			projectName: input.projectName,
			title: input.title,
			start: input.start,
			due: input.due,
			priority: input.priority,
			ticktickId: input.ticktickId,
		});
	}

	async trashNote(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file) return; // already gone
		await this.app.fileManager.trashFile(file);
	}

	getMtime(path: string): number | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file.stat.mtime : null;
	}
}

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 30 * 60_000;

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
	syncStatus = new SyncStatusStore();
	categoryFilter = new CategoryFilterStore();
	index!: TaskIndex;
	manager!: ProjectManager;
	private vaultAdapter!: ObsidianVaultAdapter;
	private engineStore!: ObsidianEngineStore;
	private statusBar!: HTMLElement;
	private syncInFlight = false;
	private scheduler: SyncScheduler | null = null;
	/** Category registry read live, so a settings edit lands on the next view render. */
	private readonly getCategories = () => this.settings.categories;

	override async onload(): Promise<void> {
		await this.loadPersisted();

		this.vaultAdapter = new ObsidianVaultAdapter(this.app);
		this.index = new TaskIndex(this.settings.projectsRoot);
		this.manager = new ProjectManager(this.vaultAdapter, {
			projectsRoot: this.settings.projectsRoot,
		});
		this.engineStore = new ObsidianEngineStore(this.app, this.vaultAdapter, this.manager);
		this.index.onTaskCompleted((task) => void this.handleTaskCompleted(task));

		this.registerView(
			VIEW_TYPE_TODAY,
			(leaf) => new TodayView(leaf, this.index, this.manager, this.categoryFilter, this.getCategories),
		);
		this.registerView(
			VIEW_TYPE_DASHBOARD,
			(leaf) => new DashboardView(leaf, this.index, this.categoryFilter, this.getCategories),
		);
		this.registerView(
			VIEW_TYPE_KANBAN,
			(leaf) => new KanbanView(leaf, this.index, this.manager, this.categoryFilter, this.getCategories),
		);
		this.registerView(
			VIEW_TYPE_CALENDAR,
			(leaf) => new CalendarView(leaf, this.index, this.manager, this.categoryFilter, this.getCategories),
		);
		this.registerView(
			VIEW_TYPE_GANTT,
			(leaf) => new GanttView(leaf, this.index, this.manager, this.categoryFilter, this.getCategories),
		);
		this.registerView(
			VIEW_TYPE_NAVIGATION,
			(leaf) =>
				new NavigationView(leaf, this.index, this.syncStatus, this.categoryFilter, this.getCategories, {
					onOpenToday: () => void this.activateView(VIEW_TYPE_TODAY, 'tab'),
					onOpenDashboard: () => void this.activateView(VIEW_TYPE_DASHBOARD, 'tab'),
					onOpenKanban: () => void this.activateView(VIEW_TYPE_KANBAN, 'tab'),
					onOpenCalendar: () => void this.activateView(VIEW_TYPE_CALENDAR, 'tab'),
					onOpenGantt: () => void this.activateView(VIEW_TYPE_GANTT, 'tab'),
					onCreateProject: () => this.openNewProjectModal(),
					onCreateTask: () => this.openNewTaskModal(),
					onSyncNow: () => void this.syncWithTickTick(true),
					onConnect: () => this.connectTickTickInteractive(),
				}),
		);
		this.addSettingTab(new NeseserSettingTab(this.app, this));
		this.statusBar = this.addStatusBarItem();
		this.updateSyncStatus({ state: isTickTickConnected(this.settings) ? 'idle' : 'disconnected' });
		this.registerCommands();

		this.app.workspace.onLayoutReady(() => {
			// Migration: the task list view was removed (redundant with the dashboard);
			// drop any leaf left over from an older workspace layout.
			this.app.workspace.detachLeavesOfType('neseser-task-list');
			this.buildInitialIndex();
			this.registerVaultEvents();
			this.restartSyncScheduler();
		});
	}

	override onunload(): void {
		// Obsidian detaches registered views and events automatically.
		this.scheduler?.stop();
		this.scheduler = null;
	}

	async loadPersisted(): Promise<void> {
		const raw = ((await this.loadData()) ?? {}) as Partial<PersistedData> & Partial<NeseserSettings>;
		// Legacy shape (pre-sync): settings fields at the root of data.json.
		const settings = raw.settings ?? raw;
		this.settings = { ...DEFAULT_SETTINGS, ...settings };
		// Defensive copy: when no categories were persisted the spread aliases the
		// shared DEFAULT_CATEGORIES array; clone so edits never mutate the default.
		this.settings.categories = this.settings.categories.map((category) => ({ ...category }));
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
		this.updateSyncStatus({ state: 'idle' });
	}

	/** Two-way sync. Returns false when the run had errors (drives backoff). */
	async syncWithTickTick(manual: boolean): Promise<boolean> {
		if (this.syncInFlight) {
			if (manual) new Notice('Neseser: sync already running');
			return true;
		}
		if (!isTickTickConnected(this.settings)) {
			if (manual) new Notice('Neseser: connect TickTick first (plugin settings)');
			else this.updateSyncStatus({ state: 'disconnected' });
			return true; // not an outage; no backoff churn while disconnected
		}

		this.syncInFlight = true;
		this.updateSyncStatus({ state: 'syncing' });
		try {
			const client = new TickTickClient(obsidianHttp, () => this.settings.ticktickAccessToken);
			const engine = new SyncEngine(
				client,
				this.syncState,
				() => this.persistAll(),
				this.engineStore,
				Intl.DateTimeFormat().resolvedOptions().timeZone,
			);
			const summary = await engine.syncAll(this.index);
			this.reportSyncResult(summary, manual);
			return summary.errors.length === 0;
		} catch (error) {
			const message =
				error instanceof TickTickApiError && error.status === 401
					? 'Neseser: TickTick rejected the token — reconnect in plugin settings'
					: `Neseser: sync failed — ${error instanceof Error ? error.message : String(error)}`;
			if (manual) new Notice(message);
			this.updateSyncStatus({ state: 'error' });
			return false;
		} finally {
			this.syncInFlight = false;
		}
	}

	/** (Re)arms automatic sync after load or a settings change. */
	restartSyncScheduler(): void {
		this.scheduler?.stop();
		this.scheduler = null;
		const minutes = this.settings.syncIntervalMinutes;
		if (minutes <= 0) return;
		this.scheduler = new SyncScheduler(
			() => this.syncWithTickTick(false),
			minutes * 60_000,
			new ExponentialBackoff(BACKOFF_BASE_MS, BACKOFF_CAP_MS),
			{
				set: (fn, ms) => window.setTimeout(fn, ms),
				clear: (id) => window.clearTimeout(id),
			},
		);
		this.scheduler.start();
	}

	private reportSyncResult(summary: SyncSummary, manual: boolean): void {
		const pushed = summary.created + summary.updated + summary.completed + summary.deletedRemotely;
		const pulled =
			summary.pulledCreated + summary.pulledUpdated + summary.pulledCompleted + summary.pulledDeleted;
		const parts = [
			summary.createdProjects && `${summary.createdProjects} projects`,
			pushed && `${pushed} pushed`,
			pulled && `${pulled} pulled`,
			summary.conflicts && `${summary.conflicts} conflicts resolved`,
		].filter(Boolean);
		const okText = parts.length > 0 ? parts.join(', ') : 'no changes';

		if (summary.invalid > 0) {
			new Notice(`Neseser: ${summary.invalid} task note(s) have invalid frontmatter and were not synced`);
			console.warn('[neseser] invalid task notes excluded from sync', this.index.getInvalid());
		}

		if (summary.errors.length > 0) {
			const unauthorized = summary.errors.some((e) => e.message.includes('(401)'));
			if (manual || unauthorized) {
				new Notice(
					unauthorized
						? 'Neseser: TickTick rejected the token — reconnect in plugin settings'
						: `Neseser: sync finished with ${summary.errors.length} errors (${okText}). See console.`,
				);
			}
			console.warn('[neseser] sync errors', summary.errors);
			this.updateSyncStatus({ state: 'error', errorCount: summary.errors.length });
		} else {
			if (manual) new Notice(`Neseser: synced with TickTick — ${okText}`);
			this.updateSyncStatus({ state: 'idle', lastSyncAt: Date.now() });
		}
	}

	/** Carries lastSyncAt forward (store.update) and mirrors the status to the status bar. */
	private updateSyncStatus(status: SyncStatus): void {
		this.syncStatus.update(status);
		this.statusBar.setText(`Neseser: ${formatSyncStatus(this.syncStatus.get())}`);
	}

	private registerCommands(): void {
		this.addRibbonIcon('compass', 'Neseser: open navigation', () =>
			void this.activateView(VIEW_TYPE_NAVIGATION, 'sidebar'),
		);

		this.addCommand({
			id: 'open-navigation',
			name: 'Open navigation',
			callback: () => void this.activateView(VIEW_TYPE_NAVIGATION, 'sidebar'),
		});

		this.addCommand({
			id: 'open-today',
			name: 'Open today',
			callback: () => void this.activateView(VIEW_TYPE_TODAY, 'tab'),
		});

		this.addCommand({
			id: 'open-dashboard',
			name: 'Open dashboard',
			callback: () => void this.activateView(VIEW_TYPE_DASHBOARD, 'tab'),
		});

		this.addCommand({
			id: 'open-kanban',
			name: 'Open kanban board',
			callback: () => void this.activateView(VIEW_TYPE_KANBAN, 'tab'),
		});

		this.addCommand({
			id: 'open-calendar',
			name: 'Open calendar',
			callback: () => void this.activateView(VIEW_TYPE_CALENDAR, 'tab'),
		});

		this.addCommand({
			id: 'open-gantt',
			name: 'Open Gantt',
			callback: () => void this.activateView(VIEW_TYPE_GANTT, 'tab'),
		});

		this.addCommand({
			id: 'create-project',
			name: 'Create project',
			callback: () => this.openNewProjectModal(),
		});

		this.addCommand({
			id: 'create-task',
			name: 'Create task',
			callback: () => this.openNewTaskModal(),
		});

		this.addCommand({
			id: 'connect-ticktick',
			name: 'Connect TickTick',
			callback: () => this.connectTickTickInteractive(),
		});

		this.addCommand({
			id: 'sync-ticktick',
			name: 'Sync with TickTick now',
			callback: () => void this.syncWithTickTick(true),
		});
	}

	/** Spawns the next instance of a recurring task whenever one transitions to done. */
	private async handleTaskCompleted(task: Task): Promise<void> {
		if (!task.recurrence) return;
		const projectName = this.index.projectNameForPath(task.path);
		if (projectName === null) return;

		try {
			const result = await this.manager.regenerateRecurringInstance(task, projectName);
			if (result.kind === 'created') {
				new Notice(`Neseser: next occurrence created — ${titleFromPath(result.path)}`);
			} else if (result.kind === 'skipped-no-due') {
				new Notice(`Neseser: "${task.title}" recurs but has no due date — next instance not created`);
			}
		} catch (error) {
			new Notice(
				`Neseser: recurring task regeneration failed — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private openNewProjectModal(): void {
		new NewProjectModal(
			this.app,
			async (input) => {
				const { indexPath } = await this.manager.createProject(input);
				new Notice(`Project created: ${input.name}`);
				await this.app.workspace.openLinkText(indexPath, '', false);
			},
			this.settings.categories.map((category) => category.name),
		).open();
	}

	private openNewTaskModal(): void {
		new NewTaskModal(this.app, this.index, async (input) => {
			await this.manager.createTask(input);
			new Notice(`Task created: ${input.title}`);
		}).open();
	}

	private connectTickTickInteractive(): void {
		this.connectTickTick()
			.then(() => new Notice('Neseser connected to TickTick'))
			.catch((error: unknown) => new Notice(error instanceof Error ? error.message : String(error)));
	}

	private async activateView(viewType: string, location: 'sidebar' | 'tab'): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(viewType)[0];
		if (existing) {
			await this.app.workspace.revealLeaf(existing);
			return;
		}
		const leaf: WorkspaceLeaf | null =
			location === 'sidebar' ? this.app.workspace.getRightLeaf(false) : this.app.workspace.getLeaf(true);
		if (!leaf) return;
		await leaf.setViewState({ type: viewType, active: true });
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
