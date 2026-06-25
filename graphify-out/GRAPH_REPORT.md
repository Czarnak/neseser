# Graph Report - neseser  (2026-06-25)

## Corpus Check
- 62 files · ~87,522 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 402 nodes · 812 edges · 20 communities (16 shown, 4 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 74 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `61d1b957`
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
4. `CategoryFilterStore` - 19 edges
5. `SyncEngine` - 19 edges
6. `ProjectManager` - 16 edges
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

## Communities (20 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (44): burndownSeries(), localDayOf(), round2(), sparklineGeometry(), seriesValues(), addDays(), dayKey(), makeDay() (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (20): allowedProjectNames(), availableCategories(), categoryOf(), colorForCategory(), fallbackColor(), filterProjectsByCategory(), filterTasksByCategory(), matchesActive() (+12 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (8): ObsidianEngineStore, ObsidianVaultAdapter, isTickTickConnected(), NeseserSettingTab, ExponentialBackoff, SyncScheduler, FakeTimer, GanttView

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (23): isTaskClosed(), fingerprintDue(), flattenItems(), parseApiDateMs(), parseLocal(), priorityFromTickTick(), priorityToTickTick(), pushDates() (+15 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (10): frontmatterBlock(), isoDate(), ProjectManager, sanitizeName(), nextInstanceTitle(), nextOccurrence(), noteBody(), stripDateSuffix() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (4): NeseserPlugin, runOAuthFlow(), startFlow(), emptySnapshot()

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (6): buildAuthorizeUrl(), exchangeCode(), fakeHttp(), makeClient(), TickTickApiError, TickTickClient

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (5): formatSyncStatus(), isSameStatus(), SyncStatusStore, useSyncStatus(), NavigationView

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (6): FakeIndex, FakeStore, leaf(), makeProject(), makeTask(), seedSynced()

### Community 11 - "Community 11"
Cohesion: 0.41
Nodes (9): optionalString(), parseDate(), parseEnum(), parseOptionalEnum(), parseProject(), parseTask(), parseWikilink(), taskToFrontmatter() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.24
Nodes (4): addSubmitButton(), NewProjectModal, NewTaskModal, trySubmit()

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TaskIndex` connect `Community 5` to `Community 0`, `Community 1`, `Community 2`, `Community 4`, `Community 8`, `Community 11`, `Community 12`, `Community 13`?**
  _High betweenness centrality (0.213) - this node is a cross-community bridge._
- **Why does `SyncEngine` connect `Community 3` to `Community 2`, `Community 10`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Why does `ProjectManager` connect `Community 4` to `Community 0`, `Community 2`, `Community 5`, `Community 14`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `dueDateKey()` (e.g. with `tasksByDueDay()` and `clampStartKey()`) actually correct?**
  _`dueDateKey()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._