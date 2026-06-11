import { useEffect, useState } from 'react';
import type { SyncStatus, SyncStatusStore } from '../sync/sync-status';

/** Subscribes to the sync status store and returns the current status. */
export function useSyncStatus(store: SyncStatusStore): SyncStatus {
	const [status, setStatus] = useState(store.get());
	useEffect(() => store.subscribe(() => setStatus(store.get())), [store]);
	return status;
}
