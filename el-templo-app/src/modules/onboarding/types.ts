export type GoalType = 'muscle_up' | 'fitness' | 'weight_loss' | 'flexibility' | 'wellness'
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'
export type TrainingFocus = 'upper_body' | 'lower_body' | 'core' | 'full_body'
export type MotivationStyle = 'discipline' | 'community' | 'results' | 'challenges'

export interface QuizOption {
  value: string
  label: string
}

export interface QuizQuestion {
  key: 'goalType' | 'experienceLevel' | 'trainingFocus' | 'motivationStyle'
  text: string
  options: QuizOption[]
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    key: 'goalType',
    text: '\u00bfCu\u00e1l es tu objetivo principal?',
    options: [
      { value: 'muscle_up', label: 'Primer Muscle-Up' },
      { value: 'fitness', label: 'Mejor forma f\u00edsica' },
      { value: 'weight_loss', label: 'Perder peso' },
      { value: 'flexibility', label: 'Flexibilidad' },
      { value: 'wellness', label: 'Bienestar general' },
    ],
  },
  {
    key: 'experienceLevel',
    text: '\u00bfCu\u00e1l es tu experiencia en calistenia?',
    options: [
      { value: 'beginner', label: 'Empiezo de cero' },
      { value: 'intermediate', label: 'Algo de experiencia' },
      { value: 'advanced', label: 'Entreno hace rato' },
    ],
  },
  {
    key: 'trainingFocus',
    text: '\u00bfQu\u00e9 zona quer\u00e9s priorizar?',
    options: [
      { value: 'upper_body', label: 'Tren superior' },
      { value: 'lower_body', label: 'Tren inferior' },
      { value: 'core', label: 'Core' },
      { value: 'full_body', label: 'Cuerpo completo' },
    ],
  },
  {
    key: 'motivationStyle',
    text: '\u00bfQu\u00e9 te motiva m\u00e1s?',
    options: [
      { value: 'discipline', label: 'Disciplina personal' },
      { value: 'community', label: 'Comunidad y compa\u00f1eros' },
      { value: 'results', label: 'Resultados visibles' },
      { value: 'challenges', label: 'Desaf\u00edos y metas' },
    ],
  },
]

export interface OnboardingAnswers {
  goalType: GoalType | null
  experienceLevel: ExperienceLevel | null
  trainingFocus: TrainingFocus | null
  motivationStyle: MotivationStyle | null
}

export interface OnboardingProfile {
  goalType: GoalType
  experienceLevel: ExperienceLevel
  trainingFocus: TrainingFocus
  motivationStyle: MotivationStyle
  onboardingCompletedAt: string | null
}

export interface CompleteOnboardingResponse {
  profile: OnboardingProfile
  auraAwarded: number
}

// Display label maps (reused by result screen and Tu Camino card)
export const GOAL_LABELS: Record<GoalType, string> = {
  muscle_up: 'Primer Muscle-Up',
  fitness: 'Mejor forma f\u00edsica',
  weight_loss: 'Perder peso',
  flexibility: 'Flexibilidad',
  wellness: 'Bienestar general',
}

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'Empiezo de cero',
  intermediate: 'Algo de experiencia',
  advanced: 'Entreno hace rato',
}

export const TRAINING_FOCUS_LABELS: Record<TrainingFocus, string> = {
  upper_body: 'Tren superior',
  lower_body: 'Tren inferior',
  core: 'Core',
  full_body: 'Cuerpo completo',
}

export const MOTIVATION_LABELS: Record<MotivationStyle, string> = {
  discipline: 'Disciplina personal',
  community: 'Comunidad y compa\u00f1eros',
  results: 'Resultados visibles',
  challenges: 'Desaf\u00edos y metas',
}

// Result screen summary rows (icon, label, value lookup)
export const SUMMARY_ROWS = [
  {
    icon: 'flag',
    label: 'Objetivo',
    key: 'goalType' as const,
    labels: GOAL_LABELS,
  },
  {
    icon: 'fitness_center',
    label: 'Experiencia',
    key: 'experienceLevel' as const,
    labels: EXPERIENCE_LABELS,
  },
  {
    icon: 'accessibility_new',
    label: 'Enfoque',
    key: 'trainingFocus' as const,
    labels: TRAINING_FOCUS_LABELS,
  },
  {
    icon: 'local_fire_department',
    label: 'Motivaci\u00f3n',
    key: 'motivationStyle' as const,
    labels: MOTIVATION_LABELS,
  },
] as const
