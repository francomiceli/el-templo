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
