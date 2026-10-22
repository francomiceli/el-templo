import type {
  BodyCheckView,
  CheckComparison,
  CheckMeasure,
  PhotoMime,
  Pose,
  UpsertBodyCheckBody,
} from '../types'

// Fase 201 §6, D-15: piezas puras del control físico (poses, medidas, formato de la foto y copy de
// los fallos de subida). Sin Vue ni Capacitor: las usan la cámara, la pantalla del control y el
// comparador. Adaptado de `utils/body-check.ts` de la 196 (D-04) sin poses opcionales ni medidas
// configurables.

/** Las 3 poses fijas, en el orden en que se sacan (§6). */
export const CONQUER_POSES: readonly Pose[] = ['frente', 'perfil', 'espalda']

export const POSE_LABELS: Record<Pose, string> = {
  frente: 'Frente',
  perfil: 'Perfil',
  espalda: 'Espalda',
}

const SAME_CONDITIONS = 'Misma luz, misma hora, sin entrenar antes.'

/** Consejo corto de cada pose (se muestra dentro de la hornacina). */
export const POSE_TIPS: Record<Pose, string> = {
  frente: `De frente, brazos relajados al costado. ${SAME_CONDITIONS}`,
  perfil: `De costado, brazos relajados. ${SAME_CONDITIONS}`,
  espalda: `De espaldas, brazos relajados al costado. ${SAME_CONDITIONS}`,
}

// ── Medidas que escribe el alumno ───────────────────────────────────

export const MEASURE_MIN_CM = 10
export const MEASURE_MAX_CM = 300
export const WEIGHT_MIN_KG = 20
export const WEIGHT_MAX_KG = 400

export type MeasureParse = { ok: true; value: number | null } | { ok: false; message: string }

const NUMBER_RE = /^\d+(?:[.,]\d+)?$/

/** Un decimal, como el API (35,54 -> 35,5). */
function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}

function parseBounded(raw: string, min: number, max: number, unit: string): MeasureParse {
  const text = raw.trim()
  if (text === '') return { ok: true, value: null }
  if (!NUMBER_RE.test(text)) {
    return { ok: false, message: 'Ingresá solo el número, por ejemplo 35,5' }
  }
  const value = roundOne(Number(text.replace(',', '.')))
  if (value < min || value > max) return { ok: false, message: `Entre ${min} y ${max} ${unit}` }
  return { ok: true, value }
}

/** Perímetro en cm (10-300). Acepta coma o punto; vacío = no cargado (`null`). */
export function parseMeasure(raw: string): MeasureParse {
  return parseBounded(raw, MEASURE_MIN_CM, MEASURE_MAX_CM, 'cm')
}

/** Peso en kg (20-400), opcional. */
export function parseWeight(raw: string): MeasureParse {
  return parseBounded(raw, WEIGHT_MIN_KG, WEIGHT_MAX_KG, 'kg')
}

/** 35.5 -> "35,5"; 36 -> "36". Para mostrar y para precargar un campo. */
export function formatNumberEs(value: number): string {
  return String(roundOne(value)).replace('.', ',')
}

/** Diferencia con signo: "+1,5 cm", "−0,5 cm" (menos tipográfico), "0 cm". */
export function formatDiff(diff: number, unit: 'cm' | 'kg'): string {
  const rounded = roundOne(diff)
  if (rounded === 0) return `0 ${unit}`
  const sign = rounded > 0 ? '+' : '−'
  return `${sign}${formatNumberEs(Math.abs(rounded))} ${unit}`
}

export type MeasureKey = CheckMeasure['key']

export interface MeasureField {
  key: MeasureKey
  label: string
  unit: 'cm' | 'kg'
  /** Clave en el body de `POST /body-checks`. */
  bodyKey: keyof UpsertBodyCheckBody
  /** Clave en `BodyCheckView`. */
  viewKey: 'armCm' | 'chestCm' | 'shouldersCm' | 'waistCm' | 'weightKg'
}

/** Los 4 perímetros y el peso (opcional), en el orden de la pantalla (§6). */
export const MEASURE_FIELDS: readonly MeasureField[] = [
  { key: 'arm', label: 'Brazo', unit: 'cm', bodyKey: 'armCm', viewKey: 'armCm' },
  { key: 'chest', label: 'Pecho', unit: 'cm', bodyKey: 'chestCm', viewKey: 'chestCm' },
  {
    key: 'shoulders',
    label: 'Hombros',
    unit: 'cm',
    bodyKey: 'shouldersCm',
    viewKey: 'shouldersCm',
  },
  { key: 'waist', label: 'Cintura', unit: 'cm', bodyKey: 'waistCm', viewKey: 'waistCm' },
  { key: 'weight', label: 'Peso (opcional)', unit: 'kg', bodyKey: 'weightKg', viewKey: 'weightKg' },
]

/** Texto de cada campo, por medida. */
export type MeasureDrafts = Record<MeasureKey, string>

export function emptyDrafts(): MeasureDrafts {
  return { arm: '', chest: '', shoulders: '', waist: '', weight: '' }
}

/** Los campos arrancan con lo ya guardado del control de hoy (si lo hay), en formato argentino. */
export function draftsFromCheck(check: BodyCheckView | null): MeasureDrafts {
  const drafts = emptyDrafts()
  if (!check) return drafts
  for (const field of MEASURE_FIELDS) {
    const saved = check[field.viewKey]
    if (saved !== null) drafts[field.key] = formatNumberEs(saved)
  }
  return drafts
}

export type MeasuresResult =
  | { ok: true; body: UpsertBodyCheckBody; filled: number }
  | { ok: false; errors: Partial<Record<MeasureKey, string>> }

/**
 * Body de `POST /body-checks` con lo que escribió el alumno. Valida todo junto para mostrar todos
 * los errores a la vez. Un campo vacío no se manda (el API solo escribe lo que viene y no borra).
 */
export function buildMeasuresBody(drafts: MeasureDrafts): MeasuresResult {
  const errors: Partial<Record<MeasureKey, string>> = {}
  const body: UpsertBodyCheckBody = {}
  let filled = 0
  for (const field of MEASURE_FIELDS) {
    const parsed =
      field.key === 'weight' ? parseWeight(drafts.weight) : parseMeasure(drafts[field.key])
    if (!parsed.ok) {
      errors[field.key] = parsed.message
    } else if (parsed.value !== null) {
      body[field.bodyKey] = parsed.value
      filled += 1
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, body, filled }
}

// ── Comparador antes/después ────────────────────────────────────────

/** "2026-10-21" del reloj local del teléfono (para reconocer el control de hoy en la lista). */
export function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** El control de hoy dentro de la lista del API (más nuevo primero), o `null`. */
export function findTodayCheck(
  checks: readonly BodyCheckView[],
  todayIso: string,
): BodyCheckView | null {
  return checks.find((check) => check.checkDate === todayIso) ?? null
}

/** Título de la hornacina del control más viejo del par. */
export function fromLabel(check: Pick<BodyCheckView, 'kind'>): string {
  return check.kind === 'dia0' ? 'Día 0' : 'Primer control'
}

/** Título de la hornacina del control más nuevo del par: "Semana 4" ("Hoy" si es el mismo día). */
export function toLabel(weeks: number): string {
  return weeks > 0 ? `Semana ${weeks}` : 'Hoy'
}

export interface MeasureRow {
  key: MeasureKey
  label: string
  from: string
  to: string
  change: string
}

const MEASURE_UNITS: Record<MeasureKey, 'cm' | 'kg'> = {
  arm: 'cm',
  chest: 'cm',
  shoulders: 'cm',
  waist: 'cm',
  weight: 'kg',
}

/** Fila de la tabla MEDIDA / DÍA 0 / HOY / CAMBIO: lo que falta se muestra "—". */
export function measureRows(compare: CheckComparison): MeasureRow[] {
  return compare.measures.map((m) => {
    const unit = MEASURE_UNITS[m.key]
    return {
      key: m.key,
      label: m.label,
      from: m.from === null ? '—' : formatNumberEs(m.from),
      to: m.to === null ? '—' : formatNumberEs(m.to),
      change: m.diff === null ? '—' : formatDiff(m.diff, unit),
    }
  })
}

// ── Foto: formato y archivo a subir ─────────────────────────────────

/** El formato que devuelve la cámara ("jpeg", "jpg", "png", "webp") al MIME permitido; otro = `null`. */
export function mimeFromCameraFormat(format: string | undefined): PhotoMime | null {
  switch ((format ?? '').toLowerCase()) {
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    default:
      return null
  }
}

function extensionOf(mime: PhotoMime): string {
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'
}

/**
 * base64 -> Blob. Tolera un prefijo `data:…;base64,` y espacios o saltos de línea. Un base64
 * inválido tira (quien llama lo trata como "no pudimos leer la foto").
 */
export function base64ToBlob(base64: string, mime: string): Blob {
  const clean = base64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * El cuerpo del PUT. Tiene que ser un `File`, no un `Blob`: con `CapacitorHttp` habilitado el
 * puente nativo solo manda los bytes correctos si el cuerpo es un `File`.
 */
export function toUploadFile(base64: string, mime: PhotoMime, pose: Pose): File {
  const blob = base64ToBlob(base64, mime)
  return new File([blob], `${pose}.${extensionOf(mime)}`, { type: mime })
}

// ── Fallos de subida ────────────────────────────────────────────────

/** Por qué no salió una foto: decide el copy y si tiene sentido reintentar. */
export type UploadFailureKind =
  /** Sin señal. */
  | 'offline'
  /** El almacenamiento privado no está configurado (el API respondió 503). */
  | 'unavailable'
  /** Se cortó el envío de la foto o el servidor no la encontró: se reintenta. */
  | 'storage'
  /** El API la rechazó (formato, pose, tamaño): el mensaje viene del servidor. */
  | 'rejected'
  /** Se cortó porque el alumno salió de la pantalla. */
  | 'cancelled'

export const OFFLINE_PHOTO_TEXT = 'Necesitás conexión para subir las fotos.'
export const UNAVAILABLE_PHOTO_TEXT =
  'Las fotos no están disponibles por ahora. Podés guardar las medidas y sacarlas después.'
export const STORAGE_PHOTO_TEXT =
  'No pudimos subir la foto. Revisá tu señal y tocá Reintentar: la foto sigue acá.'
export const CANCELLED_PHOTO_TEXT = 'Se cortó la subida de la foto.'
export const REJECTED_PHOTO_TEXT = 'No pudimos guardar la foto.'

export function uploadFailureText(kind: UploadFailureKind, serverMessage?: string): string {
  switch (kind) {
    case 'offline':
      return OFFLINE_PHOTO_TEXT
    case 'unavailable':
      return UNAVAILABLE_PHOTO_TEXT
    case 'storage':
      return STORAGE_PHOTO_TEXT
    case 'cancelled':
      return CANCELLED_PHOTO_TEXT
    case 'rejected':
      return serverMessage && serverMessage.trim() !== '' ? serverMessage : REJECTED_PHOTO_TEXT
  }
}

/** ¿Tiene sentido dejar la foto en pantalla para reintentar? Un rechazo del servidor no se arregla solo. */
export function isRetryable(kind: UploadFailureKind): boolean {
  return kind === 'offline' || kind === 'storage' || kind === 'unavailable'
}
