import type { PhotoMime, Pose } from '../types'

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
