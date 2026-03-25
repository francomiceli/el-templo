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
    | "quiz_abandoned";
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
