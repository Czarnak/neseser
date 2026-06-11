import { Project } from '../core/models';
import type { InvalidEntry, TaskIndex } from '../core/task-index';
import { DeadlineEntry, compareProjects, taskProgress, upcomingDeadlines } from '../core/view-data';
import { useIndexRefresh } from './use-index-refresh';

export interface DashboardCallbacks {
	onOpenPath: (path: string) => void;
}

interface Props {
	index: TaskIndex;
	callbacks: DashboardCallbacks;
}

function ProjectCard({ project, index, callbacks }: { project: Project; index: TaskIndex; callbacks: DashboardCallbacks }) {
	const progress = taskProgress(index.getTasksForProject(project.name));
	const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

	return (
		<div className="ns-project-card">
			<div className="ns-card-header">
				<span className="ns-task-title" onClick={() => callbacks.onOpenPath(project.path)}>
					{project.name}
				</span>
				<span className={`ns-badge ns-project-${project.status}`}>{project.status}</span>
			</div>
			<div className="ns-progress">
				<div className="ns-progress-bar">
					<div className="ns-progress-fill" style={{ width: `${percent}%` }} />
				</div>
				<span className="ns-progress-text">
					{progress.done}/{progress.total}
				</span>
			</div>
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

export function DashboardApp({ index, callbacks }: Props) {
	useIndexRefresh(index);

	const projects = [...index.getAllProjects()].sort(compareProjects);
	const deadlines = upcomingDeadlines(projects, index.getAllTasks(), new Date());
	const issues = index.getInvalid();

	return (
		<div className="ns-dashboard">
			<h4 className="ns-section-heading">Projects</h4>
			{projects.length === 0 && <p className="ns-empty">No projects yet. Run "Neseser: Create project".</p>}
			<div className="ns-project-grid">
				{projects.map((project) => (
					<ProjectCard key={project.path} project={project} index={index} callbacks={callbacks} />
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
