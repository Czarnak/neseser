import { describe, expect, test } from 'vitest';
import { computeMoveResult, computeResizeResult } from '../../src/core/gantt-data';

describe('computeMoveResult', () => {
	test('returns null when the task has no due date', () => {
		expect(computeMoveResult(undefined, undefined, 3)).toBeNull();
	});

	test('shifts a due-only task forward by the given day delta', () => {
		const result = computeMoveResult(undefined, '2026-06-15', 3);

		expect(result).toEqual({ start: undefined, due: '2026-06-18' });
	});

	test('shifts both start and due of a spanned task together', () => {
		const result = computeMoveResult('2026-06-10', '2026-06-15', 2);

		expect(result).toEqual({ start: '2026-06-12', due: '2026-06-17' });
	});

	test('moves a task backwards with a negative delta', () => {
		const result = computeMoveResult(undefined, '2026-06-15', -5);

		expect(result).toEqual({ start: undefined, due: '2026-06-10' });
	});

	test('preserves time suffixes on both ends', () => {
		const result = computeMoveResult('2026-06-10T09:00', '2026-06-15T17:00', 1);

		expect(result).toEqual({ start: '2026-06-11T09:00', due: '2026-06-16T17:00' });
	});

	test('zero delta returns the original dates unchanged', () => {
		const result = computeMoveResult('2026-06-10', '2026-06-15', 0);

		expect(result).toEqual({ start: '2026-06-10', due: '2026-06-15' });
	});
});

describe('computeResizeResult', () => {
	test('returns null when the task has no due date', () => {
		expect(computeResizeResult(undefined, undefined, -3, 'start')).toBeNull();
		expect(computeResizeResult(undefined, undefined, 3, 'end')).toBeNull();
	});

	describe("edge='start'", () => {
		test('dragging the start edge left on a due-only task creates a span', () => {
			const result = computeResizeResult(undefined, '2026-06-15', -3, 'start');

			expect(result).toEqual({ start: '2026-06-12', due: '2026-06-15' });
		});

		test('moves an existing start edge without touching due', () => {
			const result = computeResizeResult('2026-06-10', '2026-06-15', 2, 'start');

			expect(result).toEqual({ start: '2026-06-12', due: '2026-06-15' });
		});

		test('shrinking the start onto the due day collapses back to due-only form', () => {
			const result = computeResizeResult('2026-06-10', '2026-06-15', 5, 'start');

			expect(result).toEqual({ due: '2026-06-15' });
		});

		test('overshooting past the due day clamps to the due-only form', () => {
			const result = computeResizeResult('2026-06-10', '2026-06-15', 99, 'start');

			expect(result).toEqual({ due: '2026-06-15' });
		});
	});

	describe("edge='end'", () => {
		test('dragging the end edge right extends the due day', () => {
			const result = computeResizeResult(undefined, '2026-06-15', 3, 'end');

			expect(result).toEqual({ start: undefined, due: '2026-06-18' });
		});

		test('keeps the start date when growing a span', () => {
			const result = computeResizeResult('2026-06-10', '2026-06-15', 2, 'end');

			expect(result).toEqual({ start: '2026-06-10', due: '2026-06-17' });
		});

		test('shrinking the end onto the start day collapses to the due-only form', () => {
			const result = computeResizeResult('2026-06-10', '2026-06-15', -5, 'end');

			expect(result).toEqual({ due: '2026-06-10' });
		});

		test('a due-only task cannot shrink below its single day', () => {
			const result = computeResizeResult(undefined, '2026-06-15', -99, 'end');

			expect(result).toEqual({ start: undefined, due: '2026-06-15' });
		});
	});
});
