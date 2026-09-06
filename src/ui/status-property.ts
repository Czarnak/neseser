import { ALL_STATUSES, statusOptionsFor } from '../core/models';
import { PropertyWidgetContext, noteTypeAt, registerEnumWidget, sourcePathOf } from './property-widgets';

/** Type name this plugin registers with Obsidian's property widget registry. */
export const STATUS_WIDGET_TYPE = 'neseser-status';

export function isStatus(value: unknown): value is string {
	return typeof value === 'string' && ALL_STATUSES.includes(value);
}

/**
 * The choices to offer for the note currently being rendered. Kept out of the widget's
 * render callback so the narrowing logic — the part that decides whether a task can be
 * set to `archived` — is testable without a live Obsidian DOM.
 */
export function statusOptionsForContext(
	app: unknown,
	value: unknown,
	ctx: PropertyWidgetContext,
): readonly string[] {
	return statusOptionsFor(noteTypeAt(app, sourcePathOf(ctx)), value);
}

/**
 * Makes `status` a dropdown in Obsidian's Properties panel; returns its teardown.
 *
 * One key serves both note kinds, so the option list is resolved per note rather than
 * fixed at registration — see statusOptionsFor.
 */
export function registerStatusWidget(app: unknown): () => void {
	return registerEnumWidget(app, {
		key: 'status',
		type: STATUS_WIDGET_TYPE,
		icon: 'check-circle',
		label: 'Status',
		optionsFor: (value, ctx) => statusOptionsForContext(app, value, ctx),
		validate: isStatus,
		unavailableMessage:
			'[neseser] property widget API unavailable; status stays a text property. Use the "Set task status" command instead.',
	});
}
