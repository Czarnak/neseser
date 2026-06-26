import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type { CategoryDef } from './core/category-data';
import { PRIORITIES, Priority } from './core/models';
import {
	ProjectTemplate,
	cloneProjectTemplates,
	createProjectTemplateId,
} from './core/project-templates';
import type NeseserPlugin from './main';

export interface NeseserSettings {
	projectsRoot: string;
	/** User-managed project categories; seeded with defaults, freely editable. */
	categories: CategoryDef[];
	/** User-managed project templates; each template creates standard task notes for a new project. */
	projectTemplates: ProjectTemplate[];
	ticktickClientId: string;
	ticktickClientSecret: string;
	ticktickPort: number;
	ticktickAccessToken: string;
	/** epoch ms; 0 = not connected */
	ticktickTokenExpiresAt: number;
	/** automatic two-way sync cadence; 0 disables */
	syncIntervalMinutes: number;
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
	{ name: 'Work', color: '#4f9cf9' },
	{ name: 'University', color: '#a855f7' },
	{ name: 'Research', color: '#22c55e' },
	{ name: 'Training', color: '#f59e0b' },
	{ name: 'Social', color: '#ec4899' },
];

export const DEFAULT_SETTINGS: NeseserSettings = {
	projectsRoot: 'Projects',
	categories: DEFAULT_CATEGORIES,
	projectTemplates: [],
	ticktickClientId: 'I46A11I1VbyvgYo5mW',
	ticktickClientSecret: '',
	ticktickPort: 42813,
	ticktickAccessToken: '',
	ticktickTokenExpiresAt: 0,
	syncIntervalMinutes: 5,
};

export function isTickTickConnected(settings: NeseserSettings): boolean {
	return settings.ticktickAccessToken !== '' && settings.ticktickTokenExpiresAt > Date.now();
}

export class NeseserSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: NeseserPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();

		new Setting(this.containerEl)
			.setName('Projects folder')
			.setDesc('Vault folder that holds one subfolder per project. Reload the plugin after changing.')
			.addText((text) =>
				text
					.setPlaceholder('Projects')
					.setValue(this.plugin.settings.projectsRoot)
					.onChange(async (value) => {
						this.plugin.settings.projectsRoot = value.trim() || DEFAULT_SETTINGS.projectsRoot;
						await this.plugin.saveSettings();
					}),
			);

		this.renderCategories();
		this.renderProjectTemplates();

		new Setting(this.containerEl).setName('TickTick').setHeading();

		new Setting(this.containerEl)
			.setName('Client ID')
			.setDesc('From your app at developer.ticktick.com.')
			.addText((text) =>
				text.setValue(this.plugin.settings.ticktickClientId).onChange(async (value) => {
					this.plugin.settings.ticktickClientId = value.trim();
					await this.plugin.saveSettings();
				}),
			);

		new Setting(this.containerEl)
			.setName('Client secret')
			.setDesc('Stored in plain text in this plugin\'s data.json — keep your vault private.')
			.addText((text) => {
				text.inputEl.type = 'password';
				text.setValue(this.plugin.settings.ticktickClientSecret).onChange(async (value) => {
					this.plugin.settings.ticktickClientSecret = value.trim();
					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName('OAuth callback port')
			.setDesc('Must match the redirect URI registered in your TickTick app: http://localhost:<port>/callback')
			.addText((text) =>
				text.setValue(String(this.plugin.settings.ticktickPort)).onChange(async (value) => {
					const port = Number.parseInt(value, 10);
					if (Number.isInteger(port) && port > 0 && port < 65536) {
						this.plugin.settings.ticktickPort = port;
						await this.plugin.saveSettings();
					}
				}),
			);

		new Setting(this.containerEl)
			.setName('Sync interval (minutes)')
			.setDesc('How often the two-way TickTick sync runs. 0 disables automatic sync.')
			.addText((text) =>
				text.setValue(String(this.plugin.settings.syncIntervalMinutes)).onChange(async (value) => {
					const minutes = Number.parseInt(value, 10);
					if (Number.isInteger(minutes) && minutes >= 0) {
						this.plugin.settings.syncIntervalMinutes = minutes;
						await this.plugin.saveSettings();
						this.plugin.restartSyncScheduler();
					}
				}),
			);

		this.renderTickTick();
	}

	/** Editable list of project categories: name + color per row, with add/remove. */
	private renderCategories(): void {
		new Setting(this.containerEl)
			.setName('Categories')
			.setDesc('Used to group and filter projects. Renaming or removing one here does not relabel existing projects.')
			.setHeading();

		const listEl = this.containerEl.createDiv({ cls: 'ns-settings-categories' });

		// Update the registry in memory immediately, then persist; a failed save
		// surfaces as a Notice instead of a silently dropped promise.
		const applyCategories = (next: CategoryDef[]): void => {
			this.plugin.settings.categories = next;
			this.plugin
				.saveSettings()
				.catch((error: unknown) =>
					new Notice(`Neseser: could not save categories — ${error instanceof Error ? error.message : String(error)}`),
				);
		};

		this.plugin.settings.categories.forEach((category, idx) => {
			new Setting(listEl)
				.addText((text) =>
					text
						.setPlaceholder('Category name')
						.setValue(category.name)
						.onChange((value) =>
							applyCategories(
								this.plugin.settings.categories.map((c, i) => (i === idx ? { ...c, name: value } : c)),
							),
						),
				)
				.addColorPicker((picker) =>
					picker.setValue(category.color).onChange((value) =>
						applyCategories(
							this.plugin.settings.categories.map((c, i) => (i === idx ? { ...c, color: value } : c)),
						),
					),
				)
				.addExtraButton((btn) =>
					btn
						.setIcon('trash')
						.setTooltip('Remove category')
						.onClick(() => {
							applyCategories(this.plugin.settings.categories.filter((_, i) => i !== idx));
							this.display();
						}),
				);
		});

		new Setting(listEl).addButton((btn) =>
			btn.setButtonText('Add category').onClick(() => {
				applyCategories([...this.plugin.settings.categories, { name: 'New category', color: '#8a8a8a' }]);
				this.display();
			}),
		);
	}

	private renderProjectTemplates(): void {
		new Setting(this.containerEl)
			.setName('Project templates')
			.setDesc('Standard task lists available when creating a project.')
			.setHeading();

		const listEl = this.containerEl.createDiv({ cls: 'ns-settings-project-templates' });

		const applyTemplates = (next: ProjectTemplate[]): void => {
			this.plugin.settings.projectTemplates = cloneProjectTemplates(next);
			this.plugin
				.saveSettings()
				.catch((error: unknown) =>
					new Notice(`Neseser: could not save project templates — ${error instanceof Error ? error.message : String(error)}`),
				);
		};

		const updateTemplate = (templateId: string, updater: (template: ProjectTemplate) => ProjectTemplate): void => {
			applyTemplates(
				this.plugin.settings.projectTemplates.map((template) =>
					template.id === templateId ? updater(template) : template,
				),
			);
		};

		this.plugin.settings.projectTemplates.forEach((template) => {
			const templateEl = listEl.createDiv({ cls: 'ns-settings-project-template' });

			new Setting(templateEl)
				.addText((text) =>
					text
						.setPlaceholder('Template name')
						.setValue(template.name)
						.onChange((value) =>
							updateTemplate(template.id, (current) => ({ ...current, name: value })),
						),
				)
				.addExtraButton((btn) =>
					btn
						.setIcon('trash')
						.setTooltip('Remove template')
						.onClick(() => {
							applyTemplates(this.plugin.settings.projectTemplates.filter((item) => item.id !== template.id));
							this.display();
						}),
				);

			const tasksEl = templateEl.createDiv({ cls: 'ns-settings-template-tasks' });
			template.tasks.forEach((task, taskIdx) => {
				new Setting(tasksEl)
					.addText((text) =>
						text
							.setPlaceholder('Task title')
							.setValue(task.title)
							.onChange((value) =>
								updateTemplate(template.id, (current) => ({
									...current,
									tasks: current.tasks.map((item, idx) =>
										idx === taskIdx ? { ...item, title: value } : item,
									),
								})),
							),
					)
					.addDropdown((dd) => {
						for (const priority of PRIORITIES) dd.addOption(priority, priority);
						dd.setValue(task.priority);
						dd.onChange((value) =>
							updateTemplate(template.id, (current) => ({
								...current,
								tasks: current.tasks.map((item, idx) =>
									idx === taskIdx ? { ...item, priority: value as Priority } : item,
								),
							})),
						);
					})
					.addExtraButton((btn) =>
						btn
							.setIcon('trash')
							.setTooltip('Remove task')
							.onClick(() => {
								updateTemplate(template.id, (current) => ({
									...current,
									tasks: current.tasks.filter((_, idx) => idx !== taskIdx),
								}));
								this.display();
							}),
					);
			});

			new Setting(tasksEl).addButton((btn) =>
				btn.setButtonText('Add task').onClick(() => {
					updateTemplate(template.id, (current) => ({
						...current,
						tasks: [...current.tasks, { title: 'New task', priority: 'none' }],
					}));
					this.display();
				}),
			);
		});

		new Setting(listEl).addButton((btn) =>
			btn.setButtonText('Add template').onClick(() => {
				applyTemplates([
					...this.plugin.settings.projectTemplates,
					{
						id: createProjectTemplateId(this.plugin.settings.projectTemplates),
						name: 'New template',
						tasks: [],
					},
				]);
				this.display();
			}),
		);
	}

	private renderTickTick(): void {
		const connected = isTickTickConnected(this.plugin.settings);
		const status = connected
			? `Connected (token valid until ${new Date(this.plugin.settings.ticktickTokenExpiresAt).toLocaleDateString()})`
			: 'Not connected';

		new Setting(this.containerEl)
			.setName('Connection')
			.setDesc(status)
			.addButton((btn) =>
				btn
					.setButtonText(connected ? 'Reconnect' : 'Connect')
					.setCta()
					.onClick(async () => {
						try {
							await this.plugin.connectTickTick();
							new Notice('Neseser connected to TickTick');
						} catch (error) {
							new Notice(error instanceof Error ? error.message : String(error));
						}
						this.display();
					}),
			)
			.addButton((btn) =>
				btn.setButtonText('Disconnect').onClick(async () => {
					this.plugin.settings.ticktickAccessToken = '';
					this.plugin.settings.ticktickTokenExpiresAt = 0;
					await this.plugin.saveSettings();
					this.display();
				}),
			);
	}
}
