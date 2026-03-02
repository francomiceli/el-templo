# Phase 39: App & PDF Brand Alignment - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Unify el-templo-app and el-templo-admin PDF visual identity with el-templo-web's design system. Migrate typography from Cinzel to Montserrat/Geologica/Cormorant Garamond, align color palette to terracotta/aged-gold/marble-cream, create shared design tokens via CSS custom properties with SCSS bridge, and restyle app pages/components and the PDF builder to follow the canonical brand system from Phase 30. Admin gets a light brand touch (palette + body font + background), not full restyling.

</domain>

<decisions>
## Implementation Decisions

### Color Palette Mapping

- $primary: Terracotta (#c07a56) — the app should feel like a natural extension of the landing page
- $secondary: Aged Gold (#b89b5e) — icons, badges, highlights
- $accent: Deep Charcoal (#3d3732) — text and subtle accents
- **No blue anywhere** — eliminate all blue from the palette, including $info (replace with warm neutral like olive-stone)
- Background: Marble-cream (#f2ede5) replaces current cream (#f5f0e8) everywhere (body, q-page, q-card, q-drawer)
- Toolbar/header: Deep charcoal (#3d3732) background with terracotta accents — dark and authoritative without blue
- Block backgrounds: Migrate bronze/navy gradients to terracotta/aged-gold tint gradients at similar opacities
- Marble texture mixin: Keep it, update base color to marble-cream
- Semantic feedback colors ($positive, $negative, $warning): Warm them slightly while staying recognizable — no standard cold tones
- Dark mode (app only): Update navy-based ($dark: #1a2a3e, $dark-page: #0f1a28) to charcoal-based (deep-charcoal #3d3732 family)
- Links and active indicators: Terracotta (follows $primary) — sufficient contrast on marble-cream

### Design Token Strategy

- CSS custom properties as single source of truth (import/mirror el-templo-web tokens.css approach)
- SCSS bridge for Quasar compatibility: $primary: var(--color-terracotta), etc.
- No double maintenance — one token file, consumed by both systems

### Typography

- **Montserrat** (font-authority): All UI headings, page titles, navigation, block names (INITIUM, NUCLEUS, etc. in bold 700/800 + uppercase + letter-spacing)
- **Cormorant Garamond** (font-elegance): Quotes and splash screen only — keep it special and rare
- **Geologica** (font-clarity): All body text, replaces Roboto in both app and admin
- Block names: Montserrat bold uppercase with letter-spacing (not Cormorant — authoritative, not ceremonial)

### Admin App Scope

- Light brand touch only: update $primary/$secondary/$accent to new palette, swap Roboto for Geologica body text, marble-cream background
- No deep restyling of admin UI components
- No dark mode update for admin
- Blog editor content preview: keep as-is (Montserrat), no Cormorant
- PDF builder: gets full brand treatment (see below)

### PDF Builder

- Font + color swap only — same layout structure, no redesign
- All three brand fonts embedded as base64: Montserrat (headings), Cormorant Garamond (quotes), Geologica (body/exercise descriptions)
- Color swap: navy (#24364A) → deep charcoal (#3d3732), cream (#F2EBE1) → marble-cream (#f2ede5)
- Quotes: deep charcoal main text + terracotta accent on punchlines (replacing navy + gold)
- Cover page: terracotta background with cream/white text and logo (bold, branded)

### Claude's Discretion

- Exact Montserrat weight mapping for each heading level (h1-h6)
- Specific warm-toned replacements for $positive/$negative/$info/$warning
- Dark mode charcoal palette specifics (exact shades for $dark, $dark-page)
- SCSS bridge implementation approach (shared package vs copied file)
- Marble texture mixin opacity adjustments for new base color
- Font weight selection for Geologica body (400 vs 500 for readability on mobile)

</decisions>

<specifics>
## Specific Ideas

- "The app should feel like a natural extension of the landing page — what's primary in landing becomes primary in the app"
- "We are getting rid of ANYTHING blue or blue-alike in the new design"
- Terracotta links and active tab indicators are acceptable — full brand cohesion over convention
- Block names stay authoritative (Montserrat bold) not ceremonial (Cormorant)
- PDF cover goes bold: terracotta full background, not a subtle accent

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-web/assets/css/tokens.css`: Canonical design tokens — CSS custom properties for colors, fonts, spacing, shadows, transitions. This IS the source of truth.
- `el-templo-web/assets/css/fonts.css`: Self-hosted @font-face declarations for Montserrat (300/600/700/800), Cormorant Garamond (400/400i/500/600), Geologica (400/500/600)
- `el-templo-web/assets/fonts/`: woff2 font files from @fontsource (latin subset)

### Established Patterns

- el-templo-app uses `quasar.variables.scss` for Quasar theme colors and `app.scss` for global styles + Cinzel imports
- Cinzel is referenced in 20+ locations across app: `app.scss`, `MainLayout.vue`, player components (SplashScreen, BlockHeader, ProgressBar, RpeSlider, CelebrationScreen, SessionSummary), `WeeklyView.vue`, `ConceptosPage.vue`, `LevelDisplay.vue`
- el-templo-admin uses `app.scss` (Roboto body, minimal branding) + Quasar defaults
- PDF builder (`el-templo-admin/src/utils/pdf/session-pdf-builder.ts`) embeds Cinzel as base64 in `pdf-assets.ts`, uses hardcoded color constants (NAVY, BG_CREAM)
- Block background gradients defined as CSS classes in `app.scss` (.block-bg--initium, .block-bg--nucleus, etc.)

### Integration Points

- `quasar.variables.scss`: Quasar reads this at build time for $primary, $secondary, $accent, $dark, $dark-page
- `app.scss`: Global styles imported by Quasar's build — heading fonts, block backgrounds, white-elimination overrides
- `pdf-assets.ts`: Base64 font data consumed by `session-pdf-builder.ts` via pdfmake
- Font files: Currently Cinzel from @fontsource — need to add Montserrat, Geologica, Cormorant Garamond @fontsource packages to both apps

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 39-app-pdf-brand-alignment_
_Context gathered: 2026-03-02_
