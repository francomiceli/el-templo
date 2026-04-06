export type GoalPlanType =
  | "tren_superior"
  | "tren_inferior"
  | "gluteos"
  | "cuadriceps"
  | "empuje"
  | "traccion"
  | "planche"
  | "front_lever";

export type GoalPlanTier = "principiante" | "intermedio" | "avanzado";

export interface GoalPlanProgress {
  goalPlanType: GoalPlanType;
  isActive: boolean;
  startedAt: string;
}

export interface ArchivedGoalPlan {
  goalPlanType: GoalPlanType;
  startedAt: string;
  archivedAt: string;
}

export interface GoalPlanMetadata {
  type: GoalPlanType;
  name: string; // Spanish display name
  tier: GoalPlanTier;
  description: string; // Spanish description for overview screen
  zones: string[]; // Body zones targeted
  idealFor: string; // Spanish "ideal for" text
}

export interface CycleStats {
  cycleWeeks: number; // ceil(plan.durationDays / 7)
  currentWeek: number; // which week we're in (1-based, calendar from startedAt)
  cycleEndDate: string; // ISO date string when cycle ends (startedAt + durationDays)
  totalCompletions: number; // sessions completed during this cycle window
  cycleComplete: boolean; // true if current date >= cycleEndDate
}
