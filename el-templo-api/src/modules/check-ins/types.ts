export type CheckInQuestionType = "energy" | "soreness" | "sleep";

export type EnergyValue = "bajo" | "normal" | "alto";
export type SorenessValue = "ninguna" | "leve" | "moderada";
export type SleepValue = "mal" | "ok" | "bien";

export type BodyArea =
  | "hombros"
  | "espalda"
  | "piernas"
  | "core"
  | "general";

export interface CheckInAnswer {
  questionType: CheckInQuestionType;
  value: string;
  bodyArea?: string;
}

export interface TodayCheckInState {
  answers: Record<
    CheckInQuestionType,
    { value: string; bodyArea: string | null } | null
  >;
  unlocked: CheckInQuestionType[];
}

export const VALID_VALUES: Record<CheckInQuestionType, readonly string[]> = {
  energy: ["bajo", "normal", "alto"],
  soreness: ["ninguna", "leve", "moderada"],
  sleep: ["mal", "ok", "bien"],
};

export const VALID_BODY_AREAS: readonly string[] = [
  "hombros",
  "espalda",
  "piernas",
  "core",
  "general",
];

export const QUESTION_TYPES: readonly CheckInQuestionType[] = [
  "energy",
  "soreness",
  "sleep",
];
