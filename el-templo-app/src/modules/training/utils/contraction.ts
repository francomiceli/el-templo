/**
 * Insignia de contracción (CON / EXC / ISO) del player, como en la TV de la sede: va ANTES del
 * nombre, con ancho fijo (todos los nombres arrancan en la misma x) y un color distinto por tipo
 * (CON carbón, EXC oro, ISO arena) para distinguirlos de un vistazo. Función pura: el color vive en
 * el CSS de `CompactExerciseList` (una clase por `kind`), acá solo se decide qué clase y qué rótulo.
 */

export type ContractionKind = 'con' | 'exc' | 'iso'

export interface ContractionBadge {
  /** Rótulo tal cual se muestra ("CON", "EXC", "ISO") */
  label: string
  /** Define la clase de color: `compact-list__badge--{kind}` */
  kind: ContractionKind
}

/** Ancho fijo de la insignia (px): lo comparten las tres para que los nombres queden alineados. */
export const CONTRACTION_BADGE_WIDTH_PX = 42

const KNOWN_KINDS: Record<string, ContractionKind> = {
  CON: 'con',
  EXC: 'exc',
  ISO: 'iso',
}

/**
 * Insignia para una contracción del catálogo. Sin contracción (vacía / null / undefined) no hay
 * insignia. Un valor desconocido conserva su rótulo (en mayúsculas) y toma el color de CON, igual
 * que antes caía en el color primario: nunca se oculta un dato que el profe cargó.
 */
export function contractionBadge(contraction: string | null | undefined): ContractionBadge | null {
  const label = (contraction ?? '').trim().toUpperCase()
  if (!label) return null
  return { label, kind: KNOWN_KINDS[label] ?? 'con' }
}
