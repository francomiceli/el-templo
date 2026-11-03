/**
 * Tipos cliente del Tablero semanal de gerencia (fase 206-08).
 *
 * Espejo de `el-templo-api/src/modules/weekly-board/types.ts` (y de `week.ts`
 * para `BoardBlockState`) — si cambia uno, cambia el otro. `BOARD_METRICS` NO se
 * copia: el orden de las filas viene en `metrics[]` de la respuesta.
 *
 * Toda la matemática (totales, porcentajes, semana anterior, variación) vive en
 * el API: la UI solo dibuja este contrato. Claves de los `Record` = id de sede
 * (string) o código de país.
 */

export type CountryCurrency = 'ARS' | 'EUR';

/** Cuándo se congela un bloque: `main` (lunes 00:05 AR) o `late` (viernes 00:05 AR). */
export type BoardFreezeBlock = 'main' | 'late';

/** Estado de un bloque: la foto decide la etiqueta (D-08, D-09, D-11). */
export type BoardBlockState = 'en_curso' | 'provisorio' | 'congelado' | 'sin_foto';

/** Bloque de la planilla al que pertenece una métrica. */
export type BoardMetricBlock = 'embudo' | 'renovaciones' | 'caja' | 'alumnos';

/** Cómo se muestra el número: conteo, plata (moneda del grupo) o porcentaje (0-100). */
export type BoardMetricUnit = 'count' | 'money' | 'pct';

/** Cuándo se congela la métrica; `leads` nunca entra a la foto (D-24). */
export type BoardMetricFreeze = BoardFreezeBlock | 'leads';

/** Nombres del API (`BoardBlockName`, `BoardUnit`), por si se prefieren al leer el contrato. */
export type BoardBlockName = BoardMetricBlock;
export type BoardUnit = BoardMetricUnit;

/** Filas de la planilla, en orden. 21 métricas. */
export type BoardMetricKey =
  | 'leads'
  | 'reservas'
  | 'asistieron'
  | 'compraron'
  | 'pctReserva'
  | 'pctAsistencia'
  | 'pctCierre'
  | 'pctConversion'
  | 'vencimientos'
  | 'renovaron'
  | 'noRenueva'
  | 'volvioTarde'
  | 'sinContactar'
  | 'pctRenovacion'
  | 'vencenSemanaSiguiente'
  | 'cobrado'
  | 'deudaCobrable'
  | 'deudaMas10'
  | 'deudaIncobrable'
  | 'activos'
  | 'variacionActivos';

/** Una celda: valor de la semana pedida y de la anterior (D-22). `null` = "—", nunca 0. */
export interface BoardCell {
  value: number | null;
  previous: number | null;
}

/** Una fila de la planilla con todas sus celdas. */
export interface BoardMetric {
  key: BoardMetricKey;
  block: BoardMetricBlock;
  unit: BoardMetricUnit;
  /** Id de sede física (string) -> celda. */
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
  online: { branchIds: number[]; label: 'Online' } | null;
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
  metric: 'cobrado' | 'deuda';
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
