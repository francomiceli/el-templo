import type { PhotoStatus } from 'src/types/community'
import { createLogger } from 'src/utils/logger'

/**
 * Cuándo se muestran las normas de la foto (revisión 2026-11-18, #6). Se muestran la primera vez y
 * después de un rechazo; no vuelven a aparecer en cada "Elegir otra" si la persona ya las aceptó y
 * no le rechazaron ninguna foto después.
 *
 * La memoria vive en el teléfono (`localStorage`, por persona): sin registro (otro teléfono, datos
 * borrados, almacenamiento no disponible) se muestran, que es la opción más conservadora. Las
 * funciones de decisión son puras; el acceso al almacenamiento va aparte y nunca lanza.
 */

/**
 * Lo que se recuerda: que las normas ya se aceptaron y si fue estando la foto rechazada.
 * `acceptedWhileRejected` evita volver a pedirlas en cada "Elegir otra" mientras la foto sigue
 * rechazada; se apaga al subir una foto nueva o al quitarla.
 */
export interface PhotoRulesRecord {
  acceptedWhileRejected: boolean
}

/** ¿Hay que mostrar las normas antes de elegir una foto? */
export function shouldShowPhotoRules(
  record: PhotoRulesRecord | null,
  status: PhotoStatus | null | undefined,
): boolean {
  // Primera vez (o sin memoria): se muestran.
  if (record === null) return true
  // Ya las aceptó y su última foto no fue rechazada: no vuelven.
  if (status !== 'rechazada') return false
  // Rechazada: se muestran, salvo que ya las haya aceptado después de ese rechazo.
  return !record.acceptedWhileRejected
}

/** El registro que queda al aceptar las normas con la foto en ese estado. */
export function recordAcceptance(status: PhotoStatus | null | undefined): PhotoRulesRecord {
  return { acceptedWhileRejected: status === 'rechazada' }
}

/**
 * El registro tras subir una foto nueva o quitar la propia: un rechazo futuro vuelve a pedir las
 * normas. Sin registro previo no inventa uno (las normas todavía no se aceptaron).
 */
export function recordAfterPhotoChange(record: PhotoRulesRecord | null): PhotoRulesRecord | null {
  return record === null ? null : { acceptedWhileRejected: false }
}

const KEY_PREFIX = 'et.photoRulesAccepted.'

export function photoRulesKey(userId: number): string {
  return `${KEY_PREFIX}${userId}`
}

/** Lee el registro guardado; cualquier valor ilegible cuenta como "sin registro". */
export function parsePhotoRulesRecord(raw: string | null): PhotoRulesRecord | null {
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'object' && value !== null && 'acceptedWhileRejected' in value) {
      const flag = (value as { acceptedWhileRejected: unknown }).acceptedWhileRejected
      if (typeof flag === 'boolean') return { acceptedWhileRejected: flag }
    }
  } catch {
    // Valor corrupto: se trata como sin registro.
  }
  return null
}

// ---- Runtime: localStorage best-effort (modo privado o cuota llena nunca bloquean la subida) ----

const log = createLogger('photo-rules-memory')

export function readPhotoRules(userId: number | null | undefined): PhotoRulesRecord | null {
  if (userId == null) return null
  try {
    if (typeof localStorage === 'undefined') return null
    return parsePhotoRulesRecord(localStorage.getItem(photoRulesKey(userId)))
  } catch (err: unknown) {
    log.warn('No se pudo leer la memoria de las normas de la foto', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export function writePhotoRules(
  userId: number | null | undefined,
  record: PhotoRulesRecord | null,
): void {
  if (userId == null || record === null) return
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(photoRulesKey(userId), JSON.stringify(record))
  } catch (err: unknown) {
    log.warn('No se pudo guardar la memoria de las normas de la foto', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
