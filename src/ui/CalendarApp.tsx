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
import { CalendarDay, monthGrid, tasksByDueDay, weekRow } from '../core/calendar-data';
import { Task, isTaskClosed } from '../core/models';
import type { TaskIndex } from '../core/task-index';
import { dueDateKey } from '../core/view-data';
import { useDragClickGuard } from './use-drag-click-guard';
import { useIndexRefresh } from './use-index-refresh';

export interface CalendarCallbacks {
	onRescheduleTask: (task: Task, dayKey: string) => void;
	onOpenTask: (task: Task) => void;
}

interface Props {
	index: TaskIndex;
	callbacks: CalendarCallbacks;
}

type CalendarMode = 'month' | 'week';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DRAG_ACTIVATION_DISTANCE_PX = 4;

function Chip({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
	const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.path });
	const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
	const classes = [
		'ns-cal-chip',
		`ns-cal-chip-${task.priority}`,
		isDragging ? 'ns-cal-chip-dragging' : '',
		task.status === 'done' ? 'ns-status-done' : '',
	].filter(Boolean);

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={classes.join(' ')}
			title={task.title}
			onClick={() => onOpen(task)}
			{...listeners}
			{...attributes}
		>
			{task.title}
		</div>
	);
}

function DayCell({
	day,
	tasks,
	onOpen,
}: {
	day: CalendarDay;
	tasks: Task[];
	onOpen: (task: Task) => void;
}) {
	const { setNodeRef, isOver } = useDroppable({ id: day.key });
	const classes = [
		'ns-cal-day',
		day.inCurrentMonth ? '' : 'ns-cal-outside',
		day.isToday ? 'ns-cal-today' : '',
		isOver ? 'ns-cal-day-over' : '',
	].filter(Boolean);

	return (
		<div ref={setNodeRef} className={classes.join(' ')}>
			<div className="ns-cal-day-number">{day.dayOfMonth}</div>
			{tasks.map((task) => (
				<Chip key={task.path} task={task} onOpen={onOpen} />
			))}
		</div>
	);
}

export function CalendarApp({ index, callbacks }: Props) {
	useIndexRefresh(index);

	const [mode, setMode] = useState<CalendarMode>('month');
	const [anchor, setAnchor] = useState<Date>(() => new Date());
	const [showDone, setShowDone] = useState(false);
	const guard = useDragClickGuard();
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX } }),
	);

	const today = new Date();
	const weeks =
		mode === 'month'
			? monthGrid(anchor.getFullYear(), anchor.getMonth(), today)
			: [weekRow(anchor, today)];
	const tasks = index.getAllTasks().filter((t) => showDone || !isTaskClosed(t));
	const byDay = tasksByDueDay(tasks);

	const step = (direction: 1 | -1) => {
		setAnchor((current) =>
			mode === 'month'
				? new Date(current.getFullYear(), current.getMonth() + direction, 1)
				: new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction * 7),
		);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		guard.markDragEnd();
		const dayKey = event.over?.id;
		if (typeof dayKey !== 'string') return;
		const task = tasks.find((t) => t.path === String(event.active.id));
		if (!task) return;
		// Dropping on the task's current day would be a no-op edit, but the
		// frontmatter write would still bump mtime and look dirty to sync.
		if (task.due !== undefined && dueDateKey(task.due) === dayKey) return;
		callbacks.onRescheduleTask(task, dayKey);
	};

	const openTask = (task: Task) => {
		if (guard.canClick()) callbacks.onOpenTask(task);
	};

	const firstDay = weeks[0]?.[0]?.key ?? '';
	const lastDay = weeks[weeks.length - 1]?.[6]?.key ?? '';
	const label =
		mode === 'month'
			? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
			: `${firstDay} – ${lastDay}`;

	return (
		<div className="ns-calendar">
			<div className="ns-toolbar">
				<button onClick={() => step(-1)} aria-label="Previous">
					←
				</button>
				<button onClick={() => setAnchor(new Date())}>Today</button>
				<button onClick={() => step(1)} aria-label="Next">
					→
				</button>
				<span className="ns-cal-label">{label}</span>
				<select value={mode} onChange={(e) => setMode(e.target.value as CalendarMode)}>
					<option value="month">Month</option>
					<option value="week">Week</option>
				</select>
				<label className="ns-show-done">
					<input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
					Show done
				</label>
			</div>

			<DndContext sensors={sensors} onDragStart={guard.markDragStart} onDragEnd={handleDragEnd}>
				<div className="ns-cal-grid ns-cal-weekdays">
					{WEEKDAY_LABELS.map((weekday) => (
						<div key={weekday} className="ns-cal-weekday">
							{weekday}
						</div>
					))}
				</div>
				{weeks.map((week) => (
					<div key={week[0]?.key} className="ns-cal-grid">
						{week.map((day) => (
							<DayCell key={day.key} day={day} tasks={byDay.get(day.key) ?? []} onOpen={openTask} />
						))}
					</div>
				))}
			</DndContext>
		</div>
	);
}
