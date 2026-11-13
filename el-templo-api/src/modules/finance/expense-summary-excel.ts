/**
 * Excel del Resumen de Egresos (fase 209, DI-12 y DI-13).
 *
 * Arma el libro con DOS hojas a partir de lo que ya calculó
 * `ExpenseSummaryService.getExportData` (un único `computeMonth`): acá no se
 * recalcula ni se redondea nada, así los números son los mismos que devuelve la
 * ruta JSON.
 *
 *   - "Resumen": una fila por destino (sedes, Casa Matriz solo en Argentina) y
 *     la fila Total en negrita. Las columnas salen de `summary.columns`, nunca
 *     de una lista fija de sedes. Una sede inactiva lleva " (inactiva)".
 *   - "Detalle": una fila por gasto y destino (destino, rubro, concepto...).
 *
 * Importes: números enteros con formato `#,##0` (nunca strings). Un texto que
 * empiece con `=` queda como celda de texto: exceljs solo evalúa fórmulas que
 * se declaran con `{ formula }` (T-209-36, aceptado).
 */
import { Workbook } from "exceljs";
import { styleHeaderRow } from "../shared/excel";
import {
  SUMMARY_TOTAL_KEY,
  type ExpenseExportData,
} from "./expense-summary-service";
import type { ExpenseCountry } from "./expense-types";

const NUMBER_FORMAT = "#,##0";

export const COUNTRY_LABELS: Record<ExpenseCountry, string> = {
  AR: "Argentina",
  ES: "España",
};

/** Nombre del destino con la marca de sede cerrada. */
function destinationLabel(name: string, isActive: boolean): string {
  return isActive ? name : `${name} (inactiva)`;
}

/** Da formato de importe entero a las celdas numéricas indicadas de una fila. */
function formatMoneyCells(
  sheet: ReturnType<Workbook["addWorksheet"]>,
  rowNumber: number,
  columnIndexes: readonly number[],
): void {
  const row = sheet.getRow(rowNumber);
  for (const index of columnIndexes) {
    row.getCell(index).numFmt = NUMBER_FORMAT;
  }
}

export function buildExpenseSummaryWorkbook(data: ExpenseExportData): Workbook {
  const { summary, rows } = data;
  const workbook = new Workbook();
  workbook.creator = "El Templo";
  workbook.created = new Date();

  // -- Hoja "Resumen" ---------------------------------------------------------
  const resumen = workbook.addWorksheet("Resumen");
  resumen.columns = [
    { header: "Destino", key: "destino", width: 30 },
    { header: "Pagado en el mes", key: "pagado", width: 20 },
    { header: "Costo del mes", key: "costo", width: 18 },
    { header: "De eso, estimado", key: "estimado", width: 20 },
    { header: "Pagado de ese costo", key: "costoPagado", width: 22 },
    { header: "Pendiente", key: "pendiente", width: 18 },
  ];
  // Un solo estilo de encabezado para todos los Excel de la app.
  styleHeaderRow(resumen);

  for (const column of summary.columns) {
    const row = resumen.addRow({
      destino: destinationLabel(column.name, column.isActive),
      pagado: column.paidInMonth,
      costo: column.cost,
      estimado: column.costEstimated,
      costoPagado: column.costPaid,
      pendiente: column.pending,
    });
    formatMoneyCells(resumen, row.number, [2, 3, 4, 5, 6]);
    if (column.key === SUMMARY_TOTAL_KEY) row.font = { bold: true };
  }

  // Contexto del libro: mes, país y moneda (los importes no llevan símbolo).
  resumen.addRow({});
  const context = resumen.addRow({
    destino: `Egresos ${summary.month} · ${COUNTRY_LABELS[summary.country]} · ${summary.currency}`,
  });
  context.font = { italic: true };

  // -- Hoja "Detalle" ---------------------------------------------------------
  const detalle = workbook.addWorksheet("Detalle");
  detalle.columns = [
    { header: "Destino", key: "destino", width: 30 },
    { header: "Rubro", key: "rubro", width: 26 },
    { header: "Concepto", key: "concepto", width: 40 },
    { header: "Beneficiario", key: "beneficiario", width: 28 },
    { header: "Mes de imputación", key: "mes", width: 20 },
    { header: "Estimado", key: "estimado", width: 12 },
    { header: "Costo del mes", key: "costo", width: 18 },
    { header: "Pendiente", key: "pendiente", width: 18 },
    { header: "Pagado en el mes", key: "pagado", width: 20 },
  ];
  styleHeaderRow(detalle);

  for (const r of rows) {
    const row = detalle.addRow({
      destino: destinationLabel(r.destination, r.destinationIsActive),
      rubro: r.costCenterName,
      concepto: r.concept,
      beneficiario: r.beneficiary ?? "",
      mes: r.imputationMonth,
      estimado: r.estimated ? "Sí" : "No",
      costo: r.cost,
      pendiente: r.pending,
      pagado: r.paidInMonth,
    });
    formatMoneyCells(detalle, row.number, [7, 8, 9]);
  }

  return workbook;
}
