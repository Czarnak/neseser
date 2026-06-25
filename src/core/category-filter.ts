type Listener = () => void;

/**
 * Observable, in-memory category filter shared by every view. `null` means "All".
 * Deliberately not persisted: each reload starts unfiltered, so a narrow filter
 * can never look like missing data after a restart.
 */
export class CategoryFilterStore {
	private active: string | null = null;
	private listeners = new Set<Listener>();

	get(): string | null {
		return this.active;
	}

	set(active: string | null): void {
		if (this.active === active) return;
		this.active = active;
		for (const listener of this.listeners) listener();
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}
