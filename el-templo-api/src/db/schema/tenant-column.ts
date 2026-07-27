// Módulo: tenant-column — la definición ÚNICA de la columna `tenant_id` (v6.0, COL-01)
//
// Este archivo es la única fuente de verdad de cómo se declara la columna de
// tenancy en las 87 tablas gym-owned (las 2 anclas de la fase 166 — `users` y
// `branches` — más las 85 de la tanda C). Sin este helper serían 85
// definiciones copiadas a mano, o sea 85 oportunidades de escribir mal el
// DEFAULT o la FK; con él, un error se corrige en un solo lugar. La lista
// canónica de qué tabla la lleva vive en `src/db/tenant-tables.ts`.
//
// - El valor SALE SIEMPRE DEL SERVIDOR (`scope.tenantId` / `TenantContext`,
//   resuelto por attachScope leyendo `users.tenant_id`). JAMÁS de un payload,
//   de una query string ni del JWT — el tenant no viaja por el borde
//   (D-02/D-03). Esta columna no se expone en ningún schema de request.
//
// - Lleva DEFAULT 1 a propósito, no por comodidad: durante el rolling deploy
//   convive código viejo que todavía no manda `tenant_id`, y `test/setup.ts`
//   inserta filas con `INSERT IGNORE` sin la columna (PATTERNS §0.3) — sin
//   DEFAULT esas filas no se insertarían y la suite se cae en cascada. Además
//   declarar el DEFAULT en el builder de Drizzle es lo que deja `tenantId`
//   OPCIONAL en el tipo de insert: sin eso, decenas de `db.insert(...)`
//   existentes dejarían de compilar. El DEFAULT se re-evalúa cuando exista un
//   tenant 2, fuera de v6.0.
//
// - El orden en los archivos de schema es de LECTURA y no refleja el orden
//   FÍSICO de la tabla: los ALTER de la tanda C (migraciones 0192-0195)
//   agregan la columna al final de cada tabla.
//
// - La fase 167 NO declara índice explícito sobre `tenant_id`: InnoDB crea
//   automáticamente el índice de la FK (`fk_<tabla>_tenant`), que alcanza para
//   el filtro por tenant. La normalización de índices y de las uniques
//   compuestas `(tenant_id, ...)` es trabajo de la fase 168 (CON-02).
import { int } from "drizzle-orm/mysql-core";
import { tenants } from "./tenants";

/**
 * Columna `tenant_id` de una tabla gym-owned. Devuelve un builder NUEVO en cada
 * llamada (los builders de Drizzle son mutables — compartir uno entre tablas
 * las acoplaría).
 *
 * Uso, dentro del objeto de columnas de un `mysqlTable`:
 *
 * ```ts
 * export const foo = mysqlTable("foo", {
 *   id: int("id").primaryKey().autoincrement(),
 *   // Fase 167 (COL-01): columna de tenancy.
 *   tenantId: tenantIdColumn(),
 *   ...
 * });
 * ```
 *
 * Produce exactamente la misma columna que las anclas de la fase 166 (`users`,
 * `branches`) declaran a mano: entero NOT NULL con DEFAULT 1 y FK a
 * `tenants.id` — ver el cuerpo de la función más abajo, que es la única
 * definición literal en todo el repo.
 */
export function tenantIdColumn() {
  return int("tenant_id")
    .notNull()
    .default(1)
    .references(() => tenants.id);
}
