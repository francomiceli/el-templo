# Phase 75: Android Signing & Release Build - Research

**Researched:** 2026-03-21
**Domain:** Android release signing, Gradle signingConfigs, GitHub Actions CI/CD for AAB/APK production builds
**Confidence:** HIGH

## Summary

This phase adds release signing infrastructure to the existing Android build system. The project already has a working staging workflow (`build-android-staging.yml`) and product flavors (`production`/`staging`) configured in `build.gradle`. The work involves three files: adding a `signingConfigs.release` block to `build.gradle`, creating a new `build-android-production.yml` workflow, and updating `.github/SECRETS.md`.

The approach uses Google Play App Signing (mandatory for new apps) where Google manages the real app signing key and we hold only an upload key. The upload keystore is generated locally with `keytool`, base64-encoded, and stored as a GitHub Secret. The Gradle signing config reads credentials from environment variables, with a conditional guard so builds without signing secrets (local dev, staging CI) still work. No third-party GitHub Actions for signing are needed -- the r0adkll/sign-android-release action is abandoned and unnecessary since Gradle handles signing natively when `signingConfigs` is configured.

**Primary recommendation:** Configure signing entirely through Gradle's native `signingConfigs` block with `System.getenv()`, decode the base64 keystore in a workflow step, and conditionally apply the signing config only when env vars are present so local/staging builds are unaffected.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Use Google Play App Signing -- Google manages real signing key, we hold upload key only
- User generates upload keystore locally using keytool -- plan provides exact commands
- Keystore file (.jks) goes into GitHub Secrets as base64-encoded string
- Signing applies to production release builds only (productionRelease)
- Staging stays debug-signed -- signing secrets not needed for staging CI
- signingConfigs.release in build.gradle reads credentials from environment variables
- Workflow name: "Build Android Production Release", filename: build-android-production.yml
- Trigger: manual only (workflow_dispatch), builds from master branch only
- Produces both AAB and APK artifacts (AAB for Play Store, APK for sideloading/testing)
- Gradle tasks: bundleProductionRelease (AAB) + assembleProductionRelease (APK)
- Artifacts named with version + commit: production-aab-v1.0.0-abc1234, production-apk-v1.0.0-abc1234
- Retention: 90 days
- 3 new secrets: ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_PASSWORD
- Update existing .github/SECRETS.md with signing secrets documentation

### Claude's Discretion

- Exact keytool command parameters (key algorithm, validity period, key alias naming)
- Gradle signingConfigs syntax and environment variable names
- Workflow step ordering and caching strategy
- How to extract versionName for artifact naming in the workflow

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                            | Research Support                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| PLAY-05 | Upload keystore generated and securely stored (NOT in repo) -- backup strategy documented              | Keytool command with PKCS12 format, base64 encoding for GitHub Secrets, backup guidance                |
| PLAY-06 | Gradle signingConfigs block configured for release builds using environment variables / GitHub Secrets | Conditional signingConfigs pattern with System.getenv(), scoped to productionRelease only              |
| PLAY-07 | GitHub Actions workflow build-android-production.yml builds signed AAB for production flavor           | Full workflow pattern cloned from staging, with keystore decode + signing env vars + dual Gradle tasks |
| PLAY-08 | AAB uploaded as GitHub Actions artifact for manual download and Play Store upload                      | upload-artifact@v4 with version+commit naming, 90-day retention                                        |
| PLAY-09 | Existing staging debug workflow still works after changes (no regression)                              | Conditional signing guard ensures missing env vars don't break non-production builds                   |

</phase_requirements>

## Standard Stack

### Core

| Tool                    | Version          | Purpose                                     | Why Standard                                                |
| ----------------------- | ---------------- | ------------------------------------------- | ----------------------------------------------------------- |
| keytool                 | JDK 21 (bundled) | Generate upload keystore                    | Standard JDK tool, no installation needed                   |
| Gradle signingConfigs   | Native Gradle    | Configure release signing                   | Built into Android Gradle Plugin, no third-party dependency |
| actions/upload-artifact | v4               | Upload signed AAB/APK as workflow artifacts | Already used in staging workflow                            |
| actions/setup-java      | v4               | Set up JDK 21 in CI                         | Already used in staging workflow                            |

### Supporting

| Tool               | Purpose                               | When to Use                    |
| ------------------ | ------------------------------------- | ------------------------------ |
| openssl base64     | Encode keystore for GitHub Secrets    | One-time during keystore setup |
| grep (in workflow) | Extract versionName from build.gradle | During artifact naming step    |

### Alternatives Considered

| Instead of                | Could Use                            | Tradeoff                                                                                 |
| ------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Gradle native signing     | r0adkll/sign-android-release action  | Action is abandoned, uses deprecated set-output. Gradle native is simpler and maintained |
| Base64 in GitHub Secrets  | GitHub Actions environment files     | Base64 is the standard pattern, well-documented, works everywhere                        |
| Manual version extraction | nanogiants/android-versioning plugin | Overkill for single versionName extraction; grep is sufficient                           |

## Architecture Patterns

### Recommended Changes

```
Modified files:
  el-templo-app/src-capacitor/android/app/build.gradle    # Add signingConfigs.release block
  .github/workflows/build-android-production.yml           # NEW: production build workflow
  .github/SECRETS.md                                       # Append signing secrets docs
```

### Pattern 1: Conditional Signing Config in build.gradle

**What:** Define `signingConfigs.release` that reads from environment variables, but only apply it to the `productionRelease` build type when the variables are present.
**When to use:** Always -- this ensures local dev builds and staging CI don't fail when keystore env vars are missing.
**Example:**

```groovy
// Source: Multiple verified sources (Android docs + community patterns)
android {
    signingConfigs {
        release {
            storeFile file("keystore.jks")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias "upload"
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            minifyEnabled = false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
            // Only apply signing config when keystore password is available (CI)
            if (System.getenv("ANDROID_KEYSTORE_PASSWORD")) {
                signingConfig signingConfigs.release
            }
        }
    }
}
```

**Key detail:** The `storeFile` references `keystore.jks` relative to the `app/` directory. In CI, the workflow decodes the base64 secret into this path before the Gradle build runs. Locally, this file won't exist and the conditional guard prevents errors.

### Pattern 2: Base64 Keystore Decode in GitHub Actions

**What:** Store the keystore as a base64-encoded GitHub Secret, decode it into a file at build time.
**When to use:** Every production build in CI.
**Example:**

```yaml
# Source: Verified community pattern
- name: Decode keystore
  working-directory: el-templo-app/src-capacitor/android/app
  run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 --decode > keystore.jks
```

**Key detail:** The keystore is decoded into the `app/` directory where `build.gradle` expects it via `storeFile file("keystore.jks")`. This avoids needing absolute paths or environment variables for the file location.

### Pattern 3: Version Extraction for Artifact Naming

**What:** Extract versionName from build.gradle using grep to name artifacts with version + commit hash.
**When to use:** In the workflow for artifact naming.
**Example:**

```yaml
# Source: Verified community pattern
- name: Extract version name
  id: version
  working-directory: el-templo-app/src-capacitor/android/app
  run: |
    VERSION_NAME=$(grep 'versionName' build.gradle | head -1 | sed 's/.*"\(.*\)".*/\1/')
    SHORT_SHA=$(echo "${{ github.sha }}" | cut -c1-7)
    echo "name=v${VERSION_NAME}-${SHORT_SHA}" >> $GITHUB_OUTPUT
```

### Anti-Patterns to Avoid

- **Committing keystore to repo:** Never. Even in `.gitignore`-d paths, the risk of accidental commit is too high. Store only in GitHub Secrets as base64.
- **Using a third-party signing action:** The popular `r0adkll/sign-android-release` is abandoned and uses deprecated GitHub Actions APIs. Gradle's native signing is simpler.
- **Hardcoding keystore path as absolute:** Use `file("keystore.jks")` relative to the app directory, not an absolute path that varies between CI environments.
- **Same password for keystore and key with JKS format:** Use PKCS12 format where keystore and key passwords are the same by design, simplifying secrets management.

## Don't Hand-Roll

| Problem          | Don't Build                          | Use Instead                | Why                                                                       |
| ---------------- | ------------------------------------ | -------------------------- | ------------------------------------------------------------------------- |
| Android signing  | Custom jarsigner scripts             | Gradle signingConfigs      | Gradle handles signing automatically during build; jarsigner is legacy    |
| Keystore storage | Custom encryption/decryption scripts | GitHub Secrets + base64    | Standard pattern, built-in secret masking, no custom code                 |
| Artifact upload  | Custom upload scripts                | actions/upload-artifact@v4 | Already used in staging workflow, handles retention, downloadable from UI |

## Common Pitfalls

### Pitfall 1: Signing Config Breaks Local Builds

**What goes wrong:** Adding `signingConfig signingConfigs.release` unconditionally makes debug builds fail when keystore env vars are missing.
**Why it happens:** The release signing config references env vars that don't exist locally.
**How to avoid:** Conditionally apply signing config only when `System.getenv("ANDROID_KEYSTORE_PASSWORD")` is non-null. The signing config definition itself is harmless -- null values don't crash at config parse time -- but applying it to a build type causes the build to attempt signing with null credentials.
**Warning signs:** `./gradlew assembleStagingDebug` fails after signing changes.

### Pitfall 2: PKCS12 vs JKS Password Confusion

**What goes wrong:** User sets different keystore password and key password with PKCS12 format, which doesn't support separate passwords.
**Why it happens:** JKS allows different passwords; PKCS12 does not.
**How to avoid:** Use PKCS12 format (modern, recommended) and set the same password for both. In GitHub Secrets, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD` can be the same value.
**Warning signs:** `java.security.UnrecoverableKeyException` during build.

### Pitfall 3: Wrong Keystore File Location in CI

**What goes wrong:** The `storeFile` path in `build.gradle` doesn't match where the decoded keystore lands in the workflow.
**Why it happens:** Working directory confusion -- `build.gradle` resolves `file("keystore.jks")` relative to the module's `app/` directory, but the workflow `run` step might execute from a different directory.
**How to avoid:** Explicitly set `working-directory` in the decode step to `el-templo-app/src-capacitor/android/app` so the file lands in the right place.
**Warning signs:** `FileNotFoundException` for keystore during Gradle build.

### Pitfall 4: Missing Key Alias

**What goes wrong:** The `keyAlias` in `build.gradle` doesn't match the alias used when generating the keystore with keytool.
**Why it happens:** User forgets which alias they chose, or uses a different one than documented.
**How to avoid:** Hardcode a standard alias name (`upload`) in both the keytool command and `build.gradle`. Don't make alias configurable via env var -- it's not a secret and should be consistent.
**Warning signs:** `java.security.UnrecoverableKeyException: Cannot recover key`.

### Pitfall 5: Keystore Not Cleaned Up After Build

**What goes wrong:** The decoded keystore file persists on the runner, potentially accessible to subsequent jobs.
**Why it happens:** No cleanup step after the Gradle build.
**How to avoid:** GitHub Actions runners are ephemeral (destroyed after each workflow run), so this is low risk. But for defense-in-depth, add a cleanup step or use a temp directory.
**Warning signs:** Not a functional issue, but a security concern.

## Code Examples

### Keytool Upload Keystore Generation Command

```bash
# Source: Android Developer docs + React Native docs (verified)
# Run this ONCE locally. PKCS12 format (modern, recommended).
# Validity: 10000 days (~27 years, exceeds Google's requirement of expiry after Oct 2033)
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore eltemplo-upload-key.keystore \
  -alias upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

# When prompted:
# - Enter a strong password (12+ chars, mixed case, numbers, symbols)
# - For "What is your first and last name?": El Templo
# - Organization: El Templo
# - Country: AR
# - Other fields can be left blank or filled as desired
```

### Base64 Encoding for GitHub Secrets

```bash
# Source: Community-verified pattern
# Encode the keystore for storage in GitHub Secrets
openssl base64 -A -in eltemplo-upload-key.keystore -out eltemplo-upload-key.base64.txt

# Copy the contents of eltemplo-upload-key.base64.txt to GitHub Secret: ANDROID_KEYSTORE_BASE64
# Then delete both files from your machine (keep a secure backup of the .keystore)
```

### Gradle signingConfigs Block (build.gradle addition)

```groovy
// Source: Android Developer docs + verified community patterns
// Add inside android { } block, BEFORE buildTypes { }
signingConfigs {
    release {
        storeFile file("keystore.jks")
        storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
        keyAlias "upload"
        keyPassword System.getenv("ANDROID_KEY_PASSWORD")
    }
}

// Modify the existing buildTypes.release to conditionally apply signing
buildTypes {
    release {
        minifyEnabled = false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        if (System.getenv("ANDROID_KEYSTORE_PASSWORD") != null) {
            signingConfig signingConfigs.release
        }
    }
}
```

### Production Workflow Structure (key steps)

```yaml
# Source: Adapted from existing build-android-staging.yml + verified patterns
name: Build Android Production Release

on:
  workflow_dispatch:

env:
  NODE_VERSION: "22"

jobs:
  build:
    name: Build Production Release
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: el-templo-app

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      # ... pnpm, Node, Java setup (same as staging) ...

      - name: Build web assets for production
        run: pnpm run build
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
          VITE_APP_NAME: "El Templo"
          VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}

      # ... Capacitor install + sync (same as staging, without STAGING env) ...

      - name: Decode keystore
        working-directory: el-templo-app/src-capacitor/android/app
        run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 --decode > keystore.jks

      - name: Extract version name
        id: version
        working-directory: el-templo-app/src-capacitor/android/app
        run: |
          VERSION_NAME=$(grep 'versionName' build.gradle | head -1 | sed 's/.*"\(.*\)".*/\1/')
          SHORT_SHA=$(echo "${{ github.sha }}" | cut -c1-7)
          echo "name=v${VERSION_NAME}-${SHORT_SHA}" >> $GITHUB_OUTPUT

      - name: Build signed AAB + APK
        working-directory: el-templo-app/src-capacitor/android
        env:
          VERSION_CODE: ${{ github.run_number }}
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: ./gradlew bundleProductionRelease assembleProductionRelease

      - name: Upload AAB artifact
        uses: actions/upload-artifact@v4
        with:
          name: production-aab-${{ steps.version.outputs.name }}
          path: el-templo-app/src-capacitor/android/app/build/outputs/bundle/productionRelease/app-production-release.aab
          retention-days: 90

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: production-apk-${{ steps.version.outputs.name }}
          path: el-templo-app/src-capacitor/android/app/build/outputs/apk/production/release/app-production-release.apk
          retention-days: 90
```

## State of the Art

| Old Approach                        | Current Approach                                 | When Changed                             | Impact                                                                               |
| ----------------------------------- | ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| JKS keystore format                 | PKCS12 keystore format                           | JDK 9+ (2017)                            | PKCS12 is now the default and recommended format; JKS is legacy                      |
| App signing key = upload key        | Google Play App Signing (separate upload key)    | 2017 (mandatory for new apps since 2021) | Upload key compromise is recoverable; Google manages the real signing key            |
| jarsigner for APK signing           | Gradle signingConfigs (apksigner under the hood) | Android Gradle Plugin 1.0+               | Fully integrated into build system, handles v1+v2+v3 signature schemes automatically |
| APK-only distribution               | AAB (Android App Bundle) preferred               | 2021 (mandatory for new Play Store apps) | Google generates optimized APKs per device; smaller downloads for users              |
| r0adkll/sign-android-release action | Gradle native signing in workflow                | 2023 (action abandoned)                  | No third-party dependency; simpler, more maintainable                                |

**Deprecated/outdated:**

- `r0adkll/sign-android-release` GitHub Action: Abandoned, uses deprecated `set-output` commands. Do not use.
- JKS keystore format: Still works but PKCS12 is recommended. `keytool` warns when creating JKS keystores.
- Manual `jarsigner` invocation: Unnecessary when Gradle signingConfigs handles everything.

## Open Questions

1. **Key alias as secret vs hardcoded**
   - What we know: The alias is not sensitive information (it's included in the signed APK metadata). CONTEXT.md specifies 3 secrets, not 4.
   - What's unclear: Whether to hardcode the alias as `"upload"` in `build.gradle` or make it an env var for flexibility.
   - Recommendation: Hardcode as `"upload"` in `build.gradle`. It's not a secret, and making it configurable adds complexity with no security benefit. The CONTEXT.md decision to have only 3 secrets aligns with this.

2. **Cleanup of decoded keystore after build**
   - What we know: GitHub Actions runners are ephemeral and destroyed after each workflow run.
   - What's unclear: Whether an explicit cleanup step is needed.
   - Recommendation: Skip cleanup -- runners are ephemeral. Adding cleanup is defense-in-depth but adds complexity for marginal benefit.

## Validation Architecture

### Test Framework

| Property           | Value                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Framework          | Manual verification (no automated test framework for CI workflows)                                |
| Config file        | N/A -- workflow files are tested by running them                                                  |
| Quick run command  | `cd el-templo-app/src-capacitor/android && ./gradlew assembleStagingDebug` (verify no regression) |
| Full suite command | Trigger both workflows manually in GitHub Actions                                                 |

### Phase Requirements to Test Map

| Req ID  | Behavior                                           | Test Type   | Automated Command                                                                                 | File Exists?                 |
| ------- | -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- | ---------------------------- |
| PLAY-05 | Keystore generated, not in repo, backup documented | manual-only | `grep -r "keystore.jks" .gitignore` (verify gitignored if applicable)                             | N/A                          |
| PLAY-06 | signingConfigs reads from env vars                 | smoke       | `cd el-templo-app/src-capacitor/android && ./gradlew assembleStagingDebug` (no regression)        | N/A                          |
| PLAY-07 | Production workflow builds signed AAB              | manual-only | Trigger `build-android-production.yml` via GitHub UI                                              | Wave 0: create workflow file |
| PLAY-08 | AAB/APK uploaded as artifacts                      | manual-only | Check GitHub Actions run artifacts after workflow completes                                       | N/A                          |
| PLAY-09 | Staging workflow still works                       | smoke       | Trigger `build-android-staging.yml` via GitHub UI or run `./gradlew assembleStagingDebug` locally | Exists already               |

### Sampling Rate

- **Per task commit:** `cd el-templo-app/src-capacitor/android && ./gradlew assembleStagingDebug` (verify signing changes don't break staging)
- **Per wave merge:** Trigger both staging and production workflows in GitHub Actions
- **Phase gate:** Both workflows produce artifacts successfully

### Wave 0 Gaps

- [ ] Keystore must be generated by user before production workflow can be tested
- [ ] GitHub Secrets must be configured before production workflow can run
- [ ] `.gitignore` entry for `keystore.jks` in the android app directory (prevent accidental commit of decoded keystore)

## Sources

### Primary (HIGH confidence)

- [Android Developer docs - App signing](https://developer.android.com/studio/publish/app-signing) - keytool requirements, Play App Signing enrollment, upload key vs app signing key
- [Google Play Console Help - Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756) - mandatory for new apps, upload key reset process
- [React Native docs - signed APK](https://reactnative.dev/docs/signed-apk-android) - verified keytool command parameters

### Secondary (MEDIUM confidence)

- [dev.to/supersuman - Build and Sign Android Apps with GitHub Actions](https://dev.to/supersuman/build-and-sign-android-apps-using-github-actions-54j) - complete workflow pattern with base64 decode, signingConfigs, artifact upload
- [riptutorial - Gradle signingConfigs with env vars](https://riptutorial.com/android-gradle/example/18658/define-the-signing-configuration-setting-environment-variables) - System.getenv() pattern
- [GitHub Gist mreichelt - build.gradle with env vars](https://gist.github.com/mreichelt/9be80545bb0c1f8c1ea20631c5dd1460) - conditional signing config pattern
- [r0adkll/sign-android-release Issue #66](https://github.com/r0adkll/sign-android-release/issues/66) - confirmed action is abandoned

### Tertiary (LOW confidence)

None -- all findings verified against multiple sources.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Gradle signing is well-documented, stable API, no version-sensitive changes
- Architecture: HIGH - Existing staging workflow provides exact template; signing config is a well-established pattern
- Pitfalls: HIGH - Common issues are well-documented across multiple sources; conditional guard pattern is standard

**Research date:** 2026-03-21
**Valid until:** Indefinite -- Android signing infrastructure is stable and changes rarely
