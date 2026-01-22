# Phase 3: Shell & Module System - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Training module can register and load as a pluggable module within the shell. This delivers the architecture for module isolation and shared resource access — Training appears in navigation, routes lazy-load, global stores work from module context.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

This phase is infrastructure-focused. User deferred all implementation decisions to Claude:

- **Navigation presentation** — How Training module appears in nav (icon, label, position)
- **Module manifest structure** — How modules register and declare routes
- **Lazy-loading strategy** — Route chunking and preloading approach
- **Store access pattern** — How modules access global Pinia stores
- **API client sharing** — How auth interceptors propagate to module context
- **Error handling** — Module load failures and fallback behavior
- **Loading states** — Transitions when entering module

Follow established patterns from Phase 1-2 codebase. Prioritize simplicity over configurability.

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-shell-module-system*
*Context gathered: 2026-01-22*
