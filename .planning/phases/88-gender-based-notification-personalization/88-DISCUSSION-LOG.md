# Phase 88: Gender-Based Notification Personalization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 88-gender-based-notification-personalization
**Areas discussed:** Gender inference, Registration UX, Notification copy variants, Rollout scope, DB schema change, Admin template editing, Name dictionary source, Backfill strategy

---

## Gender Inference

| Option                      | Description                                                                                                | Selected |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| Spanish name dictionary     | Build a local dictionary of common Argentine/Spanish names mapped to gender. Fast, no external dependency. | ✓        |
| External API (genderize.io) | Send names to a gender-guessing API. Higher coverage but external dependency.                              |          |
| Admin manual review only    | Generate list, admin sets one by one. Most accurate but labor-intensive.                                   |          |

**User's choice:** Spanish name dictionary
**Notes:** None

### Ambiguous Names

| Option                | Description                                                      | Selected |
| --------------------- | ---------------------------------------------------------------- | -------- |
| Flag for admin review | Generate report, admin sets manually. Neutral copy until set.    |          |
| Default to neutral    | Leave gender null. Notifications use neutral/masculine fallback. |          |
| Prompt member in-app  | Ask members to set it themselves via in-app prompt.              |          |

**User's choice:** Other — Registration page should have 4 options: Femenino, Masculino, Otro, No especificar. Unresolved existing names set to "no especificado" (unspecified).

---

## Registration UX

### Required vs Optional

| Option   | Description                                                     | Selected |
| -------- | --------------------------------------------------------------- | -------- |
| Required | Must pick one of 4 options. "No especificar" serves as opt-out. | ✓        |
| Optional | Field can be left blank. Blank = No especificar.                |          |

**User's choice:** Required
**Notes:** Four options: Femenino, Masculino, Otro, No especificar

---

## Notification Copy Variants

### Template Structure

| Option                        | Description                                               | Selected |
| ----------------------------- | --------------------------------------------------------- | -------- |
| Template interpolation        | Single template with placeholders. One template per type. |          |
| Separate templates per gender | Each type gets 2-3 template rows (male/female/neutral).   |          |

**User's choice:** Other — Male and female separate template fields (not rows). Fallback to male when gender is other/unspecified/null.

### Neutral Copy

| Option                   | Description                                                     | Selected |
| ------------------------ | --------------------------------------------------------------- | -------- |
| Masculine default        | Use masculine form as grammatical default. Standard in Spanish. | ✓        |
| Gender-neutral rewording | Rewrite to avoid gendered words entirely.                       |          |

**User's choice:** Masculine default

---

## Rollout Scope

### Which Templates

| Option             | Description                                     | Selected |
| ------------------ | ----------------------------------------------- | -------- |
| Only gendered ones | Only templates that use gendered words.         |          |
| All templates      | Create male/female variants for every template. | ✓        |

**User's choice:** All templates

### Admin Segment Sends

| Option          | Description                            | Selected |
| --------------- | -------------------------------------- | -------- |
| No, single copy | Admin composes one message for blasts. |          |
| Yes, dual copy  | Admin writes male and female versions. | ✓        |

**User's choice:** Yes, dual copy

---

## DB Schema Change

| Option                    | Description                                                                           | Selected |
| ------------------------- | ------------------------------------------------------------------------------------- | -------- |
| null (keep enum as-is)    | "No especificar" = null. No migration needed.                                         |          |
| Add 'unspecified' to enum | ALTER enum to include 'unspecified'. Distinguishes legacy null from explicit opt-out. | ✓        |

**User's choice:** Add 'unspecified' to enum
**Notes:** Semantic distinction: null = never asked (legacy), unspecified = explicitly chose not to say or name inference couldn't resolve.

---

## Admin Template Editing

| Option               | Description                                                       | Selected |
| -------------------- | ----------------------------------------------------------------- | -------- |
| Side-by-side fields  | One template row. Edit shows male/female title+body side-by-side. | ✓        |
| Tabs (Male / Female) | One row, tabbed editor. Saves space but harder to compare.        |          |
| Separate rows        | Each template twice in list (M/F suffix). Clutters list.          |          |

**User's choice:** Side-by-side fields

---

## Name Dictionary Source

| Option                   | Description                                                                        | Selected |
| ------------------------ | ---------------------------------------------------------------------------------- | -------- |
| Curated from member base | Extract unique first names from DB, map manually. 100% coverage of actual members. | ✓        |
| Open-source dataset      | Use existing Spanish names dataset. Broader but may miss nicknames.                |          |
| Both combined            | Start with dataset, patch with member names. Best coverage, more setup.            |          |

**User's choice:** Curated list from actual members

---

## Backfill Strategy

| Option                | Description                                                        | Selected |
| --------------------- | ------------------------------------------------------------------ | -------- |
| One-time seed script  | Standalone TypeScript script. Idempotent, produces report.         | ✓        |
| Part of migration SQL | Embed mapping in migration SQL. Auto-runs with db:migrate.         |          |
| Admin bulk-review UI  | Temporary admin page for review/confirm. Most accurate, more work. |          |

**User's choice:** One-time seed script
**Notes:** Must work against all 3 environments: local, staging, production. Each run independent and idempotent.

---

## Claude's Discretion

- Column naming strategy for gendered template fields
- Name dictionary format and storage
- Registration form field placement and component type
- Admin segment-send UI layout for dual-copy
- Template seed script approach

## Deferred Ideas

None — discussion stayed within phase scope
