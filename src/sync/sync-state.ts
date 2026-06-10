export interface TaskSyncRecord {
	ticktickId: string;
	/** pushFingerprint of the last successfully pushed state */
	fingerprint: string;
	/** completion has been sent to TickTick; never re-complete */
	completedPushed?: boolean;
}

export interface SyncSnapshot {
	/** project name → TickTick project id */
	projects: Record<string, string>;
	/** task note path → sync record */
	tasks: Record<string, TaskSyncRecord>;
}

export function emptySnapshot(): SyncSnapshot {
	return { projects: {}, tasks: {} };
}
