---
phase: 86-qr-promo-free-month-campaign
plan: 02
subsystem: infra
tags: [nuxt, qr-code, redirect, static-site, promo]

requires:
  - phase: 29-nuxt-scaffold-infrastructure
    provides: Nuxt project scaffold with routeRules pattern
provides:
  - QR redirect route rules for /qr/bcn and /qr/aura-club
  - QR PNG images for both promo codes (print-ready)
  - Reproducible QR generation script
affects: [86-qr-promo-free-month-campaign]

tech-stack:
  added: []
  patterns: [nuxt-routerules-302-redirect-for-temporary-campaigns]

key-files:
  created:
    - el-templo-web/public/qr/TEMPLOPASSBCN.png
    - el-templo-web/public/qr/AURACLUB1.png
    - el-templo-web/scripts/generate-qr.py
  modified:
    - el-templo-web/nuxt.config.ts

key-decisions:
  - "302 (temporary) redirects for promo QR URLs since campaigns are time-limited"
  - "QR codes encode eltemplo.org redirect URLs (not final destination) for future-proof redirect changes"
  - "Python generate-qr.py script for reproducibility instead of one-time inline generation"

patterns-established:
  - "QR promo redirect pattern: /qr/{slug} -> 302 to app.eltemplo.org/register?promo={CODE}"

requirements-completed: [QR-01, QR-03]

duration: 2min
completed: 2026-03-27
---

# Phase 86 Plan 02: QR Redirects & Images Summary

**Nuxt routeRules 302 redirects for /qr/bcn and /qr/aura-club with 1184px print-ready QR PNG images in brand charcoal**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-27T17:22:13Z
- **Completed:** 2026-03-27T17:24:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Two 302 redirect route rules in nuxt.config.ts for QR promo URLs
- Two 1184x1184px QR PNG images using brand charcoal (#2e2a26) on white, suitable for print
- Reproducible Python generation script at el-templo-web/scripts/generate-qr.py
- Verified existing static redirect pattern generates meta-refresh HTML files

## Task Commits

Each task was committed atomically:

1. **Task 1: Add QR redirect route rules in Nuxt config** - `0dc02149` (feat)
2. **Task 2: Generate QR PNG images for both promo codes** - `3bda5135` (feat)

## Files Created/Modified
- `el-templo-web/nuxt.config.ts` - Added /qr/bcn and /qr/aura-club 302 redirect route rules
- `el-templo-web/public/qr/TEMPLOPASSBCN.png` - QR image encoding https://eltemplo.org/qr/bcn
- `el-templo-web/public/qr/AURACLUB1.png` - QR image encoding https://eltemplo.org/qr/aura-club
- `el-templo-web/scripts/generate-qr.py` - Reproducible QR generation script

## Decisions Made
- Used 302 (temporary) status code for redirects since promo campaigns are time-limited, not permanent
- QR codes encode the eltemplo.org redirect URLs (not final app destination) so redirects can be changed without regenerating QR codes
- Used Python qrcode + Pillow for generation (system tool, not project dependency) since qrencode CLI was not available
- High error correction (ERROR_CORRECT_H) for reliable scanning from printed flyers
- Added generate-qr.py script for reproducibility rather than relying on one-time inline commands

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Nuxt build could not run in worktree (no node_modules installed), but redirect pattern was verified by inspecting existing static output from previous builds (curso-entrenadores generates meta-refresh HTML file)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- QR redirect URLs ready for deployment with next el-templo-web build
- QR PNG images ready for designer to incorporate into flyers
- Remaining plans in phase 86 can proceed: promo plan schema (86-01), registration flow (86-03), member app changes (86-04), admin UI (86-05), integration tests (86-06)

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 86-qr-promo-free-month-campaign*
*Completed: 2026-03-27*
