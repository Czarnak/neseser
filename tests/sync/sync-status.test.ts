import { describe, expect, test, vi } from 'vitest';
import { SyncStatus, SyncStatusStore, formatSyncStatus } from '../../src/sync/sync-status';

describe('SyncStatusStore', () => {
	test('starts idle with no sync history', () => {
		expect(new SyncStatusStore().get()).toEqual({ state: 'idle' });
	});

	test('set replaces the current status', () => {
		const store = new SyncStatusStore();

		store.set({ state: 'syncing', lastSyncAt: 1_000 });

		expect(store.get()).toEqual({ state: 'syncing', lastSyncAt: 1_000 });
	});

	test('notifies subscribers when the status changes', () => {
		const store = new SyncStatusStore();
		const listener = vi.fn();
		store.subscribe(listener);

		store.set({ state: 'syncing' });
		store.set({ state: 'idle', lastSyncAt: 2_000 });

		expect(listener).toHaveBeenCalledTimes(2);
	});

	test('does not notify when the status is unchanged', () => {
		const store = new SyncStatusStore();
		const listener = vi.fn();
		store.set({ state: 'error', errorCount: 2 });
		store.subscribe(listener);

		store.set({ state: 'error', errorCount: 2 });

		expect(listener).not.toHaveBeenCalled();
	});

	test('update preserves lastSyncAt when the new status omits it', () => {
		const store = new SyncStatusStore();
		store.set({ state: 'idle', lastSyncAt: 1_000 });

		store.update({ state: 'syncing' });

		expect(store.get()).toEqual({ state: 'syncing', lastSyncAt: 1_000 });
	});

	test('update overwrites lastSyncAt when the new status provides it', () => {
		const store = new SyncStatusStore();
		store.set({ state: 'syncing', lastSyncAt: 1_000 });

		store.update({ state: 'idle', lastSyncAt: 2_000 });

		expect(store.get()).toEqual({ state: 'idle', lastSyncAt: 2_000 });
	});

	test('update drops errorCount when the new status omits it', () => {
		const store = new SyncStatusStore();
		store.set({ state: 'error', errorCount: 3, lastSyncAt: 1_000 });

		store.update({ state: 'syncing' });

		expect(store.get()).toEqual({ state: 'syncing', lastSyncAt: 1_000 });
	});

	test('unsubscribe stops notifications', () => {
		const store = new SyncStatusStore();
		const listener = vi.fn();
		const unsubscribe = store.subscribe(listener);

		unsubscribe();
		store.set({ state: 'syncing' });

		expect(listener).not.toHaveBeenCalled();
	});
});

describe('formatSyncStatus', () => {
	test('renders each state as the status-bar text', () => {
		const lastSyncAt = Date.parse('2026-06-11T14:30:05');
		const cases: Array<[SyncStatus, string]> = [
			[{ state: 'disconnected' }, 'sync: not connected'],
			[{ state: 'syncing' }, 'syncing…'],
			[{ state: 'error', errorCount: 3 }, 'sync: 3 errors'],
			[{ state: 'error' }, 'sync failed'],
			[{ state: 'idle', lastSyncAt }, `synced ${new Date(lastSyncAt).toLocaleTimeString()}`],
			[{ state: 'idle' }, 'idle'],
		];

		for (const [status, expected] of cases) {
			expect(formatSyncStatus(status)).toBe(expected);
		}
	});
});
