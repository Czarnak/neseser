# Graph Report - neseser  (2026-07-07)

## Corpus Check
- 64 files · ~89,002 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 431 nodes · 874 edges · 19 communities (16 shown, 3 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 83 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b5a73c3c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]

## God Nodes (most connected - your core abstractions)
1. `TaskIndex` - 35 edges
2. `NeseserPlugin` - 21 edges
3. `dueDateKey()` - 20 edges
4. `CategoryFilterStore` - 19 edges
5. `ProjectManager` - 19 edges
6. `SyncEngine` - 19 edges
7. `isTaskClosed()` - 15 edges
8. `FakeClient` - 14 edges
9. `dayKey()` - 13 edges
10. `TickTickClient` - 13 edges

## Surprising Connections (you probably didn't know these)
- `seriesValues()` --calls--> `burndownSeries()`  [INFERRED]
  tests/core/burndown-data.test.ts → src/core/burndown-data.ts
- `startFlow()` --calls--> `runOAuthFlow()`  [INFERRED]
  tests/sync/oauth-flow.test.ts → src/sync/oauth-flow.ts
- `draftFor()` --calls--> `taskToTickTick()`  [INFERRED]
  tests/sync/mapping.test.ts → src/sync/mapping.ts
- `ProjectCard()` --calls--> `burndownSeries()`  [INFERRED]
  src/ui/DashboardApp.tsx → src/core/burndown-data.ts
- `nextOccurrence()` --calls--> `rescheduleDue()`  [INFERRED]
  src/core/recurrence.ts → src/core/calendar-data.ts

## Communities (19 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (46): burndownSeries(), localDayOf(), round2(), sparklineGeometry(), seriesValues(), addDays(), dayKey(), makeDay() (+38 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (20): allowedProjectNames(), availableCategories(), categoryOf(), colorForCategory(), fallbackColor(), filterProjectsByCategory(), filterTasksByCategory(), matchesActive() (+12 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (23): isTaskClosed(), fingerprintDue(), flattenItems(), parseApiDateMs(), parseLocal(), priorityFromTickTick(), priorityToTickTick(), pushDates() (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (9): ObsidianEngineStore, isTickTickConnected(), NeseserSettingTab, formatSyncStatus(), isSameStatus(), SyncStatusStore, useSyncStatus(), GanttView (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (15): frontmatterBlock(), isoDate(), ProjectManager, sanitizeName(), cloneProjectTemplates(), createProjectTemplateId(), findSyncIdentityKeys(), isTemplateFolderSegment() (+7 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (3): TaskIndex, KanbanView, TodayView

### Community 6 - "Community 6"
Cohesion: 0.1
Nodes (11): optionalString(), parseDate(), parseEnum(), parseOptionalEnum(), parseProject(), parseTask(), parseWikilink(), taskToFrontmatter() (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (7): FakeClient, FakeIndex, FakeStore, leaf(), makeProject(), makeTask(), seedSynced()

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (8): runOAuthFlow(), startFlow(), buildAuthorizeUrl(), exchangeCode(), fakeHttp(), makeClient(), TickTickApiError, TickTickClient

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (3): ExponentialBackoff, SyncScheduler, FakeTimer

### Community 12 - "Community 12"
Cohesion: 0.24
Nodes (4): addSubmitButton(), NewProjectModal, NewTaskModal, trySubmit()

## Knowledge Gaps
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TaskIndex` connect `Community 5` to `Community 0`, `Community 1`, `Community 3`, `Community 6`, `Community 12`, `Community 13`?**
  _High betweenness centrality (0.202) - this node is a cross-community bridge._
- **Why does `ProjectManager` connect `Community 4` to `Community 0`, `Community 10`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `SyncEngine` connect `Community 2` to `Community 3`, `Community 7`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `dueDateKey()` (e.g. with `tasksByDueDay()` and `clampStartKey()`) actually correct?**
  _`dueDateKey()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._