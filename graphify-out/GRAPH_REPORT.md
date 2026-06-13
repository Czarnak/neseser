# Graph Report - .  (2026-06-13)

## Corpus Check

- Corpus is ~30,139 words - fits in a single context window. You may not need a graph.

## Summary

- 370 nodes · 714 edges · 19 communities (16 shown, 3 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 73 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)

- [[_COMMUNITY_Obsidian Plugin UI|Obsidian Plugin UI]]
- [[_COMMUNITY_TickTick Sync Mapping|TickTick Sync Mapping]]
- [[_COMMUNITY_Gantt Scheduling Recurrence|Gantt Scheduling Recurrence]]
- [[_COMMUNITY_Calendar Burndown Dates|Calendar Burndown Dates]]
- [[_COMMUNITY_Task Indexing Views|Task Indexing Views]]
- [[_COMMUNITY_Project Task Management|Project Task Management]]
- [[_COMMUNITY_Plugin Settings Connection|Plugin Settings Connection]]
- [[_COMMUNITY_TickTick API OAuth|TickTick API OAuth]]
- [[_COMMUNITY_Navigation Sync Status|Navigation Sync Status]]
- [[_COMMUNITY_Sync Scheduling Backoff|Sync Scheduling Backoff]]
- [[_COMMUNITY_Dashboard View Data|Dashboard View Data]]
- [[_COMMUNITY_Sync Engine Test Fixtures|Sync Engine Test Fixtures]]
- [[_COMMUNITY_TickTick Client Test Doubles|TickTick Client Test Doubles]]
- [[_COMMUNITY_Domain Model Parsing|Domain Model Parsing]]
- [[_COMMUNITY_Vault Project Tests|Vault Project Tests]]

## God Nodes (most connected - your core abstractions)

1. `TaskIndex` - 35 edges
2. `dueDateKey()` - 20 edges
3. `SyncEngine` - 19 edges
4. `NeseserPlugin` - 18 edges
5. `ProjectManager` - 16 edges
6. `isTaskClosed()` - 15 edges
7. `FakeClient` - 14 edges
8. `dayKey()` - 13 edges
9. `TickTickClient` - 13 edges
10. `remoteFingerprint()` - 11 edges

## Surprising Connections (you probably didn't know these)

- `seriesValues()` --calls--> `burndownSeries()`  [INFERRED]
  tests/core/burndown-data.test.ts → src/core/burndown-data.ts
- `startFlow()` --calls--> `runOAuthFlow()`  [INFERRED]
  tests/sync/oauth-flow.test.ts → src/sync/oauth-flow.ts
- `handleDragEnd()` --calls--> `dueDateKey()`  [INFERRED]
  src/ui/CalendarApp.tsx → src/core/view-data.ts
- `draftFor()` --calls--> `taskToTickTick()`  [INFERRED]
  tests/sync/mapping.test.ts → src/sync/mapping.ts
- `ProjectCard()` --calls--> `burndownSeries()`  [INFERRED]
  src/ui/DashboardApp.tsx → src/core/burndown-data.ts

## Communities (19 total, 3 thin omitted)

### Community 0 - "Obsidian Plugin UI"

Cohesion: 0.05
Nodes (9): ObsidianEngineStore, ObsidianVaultAdapter, addSubmitButton(), NewProjectModal, NewTaskModal, trySubmit(), DashboardView, GanttView (+1 more)

### Community 1 - "TickTick Sync Mapping"

Cohesion: 0.13
Nodes (23): isTaskClosed(), fingerprintDue(), flattenItems(), parseApiDateMs(), parseLocal(), priorityFromTickTick(), priorityToTickTick(), pushDates() (+15 more)

### Community 2 - "Gantt Scheduling Recurrence"

Cohesion: 0.11
Nodes (24): rescheduleDue(), barGeometry(), clampStartKey(), computeMoveResult(), computeResizeResult(), dayDiff(), dayKeyMs(), daysFromPixels() (+16 more)

### Community 3 - "Calendar Burndown Dates"

Cohesion: 0.14
Nodes (17): burndownSeries(), localDayOf(), round2(), sparklineGeometry(), seriesValues(), addDays(), dayKey(), makeDay() (+9 more)

### Community 5 - "Project Task Management"

Cohesion: 0.12
Nodes (8): frontmatterBlock(), isoDate(), ProjectManager, sanitizeName(), nextInstanceTitle(), noteBody(), stripDateSuffix(), CalendarView

### Community 6 - "Plugin Settings Connection"

Cohesion: 0.12
Nodes (4): NeseserPlugin, isTickTickConnected(), NeseserSettingTab, emptySnapshot()

### Community 7 - "TickTick API OAuth"

Cohesion: 0.13
Nodes (8): runOAuthFlow(), startFlow(), buildAuthorizeUrl(), exchangeCode(), fakeHttp(), makeClient(), TickTickApiError, TickTickClient

### Community 8 - "Navigation Sync Status"

Cohesion: 0.13
Nodes (5): formatSyncStatus(), isSameStatus(), SyncStatusStore, useSyncStatus(), NavigationView

### Community 9 - "Sync Scheduling Backoff"

Cohesion: 0.14
Nodes (3): ExponentialBackoff, SyncScheduler, FakeTimer

### Community 10 - "Dashboard View Data"

Cohesion: 0.18
Nodes (8): buildKanbanColumns(), compareProjects(), dueDayNumber(), taskProgress(), upcomingDeadlines(), ProjectCard(), useDragClickGuard(), useIndexRefresh()

### Community 11 - "Sync Engine Test Fixtures"

Cohesion: 0.18
Nodes (6): FakeIndex, FakeStore, leaf(), makeProject(), makeTask(), seedSynced()

### Community 13 - "Domain Model Parsing"

Cohesion: 0.41
Nodes (9): optionalString(), parseDate(), parseEnum(), parseOptionalEnum(), parseProject(), parseTask(), parseWikilink(), taskToFrontmatter() (+1 more)

## Knowledge Gaps

- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `TaskIndex` connect `Task Indexing Views` to `Obsidian Plugin UI`, `Gantt Scheduling Recurrence`, `Calendar Burndown Dates`, `Project Task Management`, `Navigation Sync Status`, `Dashboard View Data`, `Domain Model Parsing`?**
  _High betweenness centrality (0.286) - this node is a cross-community bridge._
- **Why does `SyncEngine` connect `TickTick Sync Mapping` to `Obsidian Plugin UI`, `Sync Engine Test Fixtures`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **Why does `ProjectManager` connect `Project Task Management` to `Obsidian Plugin UI`, `Gantt Scheduling Recurrence`, `Task Indexing Views`, `Vault Project Tests`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `dueDateKey()` (e.g. with `tasksByDueDay()` and `clampStartKey()`) actually correct?**
  _`dueDateKey()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `Obsidian Plugin UI` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `TickTick Sync Mapping` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Gantt Scheduling Recurrence` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
