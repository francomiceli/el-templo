# Security Dependency Audit Report

**Date:** 2026-04-06
**Scope:** el-templo-api, el-templo-bot
**Auditor:** Automated (Claude Code)

---

## Check 1 -- Dependency Inventory

### el-templo-api (17 deps + 7 devDeps)

**Dependencies:**

| Package | Version (package.json) |
| --- | --- |
| @anthropic-ai/sdk | ^0.78.0 |
| @aws-sdk/client-s3 | ^3.994.0 |
| @aws-sdk/s3-request-presigner | ^3.994.0 |
| @faker-js/faker | ^10.3.0 |
| @fastify/cors | ^11.2.0 |
| @fastify/jwt | ^10.0.0 |
| @sentry/node | ^10.38.0 |
| argon2 | ^0.44.0 |
| csv-parse | ^6.1.0 |
| dotenv | ^17.2.3 |
| drizzle-orm | ^0.45.1 |
| fastify | ^5.7.4 |
| fastify-plugin | ^5.1.0 |
| mysql2 | ^3.16.1 |
| node-cron | ^4.2.1 |
| pino | ^10.3.0 |
| pino-pretty | ^13.1.3 |
| resend | ^6.9.3 |

**Dev Dependencies:**

| Package | Version |
| --- | --- |
| @types/node | ^25.0.10 |
| @types/node-cron | ^3.0.11 |
| drizzle-kit | ^0.31.9 |
| eslint | ^9.39.2 |
| prettier | ^3.8.1 |
| tsx | ^4.21.0 |
| typescript | ^5.9.3 |
| vitest | ^4.0.18 |

### el-templo-bot (10 deps + 4 devDeps)

**Dependencies:**

| Package | Version (package.json) |
| --- | --- |
| @anthropic-ai/sdk | ^0.78.0 |
| dotenv | ^17.2.3 |
| drizzle-orm | ^0.45.1 |
| fastify | ^5.7.4 |
| ioredis | ^5.6.1 |
| mysql2 | ^3.16.1 |
| node-cron | ^4.2.1 |
| openai | ^4.85.0 |
| pino | ^10.3.0 |
| pino-pretty | ^13.1.3 |

**Dev Dependencies:**

| Package | Version |
| --- | --- |
| @types/node | ^25.0.10 |
| @types/node-cron | ^3.0.11 |
| tsx | ^4.21.0 |
| typescript | ^5.9.3 |
| vitest | ^4.1.0 |

---

## Check 2 -- Known Vulnerability Detection

### el-templo-api: 24 vulnerabilities (1 critical, 12 high, 10 moderate, 1 low)

| Severity | Package | Vulnerable Version | Path | Advisory |
| --- | --- | --- | --- | --- |
| **CRITICAL** | fast-jwt | <=6.1.0 | @fastify/jwt > fast-jwt | [GHSA-mvf2-f6gm-w987](https://github.com/advisories/GHSA-mvf2-f6gm-w987) -- JWT Algorithm Confusion via Whitespace-Prefixed RSA Public Key |
| HIGH | fast-jwt | <=6.1.0 | @fastify/jwt > fast-jwt | [GHSA-hm7r-c7qw-ghp6](https://github.com/advisories/GHSA-hm7r-c7qw-ghp6) -- Accepts unknown `crit` header extensions (RFC 7515 violation) |
| HIGH | minimatch | <3.1.3 | eslint > minimatch | [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) -- ReDoS via repeated wildcards |
| HIGH | minimatch | >=9.0.0 <9.0.6 | @sentry/node > minimatch | [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) -- ReDoS via repeated wildcards |
| HIGH | minimatch | >=9.0.0 <9.0.6 | @sentry/node > minimatch | ReDoS via multiple non-adjacent GLOBSTAR segments |
| HIGH | minimatch | <3.1.3 | eslint > minimatch | ReDoS via multiple non-adjacent GLOBSTAR segments |
| HIGH | rollup | >=4.0.0 <4.59.0 | vitest > vite > rollup | [GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc) -- Arbitrary File Write via Path Traversal |
| HIGH | picomatch | >=4.0.0 <4.0.4 | vitest > picomatch | [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) -- ReDoS via extglob quantifiers |
| HIGH | flatted | <=3.4.1 | eslint > file-entry-cache > flat-cache > flatted | [GHSA-rf6f-7fwh-wjgh](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh) -- Prototype Pollution via parse() |
| HIGH | fast-xml-parser | >=5.0.0 <5.5.6 | @aws-sdk/client-s3 > ... > fast-xml-parser | [GHSA-8gc5-j5rx-235r](https://github.com/advisories/GHSA-8gc5-j5rx-235r) -- Numeric entity expansion bypassing limits |
| HIGH | fast-xml-parser | >=5.0.0 <5.3.8 | @aws-sdk/client-s3 > ... > fast-xml-parser | Entity expansion attack |
| HIGH | flatted | <=3.4.1 | eslint > file-entry-cache > flat-cache > flatted | [GHSA-25h7-pfq9-p65f](https://github.com/advisories/GHSA-25h7-pfq9-p65f) -- Prototype Pollution |
| MODERATE | esbuild | <=0.24.2 | drizzle-kit > @esbuild-kit > esbuild | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) -- Dev server CORS allows any origin |
| MODERATE | fastify | <=5.8.2 | fastify (direct) | [GHSA-444r-cwp2-x5xf](https://github.com/advisories/GHSA-444r-cwp2-x5xf) -- request.protocol/host spoofable via X-Forwarded headers |
| MODERATE | ajv | (various) | fastify > @fastify/ajv-compiler > ajv | Prototype Pollution |
| MODERATE | ajv | (various) | eslint > ajv | Prototype Pollution |
| MODERATE | picomatch | >=4.0.0 <4.0.4 | vitest > picomatch | [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p) -- Method Injection in POSIX Character Classes |
| MODERATE | bn.js | (various) | @fastify/jwt > fast-jwt > asn1.js > bn.js | Information leak |
| MODERATE | brace-expansion | (various) | eslint > minimatch > brace-expansion | ReDoS |
| MODERATE | brace-expansion | (various) | @sentry/node > minimatch > brace-expansion | ReDoS |
| MODERATE | minimatch | (various) | eslint > minimatch | ReDoS (additional pattern) |
| MODERATE | minimatch | (various) | @sentry/node > minimatch | ReDoS (additional pattern) |
| LOW | fast-xml-parser | >=5.0.0 <5.3.8 | @aws-sdk/client-s3 > ... > fast-xml-parser | [GHSA-fj3w-jwp8-x2g3](https://github.com/advisories/GHSA-fj3w-jwp8-x2g3) -- Stack overflow in XMLBuilder |

**Key concern:** The `fast-jwt` CRITICAL vulnerability (CVE-2023-48223 incomplete fix) affects the JWT library used by `@fastify/jwt` -- the main authentication mechanism for the API. The patched version is listed as `<0.0.0` meaning NO patched version exists yet. This requires monitoring or switching JWT libraries.

### el-templo-bot: 3 vulnerabilities (0 critical, 1 high, 2 moderate)

| Severity | Package | Vulnerable Version | Path | Advisory |
| --- | --- | --- | --- | --- |
| HIGH | picomatch | >=4.0.0 <4.0.4 | vitest > picomatch | [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) -- ReDoS via extglob quantifiers |
| MODERATE | fastify | <=5.8.2 | fastify (direct) | [GHSA-444r-cwp2-x5xf](https://github.com/advisories/GHSA-444r-cwp2-x5xf) -- request.protocol/host spoofable |
| MODERATE | picomatch | >=4.0.0 <4.0.4 | vitest > picomatch | [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p) -- Method Injection |

---

## Check 3 -- Axios Supply Chain Check

**Result: PASS (GREEN)**

- axios is NOT a direct dependency in either `el-templo-api` or `el-templo-bot`
- axios does NOT appear in either lockfile
- `plain-crypto-js` was NOT found in either lockfile
- No supply chain compromise risk from the known axios malicious versions (1.14.1, 0.30.4)

---

## Check 4 -- Phantom Dependencies

### el-templo-api

**Unused dependencies:**
- `pino-pretty` -- likely used only via CLI/dev, but listed as production dep

**Unused devDependencies:**
- `eslint` -- may be run from root or not configured
- `prettier` -- may be run from root via lint-staged

**Missing dependencies:** None detected

### el-templo-bot

**Unused dependencies:**
- `pino-pretty` -- likely used only via CLI/dev transport

**Missing dependencies:** None detected

---

## Check 5 -- Dangerous Version Ranges

**No `*`, `latest`, or `>=` ranges found in either package.**

**`^` (caret) ranges on security-critical dependencies:**

| Package | Range | Used In | Risk |
| --- | --- | --- | --- |
| @anthropic-ai/sdk | ^0.78.0 | API, Bot | Low -- SDK, not auth |
| @fastify/cors | ^11.2.0 | API | MEDIUM -- CORS is security-critical |
| @fastify/jwt | ^10.0.0 | API | HIGH -- JWT auth library |
| argon2 | ^0.44.0 | API | MEDIUM -- password hashing |
| dotenv | ^17.2.3 | API, Bot | Low |
| drizzle-orm | ^0.45.1 | API, Bot | MEDIUM -- ORM with query generation |
| fastify | ^5.7.4 | API, Bot | HIGH -- core framework |
| mysql2 | ^3.16.1 | API, Bot | MEDIUM -- database driver |
| openai | ^4.85.0 | Bot | Low -- SDK |

**Recommendation:** Consider pinning `@fastify/jwt`, `fastify`, and `argon2` to exact versions. Caret ranges allow minor version bumps that could introduce breaking changes or vulnerabilities in security-critical paths.

---

## Check 6 -- Lockfile Verification

| Package | `pnpm install --frozen-lockfile` | Status |
| --- | --- | --- |
| el-templo-api | Completed successfully | PASS |
| el-templo-bot | Completed successfully | PASS |

Both lockfiles are consistent with their respective `package.json` files.

---

## Check 7 -- Lifecycle Scripts

### el-templo-api

No packages with `postinstall` or `preinstall` scripts found in `node_modules/` (searched to depth 3).

### el-templo-bot

No packages with `postinstall` or `preinstall` scripts found in `node_modules/` (searched to depth 3).

**Note:** pnpm blocks lifecycle scripts by default unless explicitly approved (`pnpm approve-builds`). The bot's `pnpm install` output confirmed this behavior is active: "Run pnpm approve-builds to pick which dependencies should be allowed to run scripts." This is a good security posture.

---

## Check 8 -- Sensitive Files Exposed

### Git-tracked sensitive files

`git ls-files | grep -E '\.(env|pem|key|p12|jks|keystore)$'` returned:

- `.env` -- **WARNING: A `.env` file is tracked by git at the repository root**

**However:** The root `.env` file needs investigation. The `.gitignore` has `.env` listed, but an existing tracked file is NOT removed by adding it to `.gitignore`. This file may contain secrets committed before the gitignore rule was added.

### .gitignore coverage

The `.gitignore` covers:
- `.env` -- present
- `deploy/.aws-vars` -- present
- `deploy/.credentials` -- present

**Missing from .gitignore:**
- `*.pem` -- NOT covered
- `*.key` -- NOT covered
- `*.p12` -- NOT covered
- `*.jks` -- NOT covered
- `*.keystore` -- NOT covered

**Note:** `el-templo-bot/.env` appears as untracked in git status, confirming the `.gitignore` is working for new `.env` files. But the root `.env` being tracked is a concern.

---

## Check 9 -- NPM/PNPM Security Config

### Root `.npmrc`

**NOT FOUND** -- No root-level `.npmrc` exists.

### el-templo-api `.npmrc`

```
enable-pre-post-scripts=true
```

**Missing recommended settings:**
- `ignore-scripts=true` -- Not set (opposite: pre/post scripts are explicitly enabled)
- `engine-strict=true` -- Not set
- No `auto-install-peers` or `strict-peer-dependencies` configured

### el-templo-bot `.npmrc`

**NOT FOUND** -- No `.npmrc` exists.

**Recommendations (do NOT create -- report only):**
1. Add a root `.npmrc` with `engine-strict=true`
2. Consider whether `enable-pre-post-scripts=true` in API is necessary (it weakens pnpm's default script blocking)
3. Add `strict-peer-dependencies=true` to catch peer dependency mismatches

---

## Check 10 -- Executive Summary

| # | Check | el-templo-api | el-templo-bot | Notes |
| --- | --- | --- | --- | --- |
| 1 | Dependency Inventory | 17+7 | 10+4 | Inventoried |
| 2 | Known Vulnerabilities | RED (24 vulns, 1 critical) | YELLOW (3 vulns, 0 critical) | fast-jwt critical has NO patch available |
| 3 | Axios Supply Chain | GREEN | GREEN | Not installed |
| 4 | Phantom Dependencies | YELLOW (3 unused) | YELLOW (1 unused) | pino-pretty in both |
| 5 | Dangerous Ranges | YELLOW | YELLOW | ^ on security-critical deps |
| 6 | Lockfile Verification | GREEN | GREEN | Both pass |
| 7 | Lifecycle Scripts | GREEN | GREEN | pnpm blocks by default |
| 8 | Sensitive Files | RED | GREEN | Root .env tracked in git |
| 9 | NPM/PNPM Config | YELLOW | YELLOW | Missing .npmrc settings |

### Priority Actions

**RED -- Immediate attention required:**

1. **fast-jwt CRITICAL vulnerability (el-templo-api):** The JWT library used by `@fastify/jwt` has an unpatched critical vulnerability (algorithm confusion). No patched version exists (`<0.0.0`). Consider:
   - Monitoring the `fast-jwt` repo for a fix
   - Evaluating migration to `jose` library as an alternative
   - Ensuring RSA keys are not used with HMAC algorithms in current configuration
   - Check if `@fastify/jwt` has released a version that uses a different JWT library

2. **Root `.env` tracked by git:** A `.env` file at the repository root is tracked by git. Even though `.gitignore` now lists `.env`, previously committed files remain tracked. Action: `git rm --cached .env` then commit. Audit the file contents for exposed secrets and rotate any found.

**YELLOW -- Address when possible:**

3. **Fastify protocol/host spoofing (both packages):** Upgrade fastify to >=5.8.3 to fix CVE-2026-3635. Only affects apps using `trustProxy` with restrictive trust functions.

4. **Transitive vulnerabilities via eslint/vitest (el-templo-api):** Many vulnerabilities come through `eslint` (minimatch, flatted, ajv, brace-expansion) and `vitest` (rollup, picomatch). These are dev-time only and do not affect production. Upgrading eslint and vitest to latest versions should resolve most.

5. **AWS SDK transitive vulns (el-templo-api):** `fast-xml-parser` vulnerabilities via `@aws-sdk/client-s3`. Upgrade `@aws-sdk/client-s3` to latest to pull in patched transitive deps.

6. **Pin security-critical dependencies:** Consider exact versions for `@fastify/jwt`, `fastify`, `argon2` instead of caret ranges.

7. **Add `.npmrc` security settings:** Create root `.npmrc` with `engine-strict=true`. Evaluate whether `enable-pre-post-scripts=true` is necessary in the API package.

8. **Add credential file patterns to `.gitignore`:** Add `*.pem`, `*.key`, `*.p12`, `*.jks`, `*.keystore` patterns.

9. **Clean up phantom deps:** Move `pino-pretty` to devDependencies in both packages (it's a dev/CLI transport, not needed in production).

---

*Report generated 2026-04-06. Re-run periodically to catch new advisories.*
