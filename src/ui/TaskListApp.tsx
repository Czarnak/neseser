import { useMemo, useState } from 'react';
import { Task, TaskStatus } from '../core/models';
import type { TaskIndex, TaskTreeNode } from '../core/task-index';
import { compareTasks } from '../core/view-data';
import { useIndexRefresh } from './use-index-refresh';

export interface TaskListCallbacks {
	onToggleTask: (task: Task) => void;
	onOpenTask: (task: Task) => void;
}

interface Props {
	index: TaskIndex;
	callbacks: TaskListCallbacks;
}

const HIDDEN_STATUSES_DEFAULT: TaskStatus[] = ['done', 'cancelled'];

function sortTree(nodes: TaskTreeNode[]): TaskTreeNode[] {
	return [...nodes]
		.sort((a, b) => compareTasks(a.task, b.task))
		.map((n) => ({ task: n.task, children: sortTree(n.children) }));
}

function TaskRow({
	node,
	depth,
	showDone,
	callbacks,
}: {
	node: TaskTreeNode;
	depth: number;
	showDone: boolean;
	callbacks: TaskListCallbacks;
}) {
	const { task } = node;
	const hidden = !showDone && HIDDEN_STATUSES_DEFAULT.includes(task.status);
	if (hidden && node.children.length === 0) return null;

	return (
		<>
			{!hidden && (
				<div className="ns-task-row" style={{ paddingLeft: `${depth * 18}px` }}>
					<input
						type="checkbox"
						checked={task.status === 'done'}
						onChange={() => callbacks.onToggleTask(task)}
					/>
					<span
						className={`ns-task-title ns-status-${task.status}`}
						onClick={() => callbacks.onOpenTask(task)}
					>
						{task.title}
					</span>
					{task.priority !== 'none' && (
						<span className={`ns-badge ns-priority-${task.priority}`}>{task.priority}</span>
					)}
					{task.due && <span className="ns-badge ns-due">{task.due}</span>}
					{task.status === 'in-progress' && <span className="ns-badge ns-in-progress">in progress</span>}
				</div>
			)}
			{sortTree(node.children).map((child) => (
				<TaskRow
					key={child.task.path}
					node={child}
					depth={hidden ? depth : depth + 1}
					showDone={showDone}
					callbacks={callbacks}
				/>
			))}
		</>
	);
}

export function TaskListApp({ index, callbacks }: Props) {
	useIndexRefresh(index);

	const [projectFilter, setProjectFilter] = useState<string>('');
	const [showDone, setShowDone] = useState(false);

	const projects = index.getAllProjects();
	const visibleProjects = useMemo(
		() => (projectFilter ? projects.filter((p) => p.name === projectFilter) : projects),
		[projects, projectFilter],
	);

	return (
		<div className="ns-task-list">
			<div className="ns-toolbar">
				<select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
					<option value="">All projects</option>
					{projects.map((p) => (
						<option key={p.path} value={p.name}>
							{p.name}
						</option>
					))}
				</select>
				<label className="ns-show-done">
					<input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
					Show done
				</label>
			</div>

			{visibleProjects.length === 0 && <p className="ns-empty">No projects yet. Run "Neseser: Create project".</p>}

			{visibleProjects.map((project) => {
				const tree = sortTree(index.getTaskTree(project.name));
				return (
					<section key={project.path} className="ns-project-section">
						<h4 className="ns-project-heading">{project.name}</h4>
						{tree.length === 0 && <p className="ns-empty">No tasks.</p>}
						{tree.map((node) => (
							<TaskRow key={node.task.path} node={node} depth={0} showDone={showDone} callbacks={callbacks} />
						))}
					</section>
				);
			})}
		</div>
	);
}
