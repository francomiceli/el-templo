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
}

export interface PdfLevelBlock {
  level: string; // alfa, delta, sigma, omega
  route: string; // e.g., "Hip Thrust"
  intensity: number; // e.g., 60
  exercises: PdfExercise[];
}

export interface PdfBlockPage {
  role: string; // INITIUM, NUCLEUS, DEUTEROS I, DEUTEROS II, EPIKOS, ATHLOS
  blockName?: string; // e.g., "PYROS" for INITIUM
  formatName: string; // e.g., "TIME CAP 10'", "AMRAP 12'"
  mobility?: string; // e.g., "ASSISTED SPAGAT DELTA 20\""
  formatParams?: string; // e.g., "30\" X 15\""
  // For INITIUM: simple exercise list (same across all levels)
  simpleExercises?: string[];
  // For NUCLEUS/DEUTEROS/EPIKOS: per-level grid
  levelBlocks?: PdfLevelBlock[];
}

export interface PdfDaySession {
  dayName: string; // e.g., "LUNES", "MARTES"
  week: number;
  blocks: PdfBlockPage[];
}
