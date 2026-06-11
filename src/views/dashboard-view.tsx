import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import type { TaskIndex } from '../core/task-index';
import { DashboardApp } from '../ui/DashboardApp';

export const VIEW_TYPE_DASHBOARD = 'neseser-dashboard';

export class DashboardView extends ItemView {
	private root: Root | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private index: TaskIndex,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_DASHBOARD;
	}

	getDisplayText(): string {
		return 'Neseser dashboard';
	}

	override getIcon(): string {
		return 'layout-dashboard';
	}

	override async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		this.root = createRoot(container);
		this.root.render(
			<DashboardApp
				index={this.index}
				callbacks={{
					onOpenPath: (path: string) => {
						void this.app.workspace.openLinkText(path, '', false);
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
