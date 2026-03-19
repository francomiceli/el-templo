export type PersonalizadaType =
  | "tren_superior"
  | "tren_inferior"
  | "empuje"
  | "traccion"
  | "planche"
  | "front_lever";

export type PersonalizadaTier = "principiante" | "intermedio" | "avanzado";

export type PersonalizadaDuration = 20 | 40 | 60;

export interface PersonalizadaProgress {
  personalizadaType: PersonalizadaType;
  semana20: number;
  semana40: number;
  semana60: number;
  isActive: boolean;
  startedAt: string;
}

export interface ArchivedPersonalizada {
  personalizadaType: PersonalizadaType;
  semana20: number;
  semana40: number;
  semana60: number;
  startedAt: string;
  archivedAt: string;
}

export interface PersonalizadaMetadata {
  type: PersonalizadaType;
  name: string; // Spanish display name
  tier: PersonalizadaTier;
  description: string; // Spanish description for overview screen
  zones: string[]; // Body zones targeted
  idealFor: string; // Spanish "ideal for" text
}

export interface CycleStats {
  cycleWeeks: number; // ceil(plan.durationDays / 7)
  currentWeek: number; // which week we're in (1-based, calendar from startedAt)
  cycleEndDate: string; // ISO date string when cycle ends (startedAt + durationDays)
  totalCompletions: number; // sessions completed during this cycle window
  durationBreakdown: {
    // completions per duration within cycle window
    d20: number;
    d40: number;
    d60: number;
  };
  cycleComplete: boolean; // true if current date >= cycleEndDate
}
