# Gantt View for Neseser

## Context

Neseser v1 is feature-complete (dashboard, kanban, calendar, navigation hub, two-way TickTick sync; 167 tests). The Gantt view is the next feature. Design was settled through brainstorming Q&A:

- **Bars = task spans**: add an optional `start` frontmatter field; tasks with `start` + `due` render as multi-day bars, due-only tasks as 1-day bars on the due date. Tasks with no `due` are excluded (consistent with calendar).
- **Full TickTick sync of `start` in the same feature**: push real `startDate` when `start` is set, pull remote spans into `start`. This resolves the documented v1 limitation in `mapping.ts` ("genuine remote spans collapse to the due day on push").
- **Interactions**: drag bar to move (start+due shift together), drag left/right edges to resize, click opens the note.
- **Layout**: all projects, collapsible project swimlanes, project `deadline` shown as a marker.
- **Rendering**: hand-rolled CSS grid + `@dnd-kit/core`, matching the calendar pattern — pure data module in `core/` (under the 80 % coverage gate) + React app in `ui/` + thin `ItemView` in `views/`. No new dependencies.

## Design decisions & constraints

1. **`start` semantics**: optional, same date formats as `due` (`YYYY-MM-DD` or with time suffix). Unparseable `start` → task invalid (same as `due`, via existing `parseDate`). `start > due` stays *valid* (don't knock tasks out of sync over a typo); gantt-data clamps the bar to the due day, and mapping falls back to `startDate = dueDate` when start > due.
2. **Pull rule**: remote `startDate === dueDate` (the normal TickTick case, and what we push for due-only tasks) maps to **no local `start`** — otherwise every pull would stamp `start:` onto every note.
3. **Fingerprint change**: `pushFingerprint` gains `start`, `remoteFingerprint` gains `startDate` (epoch-ms-normalized via existing `fingerprintDue`). Digest change ⇒ one-time re-baseline echo per task after upgrade (transient "sync twice", same as the date-push fix — acceptable, note in commit message).
4. **API risk to probe live**: whether TickTick's Open API treats a multi-day all-day span's `dueDate` as inclusive (last day) or exclusive (day after). Probe with the test-vault token (data.json) in the ctx sandbox **before** finalizing mapping, same workflow as the date-push investigation. Mapping/`remoteDueToLocal` adjust accordingly.
5. **Drag math without droppables**: dnd-kit `onDragEnd` gives a pixel delta; `Math.round(delta.x / dayWidthPx)` = day shift. Pure helper in gantt-data, fully testable; no droppable cells needed.
6. **isAllDay rule for spans**: all-day iff *both* `start` and `due` are date-only (due-only tasks keep the current rule).

## Phases (TDD throughout — test first, per repo convention)

### Phase 1 — data model: `start` field

- `src/core/models.ts`: add `start?: string` to `Task`; parse in `parseTask` with the existing `parseDate` helper.
- `src/core/project-manager.ts`: add `updateTaskDates(path, { start?, due })` next to `updateTaskDue` — sets both fields, deletes `start` when undefined. Add optional `start` to `CreateTaskInput` (written into new-note frontmatter).
- Tests: `tests/core/models.test.ts`, `tests/core/project-manager.test.ts`.
- Out of scope (YAGNI): `start` input in `NewTaskModal` — spans are created by resizing in the Gantt.

### Phase 2 — sync: real spans both ways

- **Live probe first** (decision 4) to pin down all-day span semantics.
- `src/sync/mapping.ts`:
  - `taskToTickTick`: when `task.start` is set, parses, and ≤ due → `startDate` from `start`, `dueDate` from `due` (else current `startDate = dueDate` behavior). Update the `TickTickTaskDraft.startDate` doc comment.
  - `RemoteTaskFields` (+ `TickTickTask` in `ticktick-client.ts` if missing): add `startDate?`.
  - `remoteFingerprint`/`pushFingerprint`: add start fields (decision 3).
  - Reuse `remoteDueToLocal` for converting remote `startDate` (same conversion).
- `src/sync/sync-engine.ts`:
  - `remoteFieldsToLocal`: also derive `start` (undefined when startDate ≈ dueDate, decision 2).
  - `pullFields`: write/delete `fm['start']`.
  - `NewLocalTask` + `createTaskNote` path: carry `start` so remote-new spanned tasks materialize with it (wire through `ObsidianEngineStore.createTaskNote` in `main.ts`).
- Tests: `tests/sync/mapping.test.ts`, `tests/sync/sync-engine.test.ts` (span push, start-only remote edit pulls, echo-free round trip, start=due → no local start).

### Phase 3 — gantt core data module

- New `src/core/gantt-data.ts` (pure, mirrors `calendar-data.ts` style):
  - Timeline window: anchor date + zoom (`'week' | 'month' | 'quarter'` → px-per-day + visible day count); columns as day keys (reuse `dueDateKey` from `view-data.ts`; export/reuse the small day-math helpers from `calendar-data.ts` instead of duplicating).
  - `ganttRows(projects, tasks)`: swimlanes sorted with `compareProjects`, tasks with a due sorted by start-then-due; each row → `{ task, startKey, endKey }` (startKey = start ?? due; clamp start > due).
  - Bar geometry: grid column offset + span for a row within the window (bars partially outside the window are clipped).
  - `shiftSpan(start, due, dayDelta)` and `resizeStart`/`resizeEnd` (invariant start ≤ due; preserve time suffixes — reuse the `rescheduleDue` slicing trick).
  - `daysFromPixels(dx, dayWidthPx)`.
  - Today marker + project `deadline` marker positions.
- Tests: new `tests/core/gantt-data.test.ts` (this module is most of the feature's logic — keep it exhaustive like `calendar-data.test.ts`).

### Phase 4 — UI + wiring

- New `src/ui/GanttApp.tsx`: controls row (zoom select, prev/today/next, "Show done" checkbox — same conventions as `CalendarApp`); left label column with collapsible project headers; scrollable CSS-grid timeline; `useIndexRefresh`, `useDragClickGuard`, `PointerSensor` distance 4 px. Three draggable ids per bar (`path::move`, `path::start`, `path::end`); `onDragEnd` → day delta → callback.
- New `src/views/gantt-view.tsx`: `VIEW_TYPE_GANTT = 'neseser-gantt'`, icon `gantt-chart` (lucide), callbacks `onMoveTask`/`onResizeTask` → `manager.updateTaskDates` (Notice on error, like calendar), `onOpenTask`.
- `src/main.ts`: `registerView`, `onOpenGantt` nav callback, "Open Gantt" command (match existing view commands).
- `src/ui/NavigationApp.tsx`: add Gantt button to the Views section (+ `NavigationCallbacks`).
- `styles.css`: `ns-gantt-*` classes on Obsidian CSS variables (theme-safe), including drag/resize affordances, today line, deadline marker, collapsed swimlane state.

### Phase 5 — verification & release hygiene

- `npm test` + `npm run coverage` (gate: 80 % on `core/` + `sync/`; UI excluded as before).
- `npm run deploy:test` → manual check in test vault: render, zoom, nav, collapse, move, resize, click-open, show-done.
- Live TickTick two-way check (user): span created in Obsidian shows as multi-day in the TickTick app; span edited in the app pulls back into `start`; due-only tasks unchanged; no echo loops on second sync.
- Bump `manifest.json`/`versions.json`/`package.json` minor version (per repo release convention).

## Verification summary

1. Unit: all phases TDD'd; new gantt-data suite carries the view logic.
2. Integration: sync-engine tests cover span round-trips and the no-echo invariant.
3. Manual: test vault (UI) + live TickTick (sync), both user-verified — same gates as phases 4/5 of v1.

## Known risks

- TickTick all-day `dueDate` inclusivity unknown → live probe in Phase 2 before locking mapping.
- Fingerprint digest change → transient one-time re-baseline per task after upgrade (documented, accepted).
- Sticky-startDate server behavior (from the date-push bug) now becomes a feature path; the existing always-send-startDate discipline is preserved, only its value changes.
