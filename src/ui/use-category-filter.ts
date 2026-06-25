import { useEffect, useState } from 'react';
import type { CategoryFilterStore } from '../core/category-filter';

/** Subscribes to the shared category filter and returns the active category (`null` = All). */
export function useCategoryFilter(store: CategoryFilterStore): string | null {
	const [active, setActive] = useState(store.get());
	useEffect(() => store.subscribe(() => setActive(store.get())), [store]);
	return active;
}
