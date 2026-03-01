---
phase: 33-locations-community-ecosystem-faq
verified: 2026-03-01T17:30:00Z
status: human_needed
score: 21/21 must-haves verified
human_verification:
  - test: "Scroll through the full home page and verify background alternation"
    expected: "Conversion (Warm Stone) -> Locations (Marble Cream) -> Community Zone A (Warm Stone) -> Community Zone B / Aura (Marble Cream) -> Ecosystem (Warm Stone) -> FAQ (Marble Cream) — no two adjacent sections share the same background"
    why_human: "Section backgrounds are defined in each component's scoped CSS; cannot verify visual rendering programmatically"
  - test: "Click a gallery photo in SectionCommunity"
    expected: "Fullscreen lightbox overlay appears with a PlaceholderBox at large size and a close button in the top-right; pressing Escape or clicking the dark overlay closes it; background scrolling is locked while open"
    why_human: "Lightbox uses a Teleport to body and relies on DOM event behavior that requires a running browser"
  - test: "Scroll stats counters into view (4 numbers below the testimonials)"
    expected: "Numbers animate from 0 to their final values over ~1500ms with an ease-out feel; reduced-motion users see final values immediately"
    why_human: "requestAnimationFrame count-up animation and IntersectionObserver trigger require a running browser"
  - test: "Click FAQ questions to open and close accordion items"
    expected: "First item is open on page load; clicking another item closes the first and opens the clicked one; animation is smooth (max-height expand 400ms, opacity 300ms); icon rotates from + to x-like; only one item is open at a time"
    why_human: "CSS transition behavior and accordion toggle logic require a running browser to verify"
  - test: "Resize to mobile (<480px) and scroll through all 4 new sections"
    expected: "Sede cards (MDP) scroll horizontally with snap; gallery photos scroll horizontally with snap; testimonials scroll horizontally with snap; stats display in 2x2 grid; ecosystem cards stack to 1-column; AURA CLUB stacks with image on top"
    why_human: "Responsive layout requires a browser viewport resize to verify"
---

# Phase 33: Locations, Community, Ecosystem, FAQ — Verification Report

**Phase Goal:** Visitors can find their nearest sede, see the community in action through photos and testimonials, discover the broader El Templo ecosystem, and get answers to common questions — completing the full home page
**Verified:** 2026-03-01T17:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

All automated checks pass. Five items require human browser verification (visual/interactive behavior).

### Observable Truths

| #   | Truth                                                                                                             | Status   | Evidence                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 8 sede cards display with name, address, badge (if applicable), and two micro-CTAs (Como llegar, Reservar sesion) | VERIFIED | `data/sedes.ts` exports 8 typed entries; `SectionLocations.vue` renders all with `locations__actions` containing map + book links                                                                         |
| 2   | Sedes grouped by city with subtitle headers showing Mar del Plata (7) and Barcelona (1)                           | VERIFIED | `sedesByCity` helper splits 7 MDP + 1 BCN; template renders two `locations__group` divs with correct count labels                                                                                         |
| 3   | Desktop shows 4-col grid for MDP, tablet 3-col, mobile horizontal scroll with snap                                | VERIFIED | `grid-template-columns: repeat(4, 1fr)` + 768px media `repeat(3, 1fr)` + 480px media `display: flex; overflow-x: auto; scroll-snap-type: x mandatory`                                                     |
| 4   | Park badge AL AIRE LIBRE (Olive Stone), Chapadmalal RETIRO (Aged Gold), Barcelona INTERNACIONAL (Azul Noche)      | VERIFIED | `sedes.ts`: Park `variant: "outdoor"`, Chapadmalal `variant: "special"`, Barcelona `variant: "intl"`; CSS uses `--color-olive-stone`, `--color-aged-gold`, `--color-azul-noche` respectively              |
| 5   | International fallback CTA at bottom with Azul Noche button linking to /app                                       | VERIFIED | `locations__intl-cta` block present with `<a href="/app" class="btn btn--secondary-azul">`                                                                                                                |
| 6   | 4 ecosystem pathway cards in 2x2 grid with colored left-border accents                                            | VERIFIED | `data/ecosystem.ts` has 4 pathways; `ecosystem__grid` uses `grid-template-columns: 1fr 1fr`; each variant has 3px left-border via `--color-azul-noche`, `--color-terracotta`, `--color-aged-gold`         |
| 7   | Ecosystem cards link to /app, /academy, /franquicias, /gladius                                                    | VERIFIED | `ctaHref` values in `data/ecosystem.ts` confirm correct routes; `SectionEcosystem.vue` uses `<NuxtLink :to="pathway.ctaHref">`                                                                            |
| 8   | Ecosystem grid responsive 2x2 desktop/tablet to 1-column mobile                                                   | VERIFIED | Default `grid-template-columns: 1fr 1fr`; 480px media sets `grid-template-columns: 1fr`                                                                                                                   |
| 9   | Photo gallery displays 9 placeholder images in CSS Grid mosaic on desktop, horizontal scroll on mobile            | VERIFIED | `data/community.ts` exports 9 `GalleryPhoto` entries; `community__gallery` uses `grid-template-columns: repeat(5, 1fr); grid-auto-rows: 180px`; items 2 and 7 span 2 cols; mobile switches to flex scroll |
| 10  | 3 testimonial cards show quote, name placeholder, level, and time with decorative quote mark                      | VERIFIED | `testimonials` array has 3 entries; template renders `community__quote-mark`, `community__quote`, `community__author`, `community__meta`                                                                  |
| 11  | 4 stats counters animate count-up on scroll into viewport                                                         | VERIFIED | `communityStats` has 4 entries; `animateCountUp()` uses `requestAnimationFrame` with ease-out-cubic over 1500ms; triggered by `watch(statsRevealed)`                                                      |
| 12  | AURA CLUB sub-section displays split layout (45% image / 55% text) with Aged Gold ghost CTA                       | VERIFIED | `grid-template-columns: 45% 1fr`; CTA uses `--color-aged-gold` border + color; NuxtLink to /aura-club                                                                                                     |
| 13  | Clicking a gallery photo opens a fullscreen lightbox overlay with close button                                    | VERIFIED | `@click="openLightbox(index)"` on each gallery item; `<Teleport to="body">` renders overlay when `lightboxPhoto` is non-null; close button + `handleOverlayClick` + Escape key handler                    |
| 14  | Zone A has Warm Stone background, Zone B (Aura Club) has Marble Cream background                                  | VERIFIED | `.community__main` uses `var(--color-warm-stone)`; `.community__aura` uses `var(--color-marble-cream)`                                                                                                    |
| 15  | FAQ accordion displays 9 Q&A pairs with first open by default and only 1 open at a time                           | VERIFIED | `faqItems` has 9 entries; `openIndex = ref(0)` initializes first open; `toggle()` sets `openIndex` to clicked index or -1                                                                                 |
| 16  | Smooth expand/collapse animation (max-height 400ms, opacity 300ms)                                                | VERIFIED | `.faq__answer { transition: max-height 400ms ease, opacity 300ms ease }`; `.faq__item--active .faq__answer { max-height: 500px; opacity: 1 }`                                                             |
| 17  | Icon rotates between + and minus on toggle (300ms)                                                                | VERIFIED | `.faq__icon { transition: transform 300ms ease }`; `.faq__item--active .faq__icon { transform: rotate(45deg) }`                                                                                           |
| 18  | ARIA attributes present on buttons (aria-expanded) and answers (role=region)                                      | VERIFIED | `:aria-expanded="openIndex === index ? 'true' : 'false'"` on button; `role="region"` on `.faq__answer` div                                                                                                |
| 19  | Centered layout with 800px max-width                                                                              | VERIFIED | `.faq__container { max-width: 800px; margin: 0 auto }`                                                                                                                                                    |
| 20  | All 4 new sections appear in index.vue in order Locations, Community, Ecosystem, FAQ                              | VERIFIED | `index.vue` lines 17-20: `<SectionLocations />`, `<SectionCommunity />`, `<SectionEcosystem />`, `<SectionFaq />` in correct order                                                                        |
| 21  | Sedes stub in index.vue is replaced with actual SectionLocations component                                        | VERIFIED | `index.vue` contains no stub comment or placeholder `<section id="sedes">` — only `<SectionLocations />`                                                                                                  |

**Score:** 21/21 truths verified (automated)

### Required Artifacts

| Artifact                                        | Expected                                          | Status   | Details                                                                                       |
| ----------------------------------------------- | ------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `el-templo-web/data/sedes.ts`                   | 8 typed sedes with city grouping helper           | VERIFIED | Exports `Sede` interface, `sedes` array (8 entries), `sedesByCity` helper; all fields present |
| `el-templo-web/components/SectionLocations.vue` | Sede card grid with badges, CTAs, responsive      | VERIFIED | 524 lines; BEM, tokens, scroll reveal, PlaceholderBox, both groups rendered                   |
| `el-templo-web/data/ecosystem.ts`               | 4 typed pathway entries                           | VERIFIED | Exports `EcosystemPathway` interface and 4-entry `pathways` array with correct hrefs          |
| `el-templo-web/components/SectionEcosystem.vue` | 2x2 grid with left-border accents and ghost CTAs  | VERIFIED | 366 lines; all variant border/color rules present; NuxtLink CTAs; responsive                  |
| `el-templo-web/data/community.ts`               | 3 testimonials, 4 stats, 9 gallery photos         | VERIFIED | All three typed arrays exported with correct counts and values                                |
| `el-templo-web/components/SectionCommunity.vue` | Gallery, testimonials, stats, Aura Club, lightbox | VERIFIED | 858 lines; two-zone layout; count-up animation; Teleport lightbox; full responsive            |
| `el-templo-web/data/faq.ts`                     | 9 typed Q&A pairs                                 | VERIFIED | `FaqItem` interface + 9 entries; "clase" not used anywhere, always "sesion"                   |
| `el-templo-web/components/SectionFaq.vue`       | Accordion with ARIA and CSS animation             | VERIFIED | 205 lines; accordion logic correct; ARIA present; max-height/opacity transitions              |
| `el-templo-web/pages/index.vue`                 | 10 sections in order, stub removed                | VERIFIED | 22 lines; all 10 sections present in correct sequence; no stub                                |

### Key Link Verification

| From                   | To                  | Via                                                      | Status   | Details                                                                                  |
| ---------------------- | ------------------- | -------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `SectionLocations.vue` | `data/sedes.ts`     | `import { sedesByCity }`                                 | VERIFIED | Line 12: `import { sedesByCity } from "~/data/sedes"`                                    |
| `SectionEcosystem.vue` | `data/ecosystem.ts` | `import { pathways }`                                    | VERIFIED | Line 14: `import { pathways } from "~/data/ecosystem"`                                   |
| `SectionCommunity.vue` | `data/community.ts` | `import { testimonials, communityStats, galleryPhotos }` | VERIFIED | Line 13: all three arrays imported and used in template                                  |
| `SectionFaq.vue`       | `data/faq.ts`       | `import { faqItems }`                                    | VERIFIED | Line 11: `import { faqItems } from "~/data/faq"`                                         |
| `SectionLocations.vue` | `useScrollReveal`   | Nuxt auto-import                                         | VERIFIED | `useScrollReveal()` called in `<script setup>`; `cleanup()` called in `onBeforeUnmount`  |
| `SectionEcosystem.vue` | `useScrollReveal`   | Nuxt auto-import                                         | VERIFIED | `useScrollReveal()` called; grid ref bound; stagger via `transitionDelay`                |
| `SectionCommunity.vue` | `useScrollReveal`   | 4 separate instances                                     | VERIFIED | Gallery, testimonials, stats (threshold 0.5), aura — all cleaned up in `onBeforeUnmount` |
| `SectionFaq.vue`       | `data/faq.ts`       | `faqItems` rendered in v-for                             | VERIFIED | `v-for="(item, index) in faqItems"` renders all 9 items                                  |
| `index.vue`            | All 4 sections      | Nuxt component auto-import                               | VERIFIED | No explicit import statements needed; all 4 tags present in template                     |
| Stats count-up         | `statsRevealed`     | `watch(statsRevealed, ...)`                              | VERIFIED | `watch(statsRevealed, (revealed) => { if (revealed) animateCountUp(); })`                |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                              | Status    | Evidence                                                                                                                                  |
| ----------- | ----------- | -------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| SED-01      | 33-01       | 8 location cards grouped by city (7 MDP, 1 BCN) with real photos                                         | SATISFIED | 8 cards in `sedes.ts`; city grouping via `sedesByCity`; PlaceholderBox for photos (real photos deferred by design decision in CONTEXT.md) |
| SED-02      | 33-01       | Per-card micro-CTAs: "Como llegar" (Maps, new tab) + "Reservar sesion" (WhatsApp)                        | SATISFIED | Both links rendered with `target="_blank" rel="noopener"` for Maps; WhatsApp shared URL in data file                                      |
| SED-03      | 33-01       | Special badges: "AL AIRE LIBRE" (Park), "INTERNACIONAL" (Barcelona) — plan adds "RETIRO" (Chapadmalal)   | SATISFIED | All three badges implemented and correctly styled; CONTEXT.md decision added Chapadmalal RETIRO badge                                     |
| SED-04      | 33-01       | Desktop 4-col grid (row 2 has 3 centered); Tablet 3-col; Mobile horizontal scroll with snap              | SATISFIED | CSS rules verified at all three breakpoints                                                                                               |
| SED-05      | 33-01       | Fallback CTA for international/remote users: "Proba la app"                                              | SATISFIED | `locations__intl-cta` block with Azul Noche button at bottom of section                                                                   |
| COM-01      | 33-02       | Zone A — Photo gallery: 6-12 photos in mosaic grid, horizontal scroll mobile                             | SATISFIED | 9 photos in 5-col CSS Grid mosaic; mobile flex scroll                                                                                     |
| COM-02      | 33-02       | Zone A — 3 testimonial cards (quote + name + level + time), horizontal scroll mobile                     | SATISFIED | 3 testimonials rendered; mobile horizontal scroll with snap                                                                               |
| COM-03      | 33-02       | Zone A — 4 community stats counters with optional count-up animation                                     | SATISFIED | Count-up implemented via `requestAnimationFrame`; not optional — it runs automatically                                                    |
| COM-04      | 33-02       | Zone B — AURA CLUB section with event photo + ghost CTA (Aged Gold)                                      | SATISFIED | Split layout 45%/55%; PlaceholderBox for photo; Aged Gold ghost CTA with arrow animation                                                  |
| COM-05      | 33-02       | Optional gallery lightbox on click                                                                       | SATISFIED | Lightbox implemented with Teleport, Escape key, click-outside, body overflow lock                                                         |
| ECO-01      | 33-01       | 4 pathway cards in 2x2 grid: Entrena (App), Formate (Academy), Inverti (Franquicias), Equipate (Gladius) | SATISFIED | All 4 variants in 2x2 grid                                                                                                                |
| ECO-02      | 33-01       | Each card has colored left border accent (3px): Azul Noche, Terracotta, Aged Gold, Aged Gold             | SATISFIED | CSS rules per variant verified                                                                                                            |
| ECO-03      | 33-01       | Cards link to respective landing pages (/app, /academy, /franquicias, /gladius)                          | SATISFIED | NuxtLink hrefs confirmed                                                                                                                  |
| ECO-04      | 33-01       | Responsive: 2x2 -> 2x2 -> 1 column                                                                       | SATISFIED | 2x2 at desktop/tablet; 1-column at 480px breakpoint                                                                                       |
| FAQ-01      | 33-03       | Accordion with 9 Q&A pairs, first open by default, only 1 open at a time                                 | SATISFIED | `openIndex = ref(0)`; `toggle()` enforces single-open; 9 items in `faqItems`                                                              |
| FAQ-02      | 33-03       | Smooth expand/collapse animation (max-height 400ms, opacity 300ms)                                       | SATISFIED | CSS transition values verified                                                                                                            |
| FAQ-03      | 33-03       | Icon rotation (+ to −) on toggle, 300ms                                                                  | SATISFIED | `transition: transform 300ms ease`; `rotate(45deg)` on active                                                                             |
| FAQ-04      | 33-03       | ARIA attributes: aria-expanded on trigger, role="region" on answer                                       | SATISFIED | Both attributes verified in template                                                                                                      |
| FAQ-05      | 33-03       | Centered layout (800px max-width)                                                                        | SATISFIED | `.faq__container { max-width: 800px; margin: 0 auto }`                                                                                    |

**Coverage:** 19/19 requirements satisfied. No orphaned requirements detected.

### Anti-Patterns Found

| File                   | Line | Pattern                                                | Severity | Impact                                                                                                                      |
| ---------------------- | ---- | ------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `SectionEcosystem.vue` | 285  | `color: #3d4e62` (hardcoded Azul Noche hover darkened) | Warning  | DS-04 violation: no hardcoded colors. Should be a CSS token `--color-azul-noche-dark` or similar. Does not block rendering. |
| `SectionEcosystem.vue` | 303  | `color: #a08a50` (hardcoded Aged Gold hover darkened)  | Warning  | DS-04 violation: no hardcoded colors. Should be a CSS token `--color-aged-gold-dark` or similar. Does not block rendering.  |

Note: `SectionCommunity.vue` line 70 (`return null`) is intentional logic — the computed `lightboxPhoto` returns null when no lightbox is open, which is the correct guard pattern. Not a stub.

### Human Verification Required

#### 1. Background Alternation Visual Check

**Test:** Start dev server (`cd el-templo-web && pnpm dev`), open http://localhost:9200, scroll through the entire page from SectionConversion to SectionFaq.
**Expected:** Background alternates correctly — Conversion (Warm Stone), Locations (Marble Cream), Community Zone A (Warm Stone), Community Zone B/Aura (Marble Cream), Ecosystem (Warm Stone), FAQ (Marble Cream). No two adjacent sections share the same background.
**Why human:** Section backgrounds are defined in component-scoped CSS; visual rendering cannot be verified programmatically.

#### 2. Gallery Lightbox Interaction

**Test:** Click any photo in the community gallery section.
**Expected:** A fullscreen dark overlay appears showing the selected photo (as PlaceholderBox) at a large size. An X close button appears in the top-right. Pressing Escape closes the overlay. Clicking the dark background (outside the photo) closes it. While open, the page does not scroll.
**Why human:** Teleport, DOM events, and body overflow lock require a running browser.

#### 3. Stats Count-Up Animation

**Test:** Scroll the page until the four numbers (+1000, 8, +10000, +10) come into view.
**Expected:** Numbers animate from 0 to their final values over approximately 1.5 seconds with a smooth ease-out curve. The prefix (+) appears with the final value. Users with prefers-reduced-motion see final values immediately.
**Why human:** requestAnimationFrame animation and IntersectionObserver trigger require a running browser.

#### 4. FAQ Accordion Toggle Behavior

**Test:** Load the page and scroll to the FAQ section. Observe the first item. Click the second question. Click the first question again.
**Expected:** First item is open on load. Clicking the second question closes the first and opens the second with a smooth max-height animation (question expands, icon rotates). Clicking the first question again closes the second and opens the first.
**Why human:** CSS transition and JS toggle interaction require a running browser.

#### 5. Mobile Responsive Layout

**Test:** Open browser devtools, resize to <480px, scroll through all 4 new sections.
**Expected:** MDP sede cards scroll horizontally with snap alignment; gallery photos scroll horizontally (square items); testimonials scroll horizontally; stats in 2x2 grid; ecosystem cards stack to 1 column; Aura Club stacks with image on top (order: -1).
**Why human:** Responsive layout requires an actual viewport resize.

### Gaps Summary

No gaps were found in the automated verification. All 21 truths pass, all 9 artifacts are substantive and wired, all 19 requirements are satisfied, and all 5 commits documented in the summaries are present in git history.

Two DS-04 warnings exist in `SectionEcosystem.vue` (hardcoded hex values `#3d4e62` and `#a08a50` for hover states). These do not block the phase goal and are minor style violations — they should be resolved in a future CSS token cleanup but do not require blocking verification.

Five items require human browser testing to confirm the interactive and visual behaviors that automated code analysis cannot validate.

---

_Verified: 2026-03-01T17:30:00Z_
_Verifier: Claude (gsd-verifier)_
