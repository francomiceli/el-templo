// Módulo: shared — normalización del DNI/documento para COMPARAR (Fase 194, LO-06)
//
// El campo de DNI de la app es texto libre: "12.345.678", "12 345 678" y "12345678"
// son la misma persona. Para la regla anti-abuso de Invitaciones se compara siempre
// el documento normalizado: solo letras y dígitos, en mayúsculas (cubre NIE/pasaporte
// con letras). El SQL equivalente para columnas ya guardadas con formato es
// {@link DNI_NORMALIZE_SQL_PATTERN}.

/** Patrón (MySQL `REGEXP_REPLACE`) de lo que se descarta de un documento guardado. */
export const DNI_NORMALIZE_SQL_PATTERN = "[^0-9A-Za-z]";

/**
 * Documento normalizado (solo `[0-9A-Z]`) o `null` si no queda nada (vacío, solo
 * espacios o signos).
 */
export function normalizeDni(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const normalized = raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return normalized.length > 0 ? normalized : null;
}
