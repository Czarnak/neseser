import type { TaskIndex } from '../core/task-index';
import { compareProjects } from '../core/view-data';
import { SyncStatusStore, formatSyncStatus } from '../sync/sync-status';
import { useIndexRefresh } from './use-index-refresh';
import { useSyncStatus } from './use-sync-status';

export interface NavigationCallbacks {
	onOpenDashboard: () => void;
	onOpenKanban: () => void;
	onOpenCalendar: () => void;
	onOpenProject: (path: string) => void;
	onCreateProject: () => void;
	onSyncNow: () => void;
	onConnect: () => void;
}

interface Props {
	index: TaskIndex;
	syncStatus: SyncStatusStore;
	callbacks: NavigationCallbacks;
}

export function NavigationApp({ index, syncStatus, callbacks }: Props) {
	useIndexRefresh(index);
	const status = useSyncStatus(syncStatus);

	const projects = [...index.getAllProjects()].sort(compareProjects);

	return (
		<div className="ns-nav">
			<div className="ns-nav-section">
				<h4 className="ns-section-heading">Views</h4>
				<div className="ns-nav-buttons">
					<button onClick={callbacks.onOpenDashboard}>Dashboard</button>
					<button onClick={callbacks.onOpenKanban}>Kanban board</button>
					<button onClick={callbacks.onOpenCalendar}>Calendar</button>				</div>
			</div>

			<div className="ns-nav-section">
				<h4 className="ns-section-heading">Projects</h4>
				{projects.length === 0 && <p className="ns-empty">No projects yet.</p>}
				{projects.map((project) => (
					<div key={project.path} className="ns-nav-project-row">
						<span className="ns-nav-project-name" onClick={() => callbacks.onOpenProject(project.path)}>
							{project.name}
						</span>
						<span className={`ns-badge ns-project-${project.status}`}>{project.status}</span>
					</div>
				))}
				<div className="ns-nav-buttons">
					<button onClick={callbacks.onCreateProject}>Add project</button>
				</div>
			</div>

			<div className="ns-nav-section">
				<h4 className="ns-section-heading">TickTick</h4>
				<p className={`ns-nav-sync-status${status.state === 'error' ? ' ns-nav-sync-error' : ''}`}>
					{formatSyncStatus(status)}
				</p>
				<div className="ns-nav-buttons">
					{status.state === 'disconnected' ? (
						<button onClick={callbacks.onConnect}>Connect</button>
					) : (
						<button onClick={callbacks.onSyncNow} disabled={status.state === 'syncing'}>
							Sync now
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
