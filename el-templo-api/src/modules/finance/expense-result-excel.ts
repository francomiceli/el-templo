/**
 * Excel del Resultado por sede (fase 211, DI-09 y DI-12).
 *
 * Sale del MISMO `ExpenseResult` que devuelve la ruta JSON: acá no se recalcula
 * ni se redondea nada. Una hoja, "Resultado": una columna por sede (las que
 * trae `result.columns`, nunca una lista fija), Casa Matriz solo en Argentina y
 * el Consolidado al final. Filas: cobros, un renglón por rubro, total de
 * costos, "De eso, estimado", resultado y margen.
 *
 * Importes: números enteros con formato `#,##0` (nunca strings). El margen es
 * el único decimal (`0.0%`) y sin cobros dice "sin base de cálculo". Un texto
 * que empiece con `=` queda como celda de texto: exceljs solo evalúa fórmulas
 * declaradas con `{ formula }` (T-209-36 / T-211-07, aceptado).
 */
import { Workbook } from "exceljs";
import { styleHeaderRow } from "../shared/excel";
import { RESULT_CONSOLIDATED_KEY } from "./expense-result-math";
import { COUNTRY_LABELS } from "./expense-summary-excel";
import type { ExpenseResult, ExpenseResultColumn } from "./expense-types";

const NUMBER_FORMAT = "#,##0";
const PERCENT_FORMAT = "0.0%";
const NOT_APPLICABLE = "—";
const NO_BASE_TEXT = "sin base de cálculo";

/** Nota fija al pie del Excel (DI-12). */
export const RESULT_FOOTNOTE =
  "Cobros: pagos de alumnos por fecha de pago, según la sede del alumno. Costos: gastos imputados al mes, incluidos los estimados. Las devoluciones no se restan.";

/** Encabezado de una columna con la marca de sede cerrada o virtual. */
export function resultColumnLabel(
  column: Pick<ExpenseResultColumn, "name" | "isActive" | "isVirtual">,
): string {
  const marks: string[] = [];
  if (!column.isActive) marks.push("inactiva");
  if (column.isVirtual) marks.push("virtual");
  return marks.length === 0
    ? column.name
    : `${column.name} (${marks.join(", ")})`;
}

type Cell = number | string;

export function buildExpenseResultWorkbook(result: ExpenseResult): Workbook {
  const { columns, costCenters } = result;
  const workbook = new Workbook();
  workbook.creator = "El Templo";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Resultado");
  sheet.columns = [
    { header: "Concepto", key: "concepto", width: 30 },
    ...columns.map((c) => ({
      header: resultColumnLabel(c),
      key: `col_${c.key}`,
      width: 18,
    })),
  ];
  styleHeaderRow(sheet);

  /** Agrega una fila de la tabla con un valor por columna. */
  const addTableRow = (
    label: string,
    valueOf: (column: ExpenseResultColumn) => Cell,
    options: { bold?: boolean; format?: string } = {},
  ): void => {
    const row = sheet.addRow([label, ...columns.map(valueOf)]);
    columns.forEach((column, index) => {
      const cell = row.getCell(index + 2);
      if (typeof cell.value === "number") {
        cell.numFmt = options.format ?? NUMBER_FORMAT;
      }
      if (column.key === RESULT_CONSOLIDATED_KEY) cell.font = { bold: true };
    });
    row.getCell(1).font = { bold: options.bold === true };
    if (options.bold) {
      columns.forEach((_, index) => {
        row.getCell(index + 2).font = { bold: true };
      });
    }
  };

  addTableRow("Cobros a alumnos", (c) =>
    c.kind === "casa_matriz" ? NOT_APPLICABLE : c.income,
  );
  for (const costCenter of costCenters) {
    addTableRow(
      costCenter.name,
      (c) => c.costsByCostCenter[String(costCenter.id)] ?? 0,
    );
  }
  addTableRow("Total costos", (c) => c.cost, { bold: true });
  addTableRow("De eso, estimado", (c) => c.costEstimated);
  addTableRow("Resultado", (c) => c.result, { bold: true });
  addTableRow(
    "Margen",
    (c) => {
      if (c.kind === "casa_matriz") return NOT_APPLICABLE;
      return c.marginPct === null ? NO_BASE_TEXT : c.marginPct / 100;
    },
    { format: PERCENT_FORMAT },
  );

  // Contexto del libro y nota de la base de cálculo (los importes no llevan símbolo).
  sheet.addRow([]);
  const title = sheet.addRow([
    `Resultado ${result.month} · ${COUNTRY_LABELS[result.country]} · ${result.currency}`,
  ]);
  title.font = { italic: true };
  const footnote = sheet.addRow([RESULT_FOOTNOTE]);
  footnote.font = { italic: true };

  return workbook;
}
