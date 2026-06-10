/** Grows the retry delay after consecutive failures; reset on success. */
export class ExponentialBackoff {
	private failures = 0;

	constructor(
		private baseMs: number,
		private capMs: number,
	) {}

	nextDelay(): number {
		const delay = Math.min(this.baseMs * 2 ** this.failures, this.capMs);
		this.failures++;
		return delay;
	}

	reset(): void {
		this.failures = 0;
	}
}

/** Injected so the scheduler is testable; main.ts adapts window timers. */
export interface SchedulerTimer {
	set(fn: () => void, ms: number): number;
	clear(id: number): void;
}

/**
 * Periodic sync driver: regular interval while runs succeed, exponential
 * backoff while they fail (offline, rate-limited), reset on the next success.
 */
export class SyncScheduler {
	private timerId: number | null = null;
	private running = false;

	constructor(
		private run: () => Promise<boolean>,
		private intervalMs: number,
		private backoff: ExponentialBackoff,
		private timer: SchedulerTimer,
	) {}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.schedule(this.intervalMs);
	}

	stop(): void {
		this.running = false;
		if (this.timerId !== null) {
			this.timer.clear(this.timerId);
			this.timerId = null;
		}
	}

	private schedule(ms: number): void {
		this.timerId = this.timer.set(() => void this.tick(), ms);
	}

	private async tick(): Promise<void> {
		this.timerId = null;
		let ok = false;
		try {
			ok = await this.run();
		} catch {
			ok = false;
		}
		if (!this.running) return;
		if (ok) {
			this.backoff.reset();
			this.schedule(this.intervalMs);
		} else {
			this.schedule(this.backoff.nextDelay());
		}
	}
}
