export interface TaskSyncRecord {
	ticktickId: string;
	/** pushFingerprint of the last successfully synced local state */
	fingerprint: string;
	/** remoteFingerprint of the remote state at last sync; absent on Phase-2 records */
	remoteFingerprint?: string;
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
