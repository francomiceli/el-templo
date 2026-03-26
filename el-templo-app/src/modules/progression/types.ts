/**
 * TypeScript interfaces for progression data
 *
 * Matches the API response structure from /progression endpoints.
 */

export interface ProgressionLevel {
  current: 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan'
  displayName: string
  greekLetter: string
}

export interface ProgressionStats {
  totalSessions: number
  totalDaysTrained: number
  sessionsThisWeek: number
  currentStreak: number
  longestStreak: number
}

export interface RpeTrend {
  labels: string[]
  data: (number | null)[]
  averageRpe: number
}

export interface EvaluationStatus {
  eligible: boolean
  averageRpeLast2Weeks: number | null
  pendingRequest: boolean
  requestedAt: string | null
}

export interface TodaySession {
  completed: boolean
  rpe: number | null
  notes: string | null
  durationMinutes: number | null
}

export interface ProgressionResponse {
  level: ProgressionLevel
  stats: ProgressionStats
  rpeTrend: RpeTrend
  evaluation: EvaluationStatus
  todaySession: TodaySession | null
}

export interface WeeklySummary {
  sessionsCompleted: number
  totalMinutes: number
  averageRpe: number | null
  weekStart: string
  weekEnd: string
  sessionBudget: number | null
}

// --- Check-in types (Phase 82) ---

export type CheckInQuestionType = 'energy' | 'soreness' | 'sleep'

export interface CheckInAnswerValue {
  value: string
  bodyArea: string | null
}

export interface TodayCheckInState {
  answers: Record<CheckInQuestionType, CheckInAnswerValue | null>
}

export interface CheckInQuestionConfig {
  type: CheckInQuestionType
  question: string
  icon: string
  options: { label: string; value: string }[]
  needsBodyArea: (value: string) => boolean
}

export const CHECK_IN_QUESTIONS: CheckInQuestionConfig[] = [
  {
    type: 'energy',
    question: '¿Cómo te sentís hoy?',
    icon: 'bolt',
    options: [
      { label: 'Bajo', value: 'bajo' },
      { label: 'Normal', value: 'normal' },
      { label: 'Alto', value: 'alto' },
    ],
    needsBodyArea: () => false,
  },
  {
    type: 'soreness',
    question: '¿Tenés alguna molestia?',
    icon: 'accessibility_new',
    options: [
      { label: 'Ninguna', value: 'ninguna' },
      { label: 'Leve', value: 'leve' },
      { label: 'Moderada', value: 'moderada' },
    ],
    needsBodyArea: (v: string) => v === 'leve' || v === 'moderada',
  },
  {
    type: 'sleep',
    question: '¿Cómo dormiste?',
    icon: 'bedtime',
    options: [
      { label: 'Mal', value: 'mal' },
      { label: 'Ok', value: 'ok' },
      { label: 'Bien', value: 'bien' },
    ],
    needsBodyArea: () => false,
  },
]

export const BODY_AREA_OPTIONS = [
  { label: 'Hombros', value: 'hombros' },
  { label: 'Espalda', value: 'espalda' },
  { label: 'Piernas', value: 'piernas' },
  { label: 'Core', value: 'core' },
  { label: 'General', value: 'general' },
]
