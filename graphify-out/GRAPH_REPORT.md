# Graph Report - neseser  (2026-06-22)

## Corpus Check

- 55 files · ~30,154 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 371 nodes · 715 edges · 19 communities (16 shown, 3 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 73 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `1fbcb64e`
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
- [[_COMMUNITY_Community 14|Community 14]]

## God Nodes (most connected - your core abstractions)

1. `TaskIndex` - 35 edges
2. `dueDateKey()` - 20 edges
3. `NeseserPlugin` - 19 edges
4. `SyncEngine` - 19 edges
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

### Community 0 - "Community 0"

Cohesion: 0.05
Nodes (9): ObsidianEngineStore, ObsidianVaultAdapter, addSubmitButton(), NewProjectModal, NewTaskModal, trySubmit(), DashboardView, GanttView (+1 more)

### Community 1 - "Community 1"

Cohesion: 0.13
Nodes (23): isTaskClosed(), fingerprintDue(), flattenItems(), parseApiDateMs(), parseLocal(), priorityFromTickTick(), priorityToTickTick(), pushDates() (+15 more)

### Community 2 - "Community 2"

Cohesion: 0.12
Nodes (11): rescheduleDue(), frontmatterBlock(), isoDate(), ProjectManager, sanitizeName(), nextInstanceTitle(), nextOccurrence(), noteBody() (+3 more)

### Community 3 - "Community 3"

Cohesion: 0.14
Nodes (19): barGeometry(), clampStartKey(), computeMoveResult(), computeResizeResult(), dayDiff(), dayKeyMs(), daysFromPixels(), ganttLanes() (+11 more)

### Community 5 - "Community 5"

Cohesion: 0.15
Nodes (16): burndownSeries(), localDayOf(), round2(), sparklineGeometry(), seriesValues(), addDays(), dayKey(), makeDay() (+8 more)

### Community 6 - "Community 6"

Cohesion: 0.11
Nodes (4): NeseserPlugin, isTickTickConnected(), NeseserSettingTab, emptySnapshot()

### Community 7 - "Community 7"

Cohesion: 0.11
Nodes (11): overdueDays(), todayGroups(), buildKanbanColumns(), compareProjects(), compareTasks(), dueDayNumber(), taskProgress(), upcomingDeadlines() (+3 more)

### Community 8 - "Community 8"

Cohesion: 0.13
Nodes (8): runOAuthFlow(), startFlow(), buildAuthorizeUrl(), exchangeCode(), fakeHttp(), makeClient(), TickTickApiError, TickTickClient

### Community 9 - "Community 9"

Cohesion: 0.13
Nodes (5): formatSyncStatus(), isSameStatus(), SyncStatusStore, useSyncStatus(), NavigationView

### Community 10 - "Community 10"

Cohesion: 0.14
Nodes (3): ExponentialBackoff, SyncScheduler, FakeTimer

### Community 12 - "Community 12"

Cohesion: 0.18
Nodes (6): FakeIndex, FakeStore, leaf(), makeProject(), makeTask(), seedSynced()

### Community 13 - "Community 13"

Cohesion: 0.41
Nodes (9): optionalString(), parseDate(), parseEnum(), parseOptionalEnum(), parseProject(), parseTask(), parseWikilink(), taskToFrontmatter() (+1 more)

## Knowledge Gaps

- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `TaskIndex` connect `Community 4` to `Community 0`, `Community 2`, `Community 3`, `Community 5`, `Community 7`, `Community 9`, `Community 13`?**
  _High betweenness centrality (0.285) - this node is a cross-community bridge._
- **Why does `SyncEngine` connect `Community 1` to `Community 0`, `Community 12`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **Why does `ProjectManager` connect `Community 2` to `Community 0`, `Community 3`, `Community 4`, `Community 14`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `dueDateKey()` (e.g. with `tasksByDueDay()` and `clampStartKey()`) actually correct?**
  _`dueDateKey()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
