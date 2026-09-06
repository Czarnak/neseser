import { App, Modal, Notice, Setting, SuggestModal } from 'obsidian';
import { PRIORITIES, Priority, RECURRENCES, Recurrence } from '../core/models';
import type { CreateProjectInput, CreateTaskInput } from '../core/project-manager';
import type { TaskIndex } from '../core/task-index';

export interface ProjectTemplateOption {
	name: string;
}

export interface NewProjectModalInput extends CreateProjectInput {
	templateName?: string;
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
	private templateName = '';

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
		let categoryInput: { setDisabled(disabled: boolean): unknown } | null = null;
		let deadlineInput: { setDisabled(disabled: boolean): unknown } | null = null;
		const refreshMetadataInputs = (): void => {
			const disabled = this.templateName !== '';
			categoryInput?.setDisabled(disabled);
			deadlineInput?.setDisabled(disabled);
		};

		new Setting(this.contentEl).setName('Name').addText((text) => {
			text.onChange((value) => (this.name = value));
			text.inputEl.focus();
		});

		new Setting(this.contentEl).setName('Category').addDropdown((dd) => {
			categoryInput = dd;
			dd.addOption('', '(none)');
			for (const name of this.categories) dd.addOption(name, name);
			dd.setValue(this.category);
			dd.onChange((value) => (this.category = value));
		});

		new Setting(this.contentEl)
			.setName('Deadline')
			.setDesc('Optional, YYYY-MM-DD')
			.addText((text) => {
				deadlineInput = text;
				text.setPlaceholder('2026-12-31').onChange((value) => (this.deadline = value));
			});

		if (this.templates.length > 0) {
			new Setting(this.contentEl).setName('Template').addDropdown((dd) => {
				dd.addOption('', '(none)');
				for (const template of this.templates) {
					dd.addOption(template.name, template.name);
				}
				dd.setValue(this.templateName);
				dd.onChange((value) => {
					this.templateName = value;
					refreshMetadataInputs();
				});
			});
		}
		refreshMetadataInputs();

		this.addSubmitButton('Create project');
	}

	protected async submit(): Promise<void> {
		const usesTemplate = this.templateName !== '';
		await this.onSubmit({
			name: this.name,
			category: usesTemplate ? undefined : this.category.trim() || undefined,
			deadline: usesTemplate ? undefined : this.deadline.trim() || undefined,
			templateName: this.templateName || undefined,
		});
	}
}

export class NewTaskModal extends SubmitModal {
	private projectName = '';
	private taskTitle = '';
	private start = '';
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
			.setName('Start')
			.setDesc('Optional, YYYY-MM-DD')
			.addText((text) => text.setPlaceholder('2026-06-10').onChange((value) => (this.start = value)));

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
			start: this.start.trim() || undefined,
			due: this.due.trim() || undefined,
			priority: this.priority,
			recurrence: this.recurrence || undefined,
			parent: this.parent || undefined,
		});
	}
}

/**
 * Single-choice picker backing the "Set task priority" / "Set ... status" commands and
 * their file-menu entries. Obsidian's public Menu API has no setSubmenu, so the menu
 * opens this rather than nesting the choices inline.
 */
export class OptionPickerModal<T extends string> extends SuggestModal<T> {
	constructor(
		app: App,
		private options: readonly T[],
		private current: T,
		private onChoose: (value: T) => Promise<void>,
		placeholder: string,
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getSuggestions(query: string): T[] {
		const needle = query.trim().toLowerCase();
		return this.options.filter((option) => option.includes(needle));
	}

	renderSuggestion(value: T, el: HTMLElement): void {
		el.setText(value === this.current ? `${value}  ✓` : value);
	}

	onChooseSuggestion(item: T): void {
		void this.onChoose(item);
	}
}
