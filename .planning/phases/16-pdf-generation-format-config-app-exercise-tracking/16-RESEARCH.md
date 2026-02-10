# Phase 16: PDF Generation, Format Config & App Exercise Tracking - Research

**Researched:** 2026-02-10
**Domain:** PDF generation from HTML/CSS, format parameter configuration, per-exercise completion tracking
**Confidence:** HIGH (codebase well-understood, libraries verified)

## Summary

Phase 16 covers four distinct workstreams: (A) server-side PDF generation for approved sessions matching a design template, (B) format-specific parameter configuration that populates the existing but empty `formatParams` JSON column in `session_blocks`, (C) exercise swap UX improvement in the admin app by using the `category` field instead of first-word grouping, and (D) per-exercise completion tracking in the member app to replace the current block-level completion model. There is also (E) a "save block for reuse" feature for coaches and (F) inline prescription edit UX fixes.

The codebase is a monorepo with three packages: `el-templo-api` (Fastify + Drizzle ORM + MySQL), `el-templo-admin` (Quasar/Vue 3), and `el-templo-app` (Quasar/Vue 3 + Capacitor). All editing infrastructure from Phase 15 is complete and functional. The `formatParams` JSON column exists on `session_blocks` but is completely unused -- this phase activates it. The member app's DayPlayer currently tracks completion per-block via `completedBlocks: BlockRole[]` stored in Capacitor Preferences and submitted to the server as an array of role strings. The per-exercise tracking will require changes to both the local persistence model and the server completion endpoint.

For PDF generation, the recommended approach is Puppeteer running server-side on the Fastify API. The session data is templated into an HTML/CSS skeleton that matches the provided design, then Puppeteer renders it to PDF. This follows the pipeline described in SC #2: example PDF -> page images -> HTML/CSS skeleton -> dynamic session data -> final PDF.

**Primary recommendation:** Use Puppeteer for PDF generation, populate `formatParams` with structured JSON per format type, switch swap dialog from first-word grouping to `category` field, and extend session progress persistence from block-level to exercise-level with auto-advance logic.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| puppeteer | ^24.x | HTML-to-PDF rendering via headless Chrome | Industry standard for high-fidelity HTML/CSS to PDF, verified via npm and official docs |
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
| puppeteer | playwright | Playwright is more modern but heavier; Puppeteer is sufficient since we only need Chromium. Puppeteer is slightly faster for Chrome-only tasks and has a simpler setup for PDF-only use case |
| puppeteer | pdfkit/jspdf | These programmatic libraries lack CSS rendering -- cannot match a design template faithfully |
| puppeteer | puppeteer-core | Could use puppeteer-core + manual Chromium install to avoid bundled download, but full puppeteer is simpler for dev/deploy and is already ~140MB one-time download |

**Installation:**
```bash
cd el-templo-api && pnpm add puppeteer
```

## Architecture Patterns

### Recommended Project Structure
```
el-templo-api/src/
  modules/admin/
    pdf-service.ts           # PDF generation logic + HTML template
    routes.ts                # Add GET /admin/sessions/:id/pdf endpoint
    edit-service.ts          # Extend: formatParams CRUD, block save/reuse
    prescribe-service.ts     # Extend: formatParams in prescription context
  db/schema/
    session-blocks.ts        # formatParams already exists (JSON column)
    completed-sessions.ts    # Extend: exercisesCompleted JSON column
    saved-blocks.ts          # NEW: saved blocks for reuse

el-templo-admin/src/
  components/sessions/
    ExerciseSwapDialog.vue   # Modify: category pills instead of first-word
    EditableBlockCard.vue    # Extend: formatParams display + save-block button
    EditableExerciseRow.vue  # Fix: green toast only, no scroll reset
    FormatParamsEditor.vue   # NEW: format-specific parameter inputs

el-templo-app/src/
  modules/training/
    composables/
      useSessionPlayer.ts    # Extend: per-exercise completion
      useSessionCompletion.ts # Extend: submit exercisesCompleted
    stores/
      sessionPlayerStore.ts  # Extend: completedExercises in progress
    components/player/
      ExerciseList.vue       # Extend: per-exercise completion checkmarks
    types/session.ts         # Extend: exercise completion types
```

### Pattern 1: Server-Side PDF Generation via Puppeteer
**What:** Generate PDF by rendering an HTML template with session data in headless Chrome
**When to use:** Whenever a coach clicks "Download PDF" on an approved session
**Example:**
```typescript
// Source: Puppeteer official docs (pptr.dev/guides/pdf-generation)
import puppeteer, { Browser } from 'puppeteer';

// Reuse browser instance across requests (singleton pattern)
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserInstance;
}

async function generateSessionPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
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
- **Launching Puppeteer per request:** Extremely slow and memory-heavy. Reuse a singleton browser instance with page-level isolation.
- **Storing PDF files on disk:** Generate on-the-fly and stream. Sessions change frequently; cached PDFs become stale.
- **Duplicating prescription logic for format params:** Format params should augment, not replace, the existing prescriber functions. The params live in the DB; the prescribers consume them.
- **Full page reload on prescription edit:** Currently `onUpdatePrescription` in EditableBlockCard calls `emit('refresh')` which reloads the entire session. SC #11 requires no reload/scroll reset -- use targeted state update instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML to PDF conversion | Custom PDF layout engine | Puppeteer page.pdf() | CSS rendering complexity is enormous; browser engines handle it perfectly |
| PDF page sizing/margins | Manual coordinate math | Puppeteer PDFOptions (format, margin) | Built-in A4/Letter support with mm/px margins |
| Browser instance management | Manual process spawning | Puppeteer's built-in launch/connect | Handles Chromium lifecycle, crash recovery |
| Per-exercise state persistence | Manual localStorage | @capacitor/preferences (already used) | Already proven in sessionPlayerStore for block progress |
| Format parameter validation | Custom validator | TypeScript discriminated unions | The `type` field in FormatParams enables exhaustive checking |

**Key insight:** The PDF pipeline is entirely about HTML/CSS fidelity. Puppeteer delegates rendering to Chrome's engine, which handles every CSS feature. Any hand-rolled PDF builder would be months of work for worse results.

## Common Pitfalls

### Pitfall 1: Puppeteer Chromium Download Size
**What goes wrong:** `npm install puppeteer` downloads ~170MB Chromium binary, surprising developers and CI/CD
**Why it happens:** Puppeteer bundles its own Chromium for version compatibility
**How to avoid:** Document the one-time download in setup instructions. For CI/CD, cache `node_modules/.cache/puppeteer`. For production, ensure sufficient disk space.
**Warning signs:** Install hangs or fails in bandwidth-limited environments

### Pitfall 2: Memory Leaks from Unclosed Pages
**What goes wrong:** Each PDF request opens a Puppeteer page but never closes it, consuming increasing RAM
**Why it happens:** Error paths skip `page.close()`, or pages accumulate without cleanup
**How to avoid:** Always use try/finally with `page.close()`. Add a page timeout. Monitor active page count.
**Warning signs:** API server memory growing over time, OOM kills

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

### PDF HTML Template Skeleton
```typescript
// Source: Based on existing session detail structure in admin routes
function buildSessionHtml(session: SessionDetail): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* Styles matching the example PDF design */
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
    .header { /* session header: week, day, level */ }
    .block { /* block card with colored left border */ }
    .block-header { /* role, format, intensity */ }
    .exercise-row { /* exercise name, reps/seconds, rest, notes */ }
    /* ... match provided PDF design exactly */
  </style>
</head>
<body>
  <div class="header">
    <h1>Semana ${session.week} - ${dayLabel(session.day)}</h1>
    <p>${session.levelGroup} | ${session.blocks.length} bloques</p>
  </div>
  ${session.blocks.map(block => `
    <div class="block">
      <div class="block-header">${block.role} - ${block.formatName}</div>
      ${block.exercises.map(ex => `
        <div class="exercise-row">
          <span class="name">${ex.exerciseName}</span>
          <span class="prescription">${ex.reps > 0 ? ex.reps + ' reps' : ex.seconds + 's'}</span>
          <span class="rest">${ex.rest}s desc.</span>
          ${ex.notes ? `<span class="notes">${ex.notes}</span>` : ''}
        </div>
      `).join('')}
    </div>
  `).join('')}
</body>
</html>`;
}
```

### API Endpoint for PDF Download
```typescript
// Source: Pattern from existing admin routes
fastify.get<{ Params: { id: number } }>('/sessions/:id/pdf', {
  // schema...
}, async (request, reply) => {
  const session = await adminService.getSessionWithDetails(request.params.id);
  if (!session) {
    return reply.status(404).send({ error: 'Sesion no encontrada' });
  }
  if (session.status !== 'approved') {
    return reply.status(400).send({ error: 'Solo sesiones aprobadas pueden generar PDF' });
  }

  const html = pdfService.buildSessionHtml(session);
  const pdfBuffer = await pdfService.generatePdf(html);

  reply.header('Content-Type', 'application/pdf');
  reply.header('Content-Disposition',
    `attachment; filename="sesion-S${session.week}-${session.day}-${session.levelGroup}.pdf"`);
  return reply.send(pdfBuffer);
});
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
| wkhtmltopdf | Puppeteer/Playwright headless Chrome | 2020+ | Full CSS3/JS support, better fidelity |
| PDFKit/jsPDF programmatic | HTML template + headless browser | 2022+ | Designers can work with HTML/CSS instead of coordinate math |
| Block-level completion | Per-exercise completion | Phase 16 (new) | Granular progress tracking, better UX |
| exerciseGroup (first word) | category field grouping | Phase 16 (new) | Fewer, semantically meaningful filter pills |

**Deprecated/outdated:**
- wkhtmltopdf: Abandoned project, poor CSS3 support, not recommended
- PhantomJS: Discontinued in 2018, fully replaced by Puppeteer

## Open Questions

1. **Example PDF Design Template**
   - What we know: SC #2 mentions "example PDF -> page images -> HTML/CSS skeleton"
   - What's unclear: The actual PDF design template file hasn't been provided yet
   - Recommendation: The planner should create a task for the design-to-HTML conversion step. The user needs to provide the example PDF. The HTML/CSS skeleton can be built iteratively once the design is available.

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
- Puppeteer official docs (pptr.dev/guides/pdf-generation) - PDF generation API, page.pdf() options
- Puppeteer npm (npmjs.com/package/puppeteer) - Version 24.37.2, last published Feb 2026
- Codebase analysis: `format-prescribers.ts`, `prescribe-service.ts`, `edit-service.ts`, `session-blocks.ts` (formatParams column), `sessionPlayerStore.ts`, `useSessionPlayer.ts`, `useSessionCompletion.ts`, `ExerciseSwapDialog.vue`, `EditableBlockCard.vue`, `EditableExerciseRow.vue`

### Secondary (MEDIUM confidence)
- Web search: "Node.js PDF generation from HTML CSS 2025 2026" - Multiple sources confirm Puppeteer as industry standard
- Web search: "Puppeteer PDF generation best practices" - Browser reuse, page cleanup, memory management patterns
- PDFBolt comparison (pdfbolt.com/blog/top-nodejs-pdf-generation-libraries) - Library landscape

### Tertiary (LOW confidence)
- None - all findings verified against official sources or codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Puppeteer is well-established, existing codebase infrastructure is clear
- Architecture: HIGH - All patterns extend existing code with minimal new concepts
- Pitfalls: HIGH - Derived from actual codebase analysis and well-known Puppeteer issues
- Format params: HIGH - Column already exists, just needs population and UI
- Per-exercise tracking: MEDIUM - Requires careful state management across local and server, but pattern is clear
- PDF design matching: MEDIUM - Depends on receiving the actual design template from user

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (30 days - stable domain, Puppeteer API unlikely to change)
