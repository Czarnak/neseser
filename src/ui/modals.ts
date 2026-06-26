import { App, Modal, Notice, Setting } from 'obsidian';
import { PRIORITIES, Priority, RECURRENCES, Recurrence } from '../core/models';
import type { CreateProjectInput, CreateTaskInput } from '../core/project-manager';
import type { TaskIndex } from '../core/task-index';

export interface ProjectTemplateOption {
	id: string;
	name: string;
	taskCount: number;
}

export interface NewProjectModalInput extends CreateProjectInput {
	templateId?: string;
}

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
	private category = '';
	private deadline = '';
	private templateId = '';

	constructor(
		app: App,
		private onSubmit: (input: NewProjectModalInput) => Promise<void>,
		private categories: string[] = [],
		private templates: ProjectTemplateOption[] = [],
	) {
		super(app);
	}

	override onOpen(): void {
		this.titleEl.setText('New project');

		new Setting(this.contentEl).setName('Name').addText((text) => {
			text.onChange((value) => (this.name = value));
			text.inputEl.focus();
		});

		new Setting(this.contentEl).setName('Category').addDropdown((dd) => {
			dd.addOption('', '(none)');
			for (const name of this.categories) dd.addOption(name, name);
			dd.setValue(this.category);
			dd.onChange((value) => (this.category = value));
		});

		new Setting(this.contentEl)
			.setName('Deadline')
			.setDesc('Optional, YYYY-MM-DD')
			.addText((text) => text.setPlaceholder('2026-12-31').onChange((value) => (this.deadline = value)));

		if (this.templates.length > 0) {
			new Setting(this.contentEl).setName('Template').addDropdown((dd) => {
				dd.addOption('', '(none)');
				for (const template of this.templates) {
					const count = template.taskCount === 1 ? '1 task' : `${template.taskCount} tasks`;
					dd.addOption(template.id, `${template.name} (${count})`);
				}
				dd.setValue(this.templateId);
				dd.onChange((value) => (this.templateId = value));
			});
		}

		this.addSubmitButton('Create project');
	}

	protected async submit(): Promise<void> {
		await this.onSubmit({
			name: this.name,
			category: this.category.trim() || undefined,
			deadline: this.deadline.trim() || undefined,
			templateId: this.templateId || undefined,
		});
	}
}

export class NewTaskModal extends SubmitModal {
	private projectName = '';
	private taskTitle = '';
	private due = '';
	private priority: Priority = 'none';
	private recurrence: Recurrence | '' = '';
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

		new Setting(this.contentEl).setName('Recurrence').addDropdown((dd) => {
			dd.addOption('', '(none)');
			for (const r of RECURRENCES) dd.addOption(r, r);
			dd.setValue(this.recurrence);
			dd.onChange((value) => (this.recurrence = (RECURRENCES as readonly string[]).includes(value) ? (value as Recurrence) : ''));
		});

		parentSetting = new Setting(this.contentEl).setName('Parent task').addDropdown((dd) => {
			refreshParentOptions(dd.selectEl);
			dd.onChange((value) => (this.parent = value));
		});

		this.addSubmitButton('Create task');
	}

	protected async submit(): Promise<void> {
		if (!this.projectName) throw new Error('Create a project first');
		if (this.recurrence && !this.due.trim()) throw new Error('Recurring tasks need a due date');
		await this.onSubmit({
			projectName: this.projectName,
			title: this.taskTitle,
			due: this.due.trim() || undefined,
			priority: this.priority,
			recurrence: this.recurrence || undefined,
			parent: this.parent || undefined,
		});
	}
}
