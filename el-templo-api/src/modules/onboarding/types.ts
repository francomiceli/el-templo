export type GoalType =
  | "muscle_up"
  | "fitness"
  | "weight_loss"
  | "flexibility"
  | "wellness";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type TrainingFocus = "upper_body" | "lower_body" | "core" | "full_body";
export type MotivationStyle =
  | "discipline"
  | "community"
  | "results"
  | "challenges";

export interface CompleteOnboardingInput {
  userId: number;
  goalType: GoalType;
  experienceLevel: ExperienceLevel;
  trainingFocus: TrainingFocus;
  motivationStyle: MotivationStyle;
}

export interface OnboardingProfile {
  goalType: GoalType;
  experienceLevel: ExperienceLevel;
  trainingFocus: TrainingFocus;
  motivationStyle: MotivationStyle;
  onboardingCompletedAt: string | null;
}

export interface AnalyticsEventInput {
  userId: number;
  eventType:
    | "quiz_started"
    | "question_answered"
    | "quiz_completed"
    | "quiz_abandoned"
    | "avatar_assigned";
  questionIndex?: number;
  answerValue?: string;
  durationMs?: number;
}

// Display label maps for admin and app use
export const GOAL_LABELS: Record<GoalType, string> = {
  muscle_up: "Primer Muscle-Up",
  fitness: "Mejor forma fisica",
  weight_loss: "Perder peso",
  flexibility: "Flexibilidad",
  wellness: "Bienestar general",
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: "Empiezo de cero",
  intermediate: "Algo de experiencia",
  advanced: "Entreno hace rato",
};

export const TRAINING_FOCUS_LABELS: Record<TrainingFocus, string> = {
  upper_body: "Tren superior",
  lower_body: "Tren inferior",
  core: "Core",
  full_body: "Cuerpo completo",
};

export const MOTIVATION_LABELS: Record<MotivationStyle, string> = {
  discipline: "Disciplina personal",
  community: "Comunidad y companeros",
  results: "Resultados visibles",
  challenges: "Desafios y metas",
};

// === V2 Avatar Profiling Types ===

export type AgeRange = "18_28" | "29_40" | "41_plus";
export type TrainingBackground =
  | "nunca"
  | "gym"
  | "cardio"
  | "yoga_pilates"
  | "calistenia"
  | "deje";
export type GoalChoice =
  | "habito"
  | "fuerza_general"
  | "comunidad"
  | "piernas_gluteos"
  | "cuerpo_firme"
  | "cero_atleta"
  | "skill"
  | "longevidad";
export type PainPoint =
  | "tiempo"
  | "constancia"
  | "no_se_por_donde"
  | "ambiente"
  | "resultados"
  | "nada";
export type TrainingFrequency = "2" | "3" | "4" | "5_plus";
export type AvatarLetter =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K";
export type Gender = "male" | "female" | "other" | "unspecified";

export interface CompleteOnboardingInputV2 {
  userId: number;
  gender: Gender;
  ageRange: AgeRange;
  trainingBackground: TrainingBackground;
  goal: GoalChoice;
  painPoint: PainPoint;
  trainingFrequency: TrainingFrequency;
}

export interface OnboardingProfileV2 {
  ageRange: AgeRange;
  trainingBackground: TrainingBackground;
  goal: GoalChoice;
  painPoint: PainPoint;
  trainingFrequency: TrainingFrequency;
  avatarType: AvatarLetter;
  suggestedProgram: string;
  onboardingCompletedAt: string | null;
}

export const AVATAR_LABELS: Record<AvatarLetter, string> = {
  A: "A - Nunca entreno",
  B: "B - Solo gym",
  C: "C - Dejo el gym",
  D: "D - Yogui/pilatera",
  E: "E - Cardio",
  F: "F - Pesas veterano",
  G: "G - Busca comunidad",
  H: "H - Longevidad",
  I: "I - Cuerpo-mente",
  J: "J - Cuerpo firme",
  K: "K - Mujer joven",
};
