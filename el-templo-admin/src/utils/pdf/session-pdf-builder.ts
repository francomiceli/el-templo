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
  ContentColumns,
  ContentStack,
  ContextPageSize,
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
import { formatWeekLabel } from '../weekDates';

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

const LEVEL_ORDER = ['alfa', 'delta', 'sigma', 'omega'];

// Contraction abbreviations (matching example format: "CON.", "EXC.", "ISO.")
const CONTRACTION_ABBR: Record<string, string> = {
  CON: 'CON.',
  EXC: 'EXC.',
  ISO: 'ISO.',
};

// Route code → full display name (matches app's routeNames.ts)
const ROUTE_NAMES: Record<string, string> = {
  FL: 'Front Lever',
  FLR: 'Front Lever Row',
  BL: 'Back Lever',
  MU: 'Muscle Up',
  OAP: 'One Arm Pull Up',
  OAR: 'One Arm Row',
  TTB: 'Toe to Bar',
  'MN/RP': 'Manna / Reverse Planche',
  PL: 'Planche',
  PLPU: 'Planche Push Up',
  HSPU: 'Handstand Push Up',
  HS: 'Handstand',
  PHS: 'Press Handstand',
  OAPU: 'One Arm Push Up',
  'HD/ID': 'Hefesto / Impossible Dip',
  PS: 'Pistol Squat',
  DS: 'Dragon Squat',
  NC: 'Nordic Curl',
  SS: 'Sissy Squat',
  QC: 'Quad Curl',
  HR: 'Ham Raises',
  HT: 'Hip Thrust',
  L: 'Lunge',
  SU: 'Step Up',
};

function getRouteName(code: string): string {
  return ROUTE_NAMES[code] || code;
}

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

/** Build volume display string for an exercise */
function buildExerciseVolume(ex: PdfExercise): string {
  // Pyramid: per-exercise pattern
  if (ex.formatType === 'pyramid') {
    return buildPyramidVolume(ex);
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

function ensureFonts() {
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
    // INITIUM · FORMAT — bolder
    {
      text: `${block.role}  ·  ${block.formatName}`,
      fontSize: 130,
      bold: true,
      color: GOLD,
      margin: [260, 24, 0, 0],
      characterSpacing: 6,
      font: 'NunitoSans',
    },
    { text: '', margin: [0, 112, 0, 0] },
    // NIVEL α Δ Σ Ω — bolder
    {
      text: [
        { text: 'NIVEL  ', fontSize: 100, color: GOLD, bold: true, font: 'NunitoSans' },
        {
          text: 'α ',
          fontSize: 110,
          color: GOLD,
          bold: true,
          font: 'Roboto',
          characterSpacing: 10,
        },
        {
          text: ' Δ Σ Ω',
          fontSize: 80,
          color: GOLD,
          bold: true,
          characterSpacing: 20,
          font: 'Roboto',
        },
      ],
      margin: [260, 0, 0, 0],
    },
    { text: '', margin: [0, 80, 0, 0] },
    // Exercise list — bigger font, tight spacing
    ...(block.simpleExercises || []).map((ex) => ({
      text: `•  ${ex}`,
      fontSize: 90,
      color: NAVY,
      margin: [260, exerciseGap, 0, 0] as [number, number, number, number],
      font: 'NunitoSans',
    })),
    // Format params on the right
    block.formatParams
      ? {
          text: block.formatParams,
          fontSize: 140,
          color: GOLD,
          alignment: 'right' as const,
          margin: [0, -320, 400, 0],
          opacity: 0.7,
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
  const isPyramidBlock = lb.exercises.some((ex) => ex.formatType === 'pyramid');

  // Calculate box height: use target if provided, otherwise fit content
  const exerciseCount = lb.exercises.length;
  const lineHeight = 84; // fontSize 64 + spacing
  const minBoxHeight = 80 + exerciseCount * lineHeight;
  const boxHeight = targetBoxHeight ? Math.max(targetBoxHeight, minBoxHeight) : minBoxHeight;
  const lineGap = 20;
  // Content height approximation (used to align flow cursor with canvas bottom)
  const contentHeight = exerciseCount * lineHeight;

  const exerciseLines: ContentColumns[] = lb.exercises.map((ex) => {
    const contraction = CONTRACTION_ABBR[ex.contraction] || ex.contraction;
    const volume = buildExerciseVolume(ex);

    return {
      columns: [
        {
          text: `•  ${ex.name} ${contraction}`,
          fontSize: 64,
          color: NAVY,
          width: '*',
          font: 'NunitoSans',
        },
        {
          text: volume,
          fontSize: 64,
          color: GOLD,
          width: isPyramidBlock ? 480 : 276,
          alignment: 'right' as const,
          bold: true,
          font: 'NunitoSans',
        },
      ],
      margin: [50, lineGap, 50, 0],
    };
  });

  const symbolSize = 86;
  const routeName = getRouteName(lb.route);

  return {
    stack: [
      // Level header: "NIVEL α | Route Intensity%"
      {
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
  const topRow = levelBlocks.filter((lb) => lb.level === 'alfa' || lb.level === 'delta');
  const bottomRow = levelBlocks.filter((lb) => lb.level === 'sigma' || lb.level === 'omega');

  // Sort within rows
  const sortByLevel = (a: PdfLevelBlock, b: PdfLevelBlock) =>
    LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
  topRow.sort(sortByLevel);
  bottomRow.sort(sortByLevel);

  const headerFontSize = isHalf ? 72 : 130;
  const mobilityFontSize = isHalf ? 36 : 68;

  // For full-page blocks, set a target box height to fill more of the page.
  let targetBoxHeight: number | undefined;
  if (!isHalf) {
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
    italics: true,
    color: GOLD,
    alignment: 'center' as const,
    margin: [0, 16, 0, 0],
    font: 'NunitoSans',
  });

  content.push({ text: '', margin: [0, isHalf ? 24 : 56, 0, 0] });

  // Top row: α and Δ
  if (topRow.length > 0) {
    content.push({
      columns: topRow.map((lb) => ({
        ...buildLevelBox(lb, targetBoxHeight),
        width: '*',
      })),
      columnGap: 100,
      margin: [60, 0, 60, 0],
    });
  }

  content.push({ text: '', margin: [0, isHalf ? 24 : 48, 0, 0] });

  // Bottom row: Σ and Ω
  if (bottomRow.length > 0) {
    content.push({
      columns: bottomRow.map((lb) => ({
        ...buildLevelBox(lb, targetBoxHeight),
        width: '*',
      })),
      columnGap: 100,
      margin: [60, 0, 60, 0],
    });
  }

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
 */
function buildDeuterosLevelCol(lb: PdfLevelBlock): ContentStack {
  const symbol = LEVEL_SYMBOLS[lb.level] || lb.level.toUpperCase();
  const symbolSize = 76;
  const isPyramidBlock = lb.exercises.some((ex) => ex.formatType === 'pyramid');

  const exercises: ContentColumns[] = lb.exercises.map((ex) => {
    const contraction = CONTRACTION_ABBR[ex.contraction] || ex.contraction;
    const volume = buildExerciseVolume(ex);

    return {
      columns: [
        {
          text: `• ${ex.name} ${contraction}`,
          fontSize: 52,
          color: NAVY,
          width: '*',
          font: 'NunitoSans',
        },
        {
          text: volume,
          fontSize: 52,
          color: GOLD,
          width: isPyramidBlock ? 360 : 200,
          alignment: 'right' as const,
          bold: true,
          font: 'NunitoSans',
        },
      ],
      margin: [0, 12, 20, 0],
    };
  });

  return {
    stack: [
      // Level header: "α | Route Intensity%"
      {
        text: [
          { text: `${symbol}`, fontSize: symbolSize, color: GOLD, bold: true, font: 'Roboto' },
          {
            text: `  |  ${getRouteName(lb.route)} ${lb.intensity}%`,
            fontSize: 58,
            color: GOLD,
            font: 'NunitoSans',
          },
        ],
        margin: [0, 0, 0, 36],
      },
      ...exercises,
    ],
  };
}

/**
 * Build one DEUTEROS half (4 columns across: α Δ Σ Ω)
 */
function buildDeuterosHalf(block: PdfBlockPage): Content[] {
  const levelBlocks = (block.levelBlocks || [])
    .slice()
    .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));

  const content: Content[] = [];

  // Block header with shadow
  const headerText = `${block.role}  ·  ${block.formatName}`;
  content.push({
    text: headerText,
    fontSize: 88,
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
    fontSize: 88,
    bold: true,
    color: NAVY,
    alignment: 'center' as const,
    characterSpacing: 6,
    font: 'Cinzel',
    margin: [0, -96, 0, 0],
  });

  // Mobility
  const mobilityText = block.mobility || 'ASSISTED SPAGAT DELTA 20"';
  content.push({
    text: `MOVILIDAD  ·  ${mobilityText}`,
    fontSize: 52,
    bold: true,
    italics: true,
    color: GOLD,
    alignment: 'center' as const,
    margin: [0, 12, 0, 20],
    font: 'NunitoSans',
  });

  content.push({ text: '', margin: [0, 32, 0, 0] });

  // 4 columns with vertical separator lines between levels
  if (levelBlocks.length > 0) {
    const cells = levelBlocks.map((lb) => ({
      ...buildDeuterosLevelCol(lb),
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

/**
 * DEUTEROS page: Two blocks stacked on one page, each with 4-column layout
 */
function buildDeuterosPage(deut1: PdfBlockPage, deut2: PdfBlockPage): Content[] {
  // Usable height: 2160 - 16 top - 16 bottom = 2128. Divider line = 2pt.
  // Each half = (2128 - 2) / 2 ≈ 1063.
  const halfHeight = 1063;

  return [
    { text: '', pageBreak: 'before' as const },
    {
      table: {
        heights: [halfHeight, halfHeight],
        widths: ['*'],
        body: [
          [{ stack: buildDeuterosHalf(deut1) as Content[] }],
          [{ stack: buildDeuterosHalf(deut2) as Content[] }],
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
}

/**
 * Build document content for a single day (6 pages)
 */
function buildDayContent(day: PdfDaySession): Content[] {
  const content: Content[] = [];

  // 1. Cover page — use fit to constrain both width and height within the page
  content.push({
    image: LOGO_BASE64,
    fit: [1500, 1200] as [number, number],
    alignment: 'center' as const,
    margin: [0, 400, 0, 0] as [number, number, number, number],
  });

  // 2. Process blocks
  const initium = day.blocks.find((b) => b.role === 'INITIUM');
  const nucleus = day.blocks.find((b) => b.role === 'NUCLEUS');
  const deut1 = day.blocks.find((b) => b.role === 'DEUTEROS_1' || b.role === 'DEUTEROS I');
  const deut2 = day.blocks.find((b) => b.role === 'DEUTEROS_2' || b.role === 'DEUTEROS II');
  const epikos = day.blocks.find((b) => b.role === 'EPIKOS' || b.role === 'ATHLOS');

  if (initium) content.push(...buildInitiumPage(initium));
  if (nucleus) content.push(...buildFullBlockPage(nucleus));
  if (deut1 && deut2) content.push(...buildDeuterosPage(deut1, deut2));
  else if (deut1) content.push(...buildFullBlockPage(deut1));
  else if (deut2) content.push(...buildFullBlockPage(deut2));
  if (epikos) content.push(...buildFullBlockPage(epikos));

  // 3. Closing page (rotate quotes by week + day for variety)
  const dayOrder = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const dayIdx = dayOrder.indexOf(day.dayName);
  content.push(...buildClosingPage(day.week * 7 + (dayIdx >= 0 ? dayIdx : 0)));

  return content;
}

/**
 * Build document definition with brand settings
 */
function buildDocDefinition(content: Content[]): TDocumentDefinitions {
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
    .download(`El-Templo-${formatWeekLabel(day.week).replace(/ /g, '')}-${day.dayName}.pdf`);
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
  pdfMake.createPdf(doc).download(`El-Templo-${formatWeekLabel(weekNum).replace(/ /g, '')}.pdf`);
}

/**
 * Generic PDF download (for custom document definitions)
 */
export function downloadPdf(docDefinition: TDocumentDefinitions, filename: string): void {
  ensureFonts();
  pdfMake.createPdf(docDefinition).download(filename);
}
