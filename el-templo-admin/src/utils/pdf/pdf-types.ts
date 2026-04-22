/**
 * TypeScript interfaces for PDF data input
 *
 * These types define the shape of session data used for PDF generation.
 * They mirror the session structure but are simplified for PDF rendering.
 */

export interface PdfExercise {
  name: string;
  contraction: string; // CON, EXC, ISO
  reps?: number | null;
  repsMax?: number | null;
  seconds?: number | null;
  secondsMax?: number | null;
  increment?: number | null;
  rest?: number | null;
  notes?: string | null;
  formatType?: string | null; // e.g. 'pyramid' — used for format-specific volume display
  formatBlockSize?: number | null; // blockSize from format params (ladder_block)
  formatBreakAfter?: number | null; // breakAfter from format params (broken_ladder)
}

export interface PdfLevelBlock {
  level: string; // alfa, delta, sigma, omega
  route: string; // Canonical short code (e.g., "PL", "HT") — preserved for any internal use
  /** Phase 100 — Spanish display label resolved via getRouteLabel (e.g., "Plancha", "Empuje de cadera"). */
  routeLabel: string;
  intensity: number; // e.g., 60
  exercises: PdfExercise[];
}

export interface PdfBlockPage {
  role: string; // INITIUM, NUCLEUS, DEUTEROS I, DEUTEROS II, EPIKOS, ATHLOS, or ROM zone names
  blockName?: string; // e.g., "PYROS" for INITIUM
  formatName: string; // e.g., "TIME CAP 10'", "AMRAP 12'"
  /** Phase 100 — INITIUM block custom subtitle. When set, replaces "INITIUM · {formatName}" subtitle. */
  customTitle?: string | null;
  mobility?: string; // e.g., "ASSISTED SPAGAT DELTA 20\""
  formatParams?: string; // e.g., "30\" X 15\""
  // For INITIUM: simple exercise list (same across all levels)
  simpleExercises?: string[];
  // For NUCLEUS/DEUTEROS/EPIKOS: per-level grid
  levelBlocks?: PdfLevelBlock[];
  // ROM mode flag — signals PDF builder to use 2-row stacked layout
  isRom?: boolean;
}

export interface PdfDaySession {
  dayName: string; // e.g., "LUNES", "MARTES"
  week: number;
  blocks: PdfBlockPage[];
}
