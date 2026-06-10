import { describe, expect, test } from 'vitest';
import { ExponentialBackoff, SchedulerTimer, SyncScheduler } from '../../src/sync/scheduler';

describe('ExponentialBackoff', () => {
	test('doubles the delay on each failure up to the cap', () => {
		const backoff = new ExponentialBackoff(30_000, 240_000);

		expect(backoff.nextDelay()).toBe(30_000);
		expect(backoff.nextDelay()).toBe(60_000);
		expect(backoff.nextDelay()).toBe(120_000);
		expect(backoff.nextDelay()).toBe(240_000);
		expect(backoff.nextDelay()).toBe(240_000);
	});

	test('reset starts the sequence over', () => {
		const backoff = new ExponentialBackoff(30_000, 240_000);
		backoff.nextDelay();
		backoff.nextDelay();
		backoff.reset();

		expect(backoff.nextDelay()).toBe(30_000);
	});
});

interface ScheduledCall {
	id: number;
	fn: () => void;
	ms: number;
}

class FakeTimer implements SchedulerTimer {
	scheduled: ScheduledCall[] = [];
	cleared: number[] = [];
	private nextId = 1;

	set(fn: () => void, ms: number): number {
		const id = this.nextId++;
		this.scheduled.push({ id, fn, ms });
		return id;
	}

	clear(id: number): void {
		this.cleared.push(id);
	}

	/** Fires the most recently scheduled callback and waits for async work to settle. */
	async fireLast(): Promise<void> {
		const call = this.scheduled[this.scheduled.length - 1];
		if (!call) throw new Error('nothing scheduled');
		call.fn();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	lastDelay(): number | undefined {
		return this.scheduled[this.scheduled.length - 1]?.ms;
	}
}

const INTERVAL = 300_000;

function makeScheduler(results: (boolean | Error)[]): { scheduler: SyncScheduler; timer: FakeTimer; runs: () => number } {
	const timer = new FakeTimer();
	let runCount = 0;
	const scheduler = new SyncScheduler(
		async () => {
			const result = results[Math.min(runCount++, results.length - 1)] ?? true;
			if (result instanceof Error) throw result;
			return result;
		},
		INTERVAL,
		new ExponentialBackoff(30_000, 240_000),
		timer,
	);
	return { scheduler, timer, runs: () => runCount };
}

describe('SyncScheduler', () => {
	test('start schedules the first run one interval out', () => {
		const { scheduler, timer } = makeScheduler([true]);

		scheduler.start();

		expect(timer.scheduled).toHaveLength(1);
		expect(timer.lastDelay()).toBe(INTERVAL);
	});

	test('start twice does not double-schedule', () => {
		const { scheduler, timer } = makeScheduler([true]);

		scheduler.start();
		scheduler.start();

		expect(timer.scheduled).toHaveLength(1);
	});

	test('successful run schedules the next run at the regular interval', async () => {
		const { scheduler, timer, runs } = makeScheduler([true]);
		scheduler.start();

		await timer.fireLast();

		expect(runs()).toBe(1);
		expect(timer.scheduled).toHaveLength(2);
		expect(timer.lastDelay()).toBe(INTERVAL);
	});

	test('failed runs back off exponentially, then recover to the interval on success', async () => {
		const { scheduler, timer } = makeScheduler([false, false, true]);
		scheduler.start();

		await timer.fireLast();
		expect(timer.lastDelay()).toBe(30_000);

		await timer.fireLast();
		expect(timer.lastDelay()).toBe(60_000);

		await timer.fireLast();
		expect(timer.lastDelay()).toBe(INTERVAL);

		// Backoff was reset: a new failure starts at the base delay again.
		await timer.fireLast();
	});

	test('a run that throws is treated as a failure', async () => {
		const { scheduler, timer } = makeScheduler([new Error('network down')]);
		scheduler.start();

		await timer.fireLast();

		expect(timer.lastDelay()).toBe(30_000);
	});

	test('stop clears the pending timer and prevents rescheduling', async () => {
		const { scheduler, timer } = makeScheduler([true]);
		scheduler.start();

		scheduler.stop();

		expect(timer.cleared).toContain(timer.scheduled[0]?.id);
	});

	test('a run finishing after stop does not reschedule', async () => {
		const { scheduler, timer } = makeScheduler([true]);
		scheduler.start();
		const pending = timer.scheduled[0];
		if (!pending) throw new Error('nothing scheduled');

		pending.fn(); // run starts…
		scheduler.stop(); // …user disables sync while it is in flight
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(timer.scheduled).toHaveLength(1);
	});
});
