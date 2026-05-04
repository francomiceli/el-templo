# Phase 112: Enrollment Service + Admin Add-ons - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 112-enrollment-service-admin-add-ons
**Areas discussed:** Pause behavior, Pause scope (admin_addon vs all sources)

---

## Gray Area Selection

User declined to discuss the four pre-identified technical gray areas (Finance contract, Pause + bundle edge cases, RBAC + audit, Migration backfill rules), responding "todo esto me parece poco relevante para una discusion".

Rationale: the v4.85 milestone scope was already locked in extensive prior conversation (the chat that led to creating the milestone). The remaining items were either:

- Implementation details research/planner can resolve mechanically against the codebase (finance enum extension, RBAC pattern, migration backfill rules), or
- Already covered by REQUIREMENTS.md decisions.

Only one product-level decision was uncovered: behavior of add-ons when the parent subscription is paused (not cancelled).

---

## Pause Behavior

| Option | Description                                                            | Selected |
| ------ | ---------------------------------------------------------------------- | -------- |
| A      | Add-ons stay active during pause; no state change                      |          |
| B      | Add-ons also pause; resume when sub resumes                            | ✓        |
| C      | Add-ons cancel when sub pauses (parallel to cancel/expire — strictest) |          |

**User's choice:** B
**Notes:** User confirmed pause should propagate to add-ons. Triggered the follow-up question about scope.

---

## Pause Scope (admin_addon only vs all sources)

| Option | Description                                                                                                                | Selected |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| B1     | Only admin_addon enrollments pause; plan_linked / plan_bundle stay active during sub pause (preserves existing behavior)   |          |
| B2     | All active enrollments associated with the sub pause (admin_addon + plan_linked + plan_bundle) — closes a pre-existing gap | ✓        |

**User's choice:** B2
**Notes:** User asked "o sea que hasta hoy, cuando una suscripcion se pausa el programa no se estaba pausando?" — confirmed by reading `subscriptions/service.ts:1764-1817` (`pauseSubscription` does not touch `program_enrollments`). User decided this was a gap to close, not preserved behavior. Implication: extend `program_enrollment_status` enum with `paused` value (D-02), add `pauseForSubscription`/`resumeForSubscription` methods to EnrollmentService (D-16, D-17).

---

## Claude's Discretion

- Internal plan structure within Phase 112 (defined during `/gsd-plan-phase 112`).
- Exact method signatures, error code names, enum extension naming — research/planner per codebase conventions.
- Test strategy mix (unit vs integration), guided by CLAUDE.md (integration tests against real MySQL).

## Deferred Ideas

- Flow combinado "renovar + regalar" (deferred from REQUIREMENTS.md, restated here).
- Refund automático al cancelar add-on manualmente (deferred from REQUIREMENTS.md).
- Reactivación automática al re-suscribirse (out of scope — decisión C).
- Multi-currency override en pricePaid (out of scope).
