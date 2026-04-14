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

// =========================================================================
// V2 Avatar Profiling Quiz (Phase 90)
// =========================================================================

export type AgeRange = '18_28' | '29_40' | '41_plus'
export type TrainingBackground =
  | 'el_templo'
  | 'nunca'
  | 'gym'
  | 'cardio'
  | 'yoga_pilates'
  | 'calistenia'
  | 'deje'
export type GoalChoice =
  | 'habito'
  | 'fuerza_general'
  | 'comunidad'
  | 'piernas_gluteos'
  | 'cuerpo_firme'
  | 'cero_atleta'
  | 'skill'
  | 'longevidad'
export type PainPoint =
  | 'tiempo'
  | 'constancia'
  | 'no_se_por_donde'
  | 'ambiente'
  | 'resultados'
  | 'nada'
export type TrainingFrequency = '2' | '3' | '4' | '5_plus'
export type AvatarLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K'

export type QuizKeyV2 =
  | 'ageRange'
  | 'trainingBackground'
  | 'goal'
  | 'painPoint'
  | 'trainingFrequency'

export interface QuizQuestionV2 {
  key: QuizKeyV2
  text: string
  options: QuizOption[]
  genderFiltered?: boolean
}

export const QUIZ_QUESTIONS_V2: QuizQuestionV2[] = [
  {
    key: 'ageRange',
    text: '¿Qué edad tenés?',
    options: [
      { value: '18_28', label: '18 a 28 años' },
      { value: '29_40', label: '29 a 40 años' },
      { value: '41_plus', label: '41 o más' },
    ],
  },
  {
    key: 'trainingBackground',
    text: '¿Cómo venís entrenando?',
    options: [
      { value: 'el_templo', label: 'Ya entreno en El Templo' },
      { value: 'nunca', label: 'Nunca entrené en serio' },
      { value: 'gym', label: 'Gym / pesas' },
      { value: 'cardio', label: 'Correr / nadar / bici' },
      { value: 'yoga_pilates', label: 'Yoga / pilates / similar' },
      { value: 'calistenia', label: 'Calistenia / peso corporal' },
      { value: 'deje', label: 'Entrenaba pero dejé' },
    ],
  },
  {
    key: 'goal',
    text: '¿Qué querés lograr?',
    genderFiltered: true,
    options: [
      // Universal
      { value: 'habito', label: 'Crear el hábito de entrenar' },
      { value: 'fuerza_general', label: 'Fuerza y cuerpo completo' },
      { value: 'comunidad', label: 'Entrenar con gente, pertenecer' },
      // Women-only
      { value: 'piernas_gluteos', label: 'Piernas y glúteos que se noten' },
      { value: 'cuerpo_firme', label: 'Cuerpo firme y funcional' },
      // Men-only
      { value: 'cero_atleta', label: 'De cero a atleta' },
      { value: 'skill', label: 'Dominar un skill (front lever, muscle up, planche)' },
      // 41+
      { value: 'longevidad', label: 'Moverme sin dolor, longevidad' },
    ],
  },
  {
    key: 'painPoint',
    text: '¿Qué te frenó hasta ahora?',
    options: [
      { value: 'tiempo', label: 'No tengo tiempo' },
      { value: 'constancia', label: 'Siempre empiezo y no sigo' },
      { value: 'no_se_por_donde', label: 'No sé por dónde empezar' },
      { value: 'ambiente', label: 'El gym no era para mí' },
      { value: 'resultados', label: 'Entrené pero no vi resultados' },
      { value: 'nada', label: 'Nada, estoy listo/a' },
    ],
  },
  {
    key: 'trainingFrequency',
    text: '¿Cuántos días por semana podés entrenar?',
    options: [
      { value: '2', label: '2 veces' },
      { value: '3', label: '3 veces' },
      { value: '4', label: '4 veces' },
      { value: '5_plus', label: '5 o más' },
    ],
  },
]

// Level selector question (conditional step 2.5 — shown only when trainingBackground === 'el_templo')
export type TemploLevel = 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan'

export const LEVEL_SELECTOR_QUESTION: QuizQuestionV2 = {
  key: 'trainingBackground', // reuses key slot for component compatibility
  text: '¿En qué nivel entrenás?',
  options: [
    { value: 'alfa', label: 'α Alfa' },
    { value: 'delta', label: 'Δ Delta' },
    { value: 'sigma', label: 'Σ Sigma' },
    { value: 'omega', label: 'Ω Omega' },
    { value: 'spartan', label: 'Ω Spartan' },
  ],
}

// Q3 gender filtering constants
export const Q3_UNIVERSAL_OPTIONS: string[] = ['habito', 'fuerza_general', 'comunidad']
export const Q3_WOMEN_OPTIONS: string[] = ['piernas_gluteos', 'cuerpo_firme']
export const Q3_MEN_OPTIONS: string[] = ['cero_atleta', 'skill']
export const Q3_41PLUS_OPTION: string = 'longevidad'

export interface OnboardingAnswersV2 {
  ageRange: AgeRange | null
  trainingBackground: TrainingBackground | null
  level: TemploLevel | null
  goal: GoalChoice | null
  painPoint: PainPoint | null
  trainingFrequency: TrainingFrequency | null
}

export interface CompleteOnboardingResponseV2 {
  profile: {
    ageRange: AgeRange
    trainingBackground: TrainingBackground
    goal: GoalChoice
    painPoint: PainPoint
    trainingFrequency: TrainingFrequency
    avatarType: AvatarLetter
    suggestedProgram: string
    onboardingCompletedAt: string
  }
  auraAwarded: number
}

export interface ProgramRecommendation {
  name: string
  description: string
}

export const PROGRAM_RECOMMENDATIONS: Record<string, ProgramRecommendation> = {
  '30 Días - Crea el Hábito': {
    name: '30 Días - Crea el Hábito',
    description:
      'Un programa de 30 días para instalar el hábito de entrenar. Sin equipamiento, desde casa.',
  },
  'Foundation - Cuerpo Completo': {
    name: 'Foundation - Cuerpo Completo',
    description: 'El programa base de El Templo. Fuerza general, técnica y progresión visible.',
  },
  'Piernas y Glúteos - 12 Semanas': {
    name: 'Piernas y Glúteos - 12 Semanas',
    description: 'Resultado estético específico con método y progresión real.',
  },
}
