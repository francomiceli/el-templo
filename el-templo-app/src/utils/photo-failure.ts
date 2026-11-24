/**
 * Motivo legible de una falla de la foto de perfil que pasa DENTRO del teléfono (plugin de cámara,
 * galería, recorte por canvas), para mandarlo a Sentry.
 *
 * Por qué existe (2026-11-24): un alumno con iPhone 16 Pro / iOS 26.6 veía "No pudimos procesar la
 * foto. Probá con otra." y no había rastro en ningún lado: el servidor nunca recibió la foto y la app
 * solo dejaba un `warn` en la consola del teléfono, con el nombre del error ("Error") y no su texto.
 * El plugin de cámara de iOS rechaza con textos como "Error loading image" o "Unable to convert
 * image to jpeg", y ese texto es justamente lo que dice qué pasó.
 *
 * El texto de un error del plugin no lleva datos de la persona; igual se recorta, por si algún día
 * trae una ruta de archivo larga.
 */

export const PHOTO_FAILURE_CAUSE_MAX = 120

export interface PhotoFailureCause {
  /** Texto del error (recortado) o `unknown`. */
  cause: string
  /** Código del plugin (por ejemplo `OS-PLUG-CAMR-0005`), si vino. */
  code: string | null
}

function clip(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > PHOTO_FAILURE_CAUSE_MAX
    ? `${trimmed.slice(0, PHOTO_FAILURE_CAUSE_MAX)}…`
    : trimmed
}

export function photoFailureCause(err: unknown): PhotoFailureCause {
  let cause = 'unknown'
  if (err instanceof Error) {
    cause = err.message.trim() ? clip(err.message) : err.name
  } else if (typeof err === 'string' && err.trim()) {
    cause = clip(err)
  }
  let code: string | null = null
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const raw = (err as { code?: unknown }).code
    if (typeof raw === 'string' && raw.trim()) code = raw.trim()
  }
  return { cause, code }
}
