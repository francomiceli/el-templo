/**
 * Export a Excel del módulo de Renovaciones (pedido de gestión, 2026-11-12):
 * "descargar un Excel con todos los datos que figuran según el período".
 *
 * Dos hojas, armadas desde el MISMO resultado que el listado
 * (`RenewalsService.listRenewals`) — así el archivo no puede decir algo
 * distinto de la pantalla:
 *   - "Renovaciones": una fila por vencimiento, con las columnas de la tabla
 *     más lo que en pantalla vive en tooltips (quién gestionó, detalle del
 *     motivo, fecha y autor de la observación).
 *   - "Resumen": período, filtros y los KPIs de las tarjetas + la
 *     distribución de plan nuevo.
 *
 * Las fechas se escriben como fechas de Excel (no texto) para que se puedan
 * ordenar y filtrar. Excel no tiene husos: las marcas de tiempo se escriben
 * con la hora de pared de la SEDE (ver `wallClockInTz`).
 */
import { Workbook } from "exceljs";
import { styleHeaderRow } from "../shared/excel";
import type {
  RenewalActivityType,
  RenewalListResult,
  RenewalRow,
  RenewalStatus,
} from "./types";

/**
 * Espejo de los labels de `el-templo-admin/src/utils/renewal-status.ts` — el
 * Excel tiene que decir lo mismo que el badge de la pantalla.
 */
export const RENEWAL_STATUS_LABELS: Record<RenewalStatus, string> = {
  renovo: "Renovó",
  volvio_tarde: "Volvió tarde",
  pausada: "Pausada",
  no_renovo: "No renueva",
  en_proceso: "En proceso",
};

const ACTIVITY_TYPE_LABELS: Record<RenewalActivityType, string> = {
  membresia: "Membresías",
  aura: "Actividades con Aura",
};

const DATE_FORMAT = "dd/mm/yyyy";
const DATETIME_FORMAT = "dd/mm/yyyy hh:mm";

/** Filtros con los que se pidió el listado — van a la hoja "Resumen". */
export interface RenewalExportFilters {
  dateFrom: string;
  dateTo: string;
  activityType?: RenewalActivityType;
}

/**
 * "YYYY-MM-DD" → fecha de Excel. exceljs serializa los `Date` por su valor
 * UTC, así que medianoche UTC da exactamente ese día en la planilla, sin
 * corrimiento por el huso del servidor.
 */
function dateOnly(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Instante ISO → `Date` cuyo valor UTC es la hora de pared en `tz`. Es la
 * forma de que la celda muestre "12/11/2026 10:30" (hora de la sede) y no la
 * hora UTC: exceljs escribe el valor UTC tal cual y Excel no convierte husos.
 * El resultado NO es un instante real — solo sirve para escribir la celda.
 */
export function wallClockInTz(iso: string | null, tz: string): Date | null {
  if (!iso) return null;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const num = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return new Date(
    Date.UTC(
      num("year"),
      num("month") - 1,
      num("day"),
      num("hour"),
      num("minute"),
    ),
  );
}

/** "YYYY-MM-DD" → "dd/MM/yyyy" (texto, para el rango del Resumen). */
function formatDayText(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function rowToCells(r: RenewalRow): Record<string, unknown> {
  return {
    memberName: r.memberName,
    planName: r.planName,
    endDate: dateOnly(r.endDate),
    branchName: r.branchName,
    // Mismo criterio que la celda de la tabla: el normalizado si existe, si
    // no el crudo tal como está en la ficha.
    phone: r.phoneE164 ?? r.phone ?? "",
    status: RENEWAL_STATUS_LABELS[r.status],
    pauseEndDate: dateOnly(r.pauseEndDate),
    messageCount: r.messageCount,
    paraCerrar: r.paraCerrar ? "Sí" : "No",
    followupUpdatedAt: wallClockInTz(r.followupUpdatedAt, r.branchTimezone),
    followupUpdatedByName: r.followupUpdatedByName ?? "",
    newPlanName: r.newPlanName ?? "",
    renewedAt: wallClockInTz(r.renewedAt, r.branchTimezone),
    reasonLabel: r.reasonLabel ?? "",
    reasonNote: r.reasonNote ?? "",
    lastNote: r.lastNote?.content ?? "",
    lastNoteAt: wallClockInTz(r.lastNote?.createdAt ?? null, r.branchTimezone),
    lastNoteAuthor: r.lastNote?.authorName ?? "",
  };
}

function addRowsSheet(workbook: Workbook, rows: RenewalRow[]): void {
  const sheet = workbook.addWorksheet("Renovaciones");
  sheet.columns = [
    { header: "Nombre", key: "memberName", width: 30 },
    { header: "Membresía vigente", key: "planName", width: 28 },
    {
      header: "Vencimiento",
      key: "endDate",
      width: 14,
      style: { numFmt: DATE_FORMAT },
    },
    { header: "Sucursal", key: "branchName", width: 20 },
    { header: "Celular", key: "phone", width: 18 },
    { header: "Estado", key: "status", width: 14 },
    {
      header: "Pausa hasta",
      key: "pauseEndDate",
      width: 14,
      style: { numFmt: DATE_FORMAT },
    },
    { header: "Mensajes", key: "messageCount", width: 10 },
    { header: "Para cerrar", key: "paraCerrar", width: 12 },
    {
      header: "Última gestión",
      key: "followupUpdatedAt",
      width: 18,
      style: { numFmt: DATETIME_FORMAT },
    },
    { header: "Gestionó", key: "followupUpdatedByName", width: 22 },
    { header: "Plan nuevo", key: "newPlanName", width: 28 },
    {
      header: "Renovó el",
      key: "renewedAt",
      width: 18,
      style: { numFmt: DATETIME_FORMAT },
    },
    { header: "Motivo", key: "reasonLabel", width: 24 },
    { header: "Detalle del motivo", key: "reasonNote", width: 36 },
    { header: "Observación", key: "lastNote", width: 50 },
    {
      header: "Fecha de la observación",
      key: "lastNoteAt",
      width: 22,
      style: { numFmt: DATETIME_FORMAT },
    },
    { header: "Autor de la observación", key: "lastNoteAuthor", width: 24 },
  ];
  styleHeaderRow(sheet);
  // Encabezado fijo al scrollear + filtro por columna: es una planilla de
  // trabajo, no un reporte para imprimir.
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  for (const r of rows) {
    sheet.addRow(rowToCells(r));
  }
}

function addSummarySheet(
  workbook: Workbook,
  result: RenewalListResult,
  filters: RenewalExportFilters,
): void {
  const { kpis, rows } = result;
  const sheet = workbook.addWorksheet("Resumen");
  sheet.columns = [{ width: 34 }, { width: 30 }, { width: 10 }];

  const branchNames = [...new Set(rows.map((r) => r.branchName))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );

  const bold = (rowNumber: number): void => {
    sheet.getRow(rowNumber).font = { bold: true };
  };

  sheet.addRow([
    "Período (vencimientos)",
    `${formatDayText(filters.dateFrom)} al ${formatDayText(filters.dateTo)}`,
  ]);
  sheet.addRow([
    "Tipo de actividad",
    filters.activityType ? ACTIVITY_TYPE_LABELS[filters.activityType] : "Todas",
  ]);
  sheet.addRow([
    "Sucursales con vencimientos",
    branchNames.length > 0 ? branchNames.join(", ") : "—",
  ]);
  sheet.addRow([]);

  const kpiHeader = sheet.addRow(["Indicador", "Valor"]);
  bold(kpiHeader.number);
  const rateRow = sheet.addRow([
    "% Renovación (sobre gestionados)",
    // Fracción + formato de porcentaje: Excel lo muestra "67%" y sigue
    // siendo un número. "—" cuando no hay ninguna sub gestionada.
    kpis.renewalRate != null ? kpis.renewalRate / 100 : "—",
  ]);
  if (kpis.renewalRate != null) rateRow.getCell(2).numFmt = "0%";
  sheet.addRow(["Vencimientos", kpis.total]);
  sheet.addRow(["Renovó", kpis.renovo]);
  sheet.addRow(["En proceso", kpis.enProceso]);
  sheet.addRow(["Sin contactar", kpis.sinContactar]);
  sheet.addRow(["Para cerrar", kpis.paraCerrar]);
  sheet.addRow(["Pausadas", kpis.pausadas]);
  sheet.addRow(["No renueva", kpis.noRenovo]);
  sheet.addRow(["Volvió tarde", kpis.volvioTarde]);

  if (kpis.newPlanDistribution.length > 0) {
    sheet.addRow([]);
    const distHeader = sheet.addRow([
      "Plan nuevo (entre renovaciones)",
      "Cantidad",
      "%",
    ]);
    bold(distHeader.number);
    for (const entry of kpis.newPlanDistribution) {
      const distRow = sheet.addRow([
        entry.planName,
        entry.count,
        entry.percentage / 100,
      ]);
      distRow.getCell(3).numFmt = "0%";
    }
  }
}

/**
 * Arma el libro del export. Función pura (sin DB ni reply): recibe el mismo
 * `RenewalListResult` que devuelve el listado.
 */
export function buildRenewalsWorkbook(
  result: RenewalListResult,
  filters: RenewalExportFilters,
): Workbook {
  const workbook = new Workbook();
  workbook.creator = "El Templo";
  workbook.created = new Date();
  addRowsSheet(workbook, result.rows);
  addSummarySheet(workbook, result, filters);
  return workbook;
}
