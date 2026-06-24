# Graph Report - neseser  (2026-06-24)

## Corpus Check
- 55 files · ~30,940 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 377 nodes · 731 edges · 18 communities (16 shown, 2 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 73 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d012d92f`
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

## Communities (18 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (9): ObsidianEngineStore, ObsidianVaultAdapter, addSubmitButton(), NewProjectModal, NewTaskModal, trySubmit(), CalendarView, DashboardView (+1 more)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (29): rescheduleDue(), barGeometry(), buildSegments(), clampStartKey(), computeMoveResult(), computeResizeResult(), dayDiff(), dayKeyMs() (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (23): isTaskClosed(), fingerprintDue(), flattenItems(), parseApiDateMs(), parseLocal(), priorityFromTickTick(), priorityToTickTick(), pushDates() (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (9): frontmatterBlock(), isoDate(), ProjectManager, sanitizeName(), FakeVault, nextInstanceTitle(), noteBody(), stripDateSuffix() (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (6): NeseserPlugin, isTickTickConnected(), NeseserSettingTab, runOAuthFlow(), startFlow(), emptySnapshot()

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (17): burndownSeries(), localDayOf(), round2(), sparklineGeometry(), seriesValues(), addDays(), dayKey(), makeDay() (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (5): formatSyncStatus(), isSameStatus(), SyncStatusStore, useSyncStatus(), NavigationView

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (6): buildAuthorizeUrl(), exchangeCode(), fakeHttp(), makeClient(), TickTickApiError, TickTickClient

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (3): ExponentialBackoff, SyncScheduler, FakeTimer

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (8): buildKanbanColumns(), compareProjects(), dueDayNumber(), taskProgress(), upcomingDeadlines(), ProjectCard(), useDragClickGuard(), useIndexRefresh()

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (6): FakeIndex, FakeStore, leaf(), makeProject(), makeTask(), seedSynced()

### Community 13 - "Community 13"
Cohesion: 0.41
Nodes (9): optionalString(), parseDate(), parseEnum(), parseOptionalEnum(), parseProject(), parseTask(), parseWikilink(), taskToFrontmatter() (+1 more)

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TaskIndex` connect `Community 6` to `Community 0`, `Community 1`, `Community 3`, `Community 5`, `Community 7`, `Community 10`, `Community 13`?**
  _High betweenness centrality (0.289) - this node is a cross-community bridge._
- **Why does `SyncEngine` connect `Community 2` to `Community 0`, `Community 11`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Why does `ProjectManager` connect `Community 3` to `Community 0`, `Community 1`, `Community 6`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `dueDateKey()` (e.g. with `tasksByDueDay()` and `clampStartKey()`) actually correct?**
  _`dueDateKey()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._