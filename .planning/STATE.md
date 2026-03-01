---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Landing Page
status: unknown
stopped_at: Completed 32-03-PLAN.md (Phase 32 fully complete)
last_updated: "2026-03-01T15:12:15.789Z"
progress:
  total_phases: 30
  completed_phases: 22
  total_plans: 139
  completed_plans: 135
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** A visitor lands on eltemplo.org and within 10 seconds understands that El Templo is not a gym.
**Current focus:** v3.0 Landing Page — Phase 32 complete, Phase 33 next (Locations/Sedes)

## Current Position

Phase: 32 of 36 (Levels, Approaches & Conversion Sections) -- COMPLETE
Plan: 3 of 3 complete
Status: Phase 32 complete -- all 3 sections built and integrated into index.vue
Last activity: 2026-03-01 — Plan 03 complete (SectionConversion + page integration)

Progress: [██████████] 100% (3/3 plans)

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

### Last Session

- **Stopped at:** Completed 32-03-PLAN.md (Phase 32 fully complete)
- **Timestamp:** 2026-03-01T15:10:53Z
