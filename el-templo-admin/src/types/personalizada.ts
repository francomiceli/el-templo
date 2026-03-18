export type PersonalizadaType =
  | 'tren_superior'
  | 'tren_inferior'
  | 'empuje'
  | 'traccion'
  | 'planche'
  | 'front_lever';

export type PersonalizadaTier = 'principiante' | 'intermedio' | 'avanzado';

export type PersonalizadaDuration = 20 | 40 | 60;

export interface PersonalizadaMetadata {
  type: PersonalizadaType;
  name: string;
  tier: PersonalizadaTier;
  description: string;
  zones: string[];
  idealFor: string;
}

export interface MemberPersonalizadaInfo {
  userId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  level: string;
  branchName: string;
  personalizadaType: PersonalizadaType | null;
  personalizadaName: string | null;
  semana20: number | null;
  semana40: number | null;
  semana60: number | null;
  startedAt: string | null;
}

export interface MemberPersonalizadaDetail {
  user: {
    firstName: string | null;
    lastName: string | null;
    level: string;
    branchName: string;
  };
  active: {
    personalizadaType: PersonalizadaType;
    semana20: number;
    semana40: number;
    semana60: number;
    isActive: boolean;
    startedAt: string;
  } | null;
  archived: Array<{
    personalizadaType: PersonalizadaType;
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
  personalizadaStats: {
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
    personalizadaType: PersonalizadaType | null;
    duration: number | null;
    rpe: number | null;
    blocksCompleted: string[];
    completedAt: string;
  }>;
}

export interface PersonalizadaGenerateResult {
  generated: number;
  skipped: number;
}

export const ALL_PERSONALIZADA_TYPES: PersonalizadaType[] = [
  'tren_superior',
  'tren_inferior',
  'empuje',
  'traccion',
  'planche',
  'front_lever',
];

export const PERSONALIZADA_TIER_MAP: Record<PersonalizadaType, PersonalizadaTier> = {
  tren_superior: 'principiante',
  tren_inferior: 'principiante',
  empuje: 'intermedio',
  traccion: 'intermedio',
  planche: 'avanzado',
  front_lever: 'avanzado',
};

export const PERSONALIZADA_TYPE_LABELS: Record<PersonalizadaType, string> = {
  tren_superior: 'Tren Superior',
  tren_inferior: 'Tren Inferior',
  empuje: 'Empuje',
  traccion: 'Traccion',
  planche: 'Planche',
  front_lever: 'Front Lever',
};

export const PERSONALIZADA_TIER_LABELS: Record<PersonalizadaTier, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

/** Color for personalizada type badges, grouped by tier */
export const PERSONALIZADA_TIER_COLORS: Record<PersonalizadaTier, string> = {
  principiante: 'brown-4',
  intermedio: 'deep-orange',
  avanzado: 'deep-orange-9',
};
