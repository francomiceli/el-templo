/**
 * Tipos cliente del módulo de Renovaciones (admin). Espejo de
 * `el-templo-api/src/modules/renewals/types.ts` y `schemas.ts` — ese es el
 * contrato de verdad; si este archivo diverge, es un bug de este archivo.
 *
 * Recordatorio del principio "derivado vs. persistido" (ver docblock del
 * service en la API): `status` se recalcula en CADA lectura desde
 * `subscriptions` y nunca se guarda. Lo único persistido es `messageCount`,
 * `manualStatus`, `reasonId`/`reasonNote` y quién/cuándo.
 */

export type RenewalStatus = 'renovo' | 'volvio_tarde' | 'pausada' | 'no_renovo' | 'en_proceso';

/** Los únicos dos valores que se PERSISTEN — 'renovo'/'volvio_tarde' jamás. */
export type RenewalManualStatus = 'en_proceso' | 'no_renovo';

export interface RenewalRow {
  subscriptionId: number;
  userId: number;
  memberName: string;
  phone: string | null;
  /**
   * Teléfono normalizado a E.164, para copiar al CRM (Kommo). `null` cuando
   * no se pudo normalizar con confianza — en ese caso la UI copia `phone`
   * crudo y avisa.
   */
  phoneE164: string | null;
  branchId: number;
  branchName: string;
  planId: number;
  planName: string;
  endDate: string;
  daysRemaining: number;
  status: RenewalStatus;
  /** Solo con contenido cuando `status === 'pausada'`. */
  pauseEndDate: string | null;
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
  /** `true` cuando lo manual dice 'no_renovo' pero el derivado (`status`, arriba) ganó y pisó lo manual. */
  manualOverridden: boolean;
  /** `status === 'en_proceso' && messageCount >= 4` (disparador de cierre). */
  paraCerrar: boolean;
  lastNote: { content: string; createdAt: string } | null;
}

export interface RenewalPlanDistributionEntry {
  planId: number;
  planName: string;
  count: number;
  percentage: number;
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

export interface RenewalListResult {
  rows: RenewalRow[];
  kpis: RenewalKpis;
  windowDays: number;
}

/**
 * `membresia` = todo menos el pase "Actividades con Aura"; `aura` = solo ese
 * pase; sin valor = todo. Espejo de `RenewalActivityType` de la API.
 */
export type RenewalActivityType = 'membresia' | 'aura';

export interface RenewalListParams {
  dateFrom: string;
  dateTo: string;
  branchId?: number;
  activityType?: RenewalActivityType;
}

/** PATCH parcial — solo los campos provistos cambian. */
export interface RenewalFollowupUpdateInput {
  messageCount?: number;
  manualStatus?: RenewalManualStatus;
  reasonId?: number | null;
  reasonNote?: string | null;
}

export interface RenewalNote {
  id: number;
  userId: number;
  authorId: number;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
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
