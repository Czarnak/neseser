import type { CategoryDef } from '../core/category-data';
import { availableCategories, categoryOf, colorForCategory, filterProjectsByCategory } from '../core/category-data';
import type { CategoryFilterStore } from '../core/category-filter';
import type { TaskIndex } from '../core/task-index';
import { compareProjects } from '../core/view-data';
import { SyncStatusStore, formatSyncStatus } from '../sync/sync-status';
import { CategoryFilterBar } from './CategoryFilterBar';
import { useCategoryFilter } from './use-category-filter';
import { useIndexRefresh } from './use-index-refresh';
import { useSyncStatus } from './use-sync-status';

export interface NavigationCallbacks {
	onOpenToday: () => void;
	onOpenDashboard: () => void;
	onOpenKanban: () => void;
	onOpenCalendar: () => void;
	onOpenGantt: () => void;
	onOpenProject: (path: string) => void;
	onCreateProject: () => void;
	onCreateTask: () => void;
	onSyncNow: () => void;
	onConnect: () => void;
}

interface Props {
	index: TaskIndex;
	syncStatus: SyncStatusStore;
	categoryFilter: CategoryFilterStore;
	getCategories: () => CategoryDef[];
	callbacks: NavigationCallbacks;
}

export function NavigationApp({ index, syncStatus, categoryFilter, getCategories, callbacks }: Props) {
	useIndexRefresh(index);
	const status = useSyncStatus(syncStatus);
	const active = useCategoryFilter(categoryFilter);

	const registry = getCategories();
	const allProjects = index.getAllProjects();
	const options = availableCategories(registry, allProjects);
	const projects = filterProjectsByCategory(allProjects, active).sort(compareProjects);

	return (
		<div className="ns-nav">
			<div className="ns-nav-section">
				<h4 className="ns-section-heading">Views</h4>
				<div className="ns-nav-buttons">
					<button onClick={callbacks.onOpenToday}>Today</button>
					<button onClick={callbacks.onOpenDashboard}>Dashboard</button>
					<button onClick={callbacks.onOpenKanban}>Kanban board</button>
					<button onClick={callbacks.onOpenCalendar}>Calendar</button>
					<button onClick={callbacks.onOpenGantt}>Gantt</button>
				</div>
			</div>

			<div className="ns-nav-section">
				<h4 className="ns-section-heading">Projects</h4>
				<CategoryFilterBar options={options} active={active} onSelect={(value) => categoryFilter.set(value)} />
				{projects.length === 0 && <p className="ns-empty">No projects here.</p>}
				{projects.map((project) => {
					const cat = categoryOf(project);
					return (
						<div key={project.path} className="ns-nav-project-row">
							<span
								className="ns-nav-project-main"
								onClick={() => callbacks.onOpenProject(project.path)}
							>
								<span
									className="ns-category-dot"
									style={{ backgroundColor: colorForCategory(cat, registry) }}
									title={cat}
								/>
								<span className="ns-nav-project-name">{project.name}</span>
							</span>
							<span className={`ns-badge ns-project-${project.status}`}>{project.status}</span>
						</div>
					);
				})}
				<div className="ns-nav-buttons">
					<button onClick={callbacks.onCreateProject}>Add project</button>
					<button onClick={callbacks.onCreateTask}>Add task</button>
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
