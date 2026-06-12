import {
	DndContext,
	DragEndEvent,
	PointerSensor,
	useDraggable,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import { useState } from 'react';
import {
	BarGeometry,
	GanttZoom,
	barGeometry,
	daysFromPixels,
	ganttLanes,
	ganttWindow,
	markerOffset,
	shiftAnchor,
} from '../core/gantt-data';
import { Task, isTaskClosed } from '../core/models';
import type { TaskIndex } from '../core/task-index';
import { useDragClickGuard } from './use-drag-click-guard';
import { useIndexRefresh } from './use-index-refresh';

export interface GanttCallbacks {
	onMoveTask: (task: Task, dayDelta: number) => void;
	onResizeTask: (task: Task, dayDelta: number, edge: 'start' | 'end') => void;
	onOpenTask: (task: Task) => void;
}

interface Props {
	index: TaskIndex;
	callbacks: GanttCallbacks;
}

const DRAG_ACTIVATION_DISTANCE_PX = 4;

function GanttBar({
	task,
	geometry,
	onOpen,
}: {
	task: Task;
	geometry: BarGeometry;
	onOpen: (task: Task) => void;
}) {
	const moveDraggable = useDraggable({ id: `${task.path}::move` });
	const startDraggable = useDraggable({ id: `${task.path}::start` });
	const endDraggable = useDraggable({ id: `${task.path}::end` });

	const moveStyle = moveDraggable.transform
		? { transform: `translate(${moveDraggable.transform.x}px, 0)` }
		: undefined;
	const startStyle = startDraggable.transform
		? { transform: `translate(${startDraggable.transform.x}px, 0)` }
		: undefined;
	const endStyle = endDraggable.transform
		? { transform: `translate(${endDraggable.transform.x}px, 0)` }
		: undefined;

	const isDragging = moveDraggable.isDragging || startDraggable.isDragging || endDraggable.isDragging;

	const classes = [
		'ns-gantt-bar',
		`ns-gantt-bar-${task.priority}`,
		isDragging ? 'ns-gantt-bar-dragging' : '',
		task.status === 'done' ? 'ns-status-done' : '',
		geometry.clippedStart ? 'ns-gantt-bar-clipped-start' : '',
		geometry.clippedEnd ? 'ns-gantt-bar-clipped-end' : '',
	].filter(Boolean);

	return (
		<div
			className={classes.join(' ')}
			style={{
				gridColumn: `${geometry.offset + 1} / span ${geometry.span}`,
				...moveStyle,
			}}
		>
			<div
				ref={startDraggable.setNodeRef}
				className="ns-gantt-handle ns-gantt-handle-start"
				style={startStyle}
				{...startDraggable.listeners}
				{...startDraggable.attributes}
			/>
			<div
				ref={moveDraggable.setNodeRef}
				className="ns-gantt-bar-content"
				title={task.title}
				onClick={() => onOpen(task)}
				{...moveDraggable.listeners}
				{...moveDraggable.attributes}
			>
				{task.title}
			</div>
			<div
				ref={endDraggable.setNodeRef}
				className="ns-gantt-handle ns-gantt-handle-end"
				style={endStyle}
				{...endDraggable.listeners}
				{...endDraggable.attributes}
			/>
		</div>
	);
}

export function GanttApp({ index, callbacks }: Props) {
	useIndexRefresh(index);

	const [zoom, setZoom] = useState<GanttZoom>('month');
	const [anchor, setAnchor] = useState<Date>(() => new Date());
	const [showDone, setShowDone] = useState(false);
	const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

	const guard = useDragClickGuard();
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX } }),
	);

	const windowData = ganttWindow(anchor, zoom);
	const projects = index.getAllProjects();
	const tasksByProject = new Map<string, Task[]>();
	for (const p of projects) {
		tasksByProject.set(
			p.name,
			index.getTasksForProject(p.name).filter((t) => showDone || !isTaskClosed(t)),
		);
	}

	const lanes = ganttLanes([...projects], tasksByProject);
	const todayOffset = markerOffset(new Date().toISOString().slice(0, 10), windowData);

	const step = (direction: 1 | -1) => setAnchor((a) => shiftAnchor(a, zoom, direction));

	const handleDragEnd = (event: DragEndEvent) => {
		guard.markDragEnd();
		const id = String(event.active.id);
		const dx = event.delta.x;
		const dayDelta = daysFromPixels(dx, windowData.dayWidthPx);
		if (dayDelta === 0) return;

		const match = id.match(/^(.*)::(move|start|end)$/);
		if (!match) return;
		const [, path, type] = match;
		if (!path || !type) return;

		const task = index.getTaskByPath(path);
		if (!task) return;

		if (type === 'move') {
			callbacks.onMoveTask(task, dayDelta);
		} else {
			callbacks.onResizeTask(task, dayDelta, type as 'start' | 'end');
		}
	};

	const openTask = (task: Task) => {
		if (guard.canClick()) callbacks.onOpenTask(task);
	};

	const toggleProject = (name: string) => {
		setCollapsedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
	};

	return (
		<div className="ns-gantt">
			<div className="ns-toolbar">
				<button onClick={() => step(-1)} aria-label="Previous">
					←
				</button>
				<button onClick={() => setAnchor(new Date())}>Today</button>
				<button onClick={() => step(1)} aria-label="Next">
					→
				</button>
				<select value={zoom} onChange={(e) => setZoom(e.target.value as GanttZoom)}>
					<option value="week">Week</option>
					<option value="month">Month</option>
					<option value="quarter">Quarter</option>
				</select>
				<label className="ns-show-done">
					<input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
					Show done
				</label>
			</div>

			<div className="ns-gantt-layout">
				<DndContext sensors={sensors} onDragStart={guard.markDragStart} onDragEnd={handleDragEnd}>
					<div className="ns-gantt-scroll-area">
						{/* Header */}
						<div className="ns-gantt-row ns-gantt-header">
							<div className="ns-gantt-label-cell ns-gantt-header-label" />
							<div
								className="ns-gantt-cells"
								style={{
									gridTemplateColumns: `repeat(${windowData.days.length}, ${windowData.dayWidthPx}px)`,
								}}
							>
								{windowData.days.map((day) => (
									<div key={day} className="ns-gantt-day-header">
										{day.slice(8, 10)}
									</div>
								))}
								{todayOffset !== null && (
									<div
										className="ns-gantt-today-marker"
										style={{ gridColumn: todayOffset + 1 }}
									/>
								)}
							</div>
						</div>

						{/* Lanes */}
						{lanes.map((lane) => {
							const isCollapsed = collapsedProjects.has(lane.project.name);
							const deadlineOffset = markerOffset(lane.project.deadline ?? null, windowData);
							return (
								<div key={lane.project.path} className="ns-gantt-lane-group">
									<div className="ns-gantt-row ns-gantt-project-row">
										<div
											className="ns-gantt-label-cell ns-gantt-project-label"
											onClick={() => toggleProject(lane.project.name)}
										>
											<span className="ns-gantt-collapse-icon">
												{isCollapsed ? '▶' : '▼'}
											</span>
											{lane.project.name}
										</div>
										<div
											className="ns-gantt-cells"
											style={{
												gridTemplateColumns: `repeat(${windowData.days.length}, ${windowData.dayWidthPx}px)`,
											}}
										>
											{deadlineOffset !== null && (
												<div
													className="ns-gantt-deadline-marker"
													style={{ gridColumn: deadlineOffset + 1 }}
												/>
											)}
										</div>
									</div>
									{!isCollapsed &&
										lane.rows.map((row) => {
											const geom = barGeometry(row, windowData);
											return (
												<div key={row.task.path} className="ns-gantt-row ns-gantt-task-row">
													<div
														className="ns-gantt-label-cell ns-gantt-task-label"
														title={row.task.title}
													>
														{row.task.title}
													</div>
													<div
														className="ns-gantt-cells"
														style={{
															gridTemplateColumns: `repeat(${windowData.days.length}, ${windowData.dayWidthPx}px)`,
														}}
													>
														{geom && (
															<GanttBar
																task={row.task}
																geometry={geom}
																onOpen={openTask}
															/>
														)}
													</div>
												</div>
											);
										})}
								</div>
							);
						})}
					</div>
				</DndContext>
			</div>
		</div>
	);
}
