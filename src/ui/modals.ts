import { App, Modal, Notice, Setting } from 'obsidian';
import { PRIORITIES, Priority } from '../core/models';
import type { CreateProjectInput, CreateTaskInput } from '../core/project-manager';
import type { TaskIndex } from '../core/task-index';

abstract class SubmitModal extends Modal {
	protected abstract submit(): Promise<void>;

	protected addSubmitButton(label: string): void {
		new Setting(this.contentEl).addButton((btn) =>
			btn
				.setButtonText(label)
				.setCta()
				.onClick(() => void this.trySubmit()),
		);
		this.scope.register([], 'Enter', (evt) => {
			if (evt.target instanceof HTMLInputElement) void this.trySubmit();
		});
	}

	private async trySubmit(): Promise<void> {
		try {
			await this.submit();
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}

export class NewProjectModal extends SubmitModal {
	private name = '';
	private deadline = '';

	constructor(
		app: App,
		private onSubmit: (input: CreateProjectInput) => Promise<void>,
	) {
		super(app);
	}

	override onOpen(): void {
		this.titleEl.setText('New project');

		new Setting(this.contentEl).setName('Name').addText((text) => {
			text.onChange((value) => (this.name = value));
			text.inputEl.focus();
		});

		new Setting(this.contentEl)
			.setName('Deadline')
			.setDesc('Optional, YYYY-MM-DD')
			.addText((text) => text.setPlaceholder('2026-12-31').onChange((value) => (this.deadline = value)));

		this.addSubmitButton('Create project');
	}

	protected async submit(): Promise<void> {
		await this.onSubmit({
			name: this.name,
			deadline: this.deadline.trim() || undefined,
		});
	}
}

export class NewTaskModal extends SubmitModal {
	private projectName = '';
	private taskTitle = '';
	private due = '';
	private priority: Priority = 'none';
	private parent = '';

	constructor(
		app: App,
		private index: TaskIndex,
		private onSubmit: (input: CreateTaskInput) => Promise<void>,
		defaultProject?: string,
	) {
		super(app);
		this.projectName = defaultProject ?? '';
	}

	override onOpen(): void {
		this.titleEl.setText('New task');

		const projects = this.index.getAllProjects().map((p) => p.name);
		if (!this.projectName) this.projectName = projects[0] ?? '';

		let parentSetting: Setting;
		const refreshParentOptions = (dropdown: HTMLSelectElement): void => {
			dropdown.empty();
			dropdown.createEl('option', { value: '', text: '(none)' });
			for (const task of this.index.getTasksForProject(this.projectName)) {
				dropdown.createEl('option', { value: task.title, text: task.title });
			}
		};

		new Setting(this.contentEl).setName('Project').addDropdown((dd) => {
			for (const name of projects) dd.addOption(name, name);
			dd.setValue(this.projectName);
			dd.onChange((value) => {
				this.projectName = value;
				this.parent = '';
				const select = parentSetting.controlEl.querySelector('select');
				if (select) refreshParentOptions(select);
			});
		});

		new Setting(this.contentEl).setName('Title').addText((text) => {
			text.onChange((value) => (this.taskTitle = value));
			text.inputEl.focus();
		});

		new Setting(this.contentEl)
			.setName('Due')
			.setDesc('Optional, YYYY-MM-DD')
			.addText((text) => text.setPlaceholder('2026-06-15').onChange((value) => (this.due = value)));

		new Setting(this.contentEl).setName('Priority').addDropdown((dd) => {
			for (const p of PRIORITIES) dd.addOption(p, p);
			dd.setValue(this.priority);
			dd.onChange((value) => (this.priority = value as Priority));
		});

		parentSetting = new Setting(this.contentEl).setName('Parent task').addDropdown((dd) => {
			refreshParentOptions(dd.selectEl);
			dd.onChange((value) => (this.parent = value));
		});

		this.addSubmitButton('Create task');
	}

	protected async submit(): Promise<void> {
		if (!this.projectName) throw new Error('Create a project first');
		await this.onSubmit({
			projectName: this.projectName,
			title: this.taskTitle,
			due: this.due.trim() || undefined,
			priority: this.priority,
			parent: this.parent || undefined,
		});
	}
}
