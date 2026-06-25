import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import type { CategoryDef } from '../core/category-data';
import type { CategoryFilterStore } from '../core/category-filter';
import { computeMoveResult, computeResizeResult } from '../core/gantt-data';
import { Task } from '../core/models';
import type { ProjectManager } from '../core/project-manager';
import type { TaskIndex } from '../core/task-index';
import { GanttApp } from '../ui/GanttApp';

export const VIEW_TYPE_GANTT = 'neseser-gantt';

export class GanttView extends ItemView {
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
		return VIEW_TYPE_GANTT;
	}

	getDisplayText(): string {
		return 'Neseser Gantt';
	}

	override getIcon(): string {
		return 'gantt-chart';
	}

	override async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		this.root = createRoot(container);
		this.root.render(
			<GanttApp
				index={this.index}
				categoryFilter={this.categoryFilter}
				getCategories={this.getCategories}
				callbacks={{
					onMoveTask: (task: Task, dayDelta: number) => {
						const newDates = computeMoveResult(task.start, task.due, dayDelta);
						if (!newDates) return;
						this.manager.updateTaskDates(task.path, newDates).catch((error: unknown) => {
							new Notice(
								`Could not move task: ${error instanceof Error ? error.message : String(error)}`,
							);
						});
					},
					onResizeTask: (task: Task, dayDelta: number, edge: 'start' | 'end') => {
						const newDates = computeResizeResult(task.start, task.due, dayDelta, edge);
						if (!newDates) return;
						this.manager.updateTaskDates(task.path, newDates).catch((error: unknown) => {
							new Notice(
								`Could not resize task: ${error instanceof Error ? error.message : String(error)}`,
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
