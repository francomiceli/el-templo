---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Landing Page
status: Phase 46 reset — original extraction used outdated arete-app; redoing from arete-web
stopped_at: Phase 46 context updated
last_updated: "2026-03-09T15:04:48.179Z"
last_activity: 2026-03-08 — Reset Phase 46 for arete-web re-extraction
progress:
  total_phases: 38
  completed_phases: 24
  total_plans: 129
  completed_plans: 126
  percent: 96
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-08)

**Core value:** The operational backbone works — coaches manage from one admin, members check in and reserve spots, architecture ready for AURA/lifestyle/social.
**Current focus:** v4.0 Ecosystem Foundation — Phase 46 executing

## Current Position

Phase: 46 of 52 (Lifestyle Content Extraction — REDO)
Plan: 0 of ? in current phase (reset for arete-web source)
Status: Phase 46 reset — original extraction used outdated arete-app; redoing from arete-web
Last activity: 2026-03-08 — Reset Phase 46 for arete-web re-extraction

Progress: [█████████░] 96%

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: 5min
- Total execution time: 0.4 hours

**By Phase:**

| Phase                           | Plans | Total | Avg/Plan |
| ------------------------------- | ----- | ----- | -------- |
| 45-architecture-foundation      | 3     | 12min | 4min     |
| 46-lifestyle-content-extraction | 2     | 12min | 6min     |

**Recent Trend:**

- Last 5 plans: 45-01 (4min), 45-02 (3min), 45-03 (5min), 46-01 (4min), 46-02 (8min)
- Trend: Stable

_Updated after each plan completion_

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Virtual "Templo Online" branch: avoids nullable branchId everywhere
- Modular monolith: formalize src/modules/ pattern with explicit boundaries
- Barrel export convention: each module has index.ts defining public API; import from barrel not internals
- AURA tracking from day 1: foundation tables so early adopters aren't penalized
- AURA schema: separate mysqlEnum per table (source_type vs aura_config_source_type) to avoid MySQL column name collision
- AuraService uses constructor DI (db + logger) for testability, not Fastify decorator
- AuraSourceType union type for compile-time safety on AURA source types
- Merge admin apps: Net features rebuilt in Vue/Quasar within existing el-templo-admin
- Seed data pattern: typed arrays with 'as const satisfies readonly Type[]' for compile-time validation
- Lifestyle content: light brand adaptation preserving original rioplatense tone, only removing brand references
- [Phase 46 RESET]: Original extraction from arete-app is outdated — arete-web is canonical source with significantly expanded content (20 levels vs 5, 60 challenges vs 36, 160 factos vs 80, Greek-only philosophy, 7 new systems)
- [Phase 46 RESET]: Old seed files (habits, factos, journal-questions, tools) need replacement from arete-web
- [Phase 46 RESET]: DEFERRED-CONTENT.md rewritten with full arete-web inventory

### v2.0 Deferrals

- Phase 21: APK signing / Play Store
- Phase 22-24: Branch Attendance (now rebuilt properly as Phases 50-51)

### Reference Codebases

- El-Templo-Net: members, subscriptions, payments, scheduling, analytics (16 tables)
- Arete Web (canonical): Next.js PWA — 39 habits + 12 seasonal, 70 journal questions, 60 challenges, 160 factos, 149 wisdom quotes, 25 achievements, 20 levels, axis XP, AURA economy with per-habit scaling, redemption store, Tummo breathing, 5 leagues, 12 badges. Greek-only philosophy. Replaces the older arete-app (React Native, deprecated).
- Both reference only — features rebuilt on Vue/Fastify/MySQL stack

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-09T15:04:48.177Z
Stopped at: Phase 46 context updated
Resume file: .planning/phases/46-lifestyle-content-extraction/46-CONTEXT.md
