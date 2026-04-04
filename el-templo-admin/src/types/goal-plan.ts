export type GoalPlanType =
  | 'tren_superior'
  | 'tren_inferior'
  | 'empuje'
  | 'traccion'
  | 'planche'
  | 'front_lever';

export type GoalPlanTier = 'principiante' | 'intermedio' | 'avanzado';

export interface GoalPlanMetadata {
  type: GoalPlanType;
  name: string;
  tier: GoalPlanTier;
  description: string;
  zones: string[];
  idealFor: string;
}

export interface MemberGoalPlanInfo {
  userId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  level: string;
  branchName: string;
  goalPlanType: GoalPlanType | null;
  goalPlanName: string | null;
  semana20: number | null;
  semana40: number | null;
  semana60: number | null;
  startedAt: string | null;
}

export interface MemberGoalPlanDetail {
  user: {
    firstName: string | null;
    lastName: string | null;
    level: string;
    branchName: string;
  };
  active: {
    goalPlanType: GoalPlanType;
    semana20: number;
    semana40: number;
    semana60: number;
    isActive: boolean;
    startedAt: string;
  } | null;
  archived: Array<{
    goalPlanType: GoalPlanType;
    semana20: number;
    semana40: number;
    semana60: number;
    startedAt: string;
    archivedAt: string;
  }>;
  entrenamientoStats: {
    totalSessions: number;
    totalDays: number;
    currentStreak: number;
  };
  goalPlanStats: {
    totalSessions: number;
    byDuration: {
      d20: number;
      d40: number;
      d60: number;
    };
  };
  completions: Array<{
    dayId: string;
    date: string;
    goalPlanType: GoalPlanType | null;
    duration: number | null;
    rpe: number | null;
    blocksCompleted: string[];
    completedAt: string;
  }>;
}

export interface GoalPlanGenerateResult {
  generated: number;
  skipped: number;
}

export const ALL_GOAL_PLAN_TYPES: GoalPlanType[] = [
  'tren_superior',
  'tren_inferior',
  'empuje',
  'traccion',
  'planche',
  'front_lever',
];

export const GOAL_PLAN_TIER_MAP: Record<GoalPlanType, GoalPlanTier> = {
  tren_superior: 'principiante',
  tren_inferior: 'principiante',
  empuje: 'intermedio',
  traccion: 'intermedio',
  planche: 'avanzado',
  front_lever: 'avanzado',
};

export const GOAL_PLAN_TYPE_LABELS: Record<GoalPlanType, string> = {
  tren_superior: 'Tren Superior',
  tren_inferior: 'Tren Inferior',
  empuje: 'Empuje',
  traccion: 'Traccion',
  planche: 'Planche',
  front_lever: 'Front Lever',
};

export const GOAL_PLAN_TIER_LABELS: Record<GoalPlanTier, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

/** Color for goal plan type badges, grouped by tier */
export const GOAL_PLAN_TIER_COLORS: Record<GoalPlanTier, string> = {
  principiante: 'brown-4',
  intermedio: 'deep-orange',
  avanzado: 'deep-orange-9',
};

/** Goal plan type options for QSelect dropdowns */
export const GOAL_PLAN_TYPE_OPTIONS = [
  { label: 'Front Lever', value: 'front_lever' },
  { label: 'Tren Inferior', value: 'tren_inferior' },
  { label: 'Tren Superior', value: 'tren_superior' },
  { label: 'Empuje', value: 'empuje' },
  { label: 'Traccion', value: 'traccion' },
  { label: 'Planche', value: 'planche' },
];

/** Badge colors for goalPlanType values (used in ProgramasPage and ProgramWizardDialog) */
export const GOAL_PLAN_TYPE_COLORS: Record<string, string> = {
  front_lever: 'deep-purple',
  tren_inferior: 'amber-8',
  tren_superior: 'blue',
  empuje: 'teal',
  traccion: 'orange',
  planche: 'pink',
};
