---
phase: 34-franquicias-page
verified: 2026-03-01T18:00:00Z
status: gaps_found
score: 10/11 must-haves verified
re_verification: false
gaps:
  - truth: "FRAN-08: Form submission triggers email notification, CRM/Mailchimp integration, GA4 event, and Meta Pixel Lead event"
    status: partial
    reason: "Email notification via Resend is implemented and working. CRM/Mailchimp integration, GA4 event, and Meta Pixel Lead event are NOT implemented in Phase 34. The ROADMAP explicitly defers GA4 and Meta Pixel to Phase 36 (Success Criterion 8: 'wired in Phase 36'). The REQUIREMENTS.md Out of Scope section also notes 'Server-side form processing (CRM integration) — Depends on CRM choice; v3.0 can use email-only or mock endpoints'."
    artifacts:
      - path: "el-templo-web/components/FranForm.vue"
        issue: "No GA4 event or Meta Pixel Lead event fired on form submission. No CRM/Mailchimp integration."
      - path: "el-templo-api/src/modules/franchise/service.ts"
        issue: "No CRM/Mailchimp webhook or API call."
    missing:
      - "GA4 event on form submit (deferred to Phase 36 per ROADMAP)"
      - "Meta Pixel Lead event on form submit (deferred to Phase 36 per ROADMAP)"
      - "CRM/Mailchimp integration (explicitly out of scope per REQUIREMENTS.md)"
    note: "This gap is pre-acknowledged in the ROADMAP (Phase 34 Success Criterion 8 says 'wired in Phase 36'). The requirement was partially satisfied by the email notification. Recommend updating FRAN-08 status in REQUIREMENTS.md to reflect that email is done and analytics/CRM remain for Phase 36. No remediation needed in Phase 34."
human_verification:
  - test: "Visual layout and section flow on /franquicias"
    expected: "All 8 sections render in correct order (Hero, ValueProps, Models, Includes, Expansion, Founder, Video hidden, Form), each with correct background color per spec"
    why_human: "Cannot verify visual rendering, background color correctness, or section ordering without browser"
  - test: "Animated counters in FranExpansion trigger on scroll"
    expected: "Stats (7, 1, 30000, 1) count up from 0 when the expansion section scrolls into view"
    why_human: "Cannot verify rAF animation or IntersectionObserver behavior programmatically"
  - test: "Franchise model accent borders"
    expected: "Activa card has a 3px Terracotta left border; Pasiva card has a 3px Aged Gold left border"
    why_human: "Cannot verify rendered CSS custom property colors"
  - test: "QUIERO APLICAR CTA smooth scroll"
    expected: "Clicking 'Quiero aplicar' in FranHero and FranModels scrolls smoothly to #formulario-franquicia"
    why_human: "Cannot verify anchor scroll behavior in SSG"
  - test: "Form inline validation"
    expected: "Submitting empty form shows per-field error messages; blurring an invalid email shows 'email valido' error"
    why_human: "Requires browser interaction to trigger validation events"
  - test: "Timeline responsive layout"
    expected: "On desktop, timeline is horizontal with connecting line; on mobile (<480px), timeline is vertical with left-side line"
    why_human: "Requires browser resize to verify breakpoint behavior"
  - test: "Floating WhatsApp button"
    expected: "WhatsApp green circular button fixed at bottom-right, visible as user scrolls, scales in on mount"
    why_human: "Cannot verify fixed positioning or entrance animation without browser"
  - test: "SVG map renders Argentina and Spain pins"
    expected: "Terracotta pins at Mar del Plata and Barcelona; dashed Aged Gold circle with '?Tu ciudad?' callout"
    why_human: "Cannot verify SVG rendering or color"
---

# Phase 34: Franquicias Page Verification Report

**Phase Goal:** A prospective franchise investor can land on /franquicias, understand the investment opportunity, compare franchise models, see the expansion trajectory, and submit an application — the primary franchise acquisition funnel
**Verified:** 2026-03-01T18:00:00Z
**Status:** gaps_found (1 partial gap — pre-acknowledged in ROADMAP as deferred to Phase 36)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                         | Status   | Evidence                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------- |
| 1   | /franquicias renders full-viewport hero with H1 "ABRI TU TEMPLO.", investment figure, and CTA | VERIFIED | FranHero.vue: 100vh/100svh, H1 with correct text, `franquiciasConfig.investmentFigure`, CTA to `#formulario-franquicia`                              |
| 2   | 4 value prop cards display in 2x2 grid desktop, 1-col mobile with staggered entrance          | VERIFIED | FranValueProps.vue: `grid-template-columns: repeat(2, 1fr)`, 1fr at 480px breakpoint, useScrollReveal with index\*100ms delay                        |
| 3   | Activa vs Pasiva comparison shows distinct accent borders (Terracotta/Aged Gold)              | VERIFIED | FranModels.vue: `.fran-models__card--terracotta { border-left-color: var(--color-terracotta) }` and `--aged-gold` variant                            |
| 4   | 6-item "Que Incluye" grid renders 3x2 desktop, 2x3 tablet, 1-col mobile                       | VERIFIED | FranIncludes.vue: 3-column desktop grid from data file's 6 items, staggered entrance                                                                 |
| 5   | Expansion section shows animated counters, SVG map with Argentina+Spain pins, sede list       | VERIFIED | FranExpansion.vue: useCountUp triggered by useScrollReveal, inline SVG with Terracotta pins + Aged Gold future callout, expansionCities rendered     |
| 6   | Founder section displays bio with horizontal timeline (desktop) / vertical timeline (mobile)  | VERIFIED | FranFounder.vue: `grid-template-columns: 55% 1fr` desktop, `grid-template-columns: 1fr` at 480px; timeline `flex-direction: column` on mobile        |
| 7   | Video/PDF section does NOT render when both config values are null                            | VERIFIED | FranVideo.vue: `v-if="hasContent"` where `hasContent = videoUrl !== null                                                                             |     | pdfUrl !== null`; both are null in config |
| 8   | Application form collects all 9 fields with inline validation and submits to API              | VERIFIED | FranForm.vue: 9 fields defined, validateField() on blur, `$fetch` to `/api/franchise/apply`, error/loading/confirmation states                       |
| 9   | Post-submit confirmation shows WhatsApp link                                                  | VERIFIED | FranForm.vue: `v-if="submitted"` block with `franquiciasConfig.whatsappUrl`                                                                          |
| 10  | Floating WhatsApp button is always visible on /franquicias                                    | VERIFIED | FranWhatsApp.vue: `position: fixed; bottom: 24px; right: 24px; z-index: 100;` wired in franquicias.vue                                               |
| 11  | Form submission triggers email notification, GA4 event, and Meta Pixel Lead                   | PARTIAL  | Email via Resend implemented. GA4 and Meta Pixel NOT implemented (deferred to Phase 36 per ROADMAP). CRM/Mailchimp out of scope per REQUIREMENTS.md. |

**Score:** 10/11 truths fully verified (1 partial — pre-acknowledged in ROADMAP)

---

## Required Artifacts

### Plan 34-01 (API Backend)

| Artifact                                                     | Expected                             | Status   | Details                                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/franchise-applications.ts`      | franchise_applications table schema  | VERIFIED | 11 columns: id, nombre, email, telefono, ciudadPais, modelo, experiencia, capital, origen, mensaje, createdAt, status — all present     |
| `el-templo-api/src/modules/franchise/routes.ts`              | POST /apply endpoint                 | VERIFIED | Exports `franchiseRoutes`, JSON Schema validation with enum constraints on modelo/experiencia/capital/origen                            |
| `el-templo-api/src/modules/franchise/service.ts`             | FranchiseService with submit + email | VERIFIED | Class with `submitApplication()`, Drizzle insert, Resend email, graceful skip if no API key                                             |
| `el-templo-api/test/franchise/franchise-application.test.ts` | 12 integration tests                 | VERIFIED | 12 tests: happy path, DB persistence, validation errors (missing fields, bad email, long mensaje, invalid enums), duplicate submissions |

### Plan 34-02 (Top Sections)

| Artifact                                      | Expected                     | Status   | Details                                                                                                                                             |
| --------------------------------------------- | ---------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-web/data/franquicias.ts`           | All franchise page data      | VERIFIED | Exports: valueProps, franchiseModels, includesItems, expansionStats, expansionCities, founderTimeline, franquiciasConfig, formSelects — all present |
| `el-templo-web/composables/useCountUp.ts`     | Reusable count-up composable | VERIFIED | easeOutCubic rAF loop, idempotent trigger(), cleanup(), reduced-motion guard, SSR guard                                                             |
| `el-templo-web/components/FranHero.vue`       | Full-viewport franchise hero | VERIFIED | 100vh/100svh, margin-top -64px, overlay gradient, staggered entrance, scroll indicator                                                              |
| `el-templo-web/components/FranValueProps.vue` | 4 value prop cards section   | VERIFIED | Imports valueProps from data file, 2x2 grid, staggered entrance                                                                                     |
| `el-templo-web/components/FranModels.vue`     | Activa/Pasiva comparison     | VERIFIED | Imports franchiseModels, Terracotta/Aged Gold borders, hover elevation, repeated CTA                                                                |
| `el-templo-web/components/FranIncludes.vue`   | 6-item "Que Incluye" grid    | VERIFIED | Imports includesItems, 3-column grid, staggered entrance                                                                                            |

### Plan 34-03 (Bottom Sections)

| Artifact                                     | Expected                             | Status   | Details                                                                                                              |
| -------------------------------------------- | ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `el-templo-web/components/FranExpansion.vue` | Expansion map + counters + sede list | VERIFIED | Imports expansionStats + useCountUp, inline SVG with Argentina/Spain, sede list from expansionCities, closing phrase |
| `el-templo-web/components/FranFounder.vue`   | Founder bio + responsive timeline    | VERIFIED | Imports founderTimeline, 55/45 split layout, horizontal/vertical timeline with progressive line draw                 |
| `el-templo-web/components/FranVideo.vue`     | Conditional video/PDF section        | VERIFIED | Imports franquiciasConfig, computed hasContent check, v-if hides section when both null                              |

### Plan 34-04 (Form + Composition)

| Artifact                                    | Expected                         | Status   | Details                                                                                                                    |
| ------------------------------------------- | -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-web/components/FranForm.vue`     | 9-field form with API submission | VERIFIED | All 9 fields present, validateField/validateAll, $fetch to /api/franchise/apply, loading/confirmation/error states         |
| `el-templo-web/components/FranWhatsApp.vue` | Floating WhatsApp button         | VERIFIED | Fixed bottom-right, #25D366 bg, correct SVG icon, aria-label, scale entrance animation                                     |
| `el-templo-web/pages/franquicias.vue`       | Full page composition            | VERIFIED | All 8 Fran\* components + FranWhatsApp in correct order, useHead with SEO meta tags, /franquicias route not in ignore list |

---

## Key Link Verification

| From                       | To                                    | Via                                          | Status | Details                                                                                               |
| -------------------------- | ------------------------------------- | -------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/app.ts` | `franchise/routes.ts`                 | `app.register(franchiseRoutes)`              | WIRED  | Line 14: import + line 69: register with prefix `/api/franchise`                                      |
| `franchise/routes.ts`      | `franchise/service.ts`                | `FranchiseService.submitApplication()`       | WIRED  | `new FranchiseService(fastify.db, fastify.log)` + `.submitApplication(request.body)`                  |
| `franchise/service.ts`     | `db/schema/franchise-applications.ts` | drizzle insert                               | WIRED  | `this.db.insert(franchiseApplications).values(...)`                                                   |
| `FranValueProps.vue`       | `data/franquicias.ts`                 | `import { valueProps }`                      | WIRED  | Line 10, used in v-for                                                                                |
| `FranModels.vue`           | `data/franquicias.ts`                 | `import { franchiseModels }`                 | WIRED  | Line 10, used in v-for                                                                                |
| `FranIncludes.vue`         | `data/franquicias.ts`                 | `import { includesItems }`                   | WIRED  | Line 10, used in v-for                                                                                |
| `FranExpansion.vue`        | `data/franquicias.ts`                 | `import { expansionStats, expansionCities }` | WIRED  | Line 13, both used in template                                                                        |
| `FranExpansion.vue`        | `composables/useCountUp.ts`           | `import { useCountUp }`                      | WIRED  | Line 14, `watch(statsRevealed, () => triggerCountUp())`                                               |
| `FranFounder.vue`          | `data/franquicias.ts`                 | `import { founderTimeline }`                 | WIRED  | Line 12, used in v-for                                                                                |
| `FranVideo.vue`            | `data/franquicias.ts`                 | `import { franquiciasConfig }`               | WIRED  | Line 14, drives `hasContent` computed + v-if                                                          |
| `FranForm.vue`             | `data/franquicias.ts`                 | `import { formSelects, franquiciasConfig }`  | WIRED  | Line 12, formSelects drive all 4 select options; franquiciasConfig.whatsappUrl used in confirmation   |
| `FranForm.vue`             | `POST /api/franchise/apply`           | `$fetch(baseUrl + '/api/franchise/apply')`   | WIRED  | Line 110, correct payload with all 9 fields                                                           |
| `pages/franquicias.vue`    | `Fran*.vue` components                | component composition                        | WIRED  | All 8 Fran\* sections + FranWhatsApp present in template                                              |
| `pages/franquicias.vue`    | default layout                        | Nuxt default layout (no override)            | WIRED  | No `definePageMeta` layout override; `layouts/default.vue` provides AppNav + AppPrefooter + AppFooter |

---

## Requirements Coverage

| Requirement | Source Plan  | Description                                                         | Status    | Evidence                                                                                                                                                                                 |
| ----------- | ------------ | ------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FRAN-01     | 34-02        | Full-viewport hero with image bg, H1, investment figure, CTA        | SATISFIED | FranHero.vue: 100vh/100svh, H1 "ABRI TU TEMPLO.", investment from config, href="#formulario-franquicia"                                                                                  |
| FRAN-02     | 34-02        | 4 value prop cards (2x2): Metodo, Marca, Ecosistema, Acompanamiento | SATISFIED | FranValueProps.vue: 4 cards from valueProps data, 2x2 grid on desktop                                                                                                                    |
| FRAN-03     | 34-02        | Activa vs Pasiva comparison cards                                   | SATISFIED | FranModels.vue: 2 cards with Terracotta/Aged Gold accent borders                                                                                                                         |
| FRAN-04     | 34-02        | 6-item "Que Incluye" grid (3x2 -> 2x3 -> 1-col)                     | SATISFIED | FranIncludes.vue: 6 items from includesItems, 3-col grid                                                                                                                                 |
| FRAN-05     | 34-03        | Expansion: animated counters + styled map with pins + sede list     | SATISFIED | FranExpansion.vue: useCountUp + SVG map + expansionCities table                                                                                                                          |
| FRAN-06     | 34-03        | Founder bio + timeline (horizontal desktop, vertical mobile)        | SATISFIED | FranFounder.vue: 55/45 split, founderTimeline v-for, flex/column at 480px                                                                                                                |
| FRAN-07     | 34-01, 34-04 | Application form: 9 fields with selects                             | SATISFIED | FranForm.vue: all 9 fields; API routes.ts: JSON Schema for all 9 fields                                                                                                                  |
| FRAN-08     | 34-01        | Form submission -> email notification + CRM + GA4 + Meta Pixel      | PARTIAL   | Email notification via Resend: DONE. GA4 event, Meta Pixel Lead, CRM/Mailchimp: NOT DONE. ROADMAP explicitly defers GA4/Meta Pixel to Phase 36. CRM is out of scope per REQUIREMENTS.md. |
| FRAN-09     | 34-01, 34-04 | Post-submit confirmation + WhatsApp link                            | SATISFIED | FranForm.vue: `v-if="submitted"` confirmation block with whatsappUrl from config                                                                                                         |
| FRAN-10     | 34-04        | Floating WhatsApp button (always visible)                           | SATISFIED | FranWhatsApp.vue: fixed bottom-right z-index 100, on /franquicias page                                                                                                                   |
| FRAN-11     | 34-04        | Shares header/footer with main domain                               | SATISFIED | franquicias.vue uses default layout (no override) which provides AppNav + AppPrefooter + AppFooter                                                                                       |

---

## Anti-Patterns Found

| File                                                          | Line    | Pattern                                 | Severity | Impact                                                                   |
| ------------------------------------------------------------- | ------- | --------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `el-templo-web/components/FranHero.vue`                       | 98      | `PlaceholderBox label=""`               | Info     | Hero background is a placeholder image — intentional, pending real asset |
| `el-templo-web/components/FranFounder.vue`                    | 74      | `PlaceholderBox label="Ignacio Bordon"` | Info     | Founder photo is placeholder — intentional, pending real asset           |
| `el-templo-web/components/FranValue*.vue`, `FranIncludes.vue` | various | PlaceholderBox for icons                | Info     | Icons all use PlaceholderBox — intentional, pending real SVG icons       |

No blockers or warnings found. All placeholder usage is intentional and pre-approved in the plan (pending real assets).

No `console.log` calls found. No `TODO/FIXME` comments. No stub implementations. No `return null` or empty handlers.

---

## Human Verification Required

### 1. Full Page Visual Review

**Test:** Run `cd el-templo-web && pnpm dev`, visit `http://localhost:9200/franquicias`, and scroll through all sections.
**Expected:** 8 sections in correct order — Hero (full viewport dark overlay), ValueProps (Marble Cream), Models (Warm Stone), Includes (Marble Cream), Expansion (Deep Charcoal), Founder (Warm Linen), Form (Sandy Beige). No video section appears. Header and footer from default layout are present.
**Why human:** Cannot verify visual rendering, background colors, or section alternation without a browser.

### 2. Animated Counters (FranExpansion)

**Test:** Scroll down to the expansion section.
**Expected:** The 4 stats (7, 1, 30.000, 1) count up from 0 with easeOutCubic animation when the section enters the viewport.
**Why human:** rAF animation and IntersectionObserver behavior cannot be tested programmatically.

### 3. Accent Borders on Franchise Model Cards

**Test:** View the "DOS CAMINOS. UNA MISMA VISION." section.
**Expected:** Activa card has a 3px Terracotta left border; Pasiva card has a 3px Aged Gold left border.
**Why human:** CSS custom property resolved colors require browser rendering.

### 4. CTA Smooth Scroll

**Test:** Click "Quiero aplicar" in the hero and in the models section.
**Expected:** Page smooth-scrolls to the `#formulario-franquicia` anchor (the application form section).
**Why human:** Anchor scroll behavior requires browser.

### 5. Form Inline Validation

**Test:** Click submit without filling any fields. Then fill a bad email (e.g., "test") and blur.
**Expected:** Per-field error messages appear below each empty required field. Email error shows "Ingresa un email valido".
**Why human:** Requires triggering blur/submit events in a browser.

### 6. Timeline Responsive Layout

**Test:** View `/franquicias` on desktop, then resize to mobile (<480px width).
**Expected:** Desktop: horizontal timeline with connecting line running left to right. Mobile: vertical timeline with connecting line running top to bottom.
**Why human:** Requires browser resize to verify breakpoint behavior.

### 7. Floating WhatsApp Button

**Test:** Scroll through the entire /franquicias page.
**Expected:** Green circular WhatsApp button stays fixed at bottom-right corner throughout scrolling; scales in on load; scales slightly on hover.
**Why human:** Fixed positioning and entrance animation require browser.

---

## FRAN-08 Gap Analysis

FRAN-08 is partially satisfied. The gap breakdown:

| Sub-requirement               | Status   | Notes                                                                                          |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| Email notification to founder | DONE     | Resend integration in FranchiseService; graceful skip if no API key                            |
| CRM/Mailchimp integration     | NOT DONE | Explicitly out of scope per REQUIREMENTS.md ("Depends on CRM choice; v3.0 can use email-only") |
| GA4 event on form submit      | NOT DONE | Deferred to Phase 36 per ROADMAP Success Criterion 8                                           |
| Meta Pixel Lead event         | NOT DONE | Deferred to Phase 36 per ROADMAP Success Criterion 8                                           |

The ROADMAP is self-consistent: Phase 34 Success Criterion 8 explicitly says "Form submission fires a GA4 event and Meta Pixel Lead event **(wired in Phase 36)**." The plan claiming FRAN-08 as complete was overreaching — email notification is the Phase 34 contribution. GA4 and Meta Pixel belong to Phase 36 (TRACK-02, TRACK-03).

**Recommended action:** Update REQUIREMENTS.md to mark FRAN-08 as partial/split — email portion complete in Phase 34, analytics portion deferred to Phase 36 (alongside TRACK-02/TRACK-03). No code changes needed in Phase 34.

---

## Commits Verified

All documented commits exist in git history:

| Plan         | Commit    | Status   |
| ------------ | --------- | -------- |
| 34-01 Task 1 | `6006a61` | Verified |
| 34-01 Task 2 | `05b9ae0` | Verified |
| 34-02 Task 1 | `d6f6a89` | Verified |
| 34-02 Task 2 | `0551f78` | Verified |
| 34-03 Task 1 | `ad82a3d` | Verified |
| 34-03 Task 2 | `f8d3b29` | Verified |
| 34-04 Task 1 | `44a48d8` | Verified |
| 34-04 Task 2 | `f225103` | Verified |
| 34-04 Task 3 | `ce4d527` | Verified |

---

_Verified: 2026-03-01T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
