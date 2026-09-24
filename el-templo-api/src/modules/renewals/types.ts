/**
 * Types — módulo de Renovaciones (2026-09-24, brief Nacho).
 *
 * Ver `service.ts` para el docblock completo del principio "derivado vs.
 * persistido": `status` (RenewalStatus) se recalcula en CADA lectura desde
 * `subscriptions` y nunca se guarda — lo único persistido es `messageCount`,
 * `manualStatus`, `reasonId`/`reasonNote` y quién/cuándo (`renewal_followups`).
 */

/** Estado derivado de una fila (SPEC §"Estado derivado"), en orden de precedencia. */
export type RenewalStatus =
  | "renovo"
  | "volvio_tarde"
  | "pausada"
  | "no_renovo"
  | "en_proceso";

/** Los únicos dos valores que se PERSISTEN — 'renovo'/'volvio_tarde' jamás. */
export type RenewalManualStatus = "en_proceso" | "no_renovo";

export interface RenewalRow {
  subscriptionId: number;
  userId: number;
  memberName: string;
  phone: string | null;
  branchId: number;
  branchName: string;
  planId: number;
  planName: string;
  endDate: string;
  daysRemaining: number;
  /** Estado derivado (recalculado en cada lectura, ver docblock del service). */
  status: RenewalStatus;
  /** Solo con contenido cuando `status === 'pausada'`. */
  pauseEndDate: string | null;
  /** Datos de la sub siguiente cuando `status` es 'renovo' o 'volvio_tarde'. */
  newPlanId: number | null;
  newPlanName: string | null;
  renewedAt: string | null;
  nextStartDate: string | null;
  /** Avance de contacto manual, 0–4. */
  messageCount: number;
  lastMessageAt: string | null;
  reasonId: number | null;
  reasonLabel: string | null;
  reasonNote: string | null;
  /** Lo persistido en `renewal_followups.manual_status`, SIN pisar por el derivado. */
  manualStatus: RenewalManualStatus;
  /**
   * `true` cuando lo manual dice 'no_renovo' pero el derivado (arriba, `status`)
   * dio 'renovo'/'volvio_tarde' — el derivado ganó y pisó lo manual (brief
   * §"validaciones": "el renovó por pago pisa lo manual").
   */
  manualOverridden: boolean;
  /** `status === 'en_proceso' && messageCount >= 4` (disparador de cierre). */
  paraCerrar: boolean;
  lastNote: { content: string; createdAt: string } | null;
}

export interface RenewalKpis {
  total: number;
  renovo: number;
  volvioTarde: number;
  noRenovo: number;
  enProceso: number;
  /** en_proceso con messageCount === 0. */
  sinContactar: number;
  pausadas: number;
  paraCerrar: number;
  /** renovo / (renovo + noRenovo + volvioTarde) × 100. `null` si el denominador es 0. */
  renewalRate: number | null;
  newPlanDistribution: RenewalPlanDistributionEntry[];
}

export interface RenewalPlanDistributionEntry {
  planId: number;
  planName: string;
  count: number;
  percentage: number;
}

export interface RenewalListFilters {
  dateFrom: string;
  dateTo: string;
  branchId?: number;
  country?: "AR" | "ES";
}

export interface RenewalListResult {
  rows: RenewalRow[];
  kpis: RenewalKpis;
  windowDays: number;
}

/** PATCH parcial — solo los campos provistos cambian (mismo contrato que DebtManagementUpdateInput). */
export interface RenewalFollowupUpdateInput {
  messageCount?: number;
  manualStatus?: RenewalManualStatus;
  reasonId?: number | null;
  reasonNote?: string | null;
}

/**
 * Alcance del actor para las rutas direccionadas por `subscriptionId`
 * (PATCH, notes) — no llevan `branchId` en el payload, así que el recorte por
 * sede forzada no lo puede hacer un preHandler (mismo patrón que
 * `ReportsService.updateDebtManagement`, `reports/service.ts`).
 */
export interface RenewalActorScope {
  userId: number;
  isOwner: boolean;
  country: "AR" | "ES" | null;
  /** `enforcedBranchIds(scope)` — `null`/ausente = sin alcance forzado. */
  branchIds?: number[] | null;
}

export interface RenewalReason {
  id: number;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

export interface RenewalReasonCreateInput {
  label: string;
}

export interface RenewalReasonUpdateInput {
  label?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface RenewalTemplate {
  step: number;
  body: string;
  updatedAt: string;
}

export interface RenewalTemplateUpdateInput {
  body: string;
}
