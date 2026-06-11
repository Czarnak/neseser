type Listener = () => void;

export type SyncStatusState = 'disconnected' | 'idle' | 'syncing' | 'error';

export interface SyncStatus {
	state: SyncStatusState;
	/** Epoch ms of the last successful sync, once one has happened. */
	lastSyncAt?: number;
	/** Error count of the last run; only set when a run finished with errors. */
	errorCount?: number;
}

/** Observable sync status shared by the status bar and the navigation view. */
export class SyncStatusStore {
	private status: SyncStatus = { state: 'idle' };
	private listeners = new Set<Listener>();

	get(): SyncStatus {
		return this.status;
	}

	set(status: SyncStatus): void {
		if (isSameStatus(this.status, status)) return;
		this.status = status;
		for (const listener of this.listeners) listener();
	}

	/** Like set, but carries lastSyncAt forward unless the new status provides its own. */
	update(status: SyncStatus): void {
		this.set({ lastSyncAt: this.status.lastSyncAt, ...status });
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}

function isSameStatus(a: SyncStatus, b: SyncStatus): boolean {
	return a.state === b.state && a.lastSyncAt === b.lastSyncAt && a.errorCount === b.errorCount;
}

/** Display text for the status bar and navigation view. */
export function formatSyncStatus(status: SyncStatus): string {
	switch (status.state) {
		case 'disconnected':
			return 'sync: not connected';
		case 'syncing':
			return 'syncing…';
		case 'error':
			return status.errorCount !== undefined ? `sync: ${status.errorCount} errors` : 'sync failed';
		case 'idle':
			return status.lastSyncAt !== undefined
				? `synced ${new Date(status.lastSyncAt).toLocaleTimeString()}`
				: 'idle';
	}
}
