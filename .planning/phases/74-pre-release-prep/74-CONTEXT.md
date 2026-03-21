# Phase 74: Pre-Release Prep - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Align Capacitor versions (v7→v8), establish version management strategy, and harden the Android app for production readiness before signing and Play Store submission. Includes iOS Capacitor alignment since it shares the same package.json. Does NOT include signing, Play Store listing, or app polish (separate phases).

</domain>

<decisions>
## Implementation Decisions

### Version identity

- First Play Store release is **v1.0.0** — clean slate for public perception
- `package.json` version aligned to 1.0.0 (single source of truth across app + Android)
- `versionCode`: auto-increment via GitHub Actions CI run number — never manual
- `versionName`: manually bumped in `build.gradle` for meaningful releases (1.0.0 → 1.1.0 → 2.0.0)
- Play Store releases are **intentional milestone events**, not tied to every deploy. Only major features warrant a new store version

### Capacitor upgrade

- Upgrade native project (`src-capacitor/package.json`) from v7 to v8 to match main app
- The mismatch was an oversight from Phase 7 upgrade — not intentional
- Include iOS native plugins in the upgrade (same package.json, trivial to include)
- Keep current SDK targets: compileSdk 35, targetSdk 35, minSdk 23 — already Play Store compliant
- Researcher should verify v7→v8 migration steps for the minimal plugin set (HTTP, Preferences, KeepAwake, Haptics, App)

### Production hardening

- Disable `usesCleartextTraffic` for production flavor (was only needed for dev/debug HTTP)
- Staging keeps `usesCleartextTraffic="true"` — stays loose for debugging
- Add network security config with `*.eltemplo.org` domain whitelist for production
- Enable ProGuard/R8 minification for release builds (`minifyEnabled true`)
- ProGuard only on production flavor — staging stays unminified for readable stack traces
- Same Sentry project for mobile as web production (Sentry tags by platform already)

### Android permissions

- Add CAMERA permission — required for QR check-in feature (html5-qrcode). Currently missing from manifest
- Researcher should verify if html5-qrcode needs native CAMERA permission or works through webview media API
- Runtime permission request needed for CAMERA on Android 6.0+
- INTERNET permission already declared — only other needed permission

### Staging workflow

- Hardening changes are production-flavor only — staging workflow stays untouched
- Existing `build-android-staging.yml` must still work after all changes (non-regression requirement)

### Claude's Discretion

- Exact ProGuard rules needed for Capacitor plugins
- Network security config XML structure
- How to wire versionCode from CI run number into Gradle build
- Capacitor v8 migration specifics (Gradle version bumps, config changes)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Android build infrastructure

- `el-templo-app/src-capacitor/android/app/build.gradle` — Current Gradle config with product flavors, SDK versions, no signing config
- `el-templo-app/src-capacitor/android/app/src/main/AndroidManifest.xml` — Current permissions and cleartext flag
- `el-templo-app/src-capacitor/capacitor.config.ts` — Dynamic staging/production app identity
- `el-templo-app/src-capacitor/package.json` — Native project deps (v7, needs upgrade to v8)
- `el-templo-app/package.json` — Main app deps (already v8)

### CI/CD workflows

- `.github/workflows/build-android-staging.yml` — Existing staging APK workflow (must not regress)
- `.github/workflows/build-ios-staging.yml` — iOS workflow (also has v7 Capacitor, upgrade alongside)

### Requirements

- `.planning/REQUIREMENTS-v4.3.md` — PLAY-01 through PLAY-04 are Phase 74 scope

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Product flavors (staging/production) already configured in `build.gradle` — can add per-flavor manifest overlays and build type configs
- `capacitor.config.ts` already handles staging/production identity switching via env vars
- GitHub Actions workflow pattern established — can clone and modify for production builds

### Established Patterns

- Build process: web app (Vite SPA) → copy to www/ → `cap sync` → Gradle build
- Environment-based config via VITE\_\* env vars at build time
- Manual `workflow_dispatch` trigger for mobile builds (not automatic)

### Integration Points

- `build.gradle` — add signingConfigs (Phase 75), ProGuard rules, versionCode from CI
- `AndroidManifest.xml` — add CAMERA permission, disable cleartext for production
- `src-capacitor/package.json` — bump all @capacitor/\* to v8
- May need per-flavor `AndroidManifest.xml` overlays for cleartext flag separation

</code_context>

<specifics>
## Specific Ideas

- User's first Play Store submission — surface non-obvious requirements proactively
- Play Store releases are milestone events, not routine deploys. Build workflow is manual trigger only
- QR check-in uses html5-qrcode which likely needs CAMERA permission — verify during research

</specifics>

<deferred>
## Deferred Ideas

- **Full app polish phase** — Comprehensive audit of every screen (loading states, error states, empty states, transitions, accessibility). Insert as Phase 76.1 (after listing setup, before launch). User explicitly wanted this as a separate phase with full scope.
- **Push notifications** — Firebase Cloud Messaging, POST_NOTIFICATIONS permission. Four notification types: new session available, class reminders, subscription expiring, general announcements from admin. Add as new phase in v4.3 before launch.
- **Privacy policy page** — Add /privacidad route to el-templo-web. Needed for Phase 76 (Play Store listing). Not Phase 74 scope.
- **Play Store screenshots** — Generate during Phase 76 from emulator or real device. Key screens: training, Mi Camino, Planes, QR.
- **Store listing language** — Spanish only (members are in Argentina and Barcelona, app UI is Spanish).
- **App update strategy** — Let Play Store auto-update handle it. No in-app version check needed for launch. Soft nudge or force-update can be added later if needed.

</deferred>

---

_Phase: 74-pre-release-prep_
_Context gathered: 2026-03-21_
