---
phase: 97-rom-mode-saturday-mobility
plan: 03
subsystem: member-app
tags: [rom-mode, member-app, day-card, session-player, block-colors, types]
dependency_graph:
  requires: [97-01]
  provides: [rom-member-ui, rom-block-flow, rom-type-safety]
  affects: [DayCard, BlockCard, DayPlayer, useSessionPlayer, blockColors, session-types]
tech_stack:
  added: []
  patterns: [hasDeuterosBlocks-gate-for-rom-vs-regular, isRomSession-computed-for-card-display]
key_files:
  created: []
  modified:
    - el-templo-app/src/modules/training/types/session.ts
    - el-templo-app/src/modules/training/utils/blockColors.ts
    - el-templo-app/src/modules/training/components/DayCard.vue
    - el-templo-app/src/modules/training/components/BlockCard.vue
    - el-templo-app/src/modules/training/composables/useSessionPlayer.ts
    - el-templo-app/src/modules/training/pages/DayPlayer.vue
decisions:
  - "hasDeuterosBlocks computed gates all Deuteros-specific logic in useSessionPlayer (D-29, D-30)"
  - "isSessionComplete uses dynamic playableBlocks.length instead of hardcoded 4 for ROM sessions"
  - "ROM_BLOCK_NAMES defined only in BlockCard formatRole (not duplicated in DayCard)"
  - "DayPlayer BLOCK_NAMES extended for ROM zone names in transition screens"
metrics:
  duration: 4min
  completed: "2026-04-09T01:36:53Z"
  tasks: 2
  files: 6
---

# Phase 97 Plan 03: Member App ROM Display + Session Player Summary

Frontend types extended with ROM block roles, block colors mapped to aged-gold theme, DayCard shows ROM badge and 'Movilidad' subtitle with 3 sequential blocks, and useSessionPlayer handles ROM block flow without Deuteros selector.

## What Was Built

### Task 1: Frontend Types + Block Colors

**Type extensions (session.ts):**
- `BlockRole` union extended with `ROM_LOWER`, `ROM_CORE`, `ROM_UPPER`
- `Session` interface includes optional `sessionMode` field (`'regular' | 'rom'`)

**Block colors (blockColors.ts):**
- `getBlockColorClass()`: ROM roles map to `block-bg--default` (aged-gold subtle gradient)
- `getBlockAccentColor()`: ROM roles map to `secondary` (Aged Gold)
- `getBlockCSSColor()`: ROM roles map to `BRAND_AGED_GOLD`
- `getBlockHeaderGradient()`: ROM roles naturally fall through to aged gold gradient (if/else, not Record)

**BlockCard exhaustiveness fix (Rule 3):**
- `formatRole()` Record extended with ROM zone display names: Tren Inferior, Zona Media, Tren Superior

**DayPlayer block names:**
- `BLOCK_NAMES` map extended with ROM zone names for transition screens

### Task 2: DayCard ROM Display + useSessionPlayer ROM Flow

**DayCard (DayCard.vue):**
- `isRomSession` computed: detects ROM sessions via `blocks.some(b => b.role.startsWith('ROM_'))`
- ROM badge: `<q-badge color="info" label="ROM" class="q-ml-xs" />` next to day name
- Route subtitle: returns `'Movilidad'` for ROM sessions instead of route name
- `groupedBlocks`: ROM sessions return all blocks as sequential items (no BlockChoiceCard)

**useSessionPlayer (useSessionPlayer.ts):**
- `hasDeuterosBlocks` computed: checks for DEUTEROS_1/DEUTEROS_2 presence
- `playableBlocks`: non-Deuteros sessions return all blocks sorted by sortOrder
- `needsDeuterosChoice`: returns false when no Deuteros blocks present
- `progress`: uses dynamic `playableBlocks.length` for non-Deuteros sessions
- `isSessionComplete`: uses dynamic block count instead of hardcoded 4

**DayPlayer verification:** No changes needed -- Deuteros choice UI is gated by `needsDeuterosChoice` (false for ROM), and block transition/completion logic works with any BlockRole values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed BlockCard formatRole Record exhaustiveness**
- **Found during:** Task 1
- **Issue:** `Record<BlockRole, string>` in BlockCard.vue formatRole() was incomplete after adding ROM roles to BlockRole union, causing TypeScript error
- **Fix:** Added ROM_LOWER/ROM_CORE/ROM_UPPER entries with Spanish zone display names
- **Files modified:** BlockCard.vue
- **Commit:** 8bde46bf

**2. [Rule 2 - Missing functionality] Added ROM zone names to DayPlayer BLOCK_NAMES**
- **Found during:** Task 1
- **Issue:** DayPlayer.vue BLOCK_NAMES map (Record<string, string>) would show raw role names (ROM_LOWER) in transition screens instead of Spanish zone names
- **Fix:** Added ROM_LOWER/ROM_CORE/ROM_UPPER entries with zone display names
- **Files modified:** DayPlayer.vue
- **Commit:** 8bde46bf

**3. [Rule 1 - Bug] Fixed isSessionComplete hardcoded block count**
- **Found during:** Task 2
- **Issue:** `isSessionComplete` hardcoded `>= 4` for session completion, but ROM sessions have 3 blocks
- **Fix:** Added `hasDeuterosBlocks` check to use dynamic `playableBlocks.length` for non-Deuteros sessions
- **Files modified:** useSessionPlayer.ts
- **Commit:** 442aa180

## Verification

- TypeScript: No new errors in modified files (all errors are pre-existing missing node_modules in worktree)
- BlockRole exhaustiveness: All Record<BlockRole, string> maps include ROM entries
- DayCard: isRomSession computed, ROM badge with info color, Movilidad subtitle
- useSessionPlayer: hasDeuterosBlocks gate, ROM flow branch, dynamic progress/completion

## Self-Check: PASSED

- [x] el-templo-app/src/modules/training/types/session.ts exists
- [x] el-templo-app/src/modules/training/utils/blockColors.ts exists
- [x] el-templo-app/src/modules/training/components/DayCard.vue exists
- [x] el-templo-app/src/modules/training/components/BlockCard.vue exists
- [x] el-templo-app/src/modules/training/composables/useSessionPlayer.ts exists
- [x] el-templo-app/src/modules/training/pages/DayPlayer.vue exists
- [x] Commit 8bde46bf exists (Task 1)
- [x] Commit 442aa180 exists (Task 2)
