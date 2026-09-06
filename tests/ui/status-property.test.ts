import { afterEach, describe, expect, test, vi } from 'vitest';
import { PROJECT_STATUSES, TASK_STATUSES } from '../../src/core/models';
import { sourcePathOf } from '../../src/ui/property-widgets';
import {
	STATUS_WIDGET_TYPE,
	isStatus,
	registerStatusWidget,
	statusOptionsForContext,
} from '../../src/ui/status-property';

interface FakeApp {
	metadataTypeManager: {
		registeredTypeWidgets: Record<string, unknown>;
		properties: Record<string, { type: string }>;
		setType(key: string, type: string): void;
	};
	metadataCache: { getCache(path: string): { frontmatter: Record<string, unknown> } | null };
}

/** Stands in for the undocumented app.metadataTypeManager plus the metadata cache. */
function fakeApp(options: { assigned?: string; notes?: Record<string, Record<string, unknown>> } = {}): FakeApp {
	const properties: Record<string, { type: string }> = {};
	if (options.assigned !== undefined) properties['status'] = { type: options.assigned };
	const notes = options.notes ?? {};
	return {
		metadataTypeManager: {
			registeredTypeWidgets: {},
			properties,
			setType(key: string, type: string): void {
				properties[key] = { type };
			},
		},
		metadataCache: {
			getCache: (path: string) => (notes[path] ? { frontmatter: notes[path] } : null),
		},
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('isStatus', () => {
	test('accepts a task status and a project status', () => {
		expect(isStatus('in-progress')).toBe(true);
		expect(isStatus('archived')).toBe(true);
	});

	test('rejects an unknown or non-string value', () => {
		expect(isStatus('draft')).toBe(false);
		expect(isStatus(undefined)).toBe(false);
		expect(isStatus(7)).toBe(false);
	});
});

describe('sourcePathOf', () => {
	test('prefers the explicit source path', () => {
		expect(sourcePathOf({ onChange: () => undefined, sourcePath: 'a.md' })).toBe('a.md');
	});

	test('falls back to the context file, then the metadata editor', () => {
		expect(sourcePathOf({ onChange: () => undefined, file: { path: 'b.md' } })).toBe('b.md');
		expect(
			sourcePathOf({ onChange: () => undefined, metadataEditor: { file: { path: 'c.md' } } }),
		).toBe('c.md');
	});

	test('returns undefined when no route to the note exists', () => {
		expect(sourcePathOf({ onChange: () => undefined })).toBeUndefined();
		expect(sourcePathOf({ onChange: () => undefined, sourcePath: '' })).toBeUndefined();
		expect(sourcePathOf(null)).toBeUndefined();
	});
});

describe('statusOptionsForContext', () => {
	const ctx = { onChange: () => undefined, sourcePath: 'Projects/Alpha/Tasks/T.md' };

	test('offers task statuses on a task note', () => {
		const app = fakeApp({ notes: { 'Projects/Alpha/Tasks/T.md': { type: 'task' } } });

		expect(statusOptionsForContext(app, 'todo', ctx)).toEqual(TASK_STATUSES);
	});

	test('offers project statuses on a project note', () => {
		const app = fakeApp({ notes: { 'Projects/Alpha/Tasks/T.md': { type: 'project' } } });

		expect(statusOptionsForContext(app, 'active', ctx)).toEqual(PROJECT_STATUSES);
	});

	// Without a readable note the current value is the only discriminator left.
	test('falls back to the value when the note cannot be read', () => {
		const app = fakeApp();

		expect(statusOptionsForContext(app, 'cancelled', ctx)).toEqual(TASK_STATUSES);
		expect(statusOptionsForContext(app, 'on-hold', ctx)).toEqual(PROJECT_STATUSES);
	});

	test('never offers a project status on a task note', () => {
		const app = fakeApp({ notes: { 'Projects/Alpha/Tasks/T.md': { type: 'task' } } });

		expect(statusOptionsForContext(app, 'done', ctx)).not.toContain('archived');
	});

	test('survives an app with no metadata cache', () => {
		expect(() => statusOptionsForContext({}, 'todo', ctx)).not.toThrow();
	});
});

describe('registerStatusWidget', () => {
	test('registers the widget under its own type name', () => {
		const app = fakeApp();

		registerStatusWidget(app);

		expect(app.metadataTypeManager.registeredTypeWidgets[STATUS_WIDGET_TYPE]).toBeDefined();
	});

	test('claims the status key when nothing else has', () => {
		const app = fakeApp();

		registerStatusWidget(app);

		expect(app.metadataTypeManager.properties['status']?.type).toBe(STATUS_WIDGET_TYPE);
	});

	// setType is vault-global, and `status` is a common property name outside this plugin.
	test('leaves a user-assigned status type alone', () => {
		const app = fakeApp({ assigned: 'text' });

		registerStatusWidget(app);

		expect(app.metadataTypeManager.properties['status']?.type).toBe('text');
	});

	test('teardown unregisters the widget and releases the key it claimed', () => {
		const app = fakeApp();

		registerStatusWidget(app)();

		expect(app.metadataTypeManager.registeredTypeWidgets[STATUS_WIDGET_TYPE]).toBeUndefined();
		expect(app.metadataTypeManager.properties['status']?.type).toBe('text');
	});

	test('teardown does not touch a key it never claimed', () => {
		const app = fakeApp({ assigned: 'number' });

		registerStatusWidget(app)();

		expect(app.metadataTypeManager.properties['status']?.type).toBe('number');
	});

	test('no-ops and warns when the metadata type manager is missing', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		expect(() => registerStatusWidget({})()).not.toThrow();
		expect(warn).toHaveBeenCalled();
	});
});
