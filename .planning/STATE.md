---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Landing Page
status: phase_complete
stopped_at: Phase 40 complete — all 5 plans executed
last_updated: "2026-03-02T23:00:00.000Z"
progress:
  total_phases: 42
  completed_phases: 31
  total_plans: 171
  completed_plans: 167
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** A visitor lands on eltemplo.org and within 10 seconds understands that El Templo is not a gym.
**Current focus:** v3.0 Landing Page — Phase 37 planned (SEO Audit Fixes)

## Current Position

Phase: 40 of 42 (Day Player Redesign)
Plan: 5 of 5 — all plans executed
Status: Phase 40 complete
Last activity: 2026-03-02 — All 5 plans executed: foundation (quotes, navigation, progress bar), core UI (story card, compact list), overlay screens (splash, transition, celebration), integration (BlockProgressionView + DayPlayer + JourneySession wiring), build verification + decision audit

Progress: [=====] 100% (5/5 plans)

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

- Phase 37 inserted: SEO Audit Fixes — address seoptimer audit issues (SSR rendering, title, favicon, HTTP/2, social links, email privacy)
- Phase 38 (was 37): Franchise Application Management — admin panel for managing franchise applications with AI-powered conversion strategies
- Phases 39-40 inserted: App & PDF Brand Alignment + Day Player Redesign — unify design system, then redesign workout experience
- Phase 41 (was 39): Content & Media Handoff — deferred after app redesign work
- Phase 42 added: Blog internal linking system (tags, related posts, cross-page CTAs)

### Phase 35 Decisions

- Gladius admin routes restricted to admin/superadmin only (not coach) -- consistent with context decisions
- Blog readingTime computed on read from body word count (~200 words/min), not stored in DB
- publishedAt preserved when re-publishing (set once on first publish, never overwritten)
- Blog image R2 key uses blog/images/{timestamp}-{sanitized-filename} pattern
- slugify function duplicated in gladius and blog services for module independence
- Migration 0019 creates all 3 tables (gladius_products, gladius_inquiries, blog_posts) in one file
- GladWhatsApp created as separate component (not reusing FranWhatsApp) due to hardcoded URL and BEM prefix difference
- Catalog Consultar CTA scrolls to contact form and pre-fills product name via DOM manipulation
- Contact section uses two-column layout (form 60% + WhatsApp card 40%) for dual conversion path
- Admin blog editor uses plain textarea + custom toolbar (not CodeMirror/Monaco) per CONTEXT.md discretion
- Installed marked library for Markdown-to-HTML preview in blog editor
- Blog/Gladius sidebar items and routes restricted to admin/superadmin via isAdminRole computed and allowedRoles meta
- Blog date formatting uses manual DD de Mes, YYYY with capitalized month via toLocaleDateString es-AR
- Markdown rendered via marked library with v-html (admin-authored content trusted, no DOMPurify)
- Blog post body styled with :deep() scoped selectors for brand typography on generated HTML
- Social share buttons use inline SVGs for WhatsApp, Twitter/X, and copy-to-clipboard
- Sidebar sticky top: 80px for nav offset, flows below article on mobile

### Phase 36 Decisions

- Used defineWebPage + defineQuestion pattern for FAQPage (no defineFAQPage in nuxt-schema-org v5)
- Geo coordinates added as optional lat/lng fields on Sede interface for LocalBusiness schema
- Sitemap uses defineSitemapEventHandler server route for dynamic blog URLs
- Error page uses clearError({ redirect: '/' }) for navigation back to home
- OG image placeholders set for franquicias, gladius, and blog (actual images in Phase 39)
- H2 keyword optimization uses natural brand voice (not keyword stuffing)
- NuxtLink for all internal routes; raw <a> only for external URLs (Maps, WhatsApp)
- Blog cross-link placed in method CTA zone as subtle olive-stone styled link
- Analytics plugins follow .client.ts pattern guarded by runtimeConfig env var (no-op when empty)
- GladCatalog Consultar CTA also fires click_cta_gladius_consult for complete conversion tracking
- Blog post cover image gets loading="lazy" (below fold on post page)

### Phase 38 Decisions

- Label maps duplicated in ai-agent-service for module independence (consistent with blog/gladius slugify pattern)
- SORTABLE_COLUMNS map for dynamic sort column resolution in listApplications
- Superadmin-only route guard uses SUPERADMIN_ROLES array (not ADMIN_ROLES) for stricter access control
- AI agent service: brand-aware system prompt + agent-specific extensions pattern
- ANTHROPIC_API_KEY read automatically by Anthropic SDK from env (no explicit config)
- Shared franchise-labels.ts for DRY label maps across admin list and detail pages
- isSuperadminRole computed separate from isAdminRole for stricter franchise-only sidebar/routing access
- v-for over AGENT_TYPES array for DRY tab panel rendering instead of 4 separate inline blocks
- Regenerate dialog message includes agent-type-specific label for clearer user warning
- AI panel event pattern: child emits 'generated' with agentType+content, parent spreads into application ref

### Phase 39 Decisions

- Montserrat (headings), Geologica (body), Cormorant Garamond (narrative quotes) — replacing Cinzel, Roboto, NunitoSans, GreatVibes
- Terracotta (#c07a56) primary, Aged Gold (#b89b5e) secondary, Deep Charcoal (#3d3732) accent — replacing navy/bronze palette
- Marble Cream (#f2ede5) background — replacing old cream (#f5f0e8) and (#F2EBE1)
- $info color: Olive Stone (#8a8472) — no blue anywhere in brand (was #31ccec)
- Semantic colors: warm green positive, brick red negative, warm amber warning
- Admin gets light brand touch only: Geologica body font, marble cream bg, terracotta primary via quasar.variables.scss
- PDF builder: TTF fonts from Google Fonts API (pdfmake requires TTF, @fontsource only ships woff2)
- Both apps build cleanly after all changes
- Zero legacy values (Cinzel, navy hex, old bronze, old cream, blue info) remain

### Phase 40 Decisions

- Instagram Stories-style tap navigation: right 70% = next, left 30% = prev (navigation only, never completion)
- SegmentedProgressBar: 3px height bars, Aged Gold for completed/active, glow animation on active segment
- StoryExerciseCard: split layout 70% video/name hero + 30% detail, Completar button as sole completion mechanism
- CompactExerciseList: no left icons, green check on right, tapping row navigates to story slide
- Card-overlay-on-blur pattern shared across SplashScreen, TransitionScreen, CelebrationScreen
- Button-only dismissal for all overlay screens (no auto-advance, no tap-anywhere)
- TransitionScreen: mobility name reminder + motivational quote + action button between blocks
- Flame icon (local_fire_department) replaces trophy (emoji_events) in CelebrationScreen
- Quotes from quotes.ts (10 brand-curated quotes) with getQuoteForBlock deterministic selector
- Story navigation managed internally in BlockProgressionView via useStoryNavigation composable
- JourneySession.vue updated to match new component interfaces (SplashScreen, TransitionScreen, CelebrationScreen, BlockProgressionView)
- "Dosis" renamed to "Cantidad" throughout all player components

### Last Session

- **Stopped at:** Phase 40 complete
- **Timestamp:** 2026-03-02
