/**
 * Subscription types for the admin app.
 * Matches the API response shapes from the subscriptions module (Plan 48-01).
 */

// ─── Enum Union Types ────────────────────────────────────────────────────────

export type PlanTier = 'flex' | 'foundation' | 'performance' | 'other';
export type BookingMode = 'fixed' | 'flexible';
export type SubscriptionStatus =
  | 'active'
  | 'paused'
  | 'cancelled'
  | 'expired'
  | 'completed'
  | 'changed'
  | 'scheduled';
export type PriceType = 'regular' | 'zero' | 'credit_card';

// ─── Label & Color Maps ─────────────────────────────────────────────────────

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  flex: 'Flex',
  foundation: 'Foundation',
  performance: 'Performance',
  other: 'Otro',
};

export const BOOKING_MODE_LABELS: Record<BookingMode, string> = {
  fixed: 'Fijo',
  flexible: 'Flexible',
};

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Activo',
  paused: 'Pausado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
  completed: 'Completado',
  changed: 'Cambiado',
  scheduled: 'Programado',
};

export const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  active: 'positive',
  paused: 'warning',
  cancelled: 'negative',
  expired: 'grey',
  completed: 'info',
  changed: 'purple',
  scheduled: 'blue-grey',
};

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  regular: 'Regular',
  zero: 'Zero',
  credit_card: 'Tarjeta',
};

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

// ─── Plan Category ──────────────────────────────────────────────────────────

export type PlanCategory = 'presencial' | 'online_regular' | 'online_goal' | 'online_coach';

export const PLAN_CATEGORY_LABELS: Record<PlanCategory, string> = {
  presencial: 'Presencial',
  online_regular: 'Regular',
  online_goal: 'Por Objetivos',
  online_coach: 'Personalizado',
};

export const PLAN_CATEGORY_COLORS: Record<PlanCategory, string> = {
  presencial: 'teal',
  online_regular: 'blue',
  online_goal: 'amber-8',
  online_coach: 'deep-purple',
};

export const PLAN_CATEGORY_OPTIONS = [
  { label: 'Presencial', value: 'presencial' },
  { label: 'Online Regular', value: 'online_regular' },
  { label: 'Online Por Objetivos', value: 'online_goal' },
  { label: 'Online Personalizado', value: 'online_coach' },
];

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
  linkedProgramId: number | null;
  groupMaxMembers: number | null;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
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
  planCategory: PlanCategory;
  linkedProgramId?: number;
  groupMaxMembers?: number;
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
}

import type { PaymentMethod } from './payment';

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
  classesRemaining: number | null;
  classesBudget: number | null;
  previousSubscriptionId: number | null;
  scheduleIds: number[];
  replacementCredits: number;
  pausedAt: string | null;
  resumedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionHistoryItem extends SubscriptionDetail {}

export interface AssignPlanInput {
  planId: number;
  branchId: number;
  startDate: string;
  priceTypeApplied: PriceType;
  paymentMethod: PaymentMethod;
  scheduleIds?: number[];
  auraSpend?: number;
  priceOverrideAmount?: number;
  priceOverrideReason?: string;
  boardingPass?: boolean;
  notes?: string;
  startMode?: 'now' | 'after_current';
}

export interface RenewSubscriptionInput {
  paymentMethod: PaymentMethod;
}

// ─── Plan Change / Proration Types ─────────────────────────────────────────

export interface ProrationResult {
  remainingValue: number;
  remainingRatio: number;
  remainingDetail: string;
}

export interface ChangePlanPreview {
  allowed: boolean;
  reason?: string;
  currentPlan: { id: number; name: string; priceRegular: number; pricePaid: number };
  targetPlan: { id: number; name: string; priceRegular: number };
  proration: ProrationResult | null;
  netAmount: number | null;
  expiryDate?: string;
}

// ─── Pricing Types ──────────────────────────────────────────────────────────

export interface PricingPreview {
  basePrice: number;
  discountType: 'none' | 'boarding_pass' | 'aura' | 'override';
  discountAmount: number;
  finalPrice: number;
  auraToSpend: number;
  auraBalance: number;
  boardingPassEligible: boolean;
  availableTiers: AuraDiscountTier[];
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
  scheduleIds: number[];
  scheduleSlots: ScheduleSlotInfo[];
  bookingMode: BookingMode;
}

// ─── Promo Plan Types ────────────────────────────────────────────────────────

export type PromoType = 'auto' | 'admin_assignable';

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
