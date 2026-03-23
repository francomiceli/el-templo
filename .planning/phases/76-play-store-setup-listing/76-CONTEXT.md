# Phase 76: Play Store Setup & Listing - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up Google Play Developer account, create the app listing with all required assets, complete compliance forms, and publish a privacy policy — everything needed before uploading the AAB to a testing track (Phase 77).

</domain>

<decisions>
## Implementation Decisions

### Store Listing

- **D-01:** App name on Play Store: **"El Templo Calistenia"**
- **D-02:** Store listing copy (short 80-char description + full description) will be **collaboratively written** — user provides bullet points of what to highlight, Claude shapes into SEO-friendly Spanish copy. This happens during plan execution, not upfront.
- **D-03:** App category: **Health & Fitness**

### Visual Assets

- **D-04:** Feature graphic (1024x500): User needs **specs and guidance** on what to include — plan should detail dimensions, content recommendations, and brand alignment with existing assets
- **D-05:** Phone screenshots: **Captured from real device** using the production APK. Minimum 4 screenshots required. Plan should specify which key screens to capture.

### Privacy Policy

- **D-06:** Privacy policy hosted at **eltemplo.org/privacidad** — a page on the Nuxt landing page site
- **D-07:** Privacy policy content: **Claude drafts** by auditing the app's data collection (DB schema, API routes, third-party services). Written in Spanish.

### Data Safety

- **D-08:** Claude will **audit the API schema** and draft data safety declarations mapping collected data types to Google's categories
- **D-09:** Third-party data sharing: **Sentry only** (crash/diagnostic data). No analytics SDK at launch — can be added later and data safety form updated.

### Audience & Compliance

- **D-10:** Target audience: **18+ only** — simplifies compliance, aligns with gym membership reality
- **D-11:** Content rating (IARC): **No sensitive content** currently. No user-generated public content, no in-app purchases at launch, no location sharing. Future in-app purchases possible but not for v1.
- **D-12:** Contact info: Developer website **eltemplo.org**, support email TBD (user to provide a business email)

### Release Strategy

- **D-13:** Release path: **Internal testing → Closed beta with select members → Production**. This affects Phase 77 scope — need a closed beta step before production promotion.

### Claude's Discretion

- Feature graphic content layout and design recommendations
- Which specific app screens to recommend for screenshots
- Data safety form category mappings based on schema audit
- Privacy policy legal structure and section ordering

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### App Build & Signing

- `.github/workflows/build-android-production.yml` — Production AAB/APK build workflow (output of Phase 75)
- `el-templo-app/src-capacitor/android/app/build.gradle` — Package name `com.eltemplo.app`, version config

### Brand & Design

- `.docs/brand-landing/` — Brand assets, design tokens, colors, typography for feature graphic alignment

### Data Collection (for privacy policy & data safety audit)

- `el-templo-api/src/db/schema.ts` — Database schema showing all collected user data
- `el-templo-api/src/boot/sentry.ts` or `instrument.ts` — Sentry integration (third-party data sharing)

### Landing Page (privacy policy host)

- `el-templo-web/` — Nuxt 3 landing page where `/privacidad` will be added

### Prior Phase Context

- `.planning/phases/74-pre-release-prep/74-CONTEXT.md` — App name, package ID, icon decisions
- `.planning/phases/75-android-signing-release-build/75-CONTEXT.md` — Signing and build decisions

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Landing page (`el-templo-web/`) already exists with Nuxt 3 — adding `/privacidad` is straightforward page creation
- Brand design tokens in `.docs/brand-landing/` can inform feature graphic design guidance
- Sentry integration already configured in both API and app — known third-party for data safety

### Established Patterns

- Nuxt 3 pages pattern in `el-templo-web/pages/` — privacy policy follows same structure
- `@nuxt/content` module available for markdown-based content pages

### Integration Points

- Privacy policy URL will be referenced in Play Console AND in the app (settings/about screen link)
- Data safety declarations must match actual API data collection accurately

</code_context>

<specifics>
## Specific Ideas

- Store copy collaboration: user wants to be involved in the marketing text, not just review a draft. Plan should include a checkpoint for copy collaboration.
- Analytics SDK (Firebase Analytics or similar) deferred to post-launch — noted for future phase but data safety form declares Sentry only for now.
- Closed beta strategy: select gym members will test via Play Store before public release.

</specifics>

<deferred>
## Deferred Ideas

- **Analytics SDK integration** — Firebase Analytics or similar for tracking feature usage. Add in a future phase, update data safety form at that time.
- **In-app purchases** — May come in future versions. Content rating and data safety will need updating when implemented.

</deferred>

---

_Phase: 76-play-store-setup-listing_
_Context gathered: 2026-03-23_
