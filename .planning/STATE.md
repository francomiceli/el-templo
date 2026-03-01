---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Landing Page
status: unknown
stopped_at: Completed 34-04-PLAN.md (Phase 34 complete)
last_updated: "2026-03-01T17:22:34.999Z"
progress:
  total_phases: 33
  completed_phases: 24
  total_plans: 146
  completed_plans: 142
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** A visitor lands on eltemplo.org and within 10 seconds understands that El Templo is not a gym.
**Current focus:** v3.0 Landing Page — Phase 34 in progress (Franquicias Page)

## Current Position

Phase: 34 of 36 (Franquicias Page)
Plan: 4 of 4 complete
Status: Phase 34 COMPLETE -- /franquicias page fully assembled with form, WhatsApp, SEO
Last activity: 2026-03-01 — Plan 04 complete (FranForm + FranWhatsApp + page composition)

Progress: [██████████] 100% (4/4 plans)

## Milestone v3.0 Context

**What we're building:** el-templo-web — Nuxt 3 SSR/SSG marketing site at root eltemplo.org
**Specs:** 38 documents in .docs/brand-landing/ (all sections fully specced)
**Design decisions resolved:** See memory file landing-design-decisions.md

**Remaining workflow steps:**

1. ~~Load context~~ done
2. ~~Gather milestone goals~~ done
3. ~~Determine version~~ done (v3.0)
4. ~~Update PROJECT.md~~ done
5. ~~Update STATE.md~~ done
6. ~~Commit docs~~ done (71476cc)
7. ~~Research decision~~ done (skip)
8. ~~Define REQUIREMENTS.md~~ done (113 requirements across 19 categories)
9. ~~Spawn roadmapper~~ done (8 phases: 29-36)
10. Approve roadmap — CURRENT
11. Plan Phase 29 — NEXT (`/gsd:plan-phase 29`)

## Accumulated Context

### v2.0 Deferrals

- Phase 21: APK signing / Play Store
- Phase 22-24: Branch Attendance system
- Pick up post-v3.0

### Phase 29 Decisions

- Used Nuxt 4.3.1 (latest stable) — plan specified Nuxt 3 but 4.x is current release
- Added better-sqlite3 as @nuxt/content v3 dependency for local SQLite storage
- Scoped lint-staged to Nuxt source dirs to avoid ESLint mismatch on root config files
- Reuse VITE*API_URL and VITE_SENTRY_DSN secrets as NUXT_PUBLIC* env vars (no duplicate secrets)
- SSG deploy pattern: nuxt generate -> rsync static files -> no PM2 restart needed
- SSG Nginx try_files: $uri $uri/index.html $uri.html /index.html =404
- Root domain eltemplo.org serves el-templo-web (landing takes priority)
- www.eltemplo.org 301-redirects to eltemplo.org (canonical non-www)
- Individual Certbot certs per domain (not wildcard)

### Infrastructure Reference

- EC2 deployment with Nginx reverse proxy
- Subdomains: app/admin/api.eltemplo.org
- Landing takes root domain eltemplo.org
- CI: .github/workflows/ (ci.yml, deploy.yml, deploy-staging.yml)
- Web Nginx configs: deploy/nginx/eltemplo.org, web-staging.eltemplo.org, www-redirect.eltemplo.org

### Phase 30 Decisions

- Fixed lint-staged eslint command for el-templo-web to use `pnpm --filter` for correct cwd resolution (Nuxt-generated ESLint config uses relative imports)
- Gladius active nav state uses Aged Gold (consistent with hover) rather than default Terracotta
- Staggered drawer link animation uses inline transition-delay via :style binding for data-driven simplicity
- Narrow desktop breakpoint (769-1024px) reduces nav link gap and font size to prevent overflow
- Coming-soon links rendered as `<span>` not `<a>` to prevent navigation, with Olive Stone color and no hover/cursor
- Social media icons use inline SVGs (Instagram, YouTube, TikTok) -- all disabled per CONTEXT.md
- DevServer port set to 9200 to avoid conflict with el-templo-api on port 3000
- Hero section uses actual brand copy and CTAs (not placeholder treatment) per CONTEXT.md
- Section stubs alternate marble cream / warm stone backgrounds matching spec pattern

### Phase 31 Decisions

- Staggered entrance animation uses CSS transitions with inline transition-delay via :style (consistent with Phase 30 drawer pattern)
- Parallax uses requestAnimationFrame with matchMedia guard for desktop-only (> 768px), disabled entirely on mobile
- Hero escapes default layout padding-top with negative margin-top (-64px desktop, -56px mobile) and compensates with padding-top on content
- Video error handler hides video element on failure, Deep Charcoal background shows through cleanly
- Primary CTA scrolls to #descubri-nivel (sesion-prueba not yet built as distinct section)
- HTML entities for accented characters to avoid encoding issues
- Identity scroll-reveal uses directional slide from sides (text left, image right) per CONTEXT.md
- PlaceholderBox mobile aspect-ratio override uses :deep() with !important for inline style override
- Method section uses dual useScrollReveal instances for independent zone animation (blocks + specials)
- Session block hover elevated to translateY(-4px) + shadow-medium with watermark opacity shift (0.15->0.25) per CONTEXT.md
- Special card hover elevated from spec's -2px to -4px to match CONTEXT.md "same elevation as session cards"
- ROM/SKILLS inline SVG icons: stroke-based, 32x32, Olive Stone color
- No changes needed to layouts/default.vue -- SectionHero handles nav offset internally
- Dynamic bindings for hero video/poster paths to avoid Vite import resolution on missing assets

### Phase 32 Decisions

- Sliding tab indicator uses CSS transform (translateX based on tab index) -- no resize listener needed
- Per-level ghost CTA links to #descubri-nivel (conversion section) per CONTEXT.md discretion
- Mobile tabs fall back to per-tab border-bottom instead of sliding indicator for scroll compatibility
- Mirror phrases use unicode typographic quotes directly in string literals
- Animation retrigger pattern: toggle animating ref true then false via nextTick to re-run CSS keyframe
- SVG icons hand-crafted inline (stroke-based, 40x40, Terracotta via currentColor) following ROM/SKILLS pattern
- Tablet 3+2 approach layout uses natural grid flow (left-aligned row 2) -- acceptable per spec
- Mobile gradient fade uses sticky pseudo-element inside flex container for scroll hint
- Conversion section inline SVG icons: stroke-based 48x48 (temple/people presencial, phone/play app)
- App CTA opens new tab (target \_blank + noopener noreferrer); WhatsApp link opens same tab for native app takeover
- Dual-card flex-column layout with margin-top:auto on CTA pushes buttons to bottom regardless of content height

### Phase 33 Decisions

- Separate TypeScript data files in data/ directory for section content (sedes.ts, ecosystem.ts) -- establishes pattern for Phase 33
- sedesByCity pre-grouped export for render-ready city grouping in SectionLocations
- NuxtLink for ecosystem CTAs (internal routes) vs raw <a> for locations CTAs (external Maps/WhatsApp)
- Badge variant system: outdoor (Olive Stone), special (Aged Gold), intl (Azul Noche)
- Safe lightbox index access via computed property to satisfy TypeScript strict checks
- Gallery entrance uses scale(0.95) -> scale(1) for mosaic reveal, distinct from slide-up used by testimonials/stats
- Lightbox uses Teleport to body for proper z-index stacking above all content
- Count-up animation: requestAnimationFrame loop with ease-out-cubic easing, prefers-reduced-motion guard
- Body overflow locked when lightbox is open to prevent background scroll
- CSS-only icon rotation (+ rotated 45deg to x) for FAQ accordion -- no SVG swap needed
- Hidden attribute + CSS max-height/opacity dual approach for accessible accordion animation
- Data file pattern (data/faq.ts) consistent with sedes.ts and ecosystem.ts

### Phase 34 Decisions

- franquicias.ts centralizes ALL franchise page data (value props, models, includes, expansion, timeline, form selects, config) in a single file
- useCountUp composable extracted as reusable utility with idempotent trigger(), rAF cleanup(), and SSR/reduced-motion guards
- FranHero uses 36px H1 (not 48px like home hero) since franchise is a sub-page per spec sizing hierarchy
- Franchise overlay gradient uses 0.20/0.65 opacity per spec (darker than home 0.15/0.55 for stronger text contrast)
- FranModels card padding includes 3px offset for accent border to maintain consistent inner spacing
- fran- BEM prefix for all franchise section components
- SVG map uses simplified country outlines with dashed connecting arc between Argentina and Spain
- Pin pulse animation via CSS @keyframes on separate stroke circle for active sede markers
- Timeline connecting line uses transform scaleX/scaleY with transform-origin for progressive draw effect
- FranVideo uses computed hasContent check so section is completely absent from DOM when both config values are null
- Manual SQL migration (0018) for franchise_applications due to drizzle-kit interactive prompt conflicts with unrelated schema
- Email notification failure (Resend) does not fail application submission -- graceful error logging only
- CORS updated for both production (eltemplo.org) and dev (localhost:9200) to support franchise form
- FranWhatsApp added to home page in addition to /franquicias (per user visual verification feedback)
- PlaceholderBox label cleared to empty string to prevent text bleeding through hero overlay
- Native select elements for mobile form UX (no custom dropdowns)
- $fetch for form event handler API calls (not useFetch which is for reactive data)

### Roadmap Evolution

- Phase 37 added: Franchise Application Management — admin panel for managing franchise applications with AI-powered conversion strategies

### Last Session

- **Stopped at:** Completed 34-04-PLAN.md (Phase 34 complete)
- **Timestamp:** 2026-03-01T17:20:45Z
