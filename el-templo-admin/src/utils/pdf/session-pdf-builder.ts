/**
 * Session PDF Builder
 *
 * Generates El Templo-branded session PDFs using pdfmake.
 * Client-side generation - no server infrastructure needed.
 *
 * Design: 3840×2160 landscape (4K), cream background, 2x2 level grids, Greek symbols.
 */

import pdfMake from 'pdfmake/build/pdfmake';
import {
  TDocumentDefinitions,
  Content,
  ContentStack,
  ContextPageSize,
  Column,
} from 'pdfmake/interfaces';
import {
  CINZEL_REGULAR_BASE64,
  CINZEL_BOLD_BASE64,
  NUNITO_SANS_REGULAR_BASE64,
  NUNITO_SANS_BOLD_BASE64,
  NUNITO_SANS_BOLD_ITALIC_BASE64,
  ROBOTO_REGULAR_BASE64,
  LOGO_BASE64,
  GREAT_VIBES_REGULAR_BASE64,
  MARBLE_BG_BASE64,
} from './pdf-assets';
import { PdfDaySession, PdfBlockPage, PdfLevelBlock, PdfExercise } from './pdf-types';
import { formatWeekLabel, formatWeekForFilename } from '../weekDates';
import { getRouteLabel } from 'src/constants/route-labels';

// ============================================================
// BRAND DESIGN TOKENS (from visual guidelines)
// ============================================================
const BG_CREAM = '#F2EBE1'; // Crema Mármol - main background
const NAVY = '#24364A'; // Azul Profundo - headers, primary text
const GOLD = '#B08D6E'; // Oro Mate - accents, borders, subtitles
const SAND = '#DBCAB4'; // Arena Suave - card backgrounds
const BORDER_MUTED = '#c5b9a8'; // Muted border color

// Greek letter level symbols
const LEVEL_SYMBOLS: Record<string, string> = {
  alfa: 'α',
  delta: 'Δ',
  sigma: 'Σ',
  omega: 'Ω',
};

const LEVEL_ORDER = ['kairos', 'alfa', 'delta', 'sigma'];

/**
 * Kairos glyph (☉) drawn as a VECTOR — Roboto (the PDF font) lacks U+2609, so the
 * character would render as tofu. We draw a gold ring + centre dot (sol/ciclo) and
 * return it as a `columns` item so it sits inline beside the text glyphs (α/Δ/Σ).
 * `diameter` ≈ the cap-height of the adjacent text glyph; `topMargin` drops the ring
 * onto the text baseline. NOTE: the vertical offset is eyeballed against the
 * generated PDF — tune `topMargin` per call-site in UAT if it sits high/low.
 */
function kairosGlyphColumn(
  diameter: number,
  topMargin: number,
  leftMargin = 0,
  rightMargin = 0
): Column {
  const r = diameter / 2;
  const ring = Math.max(5, Math.round(diameter * 0.1));
  const dot = Math.max(5, Math.round(diameter * 0.16));
  return {
    width: diameter + leftMargin + rightMargin,
    margin: [leftMargin, topMargin, rightMargin, 0],
    canvas: [
      {
        type: 'ellipse' as const,
        x: r,
        y: r,
        r1: r - ring / 2,
        r2: r - ring / 2,
        lineColor: GOLD,
        lineWidth: ring,
      },
      { type: 'ellipse' as const, x: r, y: r, r1: dot, r2: dot, color: GOLD },
    ],
  };
}

// Contraction abbreviations (matching example format: "CON.", "EXC.", "ISO.")
const CONTRACTION_ABBR: Record<string, string> = {
  CON: 'CON.',
  EXC: 'EXC.',
  ISO: 'ISO.',
};

// Phase 100 — legacy English ROUTE_NAMES and getRouteName() removed.
// PDF now consumes Spanish labels via `getRouteLabel` from 'src/constants/route-labels'
// (SPEC Requirement 4). Level blocks carry `routeLabel` (pre-resolved in the transformer)
// for all per-level headers; short code is still available on `lb.route` when needed.

/**
 * Build compact pyramid pattern string for PDF display.
 * Uses repsMax/secondsMax as start, increment as step, reps/seconds as peak.
 */
function buildPyramidVolume(ex: PdfExercise): string {
  const isIso = ex.contraction?.toUpperCase() === 'ISO';
  const start = Number(isIso ? ex.secondsMax : ex.repsMax) || 2;
  const step = Number(ex.increment) || 2;
  const peak = Number(isIso ? ex.seconds : ex.reps) || 10;
  const q = isIso ? '"' : ''; // quote suffix per number for ISO
  if (step <= 0 || peak <= 0 || start <= 0 || start > peak) return '';
  const up: number[] = [];
  for (let i = start; i <= peak; i += step) up.push(i);
  const down = up.slice(0, -1).reverse();
  const all = [...up, ...down];
  if (all.length <= 5) return all.map((n) => `${n}${q}`).join('-');
  const first = all
    .slice(0, 2)
    .map((n) => `${n}${q}`)
    .join('-');
  const last = all
    .slice(-2)
    .map((n) => `${n}${q}`)
    .join('-');
  return `${first}...${peak}${q}...${last}`;
}

const LADDER_TYPES = new Set(['ladder', 'ladder_corta', 'ladder_block', 'broken_ladder']);

/** Generate ascending sequence: start, start+step, start+2*step, ... */
function ladderSequence(start: number, step: number, count: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count; i++) values.push(start + i * step);
  return values;
}

/** Truncate long sequences: "1-2-3...9-10" */
function truncateSequence(values: number[], suffix: string, maxFull = 7): string {
  if (values.length <= maxFull) return values.map((n) => `${n}${suffix}`).join('-');
  const first = values
    .slice(0, 3)
    .map((n) => `${n}${suffix}`)
    .join('-');
  const last = values
    .slice(-2)
    .map((n) => `${n}${suffix}`)
    .join('-');
  return `${first}...${last}`;
}

/**
 * Build ladder pattern string for PDF display.
 * Uses repsMax/secondsMax as start, increment as step.
 * Rounds/blockSize/breakAfter come from block-level format params.
 */
function buildLadderVolume(ex: PdfExercise): string {
  const isIso = ex.contraction?.toUpperCase() === 'ISO';
  const start = Number(isIso ? ex.secondsMax : ex.repsMax) || 1;
  const step = Number(ex.increment) || 1;
  const rounds = Number(isIso ? ex.seconds : ex.reps) || 5;
  const q = isIso ? '"' : '';

  if (ex.formatType === 'ladder_block') {
    const blockSize = Number(ex.formatBlockSize) || 3;
    const values = ladderSequence(start, step, Math.min(rounds, 4));
    return values.map((n) => `${n}${q}x${blockSize}`).join('-') + '...';
  }

  if (ex.formatType === 'broken_ladder') {
    const breakAfter = Number(ex.formatBreakAfter) || 3;
    const segment = ladderSequence(start, step, breakAfter);
    const segStr = segment.map((n) => `${n}${q}`).join('-');
    return `${segStr} | ${segStr} | ...`;
  }

  // ladder / ladder_corta — rounds from per-exercise reps/seconds
  const values = ladderSequence(start, step, rounds);
  return truncateSequence(values, q);
}

/** Build volume display string for an exercise */
function buildExerciseVolume(ex: PdfExercise): string {
  // Pyramid: per-exercise pattern
  if (ex.formatType === 'pyramid') {
    return buildPyramidVolume(ex);
  }
  // Ladder: per-exercise start/step + block-level rounds from format params
  if (ex.formatType && LADDER_TYPES.has(ex.formatType)) {
    return buildLadderVolume(ex);
  }
  // Death By: increment pattern
  if (ex.increment) {
    const start = ex.reps || ex.seconds || 0;
    return `${start}-${start + ex.increment}-${start + ex.increment * 2}-...`;
  }
  // Seconds (ISO)
  if (ex.seconds) {
    return ex.secondsMax ? `${ex.seconds}-${ex.secondsMax}"` : `${ex.seconds}"`;
  }
  // Reps
  if (ex.reps) {
    return ex.repsMax ? `${ex.reps}-${ex.repsMax}` : `${ex.reps}`;
  }
  return '';
}

// Motivational quotes for closing page
// Each quote is split: main text (navy) + goldText (gold accent on the punchline)
const QUOTES = [
  {
    text: '\u201CLAS CADENAS DE LA DISCIPLINA SON LIGERAS COMPARADAS CON ',
    goldText: 'EL PESO DEL ARREPENTIMIENTO.\u201D',
    author: 'Jim Rohn.',
  },
  {
    text: '\u201CES UNA PENA ENVEJECER SIN NUNCA VER ',
    goldText: 'LA BELLEZA Y LA FUERZA DE LA QUE TU CUERPO ES CAPAZ.\u201D',
    author: 'Sócrates.',
  },
  {
    text: '\u201CLOS OBSTÁCULOS SON ESAS COSAS ESPANTOSAS QUE VES ',
    goldText: 'CUANDO APARTAS LOS OJOS DE TU META.\u201D',
    author: 'Henry Ford.',
  },
  { text: '\u201CVENI, VIDI, VICI.\u201D', goldText: '', author: 'Julio César.' },
  {
    text: '\u201CEL QUE TIENE UN PORQUÉ PARA VIVIR ',
    goldText: 'PUEDE SOPORTAR CASI CUALQUIER CÓMO.\u201D',
    author: 'Friedrich Nietzsche.',
  },
  { text: '\u201CNO EXPLIQUES TU FILOSOFÍA. ', goldText: 'ENCÁRNALA.\u201D', author: 'Epicteto.' },
  {
    text: '\u201CLA VERDADERA GENEROSIDAD HACIA EL FUTURO CONSISTE EN ',
    goldText: 'ENTREGARLO TODO AL PRESENTE.\u201D',
    author: 'Albert Camus.',
  },
  {
    text: '\u201CTODO LO QUE HACEMOS REPETIDAMENTE NOS DEFINE. ',
    goldText: 'LA EXCELENCIA ES UN HÁBITO.\u201D',
    author: 'Aristóteles.',
  },
  {
    text: '\u201CATREVERSE ES PERDER EL EQUILIBRIO MOMENTÁNEAMENTE; ',
    goldText: 'NO ATREVERSE ES PERDERSE A UNO MISMO.\u201D',
    author: 'Søren Kierkegaard.',
  },
  {
    text: '\u201CEL VERDADERO MÉTODO SIGUE ',
    goldText: 'LA NATURALEZA DE LAS COSAS.\u201D',
    author: 'Edmund Husserl.',
  },
];

// ============================================================
// FONT REGISTRATION (lazy — runs on first PDF generation)
// ============================================================
let fontsReady = false;

export function ensureFonts() {
  if (fontsReady) return;
  pdfMake.vfs = {
    'Cinzel-Regular.ttf': CINZEL_REGULAR_BASE64,
    'Cinzel-Bold.ttf': CINZEL_BOLD_BASE64,
    'NunitoSans-Regular.ttf': NUNITO_SANS_REGULAR_BASE64,
    'NunitoSans-Bold.ttf': NUNITO_SANS_BOLD_BASE64,
    'NunitoSans-BoldItalic.ttf': NUNITO_SANS_BOLD_ITALIC_BASE64,
    'Roboto-Regular.ttf': ROBOTO_REGULAR_BASE64,
    'GreatVibes-Regular.ttf': GREAT_VIBES_REGULAR_BASE64,
  };
  pdfMake.fonts = {
    Cinzel: {
      normal: 'Cinzel-Regular.ttf',
      bold: 'Cinzel-Bold.ttf',
      italics: 'Cinzel-Regular.ttf',
      bolditalics: 'Cinzel-Bold.ttf',
    },
    NunitoSans: {
      normal: 'NunitoSans-Regular.ttf',
      bold: 'NunitoSans-Bold.ttf',
      italics: 'NunitoSans-Regular.ttf',
      bolditalics: 'NunitoSans-BoldItalic.ttf',
    },
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Regular.ttf',
      italics: 'Roboto-Regular.ttf',
      bolditalics: 'Roboto-Regular.ttf',
    },
    GreatVibes: {
      normal: 'GreatVibes-Regular.ttf',
      bold: 'GreatVibes-Regular.ttf',
      italics: 'GreatVibes-Regular.ttf',
      bolditalics: 'GreatVibes-Regular.ttf',
    },
  };
  fontsReady = true;
}

// ============================================================
// PAGE BUILDERS
// ============================================================

/**
 * Cover page: Cream background with centered El Templo logo
 */
function buildCoverPage(): Content[] {
  return [
    { text: ' ', fontSize: 1, margin: [0, 500, 0, 0] },
    { image: LOGO_BASE64, width: 1500, alignment: 'center' },
  ];
}

/**
 * Closing page: Logo at top + motivational quote with gold accent
 */
function buildClosingPage(quoteIndex: number): Content[] {
  const quote = QUOTES[quoteIndex % QUOTES.length];

  return [
    { text: '', pageBreak: 'before' as const },
    { text: '', margin: [0, 100, 0, 0] },
    // Logo image (small, centered at top)
    { image: LOGO_BASE64, width: 560, alignment: 'center' as const },
    { text: '', margin: [0, 200, 0, 0] },
    // Quote with navy + gold accent split
    {
      text: [
        { text: quote.text, color: NAVY },
        { text: quote.goldText, color: GOLD },
      ],
      fontSize: 130,
      bold: true,
      alignment: 'center' as const,
      lineHeight: 1.3,
      margin: [240, 0, 240, 0],
      font: 'Cinzel',
    },
    { text: '', margin: [0, 80, 0, 0] },
    {
      text: `\u2013 ${quote.author}`,
      fontSize: 128,
      alignment: 'center' as const,
      color: NAVY,
      font: 'GreatVibes',
    },
  ];
}

/**
 * INITIUM page: Simple exercise list (all levels same)
 * Vertically centered on the page for better visual balance.
 */
function buildInitiumPage(block: PdfBlockPage): Content[] {
  const exerciseGap = 32;

  return [
    { text: '', pageBreak: 'before' as const },
    { text: '', margin: [0, 120, 0, 0] },
    // Block name — always PYROS, large Cinzel bold
    {
      text: 'PYROS',
      fontSize: 260,
      bold: true,
      color: NAVY,
      margin: [250, 0, 0, 0],
      characterSpacing: 20,
      font: 'Cinzel',
    },
    // INITIUM · FORMAT (or custom title if set) — bolder
    // Phase 100 D-05: when customTitle is set, subtitle is the title alone (no "INITIUM · " prefix);
    // when null/empty, subtitle remains byte-identical to pre-phase output.
    {
      text:
        block.customTitle && block.customTitle.length > 0
          ? block.customTitle
          : `${block.role}  ·  ${block.formatName}`,
      fontSize: 130,
      bold: true,
      color: GOLD,
      margin: [260, 24, 0, 0],
      characterSpacing: 6,
      font: 'NunitoSans',
    },
    { text: '', margin: [0, 112, 0, 0] },
    // NIVEL ☉ α Δ Σ — kairos (☉ vector) primero, luego alfa/delta/sigma. El ☉ se
    // dibuja vectorial (Roboto no lo tiene), así que esto es un columns en vez de text.
    {
      columns: [
        {
          width: 'auto',
          text: 'NIVEL  ',
          fontSize: 100,
          color: GOLD,
          bold: true,
          font: 'NunitoSans',
        },
        kairosGlyphColumn(80, 30, 28),
        {
          width: 'auto',
          text: '  α Δ Σ',
          fontSize: 100,
          color: GOLD,
          bold: true,
          characterSpacing: 20,
          font: 'Roboto',
          // Baja los glyphs Roboto a la línea de NIVEL/☉ y separa del ☉ (UAT 2026-06-06)
          margin: [20, 14, 0, 0],
        },
      ],
      columnGap: 8,
      margin: [260, 0, 0, 0],
    },
    { text: '', margin: [0, 80, 0, 0] },
    // Exercise list — bigger font, tight spacing
    ...(block.simpleExercises || []).map((ex) => ({
      text: `•  ${ex}`,
      fontSize: 90,
      bold: true,
      color: NAVY,
      margin: [260, exerciseGap, 0, 0] as [number, number, number, number],
      font: 'NunitoSans',
    })),
    // Format params on the right
    block.formatParams
      ? {
          text: block.formatParams,
          fontSize: 140,
          bold: true,
          color: GOLD,
          alignment: 'right' as const,
          margin: [0, -320, 400, 0],
          font: 'NunitoSans',
        }
      : { text: '' },
  ];
}

// Level box column width: (3840 - 60 page margins - 120 grid margins - 100 gap) / 2 = 1780
const LEVEL_BOX_WIDTH = 1780;

/**
 * Level box: Exercise list for one level within a block.
 * @param targetBoxHeight - desired height for the exercise box (canvas rect)
 */
function buildLevelBox(lb: PdfLevelBlock, targetBoxHeight?: number): ContentStack {
  const symbol = LEVEL_SYMBOLS[lb.level] || lb.level.toUpperCase();
  // Calculate box height: use target if provided, otherwise fit content
  const exerciseCount = lb.exercises.length;
  const lineHeight = 84; // fontSize 64 + spacing
  const minBoxHeight = 80 + exerciseCount * lineHeight;
  const boxHeight = targetBoxHeight ? Math.max(targetBoxHeight, minBoxHeight) : minBoxHeight;
  const lineGap = 20;
  // Content height approximation (used to align flow cursor with canvas bottom)
  const contentHeight = exerciseCount * lineHeight;

  const exerciseLines = lb.exercises.map((ex) => {
    const contraction = CONTRACTION_ABBR[ex.contraction] || ex.contraction;
    const volume = buildExerciseVolume(ex);
    return {
      columns: [
        {
          text: `•  ${ex.name} ${contraction}`,
          fontSize: 64,
          bold: true,
          color: NAVY,
          width: '*',
          font: 'NunitoSans',
        },
        {
          text: volume,
          fontSize: 64,
          color: NAVY,
          width: 'auto',
          alignment: 'right' as const,
          bold: true,
          font: 'NunitoSans',
        },
      ],
      margin: [50, lineGap, 50, 0],
    };
  });

  const symbolSize = 86;
  // Phase 100 — use Spanish label from route-labels dictionary (falls back to code via getRouteLabel).
  const routeName = lb.routeLabel || getRouteLabel(lb.route);

  return {
    stack: [
      // Level header: "NIVEL α | Route Intensity%". Kairos draws its ☉ glyph as a
      // vector (Roboto lacks it), so its header is a columns row instead of a text run.
      lb.level === 'kairos'
        ? {
            columns: [
              {
                width: 'auto',
                text: 'NIVEL ',
                fontSize: 94,
                bold: true,
                color: GOLD,
                font: 'NunitoSans',
                characterSpacing: 4,
              },
              // topMargin/leftMargin: ☉ a la línea base de "NIVEL" y con el mismo
              // espacio que el α de las cajas no-kairos (UAT 2026-06-06).
              // rightMargin: aire entre el ☉ y el "|" (UAT 2026-06-12).
              kairosGlyphColumn(76, 26, 24, 12),
              {
                width: 'auto',
                text: `  |  ${routeName} ${lb.intensity}%`,
                fontSize: 84,
                bold: true,
                color: GOLD,
                font: 'NunitoSans',
              },
            ],
            columnGap: 8,
            margin: [0, 0, 0, 16],
          }
        : {
            text: [
              {
                text: 'NIVEL ',
                fontSize: 94,
                bold: true,
                color: GOLD,
                font: 'NunitoSans',
                characterSpacing: 4,
              },
              { text: `${symbol}`, fontSize: symbolSize, color: GOLD, bold: true, font: 'Roboto' },
              {
                text: `  |  ${routeName} ${lb.intensity}%`,
                fontSize: 84,
                bold: true,
                color: GOLD,
                font: 'NunitoSans',
              },
            ],
            margin: [0, 0, 0, 16],
          },
      // Exercise box with rounded border via canvas
      {
        canvas: [
          {
            type: 'rect' as const,
            x: 0,
            y: 0,
            w: LEVEL_BOX_WIDTH,
            h: boxHeight,
            r: 40,
            lineWidth: 8,
            lineColor: GOLD,
          },
        ],
      },
      // Exercise content overlapping the canvas rect (negative margin pulls it up).
      // Bottom margin ensures flow cursor aligns with the canvas rect bottom,
      // so the gap between rows is consistent regardless of exercise count.
      {
        stack: exerciseLines,
        margin: [20, -(boxHeight - 24), 20, Math.max(32, boxHeight - 24 - contentHeight)],
      },
    ],
  };
}

/**
 * Block page with 2x2 level grid (NUCLEUS/DEUTEROS/EPIKOS/ATHLOS)
 *
 * For full-page blocks, calculates target box height to fill the page.
 * Usable height: ~2128pt (2160 - 16 top - 16 bottom margins).
 */
function buildBlockPageWithGrid(block: PdfBlockPage, isHalf = false): Content[] {
  const levelBlocks = block.levelBlocks || [];
  // Slots fijos del grid 2x2: cada nivel tiene SIEMPRE la misma posición.
  // Un nivel ausente (p.ej. semana generada sin kairos) deja su slot vacío en
  // vez de desaparecer: así el nivel presente conserva su media página y la
  // caja de ancho fijo (LEVEL_BOX_WIDTH) no queda desfasada del texto.
  const findLevel = (level: string) => levelBlocks.find((lb) => lb.level === level);
  const topRow = [findLevel('kairos'), findLevel('alfa')];
  const bottomRow = [findLevel('delta'), findLevel('sigma')];

  const headerFontSize = isHalf ? 88 : 130;
  const mobilityFontSize = isHalf ? 56 : 68;

  // Set target box height to fill available space.
  // Full page: ~2128pt usable, half page: ~1063pt usable.
  // Chrome (header + mobility + spacers) ≈ 300pt half, 350pt full.
  // Level header above box ≈ 120pt.
  let targetBoxHeight: number | undefined;
  if (isHalf) {
    targetBoxHeight = 520;
  } else {
    targetBoxHeight = 560;
  }

  const content: Content[] = [];

  // Top margin (only for full-page blocks)
  if (!isHalf) {
    content.push({ text: '', margin: [0, 32, 0, 0] });
  }

  // Block header with subtle text shadow
  const headerText = `${block.role}  ·  ${block.formatName}`;
  // Shadow layer first (rendered behind via negative margin trick)
  content.push({
    text: headerText,
    fontSize: headerFontSize,
    bold: true,
    color: SAND,
    alignment: 'center' as const,
    characterSpacing: 6,
    font: 'Cinzel',
    opacity: 0.25,
    margin: [6, 4, 0, 0],
  });
  // Main text overlapping shadow
  content.push({
    text: headerText,
    fontSize: headerFontSize,
    bold: true,
    color: NAVY,
    alignment: 'center' as const,
    characterSpacing: 6,
    font: 'Cinzel',
    margin: [0, -(headerFontSize + 8), 0, 0],
  });

  // Mobility note (hardcoded fallback until data pipeline provides it)
  const mobilityText = block.mobility || 'ASSISTED SPAGAT DELTA 20"';
  content.push({
    text: `MOVILIDAD  ·  ${mobilityText}`,
    fontSize: mobilityFontSize,
    bold: true,
    color: GOLD,
    alignment: 'center' as const,
    margin: [0, 16, 0, 0],
    font: 'NunitoSans',
  });

  content.push({ text: '', margin: [0, isHalf ? 24 : 56, 0, 0] });

  // Una fila se renderiza si tiene al menos un nivel; los slots vacíos se
  // rellenan con una columna en blanco del mismo ancho para no romper el grid.
  const buildRow = (row: (PdfLevelBlock | undefined)[]): Content | null => {
    if (!row.some(Boolean)) return null;
    return {
      columns: row.map((lb) =>
        lb
          ? { ...buildLevelBox(lb, targetBoxHeight), width: '*' as const }
          : { text: '', width: '*' as const }
      ),
      columnGap: 100,
      margin: [60, 0, 60, 0],
    };
  };

  // Top row: ☉ kairos and α alfa
  const topContent = buildRow(topRow);
  if (topContent) content.push(topContent);

  content.push({ text: '', margin: [0, isHalf ? 24 : 48, 0, 0] });

  // Bottom row: Δ delta and Σ sigma
  const bottomContent = buildRow(bottomRow);
  if (bottomContent) content.push(bottomContent);

  return content;
}

/**
 * Full block page (NUCLEUS or EPIKOS/ATHLOS style)
 */
function buildFullBlockPage(block: PdfBlockPage): Content[] {
  return [{ text: '', pageBreak: 'before' as const }, ...buildBlockPageWithGrid(block, false)];
}

/**
 * Build a single level column for the DEUTEROS 4-column layout.
 * Compact: Greek symbol header + plain exercise list (no border box).
 * @param exFontSize - dynamic font size for exercises (computed by parent)
 */
function buildDeuterosLevelCol(lb: PdfLevelBlock, exFontSize: number): ContentStack {
  const symbol = LEVEL_SYMBOLS[lb.level] || lb.level.toUpperCase();
  const symbolSize = Math.round(exFontSize * 1.35);
  const routeFontSize = Math.round(exFontSize * 1.05);
  const lineGap = Math.round(exFontSize * 0.22);

  const exercises = lb.exercises.map((ex) => {
    const contraction = CONTRACTION_ABBR[ex.contraction] || ex.contraction;
    const volume = buildExerciseVolume(ex);
    return {
      columns: [
        {
          text: `• ${ex.name} ${contraction}`,
          fontSize: exFontSize,
          bold: true,
          color: NAVY,
          width: '*',
          font: 'NunitoSans',
        },
        {
          text: volume,
          fontSize: exFontSize,
          color: NAVY,
          width: 'auto',
          alignment: 'right' as const,
          bold: true,
          font: 'NunitoSans',
        },
      ],
      margin: [0, lineGap, 20, 0],
    };
  });

  // Phase 100 — prefer Spanish label; fall back to short code if the label is very long
  // (preserves the legacy behavior where long English names collapsed back to the code).
  const spanishLabel = lb.routeLabel || getRouteLabel(lb.route);
  const routeDisplay = spanishLabel.length > 18 ? lb.route : spanishLabel;

  return {
    stack: [
      // Level header: "α | Route Intensity%". Kairos draws its ☉ glyph as a vector.
      lb.level === 'kairos'
        ? {
            columns: [
              kairosGlyphColumn(Math.round(symbolSize * 0.7), Math.round(symbolSize * 0.18)),
              {
                width: 'auto',
                text: `  |  ${routeDisplay} ${lb.intensity}%`,
                fontSize: routeFontSize,
                bold: true,
                color: GOLD,
                font: 'NunitoSans',
              },
            ],
            columnGap: 6,
            margin: [0, 0, 0, Math.round(exFontSize * 0.5)],
          }
        : {
            text: [
              { text: `${symbol}`, fontSize: symbolSize, color: GOLD, bold: true, font: 'Roboto' },
              {
                text: `  |  ${routeDisplay} ${lb.intensity}%`,
                fontSize: routeFontSize,
                bold: true,
                color: GOLD,
                font: 'NunitoSans',
              },
            ],
            margin: [0, 0, 0, Math.round(exFontSize * 0.5)],
          },
      ...exercises,
    ],
  };
}

/**
 * Build one DEUTEROS half (4 columns across: α Δ Σ Ω)
 * @param exFontSize - dynamic font size for exercises (computed by parent)
 */
function buildDeuterosHalf(block: PdfBlockPage, exFontSize: number): Content[] {
  const levelBlocks = (block.levelBlocks || [])
    .slice()
    .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));

  const content: Content[] = [];

  // Block header with shadow — scale proportionally
  const headerSize = Math.round(exFontSize * 1.55);
  const headerText = `${block.role}  ·  ${block.formatName}`;
  content.push({
    text: headerText,
    fontSize: headerSize,
    bold: true,
    color: SAND,
    alignment: 'center' as const,
    characterSpacing: 6,
    font: 'Cinzel',
    opacity: 0.25,
    margin: [6, 4, 0, 0],
  });
  content.push({
    text: headerText,
    fontSize: headerSize,
    bold: true,
    color: NAVY,
    alignment: 'center' as const,
    characterSpacing: 6,
    font: 'Cinzel',
    margin: [0, -(headerSize + 8), 0, 0],
  });

  // Mobility
  const mobilitySize = Math.round(exFontSize * 0.85);
  const mobilityText = block.mobility || 'ASSISTED SPAGAT DELTA 20"';
  content.push({
    text: `MOVILIDAD  ·  ${mobilityText}`,
    fontSize: mobilitySize,
    bold: true,
    color: GOLD,
    alignment: 'center' as const,
    margin: [0, 8, 0, 12],
    font: 'NunitoSans',
  });

  content.push({ text: '', margin: [0, 16, 0, 0] });

  // 4 columns with vertical separator lines between levels
  if (levelBlocks.length > 0) {
    const cells = levelBlocks.map((lb) => ({
      ...buildDeuterosLevelCol(lb, exFontSize),
      margin: [30, 0, 30, 0],
    }));

    content.push({
      table: {
        widths: Array(levelBlocks.length).fill('*'),
        body: [cells],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i: number) => (i === 0 || i === levelBlocks.length ? 0 : 2),
        vLineColor: () => BORDER_MUTED,
        paddingTop: () => 0,
        paddingBottom: () => 0,
        paddingLeft: () => 20,
        paddingRight: () => 20,
      },
      margin: [40, 0, 40, 0],
    } as unknown as Content);
  }

  return content;
}

// Font size limits for DEUTEROS dynamic scaling
const DEUT_FONT_MIN = 44;
const DEUT_FONT_MAX = 64;

/**
 * Compute the largest exercise font size that fits a DEUTEROS half-page.
 *
 * Budget per half: 1063pt total.
 * Chrome (header + mobility + spacers) ≈ headerSize + mobilitySize + ~40pt gaps.
 * Each exercise line ≈ fontSize × 1.22 (font + line gap).
 * Level header ≈ fontSize × 1.85 (symbol + margin).
 */
function computeDeuterosFontSize(block: PdfBlockPage): number {
  const maxExercises = Math.max(...(block.levelBlocks || []).map((lb) => lb.exercises.length), 1);
  // Available height per half-page
  const halfHeight = 1063;
  // Chrome overhead scales with font size: header(1.55f) + mobility(0.85f) + gaps(~60pt)
  // Level header per column: symbolSize(1.35f) + margin(0.5f) = 1.85f
  // Exercise line: f + lineGap(0.22f) = 1.22f
  // Total: 60 + f*(1.55 + 0.85 + 1.85) + maxExercises * f * 1.22
  // 60 + f*(4.25 + maxExercises*1.22) = halfHeight
  // f = (halfHeight - 60) / (4.25 + maxExercises*1.22)
  const fontSize = Math.floor((halfHeight - 60) / (4.25 + maxExercises * 1.22));
  return Math.max(DEUT_FONT_MIN, Math.min(DEUT_FONT_MAX, fontSize));
}

/**
 * DEUTEROS split: Two pages, each with DEUT I (top) + DEUT II (bottom).
 * Page 1: α and Δ levels. Page 2: Σ and Ω levels.
 * Reuses the bordered level boxes from NUCLEUS/EPIKOS layout.
 */
function buildDeuterosSplitPages(deut1: PdfBlockPage, deut2: PdfBlockPage): Content[] {
  // Página 1 = topRow del grid (kairos+alfa), página 2 = bottomRow (delta+sigma).
  // DEBE espejar los filtros topRow/bottomRow de buildBlockPageWithGrid: si un par
  // cruza filas, cada nivel cae en una fila distinta y la caja se estira a página
  // completa (regresión kairos 2026-06-06).
  const levelPairs: [string, string][] = [
    ['kairos', 'alfa'],
    ['delta', 'sigma'],
  ];

  const content: Content[] = [];

  for (const [levelA, levelB] of levelPairs) {
    const filterLevels = (block: PdfBlockPage): PdfBlockPage => ({
      ...block,
      levelBlocks: (block.levelBlocks || []).filter(
        (lb) => lb.level === levelA || lb.level === levelB
      ),
    });

    const d1Filtered = filterLevels(deut1);
    const d2Filtered = filterLevels(deut2);

    // Skip page if no exercises for these levels in either block
    if (!d1Filtered.levelBlocks?.length && !d2Filtered.levelBlocks?.length) continue;

    const halfHeight = 1063;
    const pageContent: Content[] = [
      { text: '', pageBreak: 'before' as const },
      {
        table: {
          heights: [halfHeight, halfHeight],
          widths: ['*'],
          body: [
            [{ stack: buildBlockPageWithGrid(d1Filtered, true) as Content[] }],
            [{ stack: buildBlockPageWithGrid(d2Filtered, true) as Content[] }],
          ],
        },
        layout: {
          hLineWidth: (i: number) => (i === 1 ? 2 : 0),
          vLineWidth: () => 0,
          hLineColor: () => BORDER_MUTED,
          paddingTop: () => 0,
          paddingBottom: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
        },
      } as unknown as Content,
    ];

    content.push(...pageContent);
  }

  return content;
}

// ROM tier labels (replaces Greek symbols for ROM sessions)
const ROM_TIER_LABELS: Record<string, string> = {
  alfa: 'Básico',
  delta: 'Avanzado',
};

/**
 * ROM block page: PYROS/INITIUM-style clean layout with side-by-side tiers.
 * Big zone header, subtitle, then Básico (left) and Avanzado (right) exercise lists.
 * No bordered boxes — open, spacious layout like the INITIUM page.
 */
function buildRomBlockPage(block: PdfBlockPage): Content[] {
  const levelBlocks = block.levelBlocks || [];
  const exerciseGap = 32;

  const content: Content[] = [
    { text: '', pageBreak: 'before' as const },
    { text: '', margin: [0, 100, 0, 0] },
  ];

  // Zone header — large Cinzel, like PYROS: "ROM - TREN INFERIOR"
  const headerText = `ROM - ${block.role}`;
  content.push({
    text: headerText,
    fontSize: 200,
    bold: true,
    color: NAVY,
    alignment: 'center' as const,
    characterSpacing: 14,
    font: 'Cinzel',
  });

  // Format subtitle — all caps, italic, gold: "3 RONDAS - DESCANSO 30S"
  const subtitleText = (block.formatName || '3 Rondas · Descanso 30s')
    .toUpperCase()
    .replace(/·/g, '-');
  content.push({
    text: subtitleText,
    fontSize: 100,
    bold: true,
    italics: true,
    color: GOLD,
    alignment: 'center' as const,
    characterSpacing: 6,
    margin: [0, 24, 0, 0],
    font: 'NunitoSans',
  });

  content.push({ text: '', margin: [0, 120, 0, 0] });

  // Build tier column — clean layout with bordered box (like regular level boxes)
  const ROM_COL_BOX_WIDTH = 1700;
  const buildTierColumn = (lb: PdfLevelBlock) => {
    const tierLabel = ROM_TIER_LABELS[lb.level] || lb.level;
    const exerciseCount = lb.exercises.length;
    const lineHeight = 100;
    const lineGap = 24;
    const minBoxHeight = 80 + exerciseCount * lineHeight;
    const boxHeight = Math.max(800, minBoxHeight);
    const contentHeight = exerciseCount * lineHeight;

    const exerciseLines = lb.exercises.map((ex) => {
      const contraction = CONTRACTION_ABBR[ex.contraction] || ex.contraction;
      const volume = buildExerciseVolume(ex);
      return {
        columns: [
          {
            text: `\u2022  ${ex.name} ${contraction}`,
            fontSize: 72,
            bold: true,
            color: NAVY,
            width: '80%',
            font: 'NunitoSans',
          },
          {
            text: volume,
            fontSize: 72,
            color: NAVY,
            width: '20%',
            margin: [0, 0, 30, 0] as [number, number, number, number],
            alignment: 'right' as const,
            bold: true,
            font: 'NunitoSans',
          },
        ],
        margin: [50, lineGap, 50, 0] as [number, number, number, number],
      };
    });

    return {
      stack: [
        // Tier label — gold, like route names in regular blocks
        {
          text: tierLabel,
          fontSize: 100,
          bold: true,
          color: GOLD,
          font: 'NunitoSans',
          characterSpacing: 4,
          margin: [0, 0, 0, 24] as [number, number, number, number],
        },
        // Exercise box with rounded border
        {
          canvas: [
            {
              type: 'rect' as const,
              x: 0,
              y: 0,
              w: ROM_COL_BOX_WIDTH,
              h: boxHeight,
              r: 40,
              lineWidth: 8,
              lineColor: GOLD,
            },
          ],
        } as unknown as Content,
        // Exercise content overlapping the canvas rect
        {
          stack: exerciseLines,
          margin: [20, -(boxHeight - 24), 20, Math.max(32, boxHeight - 24 - contentHeight)] as [
            number,
            number,
            number,
            number,
          ],
        },
      ],
      width: '*',
    };
  };

  // Side-by-side: Básico left, Avanzado right
  const alfa = levelBlocks.find((lb) => lb.level === 'alfa');
  const delta = levelBlocks.find((lb) => lb.level === 'delta');

  if (alfa && delta) {
    content.push({
      columns: [
        buildTierColumn(alfa),
        { text: '', width: 120 }, // gap
        buildTierColumn(delta),
      ],
      margin: [100, 0, 100, 0],
    } as unknown as Content);
  } else {
    for (const lb of levelBlocks) {
      content.push(buildTierColumn(lb) as unknown as Content);
    }
  }

  return content;
}

/**
 * Build document content for a single day (6 pages)
 */
export function buildDayContent(day: PdfDaySession): Content[] {
  const content: Content[] = [];

  // 1. Cover page — use fit to constrain both width and height within the page
  content.push({
    image: LOGO_BASE64,
    fit: [1500, 1200] as [number, number],
    alignment: 'center' as const,
    margin: [0, 400, 0, 0] as [number, number, number, number],
  });

  // 2. Check if this is a ROM day
  const isRomDay = day.blocks.some((b) => b.isRom);

  if (isRomDay) {
    // ROM day: INITIUM warmup page + each zone gets its own page
    const initium = day.blocks.find((b) => b.role === 'INITIUM');
    if (initium) content.push(...buildInitiumPage(initium));
    for (const block of day.blocks) {
      if (block.role === 'INITIUM') continue; // already rendered above
      content.push(...buildRomBlockPage(block));
    }
  } else {
    // Regular day: standard block layout
    const initium = day.blocks.find((b) => b.role === 'INITIUM');
    const nucleus = day.blocks.find((b) => b.role === 'NUCLEUS');
    const deut1 = day.blocks.find((b) => b.role === 'DEUTEROS_1' || b.role === 'DEUTEROS I');
    const deut2 = day.blocks.find((b) => b.role === 'DEUTEROS_2' || b.role === 'DEUTEROS II');
    const epikos = day.blocks.find((b) => b.role === 'EPIKOS' || b.role === 'ATHLOS');

    if (initium) content.push(...buildInitiumPage(initium));
    if (nucleus) content.push(...buildFullBlockPage(nucleus));
    if (deut1 && deut2) {
      content.push(...buildDeuterosSplitPages(deut1, deut2));
    } else if (deut1) {
      content.push(...buildFullBlockPage(deut1));
    } else if (deut2) {
      content.push(...buildFullBlockPage(deut2));
    }
    if (epikos) content.push(...buildFullBlockPage(epikos));
  }

  // 3. Closing page (rotate quotes by week + day for variety)
  const dayOrder = ['LUNES', 'MARTES', 'MI\u00C9RCOLES', 'JUEVES', 'VIERNES', 'S\u00C1BADO'];
  const dayIdx = dayOrder.indexOf(day.dayName);
  content.push(...buildClosingPage(day.week * 7 + (dayIdx >= 0 ? dayIdx : 0)));

  return content;
}

/**
 * Build document definition with brand settings
 */
export function buildDocDefinition(content: Content[]): TDocumentDefinitions {
  return {
    content,
    pageSize: { width: 3840, height: 2160 },
    pageMargins: [30, 16, 30, 16],
    background: (_currentPage: number, pageSize: ContextPageSize) => [
      {
        canvas: [
          {
            type: 'rect' as const,
            x: 0,
            y: 0,
            w: pageSize.width,
            h: pageSize.height,
            color: BG_CREAM,
          },
        ],
      },
      {
        image: MARBLE_BG_BASE64,
        width: pageSize.width,
        height: pageSize.height,
        absolutePosition: { x: 0, y: 0 },
      },
    ],
    defaultStyle: {
      font: 'Cinzel',
      fontSize: 40,
      color: NAVY,
    },
  };
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Generate and download PDF for a single day session (6 pages)
 */
export function buildDayPdf(day: PdfDaySession): void {
  ensureFonts();
  const content = buildDayContent(day);
  const doc = buildDocDefinition(content);
  pdfMake
    .createPdf(doc)
    .download(
      `El-Templo-Planis-${formatWeekForFilename(day.week).dates}-${day.dayName}-${formatWeekForFilename(day.week).year}.pdf`
    );
}

/**
 * Generate and download PDF for a full week (6 pages × N days)
 */
export function buildWeekPdf(days: PdfDaySession[]): void {
  ensureFonts();
  // Concatenate all days: each day produces 6 pages
  const content = days.flatMap((day, i) => {
    const dayContent = buildDayContent(day);
    // Add page break between days (not before the first day)
    if (i > 0 && dayContent.length > 0) {
      (dayContent[0] as Content & { pageBreak?: string }).pageBreak = 'before';
    }
    return dayContent;
  });

  const doc = buildDocDefinition(content);
  const weekNum = days[0]?.week || 0;
  const { dates, year } = formatWeekForFilename(weekNum);
  pdfMake.createPdf(doc).download(`El-Templo-Planis-${dates}-${year}.pdf`);
}

/**
 * Generic PDF download (for custom document definitions)
 */
export function downloadPdf(docDefinition: TDocumentDefinitions, filename: string): void {
  ensureFonts();
  pdfMake.createPdf(docDefinition).download(filename);
}
