/**
 * Shared XLSX export helpers (exceljs), extracted from reports/routes.ts so
 * every module that ships an Excel download (reports, analytics) styles and
 * streams workbooks the same way.
 */

import { Workbook } from "exceljs";
import type { FastifyReply } from "fastify";

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
