import { useEffect, useState } from 'react';
import type { TaskIndex } from '../core/task-index';

/** Re-renders the component whenever the task index changes. */
export function useIndexRefresh(index: TaskIndex): void {
	const [, setTick] = useState(0);
	useEffect(() => index.subscribe(() => setTick((t) => t + 1)), [index]);
}
