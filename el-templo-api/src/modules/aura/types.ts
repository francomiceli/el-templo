// Module: aura

export type AuraSourceType =
  | "training_completion"
  | "attendance"
  | "streak_bonus"
  | "referral"
  | "subscription_discount"
  | "manual_adjustment"
  | "challenge"
  | "social"
  | "personalizada_completion";

export interface AwardInput {
  userId: number;
  sourceType: AuraSourceType;
  referenceType?: string;
  referenceId?: number;
  amount?: number; // override config default
  description?: string;
}

export interface SpendInput {
  userId: number;
  amount: number;
  description: string;
  referenceType?: string;
  referenceId?: number;
}

export interface AuraBalance {
  userId: number;
  balance: number;
}
