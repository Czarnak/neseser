import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	PRIORITY_WIDGET_TYPE,
	isPriority,
	registerPriorityWidget,
} from '../../src/ui/priority-property';

interface FakeManager {
	registeredTypeWidgets: Record<string, unknown>;
	properties: Record<string, { type: string }>;
	setType(key: string, type: string): void;
}

/** Stands in for the undocumented app.metadataTypeManager the widget reaches into. */
function fakeApp(assignedPriorityType?: string): { metadataTypeManager: FakeManager } {
	const properties: Record<string, { type: string }> = {};
	if (assignedPriorityType !== undefined) {
		properties['priority'] = { type: assignedPriorityType };
	}
	return {
		metadataTypeManager: {
			registeredTypeWidgets: {},
			properties,
			setType(key: string, type: string): void {
				properties[key] = { type };
			},
		},
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('isPriority', () => {
	test('accepts every declared priority', () => {
		expect(isPriority('none')).toBe(true);
		expect(isPriority('low')).toBe(true);
		expect(isPriority('medium')).toBe(true);
		expect(isPriority('high')).toBe(true);
	});

	test('rejects an unknown value', () => {
		expect(isPriority('urgent')).toBe(false);
	});

	test('rejects non-string values', () => {
		expect(isPriority(undefined)).toBe(false);
		expect(isPriority(null)).toBe(false);
		expect(isPriority(2)).toBe(false);
	});
});

describe('registerPriorityWidget', () => {
	test('registers the widget under its own type name', () => {
		const app = fakeApp();

		registerPriorityWidget(app);

		expect(app.metadataTypeManager.registeredTypeWidgets[PRIORITY_WIDGET_TYPE]).toBeDefined();
	});

	test('claims the priority key when nothing else has', () => {
		const app = fakeApp();

		registerPriorityWidget(app);

		expect(app.metadataTypeManager.properties['priority']?.type).toBe(PRIORITY_WIDGET_TYPE);
	});

	// setType is vault-global, so a key the user has deliberately typed in Obsidian
	// must survive the plugin loading.
	test('leaves a user-assigned priority type alone', () => {
		const app = fakeApp('text');

		registerPriorityWidget(app);

		expect(app.metadataTypeManager.properties['priority']?.type).toBe('text');
	});

	test('reclaims a key it already owns from a previous load', () => {
		const app = fakeApp(PRIORITY_WIDGET_TYPE);

		registerPriorityWidget(app);

		expect(app.metadataTypeManager.properties['priority']?.type).toBe(PRIORITY_WIDGET_TYPE);
	});

	test('teardown unregisters the widget and releases the key it claimed', () => {
		const app = fakeApp();

		registerPriorityWidget(app)();

		expect(app.metadataTypeManager.registeredTypeWidgets[PRIORITY_WIDGET_TYPE]).toBeUndefined();
		expect(app.metadataTypeManager.properties['priority']?.type).toBe('text');
	});

	test('teardown does not touch a key it never claimed', () => {
		const app = fakeApp('number');

		registerPriorityWidget(app)();

		expect(app.metadataTypeManager.properties['priority']?.type).toBe('number');
	});

	test('no-ops and warns when the metadata type manager is missing', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		expect(() => registerPriorityWidget({})()).not.toThrow();
		expect(warn).toHaveBeenCalled();
	});

	test('no-ops when the manager is present but the wrong shape', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const app = { metadataTypeManager: { registeredTypeWidgets: {} } };

		expect(() => registerPriorityWidget(app)()).not.toThrow();
		expect(warn).toHaveBeenCalled();
	});
});
