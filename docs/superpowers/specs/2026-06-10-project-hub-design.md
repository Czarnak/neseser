# Neseser — Obsidian Multi-Project Manager Plugin (Design)

Date: 2026-06-10
Status: Approved (brainstormed and accepted by user)
Naming: renamed from working title "Project Hub" to **Neseser** (Polish: small personal suitcase) on user request, matching the registered TickTick app name.

## Problem

Existing Obsidian PM plugins (closest: obsidian-pm) show only one project at a time. Needed: a general
multi-project tool — create projects with tasks/subtasks, see all projects at once, and two-way TickTick
sync so phone notifications work. Creating a project = creating a directory under `Projects/` in the vault.
Personal use first, publishable later.

## Decisions

| Topic | Decision |
|---|---|
| Task storage | One note per task, frontmatter metadata |
| TickTick sync | Two-way, official Open API (OAuth2) |
| Project layout | Index note + `Tasks/` subfolder |
| Views | Dashboard, kanban, calendar, task list |
| UI framework | React |
| Distribution | Personal first, publishable later |

## Data model

- **Project** = `Projects/<Name>/<Name>.md` index note. Frontmatter: `type: project`,
  `status: active|on-hold|done|archived`, `deadline`, `ticktick-project-id`.
- **Task** = note in `Projects/<Name>/Tasks/`. Frontmatter: `type: task`,
  `status: todo|in-progress|done|cancelled`, `due`, `priority`, `parent` (wikilink → subtask nesting),
  `reminder`, `created`, `completed-at`, `ticktick-id`, `ticktick-etag`.
- Subtasks nest arbitrarily in Obsidian via `parent`. TickTick mapping: top-level task → TickTick task,
  children → checklist items, depth >2 flattened (official-API constraint).
- Task body is Obsidian-only. Only title/dates/reminder/priority/status/subtasks sync.

## Architecture

```
src/
  main.ts               — plugin entry: registers views, commands, settings
  core/
    models.ts           — Project/Task types + frontmatter (de)serialization (pure, no obsidian imports)
    task-index.ts       — in-memory index; fed vault events by main.ts; emits change events
    project-manager.ts  — scaffolding + task CRUD behind a vault-adapter interface
  sync/
    ticktick-client.ts  — official Open API client (OAuth2; obsidian requestUrl)
    sync-engine.ts      — two-way reconciliation + retry queue with backoff
    sync-state.ts       — id/etag/last-sync snapshot persisted in plugin data.json
  views/
    task-list-view.ts, dashboard-view.ts, kanban-view.ts, calendar-view.ts
  ui/                   — React components + modals (NewProject, NewTask, TaskEdit)
  settings.ts
```

Invariant: **task-index is the single source of truth for all views** — no view scans the vault itself.
Core modules depend only on structural interfaces (testable without mocking the `obsidian` module).

## TickTick sync

- Auth: user registers app at developer.ticktick.com; client ID/secret in settings; OAuth flow via
  temporary localhost callback server (desktop-only).
- Mapping: project ↔ TickTick project, task ↔ task by `ticktick-id` frontmatter.
- Cycle (default 5 min + manual command): push dirty changes vs last-sync snapshot, pull per project, diff.
- Conflicts: last-writer-wins by timestamp; Obsidian wins ties.
- Known gotcha: project endpoint returns only uncompleted tasks → missing task disambiguated
  (completed vs deleted) via single-task GET.
- Honesty flag: official API docs are JS-rendered and were not fetchable during design; endpoint details
  come from training data and must be verified as the first Phase-2 task.

## Error handling

Frontmatter writes only via `processFrontMatter` (atomic). Sync failures non-blocking: Notice +
status-bar indicator + exponential-backoff retry. Offline changes queue. Token expiry → re-auth prompt.
Malformed task frontmatter → skipped from index, surfaced in dashboard issues panel.

## Testing

TDD, vitest, 80%+ coverage on `core/` and `sync/`. Highest risk: sync reconciliation → table-driven
conflict-matrix tests with mocked client/vault. Manual verification per phase in a gitignored test vault.

## Delivery phases

1. Foundation: data model, task index, create commands, task list view
2. TickTick one-way push (notifications work early)
3. Two-way sync
4. Dashboard + kanban
5. Calendar
