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

export type AgeRange = '18_24' | '25_34' | '35_50' | '50_plus'

export const AGE_RANGE_SKIP_DEFAULT: AgeRange = '25_34'

export function ageToRange(age: number): AgeRange {
  if (age < 25) return '18_24'
  if (age < 35) return '25_34'
  if (age < 51) return '35_50'
  return '50_plus'
}

export function deriveAgeRangeFromDob(dob: string | null | undefined): AgeRange | null {
  if (!dob) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  if (!m) return null
  const y = +m[1],
    mo = +m[2],
    d = +m[3]
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--
  if (age < 18) return '18_24'
  return ageToRange(age)
}

export function parseDmyToAgeRange(input: string): AgeRange | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.trim())
  if (!m) return null
  const d = +m[1],
    mo = +m[2],
    y = +m[3]
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() < mo - 1 || (now.getMonth() === mo - 1 && now.getDate() < d)) age--
  if (age < 13 || age > 110) return null
  if (age < 18) return '18_24'
  return ageToRange(age)
}
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
  /** Italic lore line rendered above the question. Sets the frame before asking. */
  frame?: string
}

export const QUIZ_QUESTIONS_V2: QuizQuestionV2[] = [
  {
    key: 'ageRange',
    text: '¿Qué edad tenés?',
    frame: 'Cada etapa tiene su fuerza. Entrenamos todas.',
    options: [
      { value: '18_24', label: '18 a 24 años' },
      { value: '25_34', label: '25 a 34 años' },
      { value: '35_50', label: '35 a 50 años' },
      { value: '50_plus', label: 'Más de 50' },
    ],
  },
  {
    key: 'trainingBackground',
    text: '¿Cuál es tu historia con el entrenamiento?',
    frame: 'Nada es al azar. Todo es metodología.',
    options: [
      { value: 'el_templo', label: 'Ya entreno en El Templo' },
      { value: 'nunca', label: 'Nunca entrené en serio' },
      { value: 'gym', label: 'Gimnasio con pesas' },
      { value: 'cardio', label: 'Running, natación o ciclismo' },
      { value: 'yoga_pilates', label: 'Yoga o pilates' },
      { value: 'calistenia', label: 'Calistenia' },
      { value: 'deje', label: 'Entrenaba pero dejé' },
    ],
  },
  {
    key: 'goal',
    text: '¿Qué te mueve a entrenar?',
    frame: 'Cada meta tiene un camino. Vos elegís el destino.',
    genderFiltered: true,
    options: [
      // Universal
      { value: 'habito', label: 'Crear el hábito de entrenar' },
      { value: 'fuerza_general', label: 'Fuerza y cuerpo completo' },
      { value: 'comunidad', label: 'Entrenar en comunidad' },
      // Women-only
      { value: 'piernas_gluteos', label: 'Tener piernas y glúteos fuertes' },
      { value: 'cuerpo_firme', label: 'Cuerpo firme y funcional' },
      // Men-only
      { value: 'cero_atleta', label: 'De cero a atleta' },
      { value: 'skill', label: 'Lograr un movimiento icónico de calistenia' },
      // 35+
      { value: 'longevidad', label: 'Moverme sin dolor, longevidad' },
    ],
  },
  {
    key: 'painPoint',
    text: '¿Qué no te funcionó hasta ahora?',
    frame: 'No es solo voluntad. A veces falta estructura.',
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
    frame: 'Donde hay ritmo, hay progreso.',
    options: [
      { value: '2', label: '2 veces' },
      { value: '3', label: '3 veces' },
      { value: '4', label: '4 veces' },
      { value: '5_plus', label: '5 o más' },
    ],
  },
]

// =========================================================================
// Reactive lore lines shown AFTER each answer (reflect screens).
// `**word**` inside a line renders as a terracotta emphasis span.
// `trainingBackground: 'el_templo'` is intentionally absent — it advances
// directly to the level picker, which IS the reflect for that answer.
// =========================================================================
export const REFLECT_COPY: Partial<Record<QuizKeyV2, Record<string, string>>> = {
  // ageRange: no reflect — DOB input advances directly, no 5s pause.
  trainingBackground: {
    nunca: 'Cada día es una decisión. Hoy ya la tomaste.',
    gym: 'Vas a descubrir lo que tu cuerpo puede hacer sin máquinas.',
    cardio: 'Moverte es el primer paso. Ahora viene la fuerza.',
    yoga_pilates: 'Ya entrenaste conciencia. Ahora entrenamos fuerza consciente.',
    calistenia: 'Entrenás sin máquinas. Ahora entrenás con método.',
    deje: 'El que volvió sabe cuánto vale seguir.',
  },
  goal: {
    habito:
      'Somos lo que hacemos repetidamente. La excelencia, entonces, no es un acto, sino un hábito.',
    fuerza_general: 'Fuerza real es control absoluto.',
    comunidad: 'Nadie se hace fuerte solo. Ese es el secreto.',
    piernas_gluteos: 'Tallar el cuerpo con intención. Eso es entrenar piernas y glúteos.',
    cuerpo_firme: 'Firmeza no es tono. Es fuerza visible.',
    cero_atleta: 'Cada etapa te entrena para la siguiente. Eso es ser atleta.',
    skill: 'Para lograr el movimiento, tenés que construir el cuerpo. Ese es el camino.',
    longevidad: 'Moverte sin dolor es un entrenamiento, no una suerte.',
  },
  painPoint: {
    tiempo: 'No necesitás más tiempo. Necesitás un método que respete el que tenés.',
    constancia: 'La constancia no se fuerza. Se construye con estructura.',
    no_se_por_donde: 'Empezás donde estás. El método te lleva el resto.',
    ambiente: 'Entrar a entrenar debería sentirse bien. Pronto lo vas a sentir.',
    resultados: 'Si no vas en una dirección, no hay cómo llegar.',
    nada: 'Perfecto. Empezamos.',
  },
  // trainingFrequency intentionally has no reflect copy — Q5 advances
  // directly to the closing revelation so the ceremony lands without
  // an extra 7s pause right before the program reveal.
}

export function lookupReflect(key: QuizKeyV2, value: string): string | null {
  return REFLECT_COPY[key]?.[value] ?? null
}

// Level selector question (conditional step 2.5 — shown only when trainingBackground === 'el_templo')
// Phase 129 (KAIROS-01): kairos added for DB/API/admin parity (widened users.level).
export type TemploLevel = 'kairos' | 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan'

// Spartan intentionally excluded: earned/assigned, not self-claimed during onboarding.
// Kairos likewise is assigned (entry tier), not self-claimed here — the onboarding
// selector UI is phase 130. TemploLevel retains both for DB/API/admin parity.
export const LEVEL_SELECTOR_QUESTION: QuizQuestionV2 = {
  key: 'trainingBackground', // reuses key slot for component compatibility
  text: '¿En qué nivel entrenás?',
  options: [
    { value: 'alfa', label: 'α Alfa' },
    { value: 'delta', label: 'Δ Delta' },
    { value: 'sigma', label: 'Σ Sigma' },
    { value: 'omega', label: 'Ω Omega' },
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
