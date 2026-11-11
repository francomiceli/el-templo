/**
 * Shared XLSX export helpers (exceljs), extracted from reports/routes.ts so
 * every module that ships an Excel download (reports, analytics) styles and
 * streams workbooks the same way.
 */

import { Workbook } from "exceljs";
import type { FastifyReply } from "fastify";

// Seguridad (H11): NO se sanean las celdas acá. exceljs guarda los strings como
// celdas de texto tipadas y Excel no las evalúa como fórmula. El CSV sí se
// sanea (shared/csv.ts), porque ahí no hay tipos de celda.

/**
 * Style the header row with bold font and gray fill.
 */
export function styleHeaderRow(
  sheet: ReturnType<Workbook["addWorksheet"]>,
): void {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };
}

/**
 * Fase 207 (DI-05): formato numérico de las columnas de importe del circuito de
 * caja. Es un formato de Excel independiente del idioma: cada usuario lo ve con
 * sus separadores (es-AR: 77.570,82). NO escribir '#.##0,00': en el XML se
 * interpretaría al revés.
 */
export const MONEY_NUM_FMT = "#,##0.00";

/**
 * Aplica `MONEY_NUM_FMT` a las columnas de importe (por key). Llamar DESPUÉS de
 * asignar `sheet.columns`. El valor de la celda debe ser `number` (no string
 * formateado) para que Excel pueda sumar. Afecta también al encabezado, que es
 * texto: Excel ignora el formato numérico en texto.
 */
export function setMoneyColumnFormat(
  sheet: ReturnType<Workbook["addWorksheet"]>,
  keys: readonly string[],
): void {
  for (const key of keys) {
    sheet.getColumn(key).numFmt = MONEY_NUM_FMT;
  }
}

/**
 * Send an Excel workbook as a binary download response. The filename is
 * `<prefix>-<YYYY-MM-DD>.xlsx` (today's date).
 */
export async function sendExcelReply(
  workbook: Workbook,
  reply: FastifyReply,
  filenamePrefix: string,
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const today = new Date().toISOString().split("T")[0];
  const filename = `${filenamePrefix}-${today}.xlsx`;

  reply
    .header(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(Buffer.from(buffer as ArrayBuffer));
}
