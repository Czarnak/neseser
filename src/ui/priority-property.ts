import { PRIORITIES, Priority } from '../core/models';

/** Type name this plugin registers with Obsidian's property widget registry. */
export const PRIORITY_WIDGET_TYPE = 'neseser-priority';

/** Obsidian's built-in text widget; what the key falls back to when we let go. */
const FALLBACK_WIDGET_TYPE = 'text';

const PRIORITY_KEY = 'priority';

export function isPriority(value: unknown): value is Priority {
	return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value);
}

/**
 * The slice of `app.metadataTypeManager` this module uses. None of it appears in
 * obsidian.d.ts, so it is declared locally and every access is guarded at runtime:
 * an Obsidian release that reshapes this must degrade to a plain text property, not
 * throw during onload and take the whole plugin down with it.
 */
interface PropertyWidgetContext {
	onChange: (value: unknown) => void;
}

interface PropertyWidget {
	type: string;
	icon: string;
	name: () => string;
	validate: (value: unknown) => boolean;
	render: (el: HTMLElement, data: { value: unknown }, ctx: PropertyWidgetContext) => void;
}

interface MetadataTypeManager {
	registeredTypeWidgets: Record<string, PropertyWidget>;
	setType(key: string, type: string): void;
	getAssignedType?: (key: string) => string | null | undefined;
	properties?: Record<string, { type?: string } | undefined>;
}

function metadataTypeManagerOf(app: unknown): MetadataTypeManager | null {
	const candidate = (app as { metadataTypeManager?: unknown } | null)?.metadataTypeManager;
	if (!candidate || typeof candidate !== 'object') return null;

	const manager = candidate as Partial<MetadataTypeManager>;
	const widgets = manager.registeredTypeWidgets;
	if (!widgets || typeof widgets !== 'object') return null;
	if (typeof manager.setType !== 'function') return null;

	return manager as MetadataTypeManager;
}

/**
 * The type currently assigned to `key`: a type name, `null` when unassigned, or
 * `undefined` when this Obsidian build exposes no way to tell. Undetermined is not
 * treated as unassigned — claiming a key we cannot inspect could silently override a
 * type the user set by hand.
 */
function assignedType(manager: MetadataTypeManager, key: string): string | null | undefined {
	if (typeof manager.getAssignedType === 'function') {
		return manager.getAssignedType(key) ?? null;
	}
	const properties = manager.properties;
	if (properties && typeof properties === 'object') {
		return properties[key]?.type ?? null;
	}
	return undefined;
}

function buildWidget(): PropertyWidget {
	return {
		type: PRIORITY_WIDGET_TYPE,
		icon: 'signal',
		name: () => 'Priority',
		validate: isPriority,
		render: (el, data, ctx) => {
			const select = el.createEl('select', { cls: 'ns-priority-select' });
			for (const priority of PRIORITIES) {
				select.createEl('option', { value: priority, text: priority });
			}
			select.value = isPriority(data.value) ? data.value : 'none';
			select.addEventListener('change', () => ctx.onChange(select.value));
		},
	};
}

/**
 * Makes `priority` a dropdown in Obsidian's Properties panel. Returns a teardown that
 * undoes both the registration and the key claim.
 *
 * Note the claim is vault-global: Obsidian assigns property types by key name, not by
 * folder, so any note with a `priority` property gets this widget. To keep that from
 * overriding a deliberate choice, the key is claimed only when it is unassigned or
 * already ours.
 */
export function registerPriorityWidget(app: unknown): () => void {
	const manager = metadataTypeManagerOf(app);
	if (!manager) {
		console.warn(
			'[neseser] property widget API unavailable; priority stays a text property. Use the "Set task priority" command instead.',
		);
		return () => undefined;
	}

	manager.registeredTypeWidgets[PRIORITY_WIDGET_TYPE] = buildWidget();

	const existing = assignedType(manager, PRIORITY_KEY);
	const claimed = existing === null || existing === PRIORITY_WIDGET_TYPE;
	if (claimed) manager.setType(PRIORITY_KEY, PRIORITY_WIDGET_TYPE);

	return () => {
		delete manager.registeredTypeWidgets[PRIORITY_WIDGET_TYPE];
		// Only release what we took; a type the user chose is left as they set it.
		if (claimed) manager.setType(PRIORITY_KEY, FALLBACK_WIDGET_TYPE);
	};
}
