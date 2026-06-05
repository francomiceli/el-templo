/**
 * TypeScript interfaces for progression data
 *
 * Matches the API response structure from /progression endpoints.
 */

export interface ProgressionLevel {
  // Phase 129 (KAIROS-01): kairos added for parity with the widened users.level enum.
  current: 'kairos' | 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan'
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
  blocksCompleted: string[]
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

// --- Tree progress types (Phase 127) ---
//
// Mirror the authoritative DTO returned by GET /api/tree-progress/me
// (see 127-01-SUMMARY.md). All percentages are computed server-side; the
// client renders them verbatim and computes nothing (D-05).

/** A single exercise node within a subfamily. */
export interface TreeNode {
  exerciseId: number
  name: string
  dificultadLineal: number
  reached: boolean
}

/** A subfamily (e.g. "Dominadas") with its server-computed advancement. */
export interface TreeSubfamily {
  id: number
  name: string
  route: string
  totalNodes: number
  reachedNodes: number
  percent: number
  nodes: TreeNode[]
}

/** One of the 5 thematic categories (Tracción/Empuje/Piernas/Core/Movilidad). */
export interface TreeCategory {
  key: string
  label: string
  totalNodes: number
  reachedNodes: number
  percent: number
  subfamilies: TreeSubfamily[]
}

/** Full response of GET /api/tree-progress/me. */
export interface TreeProgressResponse {
  /**
   * Member's `users.level`. Mirrors the authoritative backend DTO
   * (service.ts / schemas.ts / 127-01-SUMMARY). Not currently rendered by the
   * Mi Árbol view, but kept on the type so the contract stays in sync.
   */
  level: 'kairos' | 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan'
  categories: TreeCategory[]
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
      { label: 'No', value: 'ninguna' },
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
