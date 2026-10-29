/**
 * Filas afectadas de un UPDATE/DELETE de drizzle-mysql2 sin `any`. El driver devuelve un
 * ResultSetHeader con `affectedRows`; drizzle lo expone como primer elemento de una tupla.
 * Defensivo: cualquier forma desconocida da 0 (nunca lanza).
 *
 * Unifica las copias privadas que tenían tree-editor y wellhub (2026-10-29, NODE-6K).
 */
export function readAffectedRows(result: unknown): number {
  if (Array.isArray(result)) {
    const header: unknown = result[0];
    if (
      typeof header === "object" &&
      header !== null &&
      "affectedRows" in header
    ) {
      const n = Number((header as { affectedRows: unknown }).affectedRows);
      return Number.isFinite(n) ? n : 0;
    }
  }
  if (
    typeof result === "object" &&
    result !== null &&
    "affectedRows" in result
  ) {
    const n = Number((result as { affectedRows: unknown }).affectedRows);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
