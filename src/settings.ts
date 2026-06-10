import { App, PluginSettingTab, Setting } from 'obsidian';
import type NeseserPlugin from './main';

export interface NeseserSettings {
	projectsRoot: string;
}

export const DEFAULT_SETTINGS: NeseserSettings = {
	projectsRoot: 'Projects',
};

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
	}
}
