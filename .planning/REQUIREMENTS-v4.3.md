# Requirements: El Templo v4.3 — Android Play Store Launch

**Defined:** 2026-03-21
**Core Value:** The member app (el-templo-app) is published on Google Play Store, enabling members to install it directly from the store instead of sideloading APKs — establishing the app as a real, discoverable product.

## v4.3 Requirements

### Pre-Release Prep

- [ ] **PLAY-01**: Capacitor version alignment — CLI (v8) and native plugins (v7.4.5) on same major version, all dependencies compatible
- [ ] **PLAY-02**: Version management strategy — `versionCode` auto-increments per build, `versionName` follows semver (1.0.0), documented in build workflow
- [ ] **PLAY-03**: App metadata audit — app name, package ID (`com.eltemplo.app`), icon, and splash screen are production-ready
- [ ] **PLAY-04**: Android permissions audit — only necessary permissions declared in AndroidManifest.xml (currently INTERNET only — verify nothing else crept in)

### Android Signing & Release Build

- [x] **PLAY-05**: Upload keystore generated and securely stored (NOT in repo) — backup strategy documented
- [x] **PLAY-06**: Gradle `signingConfigs` block configured for release builds using environment variables / GitHub Secrets
- [ ] **PLAY-07**: GitHub Actions workflow `build-android-production.yml` builds signed AAB (Android App Bundle) for production flavor
- [ ] **PLAY-08**: AAB uploaded as GitHub Actions artifact for manual download and Play Store upload
- [x] **PLAY-09**: Existing staging debug workflow still works after changes (no regression)

### Play Store Setup & Listing

- [ ] **PLAY-10**: Google Play Developer account registered and active ($25 fee)
- [ ] **PLAY-11**: App created in Play Console with correct package name (`com.eltemplo.app`)
- [ ] **PLAY-12**: Store listing complete — app name, short description, full description (Spanish, primary), feature graphic, screenshots (phone)
- [ ] **PLAY-13**: Privacy policy URL published and linked in Play Console
- [ ] **PLAY-14**: Data safety form completed accurately (what data is collected, how it's used)
- [ ] **PLAY-15**: Content rating questionnaire completed (IARC)
- [ ] **PLAY-16**: App category and contact details configured
- [ ] **PLAY-17**: Target audience and content declaration completed

### Testing & Launch

- [ ] **PLAY-18**: Signed AAB uploaded to internal testing track in Play Console
- [ ] **PLAY-19**: App tested on at least 2 real Android devices via internal testing track (install from Play Store, login, complete a session)
- [ ] **PLAY-20**: Pre-launch report reviewed in Play Console (automated device testing) — no critical issues
- [ ] **PLAY-21**: App promoted from internal testing → production track
- [ ] **PLAY-22**: App live and installable from Google Play Store
