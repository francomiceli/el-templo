// Fase 201: tipos del app de Conquer. Espejo EXACTO de los JSON-schemas de respuesta del API
// (`el-templo-api/src/modules/conquer/schemas.ts`). Si cambia un contrato, cambia acá.

// ── Uniones ─────────────────────────────────────────────────────────

export type Level = 'ternero' | 'novillo' | 'toro'
export type StepKey = 'e1' | 'e2' | 'e3' | 'hold'
/** Escalones que cuentan para Subir (el hold no sube). */
export type CountedStep = 'e1' | 'e2' | 'e3'
export type Mode = 'completa' | 'negativa' | 'hold'
export type Unit = 'reps' | 's'
export type Estado = 'sin_datos' | 'rango' | 'techo1' | 'bajo' | 'subir'
export type ComboKey = 'plancha' | 'front' | 'vertical' | 'dominadas' | 'push' | 'pull'
export type Pose = 'frente' | 'perfil' | 'espalda'
export type ConquerStatus = 'bloqueado' | 'pedido' | 'activo'

// ── Estado, Inicio y control físico (GET /state, POST /unlock-request) ──

export interface PlanDayView {
  dayKey: string
  label: string
  done: boolean
}

/** Semana calendario del plan (D-16), común a `TodayResponse` y `HomeView`. */
export interface PlanWeek {
  weekMonday: string
  plan: PlanDayView[]
  nextDayKey: string | null
  weekComplete: boolean
}

export interface HomeLastByDay {
  dayKey: string
  label: string
  date: string | null
  /** `unilateral`: el peldaño de la marca se carga por lado (§1.4). */
  e1: { exerciseName: string; value: number; unit: Unit; unilateral: boolean }[]
}

export interface HomeView extends PlanWeek {
  lastByDay: HomeLastByDay[]
}

/** `member.bodyCheck`: banderas del control físico (§6, D-15). */
export interface BodyCheckSummary {
  hasDay0: boolean
  day0Skipped: boolean
  mustPromptDay0: boolean
  day0Pending: boolean
  lastCheckDate: string | null
  nextDueDate: string | null
  due: boolean
  overdue: boolean
}

export interface ConquerMemberState {
  level: Level | null
  daysCount: number | null
  incReps: number
  incS: number
  activationDate: string | null
  blockWeek: number
  cutStage: number
  publishEnabled: boolean
  publishNoFace: boolean
  home: HomeView
  bodyCheck: BodyCheckSummary
}

export interface ConquerStateResponse {
  status: ConquerStatus
  requestedAt: string | null
  /** Solo viene con `status === 'activo'`. */
  member: ConquerMemberState | null
}

// ── Hoy, guardado y cambio de escalón ───────────────────────────────

export interface ComboRung {
  id: number
  code: string
  name: string
  position: number
}

/** Combo de apertura (Toro) o del sábado: peldaño de arranque y series completadas (§3.3). */
export interface ComboView {
  comboKey: ComboKey
  label: string
  press: string
  push: string
  hold: string
  rungs: ComboRung[]
  rungId: number
  rungName: string
  target: number
  value: number
  /** Solo el sábado. */
  maxSeries: number | null
  drops: number | null
  subir: { ready: boolean; toRungName: string | null }
}

export interface TodayRung {
  id: number
  code: string
  name: string
  position: number
  brazosRectos: boolean
  unilateral: boolean
}

export interface TodayStep {
  step: StepKey
  rungId: number
  rungName: string
  mode: Mode
  /** `null` en el hold. */
  target: number | null
  /** `null` en el hold. */
  estado: Estado | null
  value: number
  brazosRectos: boolean
  unilateral: boolean
}

export interface TodayExercise {
  exerciseId: number
  code: string
  name: string
  unit: Unit
  rungs: TodayRung[]
  steps: TodayStep[]
}

export interface SaturdayView {
  warmup: string
  push: ComboView
  pull: ComboView
}

export interface TodayResponse extends PlanWeek {
  date: string
  dayKey: string
  label: string
  alreadySaved: boolean
  pain: number
  finisher: string
  level: Level
  exercises: TodayExercise[]
  opening: ComboView | null
  saturday: SaturdayView | null
}

export interface ComboEntry {
  rungId: number
  series: number
}

export interface SaveSessionExercise {
  exerciseId: number
  e1: number
  e2: number
  e3: number
  hold: number
}

/** Body de `PUT /sessions`: la fecha y el prev los pone el servidor (T-201-21). */
export interface SaveSessionBody {
  dayKey: string
  pain: number
  exercises?: SaveSessionExercise[]
  opening?: ComboEntry
  push?: ComboEntry
  pull?: ComboEntry
}

export interface Lighting {
  primary: string[]
  secondary: string[]
}

export interface CalibrationProposal {
  exerciseId: number
  exerciseName: string
  proposal: 'subir' | 'quedarse' | 'bajar'
  fromRungName: string
  toRungName: string | null
}

export interface SaveSessionResponse {
  sessionId: number
  date: string
  dayKey: string
  lighting: Lighting
  calibration: CalibrationProposal[]
}

/** Body de `PUT /steps/:exerciseId/:step`. */
export interface ChangeStepBody {
  rungId: number
  mode: Mode
}

// ── Progreso, Subir y calibración ───────────────────────────────────

export interface SubirItem {
  exerciseId: number
  exerciseName: string
  step: CountedStep
  fromRungName: string
  /** `null` = tope de la escalera: sin botón, el coach ya está avisado. */
  toRungName: string | null
}

export interface ComboSubirItem {
  comboKey: ComboKey
  label: string
  fromRungName: string
  toRungName: string | null
}

export interface ProgressStep {
  step: StepKey
  rungId: number
  rungName: string
  /** El peldaño ACTUAL del escalón se carga por lado (§1.4). */
  unilateral: boolean
  mode: Mode
  last: number | null
  target: number | null
  estado: Estado | null
}

export interface ProgressExercise {
  exerciseId: number
  name: string
  unit: Unit
  e1Curve: number[]
  steps: ProgressStep[]
}

export interface ProgressDay {
  dayKey: string
  label: string
  sessionsCount: number
  exercises: ProgressExercise[]
}

export interface ProgressResponse {
  sessionsCount: number
  accuracy: { n: number; hits: number; pct: number | null; delta: number | null }
  weekLighting: Lighting
  subir: SubirItem[]
  comboSubir: ComboSubirItem[]
  calibrations: CalibrationProposal[]
  days: ProgressDay[]
}

export interface SubirComboResponse {
  combo: ComboView
}

// ── Control físico ──────────────────────────────────────────────────

/** Nunca lleva claves de storage ni URLs (T-201-43). */
export interface BodyCheckView {
  id: number
  checkDate: string
  kind: 'dia0' | 'periodico'
  photos: Record<Pose, boolean>
  armCm: number | null
  chestCm: number | null
  shouldersCm: number | null
  waistCm: number | null
  weightKg: number | null
}

export interface CheckComparisonRef {
  id: number
  checkDate: string
}

export interface CheckMeasure {
  key: 'arm' | 'chest' | 'shoulders' | 'waist' | 'weight'
  label: string
  from: number | null
  to: number | null
  diff: number | null
}

export interface CheckComparison {
  from: CheckComparisonRef
  to: CheckComparisonRef
  weeks: number
  measures: CheckMeasure[]
}

export interface BodyChecksResponse {
  checks: BodyCheckView[]
  compare: CheckComparison | null
  due: { nextDueDate: string | null; due: boolean; overdue: boolean }
}

/** Body de `POST /body-checks`: todos opcionales (perímetros 10-300 cm, peso 20-400 kg). */
export interface UpsertBodyCheckBody {
  armCm?: number
  chestCm?: number
  shouldersCm?: number
  waistCm?: number
  weightKg?: number
}

/** Tipos de foto que acepta el API (`upload-url`). */
export type PhotoMime = 'image/jpeg' | 'image/png' | 'image/webp'

export interface PhotoUploadResponse {
  uploadUrl: string
  key: string
  contentType: string
  expiresIn: number
}

export interface PhotoUrlResponse {
  url: string
  expiresIn: number
}

export interface PublishPermissionBody {
  enabled: boolean
  noFace: boolean
}

export interface PublishPermission {
  enabled: boolean
  noFace: boolean
  changedAt: string
}
