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
  | "online_coach";

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
}

export interface RenewSubscriptionInput {
  paymentMethod: PaymentMethod;
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
  netAmount: number | null; // null if not allowed; new plan priceRegular minus proration credit
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
