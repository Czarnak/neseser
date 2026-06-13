import { useState } from 'react';
import { Task } from '../core/models';
import type { TaskIndex } from '../core/task-index';
import { overdueDays, todayGroups } from '../core/today-data';
import { useIndexRefresh } from './use-index-refresh';

export interface TodayCallbacks {
	onToggleTask: (task: Task, done: boolean) => void;
	onOpenTask: (task: Task) => void;
}

interface Props {
	index: TaskIndex;
	callbacks: TodayCallbacks;
}

function timeSuffix(due: string): string | null {
	const match = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(due);
	return match?.[1] ?? null;
}

function TaskRow({
	task,
	projectName,
	dueBadge,
	pending,
	onToggle,
	onOpen,
}: {
	task: Task;
	projectName: string | null;
	dueBadge: string | null;
	pending: boolean;
	onToggle: (done: boolean) => void;
	onOpen: () => void;
}) {
	const isDone = pending ? true : task.status === 'done';

	return (
		<div className="ns-today-row">
			<input
				className="ns-today-checkbox"
				type="checkbox"
				aria-label={task.title}
				checked={isDone}
				onChange={(e) => onToggle(e.target.checked)}
			/>
			<button type="button" className="ns-task-title" onClick={onOpen}>
				{task.title}
			</button>
			{projectName && <span className="ns-badge">{projectName}</span>}
			{dueBadge && <span className="ns-badge ns-due">{dueBadge}</span>}
			{task.priority !== 'none' && (
				<span className={`ns-badge ns-priority-${task.priority}`}>{task.priority}</span>
			)}
		</div>
	);
}

export function TodayApp({ index, callbacks }: Props) {
	useIndexRefresh(index);
	// Paths of tasks toggled done optimistically before the next index refresh
	const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

	const now = new Date();
	const tasks = index.getAllTasks();
	const { overdue, today } = todayGroups(tasks, now);

	const handleToggle = (task: Task, done: boolean) => {
		if (done) {
			setPending((prev) => new Set([...prev, task.path]));
		} else {
			setPending((prev) => {
				const next = new Set(prev);
				next.delete(task.path);
				return next;
			});
		}
		callbacks.onToggleTask(task, done);
	};

	const renderRow = (task: Task, dueBadge: string | null) => (
		<TaskRow
			key={task.path}
			task={task}
			projectName={index.projectNameForPath(task.path)}
			dueBadge={dueBadge}
			pending={pending.has(task.path)}
			onToggle={(done) => handleToggle(task, done)}
			onOpen={() => callbacks.onOpenTask(task)}
		/>
	);

	const hasContent = overdue.length > 0 || today.length > 0;

	return (
		<div className="ns-today">
			{!hasContent && <p className="ns-empty">Nothing due today. You are caught up!</p>}

			{overdue.length > 0 && (
				<>
					<h5 className="ns-today-group-heading">Overdue</h5>
					{overdue.map((task) => {
						const days = overdueDays(task.due!, now);
						const badge = days !== null && days > 0 ? `${days}d overdue` : null;
						return renderRow(task, badge);
					})}
				</>
			)}

			{today.length > 0 && (
				<>
					<h5 className="ns-today-group-heading">Today</h5>
					{today.map((task) => renderRow(task, timeSuffix(task.due ?? '')))}
				</>
			)}
		</div>
	);
}
