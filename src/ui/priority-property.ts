import { PRIORITIES, Priority } from '../core/models';
import { registerEnumWidget } from './property-widgets';

/** Type name this plugin registers with Obsidian's property widget registry. */
export const PRIORITY_WIDGET_TYPE = 'neseser-priority';

export function isPriority(value: unknown): value is Priority {
	return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value);
}

/** Makes `priority` a dropdown in Obsidian's Properties panel; returns its teardown. */
export function registerPriorityWidget(app: unknown): () => void {
	return registerEnumWidget(app, {
		key: 'priority',
		type: PRIORITY_WIDGET_TYPE,
		icon: 'signal',
		label: 'Priority',
		optionsFor: () => PRIORITIES,
		validate: isPriority,
		unavailableMessage:
			'[neseser] property widget API unavailable; priority stays a text property. Use the "Set task priority" command instead.',
	});
}
