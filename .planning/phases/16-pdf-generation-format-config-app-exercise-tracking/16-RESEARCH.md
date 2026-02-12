# Phase 16: PDF Generation, Format Config & App Exercise Tracking - Research

**Researched:** 2026-02-10
**Domain:** PDF generation from HTML/CSS, format parameter configuration, per-exercise completion tracking
**Confidence:** HIGH (codebase well-understood, libraries verified)

## Summary

Phase 16 covers four distinct workstreams: (A) client-side PDF generation for approved sessions matching a design template, (B) format-specific parameter configuration that populates the existing but empty `formatParams` JSON column in `session_blocks`, (C) exercise swap UX improvement in the admin app by using the `category` field instead of first-word grouping, and (D) per-exercise completion tracking in the member app to replace the current block-level completion model. There is also (E) a "save block for reuse" feature for coaches and (F) inline prescription edit UX fixes.

The codebase is a monorepo with three packages: `el-templo-api` (Fastify + Drizzle ORM + MySQL), `el-templo-admin` (Quasar/Vue 3), and `el-templo-app` (Quasar/Vue 3 + Capacitor). All editing infrastructure from Phase 15 is complete and functional. The `formatParams` JSON column exists on `session_blocks` but is completely unused -- this phase activates it. The member app's DayPlayer currently tracks completion per-block via `completedBlocks: BlockRole[]` stored in Capacitor Preferences and submitted to the server as an array of role strings. The per-exercise tracking will require changes to both the local persistence model and the server completion endpoint.

For PDF generation, the recommended approach is **pdfmake (v0.2.15) running client-side in the admin app**. The session data is already loaded when the coach views a session — pdfmake builds a declarative JSON document definition and generates the PDF entirely in the browser. Zero server infrastructure needed (no Puppeteer, no Chromium download, no API endpoint). A proof of concept was built at `poc-pdf/generate-full.ts` that successfully replicates the 6-page example PDF design with landscape A4, cream background, 2x2 level grids, and Greek symbols.

**Primary recommendation:** Use pdfmake for client-side PDF generation with embedded Cinzel font and El Templo logo, populate `formatParams` with structured JSON per format type, switch swap dialog from first-word grouping to `category` field, and extend session progress persistence from block-level to exercise-level with auto-advance logic.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pdfmake | ^0.2.15 | Client-side PDF generation via declarative JSON | Lightweight (~2MB), no server infrastructure, proven in PoC. v0.2.15 is stable (v0.3.x has breaking bugs) |
| drizzle-orm | ^0.45.1 | Database ORM (already installed) | Project standard, used throughout |
| fastify | ^5.7.1 | HTTP server (already installed) | Project standard |
| quasar | ^2.16.0 | UI framework (already installed) | Project standard for both admin and member apps |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @capacitor/preferences | ^8.0.0 | Local key-value persistence (already installed) | Per-exercise completion state in member app |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pdfmake | puppeteer | Server-side, 170MB Chromium download, full CSS fidelity but massive overhead for structured data. Overkill for tabular exercise sheets. |
| pdfmake | jspdf | Lower-level API, manual coordinate math, weaker table support. pdfmake's declarative approach is faster to develop. |
| pdfmake | playwright | Same as Puppeteer — server-side headless browser, unnecessary for structured data. |
| pdfmake 0.2.15 | pdfmake 0.3.x | v0.3.x has breaking bugs (canvas processing, async API changes). v0.2.15 is stable. |

**Installation:**
```bash
cd el-templo-admin && pnpm add pdfmake && pnpm add -D @types/pdfmake
```

## Architecture Patterns

### Recommended Project Structure
```
el-templo-admin/src/
  utils/pdf/
    session-pdf-builder.ts     # Core PDF builder using pdfmake (buildWeekPdf, buildDayPdf)
    pdf-assets.ts              # Base64-encoded logo, icon, Cinzel font data
    pdf-types.ts               # PdfDaySession, PdfBlockPage, PdfLevelBlock, PdfExercise
    session-data-transformer.ts # SessionDetail → PdfDaySession conversion
  pages/
    SessionDetailPage.vue      # Add "Descargar PDF" button for approved sessions
  components/sessions/
    ExerciseSwapDialog.vue     # Modify: category pills instead of first-word
    EditableBlockCard.vue      # Extend: formatParams display + save-block button
    EditableExerciseRow.vue    # Fix: green toast only, no scroll reset
    FormatParamsEditor.vue     # NEW: format-specific parameter inputs

el-templo-api/src/
  modules/admin/
    edit-service.ts            # Extend: formatParams CRUD, block save/reuse
    prescribe-service.ts       # Extend: formatParams in prescription context
  db/schema/
    session-blocks.ts          # formatParams already exists (JSON column)
    completed-sessions.ts      # Extend: exercisesCompleted JSON column
    saved-blocks.ts            # NEW: saved blocks for reuse

el-templo-app/src/
  modules/training/
    composables/
      useSessionPlayer.ts     # Extend: per-exercise completion
      useSessionCompletion.ts  # Extend: submit exercisesCompleted
    stores/
      sessionPlayerStore.ts   # Extend: completedExercises in progress
    components/player/
      ExerciseList.vue         # Extend: per-exercise completion checkmarks
    types/session.ts           # Extend: exercise completion types
```

### Pattern 1: Client-Side PDF Generation via pdfmake
**What:** Generate PDF in the browser using pdfmake's declarative JSON document definitions
**When to use:** Whenever a coach clicks "Download PDF" on an approved session
**Example:**
```typescript
// Source: pdfmake docs + PoC at poc-pdf/generate-full.ts
import pdfMake from 'pdfmake/build/pdfmake';
import { CINZEL_REGULAR_BASE64, CINZEL_BOLD_BASE64, LOGO_BASE64 } from './pdf-assets';

// Register custom fonts via virtual file system
pdfMake.vfs = {
  'Cinzel-Regular.ttf': CINZEL_REGULAR_BASE64,
  'Cinzel-Bold.ttf': CINZEL_BOLD_BASE64,
};
pdfMake.fonts = {
  Cinzel: { normal: 'Cinzel-Regular.ttf', bold: 'Cinzel-Bold.ttf' },
  Roboto: { /* pdfmake default */ },
};

// Brand colors from visual guidelines
const BG_CREAM = '#F2EBE1';
const NAVY = '#24364A';
const GOLD = '#B08D6E';

function buildDayPdf(day: PdfDaySession): void {
  const content = buildDayContent(day);
  const doc = {
    content,
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [40, 40, 40, 30],
    background: (currentPage, pageSize) => ({
      canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: BG_CREAM }],
    }),
    defaultStyle: { font: 'Roboto', fontSize: 10, color: NAVY },
  };
  pdfMake.createPdf(doc).download(`El-Templo-S${day.week}-${day.dayName}.pdf`);
}
```

### Pattern 2: Format Parameters as Typed JSON
**What:** Store format-specific configuration in the existing `formatParams` JSON column with per-format type shapes
**When to use:** During session generation and editing when format-specific parameters need to be configured
**Example:**
```typescript
// Each format type has its own parameter shape
interface AmrapParams { minutes: number; }
interface EmomParams { intervalMinutes: number; totalMinutes: number; }
interface ComplexParams { rounds: number; }
interface TabataParams { workSeconds: number; restSeconds: number; rounds: number; }
interface IntervalParams { workSeconds: number; restSeconds: number; rounds: number; }
interface ForTimeParams { timeCap?: number; } // optional time cap in minutes
interface ChipperParams { rounds: number; }
interface BuyInCashOutParams { rounds?: number; }

type FormatParams =
  | { type: 'amrap'; minutes: number }
  | { type: 'emom'; intervalMinutes: number; totalMinutes: number }
  | { type: 'complex'; rounds: number }
  | { type: 'tabata'; workSeconds: number; restSeconds: number; rounds: number }
  | { type: 'interval'; workSeconds: number; restSeconds: number; rounds: number }
  | { type: 'for_time'; timeCap?: number }
  | { type: 'chipper'; rounds: number }
  | { type: 'buy_in_cash_out'; rounds?: number }
  | { type: 'cluster'; clusterSize: number; restBetweenClusters: number }
  | { type: 'ladder'; direction: 'ascending' | 'descending' }
  | { type: 'unbroken' }
  | { type: 'standard' };
```

### Pattern 3: Per-Exercise Completion in Member App
**What:** Track exercise completion individually instead of block-level
**When to use:** In the DayPlayer flow, each exercise gets a tap-to-complete interaction
**Example:**
```typescript
// Extended session progress in sessionPlayerStore
interface SessionProgress {
  currentBlockIndex: number;
  completedBlocks: BlockRole[];
  deuterosChoice: 'DEUTEROS_1' | 'DEUTEROS_2' | null;
  elapsedSeconds: number;
  sessionTimerStartedAt: number | null;
  // NEW: per-exercise completion tracking
  completedExercises: Record<string, number[]>;
  // Key: blockRole (e.g., 'NUCLEUS'), Value: array of exerciseId completed
}

// Auto-advance logic: when all exercises in block completed, mark block done
function checkBlockComplete(blockRole: BlockRole, exercises: Prescription[]): boolean {
  const completed = progress.completedExercises[blockRole] ?? [];
  return exercises.every(ex => completed.includes(ex.exerciseId));
}
```

### Pattern 4: Saved Blocks for Reuse
**What:** Coach saves an approved session block with a custom name for later "intercambiar bloque"
**When to use:** Coach wants to reuse a particularly good block configuration
**Example:**
```typescript
// New saved_blocks table
interface SavedBlock {
  id: number;
  name: string;           // Custom name set by coach
  createdBy: number;      // User ID (coach)
  sourceBlockId: number;  // Original block ID from session_blocks
  blockData: JSON;        // Full block + exercises snapshot
  createdAt: Date;
}
// Shown in the block swap dialog alongside pool blocks
```

### Anti-Patterns to Avoid
- **Server-side PDF generation for structured data:** Puppeteer (170MB Chromium) is overkill for tabular exercise sheets. pdfmake handles this client-side in ~2MB.
- **Using pdfmake v0.3.x:** v0.3.3 has breaking bugs in canvas processing and async API changes. Stick with v0.2.15.
- **Inlining base64 assets in the builder file:** Keep logo, icon, and font base64 strings in a separate `pdf-assets.ts` file to enable code splitting.
- **Duplicating prescription logic for format params:** Format params should augment, not replace, the existing prescriber functions. The params live in the DB; the prescribers consume them.
- **Full page reload on prescription edit:** Currently `onUpdatePrescription` in EditableBlockCard calls `emit('refresh')` which reloads the entire session. SC #11 requires no reload/scroll reset -- use targeted state update instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF document structure | Manual binary PDF construction | pdfmake declarative JSON | pdfmake handles pages, fonts, tables, columns, backgrounds |
| Font embedding in PDF | Manual TTF parsing | pdfmake virtual file system (vfs) | Register base64 font data, pdfmake handles subsetting and embedding |
| PDF table layout | Manual coordinate math | pdfmake table + columns | Built-in cell sizing, borders, padding, headerRows |
| Per-exercise state persistence | Manual localStorage | @capacitor/preferences (already used) | Already proven in sessionPlayerStore for block progress |
| Format parameter validation | Custom validator | TypeScript discriminated unions | The `type` field in FormatParams enables exhaustive checking |

**Key insight:** Session data is structured and tabular — pdfmake's declarative JSON approach is a natural fit. The PoC at `poc-pdf/generate-full.ts` proved that pdfmake can replicate the example PDF design with high fidelity (cream background, 2x2 level grids, bordered exercise boxes, Greek symbols α Δ Σ Ω).

## Common Pitfalls

### Pitfall 1: pdfmake Version Compatibility
**What goes wrong:** pdfmake v0.3.x introduces breaking changes — async API, canvas processing bug (`otherArray.forEach is not a function`)
**Why it happens:** v0.3.x refactored internals; some features (canvas elements, font loading) work differently
**How to avoid:** Pin to `pdfmake@^0.2.15`. The PoC was built and verified on this version. Do not upgrade to 0.3.x without thorough testing.
**Warning signs:** `TypeError: otherArray.forEach is not a function`, blank pages, async errors

### Pitfall 2: Large Base64 Assets Bloating Bundle
**What goes wrong:** Cinzel font files and logo images as base64 strings can be 500KB+ each, inflating the main JS bundle
**Why it happens:** Importing assets directly in the builder module includes them in the initial bundle
**How to avoid:** Keep all base64 assets in a dedicated `pdf-assets.ts` file. Use dynamic `import()` so the bundler code-splits this module — it's only loaded when the user clicks "Download PDF". This keeps the main bundle small.
**Warning signs:** Admin app initial load becomes noticeably slower

### Pitfall 3: Scroll Reset on Inline Prescription Edits (SC #11)
**What goes wrong:** Currently, `emit('refresh')` triggers `loadSession()` in SessionEditPage, re-rendering all blocks and resetting scroll position
**Why it happens:** The refresh pattern reloads the entire session from API
**How to avoid:** Return updated prescription from PATCH API (already done), use targeted reactive update instead of full reload. Green success toast only, no scroll disruption.
**Warning signs:** Users losing their place in long session pages after every edit

### Pitfall 4: Exercise Completion State Mismatch Across Views
**What goes wrong:** DayPlayer shows exercises as completed but WeeklyView shows day as incomplete
**Why it happens:** Completion state lives in Capacitor Preferences (local) while WeeklyView checks server
**How to avoid:** Per-exercise completion is local until session finishes, then submitted in bulk. Block auto-complete is derived state: `all exercises complete = block complete`. Final session completion still goes to server via existing `/sessions/complete` endpoint.
**Warning signs:** Inconsistent visual state between views

### Pitfall 5: Format Params Default Values During Generation
**What goes wrong:** Existing sessions generated before Phase 16 have null `formatParams`, causing crashes
**Why it happens:** New code expects `formatParams` to exist for all blocks
**How to avoid:** Always handle null/undefined formatParams gracefully. Provide sensible defaults derived from the format name and existing constants. The prescribers already have hardcoded defaults in `constants.ts` -- use those as fallback when formatParams is null.
**Warning signs:** NullPointerError when rendering sessions generated pre-Phase 16

### Pitfall 6: Category vs Pattern Confusion in Swap Dialog
**What goes wrong:** The `category` field on exercises may have different granularity than expected
**Why it happens:** Exercises.csv has `pattern` (e.g., "Empuje Horizontal") and `category` (e.g., "Press") as separate fields
**How to avoid:** Query distinct categories from the pool response to understand actual values before committing to the UI change. The pool API endpoint needs to include `category` in its return data.
**Warning signs:** Category chips being too few (1-2) or too many (30+) -- test with real data

## Code Examples

Verified patterns from the existing codebase:

### PDF Document Builder (pdfmake)
```typescript
// Source: PoC at poc-pdf/generate-full.ts, ported to client-side
// Key page builders for the 6-page-per-day structure:

function buildCoverPage(): Content {
  return {
    stack: [
      { text: '', margin: [0, 150, 0, 0] },
      { image: LOGO_BASE64, width: 300, alignment: 'center' },
    ],
    pageBreak: 'after',
  };
}

function buildBlockPageWithGrid(block: PdfBlockPage): Content {
  // 2x2 level grid: α(top-left) Δ(top-right) Σ(bottom-left) Ω(bottom-right)
  const levelBoxes = (block.levelBlocks || []).map(lb => buildLevelBox(lb));
  return {
    stack: [
      { text: `${block.role} · ${block.formatName}`, font: 'Cinzel', fontSize: 20, bold: true, color: '#24364A' },
      { columns: [levelBoxes[0] || emptyBox('α'), levelBoxes[1] || emptyBox('Δ')], columnGap: 12 },
      { columns: [levelBoxes[2] || emptyBox('Σ'), levelBoxes[3] || emptyBox('Ω')], columnGap: 12 },
    ],
    pageBreak: 'after',
  };
}
```

### Client-Side PDF Download (No API Endpoint)
```typescript
// Source: Admin SessionDetailPage.vue — no server changes needed
import { sessionToPdfDay } from 'src/utils/pdf/session-data-transformer';
import { buildDayPdf } from 'src/utils/pdf/session-pdf-builder';

async function onDownloadPdf() {
  const pdfDay = sessionToPdfDay(session.value);
  buildDayPdf(pdfDay); // Generates and downloads entirely in browser
}
```

### Blur-Save Without Scroll Reset (SC #11 Fix)
```typescript
// Source: Current EditableBlockCard.vue onUpdatePrescription
// BEFORE (causes full reload + scroll reset):
async function onUpdatePrescription(payload) {
  await editApi.updatePrescription(...);
  $q.notify({ type: 'positive', message: 'Prescripcion actualizada' });
  emit('refresh'); // <-- this triggers loadSession() = full reload
}

// AFTER (targeted update, no scroll reset):
async function onUpdatePrescription(payload) {
  const updated = await editApi.updatePrescription(...);
  // Update exercise in-place in reactive state
  const exercise = block.exercises.find(e => e.id === payload.prescriptionId);
  if (exercise && updated) {
    Object.assign(exercise, updated); // Reactive update, no reload
  }
  $q.notify({ type: 'positive', message: 'Prescripcion actualizada', color: 'green' });
  // No emit('refresh') -- no reload, no scroll reset
}
```

### Format Params in Exercise Pool API
```typescript
// Source: Extend existing exercises/pool endpoint response
// Add category to pool query select
const exercises = await this.db
  .select({
    id: schema.exercises.id,
    exercise: schema.exercises.exercise,
    effort: schema.exercises.effort,
    dificultadLineal: schema.exercises.dificultadLineal,
    pattern: schema.exercises.pattern,
    category: schema.exercises.category,     // NEW
    route: schema.exercises.route,
  })
  .from(schema.exercises)
  .where(and(...conditions));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Puppeteer server-side | pdfmake client-side | Phase 16 (PoC validated) | Zero server infrastructure, ~2MB vs 170MB, instant generation |
| wkhtmltopdf | pdfmake/Puppeteer | 2020+ | Modern alternatives with better support |
| Block-level completion | Per-exercise completion | Phase 16 (new) | Granular progress tracking, better UX |
| exerciseGroup (first word) | category field grouping | Phase 16 (new) | Fewer, semantically meaningful filter pills |

**Deprecated/outdated:**
- wkhtmltopdf: Abandoned project, poor CSS3 support, not recommended
- PhantomJS: Discontinued in 2018
- Puppeteer for this use case: Overkill for structured/tabular data. Reserved for complex CSS-heavy layouts.

## Open Questions

1. **Example PDF Design Template** — RESOLVED
   - The example PDF is at `.docs/brand-visual/Session ppt example.pdf` and `poc-pdf/session-pdf-example/`
   - A PoC at `poc-pdf/generate-full.ts` successfully replicates the 6-page design using pdfmake
   - Production version will add: embedded El Templo logo, Cinzel serif font, brand colors from visual guidelines

2. **Format Parameters: Exact Values Per Format**
   - What we know: Prior decisions (13-06, 13-07) define format behavior (e.g., AMRAP 30-rep cap, Tabata 20s/10s fixed, EMOM intensity-based). Constants exist in `pipeline/utils/constants.ts`.
   - What's unclear: Whether format params should be editable per-block by coaches, or set once during generation
   - Recommendation: SC #5 says "settable during session generation and editing" -- so they must be editable. Default values come from constants.ts, coach can override in admin UI.

3. **Saved Blocks: Scope and Visibility**
   - What we know: SC #10 says "coach can save an approved session block with a custom name for reuse"
   - What's unclear: Are saved blocks per-coach or global? Can they be deleted? Is there a limit?
   - Recommendation: Start with per-coach saved blocks (visible only to creator). Add a simple management UI (list, delete). No limit initially.

4. **Per-Exercise Completion: Server-Side Schema Change**
   - What we know: Current `completed_sessions.blocksCompleted` is a JSON array of role strings
   - What's unclear: Should exercise completion data be added to the same table or a new one?
   - Recommendation: Add `exercisesCompleted` JSON column to `completed_sessions` table. Format: `{ "NUCLEUS": [123, 456], "DEUTEROS_1": [789] }` mapping block role to array of exerciseIds. This keeps the completion submission in the same API call.

## Sources

### Primary (HIGH confidence)
- pdfmake docs (pdfmake.github.io/docs) - Declarative PDF generation API, fonts, tables, columns
- pdfmake npm (npmjs.com/package/pdfmake) - v0.2.15 stable, v0.3.x has breaking bugs
- PoC validated: `poc-pdf/generate-full.ts` - 6-page landscape PDF matching example design, 38.9KB output
- Codebase analysis: `format-prescribers.ts`, `prescribe-service.ts`, `edit-service.ts`, `session-blocks.ts` (formatParams column), `sessionPlayerStore.ts`, `useSessionPlayer.ts`, `useSessionCompletion.ts`, `ExerciseSwapDialog.vue`, `EditableBlockCard.vue`, `EditableExerciseRow.vue`

### Secondary (MEDIUM confidence)
- Brand visual guidelines: `.docs/brand-visual/el-templo-visual-guidelines.txt` - Official color palette and typography
- Brand assets: `.docs/brand-visual/El Templo Indoor Calisthenics LOGO.png`, `ICON BIG.png`
- Example PDF: `poc-pdf/session-pdf-example/` - 36-page reference design with screenshots

### Tertiary (LOW confidence)
- None - all findings verified against official sources, codebase, or PoC

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - pdfmake v0.2.15 validated in PoC, existing codebase infrastructure is clear
- Architecture: HIGH - Client-side approach eliminates server complexity; all patterns extend existing code
- Pitfalls: HIGH - Derived from actual PoC debugging (v0.3.x bugs, font encoding, canvas issues)
- Format params: HIGH - Column already exists, just needs population and UI
- Per-exercise tracking: MEDIUM - Requires careful state management across local and server, but pattern is clear
- PDF design matching: HIGH - PoC successfully replicates example PDF design (6 pages, level grids, Greek symbols)

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (30 days - stable domain, pdfmake 0.2.x API stable)
