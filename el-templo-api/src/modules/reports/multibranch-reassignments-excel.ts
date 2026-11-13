/**
 * Export a Excel del histórico de recategorizaciones multisucursal
 * (Reportes → Recategorización). Pedido del dueño, 2026-11-13: "exportar a
 * Excel el total y cada mes".
 *
 * Funciones puras (sin DB ni reply): reciben las filas que devuelve
 * `ReportsService.getMultibranchReassignments` — así el archivo no puede decir
 * algo distinto de la pantalla.
 *
 *   - Sin `month`: hoja "Total" (todos los eventos del período, con una
 *     columna "Mes") + una hoja por mes ("Noviembre 2026"), la más nueva
 *     primero.
 *   - Con `month` (`AAAA-MM`): solo la hoja de ese mes.
 *
 * El agrupado es por mes UTC, igual que el admin
 * (`el-templo-admin/src/utils/recategorizacion-historico.ts`): el cron corre el
 * día 1 a las 07:00 UTC, así que el mes UTC es el mes "del cron" en cualquier
 * zona.
 */
import { Workbook } from "exceljs";
import { styleHeaderRow } from "../shared/excel";
import type { MultibranchReassignmentRow } from "./types";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

const DATE_FORMAT = "dd/mm/yyyy";
const PERCENT_FORMAT = "0%";
const SOURCE_LABELS: Record<MultibranchReassignmentRow["source"], string> = {
  cron: "Automático",
  backfill: "Reconstruido",
};

export interface ReassignmentMonthGroup {
  /** `AAAA-MM` (UTC). */
  key: string;
  /** "Noviembre 2026". */
  label: string;
  rows: MultibranchReassignmentRow[];
}

/** "2026-11" → "Noviembre 2026". */
export function reassignmentMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? key} ${year}`;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Agrupa por mes UTC, el más nuevo primero. Dentro de cada mes conserva el
 * orden de entrada (el servicio ya devuelve fecha descendente).
 */
export function groupReassignmentRowsByMonth(
  rows: MultibranchReassignmentRow[],
): ReassignmentMonthGroup[] {
  const byKey = new Map<string, MultibranchReassignmentRow[]>();
  for (const row of rows) {
    const key = monthKey(row.reassignedAt);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, groupRows]) => ({
      key,
      label: reassignmentMonthLabel(key),
      rows: groupRows,
    }));
}

/**
 * Día UTC del evento como fecha de Excel. exceljs serializa los `Date` por su
 * valor UTC, así que medianoche UTC da exactamente ese día en la planilla.
 */
function utcDay(iso: string): Date {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function addReassignmentsSheet(
  workbook: Workbook,
  name: string,
  rows: MultibranchReassignmentRow[],
  withMonthColumn: boolean,
): void {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = [
    { header: "Fecha", key: "date", width: 12, style: { numFmt: DATE_FORMAT } },
    { header: "Alumno", key: "memberName", width: 30 },
    { header: "ID alumno", key: "memberId", width: 11 },
    { header: "Sede anterior", key: "fromBranchName", width: 22 },
    { header: "Sede nueva", key: "toBranchName", width: 22 },
    {
      header: "Asistencias en la sede nueva",
      key: "toBranchAttendances",
      width: 16,
    },
    { header: "Asistencias totales", key: "totalAttendances", width: 14 },
    {
      header: "% en la sede nueva",
      key: "ratio",
      width: 14,
      style: { numFmt: PERCENT_FORMAT },
    },
    { header: "Origen", key: "source", width: 14 },
    ...(withMonthColumn ? [{ header: "Mes", key: "month", width: 18 }] : []),
  ];
  styleHeaderRow(sheet);
  sheet.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  for (const r of rows) {
    sheet.addRow({
      date: utcDay(r.reassignedAt),
      memberName: r.memberName,
      memberId: r.memberId,
      // "—" cuando no se conoce la sede de origen (backfill sin cobro previo).
      fromBranchName: r.fromBranchName ?? "—",
      toBranchName: r.toBranchName,
      toBranchAttendances: r.toBranchAttendances,
      totalAttendances: r.totalAttendances,
      // Fracción + formato `0%`: Excel muestra "80%" y sigue siendo número.
      // Sin asistencias totales no hay porcentaje: celda vacía.
      ratio:
        r.totalAttendances > 0
          ? r.toBranchAttendances / r.totalAttendances
          : "",
      source: SOURCE_LABELS[r.source],
      ...(withMonthColumn
        ? { month: reassignmentMonthLabel(monthKey(r.reassignedAt)) }
        : {}),
    });
  }
}

/**
 * Arma el libro. Con `month` (`AAAA-MM`) trae solo la hoja de ese mes (vacía,
 * con el encabezado, si ese mes no tuvo eventos en el período); sin `month`,
 * "Total" + una hoja por mes.
 */
export function buildReassignmentsWorkbook(
  rows: MultibranchReassignmentRow[],
  opts: { month?: string } = {},
): Workbook {
  const workbook = new Workbook();
  workbook.creator = "El Templo";
  workbook.created = new Date();

  const groups = groupReassignmentRowsByMonth(rows);

  if (opts.month !== undefined) {
    const group = groups.find((g) => g.key === opts.month);
    addReassignmentsSheet(
      workbook,
      reassignmentMonthLabel(opts.month),
      group?.rows ?? [],
      false,
    );
    return workbook;
  }

  addReassignmentsSheet(workbook, "Total", rows, true);
  for (const group of groups) {
    addReassignmentsSheet(workbook, group.label, group.rows, false);
  }
  return workbook;
}

/** `recategorizaciones-AAAA-MM.xlsx` (mes) o `recategorizaciones-total-AAAA-MM-DD.xlsx`. */
export function reassignmentsExportFilename(
  month: string | undefined,
  today: string,
): string {
  return month !== undefined
    ? `recategorizaciones-${month}.xlsx`
    : `recategorizaciones-total-${today}.xlsx`;
}
