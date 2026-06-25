import { describe, expect, test, vi } from 'vitest';
import { CategoryFilterStore } from '../../src/core/category-filter';

describe('CategoryFilterStore', () => {
	test('starts with no active filter', () => {
		expect(new CategoryFilterStore().get()).toBeNull();
	});

	test('set updates the active filter', () => {
		const store = new CategoryFilterStore();

		store.set('Work');

		expect(store.get()).toBe('Work');
	});

	test('notifies subscribers when the filter changes', () => {
		const store = new CategoryFilterStore();
		const listener = vi.fn();
		store.subscribe(listener);

		store.set('Work');
		store.set(null);

		expect(listener).toHaveBeenCalledTimes(2);
	});

	test('does not notify when the filter is unchanged', () => {
		const store = new CategoryFilterStore();
		const listener = vi.fn();
		store.set('Work');
		store.subscribe(listener);

		store.set('Work');

		expect(listener).not.toHaveBeenCalled();
	});

	test('unsubscribe stops notifications', () => {
		const store = new CategoryFilterStore();
		const listener = vi.fn();
		const unsubscribe = store.subscribe(listener);

		unsubscribe();
		store.set('University');

		expect(listener).not.toHaveBeenCalled();
	});
});
