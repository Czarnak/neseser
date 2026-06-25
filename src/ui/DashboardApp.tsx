import { Project } from '../core/models';
import type { CategoryDef } from '../core/category-data';
import {
	allowedProjectNames,
	availableCategories,
	categoryOf,
	colorForCategory,
	filterProjectsByCategory,
	filterTasksByCategory,
} from '../core/category-data';
import type { CategoryFilterStore } from '../core/category-filter';
import type { InvalidEntry, TaskIndex } from '../core/task-index';
import { DeadlineEntry, compareProjects, taskProgress, upcomingDeadlines } from '../core/view-data';
import { burndownSeries } from '../core/burndown-data';
import { CategoryFilterBar } from './CategoryFilterBar';
import { useCategoryFilter } from './use-category-filter';
import { useIndexRefresh } from './use-index-refresh';
import { Sparkline } from './Sparkline';

export interface DashboardCallbacks {
	onOpenPath: (path: string) => void;
}

interface Props {
	index: TaskIndex;
	categoryFilter: CategoryFilterStore;
	getCategories: () => CategoryDef[];
	callbacks: DashboardCallbacks;
}

function ProjectCard({
	project,
	index,
	registry,
	callbacks,
}: {
	project: Project;
	index: TaskIndex;
	registry: CategoryDef[];
	callbacks: DashboardCallbacks;
}) {
	const tasks = index.getTasksForProject(project.name);
	const progress = taskProgress(tasks);
	const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
	const sparkValues = burndownSeries(tasks, new Date()).map((p) => p.open);
	const category = categoryOf(project);

	return (
		<div className="ns-project-card">
			<div className="ns-card-header">
				<span className="ns-task-title" onClick={() => callbacks.onOpenPath(project.path)}>
					{project.name}
				</span>
				<span className={`ns-badge ns-project-${project.status}`}>{project.status}</span>
			</div>
			<div className="ns-card-category">
				<span className="ns-category-dot" style={{ backgroundColor: colorForCategory(category, registry) }} />
				{category}
			</div>
			<div className="ns-progress">
				<div className="ns-progress-bar">
					<div className="ns-progress-fill" style={{ width: `${percent}%` }} />
				</div>
				<span className="ns-progress-text">
					{progress.done}/{progress.total}
				</span>
			</div>
			<Sparkline values={sparkValues} />
			{project.deadline && <div className="ns-card-deadline">Deadline: {project.deadline}</div>}
		</div>
	);
}

function DeadlineRow({ entry, callbacks }: { entry: DeadlineEntry; callbacks: DashboardCallbacks }) {
	return (
		<div className={`ns-deadline-row${entry.overdue ? ' ns-overdue' : ''}`}>
			<span className="ns-badge">{entry.kind}</span>
			<span className="ns-task-title" onClick={() => callbacks.onOpenPath(entry.path)}>
				{entry.title}
			</span>
			<span className="ns-badge ns-due">{entry.due}</span>
			{entry.overdue && <span className="ns-badge ns-overdue-badge">overdue</span>}
		</div>
	);
}

function IssueRow({ issue, callbacks }: { issue: InvalidEntry; callbacks: DashboardCallbacks }) {
	return (
		<div className="ns-issue-row">
			<span className="ns-task-title" onClick={() => callbacks.onOpenPath(issue.path)}>
				{issue.path}
			</span>
			<span className="ns-issue-reason">{issue.reason}</span>
		</div>
	);
}

export function DashboardApp({ index, categoryFilter, getCategories, callbacks }: Props) {
	useIndexRefresh(index);
	const active = useCategoryFilter(categoryFilter);

	const registry = getCategories();
	const allProjects = index.getAllProjects();
	const options = availableCategories(registry, allProjects);
	const projects = filterProjectsByCategory(allProjects, active).sort(compareProjects);
	const allowed = allowedProjectNames(allProjects, active);
	const tasks = filterTasksByCategory(index.getAllTasks(), allowed, (path) => index.projectNameForPath(path));
	const deadlines = upcomingDeadlines(projects, tasks, new Date());
	const issues = index.getInvalid();

	return (
		<div className="ns-dashboard">
			<h4 className="ns-section-heading">Projects</h4>
			<CategoryFilterBar options={options} active={active} onSelect={(value) => categoryFilter.set(value)} />
			{projects.length === 0 && <p className="ns-empty">No projects here. Run "Neseser: Create project".</p>}
			<div className="ns-project-grid">
				{projects.map((project) => (
					<ProjectCard
						key={project.path}
						project={project}
						index={index}
						registry={registry}
						callbacks={callbacks}
					/>
				))}
			</div>

			<h4 className="ns-section-heading">Upcoming deadlines</h4>
			{deadlines.length === 0 && <p className="ns-empty">Nothing due in the next two weeks.</p>}
			{deadlines.map((entry) => (
				<DeadlineRow key={`${entry.kind}:${entry.path}`} entry={entry} callbacks={callbacks} />
			))}

			{issues.length > 0 && (
				<>
					<h4 className="ns-section-heading">Sync issues</h4>
					<p className="ns-empty">These notes have invalid frontmatter and are excluded from views and sync.</p>
					{issues.map((issue) => (
						<IssueRow key={issue.path} issue={issue} callbacks={callbacks} />
					))}
				</>
			)}
		</div>
	);
}
