# Phase 88: Gender-Based Notification Personalization - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Add gender-awareness to the push notification system. Three pillars: (1) infer gender for existing members from first names using a curated dictionary, (2) add gender as a required field in the registration page, (3) make all notification templates support male/female variants with male as fallback for other/unspecified/null. Admin template editing shows side-by-side male/female fields. Admin segment sends also support dual-copy (male/female versions).

</domain>

<decisions>
## Implementation Decisions

### Gender Inference (Existing Members)

- **D-01:** Use a curated Spanish name dictionary built from the actual member base. Extract all unique first names from the DB, map each to male/female. This covers 100% of real members without external API dependency.
- **D-02:** Unresolved/ambiguous names are set to `'unspecified'` — not left as null. Null means "never asked" (legacy), unspecified means "asked but declined" or "couldn't determine".
- **D-03:** Backfill via a one-time standalone TypeScript seed script (like seed-v4.ts pattern). Script is idempotent, safe to re-run. Must work against all 3 environments: local, staging, production.
- **D-04:** Script produces a report showing: names mapped to male, names mapped to female, names left as unspecified (with the actual names listed for review).

### Database Schema

- **D-05:** ALTER the gender enum from `('male', 'female', 'other')` to `('male', 'female', 'other', 'unspecified')`. Standard Drizzle migration.
- **D-06:** Semantic distinction: `null` = legacy member never asked about gender. `'unspecified'` = member explicitly chose "No especificar" or name inference couldn't resolve.

### Registration UX

- **D-07:** Gender is a **required** field on the registration page. Four options: Femenino, Masculino, Otro, No especificar.
- **D-08:** "No especificar" maps to `'unspecified'` in the DB. "Otro" maps to `'other'`. Both receive masculine-default notification copy.
- **D-09:** Registration API endpoint (`/auth/register`) must be updated to accept gender parameter.

### Notification Template Variants

- **D-10:** **All** notification templates get male/female variants — not just the ones that currently use gendered words. This future-proofs for copy changes.
- **D-11:** Separate male and female fields per template (title_male, body_male, title_female, body_female) on the notification_templates table. NOT separate template rows.
- **D-12:** Notification service resolves gender per user when sending: female → use female fields, male → use male fields, other/unspecified/null → fallback to male fields.
- **D-13:** Admin-sent segment notifications also support dual-copy. Admin writes male and female versions when composing a segment send.

### Admin Template Editing

- **D-14:** Template edit UI shows side-by-side male/female title+body fields. Single save action. Clear visual pairing of the two variants.
- **D-15:** Template list still shows one row per template type (not duplicated for gender).

### Rollout & Backfill Strategy

- **D-16:** Migration adds `title_female` and `body_female` columns to notification_templates. Existing title/body become the male (default) variants — rename to `title_male`/`body_male` or keep as-is with female as the new addition. Claude's discretion on column naming.
- **D-17:** Template seed data updated with female variants for all 11 template types.
- **D-18:** Backfill script runs against local → staging → production in that order. Each run is independent and idempotent.

### Claude's Discretion

- Column naming strategy (rename existing title/body to title_male/body_male vs add title_female/body_female alongside)
- Name dictionary format and storage (hardcoded in script, JSON file, or inline map)
- Registration form field placement and component type (q-select, q-option-group, etc.)
- Admin segment-send UI layout for dual-copy fields
- Template seed script approach (update existing seed function vs separate migration)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Push Notification System

- `.planning/phases/84-push-notifications/84-CONTEXT.md` — Full notification architecture decisions (D-01 through D-41). Template structure, queue, cron, admin UI, preferences.
- `el-templo-api/src/modules/notifications/types.ts` — Current TEMPLATE_SEEDS with all 11 notification templates (just updated with brand voice copy)
- `el-templo-api/src/modules/notifications/service.ts` — NotificationService: queue processing, template resolution, FCM sending
- `el-templo-api/src/modules/notifications/routes.ts` — Admin template CRUD, segment send, member preferences endpoints

### Gender Schema & Existing Code

- `el-templo-api/src/db/schema/users.ts` — Current genderEnum definition (line 28), gender column on users table (line 55)
- `el-templo-api/src/modules/members/schemas.ts` — Member create/update schemas with gender field (lines 185, 219)
- `el-templo-api/src/modules/members/service.ts` — Gender handling in create/update member (lines 269-284, 331-332)
- `el-templo-admin/src/components/MemberFormDialog.vue` — Existing admin gender field with options (lines 581-585)
- `el-templo-admin/src/components/MemberProfileTab.vue` — Gender display in admin (lines 131-132)

### Registration Flow

- `el-templo-api/src/modules/auth/schemas.ts` — registerSchema (needs gender added)
- `el-templo-api/src/modules/auth/routes.ts` — Register endpoint (line 34)
- `el-templo-app/src/pages/RegisterPage.vue` — Registration form (needs gender field)

### DB & Migrations

- `el-templo-api/src/db/schema/notifications.ts` — notification_templates table schema (needs female columns)
- `el-templo-api/src/db/import-members.ts` — Reference for name→gender mapping logic from DeportNet import (lines 125-127)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Gender enum already exists** in users schema — just needs 'unspecified' added
- **Admin gender options** in MemberFormDialog.vue (Masculino/Femenino/Otro) — extend with "No especificar"
- **Name→gender mapping precedent** in import-members.ts (sexo === "Masculino" → "male" pattern)
- **Template seed function** in notification service already handles upserting templates on startup

### Established Patterns

- **Constructor DI** for all services
- **Drizzle migrations** with custom runner (never use drizzle-kit migrate)
- **Seed scripts** pattern (seed-v4.ts) for one-time data operations
- **Admin form dialogs** with q-select for enums (MemberFormDialog pattern)

### Integration Points

- RegisterPage.vue — add gender q-select field
- /auth/register endpoint — accept and persist gender
- NotificationService.processQueue() — resolve user gender before sending
- Admin Notificaciones page — template edit dialog needs male/female side-by-side fields
- Admin segment send — dual title/body fields for male/female copy
- notification_templates DB table — add female title/body columns

</code_context>

<specifics>
## Specific Ideas

- Registration options in Spanish: Femenino, Masculino, Otro, No especificar — in that order
- Name dictionary curated from actual member first names, not a generic dataset
- Backfill report should list unresolved names so admin can manually review edge cases
- Script must be runnable against local, staging, and production independently
- All current notification copy was just refreshed with brand voice (this session) — female variants should match the same tone

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 88-gender-based-notification-personalization_
_Context gathered: 2026-04-03_
