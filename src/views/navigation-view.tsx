import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import type { TaskIndex } from '../core/task-index';
import type { SyncStatusStore } from '../sync/sync-status';
import { NavigationApp, NavigationCallbacks } from '../ui/NavigationApp';

export const VIEW_TYPE_NAVIGATION = 'neseser-navigation';

/** Note opening is view-owned; everything else is injected by the plugin. */
export type NavigationViewCallbacks = Omit<NavigationCallbacks, 'onOpenProject'>;

export class NavigationView extends ItemView {
	private root: Root | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private index: TaskIndex,
		private syncStatus: SyncStatusStore,
		private callbacks: NavigationViewCallbacks,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_NAVIGATION;
	}

	getDisplayText(): string {
		return 'Neseser';
	}

	override getIcon(): string {
		return 'compass';
	}

	override async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		this.root = createRoot(container);
		this.root.render(
			<NavigationApp
				index={this.index}
				syncStatus={this.syncStatus}
				callbacks={{
					...this.callbacks,
					onOpenProject: (path: string) => {
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
