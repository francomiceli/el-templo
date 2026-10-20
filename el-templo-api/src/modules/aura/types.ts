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
  | "goal_plan_completion"
  | "onboarding_completion"
  | "program_week_completion"
  | "program_completion"
  | "tenure_milestone"
  // Fase 197 D-12: primer bloque libre del día que llega a 10 minutos
  | "extra_block";

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
