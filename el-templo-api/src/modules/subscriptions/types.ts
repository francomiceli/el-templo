/**
 * Subscriptions Module Types
 *
 * Interfaces for subscription plans CRUD, subscription lifecycle,
 * and pricing engine with AURA discount integration.
 */

// ─── Enum Union Types ────────────────────────────────────────────────────────

export type SubscriptionStatus = "active" | "paused" | "cancelled" | "expired";
export type PlanTier = "flex" | "foundation" | "performance" | "other";
export type BookingMode = "fixed" | "flexible";
export type PriceType = "regular" | "zero" | "credit_card";

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
  groupMaxMembers: number | null;
  isActive: boolean;
  isArchived: boolean;
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
  groupMaxMembers?: number | null;
}

// ─── Subscription Types ─────────────────────────────────────────────────────

export interface SubscriptionDetail {
  id: number;
  userId: number;
  planId: number;
  planName: string;
  planTier: PlanTier;
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
  auraSpend?: number;
  priceOverrideAmount?: number;
  priceOverrideReason?: string;
  boardingPass?: boolean;
  notes?: string;
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
