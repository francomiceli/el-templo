/**
 * Tipos del fixture del motor del lint (fase 170, CON-06).
 *
 * NO ES CÓDIGO DE PRODUCCIÓN. Vive bajo `test/`, que está fuera del alcance del
 * lint a propósito (D-16), así que nada de lo que hay acá entra en la allowlist
 * ni en el inventario del repo real. El test le pasa este directorio como
 * `rootDir` para analizarlo de forma aislada.
 *
 * `FakeDb` imita el encadenado del query builder de Drizzle con lo mínimo para
 * que las formas de acceso sean sintácticamente reales. El motor es un pase
 * SINTÁCTICO: no resuelve tipos ni ejecuta nada, así que un doble de este
 * tamaño alcanza para ejercitarlo entero.
 */

/** Encadenado mínimo del query builder: todo devuelve lo mismo. */
export interface FakeDb {
  select(): FakeDb;
  from(table: unknown): FakeDb;
  insert(table: unknown): FakeDb;
  update(table: unknown): FakeDb;
  delete(table: unknown): FakeDb;
  values(row: unknown): FakeDb;
  set(row: unknown): FakeDb;
  where(condition: unknown): FakeDb;
  execute(query: unknown): FakeDb;
}

/** El mismo `TenantContext` de `src/modules/shared/tenant.ts`, en chiquito. */
export interface FakeCtx {
  tenantId: number;
}
