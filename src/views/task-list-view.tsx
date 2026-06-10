import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { Task } from '../core/models';
import type { ProjectManager } from '../core/project-manager';
import type { TaskIndex } from '../core/task-index';
import { TaskListApp } from '../ui/TaskListApp';

export const VIEW_TYPE_TASK_LIST = 'neseser-task-list';

export class TaskListView extends ItemView {
	private root: Root | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private index: TaskIndex,
		private manager: ProjectManager,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_TASK_LIST;
	}

	getDisplayText(): string {
		return 'Neseser tasks';
	}

	override getIcon(): string {
		return 'list-checks';
	}

	override async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		this.root = createRoot(container);
		this.root.render(
			<TaskListApp
				index={this.index}
				callbacks={{
					onToggleTask: (task: Task) => {
						const update =
							task.status === 'done'
								? this.manager.updateTaskStatus(task.path, 'todo')
								: this.manager.completeTask(task.path);
						update.catch((error: unknown) => {
							new Notice(`Could not update task: ${error instanceof Error ? error.message : String(error)}`);
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
