# Guaranteed Start/Due fields and a Priority picker

Date: 2026-09-06
Status: implemented (commits 0bdd79e..2df4a91)

## Problem

Two friction points when working with Neseser task notes in Obsidian:

1. **`start` and `due` are missing from new task notes.** `ProjectManager.createTask`
   writes them only when a value is supplied, so a task created without dates has no
   place to click in Obsidian's Properties panel. Adding a date means adding the
   property first, every time.

2. **`priority` must be typed by hand.** The New Task modal already offers a dropdown,
   but once the note exists, changing priority means typing `low`/`medium`/`high` into a
   text property, with no guard against typos. A misspelled value makes `parseTask`
   return `kind: 'invalid'` and the task disappears from every view.

## Decisions

| Question | Decision |
| --- | --- |
| Blank vs pre-filled dates | Keys always present, YAML null when unset. Nothing invented. |
| Priority UI | Custom property widget **and** a command/menu fallback. |
| Existing notes | Left untouched. No backfill, no migration. |

## Part 1 — `start` and `due` always present

### Serializer

`frontmatterBlock` (`src/core/project-manager.ts:97`) currently accepts
`Record<string, string>`. Widen to `Record<string, string | null>`; a `null` value
renders as a bare `key:` line (YAML null) rather than being passed through `yamlValue`.

This matters: `yamlValue('')` returns `""` (a quoted empty string), and an empty string
is **not** a valid date. Emitting `start: ""` would make every dateless task invalid.
The null path must bypass `yamlValue` entirely.

### Writer

`createTask` writes both keys unconditionally, with `start`/`due` moved adjacent and
ahead of `created`:

```yaml
---
type: task
status: todo
priority: none
start:
due:
created: 2026-09-06
---
```

Optional keys (`parent`, `recurrence`, `reminder`, `ticktick-id`) keep their current
conditional behaviour and their position after `created`.

### Parser hardening

`parseDate` (`src/core/models.ts:101`) must treat an empty or whitespace-only string as
absent, returning `{ value: undefined }` instead of an error.

This is not defensive padding. Obsidian's Properties panel writes `due: ""` when the
user clears a text property. Without this change, clearing a date in the UI silently
converts the note to `kind: 'invalid'` and drops it from Today, Dashboard, Kanban,
Calendar and Gantt with no visible cause.

### Sync alignment

`SyncEngine.pullFields` (`src/sync/sync-engine.ts:353`, the `delete` at :360) currently does:

```ts
if (start !== undefined) fm['start'] = start;
else delete fm['start'];
```

The `delete` strips the guaranteed key whenever TickTick reports no start date. Change
both branches to assign `null` instead of deleting, so a pull preserves the invariant.
`parseTask` already maps a null frontmatter value to `undefined` via `optionalString`,
so nothing downstream changes.

### Modal

`NewTaskModal` (`src/ui/modals.ts:114`) gains a **Start** text input directly above Due,
sharing the `YYYY-MM-DD` placeholder and the "Optional" description. `submit()` passes
`start: this.start.trim() || undefined`.

No date-format validation is added. Due has none today; introducing it for Start alone
would be inconsistent, and validating both is a separate concern.

## Part 2 — Priority picker

New module: `src/ui/priority-property.ts`. Two independent mechanisms so that the
convenient one can fail without leaving the user stuck.

### Mechanism A — custom property widget (undocumented API)

Registers a `neseser-priority` widget into `app.metadataTypeManager.registeredTypeWidgets`
and assigns it to the `priority` key, so clicking the field in the Properties panel opens
a real `<select>` of `PRIORITIES`.

None of `metadataTypeManager` appears in `obsidian.d.ts`. Constraints:

- Reach it through a local ambient interface declared in this module, never by widening
  the `obsidian` module types.
- Guard every access at runtime. If `metadataTypeManager`, `registeredTypeWidgets` or
  `setType` is missing or not the expected shape, no-op and log once. A failure here must
  never throw during `onload` — that would take the whole plugin down.
- Unregister on unload: remove the widget and release the type assignment.

**Blast radius, accepted:** `setType` is vault-global. Any note with a `priority`
property gets this widget, not only Neseser tasks. To limit this, claim the key **only**
when it is currently unassigned or already assigned to `neseser-priority`. A key the user
has manually typed in Obsidian is left alone.

### Mechanism B — command and context menu (public API)

- `addCommand({ id: 'set-task-priority', name: 'Set task priority', checkCallback })`.
  The `checkCallback` returns true only when the active file parses as a task, so the
  command stays out of the palette on other notes.
- `app.workspace.on('file-menu')` adds a **Set task priority** entry on task notes.

**Deviation from this design, as built:** the entry opens a picker modal rather than a
Menu submenu. `MenuItem.setSubmenu` is not in Obsidian's public typings, so a submenu
would have meant a second undocumented dependency in the mechanism whose whole purpose
is to keep working when the undocumented one breaks. The picker lists the four
priorities with the current value check-marked, and the palette command reuses it.

### Shared write path

Both mechanisms call one new method on `ProjectManager`, beside the existing
`updateTaskStatus` and `updateTaskDue`:

```ts
async updateTaskPriority(path: string, priority: Priority): Promise<void>
```

Implemented with `this.vault.updateFrontmatter`, so it inherits the existing
`processFrontMatter` behaviour and needs no new vault-adapter surface.

## Module boundaries

`priority-property.ts` splits into a pure half and an impure half so the logic is
testable without an Obsidian runtime:

- **Pure:** `isPriority(value): value is Priority`, and the option list derived from
  `PRIORITIES`. No `app`, no DOM.
- **Impure:** `registerPriorityWidget(app): () => void` — performs the registration and
  returns its own teardown, so `main.ts` stores one disposer rather than reaching back
  into the registry.

`main.ts` gains only wiring: the disposer, one `addCommand`, one `registerEvent`.

## Testing

Unit tests, extending the existing suites:

| Behaviour | Test file |
| --- | --- |
| `frontmatterBlock` renders `null` as a bare key, never `""` | `tests/core/project-manager.test.ts` |
| `createTask` emits `start` and `due` when no dates are given | `tests/core/project-manager.test.ts` |
| `createTask` output round-trips through `parseTask` as a valid task | `tests/core/project-manager.test.ts` |
| `updateTaskPriority` writes the frontmatter key | `tests/core/project-manager.test.ts` |
| `parseDate` accepts `""` and `"  "` as absent | `tests/core/models.test.ts` |
| `pullFields` nulls rather than deletes `start`/`due` | `tests/sync/sync-engine.test.ts` |
| `isPriority` guards | `tests/ui/priority-property.test.ts` (new) |
| `registerPriorityWidget` no-ops on a malformed app | `tests/ui/priority-property.test.ts` (new) |
| `registerPriorityWidget` does not claim a key the user typed | `tests/ui/priority-property.test.ts` (new) |

The round-trip test is the one that would have caught the `yamlValue('')` trap, so it is
worth writing first.

**Not covered by automated tests:** the widget's DOM `render` callback and the real
Properties-panel interaction. Both need a live Obsidian instance. These require manual
verification in `test-vault` and will be reported as manually verified, not as passing
tests.

**Coverage scope:** `vitest.config.ts` limits the 80% threshold to `src/core/**` and
`src/sync/**`, so `tests/ui/priority-property.test.ts` runs but does not count toward the
gate. The Part 1 changes all land inside the gated directories and must not regress it.

## Out of scope

- Existing task notes. No backfill command, no on-load migration.
- `taskToFrontmatter` in `models.ts` — exported but unused in `src/`, referenced only by
  its own tests. Aligning it would be churn with no caller.
- A settings toggle for the widget. The key-claim rule above already gives the user an
  escape hatch through Obsidian's own property-type UI.
- Date-format validation in the New Task modal.
