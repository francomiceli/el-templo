import type { SessionDetail, SessionBlock, SessionExercise } from 'src/types/session';
import type { PdfDaySession, PdfBlockPage, PdfLevelBlock, PdfExercise } from './pdf-types';

const DAY_LABELS: Record<string, string> = {
  lunes: 'LUNES',
  martes: 'MARTES',
  miercoles: 'MIÉRCOLES',
  jueves: 'JUEVES',
  viernes: 'VIERNES',
  sabado: 'SÁBADO',
};

const LEVEL_ORDER = ['alfa', 'delta', 'sigma', 'omega'];

function exerciseToPdf(ex: SessionExercise): PdfExercise {
  return {
    name: ex.exerciseName,
    contraction: ex.contraction,
    reps: ex.reps,
    seconds: ex.seconds,
    rest: ex.rest,
    notes: ex.notes,
  };
}

function blockToLevelBlock(block: SessionBlock, level: string): PdfLevelBlock {
  return {
    level,
    route: block.route,
    intensity: block.intensity,
    exercises: block.exercises.map(exerciseToPdf),
  };
}

/**
 * Find a block by role from a session's blocks.
 * For EPIKOS/ATHLOS, checks both roles.
 */
function findBlock(blocks: SessionBlock[], role: string): SessionBlock | undefined {
  if (role === 'EPIKOS') {
    return blocks.find(b => b.role === 'EPIKOS' || b.role === 'ATHLOS');
  }
  return blocks.find(b => b.role === role);
}

/**
 * Build a grid block page (NUCLEUS/DEUTEROS/EPIKOS) from all sessions.
 * Collects matching blocks across levels and sorts by LEVEL_ORDER.
 */
function buildGridPage(
  role: string,
  displayRole: string,
  sessionsByLevel: Map<string, SessionDetail>,
): PdfBlockPage | null {
  const levelBlocks: PdfLevelBlock[] = [];
  let formatName = '';

  for (const level of LEVEL_ORDER) {
    const session = sessionsByLevel.get(level);
    if (!session) continue;
    const block = findBlock(session.blocks, role);
    if (!block) continue;
    if (!formatName) formatName = block.formatName;
    levelBlocks.push(blockToLevelBlock(block, level));
  }

  if (levelBlocks.length === 0) return null;

  return {
    role: displayRole,
    formatName,
    levelBlocks,
  };
}

/**
 * Transform multiple sessions (one per level) into a single PdfDaySession
 * with multi-level grids for each block.
 *
 * @param sessions - All sessions for one day (alfa, delta, sigma, omega)
 */
export function sessionsToPdfDay(sessions: SessionDetail[]): PdfDaySession {
  const first = sessions[0];
  const dayName = DAY_LABELS[first.day] || first.day.toUpperCase();
  const week = first.week;

  // Group sessions by memberLevel
  const sessionsByLevel = new Map<string, SessionDetail>();
  for (const s of sessions) {
    sessionsByLevel.set(s.memberLevel, s);
  }

  const blocks: PdfBlockPage[] = [];

  // INITIUM: same across all levels - grab from any session
  for (const s of sessions) {
    const initium = s.blocks.find(b => b.role === 'INITIUM');
    if (initium) {
      blocks.push({
        role: 'INITIUM',
        blockName: initium.pattern || 'PYROS',
        formatName: initium.formatName,
        simpleExercises: initium.exercises.map(e => e.exerciseName),
      });
      break;
    }
  }

  // NUCLEUS
  const nucleus = buildGridPage('NUCLEUS', 'NUCLEUS', sessionsByLevel);
  if (nucleus) blocks.push(nucleus);

  // DEUTEROS I & II
  const deut1 = buildGridPage('DEUTEROS_1', 'DEUTEROS I', sessionsByLevel);
  if (deut1) blocks.push(deut1);

  const deut2 = buildGridPage('DEUTEROS_2', 'DEUTEROS II', sessionsByLevel);
  if (deut2) blocks.push(deut2);

  // EPIKOS / ATHLOS
  const epikos = buildGridPage('EPIKOS', 'EPIKOS', sessionsByLevel);
  if (epikos) {
    // Use the actual role name from the first available block
    for (const s of sessions) {
      const block = findBlock(s.blocks, 'EPIKOS');
      if (block) {
        epikos.role = block.role;
        break;
      }
    }
    blocks.push(epikos);
  }

  return { dayName, week, blocks };
}

/**
 * Transform a single session into a PdfDaySession.
 * Places the session's exercises in the correct level position.
 * For full multi-level grids, use sessionsToPdfDay with all level sessions.
 *
 * @param session - A single SessionDetail
 */
export function sessionToPdfDay(session: SessionDetail): PdfDaySession {
  return sessionsToPdfDay([session]);
}

/**
 * Transform multiple sessions (possibly spanning multiple days) into
 * an array of PdfDaySession sorted by day order.
 * Groups sessions by day, merging levels for each day.
 *
 * @param sessions - All sessions for a week (any mix of days and levels)
 */
export function sessionsToWeekPdf(sessions: SessionDetail[]): PdfDaySession[] {
  const dayOrder = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

  // Group sessions by day
  const byDay = new Map<string, SessionDetail[]>();
  for (const s of sessions) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day)!.push(s);
  }

  // Sort days and transform each group
  return [...byDay.entries()]
    .sort(([a], [b]) => dayOrder.indexOf(a) - dayOrder.indexOf(b))
    .map(([, daySessions]) => sessionsToPdfDay(daySessions));
}
