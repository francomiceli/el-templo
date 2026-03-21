---
phase: 74
slug: pre-release-prep
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 74 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| **Framework**          | vitest (el-templo-app), Gradle build (Android)                                                |
| **Config file**        | `el-templo-app/vitest.config.ts`                                                              |
| **Quick run command**  | `cd el-templo-app && pnpm test`                                                               |
| **Full suite command** | `cd el-templo-app && pnpm test && cd src-capacitor/android && ./gradlew assembleStagingDebug` |
| **Estimated runtime**  | ~120 seconds                                                                                  |

---

## Sampling Rate

- **After every task commit:** Run `cd el-templo-app && pnpm test`
- **After every plan wave:** Run full suite including Gradle build
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type | Automated Command                                                                  | File Exists | Status     |
| -------- | ---- | ---- | ----------- | --------- | ---------------------------------------------------------------------------------- | ----------- | ---------- |
| 74-01-01 | 01   | 1    | PLAY-01     | build     | `cd el-templo-app/src-capacitor && npx cap doctor`                                 | ✅          | ⬜ pending |
| 74-01-02 | 01   | 1    | PLAY-04     | grep      | `grep CAMERA el-templo-app/src-capacitor/android/app/src/main/AndroidManifest.xml` | ✅          | ⬜ pending |
| 74-02-01 | 02   | 2    | PLAY-02     | grep      | `grep versionName el-templo-app/src-capacitor/android/app/build.gradle`            | ✅          | ⬜ pending |
| 74-02-02 | 02   | 2    | PLAY-03     | build     | `cd el-templo-app && pnpm build`                                                   | ✅          | ⬜ pending |
| 74-02-03 | 02   | 2    | PLAY-04     | build     | `cd el-templo-app/src-capacitor/android && ./gradlew assembleStagingDebug`         | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

_Existing infrastructure covers all phase requirements._

---

## Manual-Only Verifications

| Behavior                                    | Requirement | Why Manual                 | Test Instructions                                                                  |
| ------------------------------------------- | ----------- | -------------------------- | ---------------------------------------------------------------------------------- |
| Icons and splash screens visually correct   | PLAY-03     | Visual inspection required | Open app on Android device/emulator, verify icon in launcher and splash on startup |
| Staging APK workflow runs on GitHub Actions | PLAY-01     | Requires CI runner         | Trigger `build-android-staging.yml` workflow and verify it completes               |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
