// Fase 202 D-27, DA-39, DA-40: validación del video ANTES de subirlo. Pura (sin Vue ni Capacitor).
// El app solo da feedback temprano: el API hace cumplir tipo, tamaño y duración (T-201-152).

/**
 * Topes espejo de `video-rules.ts` del API (no se importa: son paquetes distintos). Si cambian
 * allá, cambian acá.
 */
export const VIDEO_MAX_SECONDS = 30
/** Fase 202 DA-40: el reloj de los teléfonos mide 30,0x s; se acepta hasta 30,5 s y se guarda 30. */
export const VIDEO_DURATION_TOLERANCE = 0.5
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024

export type VideoMime = 'video/mp4' | 'video/quicktime'

export type VideoCheckReason = 'tipo' | 'vacio' | 'pesado' | 'duracion' | 'largo'

export type VideoCheck =
  | { ok: true; seconds: number }
  | { ok: false; reason: VideoCheckReason; message: string }

/**
 * Tipo del archivo: por `type` y, si viene vacío (pasa en algunos Android), por la extensión.
 * `null` si no es MP4 ni MOV. Un `type` informado de otro formato NO se rescata por la extensión.
 */
export function videoMimeOf(file: { type: string; name: string }): VideoMime | null {
  const type = file.type.trim().toLowerCase()
  if (type === 'video/mp4' || type === 'video/quicktime') return type
  if (type !== '') return null
  const dot = file.name.lastIndexOf('.')
  if (dot < 0) return null
  const ext = file.name.slice(dot + 1).toLowerCase()
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4'
  if (ext === 'mov') return 'video/quicktime'
  return null
}

/** Segundos que se mandan al API: entero de 1 a 30 (DA-40, el API no redondea). */
export function videoSeconds(durationSec: number): number {
  return Math.min(VIDEO_MAX_SECONDS, Math.max(1, Math.round(durationSec)))
}

function fail(reason: VideoCheckReason, message: string): VideoCheck {
  return { ok: false, reason, message }
}

/**
 * Valida tipo, tamaño y duración, en ese orden (se muestra el primer problema). `durationSec` es
 * `null` si el teléfono no pudo leer el video.
 */
export function checkVideo(input: {
  mime: VideoMime | null
  size: number
  durationSec: number | null
}): VideoCheck {
  if (input.mime === null) return fail('tipo', 'Solo se pueden mandar videos MP4 o MOV.')
  if (input.size <= 0) return fail('vacio', 'El video está vacío. Probá con otro.')
  if (input.size > VIDEO_MAX_BYTES) {
    return fail('pesado', 'El video pesa más de 100 MB. Grabalo en 1080p (no en 4K) o recortalo.')
  }
  const d = input.durationSec
  if (d === null || !Number.isFinite(d) || d < 0) {
    return fail('duracion', 'No pudimos leer el video. Probá con otro.')
  }
  if (d > VIDEO_MAX_SECONDS + VIDEO_DURATION_TOLERANCE) {
    return fail(
      'largo',
      `El video dura ${Math.round(d)} s: el máximo es ${VIDEO_MAX_SECONDS} s. Recortalo y volvé a elegirlo.`,
    )
  }
  return { ok: true, seconds: videoSeconds(d) }
}

/** "0:24", "0:05": duración corta para las tarjetas. */
export function formatSeconds(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
