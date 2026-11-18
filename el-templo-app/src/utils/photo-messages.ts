import type { PhotoRejectionReason } from 'src/types/community'

/**
 * Fase 214 (plan 20): textos de la foto de perfil (UI-SPEC, borradores tal cual, D-69).
 * Ningún texto habla del tamaño de la foto: la app reduce antes de subir (D-33).
 */

const MSG_UNAVAILABLE = 'Las fotos no están disponibles por ahora. Probá más tarde.'
const MSG_UPLOAD = 'No pudimos subir la foto. Revisá tu conexión y probá de nuevo.'
const MSG_INVALID = 'No pudimos procesar la foto. Probá con otra.'
const MSG_DECODE = 'Ese formato no se puede abrir. Elegí una foto JPG o PNG.'
const MSG_PERMISSION =
  'No tenemos permiso para usar la cámara. Podés habilitarlo en los ajustes del teléfono o elegir una foto de la galería.'

function codeOf(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code
    return typeof code === 'string' ? code : null
  }
  return null
}

function httpStatusOf(err: unknown): number | null {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: unknown }).response
    if (typeof response === 'object' && response !== null && 'status' in response) {
      const status = (response as { status?: unknown }).status
      return typeof status === 'number' ? status : null
    }
  }
  return null
}

/**
 * Texto para la persona según qué falló. Códigos propios: "DECODE" (formato no abre),
 * "PERMISSION" (cámara negada) y "PUT" (el PUT a la URL firmada falló). Lo demás se decide por el
 * status HTTP de axios; red caída y errores desconocidos caen en el texto de subida.
 */
export function photoErrorMessage(err: unknown): string {
  const code = codeOf(err)
  if (code === 'DECODE') return MSG_DECODE
  if (code === 'PERMISSION') return MSG_PERMISSION
  const status = httpStatusOf(err)
  if (status === 503) return MSG_UNAVAILABLE
  if (status === 400) return MSG_INVALID
  return MSG_UPLOAD
}

const REJECTION_LABELS: Record<Exclude<PhotoRejectionReason, 'otro'>, string> = {
  sin_cara: 'No se te ve la cara',
  no_es_propia: 'No es una foto tuya',
  contenido: 'Contenido que no va',
}

/** Etiqueta del motivo de rechazo (la que ve el staff); `otro` y ausente no llevan. */
export function rejectionReasonLabel(code: PhotoRejectionReason | null): string | null {
  if (code === null || code === 'otro') return null
  return REJECTION_LABELS[code]
}
