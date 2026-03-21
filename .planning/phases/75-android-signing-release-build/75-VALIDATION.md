---
phase: 75
slug: android-signing-release-build
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Framework**          | Gradle build (Android), GitHub Actions workflow validation                                                      |
| **Config file**        | `el-templo-app/src-capacitor/android/app/build.gradle`                                                          |
| **Quick run command**  | `cd el-templo-app/src-capacitor/android && ./gradlew assembleStagingDebug`                                      |
| **Full suite command** | `cd el-templo-app/src-capacitor/android && ./gradlew assembleStagingDebug && ./gradlew bundleProductionRelease` |
| **Estimated runtime**  | ~120 seconds                                                                                                    |

---

## Sampling Rate

- **After every task commit:** Run `cd el-templo-app/src-capacitor/android && ./gradlew assembleStagingDebug`
- **After every plan wave:** Run full suite including production bundle
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type | Automated Command                                                            | File Exists | Status     |
| -------- | ---- | ---- | ----------- | --------- | ---------------------------------------------------------------------------- | ----------- | ---------- |
| 75-01-01 | 01   | 1    | PLAY-05     | grep      | `grep signingConfigs el-templo-app/src-capacitor/android/app/build.gradle`   | ✅          | ⬜ pending |
| 75-01-02 | 01   | 1    | PLAY-06     | grep      | `grep ANDROID_KEYSTORE el-templo-app/src-capacitor/android/app/build.gradle` | ✅          | ⬜ pending |
| 75-01-03 | 01   | 1    | PLAY-09     | build     | `cd el-templo-app/src-capacitor/android && ./gradlew assembleStagingDebug`   | ✅          | ⬜ pending |
| 75-02-01 | 02   | 1    | PLAY-07     | file      | `test -f .github/workflows/build-android-production.yml`                     | ✅          | ⬜ pending |
| 75-02-02 | 02   | 1    | PLAY-08     | grep      | `grep upload-artifact .github/workflows/build-android-production.yml`        | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

_Existing infrastructure covers all phase requirements._

---

## Manual-Only Verifications

| Behavior                                   | Requirement | Why Manual                       | Test Instructions                                                      |
| ------------------------------------------ | ----------- | -------------------------------- | ---------------------------------------------------------------------- |
| Keystore generated and backed up           | PLAY-05     | Requires local keytool execution | Run keytool command from SECRETS.md guide, verify .p12 file created    |
| GitHub Secrets configured                  | PLAY-05     | Requires GitHub UI               | Add ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD to repo secrets |
| Production workflow runs on GitHub Actions | PLAY-07     | Requires CI runner with secrets  | Trigger build-android-production.yml and verify AAB artifact uploaded  |
| Staging workflow still works               | PLAY-09     | Requires CI runner               | Trigger build-android-staging.yml and verify it completes              |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
