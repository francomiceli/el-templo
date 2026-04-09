# Phase 97: ROM Mode — Saturday Mobility Sessions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 97-rom-mode-saturday-mobility
**Areas discussed:** ROM format & prescription, Saturday detection logic, Admin & PDF display, Member app experience, ROM session editing, Approval flow, WeeklyView carousel, Historical sessions migration

---

## ROM Format & Prescription

| Option            | Description                               | Selected |
| ----------------- | ----------------------------------------- | -------- |
| For Quality X3    | Reuse existing format with rounds=3       | ✓        |
| Custom ROM format | New format type specifically for mobility |          |
| No format         | Plain prescription, no rounds concept     |          |

**User's choice:** For Quality X3
**Notes:** Matches coach's paper layout (x3 rounds, reps per exercise, rest per round)

---

| Option                     | Description                                | Selected |
| -------------------------- | ------------------------------------------ | -------- |
| Existing mobility defaults | ISO: 20s, CON: 10 reps                     |          |
| ROM-specific defaults      | Higher volume (30 reps, 30s)               |          |
| Custom (user specified)    | 3 CON exercises at 20/30/40 reps, 30s rest | ✓        |

**User's choice:** Custom — 3 CON exercises per block with randomly assigned reps of 20/30/40 (one each). ISO exercise is applied when resting, 30s.
**Notes:** After analyzing coach's paper, rest is a format-level param (30s between rounds), not a separate ISO exercise. Audio confirms "descansar 30 segundos y ahí vuelves a repetir."

---

| Option                | Description           | Selected |
| --------------------- | --------------------- | -------- |
| 3 exercises per block | Matches coach's paper | ✓        |
| Variable              | Coach decides count   |          |

**User's choice:** 3 exercises per block

---

| Option                         | Description               | Selected |
| ------------------------------ | ------------------------- | -------- |
| Different exercises per tier   | Alfa easier, delta harder | ✓        |
| Same exercises, different reps | Both tiers same exercises |          |

**User's choice:** Different exercises per tier

---

## Saturday Detection Logic

| Option                       | Description                         | Selected |
| ---------------------------- | ----------------------------------- | -------- |
| Hardcode sabado = ROM        | Simplest, if day=sabado then ROM    |          |
| Admin toggle per day-of-week | Config table, admin can set any day | ✓        |
| Per-week admin toggle        | Maximum flexibility, most complex   |          |

**User's choice:** Admin toggle per day-of-week
**Notes:** User specified no branch_id needed — "all branches do the same everyday"

---

| Option               | Description                     | Selected |
| -------------------- | ------------------------------- | -------- |
| Same FLOW warmup     | Reuse existing INITIUM pipeline |          |
| Mobility-only warmup | ROM-specific warmup             |          |
| Skip INITIUM for ROM | No warmup block                 | ✓        |

**User's choice:** Skip INITIUM for ROM

---

| Option                         | Description                | Selected |
| ------------------------------ | -------------------------- | -------- |
| day_modes table (no branch_id) | Simple global config table | ✓        |
| Extend spom_config singleton   | Add rom_days JSON field    |          |

**User's choice:** day_modes table, global, no branch_id

---

| Option                  | Description                        | Selected |
| ----------------------- | ---------------------------------- | -------- |
| Same batch flow         | Generator checks day_modes per day | ✓        |
| Separate ROM generation | Coach triggers ROM independently   |          |

**User's choice:** Same batch flow

---

| Option                      | Description                      | Selected |
| --------------------------- | -------------------------------- | -------- |
| Seed only, no UI            | Change in DB if needed           |          |
| Admin UI in generation page | Day mode toggles in SessionsPage | ✓        |

**User's choice:** Admin UI in the session generation page
**Notes:** User said "add management for this in /generate, and I think it will be it right?"

---

| Option                      | Description                    | Selected |
| --------------------------- | ------------------------------ | -------- |
| Skip generation on holidays | Same as regular days           | ✓        |
| Generate anyway             | Coach can delete if not needed |          |

**User's choice:** Skip generation entirely on holidays

---

## Admin & PDF Display

| Option                         | Description                          | Selected |
| ------------------------------ | ------------------------------------ | -------- |
| Inline with visual distinction | ROM badge, 2 levels, ROM block names | ✓        |
| Separate ROM section           | Below regular days                   |          |
| No distinction                 | Same as regular, fewer levels        |          |

**User's choice:** Inline with visual distinction

---

| Option                                     | Description        | Selected |
| ------------------------------------------ | ------------------ | -------- |
| LOWER / CORE / UPPER                       | English labels     |          |
| TREN INFERIOR / ZONA MEDIA / TREN SUPERIOR | Spanish labels     | ✓        |
| Coach decides later                        | Placeholder labels |          |

**User's choice:** Spanish labels (TREN INFERIOR / ZONA MEDIA / TREN SUPERIOR)
**Notes:** Initially recommended English to match existing PDF style. User explicitly requested Spanish wording.

---

| Option                      | Description         | Selected |
| --------------------------- | ------------------- | -------- |
| BÁSICO / AVANZADO           | Spanish tier labels | ✓        |
| Keep α (alfa) / Δ (delta)   | Same Greek symbols  |          |
| Both: α BÁSICO / Δ AVANZADO | Combined labels     |          |

**User's choice:** BÁSICO / AVANZADO

---

| Option               | Description             | Selected |
| -------------------- | ----------------------- | -------- |
| 2-row stacked layout | Full width per tier     | ✓        |
| Side-by-side columns | Left/right split        |          |
| Single column        | Grouped by tier headers |          |

**User's choice:** 2-row stacked layout

---

## Member App Experience

| Option                   | Description                      | Selected |
| ------------------------ | -------------------------------- | -------- |
| Simplified training view | Same page, 3 blocks, no Deuteros | ✓        |
| Dedicated ROM page       | Separate page with custom layout |          |

**User's choice:** Simplified training view

---

| Option                  | Description                                | Selected |
| ----------------------- | ------------------------------------------ | -------- |
| Show both, member picks | Display Básico and Avanzado                |          |
| Auto-assign by level    | alfa/delta → Básico, sigma+ → Avanzado     |          |
| Level-based (custom)    | alfa → Básico, delta and others → Avanzado | ✓        |

**User's choice:** alfa sees Básico, delta and all others see Avanzado

---

| Option              | Description                     | Selected |
| ------------------- | ------------------------------- | -------- |
| View-only for now   | Reference sheet, no player      |          |
| Full player support | DayPlayer works with ROM blocks | ✓        |
| Simplified player   | Checklist, mark done            |          |

**User's choice:** Full player support
**Notes:** User asked about difficulty. Analysis showed ~10-15% extra scope since ROM blocks are "NUCLEUS-like" and DayPlayer already handles sequential blocks.

---

## ROM Session Editing

| Option              | Description                        | Selected |
| ------------------- | ---------------------------------- | -------- |
| Filter by body zone | mobility_related mapping per block | ✓        |
| Show all mobility   | Full 126 exercises                 |          |
| Show all exercises  | No restriction                     |          |

**User's choice:** Filter by body zone using mobility_related mapping

---

| Option                         | Description                 | Selected |
| ------------------------------ | --------------------------- | -------- |
| Remove DESCANSO ACTIVO for ROM | All exercises are mobility  | ✓        |
| Keep it                        | 4th exercise as active rest |          |

**User's choice:** Remove DESCANSO ACTIVO for ROM blocks

---

## Approval & Review Flow

| Option                        | Description               | Selected |
| ----------------------------- | ------------------------- | -------- |
| Same workflow                 | pending_review → approved | ✓        |
| Auto-approve on generation    | Skip pending state        |          |
| Auto-approve after first edit | Hybrid approach           |          |

**User's choice:** Same workflow as regular sessions

---

## WeeklyView Carousel (App)

| Option                | Description                      | Selected |
| --------------------- | -------------------------------- | -------- |
| ROM badge on day card | Small tag, body zone block names | ✓        |
| Different card style  | Distinct visual treatment        |          |
| No distinction        | Same card, ROM block names only  |          |

**User's choice:** ROM badge on the day card

---

## Historical Saturday Sessions

| Option                       | Description                              | Selected |
| ---------------------------- | ---------------------------------------- | -------- |
| Leave as-is                  | Old sessions keep session_mode='regular' | ✓        |
| Backfill as regular          | Explicit migration                       |          |
| Delete old Saturday sessions | Clean slate                              |          |

**User's choice:** Leave as-is — column defaults to 'regular', no migration needed

---

## Claude's Discretion

- Block role naming convention (casing, separator)
- Handling thin PL exercise pool (11 exercises for ROM_UPPER)
- DayPlayer block transition UX for ROM

## Deferred Ideas

- Body zone column on exercises (when pool grows beyond mobility_related mapping)
- ROM as a goal plan program (goalPlanType = 'rom' with enrollment)
- Per-branch day modes (branch_id on day_modes table)
