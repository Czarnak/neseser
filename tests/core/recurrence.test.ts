import { describe, expect, test } from 'vitest';
import {
	nextInstanceTitle,
	nextOccurrence,
	noteBody,
	stripDateSuffix,
} from '../../src/core/recurrence';

describe('stripDateSuffix', () => {
	test('strips a single trailing date', () => {
		expect(stripDateSuffix('Water plants 2026-06-10')).toBe('Water plants');
	});

	test('strips only the LAST trailing date when two are stacked', () => {
		expect(stripDateSuffix('Water plants 2026-06-10 2026-06-11')).toBe('Water plants 2026-06-10');
	});

	test('leaves a title without date suffix unchanged', () => {
		expect(stripDateSuffix('Water plants')).toBe('Water plants');
	});

	test('leaves a date in the middle of the title unchanged', () => {
		expect(stripDateSuffix('Review 2026-06-10 notes')).toBe('Review 2026-06-10 notes');
	});

	test('leaves a bare date title unchanged (no preceding space)', () => {
		expect(stripDateSuffix('2026-06-12')).toBe('2026-06-12');
	});
});

describe('nextInstanceTitle', () => {
	test('replaces the old date suffix with the new due key', () => {
		expect(nextInstanceTitle('Water plants 2026-06-12', '2026-06-13')).toBe(
			'Water plants 2026-06-13',
		);
	});

	test('appends the due key when there is no suffix', () => {
		expect(nextInstanceTitle('Water plants', '2026-06-13')).toBe('Water plants 2026-06-13');
	});
});

describe('nextOccurrence', () => {
	const TODAY = '2026-06-12';

	test('daily with due yesterday lands on today', () => {
		const next = nextOccurrence({ due: '2026-06-11', recurrence: 'daily' }, TODAY);

		expect(next).toEqual({ due: '2026-06-12' });
	});

	test('daily with due today lands on tomorrow', () => {
		const next = nextOccurrence({ due: '2026-06-12', recurrence: 'daily' }, TODAY);

		expect(next).toEqual({ due: '2026-06-13' });
	});

	test('daily ten days overdue rolls forward to exactly today', () => {
		const next = nextOccurrence({ due: '2026-06-02', recurrence: 'daily' }, TODAY);

		expect(next).toEqual({ due: '2026-06-12' });
	});

	test('weekly three days overdue lands on today+4, preserving the weekday', () => {
		// 2026-06-09 is a Tuesday; +7 = Tuesday 2026-06-16 = today+4.
		const next = nextOccurrence({ due: '2026-06-09', recurrence: 'weekly' }, TODAY);

		expect(next).toEqual({ due: '2026-06-16' });
	});

	test('weekly ten days overdue double-rolls to today+4', () => {
		// 2026-06-02 +7 = 06-09 (< today) +7 = 06-16.
		const next = nextOccurrence({ due: '2026-06-02', recurrence: 'weekly' }, TODAY);

		expect(next).toEqual({ due: '2026-06-16' });
	});

	test('weekly with a future due advances exactly +7 without rolling', () => {
		const next = nextOccurrence({ due: '2026-06-20', recurrence: 'weekly' }, TODAY);

		expect(next).toEqual({ due: '2026-06-27' });
	});

	test('preserves a time suffix on due', () => {
		const next = nextOccurrence({ due: '2026-06-10T09:30', recurrence: 'daily' }, TODAY);

		expect(next).toEqual({ due: '2026-06-12T09:30' });
	});

	test('shifts start by the same delta as due, preserving the span', () => {
		const next = nextOccurrence(
			{ start: '2026-06-08', due: '2026-06-10', recurrence: 'daily' },
			TODAY,
		);

		expect(next).toEqual({ due: '2026-06-12', start: '2026-06-10' });
	});

	test('preserves a time suffix on start', () => {
		const next = nextOccurrence(
			{ start: '2026-06-08T08:00', due: '2026-06-10', recurrence: 'daily' },
			TODAY,
		);

		expect(next).toEqual({ due: '2026-06-12', start: '2026-06-10T08:00' });
	});

	test('omits start when it is unparseable', () => {
		const next = nextOccurrence(
			{ start: 'not-a-date', due: '2026-06-10', recurrence: 'daily' },
			TODAY,
		);

		expect(next).toEqual({ due: '2026-06-12' });
	});

	test('returns null when due is missing', () => {
		expect(nextOccurrence({ recurrence: 'daily' }, TODAY)).toBeNull();
	});

	test('returns null when due is unparseable', () => {
		expect(nextOccurrence({ due: 'whenever', recurrence: 'daily' }, TODAY)).toBeNull();
	});

	test('crosses a month boundary', () => {
		const next = nextOccurrence({ due: '2026-05-31', recurrence: 'daily' }, '2026-06-01');

		expect(next).toEqual({ due: '2026-06-01' });
	});

	test('weekly across the March 2026 DST change stays exactly +7 days', () => {
		// Europe DST starts Mar 29 2026; UTC day-key math must not drift.
		const next = nextOccurrence({ due: '2026-03-27', recurrence: 'weekly' }, '2026-03-27');

		expect(next).toEqual({ due: '2026-04-03' });
	});
});

describe('noteBody', () => {
	test('returns the body after the frontmatter, keeping an hr rule inside it', () => {
		const content = '---\ntype: task\nstatus: todo\n---\nNotes here.\n\n---\n\nMore below the rule.\n';

		expect(noteBody(content)).toBe('Notes here.\n\n---\n\nMore below the rule.\n');
	});

	test('returns empty string for a frontmatter-only note', () => {
		expect(noteBody('---\ntype: task\n---\n')).toBe('');
	});

	test('handles CRLF line endings', () => {
		const content = '---\r\ntype: task\r\n---\r\nBody line.\r\n';

		expect(noteBody(content)).toBe('Body line.\r\n');
	});

	test('preserves a leading blank line of the body', () => {
		const content = '---\ntype: task\n---\n\nBody after blank.\n';

		expect(noteBody(content)).toBe('\nBody after blank.\n');
	});

	test('returns content unchanged when there is no leading frontmatter', () => {
		expect(noteBody('Just a note.\n')).toBe('Just a note.\n');
	});
});
