/**
 * Contrato del Tablero semanal de gerencia (fase 206-05).
 *
 * `WeeklyBoardResponse` es lo que sirve `GET /api/admin/weekly-board` (206-06) y
 * lo que copia el admin (206-08). Toda la matemática (totales, porcentajes,
 * semana anterior, variación) vive en el API: la UI solo dibuja este contrato.
 *
 * Claves de los `Record` = id de sede o código de país, siempre como string.
 */
import type { CountryCurrency } from "../shared/currency";
import type { BoardBlockState, BoardFreezeBlock } from "./week";

export type { CountryCurrency, BoardBlockState, BoardFreezeBlock };

/** Bloque de la planilla al que pertenece una métrica. */
export type BoardBlockName = "embudo" | "renovaciones" | "caja" | "alumnos";

/** Cómo se muestra el número: conteo, plata (en la moneda del grupo) o porcentaje (0-100). */
export type BoardUnit = "count" | "money" | "pct";

/**
 * Cuándo se congela la métrica: `main` (lunes 00:05 AR), `late` (viernes 00:05
 * AR, con 4 días de margen, D-09/D-10) o `leads` (nunca entra a la foto, D-24).
 */
export type BoardMetricFreeze = BoardFreezeBlock | "leads";

/** Filas de la planilla, en orden. */
export type BoardMetricKey =
  | "leads"
  | "reservas"
  | "asistieron"
  | "compraron"
  | "pctReserva"
  | "pctAsistencia"
  | "pctCierre"
  | "pctConversion"
  | "vencimientos"
  | "renovaron"
  | "noRenueva"
  | "volvioTarde"
  | "sinContactar"
  | "pctRenovacion"
  | "vencenSemanaSiguiente"
  | "cobrado"
  | "deudaCobrable"
  | "deudaMas10"
  | "deudaIncobrable"
  | "activos"
  | "variacionActivos";

export interface BoardMetricDef {
  key: BoardMetricKey;
  block: BoardBlockName;
  unit: BoardUnit;
  freeze: BoardMetricFreeze;
}

/** Orden de filas de la planilla. 21 métricas. */
export const BOARD_METRICS: ReadonlyArray<BoardMetricDef> = [
  // Embudo (D-17, D-26). Leads viene de su propia tabla (D-24).
  { key: "leads", block: "embudo", unit: "count", freeze: "leads" },
  { key: "reservas", block: "embudo", unit: "count", freeze: "late" },
  { key: "asistieron", block: "embudo", unit: "count", freeze: "late" },
  { key: "compraron", block: "embudo", unit: "count", freeze: "late" },
  { key: "pctReserva", block: "embudo", unit: "pct", freeze: "late" },
  { key: "pctAsistencia", block: "embudo", unit: "pct", freeze: "late" },
  { key: "pctCierre", block: "embudo", unit: "pct", freeze: "late" },
  { key: "pctConversion", block: "embudo", unit: "pct", freeze: "late" },
  // Renovaciones (D-18). "Vencen la semana que viene" es del bloque principal.
  { key: "vencimientos", block: "renovaciones", unit: "count", freeze: "late" },
  { key: "renovaron", block: "renovaciones", unit: "count", freeze: "late" },
  { key: "noRenueva", block: "renovaciones", unit: "count", freeze: "late" },
  { key: "volvioTarde", block: "renovaciones", unit: "count", freeze: "late" },
  { key: "sinContactar", block: "renovaciones", unit: "count", freeze: "late" },
  { key: "pctRenovacion", block: "renovaciones", unit: "pct", freeze: "late" },
  {
    key: "vencenSemanaSiguiente",
    block: "renovaciones",
    unit: "count",
    freeze: "main",
  },
  // Caja y deuda (D-19, D-20).
  { key: "cobrado", block: "caja", unit: "money", freeze: "main" },
  { key: "deudaCobrable", block: "caja", unit: "money", freeze: "main" },
  { key: "deudaMas10", block: "caja", unit: "money", freeze: "main" },
  { key: "deudaIncobrable", block: "caja", unit: "money", freeze: "main" },
  // Alumnos (D-21).
  { key: "activos", block: "alumnos", unit: "count", freeze: "main" },
  { key: "variacionActivos", block: "alumnos", unit: "count", freeze: "main" },
];

/**
 * Una celda: el valor de la semana pedida y el de la semana anterior de la
 * misma sede/total (D-22). `null` = "—" (sin dato, nunca 0).
 */
export interface BoardCell {
  value: number | null;
  previous: number | null;
}

/** Una fila de la planilla con todas sus celdas. */
export interface BoardMetric {
  key: BoardMetricKey;
  block: BoardBlockName;
  unit: BoardUnit;
  /** Sede física -> celda. */
  byBranch: Record<string, BoardCell>;
  /** País -> celda del Total (solo sedes físicas del grupo, D-16). Vacío sin Total. */
  totalByCountry: Record<string, BoardCell>;
  /** País -> celda informativa Online (sedes virtuales, no suma al Total, D-25). Vacío sin Online. */
  onlineByCountry: Record<string, BoardCell>;
}

/** Grupo de columnas de un país (AR primero). */
export interface BoardGroup {
  country: string;
  currency: CountryCurrency;
  /** Sedes físicas activas visibles para el rol (D-15). */
  branches: Array<{ id: number; name: string }>;
  /** `false` para admin_sede: ve su sede sola, sin Total (D-02). */
  hasTotal: boolean;
  /** Columna informativa de las sedes virtuales activas del país (D-25). */
  online: { branchIds: number[]; label: "Online" } | null;
}

/** Estado de un bloque congelable de la semana pedida y de la anterior. */
export interface BoardBlockInfo {
  current: BoardBlockState;
  previous: BoardBlockState;
  /** Sello más reciente de la foto de la semana pedida (ISO), null sin foto. */
  capturedAt: string | null;
  /** La foto se sacó después del día esperado (job caído y recuperado). */
  capturedLate: boolean;
  /** Fecha (YYYY-MM-DD) en la que el bloque se congela; solo si está en vivo. */
  freezesOn: string | null;
}

/** Monto en una moneda distinta de la de la sede (no se suma, se avisa). */
export interface BoardWarning {
  branchId: number;
  metric: "cobrado" | "deuda";
  currency: string;
  amount: number;
}

export interface WeeklyBoardResponse {
  weekStart: string;
  weekEnd: string;
  previousWeekStart: string;
  currentWeekStart: string;
  isCurrentWeek: boolean;
  /** `true` si la semana pedida acepta carga de leads (en curso o anterior, D-24). */
  leadsEditable: boolean;
  groups: BoardGroup[];
  blocks: { main: BoardBlockInfo; late: BoardBlockInfo };
  metrics: BoardMetric[];
  warnings: BoardWarning[];
}

export interface LeadsUpsertInput {
  branchId: number;
  weekStart: string;
  /** `null` borra la carga. */
  leads: number | null;
}

export type LeadsUpsertResult = LeadsUpsertInput;

// ─── Tipos internos ──────────────────────────────────────────────────────────

/** Sede con la que se arma la matriz (física o virtual). */
export interface BoardBranch {
  id: number;
  name: string;
  country: string;
  isVirtual: boolean;
  currency: CountryCurrency;
}

/**
 * Bloque principal de una sede y semana (caja, deuda, alumnos). Los `null` de
 * deuda y activos significan "sin dato" (semana vieja sin foto, D-11).
 */
export interface MainBlockValues {
  cobrado: number | null;
  deudaCobrable: number | null;
  deudaMas10: number | null;
  deudaIncobrable: number | null;
  activos: number | null;
  vencenSemanaSiguiente: number | null;
}

/** Bloque tardío de una sede y semana: conteos crudos (D-26), 0 explícito si no hay. */
export interface LateBlockValues {
  reservas: number;
  reservasOcurridas: number;
  asistieron: number;
  compraron: number;
  compraronOcurridas: number;
  compraronAsistieron: number;
  vencimientos: number;
  renovaron: number;
  noRenueva: number;
  volvioTarde: number;
  sinContactar: number;
}

/**
 * Todo lo de una sede y semana. Un bloque `null` = la sede no tiene dato de ese
 * bloque (sin fila en la foto). Los porcentajes NUNCA viajan acá: se recalculan
 * desde los conteos (D-26).
 */
export interface BranchWeekValues {
  leads: number | null;
  main: MainBlockValues | null;
  late: LateBlockValues | null;
}
