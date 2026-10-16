// Avisos/tarjetas de SISTEMA que el admin de Comunicaciones NO muestra.
//
// `card_improvement` ("Proponer una mejora") quedó sin consumidor en la app
// desde que el plan 199-20 borró `ImprovementCtaCard` (Sugerencias pasó a
// Perfil, D-11): editarla acá no tiene ningún efecto visible. Decisión de
// Franco en el UAT de la 199 (D8): "ocultarla del admin".
//
// Es solo presentación: la API, el registro en la base y el "Restaurar las
// del sistema" (que siembra solo los `code` que faltan) no cambian. Para
// volver a mostrarla, sacar el `code` de este set.
export const ADMIN_HIDDEN_SYSTEM_CODES: ReadonlySet<string> = new Set(['card_improvement']);

/** Descarta las filas de sistema ocultas del admin; el resto queda intacto y en el mismo orden. */
export function withoutHiddenSystemAvisos<T extends { code: string | null }>(
  rows: readonly T[]
): T[] {
  return rows.filter((row) => row.code === null || !ADMIN_HIDDEN_SYSTEM_CODES.has(row.code));
}
