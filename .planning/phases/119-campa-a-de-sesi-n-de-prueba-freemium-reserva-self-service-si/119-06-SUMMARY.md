---
phase: 119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si
plan: 06
subsystem: admin Campañas section (control + observability for the reusable campaign system)
tags: [campaigns, admin-ui, funnel, quasar, vue3, chartjs]
requires:
  - Plan 04 admin endpoints (POST /api/campaigns/admin create, GET /admin list, POST /admin/:id/send, GET /admin/:id/funnel, GET /admin/eligible-count)
provides:
  - useCampaignsApi composable (listCampaigns / getCampaignFunnel / createCampaign / sendCampaign / getEligibleCount)
  - CampaignFunnel.vue (6-stage bar chart + Apple-Mail-Privacy approximate caveat)
  - CampaniasPage.vue standalone admin section at /campanias (list + create dialog + funnel + send confirmation)
  - admin route path 'campanias' + AdminLayout nav entry (owner/admin gated)
affects:
  - el-templo-admin/src/router/routes.ts
  - el-templo-admin/src/layouts/AdminLayout.vue
tech-stack:
  added: []
  patterns:
    - "Composable mirrors useAnalyticsApi (api + extractError + ref loading/error + cleanup())"
    - "Funnel component mirrors FunnelTab.vue chart.js pattern WITHOUT the comingSoon gate (live per-campaign data)"
    - "Page mirrors ReportesPage skeleton (header + country(owner)/branch filters + q-tabs/q-tab-panels)"
    - "Irreversible send gated behind a recipient-count confirmation dialog (D-11); exact send copy lives in a computed string so it stays on one source line (Prettier-stable + grep-gate-stable)"
key-files:
  created:
    - el-templo-admin/src/composables/useCampaignsApi.ts
    - el-templo-admin/src/types/campaign.ts
    - el-templo-admin/src/components/campaigns/CampaignFunnel.vue
    - el-templo-admin/src/pages/CampaniasPage.vue
  modified:
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/layouts/AdminLayout.vue
decisions:
  - "Added src/types/campaign.ts (not in plan files_modified) to keep no-any contract — mirrors the API campaigns/types.ts shapes (Rule 2 / CLAUDE.md no-any)."
  - "Campaign API paths are /campaigns/admin/* because the admin axios baseURL already includes /api (same convention as useAnalyticsApi's /admin/analytics)."
  - "Send button + send-confirmation gated to isOwner in the UI because the backend POST /admin/:id/send is owner-only (Plan 04); admins can still create/list/view funnel (D-12/D-18/D-19)."
  - "Funnel surfaced as a second tab (Campañas/Funnel) enabled on row-click — keeps the ReportesPage q-tabs/q-tab-panels pattern instead of inventing a master-detail layout."
  - "Branch filter kept for visual parity with ReportesPage but is informational; campaign audience is country-scoped server-side (Plan 04)."
metrics:
  duration: ~12min
  completed: 2026-06-02
---

# Phase 119 Plan 06: Admin Campañas Section Summary

Builds the dedicated admin **Campañas** control/observability section (D-19) on top of the Plan 04 endpoints: a `useCampaignsApi` composable, a 6-stage `CampaignFunnel.vue` chart with the Apple-Mail-Privacy approximate caveat (D-18), and a standalone `CampaniasPage.vue` at `/campanias` (NOT inside Analíticas/Reportes) with a "Nueva campaña" create dialog (D-12) and a recipient-count send confirmation gating the irreversible mass send (D-11). Route + owner/admin-gated nav entry wired. Follows the `ReportesPage.vue` / phase-117–118 admin pattern — no reinvention.

## What Was Built

### Task 1 — useCampaignsApi + CampaignFunnel (commit 812f9c82)

- `src/types/campaign.ts` (NEW): mirrors the API `campaigns/types.ts` — `CampaignRecord`, `CampaignListItem`, `CampaignFunnel` (6 stages + `aperturaAproximada`), `CreateCampaignInput`/`CampaignCopySlots`, `SendResult`, `EligibleCount`, `CampaignCountry`/`CampaignStatus`.
- `src/composables/useCampaignsApi.ts` (NEW): mirrors `useAnalyticsApi.ts` (api + `extractError` + `ref` loading/error + `cleanup()`). Methods: `listCampaigns(country?)` → `GET /campaigns/admin`; `getCampaignFunnel(id)` → `GET /campaigns/admin/:id/funnel`; `createCampaign(payload)` → `POST /campaigns/admin`; `sendCampaign(id)` → `POST /campaigns/admin/:id/send`; `getEligibleCount(country?)` → `GET /campaigns/admin/eligible-count` (returns `.count`).
- `src/components/campaigns/CampaignFunnel.vue` (NEW): props-driven (`data`/`loading`) skeleton/empty + chart.js horizontal `Bar`, 6 stages **enviado → abierto → click → reservó → asistió → convirtió**, first + convirtió bars in `COLORS.primary` (terracotta), the rest in `COLORS.secondary`. Orange `q-banner bg-orange-2 text-orange-10` caveat banner with the exact UI-SPEC copy ("Aproximado — Apple Mail Privacy puede inflar las aperturas. El click es la métrica confiable."), plus a per-stage detail grid with an "abierto" approximate tooltip. NO comingSoon gate. WARM palette, no blue.

### Task 2 — CampaniasPage + route + nav + create dialog + send confirmation (commit 2d718bcc)

- `src/pages/CampaniasPage.vue` (NEW): ReportesPage skeleton — header `text-h5` "Campañas" + caption "Envíos masivos y seguimiento de conversión"; country (owner-only) + branch filters; `q-tabs` (active/indicator `primary`) **Campañas** (list) + **Funnel** (enabled on row-click). The list `q-table` shows name, status badge (draft grey / sending warning / sent positive), sent date, recipient count; row-click and a `trending_up` action open the funnel; a `send` action (owner-only, drafts only) opens the send dialog.
  - **Nueva campaña** primary `q-btn` → `q-dialog` form (name, subject, optional country [owner], optional heroImageUrl, copySlots = headline/subheadline/body) → `createCampaign(payload)` → notify + refresh (new draft appears) (D-12).
  - **Enviar campaña** → confirmation `q-dialog` that calls `getEligibleCount`, shows the exact UI-SPEC body via a computed `sendConfirmMessage` ("Vas a enviar este email a {N} personas. Esta acción no se puede deshacer. ¿Continuar?") and a "Enviar a {N}" confirm before `sendCampaign(id)` (D-11, irreversible).
- `src/router/routes.ts`: added `{ path: 'campanias', component: () => import('pages/CampaniasPage.vue'), meta: { allowedRoles: ['admin','owner'] } }` right after `reportes`.
- `src/layouts/AdminLayout.vue`: added `<q-item v-if="isAdminRole" ... to="/campanias">` with `<q-icon name="campaign" />` + label "Campañas" right after the Reportes q-item, reusing the existing `isAdminRole` computed (owner/admin = who can send) — no new role computed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Added `src/types/campaign.ts`**

- **Found during:** Task 1
- **Issue:** The composable and components need typed request/response shapes; the plan's `files_modified` did not list a types file, but CLAUDE.md forbids `any`.
- **Fix:** Created `src/types/campaign.ts` mirroring the API `campaigns/types.ts` shapes (`CampaignRecord`/`CampaignListItem`/`CampaignFunnel`/`CreateCampaignInput`/`SendResult`/`EligibleCount`).
- **Files modified:** `src/types/campaign.ts`
- **Commit:** 812f9c82

**2. [Rule 1 - Bug] Send-confirmation copy moved to a computed string**

- **Found during:** Task 2 verification
- **Issue:** Prettier wrapped the inline template "no se puede deshacer" across two source lines, breaking the literal grep gate even though the rendered text was correct.
- **Fix:** Rendered the body via a computed `sendConfirmMessage` so the exact UI-SPEC copy lives on one source line (Prettier-stable, grep-stable, identical visible text).
- **Files modified:** `src/pages/CampaniasPage.vue`
- **Commit:** 2d718bcc

### Notes

- `npx vue-tsc --noEmit` over the whole admin app reports **pre-existing** errors in unrelated files (axios refresh test, ProgramWizardDialog, TrialSessionsReport, HorariosPage, session-pdf-builder, etc.). These are out of scope (Scope Boundary — not caused by this plan). Filtered typecheck (`grep -iE "campaign|campanias|CampaniasPage|AdminLayout|routes.ts"`) returns **zero** errors in any file this plan created/modified.
- Per the project rule, the full test suite was **not** run locally; typecheck-only local. Admin app has no tests in scope here.

## Known Stubs

None. The page consumes live Plan 04 endpoints (create/list/send/funnel/eligible-count). The funnel renders live per-campaign data with no comingSoon gate; empty/zero data renders the natural empty/zero state.

## Threat Flags

None — no new security surface beyond the plan's `<threat_model>`. UI gating (route `allowedRoles` + `isAdminRole` nav + owner-only send button) is convenience; the backend re-checks role/country on every `/admin` endpoint (Plan 04, T-119-06-01/04). The send remains gated behind the recipient-count confirmation (T-119-06-01) and the "abierto" caveat is present (T-119-06-02).

## Verification

- Task 1 grep gates: `getCampaignFunnel` + `createCampaign` + `sendCampaign` in `useCampaignsApi.ts`; "Apple Mail" in `CampaignFunnel.vue`. No blue/navy in any new file.
- Task 2 grep gates: `campanias` in `routes.ts` + `AdminLayout.vue`; `useCampaignsApi` + `createCampaign` + `no se puede deshacer` in `CampaniasPage.vue`. No blue.
- `npx vue-tsc --noEmit` — zero errors in any campaign/campanias/AdminLayout/routes file (pre-existing unrelated errors out of scope).

## Checkpoint Status

Task 3 is a `checkpoint:human-verify` with `gate="blocking"`. This plan is non-autonomous — the executor STOPPED at the checkpoint and did NOT self-approve. The admin section must be human-verified (nav visibility, standalone /campanias, create draft, list badges, funnel + caveat, send confirmation gate, warm brand) before the phase advances. See the checkpoint message returned to the orchestrator.

## Self-Check: PASSED

All 4 created files + 2 modified files exist on disk; both task commits (812f9c82, 2d718bcc) are present in git history.
