import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { rescheduleDue } from '../core/calendar-data';
import type { CategoryDef } from '../core/category-data';
import type { CategoryFilterStore } from '../core/category-filter';
import { Task } from '../core/models';
import type { ProjectManager } from '../core/project-manager';
import type { TaskIndex } from '../core/task-index';
import { CalendarApp } from '../ui/CalendarApp';

export const VIEW_TYPE_CALENDAR = 'neseser-calendar';

export class CalendarView extends ItemView {
	private root: Root | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private index: TaskIndex,
		private manager: ProjectManager,
		private categoryFilter: CategoryFilterStore,
		private getCategories: () => CategoryDef[],
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}

	getDisplayText(): string {
		return 'Neseser calendar';
	}

	override getIcon(): string {
		return 'calendar';
	}

	override async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		this.root = createRoot(container);
		this.root.render(
			<CalendarApp
				index={this.index}
				categoryFilter={this.categoryFilter}
				getCategories={this.getCategories}
				callbacks={{
					onRescheduleTask: (task: Task, dayKey: string) => {
						this.manager.updateTaskDue(task.path, rescheduleDue(task.due, dayKey)).catch((error: unknown) => {
							new Notice(
								`Could not reschedule task: ${error instanceof Error ? error.message : String(error)}`,
							);
						});
					},
					onOpenTask: (task: Task) => {
						void this.app.workspace.openLinkText(task.path, '', false);
					},
				}}
			/>,
		);
	}

	override async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}
}
