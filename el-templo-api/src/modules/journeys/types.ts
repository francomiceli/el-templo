export type JourneyType =
  | "tren_superior"
  | "tren_inferior"
  | "empuje"
  | "traccion"
  | "planche"
  | "front_lever";

export type JourneyTier = "principiante" | "intermedio" | "avanzado";

export type JourneyDuration = 20 | 40 | 60;

export interface JourneyProgress {
  journeyType: JourneyType;
  semana20: number;
  semana40: number;
  semana60: number;
  isActive: boolean;
  startedAt: string;
}

export interface ArchivedJourney {
  journeyType: JourneyType;
  semana20: number;
  semana40: number;
  semana60: number;
  startedAt: string;
  archivedAt: string;
}

export interface JourneyMetadata {
  type: JourneyType;
  name: string; // Spanish display name
  tier: JourneyTier;
  description: string; // Spanish description for overview screen
  zones: string[]; // Body zones targeted
  idealFor: string; // Spanish "ideal for" text
}
