import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type NeseserPlugin from './main';

export interface NeseserSettings {
	projectsRoot: string;
	ticktickClientId: string;
	ticktickClientSecret: string;
	ticktickPort: number;
	ticktickAccessToken: string;
	/** epoch ms; 0 = not connected */
	ticktickTokenExpiresAt: number;
	/** automatic two-way sync cadence; 0 disables */
	syncIntervalMinutes: number;
}

export const DEFAULT_SETTINGS: NeseserSettings = {
	projectsRoot: 'Projects',
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
