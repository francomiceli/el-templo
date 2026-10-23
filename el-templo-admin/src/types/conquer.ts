/**
 * Fase 201 (Conquer v2): tipos del admin. Espejo EXACTO de los JSON-schemas de respuesta del API
 * (`el-templo-api/src/modules/conquer/schemas.ts`). Si cambia un contrato, cambia acá.
 * Las fotos NUNCA traen claves de storage ni URLs: la URL firmada se pide aparte (5 min).
 */

// ── Uniones ─────────────────────────────────────────────────────────

export type Level = 'ternero' | 'novillo' | 'toro';
export type StepKey = 'e1' | 'e2' | 'e3' | 'hold';
/** Escalones que cuentan para Subir (el hold no sube). */
export type CountedStep = 'e1' | 'e2' | 'e3';
export type Mode = 'completa' | 'negativa' | 'hold';
export type Unit = 'reps' | 's';
export type Estado = 'sin_datos' | 'rango' | 'techo1' | 'bajo' | 'subir';
export type ComboKey = 'plancha' | 'front' | 'vertical' | 'dominadas' | 'push' | 'pull';
export type Pose = 'frente' | 'perfil' | 'espalda';
export type ConquerStatus = 'pedido' | 'activo';
/** Semáforo de un alumno o de una alerta: rojo > amarillo > verde > ok (sin alertas). */
export type Light = 'rojo' | 'amarillo' | 'verde' | 'ok';
export type AlertSeverity = 'rojo' | 'amarillo' | 'verde';
export type AlertKind =
  | 'molestia'
  | 'caida'
  | 'tope_escalera'
  | 'paso_nivel'
  | 'inactivo'
  | 'control_vencido'
  | 'control_dia0_pendiente';
export type AlertStatus = 'abierta' | 'vista' | 'resuelta';

// ── Niveles ─────────────────────────────────────────────────────────

/** Combinaciones válidas nivel/días (§2.2, A14). Espejo de `assertValidLevelDays` del API. */
export const LEVEL_DAYS: Record<Level, number[]> = {
  ternero: [2, 3],
  novillo: [3, 4],
  toro: [4],
};

export const LEVEL_LABELS: Record<Level, string> = {
  ternero: 'Legionario',
  novillo: 'Centurión',
  toro: 'Espartano',
};

export const LEVELS: Level[] = ['ternero', 'novillo', 'toro'];

// ── Pedidos y alta ──────────────────────────────────────────────────

export interface UnlockRequest {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  branchName: string | null;
  /** ISO-8601. */
  requestedAt: string;
}

export interface UnlockRequestsResponse {
  requests: UnlockRequest[];
}

export interface AdminMemberView {
  userId: number;
  status: ConquerStatus;
  level: Level | null;
  daysCount: number | null;
  incReps: number;
  incS: number;
  coachUserId: number | null;
  activatedAt: string | null;
  activationDate: string | null;
  levelSince: string | null;
  cutStage: number;
}

/** Body de `POST /members`: `coachUserId` ausente = el admin que activa, `null` = sin coach. */
export interface ActivateBody {
  userId: number;
  level: Level;
  daysCount: number;
  coachUserId?: number | null;
}

/** Body de `PUT /members/:userId`: al menos una clave. */
export interface UpdateMemberBody {
  level?: Level;
  daysCount?: number;
  incReps?: number;
  incS?: number;
  coachUserId?: number | null;
}

// ── Tablero y alertas ───────────────────────────────────────────────

export interface CutProposal {
  kind: 'etapa' | 'bajar_escalon';
  stage?: number;
  label: string;
}

/** `detail` es libre: cada tipo de alerta trae lo suyo (ver 201-09-SUMMARY). */
export type AlertDetail = Record<string, unknown>;

export interface BoardAlert {
  /** `null` en las alertas derivadas por tiempo (no se guardan). */
  id: number | null;
  kind: AlertKind;
  severity: AlertSeverity;
  label: string;
  /** La frase de la alerta con sus datos (anexo §8, DA-13): "Molestia 6/10 en Plancha el 21/10". */
  text: string;
  status: AlertStatus | null;
  createdAt: string | null;
  detail: AlertDetail;
  proposal: CutProposal | null;
}

export interface BoardMember {
  userId: number;
  firstName: string;
  lastName: string;
  level: Level;
  daysCount: number;
  cutStage: number;
  lastSessionDate: string | null;
  light: Light;
  alerts: BoardAlert[];
}

export interface BoardCounts {
  rojo: number;
  amarillo: number;
  verde: number;
  ok: number;
  total: number;
}

export interface BoardResponse {
  counts: BoardCounts;
  members: BoardMember[];
}

export interface AlertPatchBody {
  status: 'vista' | 'resuelta';
}

// ── Progreso (ficha del alumno) ─────────────────────────────────────

export interface Lighting {
  primary: string[];
  secondary: string[];
}

export interface CalibrationProposal {
  exerciseId: number;
  exerciseName: string;
  proposal: 'subir' | 'quedarse' | 'bajar';
  fromRungName: string;
  toRungName: string | null;
}

export interface SubirItem {
  exerciseId: number;
  exerciseName: string;
  step: CountedStep;
  fromRungName: string;
  toRungName: string | null;
}

export interface ComboSubirItem {
  comboKey: ComboKey;
  label: string;
  fromRungName: string;
  toRungName: string | null;
}

export interface ProgressStep {
  step: StepKey;
  rungId: number;
  rungName: string;
  unilateral: boolean;
  mode: Mode;
  last: number | null;
  target: number | null;
  estado: Estado | null;
}

export interface ProgressExercise {
  exerciseId: number;
  name: string;
  unit: Unit;
  e1Curve: number[];
  steps: ProgressStep[];
}

export interface ProgressDay {
  dayKey: string;
  label: string;
  sessionsCount: number;
  exercises: ProgressExercise[];
}

export interface ProgressResponse {
  sessionsCount: number;
  accuracy: { n: number; hits: number; pct: number | null; delta: number | null };
  weekLighting: Lighting;
  subir: SubirItem[];
  comboSubir: ComboSubirItem[];
  calibrations: CalibrationProposal[];
  days: ProgressDay[];
}

// ── Ficha y acciones del coach ──────────────────────────────────────

export interface FichaMember extends AdminMemberView {
  firstName: string;
  lastName: string;
  email: string | null;
  /** El alumno autorizó usar sus fotos (A19) y, si sí, si es sin cara. */
  publishEnabled: boolean;
  publishNoFace: boolean;
}

export interface FichaResponse {
  member: FichaMember;
  progress: ProgressResponse;
  alerts: BoardAlert[];
  /** `null` = Toro después de la etapa 5: no tiene más pasos de recorte (anexo §8, DA-12). */
  cutProposal: CutProposal | null;
  levelUp: { to: Level | null; validDays: number[] };
}

/** Body de `PUT /members/:userId/steps/:exerciseId/:step`. */
export interface ChangeStepBody {
  rungId: number;
  mode: Mode;
}

export type CutAction = 'aplicar_etapa' | 'deshacer_etapa' | 'bajar_escalon';

/** Body de `POST /members/:userId/recortes` (esquema plano: lo que exige cada acción lo valida el API). */
export interface CutBody {
  action: CutAction;
  alertId?: number;
  exerciseId?: number;
  step?: StepKey;
}

export interface LevelUpBody {
  daysCount: number;
}

// ── Control físico y galería ────────────────────────────────────────

export interface BodyCheckView {
  id: number;
  checkDate: string;
  kind: 'dia0' | 'periodico';
  photos: Record<Pose, boolean>;
  armCm: number | null;
  chestCm: number | null;
  shouldersCm: number | null;
  waistCm: number | null;
  weightKg: number | null;
}

export interface CheckComparisonRef {
  id: number;
  checkDate: string;
}

export interface CheckMeasure {
  key: 'arm' | 'chest' | 'shoulders' | 'waist' | 'weight';
  label: string;
  from: number | null;
  to: number | null;
  diff: number | null;
}

export interface CheckComparison {
  from: CheckComparisonRef;
  to: CheckComparisonRef;
  weeks: number;
  measures: CheckMeasure[];
}

export interface BodyChecksResponse {
  checks: BodyCheckView[];
  compare: CheckComparison | null;
  due: { nextDueDate: string | null; due: boolean; overdue: boolean };
}

export interface PhotoUrlResponse {
  url: string;
  expiresIn: number;
}

export interface GalleryItem {
  userId: number;
  firstName: string;
  lastName: string;
  level: Level | null;
  publishEnabled: boolean;
  publishNoFace: boolean;
  publishChangedAt: string | null;
  /** Control con contenido más viejo. */
  day0: BodyCheckView | null;
  /** Control con contenido más nuevo (`null` si hay uno solo). */
  last: BodyCheckView | null;
  compare: CheckComparison | null;
}

export interface GalleryResponse {
  items: GalleryItem[];
}

// ── Catálogo y parámetros ───────────────────────────────────────────

export interface AdminRung {
  id: number;
  code: string;
  name: string;
  /** 0 = el más difícil; una posición mayor es un peldaño más fácil. */
  position: number;
  unilateral: boolean;
  isActive: boolean;
  /** Algún escalón de algún alumno apunta a este peldaño. */
  inUse: boolean;
}

export interface AdminLadder {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  rungs: AdminRung[];
}

export interface ExerciseMuscle {
  zone: string;
  role: 'principal' | 'secundario';
}

/** `rung` es el CODE del peldaño (no el nombre). */
export interface StartStep {
  step: StepKey;
  rung: string;
  mode: Mode;
}

export interface AdminExercise {
  id: number;
  code: string;
  name: string;
  /** Escalera de E1-E3 (y del hold si `holdLadderId` es null). */
  ladderId: number;
  ladderCode: string;
  /** Escalera propia del hold final (anexo §2). `null` = usa la de E1-E3. */
  holdLadderId: number | null;
  holdLadderCode: string | null;
  /** Marca de brazos rectos del ejercicio (anexo §1): decide el texto de fallo del alumno. */
  brazosRectos: boolean;
  unit: Unit;
  muscles: ExerciseMuscle[];
  /** Tabla de arranque de Toro. */
  startSteps: StartStep[];
  /** Tabla de arranque de Novillo (anexo §3). `[]` = no cargada. */
  startStepsNovillo: StartStep[];
  /** Tabla de arranque de Ternero (anexo §3). `[]` = no cargada. */
  startStepsTernero: StartStep[];
  sortOrder: number;
  isActive: boolean;
}

export interface AdminTemplateDay {
  id: number;
  daysCount: number;
  dayKey: string;
  label: string;
  sortOrder: number;
  finisherText: string;
  exerciseCodes: string[];
  openingComboKey: string | null;
}

export interface CatalogZone {
  slug: string;
  label: string;
}

export interface AdminCatalog {
  ladders: AdminLadder[];
  exercises: AdminExercise[];
  templateDays: AdminTemplateDay[];
  zones: CatalogZone[];
}

export interface CreateRungBody {
  name: string;
  unilateral: boolean;
}

export interface UpdateRungBody {
  name?: string;
  unilateral?: boolean;
  isActive?: boolean;
}

export interface UpdateExerciseBody {
  name?: string;
  brazosRectos?: boolean;
  startSteps?: StartStep[];
  startStepsNovillo?: StartStep[];
  startStepsTernero?: StartStep[];
  muscles?: ExerciseMuscle[];
}

export interface UpdateTemplateDayBody {
  label?: string;
  finisherText?: string;
  exerciseCodes?: string[];
}

export interface SettingRange {
  min: number;
  max: number;
}

/** Fase 201 201-25 (anexo §3): el arranque por nivel son tablas por ejercicio, ya no un offset. */
export interface ConquerSettings {
  comboWeeksN: number;
}

export interface ConquerSettingsRanges {
  comboWeeksN: SettingRange;
}

export interface ConquerSettingsResponse {
  settings: ConquerSettings;
  ranges: ConquerSettingsRanges;
}

/** Body de `PUT /settings`: al menos una clave. */
export interface ConquerSettingsPatch {
  comboWeeksN?: number;
}
