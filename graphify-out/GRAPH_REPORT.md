# Graph Report - neseser  (2026-06-26)

## Corpus Check
- 64 files · ~88,866 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 430 nodes · 870 edges · 22 communities (18 shown, 4 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 83 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6fc56786`
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
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]

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
- `handleDragEnd()` --calls--> `dueDateKey()`  [INFERRED]
  src/ui/CalendarApp.tsx → src/core/view-data.ts
- `draftFor()` --calls--> `taskToTickTick()`  [INFERRED]
  tests/sync/mapping.test.ts → src/sync/mapping.ts
- `burndownSeries()` --calls--> `addDays()`  [INFERRED]
  src/core/burndown-data.ts → src/core/calendar-data.ts

## Communities (22 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (8): NeseserPlugin, ObsidianEngineStore, isTickTickConnected(), NeseserSettingTab, runOAuthFlow(), startFlow(), emptySnapshot(), GanttView

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (22): allowedProjectNames(), availableCategories(), categoryOf(), colorForCategory(), fallbackColor(), filterProjectsByCategory(), filterTasksByCategory(), matchesActive() (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (33): addDays(), makeDay(), mondayIndex(), monthGrid(), rescheduleDue(), tasksByDueDay(), weekRow(), barGeometry() (+25 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (23): isTaskClosed(), fingerprintDue(), flattenItems(), parseApiDateMs(), parseLocal(), priorityFromTickTick(), priorityToTickTick(), pushDates() (+15 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (16): frontmatterBlock(), isoDate(), ProjectManager, sanitizeName(), cloneProjectTemplates(), createProjectTemplateId(), findSyncIdentityKeys(), isTemplateFolderSegment() (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (3): TaskIndex, DashboardView, KanbanView

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (7): FakeClient, FakeIndex, FakeStore, leaf(), makeProject(), makeTask(), seedSynced()

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (6): buildAuthorizeUrl(), exchangeCode(), fakeHttp(), makeClient(), TickTickApiError, TickTickClient

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (3): ExponentialBackoff, SyncScheduler, FakeTimer

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (4): formatSyncStatus(), isSameStatus(), SyncStatusStore, NavigationView

### Community 10 - "Community 10"
Cohesion: 0.22
Nodes (9): burndownSeries(), localDayOf(), round2(), sparklineGeometry(), seriesValues(), dayKey(), overdueDays(), todayGroups() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.41
Nodes (9): optionalString(), parseDate(), parseEnum(), parseOptionalEnum(), parseProject(), parseTask(), parseWikilink(), taskToFrontmatter() (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.24
Nodes (4): addSubmitButton(), NewProjectModal, NewTaskModal, trySubmit()

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TaskIndex` connect `Community 5` to `Community 0`, `Community 1`, `Community 2`, `Community 9`, `Community 12`, `Community 14`, `Community 15`, `Community 16`?**
  _High betweenness centrality (0.201) - this node is a cross-community bridge._
- **Why does `ProjectManager` connect `Community 4` to `Community 0`, `Community 2`, `Community 5`, `Community 11`, `Community 15`, `Community 16`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **Why does `SyncEngine` connect `Community 3` to `Community 0`, `Community 6`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `dueDateKey()` (e.g. with `tasksByDueDay()` and `clampStartKey()`) actually correct?**
  _`dueDateKey()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._