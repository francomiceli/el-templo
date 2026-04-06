import type {
  AvatarLetter,
  Gender,
  AgeRange,
  TrainingBackground,
  GoalChoice,
  PainPoint,
  TrainingFrequency,
} from "./types";

export interface AvatarInput {
  gender: Gender;
  ageRange: AgeRange;
  trainingBackground: TrainingBackground;
  goal: GoalChoice;
  painPoint: PainPoint;
  trainingFrequency: TrainingFrequency;
}

export interface AvatarResult {
  avatarType: AvatarLetter;
  suggestedProgram: string;
}

/** Avatar -> suggested program mapping (from continuum-programas.md) */
export const AVATAR_PROGRAM_MAP: Record<AvatarLetter, string> = {
  A: "30 Dias - Crea el Habito",
  B: "Foundation - Cuerpo Completo",
  C: "30 Dias - Crea el Habito",
  D: "Foundation - Cuerpo Completo",
  E: "Foundation - Cuerpo Completo",
  F: "Foundation - Cuerpo Completo",
  G: "Foundation - Cuerpo Completo",
  H: "Foundation - Cuerpo Completo",
  I: "Foundation - Cuerpo Completo",
  J: "Piernas y Gluteos - 12 Semanas",
  K: "30 Dias - Crea el Habito",
};

/**
 * Resolves an avatar letter (A-K) from quiz answers + gender.
 * Pure deterministic decision tree -- no database lookups.
 * Priority ordering: first match wins (checked top to bottom).
 */
export function resolveAvatar(input: AvatarInput): AvatarResult {
  const { gender, ageRange, trainingBackground, goal, painPoint } = input;

  let avatarType: AvatarLetter;

  // 1. K: Mujer joven -- female 18-28 who is NOT already into calistenia/yoga
  if (
    gender === "female" &&
    ageRange === "18_28" &&
    trainingBackground !== "calistenia" &&
    trainingBackground !== "yoga_pilates"
  ) {
    avatarType = "K";
  }
  // 2. C: Mujer que dejo el gym por el ambiente
  else if (
    gender === "female" &&
    (trainingBackground === "gym" || trainingBackground === "deje") &&
    painPoint === "ambiente"
  ) {
    avatarType = "C";
  }
  // 3. J: Mujer cuerpo firme -- female seeking piernas/gluteos or cuerpo firme
  else if (
    gender === "female" &&
    (goal === "piernas_gluteos" || goal === "cuerpo_firme")
  ) {
    avatarType = "J";
  }
  // 4. D: La yogui/pilatera
  else if (gender === "female" && trainingBackground === "yoga_pilates") {
    avatarType = "D";
  }
  // 5. H: Hombre maduro longevidad
  else if (
    gender === "male" &&
    ageRange === "41_plus" &&
    goal === "longevidad"
  ) {
    avatarType = "H";
  }
  // 6. F: Pesas veterano -- male gym-goer who is 41+ or seeks longevidad
  else if (
    gender === "male" &&
    trainingBackground === "gym" &&
    (ageRange === "41_plus" || goal === "longevidad")
  ) {
    avatarType = "F";
  }
  // 7. G: Busca comunidad (any gender)
  else if (goal === "comunidad") {
    avatarType = "G";
  }
  // 8. E: Cardio-dependiente (any goal)
  else if (trainingBackground === "cardio") {
    avatarType = "E";
  }
  // 9. I: Conexion cuerpo-mente -- experienced calistenia + fuerza general
  else if (trainingBackground === "calistenia" && goal === "fuerza_general") {
    avatarType = "I";
  }
  // 10. B: Solo conoce el gym -- gym + fuerza_general or cero_atleta
  else if (
    trainingBackground === "gym" &&
    (goal === "fuerza_general" || goal === "cero_atleta")
  ) {
    avatarType = "B";
  }
  // 11. A: Nunca entreno (DEFAULT) -- catch-all fallback
  else {
    avatarType = "A";
  }

  return {
    avatarType,
    suggestedProgram: AVATAR_PROGRAM_MAP[avatarType],
  };
}
