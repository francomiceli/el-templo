/**
 * Session Image Builder
 *
 * Converts pdfmake-generated session PDFs into PNG image packs (one per page).
 * Uses pdf.js to render each page to canvas, then bundles into a ZIP via JSZip.
 *
 * PNG for lossless quality on large TV screens (sharp text, flat colors).
 * Used by coaches who display session pages on a TV — images are plug-and-play.
 */

import pdfMake from 'pdfmake/build/pdfmake';
import { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import { PdfDaySession } from './pdf-types';
import { formatWeekLabel } from '../weekDates';

// Set up pdf.js worker (once)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export type ProgressCallback = (message: string, percent: number) => void;

// Progress weight distribution (must sum to 100)
const WEIGHT_PREP = 5;
const WEIGHT_PDF = 15;
const WEIGHT_RENDER = 70;
const WEIGHT_ZIP = 10;

async function getBuilderFns() {
  const mod = await import('./session-pdf-builder');
  return {
    buildDayContent: mod.buildDayContent,
    buildDocDefinition: mod.buildDocDefinition,
    ensureFonts: mod.ensureFonts,
  };
}

/**
 * Generate a PDF buffer from a pdfmake document definition.
 *
 * Note: pdfmake's runtime getBuffer uses a callback despite what @types/pdfmake says.
 */
function pdfToBuffer(doc: TDocumentDefinitions): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = pdfMake.createPdf(doc);
       
      (pdfDoc as any).getBuffer((buffer: Uint8Array) => {
        resolve(buffer.buffer as ArrayBuffer);
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Render all pages of a PDF buffer to PNG blobs.
 * Each page is rendered at native resolution (3840×2160 for session PDFs).
 */
async function renderPdfToImages(
  pdfBuffer: ArrayBuffer,
  onProgress?: ProgressCallback
): Promise<Blob[]> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const images: Blob[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const pagePercent = WEIGHT_PREP + WEIGHT_PDF + Math.round((i / pdf.numPages) * WEIGHT_RENDER);
    onProgress?.(`Renderizando página ${i} de ${pdf.numPages}...`, pagePercent);

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvas, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error(`Failed to convert page ${i} to image`));
      }, 'image/png');
    });
    images.push(blob);
  }

  return images;
}

/**
 * Bundle image blobs into a ZIP and trigger browser download.
 */
async function downloadImageZip(
  images: Blob[],
  filenamePrefix: string,
  onProgress?: ProgressCallback
): Promise<void> {
  onProgress?.('Comprimiendo imágenes...', WEIGHT_PREP + WEIGHT_PDF + WEIGHT_RENDER);
  const zip = new JSZip();
  const padLen = String(images.length).length;

  for (let i = 0; i < images.length; i++) {
    const num = String(i + 1).padStart(padLen, '0');
    zip.file(`${filenamePrefix}-${num}.png`, images[i]);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  onProgress?.('Descargando...', WEIGHT_PREP + WEIGHT_PDF + WEIGHT_RENDER + WEIGHT_ZIP);
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate and download an image pack for a single day session.
 */
export async function buildDayPngZip(
  day: PdfDaySession,
  onProgress?: ProgressCallback
): Promise<void> {
  onProgress?.('Preparando documento...', WEIGHT_PREP);
  const { buildDayContent, buildDocDefinition, ensureFonts } = await getBuilderFns();
  ensureFonts();

  const content = buildDayContent(day);
  const doc = buildDocDefinition(content);

  onProgress?.('Generando PDF interno...', WEIGHT_PREP + WEIGHT_PDF);
  const buffer = await pdfToBuffer(doc);
  const images = await renderPdfToImages(buffer, onProgress);

  const prefix = `El-Templo-${formatWeekLabel(day.week).replace(/ /g, '')}-${day.dayName}`;
  await downloadImageZip(images, prefix, onProgress);
}

/**
 * Generate and download an image pack for a full week of sessions.
 */
export async function buildWeekPngZip(
  days: PdfDaySession[],
  onProgress?: ProgressCallback
): Promise<void> {
  onProgress?.('Preparando documento...', WEIGHT_PREP);
  const { buildDayContent, buildDocDefinition, ensureFonts } = await getBuilderFns();
  ensureFonts();

  const content = days.flatMap((day, i) => {
    const dayContent = buildDayContent(day);
    if (i > 0 && dayContent.length > 0) {
      (dayContent[0] as Content & { pageBreak?: string }).pageBreak = 'before';
    }
    return dayContent;
  });

  const doc = buildDocDefinition(content);

  onProgress?.('Generando PDF interno...', WEIGHT_PREP + WEIGHT_PDF);
  const buffer = await pdfToBuffer(doc);
  const images = await renderPdfToImages(buffer, onProgress);

  const weekNum = days[0]?.week || 0;
  const prefix = `El-Templo-${formatWeekLabel(weekNum).replace(/ /g, '')}`;
  await downloadImageZip(images, prefix, onProgress);
}
