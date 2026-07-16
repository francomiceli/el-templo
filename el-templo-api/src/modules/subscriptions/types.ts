/**
 * Subscriptions Module Types
 *
 * Interfaces for subscription plans CRUD, subscription lifecycle,
 * and pricing engine with AURA discount integration.
 */

import type { PaymentMethod } from "../finance/types";
import type { AdminRole } from "../shared/permissions";

// ─── Enum Union Types ────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | "active"
  | "paused"
  | "cancelled"
  | "expired"
  | "completed"
  | "changed"
  | "scheduled";
export type PlanTier = "flex" | "foundation" | "performance" | "other";
export type BookingMode = "fixed" | "flexible";
export type PriceType = "regular" | "zero" | "credit_card";
export type PromoType = "auto" | "admin_assignable";
export type PlanCategory =
  | "presencial"
  | "online_regular"
  | "online_goal"
  | "online_coach"
  | "especial"; // Fase 161 (PASE-01): pase "Actividades con Aura".

/**
 * Fase 161: grupo de categoría de 3 valores. El binario `isOnlinePlan` colapsa
 * especial con online (especial !== "presencial" → true), lo que dispararía el
 * conflicto "ya tiene online" en assignPlan. Usar `categoryGroup` para rutear
 * por grupo (presencial / online / especial) — el pase es una categoría paralela.
 */
export type CategoryGroup = "presencial" | "online" | "especial";
export function categoryGroup(c: PlanCategory): CategoryGroup {
  if (c === "presencial") return "presencial";
  if (c === "especial") return "especial";
  return "online";
}

/**
 * NOTA PARA EL PLAN 02: `isOnlinePlan` NO se refina acá a propósito. Callsites a
 * migrar al criterio `categoryGroup` cuando el Plan 02 reescriba el conflicto de
 * assign: member-routes.ts:194-195, service.ts:251 y service.ts:1249. Hoy
 * `isOnlinePlan('especial') === true` (especial lumpeado con online) — aceptable
 * como estado transitorio porque no hay planes especiales asignables por el flujo
 * de conflicto hasta que el Plan 02 lo separe.
 */
export function isOnlinePlan(category: PlanCategory): boolean {
  return category !== "presencial";
}
export function isGoalPlan(category: PlanCategory): boolean {
  return category === "online_goal";
}
export function isCoachPlan(category: PlanCategory): boolean {
  return category === "online_coach";
}

// ─── AURA Discount Tiers ────────────────────────────────────────────────────

export interface AuraDiscountTier {
  spend: number;
  percent: number;
}

export const AURA_DISCOUNT_TIERS: readonly AuraDiscountTier[] = [
  { spend: 500, percent: 5 },
  { spend: 1000, percent: 10 },
  { spend: 2000, percent: 20 },
  { spend: 5000, percent: 30 },
] as const;

// ─── Plan Types ─────────────────────────────────────────────────────────────

export interface PlanListItem {
  id: number;
  name: string;
  description: string | null;
  planTier: PlanTier;
  bookingMode: BookingMode;
  priceRegular: number;
  priceZero: number;
  priceCreditCard: number | null;
  durationDays: number;
  classesPerWeek: number | null;
  /**
   * Fase 161 (PASE-01, D-03/D-04): budget mensual EXPLÍCITO del pase especial.
   * NULL para planes no-especiales (su budget deriva de classesPerWeek). El
   * assign/renew usa esta columna cuando classesPerWeek es NULL.
   */
  monthlyClassBudget: number | null;
  /**
   * Fase 161 (D-01): discriminador Socio↔Externo del pase especial. true = pase
   * Socio (exige presencial activo al asignar/renovar), false = Externo. Los
   * planes no-especiales lo tienen en false y no lo consultan.
   */
  requiresPresencial: boolean;
  multiBranch: boolean;
  isTrial: boolean;
  isGroup: boolean;
  planCategory: PlanCategory;
  goalPlanType: string | null;
  linkedProgramId: number | null;
  groupMaxMembers: number | null;
  isActive: boolean;
  isArchived: boolean;
  country: "AR" | "ES";
  currency: "ARS" | "EUR";
  grantsAllPrograms: boolean;
  /**
   * Explicit list of programs this plan grants (D-06). Empty when the plan
   * uses grantsAllPrograms or grants no online program. Ignored when
   * grantsAllPrograms is true (all takes priority).
   */
  programIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanDetail extends PlanListItem {}

// ─── Bulk Migration Types ──────────────────────────────────────────────────

export interface BulkMigrateInput {
  userIds: number[];
  targetPlanId: number;
  targetBranchId: number;
}

export interface BulkMigrateResult {
  migrated: number;
  skipped: number;
  errors: Array<{ userId: number; error: string }>;
}

export interface CreatePlanInput {
  name: string;
  description?: string;
  planTier: PlanTier;
  bookingMode: BookingMode;
  priceRegular: number;
  priceZero: number;
  priceCreditCard?: number;
  durationDays: number;
  classesPerWeek?: number;
  multiBranch?: boolean;
  isTrial?: boolean;
  isGroup?: boolean;
  planCategory?: PlanCategory;
  linkedProgramId?: number;
  groupMaxMembers?: number;
  grantsAllPrograms?: boolean;
  /** Explicit multi-program access list (D-06); persisted in plan_programs. */
  programIds?: number[];
  country?: "AR" | "ES";
}

export interface UpdatePlanInput {
  name?: string;
  description?: string | null;
  planTier?: PlanTier;
  bookingMode?: BookingMode;
  priceRegular?: number;
  priceZero?: number;
  priceCreditCard?: number | null;
  durationDays?: number;
  classesPerWeek?: number | null;
  multiBranch?: boolean;
  isTrial?: boolean;
  isGroup?: boolean;
  planCategory?: PlanCategory;
  linkedProgramId?: number | null;
  groupMaxMembers?: number | null;
  grantsAllPrograms?: boolean;
  /**
   * When provided, replaces the plan's program list (delete+insert). Omit to
   * leave the current list untouched (D-06).
   */
  programIds?: number[];
}

// ─── Subscription Types ─────────────────────────────────────────────────────

export interface SubscriptionDetail {
  id: number;
  userId: number;
  planId: number;
  planName: string;
  planTier: PlanTier;
  planCategory: PlanCategory;
  branchId: number;
  branchName: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string | null;
  pricePaid: number;
  priceTypeApplied: PriceType;
  auraDiscount: number | null;
  auraDiscountPercent: number | null;
  // Descuento de referido aplicado en el cobro de ESTE período (null si no
  // hubo). pricePaid ya lo tiene restado; la renovación lo re-suma (add-back)
  // antes de aplicar el % vigente del ciclo nuevo.
  referralDiscountPercent: number | null;
  referralDiscountAmount: number | null;
  boardingPassUsed: boolean;
  priceOverrideAmount: number | null;
  priceOverrideReason: string | null;
  pausedAt: string | null;
  pauseEndDate: string | null;
  resumedAt: string | null;
  cancelledAt: string | null;
  classesRemaining: number | null;
  classesBudget: number | null;
  previousSubscriptionId: number | null;
  replacementCredits: number;
  scheduleIds: number[];
  notes: string | null;
  currency: "ARS" | "EUR";
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionHistoryItem extends SubscriptionDetail {}

export interface ChangeFixedSchedulesInput {
  scheduleIds: number[];
  reason?: string;
}

export interface SubscriptionScheduleChangeEntry {
  id: number;
  subscriptionId: number;
  actorId: number;
  actorName: string | null;
  oldScheduleIds: number[];
  newScheduleIds: number[];
  reason: string | null;
  createdAt: string;
}

// ─── Class Usage Types ─────────────────────────────────────────────────────

export interface ScheduleSlotInfo {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  activityName: string;
}

export interface ClassUsageInfo {
  classesRemaining: number | null;
  classesBudget: number | null;
  classesUsedThisWeek: number;
  weeklyLimit: number | null;
  bookingMode: BookingMode;
  /**
   * Multi-branch flag of the active sub's plan. The admin UI reads this to
   * decide whether the FixedSchedulePicker offers a sede selector. Mirrors
   * subscription_plans.multi_branch.
   */
  multiBranch: boolean;
  scheduleIds: number[];
  scheduleSlots: ScheduleSlotInfo[];
  bonusUsage: {
    applicable: boolean;
    used?: number;
    limit?: number;
    periodStart?: string;
    periodEnd?: string;
  };
}

export interface AssignPlanInput {
  planId: number;
  branchId: number;
  startDate: string;
  priceTypeApplied: PriceType;
  paymentMethod: PaymentMethod;
  scheduleIds?: number[];
  /**
   * Optional per-slot deferred start dates. Set when the admin picks a slot
   * that is full this week and accepts the suggested first-available date in
   * the picker. Keyed by scheduleId (string from JSON), value is YYYY-MM-DD.
   */
  scheduleStartDates?: Record<string, string>;
  auraSpend?: number;
  priceOverrideAmount?: number;
  priceOverrideReason?: string;
  boardingPass?: boolean;
  notes?: string;
  startMode?: "now" | "after_current";
  /**
   * "Mantener vencimiento" (change-plan only). When set, changePlanNow makes
   * the new subscription inherit this expiry (the current sub's endDate)
   * instead of starting a fresh `startDate + durationDays` period, and the
   * class budget is prorated to the inherited window. Ignored by
   * changePlanAfterCurrent. Format: YYYY-MM-DD, must be after startDate.
   */
  endDateOverride?: string;
  /**
   * Monto efectivamente recibido al asignar (D-12, D-13).
   * Backward-compat: undefined → defaults to pricePaid en service layer.
   * Validación: 0 <= amountReceived <= pricePaid (cap-violación = 400).
   */
  amountReceived?: number;
  /**
   * Phase 146 (COBRO-03 / COBRO-04): id de un cobro suelto pendiente
   * (advance_payment) del socio a imputar al alta del plan. Cuando viene,
   * assignPlan anula ese anticipo y recrea un plan_charge vinculado a la nueva
   * sub con la MISMA caja/monto/método del anticipo, todo dentro de la
   * db.transaction (atómico). Si el anticipo excede el precio del plan se
   * rechaza con 400 (COBRO-04). undefined → cobro normal vía amountReceived.
   */
  appliedMiscChargeId?: number;
  /**
   * Phase 140 (Pitfall 1 / CARGA-02): role of whoever initiated the assignment,
   * forwarded into recordAssignmentCharge so the birth validation_status is
   * derived SERVER-SIDE from the role (coach → 'pendiente', everyone else →
   * 'validado'). NEVER read from the raw body — Wave 2 routes set it from
   * `request.user.role`. Omitido en el path admin → 'validado' (sin cambio).
   */
  recorderRole?: AdminRole;
  /**
   * Phase 140 (CARGA-02 / D-09): client-generated opaque ticket key for an
   * idempotent coach assignment, forwarded into the charge so a double-tap/retry
   * cannot create two charges (nullable UNIQUE at the DB).
   */
  idempotencyKey?: string;
  /**
   * Phase 146 (CAJA-01): sede del PROFE que carga (recordedBy → su branchId).
   * Cuando se provee, la caja del plan_charge se SUGIERE desde esta sede (caja
   * efectivo del profe para cash; banco por moneda para transfer/card), no la
   * del socio. El branch_id de la sub/charge sigue derivándose de la sede del
   * socio. NUNCA del body crudo — la ruta coach-load lo resuelve de
   * `request.user.userId`. Omitido en el path admin → caja por sede del socio
   * (comportamiento previo, sin regresión).
   */
  recorderBranchId?: number;
  /**
   * Phase 151 (COBRO-04): caja banco pre-validada elegida en la PoS de Cobros. El
   * caller (ruta coach-load) YA corrió assertChosenBankAccount (type='banco' +
   * activa + moneda-match) — el service confía en el id y lo usa como
   * `suggestedCajaId`, salteando resolveCashRegister. NUNCA del body crudo. Solo
   * lo setea la ruta coach-load tras validar; los paths admin/internos lo omiten →
   * caja sugerida por sede (sin regresión).
   */
  cashRegisterIdOverride?: number;
  /**
   * Phase 148 (ALTA-06): id del alumno que ESTA carga creó vía
   * createMinimalMember (PoS profe), o null/undefined si el alumno ya existía.
   * Se propaga hasta el insert del charge (createdMemberId) para que el cascade
   * de void (148-03) sepa qué alumno desactivar. SERVER-DERIVED — el orquestador
   * 148-02 lo pasa tras crear el alumno; NUNCA del body crudo. Omitido en el
   * path admin → NULL (sin cambio).
   */
  createdMemberId?: number | null;
}

export interface RenewSubscriptionInput {
  paymentMethod: PaymentMethod;
  /**
   * Fase 161 (PASE-04): id explícito de la suscripción a renovar. Opcional
   * (backward-compat): undefined → selección active-first histórica (`.limit(1)`).
   * Provisto → renueva ESA sub tras validar `subscription.userId === userId`
   * (NotFoundError si no coincide — T-161-04). Resuelve la ambigüedad de un socio
   * con presencial + pase especial activos a la vez (Open Q 2).
   */
  subscriptionId?: number;
  /**
   * Monto efectivamente recibido al renovar (D-12, D-13).
   * Backward-compat: undefined → defaults to renewalPrice en service layer.
   */
  amountReceived?: number;
  /**
   * Precio personalizado para esta renovación. Si se provee (>= 0), reemplaza
   * el precio heredado de la suscripción anterior y requiere
   * `priceOverrideReason`. undefined → se hereda `currentSub.pricePaid`.
   */
  priceOverrideAmount?: number;
  /** Razón del precio personalizado. Requerida si hay `priceOverrideAmount`. */
  priceOverrideReason?: string;
  /**
   * Fecha de inicio personalizada para la renovación (hotfix 2026-07-06, pedido
   * del staff). Formato YYYY-MM-DD. undefined → derivación automática (vencimiento
   * actual si la sub sigue vigente, si no hoy). Cuando se provee, la renovación
   * arranca en esa fecha y el nuevo vencimiento se recalcula como
   * `startDate + plan.durationDays`; el estado (scheduled vs active) se deriva de
   * `startDate` vs hoy. Se valida contra los mismos límites que
   * assignPlan/editSubscriptionStartDate (±90/60 días) y contra el solapamiento
   * con la suscripción vigente.
   */
  startDate?: string;
  /**
   * Phase 140 (Pitfall 1 / CARGA-02): role of whoever initiated the renewal,
   * forwarded into recordAssignmentCharge so the birth validation_status is
   * derived SERVER-SIDE from the role (coach → 'pendiente', everyone else →
   * 'validado'). NEVER read from the raw body — Wave 2 routes set it from
   * `request.user.role`. Omitted on the admin path → 'validado' (unchanged).
   */
  recorderRole?: AdminRole;
  /**
   * Phase 140 (CARGA-02 / D-09): client-generated opaque ticket key for an
   * idempotent coach renewal, forwarded into the charge so a double-tap/retry
   * cannot create two renewal charges (nullable UNIQUE at the DB).
   */
  idempotencyKey?: string;
  /**
   * Phase 146 (CAJA-01): sede del PROFE que carga (recordedBy → su branchId).
   * Cuando se provee, la caja del plan_charge se SUGIERE desde esta sede (caja
   * efectivo del profe para cash; banco por moneda para transfer/card), no la
   * del socio. El branch_id de la sub/charge sigue derivándose de la sede del
   * socio. NUNCA del body crudo — la ruta coach-load lo resuelve de
   * `request.user.userId`. Omitido en el path admin → caja por sede del socio
   * (comportamiento previo, sin regresión).
   */
  recorderBranchId?: number;
  /**
   * Phase 151 (COBRO-04): caja banco pre-validada elegida en la PoS de Cobros. El
   * caller (ruta coach-load) YA corrió assertChosenBankAccount (type='banco' +
   * activa + moneda-match) — el service confía en el id y lo usa como
   * `suggestedCajaId`, salteando resolveCashRegister. NUNCA del body crudo. Solo
   * lo setea la ruta coach-load tras validar; los paths admin/internos lo omiten →
   * caja sugerida por sede (sin regresión).
   */
  cashRegisterIdOverride?: number;
  /**
   * Turnos fijos para el NUEVO período (pedido del staff 2026-07-10: renovar
   * mismo plan sin poder cargar turnos obligaba a renovar sin anclas y
   * cargarlas después a mano). Semántica:
   * - undefined → comportamiento previo: se COPIAN los turnos del período
   *   anterior (subscription_schedules de la sub renovada).
   * - provisto → reemplaza la herencia: la sub nueva nace con exactamente
   *   estos turnos ([] = sin anclas, solo válido en planes flexibles).
   * Mismas reglas de validación que assignPlan (fixed exige el set exacto,
   * flexible presencial 0..classesPerWeek, online nunca).
   */
  scheduleIds?: number[];
  /**
   * Inicio diferido por turno (mismo contrato que assignPlan): cuando el
   * picker detecta un slot lleno esta semana y el admin acepta arrancar ese
   * turno en una fecha futura. Solo tiene efecto si `scheduleIds` viene.
   */
  scheduleStartDates?: Record<string, string>;
}

// ─── Plan Change / Proration Types ─────────────────────────────────────────

export interface ProrationResult {
  remainingValue: number; // how much credit from old plan (integer pesos)
  remainingRatio: number; // 0-1 ratio of unused portion
  remainingDetail: string; // e.g. "6/15 clases" or "15/30 dias"
}

export interface ChangePlanPreview {
  allowed: boolean;
  reason?: string; // only if not allowed (downgrade block message)
  currentPlan: {
    id: number;
    name: string;
    priceRegular: number;
    pricePaid: number;
  };
  targetPlan: { id: number; name: string; priceRegular: number };
  proration: ProrationResult | null; // null if not allowed
  netAmount: number | null; // null if not allowed; new plan priceRegular minus proration credit, minus referral discount (parity with changePlanNow)
  referralDiscountPercent: number; // 0 if none — % de referido que el cobro real va a aplicar
  referralDiscountAmount: number; // 0 if none — monto ya restado de netAmount
  expiryDate?: string; // current subscription endDate (always set; used to pre-fill "mantener vencimiento")
}

// ─── Pricing Types ──────────────────────────────────────────────────────────

export interface PricingPreview {
  basePrice: number;
  discountType: "none" | "boarding_pass" | "aura" | "override";
  discountAmount: number;
  finalPrice: number;
  auraToSpend: number;
  auraBalance: number;
  boardingPassEligible: boolean;
  availableTiers: AuraDiscountTier[];
  // Referidos (fase 157): desglose del descuento de referido ya aplicado en
  // finalPrice, para que el PoS muestre el mismo precio que se cobrará (Pitfall 4).
  // Compone sobre el descuento auraSpend. 0 cuando no hay vínculos activos.
  referralDiscountPercent: number;
  referralDiscountAmount: number;
}

// ─── Promo Plan Types ────────────────────────────────────────────────────────

export interface PromoListItem {
  id: number;
  name: string;
  promoCode: string;
  planDurationDays: number;
  startDate: string;
  expiryDate: string;
  promoType: PromoType;
  subscriptionPlanId: number;
  isActive: boolean;
  redemptionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromoInput {
  name: string;
  promoCode: string;
  planDurationDays: number;
  startDate: string;
  expiryDate: string;
  promoType: PromoType;
  subscriptionPlanId: number;
}

export interface UpdatePromoInput {
  name?: string;
  planDurationDays?: number;
  startDate?: string;
  expiryDate?: string;
  promoType?: PromoType;
  subscriptionPlanId?: number;
}
