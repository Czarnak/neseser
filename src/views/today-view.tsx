import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { Task } from '../core/models';
import type { ProjectManager } from '../core/project-manager';
import type { TaskIndex } from '../core/task-index';
import { TodayApp } from '../ui/TodayApp';

export const VIEW_TYPE_TODAY = 'neseser-today';

export class TodayView extends ItemView {
	private root: Root | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private index: TaskIndex,
		private manager: ProjectManager,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_TODAY;
	}

	getDisplayText(): string {
		return 'Neseser today';
	}

	override getIcon(): string {
		return 'calendar-check';
	}

	override async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		this.root = createRoot(container);
		this.root.render(
			<TodayApp
				index={this.index}
				callbacks={{
					onToggleTask: (task: Task, done: boolean) => {
						this.manager
							.updateTaskStatus(task.path, done ? 'done' : 'todo')
							.catch((error: unknown) => {
								new Notice(
									`Could not update task: ${error instanceof Error ? error.message : String(error)}`,
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
