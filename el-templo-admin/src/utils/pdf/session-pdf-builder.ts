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
import { CINZEL_REGULAR_BASE64, CINZEL_BOLD_BASE64, LOGO_BASE64 } from './pdf-assets';
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

// Motivational quotes for closing page
const QUOTES = [
  { text: '"LAS CADENAS DE LA DISCIPLINA SON LIGERAS COMPARADAS CON EL PESO DEL ARREPENTIMIENTO."', author: 'Jim Rohn' },
  { text: '"EL DOLOR QUE SIENTES HOY SERÁ LA FUERZA QUE SENTIRÁS MAÑANA."', author: 'Arnold Schwarzenegger' },
  { text: '"NO SE TRATA DE TENER TIEMPO. SE TRATA DE HACER TIEMPO."', author: 'Anónimo' },
  { text: '"LA MOTIVACIÓN ES LO QUE TE HACE EMPEZAR. EL HÁBITO ES LO QUE TE MANTIENE."', author: 'Jim Ryun' },
  { text: '"EL ÚNICO MAL ENTRENAMIENTO ES EL QUE NO SE HIZO."', author: 'Anónimo' },
];

// ============================================================
// FONT REGISTRATION
// ============================================================
// Register Cinzel font + fallback Roboto (pdfmake default)
pdfMake.vfs = {
  'Cinzel-Regular.ttf': CINZEL_REGULAR_BASE64,
  'Cinzel-Bold.ttf': CINZEL_BOLD_BASE64,
};

pdfMake.fonts = {
  Cinzel: {
    normal: 'Cinzel-Regular.ttf',
    bold: 'Cinzel-Bold.ttf',
    italics: 'Cinzel-Regular.ttf',
    bolditalics: 'Cinzel-Bold.ttf',
  },
  Roboto: {
    // pdfmake default - included automatically
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
};

// ============================================================
// PAGE BUILDERS
// ============================================================

/**
 * Cover page: Cream background with centered El Templo logo
 */
function buildCoverPage(): Content[] {
  return [
    { text: '', margin: [0, 150, 0, 0] },
    { image: LOGO_BASE64, width: 300, alignment: 'center' },
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
 */
function buildInitiumPage(block: PdfBlockPage): Content[] {
  const allLevels = LEVEL_ORDER.map(l => LEVEL_SYMBOLS[l]).join(' ');

  return [
    { text: '', pageBreak: 'before' as const },
    { text: '', margin: [0, 30, 0, 0] },
    // Block name (e.g., PYROS)
    {
      text: block.blockName || 'WARMUP',
      fontSize: 38,
      bold: true,
      color: NAVY,
      margin: [40, 0, 0, 0],
      characterSpacing: 2,
      font: 'Cinzel',
    },
    // INITIUM · FORMAT
    {
      text: `${block.role}  ·  ${block.formatName}`,
      fontSize: 16,
      color: GOLD,
      margin: [40, 4, 0, 0],
      characterSpacing: 1,
    },
    { text: '', margin: [0, 30, 0, 0] },
    // NIVEL α Δ Σ Ω
    {
      text: [
        { text: 'NIVEL  ', fontSize: 14, color: NAVY },
        { text: allLevels, fontSize: 14, color: NAVY, characterSpacing: 4 },
      ],
      margin: [40, 0, 0, 0],
    },
    { text: '', margin: [0, 16, 0, 0] },
    // Exercise list
    ...((block.simpleExercises || []).map(ex => ({
      text: `•  ${ex}`,
      fontSize: 14,
      color: NAVY,
      margin: [40, 6, 0, 0],
      bold: true,
    }))),
    // Format params on the right
    block.formatParams ? {
      text: block.formatParams,
      fontSize: 28,
      color: GOLD,
      alignment: 'right' as const,
      margin: [0, -80, 80, 0],
      opacity: 0.7,
    } : { text: '' },
  ];
}

/**
 * Level box: Exercise list for one level within a block
 */
function buildLevelBox(lb: PdfLevelBlock): any {
  const symbol = LEVEL_SYMBOLS[lb.level] || lb.level.toUpperCase();

  const exerciseLines: any[] = lb.exercises.map(ex => {
    const contraction = CONTRACTION_ABBR[ex.contraction] || ex.contraction;
    let volume = '';
    if (ex.seconds) volume = `${ex.seconds}"`;
    else if (ex.reps) volume = `${ex.reps}`;

    return {
      columns: [
        {
          text: `•  ${ex.name} ${contraction}`,
          fontSize: 9,
          color: NAVY,
          width: '*',
          bold: true,
        },
        {
          text: volume,
          fontSize: 9,
          color: NAVY,
          width: 50,
          alignment: 'right' as const,
          bold: true,
        },
      ],
      margin: [10, 3, 10, 0],
    };
  });

  return {
    stack: [
      // Level header: "NIVEL α | Route Intensity%"
      {
        text: [
          { text: 'NIVEL ', fontSize: 11, color: NAVY },
          { text: `${symbol}`, fontSize: 13, color: NAVY, bold: true, font: 'Cinzel' },
          { text: `  |  ${lb.route} ${lb.intensity}%`, fontSize: 10, color: NAVY },
        ],
        margin: [0, 0, 0, 6],
      },
      // Exercise box with border
      {
        table: {
          widths: ['*'],
          body: [[
            {
              stack: exerciseLines,
              margin: [4, 6, 4, 8],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => GOLD,
          vLineColor: () => GOLD,
          paddingTop: () => 0,
          paddingBottom: () => 0,
          paddingLeft: () => 2,
          paddingRight: () => 2,
        },
      },
    ],
  };
}

/**
 * Block page with 2x2 level grid (NUCLEUS/DEUTEROS/EPIKOS/ATHLOS)
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

  const headerFontSize = isHalf ? 16 : 22;
  const mobilityFontSize = isHalf ? 9 : 11;

  const content: Content[] = [];

  // Top margin (only for full-page blocks)
  if (!isHalf) {
    content.push({ text: '', margin: [0, 20, 0, 0] });
  }

  // Block header centered
  content.push({
    text: `${block.role}  ·  ${block.formatName}`,
    fontSize: headerFontSize,
    bold: true,
    color: NAVY,
    alignment: 'center' as const,
    characterSpacing: 1,
    font: 'Cinzel',
  });

  // Mobility note
  if (block.mobility) {
    content.push({
      text: `MOVILIDAD  ·  ${block.mobility}`,
      fontSize: mobilityFontSize,
      italics: true,
      color: GOLD,
      alignment: 'center' as const,
      margin: [0, 4, 0, 0],
    });
  }

  content.push({ text: '', margin: [0, isHalf ? 8 : 16, 0, 0] });

  // Top row: α and Δ
  if (topRow.length > 0) {
    content.push({
      columns: topRow.map(lb => ({
        ...buildLevelBox(lb),
        width: '*',
      })),
      columnGap: 30,
      margin: [20, 0, 20, 0],
    });
  }

  content.push({ text: '', margin: [0, isHalf ? 8 : 14, 0, 0] });

  // Bottom row: Σ and Ω
  if (bottomRow.length > 0) {
    content.push({
      columns: bottomRow.map(lb => ({
        ...buildLevelBox(lb),
        width: '*',
      })),
      columnGap: 30,
      margin: [20, 0, 20, 0],
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
 * DEUTEROS page: Two blocks stacked on one page
 */
function buildDeuterosPage(deut1: PdfBlockPage, deut2: PdfBlockPage): Content[] {
  return [
    { text: '', pageBreak: 'before' as const },
    { text: '', margin: [0, 8, 0, 0] },
    // DEUTEROS I (half page)
    ...buildBlockPageWithGrid(deut1, true),
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
      margin: [0, 10, 0, 10],
    },
    // DEUTEROS II (half page)
    ...buildBlockPageWithGrid(deut2, true),
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
      font: 'Roboto',
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
  const content = buildDayContent(day);
  const doc = buildDocDefinition(content);
  pdfMake.createPdf(doc).download(`El-Templo-S${day.week}-${day.dayName}.pdf`);
}

/**
 * Generate and download PDF for a full week (6 pages × N days)
 */
export function buildWeekPdf(days: PdfDaySession[]): void {
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
  pdfMake.createPdf(docDefinition).download(filename);
}
