import {
	DndContext,
	DragEndEvent,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import { useState } from 'react';
import { Task, TaskStatus } from '../core/models';
import type { CategoryDef } from '../core/category-data';
import {
	allowedProjectNames,
	availableCategories,
	filterProjectsByCategory,
	filterTasksByCategory,
} from '../core/category-data';
import type { CategoryFilterStore } from '../core/category-filter';
import type { TaskIndex } from '../core/task-index';
import { KanbanColumn, buildKanbanColumns } from '../core/view-data';
import { CategoryFilterBar } from './CategoryFilterBar';
import { useCategoryFilter } from './use-category-filter';
import { useDragClickGuard } from './use-drag-click-guard';
import { useIndexRefresh } from './use-index-refresh';

export interface KanbanCallbacks {
	onMoveTask: (task: Task, status: TaskStatus) => void;
	onOpenTask: (task: Task) => void;
}

interface Props {
	index: TaskIndex;
	categoryFilter: CategoryFilterStore;
	getCategories: () => CategoryDef[];
	callbacks: KanbanCallbacks;
}

/** Distance before a pointer press becomes a drag, so plain clicks still open the note. */
const DRAG_ACTIVATION_DISTANCE_PX = 4;

const COLUMN_LABELS: Record<TaskStatus, string> = {
	todo: 'To do',
	'in-progress': 'In progress',
	done: 'Done',
	cancelled: 'Cancelled',
};

function Card({
	task,
	projectName,
	onOpen,
}: {
	task: Task;
	projectName: string | null;
	onOpen: (task: Task) => void;
}) {
	const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.path });
	const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`ns-kanban-card${isDragging ? ' ns-kanban-card-dragging' : ''}`}
			onClick={() => onOpen(task)}
			{...listeners}
			{...attributes}
		>
			<div className="ns-kanban-card-title">{task.title}</div>
			<div className="ns-kanban-card-meta">
				{projectName && <span className="ns-badge">{projectName}</span>}
				{task.due && <span className="ns-badge ns-due">{task.due}</span>}
				{task.priority !== 'none' && (
					<span className={`ns-badge ns-priority-${task.priority}`}>{task.priority}</span>
				)}
			</div>
		</div>
	);
}

function Column({
	column,
	index,
	showProject,
	onOpen,
}: {
	column: KanbanColumn;
	index: TaskIndex;
	showProject: boolean;
	onOpen: (task: Task) => void;
}) {
	const { setNodeRef, isOver } = useDroppable({ id: column.status });

	return (
		<div ref={setNodeRef} className={`ns-kanban-column${isOver ? ' ns-kanban-column-over' : ''}`}>
			<h5 className="ns-kanban-column-heading">
				{COLUMN_LABELS[column.status]}
				<span className="ns-kanban-count">{column.tasks.length}</span>
			</h5>
			{column.tasks.map((task) => (
				<Card
					key={task.path}
					task={task}
					projectName={showProject ? index.projectNameForPath(task.path) : null}
					onOpen={onOpen}
				/>
			))}
		</div>
	);
}

export function KanbanApp({ index, categoryFilter, getCategories, callbacks }: Props) {
	useIndexRefresh(index);
	const active = useCategoryFilter(categoryFilter);

	const [projectFilter, setProjectFilter] = useState<string>('');
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX } }),
	);
	const guard = useDragClickGuard();

	const allProjects = index.getAllProjects();
	const options = availableCategories(getCategories(), allProjects);
	const projects = filterProjectsByCategory(allProjects, active);
	// The chosen project may fall outside the active category; fall back to "all"
	// so the board never silently empties with no matching dropdown option.
	const effectiveProjectFilter = projects.some((p) => p.name === projectFilter) ? projectFilter : '';
	const allowed = allowedProjectNames(allProjects, active);
	const baseTasks = effectiveProjectFilter
		? index.getTasksForProject(effectiveProjectFilter)
		: index.getAllTasks();
	const tasks = filterTasksByCategory(baseTasks, allowed, (path) => index.projectNameForPath(path));
	const columns = buildKanbanColumns(tasks);

	const handleDragEnd = (event: DragEndEvent) => {
		guard.markDragEnd();
		const targetStatus = event.over?.id as TaskStatus | undefined;
		if (!targetStatus) return;
		const task = tasks.find((t) => t.path === String(event.active.id));
		if (task && task.status !== targetStatus) callbacks.onMoveTask(task, targetStatus);
	};

	const openTask = (task: Task) => {
		if (guard.canClick()) callbacks.onOpenTask(task);
	};

	return (
		<div className="ns-kanban">
			<div className="ns-toolbar">
				<CategoryFilterBar options={options} active={active} onSelect={(value) => categoryFilter.set(value)} />
				<select value={effectiveProjectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
					<option value="">All projects</option>
					{projects.map((p) => (
						<option key={p.path} value={p.name}>
							{p.name}
						</option>
					))}
				</select>
			</div>

			{projects.length === 0 && <p className="ns-empty">No projects yet. Run "Neseser: Create project".</p>}

			<DndContext sensors={sensors} onDragStart={guard.markDragStart} onDragEnd={handleDragEnd}>
				<div className="ns-kanban-board">
					{columns.map((column) => (
						<Column
							key={column.status}
							column={column}
							index={index}
							showProject={effectiveProjectFilter === ''}
							onOpen={openTask}
						/>
					))}
				</div>
			</DndContext>
		</div>
	);
}
