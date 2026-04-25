# Phase 103: User Status Enum - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `103-CONTEXT.md` — this log preserves the alternatives considered and the conversation arc that led to the final 4-state enum.

**Date:** 2026-04-25
**Phase:** 103-user-status-enum
**Areas discussed:** Auto-transition placement, Backfill SQL mechanics, ConvertedAt coordination, Self-registered members

---

## Pre-discuss naming pivot (during area selection)

The SPEC was originally written with a 3-state enum `prueba | alumno | inactivo`. During the backfill question, the user asked: _"en la 1, no debería ser status=activo en vez de alumno?"_. This triggered a naming review that re-opened the SPEC.

| Option                                 | Description                    | Selected                            |
| -------------------------------------- | ------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------- | --- |
| `prueba                                | alumno                         | inactivo`                           | Sustantivo for the middle value; aligned with "AlumnosPage" product vocabulary  |     |
| `prueba                                | activo                         | inactivo`                           | Adjective consistent with the other states; reads naturally as "status: activo" | ✓   |
| Decoupled DB/UI (DB=alumno, UI=Activo) | Cleanest model + UX continuity | (proposed but rejected as overkill) |

**User's choice:** `activo` (Spanish adjective).
**Notes:** Claude initially recommended `alumno`. User pushed back: _"explicame por que decis que no [activo]"_. Claude re-evaluated, conceded the argument was weak (the `is_active` overlap concern was theoretical since `is_active` is being deleted anyway), and updated to `activo`. Gramatically the 3 values become consistent adjectives.

---

## Area 1 — Auto-transition placement

| Option                                   | Description                                                                                                    | Selected        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------- |
| Helper `recomputeUserStatus(userId, tx)` | Single declarative helper called from every sub-mutating method                                                | ✓               |
| Hooks paralelos específicos              | Two helpers: `onSubscriptionActivated` and `onSubscriptionDeactivated`. More explicit but easier to forget one |                 |
| Inline en cada método                    | UPDATE inline in `createSubscription`/`cancelSubscription`/etc. Simple to read but duplicated logic in 5 sites |                 |
| DB trigger                               | Rejected upfront — project convention is no triggers; logic stays in app                                       | (not presented) |

**User's choice:** Helper `recomputeUserStatus`.
**Notes:** Codebase scout confirmed 4 distinct subscription-insert sites (`createSubscription` line 720+, plus 1620, 2006, 2204) and 1 cancel site (1262). Helper avoids 5x duplication.

---

## Area 2 — Backfill SQL mechanics

| Option                       | Description                                                                                 | Selected |
| ---------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| 3 UPDATEs secuenciales       | Each guarded by `WHERE status IS NULL`, idempotent, debuggable line-by-line                 | ✓        |
| Un solo UPDATE con CASE WHEN | Compact, one pass over the table. Subqueries nested inside CASE — denser to read            |          |
| Script TypeScript que itera  | Reuses `recomputeUserStatus` for each user. Slow at 5K users, more code in migration runner |          |

**User's choice:** 3 UPDATEs secuenciales.
**Notes:** This grew to 4 UPDATEs after adding the `freemium` state (Area 4 below).

---

## Area 3 — ConvertedAt coordination

| Option                                     | Description                                                                                                                                      | Selected |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Fusionar: `recomputeUserStatus` hace ambos | Helper sets `status` AND sets `converted_at` if transitioning to `activo` for the first time with a trial booking. `markConvertedIfLead` deleted | ✓        |
| Mantener paralelos                         | Two methods called in sequence at every call site                                                                                                |          |

**User's choice:** Fusionar.
**Notes:** Less risk of forgetting one helper at one call site. Single source of truth post-subscription.

---

## Area 4 — Self-registered members

This area produced the biggest model change of the discussion — surfaced a 4th state.

### Sub-question 4a: What state for self-registered users without trial booking or sub?

| Option                                  | Description                                                                                         | Selected                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `inactivo`                              | Self-reg without activity = "not active student". Filter "Prueba" stays clean (only physical leads) |                                                   |
| `prueba`                                | All non-paying users in one bucket. Simple but mixes hot leads with cold self-regs                  |                                                   |
| Nuevo estado: `registrado` (or similar) | 4-state enum. More expressive                                                                       | (chose direction "3" but with naming pivot below) |

**User's choice:** Direction 3 (new state).
**Notes:** User added critical context: _"hay que pensar que los que se registran desde la app son básicamente usuarios online que pueden llegar a adquirir programas online... eso los convertiría en activos?"_ — confirmed online plan purchase would auto-flip to `activo` via `recomputeUserStatus`. So the 4th state represents "online user, no plan yet", which aligns with fase 89-91 framing.

### Sub-question 4b: 4 states ahora, or 3 + decide in fase 89-91?

| Option                      | Description                                                      | Selected |
| --------------------------- | ---------------------------------------------------------------- | -------- |
| 3 ahora, revisitar en 89-91 | Avoid premature design. Self-regs land in `inactivo` temporarily |          |
| 4 estados ahora             | Clean model from day 1. No re-migration needed                   | ✓        |

**User's choice:** 4 estados ahora.

### Sub-question 4c: Name for the 4th state

| Option       | Description                                                           | Selected |
| ------------ | --------------------------------------------------------------------- | -------- |
| `freemium`   | SaaS standard term. Describes the model. Loanword from English        | ✓        |
| `registrado` | Generic — every user is "registered" technically                      |          |
| `online`     | Describes channel, not state. Ambiguous if user later goes presential |          |

**User's choice:** `freemium`.

### Sub-question 4d: Default branch for self-registered users (asked by user)

User asked: _"recordame en qué branch ponemos a esta persona que se autorregistra"_.

Confirmed by code reading (`auth/routes.ts:82-111`): self-register defaults to branch with `code='ONLINE'` if no `branchId` is provided in the request body. This signal feeds Sub-question 4e.

### Sub-question 4e: Backfill rule to distinguish `freemium` from `inactivo`

| Option                                                                                  | Description                                                                                                                       | Selected |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `branch=ONLINE` → freemium; resto sin sub → inactivo                                    | Uses concrete signal already in the system                                                                                        | ✓        |
| `converted_at IS NULL` → freemium; `converted_at IS NOT NULL` → inactivo                | Pure semantics but `converted_at` is only set when there was a trial booking — many old ex-alumnos would wrongly land in freemium |          |
| Combinación: cualquier sub histórica → inactivo, sin sub → freemium/inactivo por branch | Detects ex-alumnos correctly without depending on `converted_at`. Slightly more complex query                                     |          |

**User's choice:** branch-based rule.
**Notes:** Edge case acknowledged (online user later moved to physical branch) — rare and not worth special-casing in this phase.

---

## Claude's Discretion

The user delegated to Claude:

- Naming of the helper inside `SubscriptionService` (`recomputeUserStatus` is the working name)
- Exact SQL syntax (`EXISTS` vs `JOIN` in backfill UPDATEs)
- Test file organization (one new test file vs spread across existing module test files)
- Quasar component for the dropdown (`q-select` is the obvious match)

## Deferred Ideas

- **Online plans / freemium UX** in member app → fase 89-91 (Planes Online — Digital Monetization)
- **Manual status editing by admin** → if a regression case surfaces, separate phase
- **Reports refactor** to read `status` instead of `converted_at IS NULL` → optional cleanup phase, not blocking
- **Sub-categories or extra states** (`pausado`, `expirado`, `lapsed`, `online_freemium` split) → locked at 4 for this phase, future ADR if needed
