# Phase 75: Android Signing & Release Build - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Generate an upload keystore, configure Gradle signing for production release builds, and create a GitHub Actions workflow that produces a signed AAB (and APK) ready for Play Store upload. Does NOT include Play Store account setup, listing, or app submission (Phase 76-77).

</domain>

<decisions>
## Implementation Decisions

### Keystore strategy

- Use **Google Play App Signing** — Google manages the real signing key, we hold an upload key only
- If upload key is compromised, it can be reset via Play Console (no app death risk)
- User generates the upload keystore **locally** using keytool — plan provides exact commands
- Keystore file (`.jks`) goes into GitHub Secrets as base64-encoded string
- Backup location: user decides later — plan will remind them to back up the raw `.jks` file
- Plan includes full step-by-step guide for keytool generation, base64 encoding, and GitHub Secrets upload

### Signing config scope

- Signing applies to **production release builds only** (`productionRelease`)
- Staging stays debug-signed — signing secrets not needed for staging CI
- `signingConfigs.release` in `build.gradle` reads credentials from environment variables

### Production workflow design

- Workflow name: **"Build Android Production Release"**
- Filename: `build-android-production.yml`
- Trigger: **manual only** (`workflow_dispatch`) — Play Store releases are intentional milestone events
- Builds from **master** branch only
- Uses **production secrets** (VITE_API_URL → api.eltemplo.org, production Sentry DSN)
- Produces **both AAB and APK** artifacts (AAB for Play Store, APK for direct sideloading/testing)
- Gradle tasks: `bundleProductionRelease` (AAB) + `assembleProductionRelease` (APK)

### Artifact naming & retention

- Artifacts named with version + commit: `production-aab-v1.0.0-abc1234`, `production-apk-v1.0.0-abc1234`
- Version extracted from build.gradle `versionName`
- Retention: **90 days** (longer than staging's 30 days since these are actual releases)

### Secrets documentation

- Update existing `.github/SECRETS.md` with the 3 new secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`
- Include full step-by-step setup guide (keytool command, base64 encoding, adding to GitHub)

### Staging non-regression

- Existing `build-android-staging.yml` must still work after all changes (PLAY-09)
- Signing config is production-only — no changes to staging workflow needed

### Claude's Discretion

- Exact keytool command parameters (key algorithm, validity period, key alias naming)
- Gradle signingConfigs syntax and environment variable names
- Workflow step ordering and caching strategy
- How to extract versionName for artifact naming in the workflow

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Android build infrastructure (post Phase 74)

- `el-templo-app/src-capacitor/android/app/build.gradle` — Current Gradle config with product flavors, versionCode from CI, ProGuard for production only, NO signingConfigs yet
- `.github/workflows/build-android-staging.yml` — Existing staging workflow pattern to clone for production
- `.github/SECRETS.md` — Existing secrets documentation to update

### Requirements

- `.planning/REQUIREMENTS-v4.3.md` — PLAY-05 through PLAY-09 are Phase 75 scope

### Prior phase context

- `.planning/phases/74-pre-release-prep/74-CONTEXT.md` — Version management decisions (versionCode from CI, versionName manual, milestone events)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `build-android-staging.yml` — Clone and modify for production workflow (same structure: pnpm, Node, Java, Capacitor sync, Gradle build)
- Product flavors already configured in `build.gradle` — production flavor uses default applicationId `com.eltemplo.app`
- `androidComponents` block already scopes ProGuard to `productionRelease` — similar pattern for signing

### Established Patterns

- Manual `workflow_dispatch` trigger for mobile builds
- Environment variables passed via GitHub Secrets for API URL, Sentry DSN
- VERSION_CODE from `github.run_number` (wired in Phase 74)
- Artifact upload via `actions/upload-artifact@v4`

### Integration Points

- `build.gradle` — add `signingConfigs.release` block reading from env vars, wire to `productionRelease` build type
- `.github/workflows/` — new `build-android-production.yml` file
- `.github/SECRETS.md` — append signing-related secrets documentation
- AAB output path: `app/build/outputs/bundle/productionRelease/app-production-release.aab`
- APK output path: `app/build/outputs/apk/production/release/app-production-release.apk`

</code_context>

<specifics>
## Specific Ideas

- User's first time generating a keystore — include full step-by-step guide with exact commands
- Google Play App Signing is mandatory for new apps — plan should document the enrollment during Phase 76 (Play Console setup)
- Artifact naming should make it easy to find the right build in GitHub Actions (version + commit hash)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 75-android-signing-release-build_
_Context gathered: 2026-03-21_
