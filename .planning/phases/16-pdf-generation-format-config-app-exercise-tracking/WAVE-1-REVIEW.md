# Phase 16 — Wave 1 Review & Testing Guide

**Date:** 2026-02-10
**Status:** Wave 1 complete (6/10 plans). Wave 2 pending your approval.
**Resume:** Run `/gsd:execute-phase 16` to continue with Wave 2 (plans 02, 06, 09)

---

## What was built (15 commits)

### 16-01: FormatParams Type System
**Files changed:**
- `el-templo-api/src/modules/admin/format-params.ts` (NEW) — discriminated union types + default factory
- `el-templo-api/src/modules/sessions/types.ts` — FormatParams type added
- `el-templo-api/src/modules/sessions/pipeline/context.ts` — BlockContextComplete gets formatParams
- `el-templo-api/src/modules/sessions/pipeline/stage-7-prescription.ts` — populates formatParams during generation
- `el-templo-api/src/modules/sessions/pipeline/initium-pipeline.ts` — INITIUM gets formatParams too
- `el-templo-api/src/modules/sessions/pipeline/index.ts` — wiring
- `el-templo-api/src/modules/sessions/service.ts` — writes formatParams to DB

**What it does:** The `formatParams` JSON column on `session_blocks` was always null. Now every generated block gets populated with sensible defaults — AMRAP gets `{ type: 'amrap', minutes: 10 }`, EMOM gets `{ type: 'emom', intervalMinutes: 1, totalMinutes: 10 }`, Complex gets `{ type: 'complex', rounds: 3 }`, etc.

**How to test:**
1. Start the API server
2. Generate a new session week from admin (e.g., week 99)
3. Check the database: `SELECT formatParams FROM session_blocks WHERE dayId LIKE 'W99%' LIMIT 10;`
4. Verify formatParams is no longer null — each block should have a JSON object with a `type` field

---

### 16-03: Category-Based Exercise Swap
**Files changed:**
- `el-templo-api/src/modules/admin/edit-service.ts` — adds `category` to pool query results
- `el-templo-admin/src/types/session.ts` — `category: string` added to PoolExercise
- `el-templo-admin/src/components/sessions/ExerciseSwapDialog.vue` — category pills replace first-word grouping

**What it does:** The exercise swap dialog used to group exercises by the first word of their name (e.g., "HT", "P.U", "LUNGE") which produced 30+ tiny groups. Now it uses the `category` field from the exercises table ("Press", "Sentadilla", "Tiron") — fewer, more meaningful pills.

**How to test:**
1. Start admin + API
2. Go to any session edit page
3. Click swap (exchange icon) on any exercise
4. Check the filter section:
   - Should say "Categoria" (not "Patron")
   - Pills should be semantic categories like "Press", "Sentadilla", "Tiron", "Empuje"
   - Should be roughly 10-15 pills (not 30+)
5. Click a category pill — exercises should filter correctly
6. Verify contraction filter still works alongside category

---

### 16-04: Inline Prescription Edit Fix
**Files changed:**
- `el-templo-admin/src/components/sessions/EditableBlockCard.vue` — `Object.assign` instead of `emit('refresh')`

**What it does:** Previously, editing reps/rest/notes on an exercise triggered `emit('refresh')` which reloaded the entire session and reset scroll position. Now it uses `Object.assign(exercise, payload.fields)` for a targeted reactive update — no reload, no scroll jump, just a green toast.

**How to test:**
1. Go to session edit page with multiple blocks
2. Scroll down to a block that's NOT at the top
3. Edit the reps value on an exercise, then blur (click away)
4. Verify: green toast appears, value updates, **scroll position does NOT change**
5. Repeat for rest, seconds, and notes fields
6. Verify that structural changes (swap exercise, remove exercise, change format) still trigger a full refresh (they should)

---

### 16-05: Per-Exercise Completion Store
**Files changed:**
- `el-templo-app/src/modules/training/stores/sessionPlayerStore.ts` — `completedExercises` field in SessionProgress
- `el-templo-app/src/modules/training/composables/useSessionPlayer.ts` — toggle/check methods, auto-advance

**What it does:** The member app previously tracked completion at block level only (`completedBlocks: BlockRole[]`). Now it tracks individual exercises via `completedExercises: Record<blockRole, prescriptionId[]>`. When all exercises in a block are completed, the block auto-completes and advances.

**How to test:** (Needs 16-06 UI for full testing — that's Wave 2)
- This is the data/logic layer only. The UI toggles come in plan 16-06.
- For now, verify the app still builds: `cd el-templo-app && npx quasar build`
- Verify existing block completion ("Listo" button) still works normally

---

### 16-07: Saved Blocks for Coach Reuse
**Files changed:**
- `el-templo-api/src/db/schema/saved-blocks.ts` (NEW) — saved_blocks table schema
- `el-templo-api/src/modules/admin/routes.ts` — POST/GET/DELETE endpoints
- `el-templo-admin/src/components/sessions/EditableBlockCard.vue` — bookmark_add button + save dialog

**What it does:** Coaches can save any block with a custom name. Clicking the bookmark icon opens a dialog with a default name like "NUCLEUS - AMRAP". Saved blocks are per-coach (scoped by createdBy). API endpoints: POST/GET/DELETE `/admin/saved-blocks`.

**How to test:**
1. Go to session edit page
2. Look for a bookmark icon (bookmark_add) in the block header, next to the swap button
3. Click it — a dialog should appear with a name input (pre-filled with "ROLE - FORMAT")
4. Edit the name and click save
5. Verify: success toast
6. **DB check:** The saved_blocks table needs to exist. Run the migration or check if it was auto-created.
   - If the table doesn't exist yet, you'll need to run: `cd el-templo-api && npx drizzle-kit push`
7. Test listing: The GET endpoint should return your saved blocks
8. Test delete: The DELETE endpoint should remove a saved block

**Note:** The migration for `saved_blocks` table may need to be applied manually.

---

### 16-08: PDF Builder (pdfmake)
**Files changed:**
- `el-templo-admin/package.json` — pdfmake@0.2.15 + @types/pdfmake added
- `el-templo-admin/src/utils/pdf/pdf-assets.ts` (NEW, ~174KB) — base64 logo, icon, Cinzel fonts
- `el-templo-admin/src/utils/pdf/pdf-types.ts` (NEW) — PdfDaySession, PdfBlockPage, PdfLevelBlock, PdfExercise
- `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` (NEW, ~467 lines) — complete PDF builder

**What it does:** Client-side PDF generation matching the example design. 6-page structure per day: cover (logo) → INITIUM (exercise list) → NUCLEUS (2x2 level grid) → DEUTEROS (two blocks stacked) → EPIKOS/ATHLOS (level grid) → closing (quote). Uses Cinzel font, El Templo brand colors, Greek symbols (α Δ Σ Ω), landscape A4.

**How to test:** (Needs 16-09 button wiring for full testing — that's Wave 2)
- For now, verify the admin app builds: `cd el-templo-admin && npx quasar build`
- The actual download button comes in plan 16-09
- You can test manually by importing in browser console if curious:
  ```js
  import { buildDayPdf } from 'src/utils/pdf/session-pdf-builder';
  // Call with mock PdfDaySession data
  ```

---

## Quick build check

Run these to verify nothing is broken:

```bash
# API
cd el-templo-api && npx tsc --noEmit

# Admin app
cd el-templo-admin && npx quasar build

# Member app
cd el-templo-app && npx quasar build
```

---

## What's next (Wave 2)

Once you approve Wave 1, three more plans execute:

| Plan | Depends on | What it adds |
|------|-----------|--------------|
| **16-02** | 16-01 | Format params editing UI — coach can edit AMRAP minutes, EMOM intervals, etc. in session edit page |
| **16-06** | 16-05 | Per-exercise completion UI — tap-to-complete circles on exercises in DayPlayer, visual feedback |
| **16-09** | 16-08 | "Descargar PDF" button on SessionDetailPage — wires the builder to the UI |

Then **Wave 3** is just plan 16-10: end-to-end human verification of all 11 success criteria.
