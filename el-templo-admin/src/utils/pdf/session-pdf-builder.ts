/**
 * Session PDF Builder
 *
 * Generates El Templo-branded session PDFs using pdfmake.
 * Client-side generation - no server infrastructure needed.
 *
 * Design: Landscape A4, cream background, 2x2 level grids, Greek symbols.
 */

import pdfMake from 'pdfmake/build/pdfmake';
import { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import { CINZEL_REGULAR_BASE64, CINZEL_BOLD_BASE64, NUNITO_SANS_REGULAR_BASE64, NUNITO_SANS_BOLD_BASE64, NUNITO_SANS_BOLD_ITALIC_BASE64, ROBOTO_REGULAR_BASE64, LOGO_BASE64 } from './pdf-assets';
import { PdfDaySession, PdfBlockPage, PdfLevelBlock, PdfExercise } from './pdf-types';

// ============================================================
// BRAND DESIGN TOKENS (from visual guidelines)
// ============================================================
const BG_CREAM = '#F2EBE1';       // Crema Mármol - main background
const NAVY = '#24364A';           // Azul Profundo - headers, primary text
const GOLD = '#B08D6E';           // Oro Mate - accents, borders, subtitles
const SAND = '#DBCAB4';           // Arena Suave - card backgrounds
const STONE_GREY = '#8E8E8E';     // Gris Piedra - support text
const BORDER_MUTED = '#c5b9a8';   // Muted border color

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
  FL: 'Front Lever', FLR: 'Front Lever Row', BL: 'Back Lever',
  MU: 'Muscle Up', OAP: 'One Arm Pull Up', OAR: 'One Arm Row',
  TTB: 'Toe to Bar', 'MN/RP': 'Manna / Reverse Planche',
  PL: 'Planche', PLPU: 'Planche Push Up', HSPU: 'Handstand Push Up',
  HS: 'Handstand', PHS: 'Press Handstand', OAPU: 'One Arm Push Up',
  'HD/ID': 'Hefesto / Impossible Dip',
  PS: 'Pistol Squat', DS: 'Dragon Squat', NC: 'Nordic Curl',
  SS: 'Sissy Squat', QC: 'Quad Curl', HR: 'Ham Raises',
  HT: 'Hip Thrust', L: 'Lunge', SU: 'Step Up',
};

function getRouteName(code: string): string {
  return ROUTE_NAMES[code] || code;
}

// Motivational quotes for closing page
const QUOTES = [
  { text: '"LAS CADENAS DE LA DISCIPLINA SON LIGERAS COMPARADAS CON EL PESO DEL ARREPENTIMIENTO."', author: 'Jim Rohn' },
  { text: '"EL DOLOR QUE SIENTES HOY SERÁ LA FUERZA QUE SENTIRÁS MAÑANA."', author: 'Arnold Schwarzenegger' },
  { text: '"NO SE TRATA DE TENER TIEMPO. SE TRATA DE HACER TIEMPO."', author: 'Anónimo' },
  { text: '"LA MOTIVACIÓN ES LO QUE TE HACE EMPEZAR. EL HÁBITO ES LO QUE TE MANTIENE."', author: 'Jim Ryun' },
  { text: '"EL ÚNICO MAL ENTRENAMIENTO ES EL QUE NO SE HIZO."', author: 'Anónimo' },
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
    { image: LOGO_BASE64, width: 300, alignment: 'center', margin: [0, 50, 0, 0] },
  ];
}

/**
 * Closing page: Logo at top + motivational quote
 */
function buildClosingPage(quoteIndex: number): Content[] {
  const quote = QUOTES[quoteIndex % QUOTES.length];

  return [
    { text: '', pageBreak: 'before' as const },
    { text: '', margin: [0, 60, 0, 0] },
    {
      text: 'EL TEMPLO',
      fontSize: 16,
      bold: true,
      alignment: 'center' as const,
      color: NAVY,
      characterSpacing: 3,
    },
    {
      text: 'INDOOR CALISTHENICS',
      fontSize: 7,
      alignment: 'center' as const,
      color: STONE_GREY,
      characterSpacing: 2,
      margin: [0, 4, 0, 0],
    },
    { text: '', margin: [0, 80, 0, 0] },
    {
      text: quote.text,
      fontSize: 22,
      alignment: 'center' as const,
      color: NAVY,
      lineHeight: 1.4,
      margin: [40, 0, 40, 0],
      font: 'Cinzel',
    },
    { text: '', margin: [0, 20, 0, 0] },
    {
      text: `– ${quote.author}`,
      fontSize: 18,
      italics: true,
      alignment: 'center' as const,
      color: NAVY,
    },
  ];
}

/**
 * INITIUM page: Simple exercise list (all levels same)
 * Vertically centered on the page for better visual balance.
 */
function buildInitiumPage(block: PdfBlockPage): Content[] {
  const exerciseGap = 8;

  return [
    { text: '', pageBreak: 'before' as const },
    { text: '', margin: [0, 30, 0, 0] },
    // Block name — always PYROS, large Cinzel bold
    {
      text: 'PYROS',
      fontSize: 52,
      bold: true,
      color: NAVY,
      margin: [50, 0, 0, 0],
      characterSpacing: 3,
      font: 'Cinzel',
      opacity: 0.85,
    },
    // INITIUM · FORMAT — bolder
    {
      text: `${block.role}  ·  ${block.formatName}`,
      fontSize: 26,
      bold: true,
      color: GOLD,
      margin: [52, 6, 0, 0],
      characterSpacing: 1,
      font: 'NunitoSans',
    },
    { text: '', margin: [0, 28, 0, 0] },
    // NIVEL α Δ Σ Ω — bolder
    {
      text: [
        { text: 'NIVEL  ', fontSize: 20, color: GOLD, bold: true, font: 'NunitoSans' },
        { text: 'α', fontSize: 18, color: GOLD, bold: true, font: 'Roboto' },
        { text: ' Δ Σ Ω', fontSize: 16, color: GOLD, bold: true, characterSpacing: 4, font: 'Roboto' },
      ],
      margin: [52, 0, 0, 0],
    },
    { text: '', margin: [0, 20, 0, 0] },
    // Exercise list — bigger font, tight spacing
    ...((block.simpleExercises || []).map(ex => ({
      text: `•  ${ex}`,
      fontSize: 18,
      color: NAVY,
      margin: [52, exerciseGap, 0, 0],
      font: 'NunitoSans',
    }))),
    // Format params on the right
    block.formatParams ? {
      text: block.formatParams,
      fontSize: 28,
      color: GOLD,
      alignment: 'right' as const,
      margin: [0, -80, 80, 0],
      opacity: 0.7,
      font: 'NunitoSans',
    } : { text: '' },
  ];
}

// Approximate width of each level box column on landscape A4
// (842 - 80 page margins - 24 grid margins - 20 gap) / 2 ≈ 359
const LEVEL_BOX_WIDTH = 357;

/**
 * Level box: Exercise list for one level within a block.
 * @param targetBoxHeight - desired height for the exercise box (canvas rect)
 */
function buildLevelBox(lb: PdfLevelBlock, targetBoxHeight?: number): any {
  const symbol = LEVEL_SYMBOLS[lb.level] || lb.level.toUpperCase();

  // Calculate box height: use target if provided, otherwise fit content
  const exerciseCount = lb.exercises.length;
  const lineHeight = 21; // fontSize 16 + spacing
  const minBoxHeight = 20 + (exerciseCount * lineHeight);
  const boxHeight = targetBoxHeight ? Math.max(targetBoxHeight, minBoxHeight) : minBoxHeight;
  const lineGap = 5;
  // Content height approximation (used to align flow cursor with canvas bottom)
  const contentHeight = exerciseCount * lineHeight;

  const exerciseLines: any[] = lb.exercises.map(ex => {
    const contraction = CONTRACTION_ABBR[ex.contraction] || ex.contraction;
    let volume = '';
    if (ex.seconds) volume = `${ex.seconds}"`;
    else if (ex.reps) volume = `${ex.reps}`;

    return {
      columns: [
        {
          text: `•  ${ex.name} ${contraction}`,
          fontSize: 16,
          color: NAVY,
          width: '*',
          font: 'NunitoSans',
        },
        {
          text: volume,
          fontSize: 16,
          color: GOLD,
          width: 55,
          alignment: 'right' as const,
          bold: true,
          font: 'NunitoSans',
        },
      ],
      margin: [10, lineGap, 10, 0],
    };
  });

  const symbolSize = lb.level === 'alfa' ? 14 : 12;
  const routeName = getRouteName(lb.route);

  return {
    stack: [
      // Level header: "NIVEL α | Route Intensity%"
      {
        text: [
          { text: 'NIVEL ', fontSize: 15, bold: true, color: GOLD, font: 'NunitoSans' },
          { text: `${symbol}`, fontSize: symbolSize, color: GOLD, bold: true, font: 'Roboto' },
          { text: `  |  ${routeName} ${lb.intensity}%`, fontSize: 13, color: GOLD, font: 'NunitoSans' },
        ],
        margin: [0, 0, 0, 4],
      },
      // Exercise box with rounded border via canvas
      {
        canvas: [{
          type: 'rect' as const,
          x: 0,
          y: 0,
          w: LEVEL_BOX_WIDTH,
          h: boxHeight,
          r: 8,
          lineWidth: 1,
          lineColor: GOLD,
        }],
      },
      // Exercise content overlapping the canvas rect (negative margin pulls it up).
      // Bottom margin ensures flow cursor aligns with the canvas rect bottom,
      // so the gap between rows is consistent regardless of exercise count.
      {
        stack: exerciseLines,
        margin: [4, -(boxHeight - 6), 4, Math.max(8, boxHeight - 6 - contentHeight)],
      },
    ],
  };
}

/**
 * Block page with 2x2 level grid (NUCLEUS/DEUTEROS/EPIKOS/ATHLOS)
 *
 * For full-page blocks, calculates target box height to fill the page.
 * Landscape A4 usable height: ~525pt (595 - 40 top - 30 bottom margins).
 */
function buildBlockPageWithGrid(block: PdfBlockPage, isHalf = false): Content[] {
  const levelBlocks = block.levelBlocks || [];
  const topRow = levelBlocks.filter(lb => lb.level === 'alfa' || lb.level === 'delta');
  const bottomRow = levelBlocks.filter(lb => lb.level === 'sigma' || lb.level === 'omega');

  // Sort within rows
  const sortByLevel = (a: PdfLevelBlock, b: PdfLevelBlock) =>
    LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
  topRow.sort(sortByLevel);
  bottomRow.sort(sortByLevel);

  const headerFontSize = isHalf ? 18 : 26;
  const mobilityFontSize = isHalf ? 9 : 14;

  // For full-page blocks, set a target box height to fill more of the page.
  let targetBoxHeight: number | undefined;
  if (!isHalf) {
    targetBoxHeight = 140;
  }

  const content: Content[] = [];

  // Top margin (only for full-page blocks)
  if (!isHalf) {
    content.push({ text: '', margin: [0, 8, 0, 0] });
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
    characterSpacing: 1,
    font: 'Cinzel',
    opacity: 0.25,
    margin: [1, 1, 0, 0],
  });
  // Main text overlapping shadow
  content.push({
    text: headerText,
    fontSize: headerFontSize,
    bold: true,
    color: NAVY,
    alignment: 'center' as const,
    characterSpacing: 1,
    font: 'Cinzel',
    margin: [0, -(headerFontSize + 2), 0, 0],
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
    margin: [0, 4, 0, 0],
    font: 'NunitoSans',
  });

  content.push({ text: '', margin: [0, isHalf ? 6 : 14, 0, 0] });

  // Top row: α and Δ
  if (topRow.length > 0) {
    content.push({
      columns: topRow.map(lb => ({
        ...buildLevelBox(lb, targetBoxHeight),
        width: '*',
      })),
      columnGap: 20,
      margin: [12, 0, 12, 0],
    });
  }

  content.push({ text: '', margin: [0, isHalf ? 6 : 24, 0, 0] });

  // Bottom row: Σ and Ω
  if (bottomRow.length > 0) {
    content.push({
      columns: bottomRow.map(lb => ({
        ...buildLevelBox(lb, targetBoxHeight),
        width: '*',
      })),
      columnGap: 20,
      margin: [12, 0, 12, 0],
    });
  }

  return content;
}

/**
 * Full block page (NUCLEUS or EPIKOS/ATHLOS style)
 */
function buildFullBlockPage(block: PdfBlockPage): Content[] {
  return [
    { text: '', pageBreak: 'before' as const },
    ...buildBlockPageWithGrid(block, false),
  ];
}

/**
 * Build a single level column for the DEUTEROS 4-column layout.
 * Compact: Greek symbol header + plain exercise list (no border box).
 */
function buildDeuterosLevelCol(lb: PdfLevelBlock): any {
  const symbol = LEVEL_SYMBOLS[lb.level] || lb.level.toUpperCase();
  const symbolSize = lb.level === 'alfa' ? 17 : 15;

  const exercises: any[] = lb.exercises.map(ex => {
    const contraction = CONTRACTION_ABBR[ex.contraction] || ex.contraction;
    let volume = '';
    if (ex.seconds) volume = `${ex.seconds}"`;
    else if (ex.reps) volume = `${ex.reps}`;

    return {
      columns: [
        {
          text: `• ${ex.name} ${contraction}`,
          fontSize: 12,
          color: NAVY,
          width: '*',
          font: 'NunitoSans',
        },
        {
          text: volume,
          fontSize: 12,
          color: GOLD,
          width: 40,
          alignment: 'right' as const,
          bold: true,
          font: 'NunitoSans',
        },
      ],
      margin: [0, 3, 4, 0],
    };
  });

  return {
    stack: [
      // Level header: "α | Route Intensity%"
      {
        text: [
          { text: `${symbol}`, fontSize: symbolSize, color: GOLD, bold: true, font: 'Roboto' },
          { text: `  |  ${getRouteName(lb.route)} ${lb.intensity}%`, fontSize: 10.5, color: GOLD, font: 'NunitoSans' },
        ],
        margin: [0, 0, 0, 4],
      },
      ...exercises,
    ],
  };
}

/**
 * Build one DEUTEROS half (4 columns across: α Δ Σ Ω)
 */
function buildDeuterosHalf(block: PdfBlockPage): Content[] {
  const levelBlocks = (block.levelBlocks || []).slice().sort(
    (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level),
  );

  const content: Content[] = [];

  // Block header with shadow
  const headerText = `${block.role}  ·  ${block.formatName}`;
  content.push({
    text: headerText,
    fontSize: 18,
    bold: true,
    color: SAND,
    alignment: 'center' as const,
    characterSpacing: 1,
    font: 'Cinzel',
    opacity: 0.25,
    margin: [1, 1, 0, 0],
  });
  content.push({
    text: headerText,
    fontSize: 18,
    bold: true,
    color: NAVY,
    alignment: 'center' as const,
    characterSpacing: 1,
    font: 'Cinzel',
    margin: [0, -20, 0, 0],
  });

  // Mobility
  const mobilityText = block.mobility || 'ASSISTED SPAGAT DELTA 20"';
  content.push({
    text: `MOVILIDAD  ·  ${mobilityText}`,
    fontSize: 9,
    bold: true,
    italics: true,
    color: GOLD,
    alignment: 'center' as const,
    margin: [0, 3, 0, 0],
    font: 'NunitoSans',
  });

  content.push({ text: '', margin: [0, 8, 0, 0] });

  // 4 columns with vertical separator lines between levels
  if (levelBlocks.length > 0) {
    const cells = levelBlocks.map(lb => ({
      ...buildDeuterosLevelCol(lb),
      margin: [6, 0, 6, 0],
    }));

    content.push({
      table: {
        widths: Array(levelBlocks.length).fill('*'),
        body: [cells],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i: number) => (i === 0 || i === levelBlocks.length) ? 0 : 0.5,
        vLineColor: () => BORDER_MUTED,
        paddingTop: () => 0,
        paddingBottom: () => 0,
        paddingLeft: () => 4,
        paddingRight: () => 4,
      },
      margin: [8, 0, 8, 0],
    });
  }

  return content;
}

/**
 * DEUTEROS page: Two blocks stacked on one page, each with 4-column layout
 */
function buildDeuterosPage(deut1: PdfBlockPage, deut2: PdfBlockPage): Content[] {
  return [
    { text: '', pageBreak: 'before' as const },
    { text: '', margin: [0, 16, 0, 0] },
    // DEUTEROS I
    ...buildDeuterosHalf(deut1),
    // Divider
    {
      canvas: [
        {
          type: 'line' as const,
          x1: 60, y1: 0,
          x2: 700, y2: 0,
          lineWidth: 0.5,
          lineColor: BORDER_MUTED,
        },
      ],
      margin: [0, 22, 0, 22],
    },
    // DEUTEROS II
    ...buildDeuterosHalf(deut2),
  ];
}

/**
 * Build document content for a single day (6 pages)
 */
function buildDayContent(day: PdfDaySession): Content[] {
  const content: Content[] = [];

  // 1. Cover page
  content.push(...buildCoverPage());

  // 2. Process blocks
  const initium = day.blocks.find(b => b.role === 'INITIUM');
  const nucleus = day.blocks.find(b => b.role === 'NUCLEUS');
  const deut1 = day.blocks.find(b => b.role === 'DEUTEROS_1' || b.role === 'DEUTEROS I');
  const deut2 = day.blocks.find(b => b.role === 'DEUTEROS_2' || b.role === 'DEUTEROS II');
  const epikos = day.blocks.find(b => b.role === 'EPIKOS' || b.role === 'ATHLOS');

  if (initium) content.push(...buildInitiumPage(initium));
  if (nucleus) content.push(...buildFullBlockPage(nucleus));
  if (deut1 && deut2) content.push(...buildDeuterosPage(deut1, deut2));
  else if (deut1) content.push(...buildFullBlockPage(deut1));
  else if (deut2) content.push(...buildFullBlockPage(deut2));
  if (epikos) content.push(...buildFullBlockPage(epikos));

  // 3. Closing page (rotate quotes by week number)
  content.push(...buildClosingPage(day.week));

  return content;
}

/**
 * Build document definition with brand settings
 */
function buildDocDefinition(content: Content[]): TDocumentDefinitions {
  return {
    content,
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [40, 40, 40, 30],
    background: (currentPage: number, pageSize: any) => ({
      canvas: [
        { type: 'rect' as const, x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: BG_CREAM },
      ],
    }),
    defaultStyle: {
      font: 'Cinzel',
      fontSize: 10,
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
  pdfMake.createPdf(doc).download(`El-Templo-S${day.week}-${day.dayName}.pdf`);
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
      dayContent[0] = { ...dayContent[0], pageBreak: 'before' as const };
    }
    return dayContent;
  });

  const doc = buildDocDefinition(content);
  const weekNum = days[0]?.week || 0;
  pdfMake.createPdf(doc).download(`El-Templo-Semana-${weekNum}.pdf`);
}

/**
 * Generic PDF download (for custom document definitions)
 */
export function downloadPdf(docDefinition: TDocumentDefinitions, filename: string): void {
  ensureFonts();
  pdfMake.createPdf(docDefinition).download(filename);
}
