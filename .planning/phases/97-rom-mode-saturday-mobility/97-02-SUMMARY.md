---
phase: 97-rom-mode-saturday-mobility
plan: 02
subsystem: admin
tags: [rom-mode, admin-ui, pdf-generation, session-editing]
dependency_graph:
  requires: [rom-generator, day-modes-table, session-mode-column, day-modes-api]
  provides: [rom-admin-display, rom-block-editing, rom-pdf-layout, day-mode-toggles]
  affects: [SessionsPage, EditableBlockCard, ExerciseSwapDialog, session-pdf-builder, session-data-transformer]
tech_stack:
  added: []
  patterns: [rom-detection-via-sessionMode, 2-row-stacked-pdf-layout, zone-name-display-mapping]
key_files:
  created: []
  modified:
    - el-templo-admin/src/pages/SessionsPage.vue
    - el-templo-admin/src/components/sessions/EditableBlockCard.vue
    - el-templo-admin/src/components/sessions/ExerciseSwapDialog.vue
    - el-templo-admin/src/utils/pdf/session-pdf-builder.ts
    - el-templo-admin/src/utils/pdf/session-data-transformer.ts
    - el-templo-admin/src/utils/pdf/pdf-types.ts
decisions:
  - "ROM block color uses blue-grey-7 to distinguish from regular block roles"
  - "isDayRom removed as unused; isDayGroupRom checks session data directly"
  - "ROM PDF uses full-width stacked tiers (BASICO/AVANZADO) instead of 2x2 grid"
  - "Format subtitle hardcoded as 'For Quality . 3 Rondas . Descanso 30s' matching ROM spec"
metrics:
  duration: 6min
  completed: "2026-04-09T01:39:00Z"
  tasks: 2
  files: 6
---

# Phase 97 Plan 02: Admin ROM Mode UI Summary

Admin UI for ROM mode: day mode toggles, ROM badge display, 2-level ROM days, Spanish zone names in block editing, exercise swap zone filtering, and PDF 2-row stacked BASICO/AVANZADO layout.

## What Was Built

### Task 1: SessionsPage ROM Display + Day Mode Toggles

**Day mode toggles section:**
- Added below week selector in General tab with 6 day toggles (Lun-Sab)
- Auto-save via `PUT /admin/sessions/day-modes` on toggle change
- Success toast ("Configuracion de dias actualizada") and error handling
- `dayModesSaving` ref disables toggles during save

**ROM badge on day cards:**
- `isDayGroupRom()` checks if any session in day group has `sessionMode === 'rom'`
- Blue info badge ("ROM") appears after day name when detected

**2-level ROM display:**
- `ROM_DISPLAY_LEVELS = ['alfa', 'delta']` replaces full 5-level list for ROM days
- `dayGroups` computed detects ROM days and filters display levels accordingly
- Zone names in route summary come from API (handled in Plan 01)

### Task 2: ROM Block Editing + Exercise Swap + PDF 2-Row Layout

**EditableBlockCard:**
- `ROLE_DISPLAY_NAMES` maps ROM_LOWER/ROM_CORE/ROM_UPPER to TREN INFERIOR/ZONA MEDIA/TREN SUPERIOR
- `displayRoleName` computed replaces raw role code in header
- `isRomBlock` computed hides DESCANSO ACTIVO section for ROM blocks
- ROM block color: `blue-grey-7` (distinct from regular brown/orange palette)

**ExerciseSwapDialog:**
- New `romZone` prop (optional string) for body-zone indicator
- `ROM_ZONE_LABELS` maps ROM roles to display names
- Zone badge shown in dialog header when `romZone` is provided

**PDF data transformer:**
- ROM detection: checks if any session block has role starting with `ROM_`
- ROM path: builds 3 zone blocks with 2 tiers (alfa=BASICO, delta=AVANZADO)
- Zone labels: TREN INFERIOR/ZONA MEDIA/TREN SUPERIOR
- No mobility slot for ROM blocks (per D-10)
- `isRom` flag on PdfBlockPage signals PDF builder

**PDF builder:**
- `buildRomBlockPage()`: 2-row stacked layout per zone
- Zone header in Cinzel Bold with shadow effect
- Format subtitle: "For Quality . 3 Rondas . Descanso 30s"
- Tier labels: BASICO (alfa) / AVANZADO (delta) in Cinzel Bold
- Full-width exercise boxes (ROM_BOX_WIDTH = 3660pt)
- `buildDayContent()` routes ROM days to `buildRomBlockPage` instead of regular block layout

**PdfBlockPage interface:**
- Added `isRom?: boolean` flag for ROM layout detection

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- All 8 acceptance criteria grep checks pass
- No new TypeScript errors (all errors in target files are pre-existing module resolution)
- ROM badge, toggles, 2-level display in SessionsPage template
- DESCANSO ACTIVO hidden for ROM blocks
- PDF builder has buildRomBlockPage with BASICO/AVANZADO labels
- Format subtitle present in PDF builder

## Self-Check: PASSED

- [x] el-templo-admin/src/pages/SessionsPage.vue modified with ROM features
- [x] el-templo-admin/src/components/sessions/EditableBlockCard.vue modified with ROM block editing
- [x] el-templo-admin/src/components/sessions/ExerciseSwapDialog.vue modified with romZone prop
- [x] el-templo-admin/src/utils/pdf/session-pdf-builder.ts modified with buildRomBlockPage
- [x] el-templo-admin/src/utils/pdf/session-data-transformer.ts modified with ROM detection
- [x] el-templo-admin/src/utils/pdf/pdf-types.ts modified with isRom flag
- [x] Commit 7fcf9cb4 exists (Task 1)
- [x] Commit a4678de6 exists (Task 2)
