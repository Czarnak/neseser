/**
 * Shared plumbing for the enum-style property widgets this plugin registers with
 * Obsidian's Properties panel.
 *
 * None of `app.metadataTypeManager` appears in obsidian.d.ts, so it is declared locally
 * and every access is guarded at runtime: an Obsidian release that reshapes this must
 * degrade to a plain text property, not throw during onload and take the plugin down.
 */

/** Obsidian's built-in text widget; what a key falls back to when we let go. */
const FALLBACK_WIDGET_TYPE = 'text';

/**
 * The render context Obsidian hands a widget. `onChange` is the only field the panel
 * contract guarantees; the rest are version-dependent routes to the note being rendered
 * and are probed rather than relied on.
 */
export interface PropertyWidgetContext {
	onChange: (value: unknown) => void;
	sourcePath?: string;
	file?: { path?: string } | null;
	metadataEditor?: { file?: { path?: string } | null } | null;
}

export interface PropertyWidget {
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

export interface EnumWidgetSpec {
	/** Frontmatter key to claim, e.g. `priority`. */
	key: string;
	/** Type name registered in the widget registry, e.g. `neseser-priority`. */
	type: string;
	icon: string;
	label: string;
	/** Choices to offer for the note currently being rendered. */
	optionsFor: (value: unknown, ctx: PropertyWidgetContext) => readonly string[];
	validate: (value: unknown) => boolean;
	/** Message logged once when the widget API is unavailable. */
	unavailableMessage: string;
}

/**
 * The note path a widget is rendering, or undefined when this Obsidian build exposes
 * none of the known routes to it. Callers must treat undefined as "unknown", never as
 * a particular note.
 */
export function sourcePathOf(ctx: PropertyWidgetContext | null | undefined): string | undefined {
	if (!ctx || typeof ctx !== 'object') return undefined;
	const candidates = [ctx.sourcePath, ctx.file?.path, ctx.metadataEditor?.file?.path];
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate !== '') return candidate;
	}
	return undefined;
}

/** The `type` frontmatter value of a note, or undefined when it cannot be read. */
export function noteTypeAt(app: unknown, path: string | undefined): unknown {
	if (path === undefined) return undefined;
	const cache = (app as { metadataCache?: { getCache?: (p: string) => unknown } } | null)?.metadataCache;
	if (!cache || typeof cache.getCache !== 'function') return undefined;
	const frontmatter = (cache.getCache(path) as { frontmatter?: Record<string, unknown> } | null)?.frontmatter;
	return frontmatter?.['type'];
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

function buildWidget(spec: EnumWidgetSpec): PropertyWidget {
	return {
		type: spec.type,
		icon: spec.icon,
		name: () => spec.label,
		validate: spec.validate,
		render: (el, data, ctx) => {
			const options = spec.optionsFor(data.value, ctx);
			const select = el.createEl('select', { cls: 'ns-enum-select' });
			for (const option of options) {
				select.createEl('option', { value: option, text: option });
			}
			const current = typeof data.value === 'string' ? data.value : '';
			select.value = options.includes(current) ? current : (options[0] ?? '');
			select.addEventListener('change', () => ctx.onChange(select.value));
		},
	};
}

/**
 * Registers an enum dropdown for one frontmatter key and returns a teardown that undoes
 * both the registration and the key claim.
 *
 * The claim is vault-global: Obsidian assigns property types by key name, not by folder,
 * so any note with this key gets the widget. To keep that from overriding a deliberate
 * choice, the key is claimed only when it is unassigned or already ours.
 */
export function registerEnumWidget(app: unknown, spec: EnumWidgetSpec): () => void {
	const manager = metadataTypeManagerOf(app);
	if (!manager) {
		console.warn(spec.unavailableMessage);
		return () => undefined;
	}

	manager.registeredTypeWidgets[spec.type] = buildWidget(spec);

	const existing = assignedType(manager, spec.key);
	const claimed = existing === null || existing === spec.type;
	if (claimed) manager.setType(spec.key, spec.type);

	return () => {
		delete manager.registeredTypeWidgets[spec.type];
		// Only release what we took; a type the user chose is left as they set it.
		if (claimed) manager.setType(spec.key, FALLBACK_WIDGET_TYPE);
	};
}
