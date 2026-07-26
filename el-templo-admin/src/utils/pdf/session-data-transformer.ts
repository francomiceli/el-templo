import type { SessionDetail, SessionBlock, SessionExercise } from 'src/types/session';
import type { PdfDaySession, PdfBlockPage, PdfLevelBlock, PdfExercise } from './pdf-types';
import { isFormatDictatedByName } from 'src/constants/formats';
import { getRouteLabel } from 'src/constants/route-labels';
// Orden canónico de niveles (kairos-first, Phase 129). El editor de sesiones
// muestra/edita la movilidad del PRIMER nivel presente en este orden
// (levelBlocks[0]); el PDF debe leer del mismo nivel para no divergir.
import { LEVEL_ORDER as CANONICAL_LEVEL_ORDER } from 'src/constants/levels';

const DAY_LABELS: Record<string, string> = {
  lunes: 'LUNES',
  martes: 'MARTES',
  miercoles: 'MIÉRCOLES',
  jueves: 'JUEVES',
  viernes: 'VIERNES',
  sabado: 'SÁBADO',
};

const LEVEL_ORDER = ['alfa', 'delta', 'sigma', 'kairos'];

// INITIUM es el calentamiento compartido del día: se imprime UNA vez para todos
// los niveles. Desde el fix de generación post-v5.1 sale idéntico en todas las
// sesiones, pero semanas viejas o ediciones manuales pueden divergir — por eso
// la fuente se elige con orden determinista (alfa = canónico) en vez de tomar
// la primera sesión que llegue del API (orden de filesort, no garantizado).
//
// ESPEJO (fase 164): este orden canónico —junto con el alias EPIKOS/ATHLOS de
// findBlock y el orden de roles— está duplicado a propósito en
// `el-templo-api/src/modules/tv/roster.ts`, que arma el roster de la pantalla
// TV de sucursal. Ese código corre en el server y no puede importarse desde
// acá (browser). Todo cambio en este archivo REQUIERE el cambio espejo allá.
const INITIUM_SOURCE_ORDER = ['alfa', 'delta', 'sigma', 'kairos'];

/** Pick the canonical INITIUM block: first level in INITIUM_SOURCE_ORDER that has one. */
function findInitiumBlock(sessions: SessionDetail[]): SessionBlock | undefined {
  const byLevel = new Map(sessions.map((s) => [s.memberLevel, s]));
  for (const level of INITIUM_SOURCE_ORDER) {
    const block = byLevel.get(level)?.blocks.find((b) => b.role === 'INITIUM');
    if (block) return block;
  }
  // Fallback: any session with an INITIUM (covers levels outside the list)
  for (const s of sessions) {
    const block = s.blocks.find((b) => b.role === 'INITIUM');
    if (block) return block;
  }
  return undefined;
}

/**
 * Build a display string for format + params.
 * Examples: "AMRAP 10' X3", "TIME CAP 12'", "COMPLEX X3", "TABATA 20"/10""
 */
/** Display-name overrides for PDF output */
function displayFormatName(name: string): string {
  if (name.toLowerCase() === 'interval training') return 'HIIT';
  return name;
}

function formatNameWithParams(
  formatName: string,
  formatParams: Record<string, unknown> | null | undefined
): string {
  const name = displayFormatName(formatName);
  if (!formatParams) return name;

  const p = formatParams as Record<string, unknown>;
  const type = p.type as string | undefined;
  if (!type) return name;

  switch (type) {
    // Minutes-only formats
    case 'amrap':
    case 'time_cap':
    case 'for_tech':
      return p.minutes ? `${name} ${p.minutes}'` : name;

    // Open Style: el tiempo lo decide el profe sobre la marcha — nunca se
    // imprime, aunque bloques viejos tengan minutes guardado en formatParams.
    case 'open_style':
      return name;

    case 'amrap_series': {
      const parts = [name];
      if (p.minutes) parts.push(`${p.minutes}'`);
      if (p.rounds) parts.push(`X${p.rounds}`);
      return parts.join(' ');
    }

    // EMOM-shape formats (intervalSeconds + totalMinutes)
    case 'emom':
    case 'every_x_seconds': {
      const parts = [name];
      if (p.totalMinutes) parts.push(`${p.totalMinutes}'`);
      if (p.intervalSeconds) parts.push(`(${p.intervalSeconds}")`);
      return parts.join(' ');
    }

    // On the X:00 (intervalSeconds + rounds)
    case 'on_the_x': {
      const mins = Math.floor(Number(p.intervalSeconds) / 60);
      return p.rounds ? `${name} ${mins}:00 X${p.rounds}` : name;
    }

    // Death By (optional time cap)
    case 'death_by':
    case 'death_by_unbroken':
      return p.timeCapMinutes ? `${name} ${p.timeCapMinutes}'` : name;

    // ROM (rounds + rest)
    case 'rom':
      return p.rounds ? `${p.rounds} Rondas · Hold ${p.restSeconds || 30}s` : name;

    // Rounds-only formats
    case 'complex':
    case 'combos':
    case 'for_quality':
      return p.rounds ? `${name} X${p.rounds}` : name;

    // Tabata: las rondas son fijas (8 = 4 min) y el coach no las elige — el
    // editor ni siquiera las muestra (ver FormatParamsEditor). Imprimir "X8" en
    // una hoja de papel es ruido: siempre dice lo mismo. Los params siguen
    // guardados porque el timer de la app sí los usa.
    case 'tabata':
      return p.workSeconds && p.restSeconds ? `${name} ${p.workSeconds}"/${p.restSeconds}"` : name;

    // Work/rest/rounds formats — acá las rondas SÍ las configura el coach
    case 'interval':
    case 'hiit': {
      const parts = [name];
      if (p.workSeconds && p.restSeconds) parts.push(`${p.workSeconds}"/${p.restSeconds}"`);
      if (p.rounds) parts.push(`X${p.rounds}`);
      return parts.join(' ');
    }

    // Optional time cap formats
    case 'for_time':
    case 'for_max_reps':
    case 'for_max_distancia':
      return p.timeCapMinutes ? `${name} ${p.timeCapMinutes}'` : name;

    // Rounds for Time (rounds + optional cap)
    case 'rounds_for_time': {
      const parts = [`${p.rounds || 5} RFT`];
      if (p.timeCapMinutes) parts.push(`${p.timeCapMinutes}'`);
      return parts.join(' ');
    }

    // Pyramid — per-exercise params now, no block-level pattern
    case 'pyramid':
      return name;

    // Direction formats with pattern
    // Ladder formats: name only, per-exercise patterns shown on each exercise line
    case 'ladder':
    case 'ladder_corta':
    case 'ladder_block':
    case 'broken_ladder':
      return name;

    // No-params formats — name only
    case 'cluster':
    case 'accumulate':
    case 'buy_in_cash_out':
      return name;

    // Tempo
    case 'tempo_sets':
      return p.tempo ? `${name} ${p.tempo}` : name;

    // I Go, You Go
    case 'i_go_you_go':
      return p.totalRounds ? `${name} ${p.totalRounds}R` : name;

    // Wave Loading
    case 'wave_loading':
      return p.waves ? `${name} ${p.waves} ondas` : name;

    // Drop Set
    case 'drop_set':
      return p.drops ? `${name} ${p.drops} drops` : name;

    // Rest-Pause
    case 'rest_pause':
      return p.pauseSeconds ? `${name} ${p.pauseSeconds}"` : name;

    // EMOM + For Time hybrid
    case 'emom_for_time': {
      const parts = [name];
      if (p.emomMinutes) parts.push(`${p.emomMinutes}'`);
      if (p.intervalSeconds) parts.push(`(${p.intervalSeconds}")`);
      return parts.join(' ');
    }

    // Acropolis
    case 'acropolis':
      return p.phases ? `${name} ${p.phases} fases` : name;

    default:
      return name;
  }
}

/**
 * Format an INITIUM exercise as a display string with prescription info.
 * - Param-driven formats (Tabata, HIIT): exercise name only (params define execution).
 * - I Go You Go: reps/secs or PAUSA per exercise.
 * - Other formats: standard reps/secs prescription.
 */
function formatInitiumExercise(ex: SessionExercise, formatName: string): string {
  const f = formatName.toLowerCase().trim();
  const name = ex.weighted ? `${ex.exerciseName} (W)` : ex.exerciseName;

  // Format-dictated: reps/secs are defined by the format, not per exercise
  if (isFormatDictatedByName(formatName)) {
    return name;
  }

  const isIGoYouGo = f.includes('i go');
  let prescription = '';

  // PAUSA only applies to I Go You Go exercises with no reps/secs
  if (isIGoYouGo && !ex.reps && !ex.seconds && ex.notes === 'PAUSA') {
    prescription = 'PAUSA';
  } else if (ex.increment) {
    const start = ex.reps || ex.seconds || 0;
    prescription = `${start}-${start + ex.increment}-${start + ex.increment * 2}-...`;
  } else if (ex.reps) {
    prescription = ex.repsMax ? `${ex.reps}-${ex.repsMax}` : `${ex.reps}`;
  } else if (ex.seconds) {
    prescription = ex.secondsMax ? `${ex.seconds}-${ex.secondsMax}"` : `${ex.seconds}"`;
  }
  return prescription ? `${name}  ·  ${prescription}` : name;
}

interface LadderParams {
  blockSize?: number;
  breakAfter?: number;
}

function exerciseToPdf(
  ex: SessionExercise,
  formatDictated: boolean,
  formatType?: string,
  ladderParams?: LadderParams
): PdfExercise {
  return {
    name: ex.weighted ? `${ex.exerciseName} (W)` : ex.exerciseName,
    contraction: ex.contraction,
    reps: formatDictated ? undefined : ex.reps,
    repsMax: formatDictated ? undefined : ex.repsMax,
    seconds: formatDictated ? undefined : ex.seconds,
    secondsMax: formatDictated ? undefined : ex.secondsMax,
    increment: formatDictated ? undefined : ex.increment,
    rest: ex.rest,
    notes: ex.notes,
    formatType: formatType || null,
    formatBlockSize: ladderParams?.blockSize || null,
    formatBreakAfter: ladderParams?.breakAfter || null,
  };
}

function getFormatType(block: SessionBlock): string | undefined {
  const params = block.formatParams as Record<string, unknown> | null;
  return (params?.type as string) || undefined;
}

function getLadderParams(block: SessionBlock): LadderParams | undefined {
  const params = block.formatParams as Record<string, unknown> | null;
  if (!params) return undefined;
  return {
    blockSize: params.blockSize ? Number(params.blockSize) : undefined,
    breakAfter: params.breakAfter ? Number(params.breakAfter) : undefined,
  };
}

function blockToLevelBlock(block: SessionBlock, level: string): PdfLevelBlock {
  const dictated = isFormatDictatedByName(block.formatName);
  const formatType = getFormatType(block);
  const ladderParams = getLadderParams(block);
  return {
    level,
    route: block.route,
    routeLabel: getRouteLabel(block.route), // Phase 100 — Spanish display label
    intensity: block.intensity,
    exercises: block.exercises.map((ex) => exerciseToPdf(ex, dictated, formatType, ladderParams)),
  };
}

/**
 * Find a block by role from a session's blocks.
 * For EPIKOS/ATHLOS, checks both roles.
 */
function findBlock(blocks: SessionBlock[], role: string): SessionBlock | undefined {
  if (role === 'EPIKOS') {
    return blocks.find((b) => b.role === 'EPIKOS' || b.role === 'ATHLOS');
  }
  return blocks.find((b) => b.role === role);
}

/** Format a mobility exercise as "NAME 20\"" / "NAME 10" / "NAME". */
function mobilityToText(mob: SessionExercise): string {
  const mobName = mob.weighted ? `${mob.exerciseName} (W)` : mob.exerciseName;
  const prescription =
    mob.seconds && mob.seconds > 0
      ? `${mob.seconds}"`
      : mob.reps && mob.reps > 0
        ? `${mob.reps}`
        : '';
  return `${mobName} ${prescription}`.trim();
}

/**
 * El bloque canónico de un rol: el del PRIMER nivel presente en el orden
 * compartido — o sea el levelBlocks[0] del editor. Todo lo que la grilla imprime
 * UNA sola vez para todos los niveles (movilidad, formato) tiene que salir de
 * acá, o el PDF contradice lo que el coach ve en el editor.
 *
 * El orden de las COLUMNAS de la grilla (LEVEL_ORDER local, alfa-first) se
 * mantiene aparte a propósito: solo se alinea la FUENTE.
 *
 * Movilidad: antes de la fase 129 el PDF la leía de alfa (primero en el orden
 * local) y el editor de kairos (primero en el compartido) — como se elige por
 * nivel, divergían siempre (regresión KAIROS-01).
 *
 * Formato: mismo pozo. Se guarda por nivel, y aunque se edita en cascada a todos
 * los niveles, un intercambio de bloque toca uno solo — con lo cual los niveles
 * quedaban con formatos distintos y el PDF (alfa) imprimía otro formato del que
 * mostraba el editor (kairos).
 */
function findCanonicalBlock(
  role: string,
  sessionsByLevel: Map<string, SessionDetail>
): SessionBlock | undefined {
  for (const level of CANONICAL_LEVEL_ORDER) {
    const session = sessionsByLevel.get(level);
    if (!session) continue;
    const block = findBlock(session.blocks, role);
    if (block) return block;
  }
  return undefined;
}

/**
 * Build a grid block page (NUCLEUS/DEUTEROS/EPIKOS) from all sessions.
 * Collects matching blocks across levels and sorts by LEVEL_ORDER.
 */
function buildGridPage(
  role: string,
  displayRole: string,
  sessionsByLevel: Map<string, SessionDetail>
): PdfBlockPage | null {
  const levelBlocks: PdfLevelBlock[] = [];

  // Movilidad y formato salen del nivel canónico (el que muestra el editor); el
  // orden de las columnas de abajo sigue siendo alfa-first via LEVEL_ORDER local.
  const canonical = findCanonicalBlock(role, sessionsByLevel);
  const mobilityText = canonical?.mobilityExercise
    ? mobilityToText(canonical.mobilityExercise)
    : undefined;
  const formatName = canonical
    ? formatNameWithParams(canonical.formatName, canonical.formatParams)
    : '';

  for (const level of LEVEL_ORDER) {
    const session = sessionsByLevel.get(level);
    if (!session) continue;
    const block = findBlock(session.blocks, role);
    if (!block) continue;

    levelBlocks.push(blockToLevelBlock(block, level));
  }

  if (levelBlocks.length === 0) return null;

  return {
    role: displayRole,
    formatName,
    mobility: mobilityText,
    levelBlocks,
  };
}

// ROM zone constants for PDF transformer
const ROM_ZONES = ['ROM_LOWER', 'ROM_CORE', 'ROM_UPPER'] as const;
const ROM_ZONE_LABELS: Record<string, string> = {
  ROM_LOWER: 'TREN INFERIOR',
  ROM_CORE: 'ZONA MEDIA',
  ROM_UPPER: 'TREN SUPERIOR',
};

/**
 * Transform multiple sessions (one per level) into a single PdfDaySession
 * with multi-level grids for each block.
 *
 * @param sessions - All sessions for one day (kairos, alfa, delta, sigma)
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

  // Detect ROM sessions: check if any session has ROM block roles
  const isRom = sessions.some((s) => s.blocks.some((b) => b.role.startsWith('ROM_')));

  if (isRom) {
    // ROM sessions: INITIUM warmup + 3 zone blocks, 2 tiers (alfa=BASICO, delta=AVANZADO)

    // INITIUM compartido del día — fuente determinista (ver INITIUM_SOURCE_ORDER)
    const romInitium = findInitiumBlock(sessions);
    if (romInitium) {
      blocks.push({
        role: 'INITIUM',
        blockName: romInitium.pattern || 'PYROS',
        formatName: formatNameWithParams(romInitium.formatName, romInitium.formatParams),
        customTitle: romInitium.customTitle ?? null, // Phase 100
        simpleExercises: romInitium.exercises.map((e) =>
          formatInitiumExercise(e, romInitium.formatName)
        ),
      });
    }

    for (const zone of ROM_ZONES) {
      const levelBlocks: PdfLevelBlock[] = [];
      let formatName = '';

      for (const level of ['alfa', 'delta']) {
        const session = sessionsByLevel.get(level);
        if (!session) continue;
        const block = session.blocks.find((b) => b.role === zone);
        if (!block) continue;
        if (!formatName) formatName = formatNameWithParams(block.formatName, block.formatParams);
        levelBlocks.push(blockToLevelBlock(block, level));
      }

      if (levelBlocks.length > 0) {
        blocks.push({
          role: ROM_ZONE_LABELS[zone] || zone,
          formatName,
          mobility: undefined, // No mobility slot for ROM (per D-10)
          levelBlocks,
          isRom: true,
        });
      }
    }

    return { dayName, week, blocks };
  }

  // INITIUM compartido del día — fuente determinista (ver INITIUM_SOURCE_ORDER)
  const initium = findInitiumBlock(sessions);
  if (initium) {
    blocks.push({
      role: 'INITIUM',
      blockName: initium.pattern || 'PYROS',
      formatName: formatNameWithParams(initium.formatName, initium.formatParams),
      customTitle: initium.customTitle ?? null, // Phase 100
      simpleExercises: initium.exercises.map((e) => formatInitiumExercise(e, initium.formatName)),
    });
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
