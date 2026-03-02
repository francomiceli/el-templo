export type JourneyType =
  | 'tren_superior'
  | 'tren_inferior'
  | 'empuje'
  | 'traccion'
  | 'planche'
  | 'front_lever';

export type JourneyTier = 'principiante' | 'intermedio' | 'avanzado';

export type JourneyDuration = 20 | 40 | 60;

export interface JourneyMetadata {
  type: JourneyType;
  name: string;
  tier: JourneyTier;
  description: string;
  zones: string[];
  idealFor: string;
}

export interface MemberJourneyInfo {
  userId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  level: string;
  branchName: string;
  journeyType: JourneyType | null;
  journeyName: string | null;
  semana20: number | null;
  semana40: number | null;
  semana60: number | null;
  startedAt: string | null;
}

export interface MemberJourneyDetail {
  user: {
    firstName: string | null;
    lastName: string | null;
    level: string;
    branchName: string;
  };
  active: {
    journeyType: JourneyType;
    semana20: number;
    semana40: number;
    semana60: number;
    isActive: boolean;
    startedAt: string;
  } | null;
  archived: Array<{
    journeyType: JourneyType;
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
  journeyStats: {
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
    journeyType: JourneyType | null;
    duration: number | null;
    rpe: number | null;
    blocksCompleted: string[];
    completedAt: string;
  }>;
}

export interface JourneyGenerateResult {
  generated: number;
  skipped: number;
}

export const ALL_JOURNEY_TYPES: JourneyType[] = [
  'tren_superior',
  'tren_inferior',
  'empuje',
  'traccion',
  'planche',
  'front_lever',
];

export const JOURNEY_TIER_MAP: Record<JourneyType, JourneyTier> = {
  tren_superior: 'principiante',
  tren_inferior: 'principiante',
  empuje: 'intermedio',
  traccion: 'intermedio',
  planche: 'avanzado',
  front_lever: 'avanzado',
};

export const JOURNEY_TYPE_LABELS: Record<JourneyType, string> = {
  tren_superior: 'Tren Superior',
  tren_inferior: 'Tren Inferior',
  empuje: 'Empuje',
  traccion: 'Traccion',
  planche: 'Planche',
  front_lever: 'Front Lever',
};

export const JOURNEY_TIER_LABELS: Record<JourneyTier, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

/** Color for journey type badges, grouped by tier */
export const JOURNEY_TIER_COLORS: Record<JourneyTier, string> = {
  principiante: 'brown-4',
  intermedio: 'deep-orange',
  avanzado: 'deep-orange-9',
};
