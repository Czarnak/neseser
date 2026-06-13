# Design: Today view, burndown sparklines, recurring tasks

Date: 2026-06-12
Status: approved (user-validated during brainstorming)

## Context

Neseser v1 is feature-complete: dashboard, kanban, calendar, gantt, and navigation views over a frontmatter-driven task model (one note per task), with two-way TickTick sync. Three additions requested:

1. A cross-project "Today" working list — everything due today or overdue, in one place.
2. Progress visibility over time on the Dashboard — per-project burndown.
3. Recurring tasks — weekly/daily recurrence that regenerates the next instance on completion.

## Feature A — Today view

A dedicated main-tab view (`neseser-today`, the 6th view, same thin-ItemView + React App pattern), opened from the Navigation hub and an `open-today` command.

**Scope (strict):** tasks due today + overdue tasks, across all projects, one list in two groups — `[Overdue]` then `[Today]`. Done/cancelled excluded. No in-flight spans (start ≤ today < due), no project deadlines — those stay on the Dashboard's 14-day deadlines panel. The Today view is a *working* surface, not another report: each row has a checkbox that completes the task in place (unchecking before the index refresh reverts to `todo`), a project badge, a due label ("3d overdue", or the time for time-suffixed dues), a priority badge, and click-through to the note.

**Ordering:** overdue oldest-first; today by time suffix then priority — both are exactly `compareTasks`. Day boundary follows the plugin convention: wall-clock day via the literal `YYYY-MM-DD` prefix (`dueDateKey`).

New pure module `core/today-data.ts` (`todayGroups`, `overdueDays`), fully unit-tested.

## Feature B — Per-project burndown sparklines

Each Dashboard ProjectCard gains a small hand-rolled SVG sparkline (polyline + area fill, theme accent color, **no chart library**) under its progress bar: the count of open tasks per day over a fixed 28-day window.

**Data is reconstructed, not logged.** A task counts as open on day *d* iff `created ≤ d` AND (no `completed-at` OR local-day(`completed-at`) > *d*) AND status ≠ cancelled. No new storage, retroactive from day one.

Documented approximations:
- Deleted tasks vanish from history entirely.
- Cancelled tasks are invisible to the chart (no cancellation timestamp exists).
- `created` is stamped as a UTC day; late-evening creations can shift one day.

**Boundary rule (the trap):** `completed-at` is a full ISO UTC timestamp; its day must be derived via a new `localDayOf()` (`Date.parse` → local `dayKey`), never via `dueDateKey`, whose literal-prefix branch would silently return the UTC day.

New pure module `core/burndown-data.ts` (`burndownSeries`, `localDayOf`, `sparklineGeometry`) + presentational `ui/Sparkline.tsx`.

## Feature C — Recurring tasks

New frontmatter field `recurrence: daily | weekly` (validated enum, extensible; invalid values surface through the existing invalid-note channel).

**Local-only recurrence.** TickTick's `repeatFlag` is deliberately not used: TickTick mutates dates on the same task id when a recurring task completes, which conflicts with our snapshot/fingerprint sync model. Instead, each instance is an independent note; TickTick simply sees a new task appear each cycle. `recurrence` is sync-inert by construction (fingerprints are built from an explicit field list).

**Regenerate on completion.** When a task carrying `recurrence` transitions to `done` — from any source — the plugin spawns the next instance:

- **Next due** = old due + interval (1d/7d), rolled forward in interval steps while < today. Never spawns an already-overdue instance; weekly keeps its weekday anchor. Time suffixes preserved; `start` (if any) shifts by the same delta, preserving span length. Recurrence requires a due date — without one, regeneration is skipped with a Notice.
- **Naming:** `<baseTitle> <newDueKey>.md`, stripping one trailing ` YYYY-MM-DD` from the old title first (no suffix chaining). A filename collision makes regeneration a silent no-op — this doubles as the idempotency guard against double-fires and reopen-recomplete.
- **Contents:** copies body (template support), priority, parent, recurrence; fresh `created`, status `todo`. Does not copy reminder, ticktick-id, completed-at. Child subtask notes are not regenerated (v1 limitation).
- **Chain ownership:** the completed note's `recurrence` key is deleted during regeneration — the chain lives in exactly one place; reopening the old note yields a normal non-recurring task. (Crash-recovery nuance: when the next instance already exists, the key is still deleted — the heal path for a crash between create and delete.)

**Trigger: index transition detection.** TaskIndex diffs previous→next status on file change; a (≠done)→done transition on a known task fires a dedicated `onTaskCompleted` channel that `main.ts` subscribes to. One mechanism covers Kanban drag, the Today checkbox, TickTick `pullCompletion`, and manual `status: done` edits. The initial index build has no previous state, so startup never fires; the regenerated note arrives as `todo`, so no loops.

**Sync interaction:** zero sync-engine changes. The completed note pushes its completion as today; the new note has no sync record and is pushed as a normal new TickTick task on the next sync. One new test locks the fingerprint-inertness of `recurrence`.

UI: `NewTaskModal` gains a recurrence dropdown (none/daily/weekly) and rejects recurrence without a due date.

## Delivery

Three branches/PRs in order: `feat/today-view` → `feat/burndown-sparklines` → `feat/recurring-tasks`. Strict TDD; coverage gate 80% on core/+sync/ (new core modules are pure and fully tested); UI verified manually in the test vault (`npm run deploy:test`). Implementation detail lives in the approved plan (`~/.claude/plans/hello-claude-i-would-quizzical-galaxy.md`).
