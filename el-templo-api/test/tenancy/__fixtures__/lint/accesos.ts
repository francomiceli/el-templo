/**
 * Fixture del motor del lint (fase 170, CON-06): las formas de acceso.
 *
 * NO ES CÓDIGO DE PRODUCCIÓN y nadie lo importa: es entrada del analizador.
 * Cada función de acá es un caso con veredicto esperado, afirmado por nombre en
 * `test/tenancy/con-06-lint.test.ts`. Si tocás una función, actualizá su
 * aserción — no al revés.
 *
 * Once accesos esperados en este archivo, seis de ellos violación.
 *
 * Los cuatro últimos casos son las TRES formas que el motor no veía hasta el
 * plan 09 (punto ciego CR-01/WR-01): el alias de variable local, el `alias()`
 * de Drizzle guardado en variable y la tabla joineada. Las tres dejaban el
 * build en VERDE con un acceso sin `tenant_id` escrito así.
 *
 * Tablas `completed_sessions`/`day_modes`/`activities` (no `bookings`/
 * `schedules`/`subscriptions`/`campaigns`, fases 174.1 y 175.1): esas cuatro
 * entraron a `TENANT_STRICT_MODULES` con el switch de
 * `subscriptions`+`scheduling` (174.1-10) y el switch de
 * `auth`+`campaigns`+`improvement-proposals`+`notifications`+`referrals`+
 * `wellhub` (175.1-07), y este `describe` prueba los gates D-13/D-14/WR-01/
 * CR-01 aislado de D-15 — mismo criterio que el resto de los swaps de este
 * archivo (fase 173-30 lo documentó primero para `member_profiles`/`users`):
 * si la tabla del fixture pasa a ser strict de verdad, se cambia la tabla, no
 * la aserción. `campaigns` (usada acá hasta 175.1) se repuntó a `day_modes`:
 * ambas gym-owned, ninguna con FK real entre sí — el join es sintético.
 */

import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import * as schema from "../../../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
} from "../../../../src/modules/shared/tenant";
import type { FakeCtx, FakeDb } from "./tipos";

/** VIOLACIÓN — `completed_sessions` es gym-owned y el statement no nombra el gimnasio. */
export function selectSinFiltro(db: FakeDb): FakeDb {
  return db.select().from(schema.completedSessions);
}

/** CUMPLE — `tenantWhere` es la forma canónica premiada (fase 169). */
export function selectConTenantWhere(db: FakeDb, ctx: FakeCtx): FakeDb {
  return db
    .select()
    .from(schema.completedSessions)
    .where(tenantWhere(schema.completedSessions, ctx));
}

/**
 * CUMPLE — `tenantValues` estampa el gimnasio del scope en el INSERT.
 *
 * Tabla `branches` (no `users`, fase 173-30): `users` entró a
 * `TENANT_STRICT_MODULES` con la adopción de `members`, y este fixture
 * prueba el gate de staleness (D-14) sobre un acceso puramente COMPLIANT —
 * mismo criterio que el resto de los swaps de este archivo: si la tabla del
 * fixture pasa a ser strict de verdad, se cambia la tabla, no la aserción.
 */
export function insertConTenantValues(db: FakeDb, ctx: FakeCtx): FakeDb {
  return db.insert(schema.branches).values(tenantValues(ctx, { name: "x" }));
}

/** VIOLACIÓN — template `sql` crudo sobre tabla gym-owned, sin filtro. */
export function sqlCrudoSinTenant(db: FakeDb): FakeDb {
  return db.execute(sql`select count(*) from completed_sessions`);
}

/** CUMPLE — el mismo template, con el filtro escrito a mano. */
export function sqlCrudoConTenant(db: FakeDb, ctx: FakeCtx): FakeDb {
  return db.execute(
    sql`select count(*) from completed_sessions where tenant_id = ${ctx.tenantId}`,
  );
}

/**
 * SIN ACCESO — `system_settings` está en `TENANT_EXEMPT_TABLES`: es config
 * global heredada que no recibe `tenant_id` en todo v6.0. El lint no la mira.
 */
export function tablaExentaPorQueryBuilder(db: FakeDb): FakeDb {
  return db.select().from(schema.systemSettings);
}

/** SIN ACCESO — `tenants` es tabla de plataforma, no de gimnasio. */
export function tablaExentaPorSql(db: FakeDb): FakeDb {
  return db.execute(sql`select id from tenants`);
}

/**
 * VIOLACIÓN (`attendance`, query-builder) — alias de VARIABLE LOCAL.
 *
 * La forma viva de `src/modules/campaigns/service.ts:65-69`. Hasta el plan 09
 * el identificador no estaba en `named` (no vino de un import) y el acceso era
 * INVISIBLE: ni violación, ni entrada de allowlist, ni rojo de CI.
 */
export function selectPorAliasLocal(db: FakeDb): FakeDb {
  const a = schema.attendance;
  return db.select().from(a);
}

/**
 * VIOLACIÓN (`activities`, query-builder) — `alias()` de Drizzle guardado en
 * una variable.
 *
 * El motor ya resolvía `alias(schema.x, "y")` escrito INLINE dentro del
 * `.from(...)`; guardado en un `const` —la forma de `transaction-service.ts`—
 * no resolvía nada.
 */
export function selectPorAliasDeDrizzle(db: FakeDb): FakeDb {
  const act = alias(schema.activities, "act");
  return db.select().from(act);
}

/**
 * DOS VIOLACIONES (`day_modes` por el join, `completed_sessions` por el
 * from), las dos query-builder.
 *
 * El par nuevo del ratchet es el del JOIN (WR-01): la clave es el par
 * (archivo, tabla) y no el statement, así que un join sin scope a otra tabla
 * gym-owned crecía deuda en silencio aunque el `from` ya estuviera listado.
 *
 * Tablas `day_modes`/`completed_sessions` (no `schedules`/`bookings`, fase
 * 174.1; no `campaigns`, fase 175.1): las dos entraron a
 * `TENANT_STRICT_MODULES` con el switch de scheduling y el switch de
 * campaigns respectivamente, y este fixture prueba el gate del JOIN (WR-01)
 * aislado de D-15 — mismo criterio que el resto de los swaps de este
 * archivo. El join en sí es sintético (no hay FK real entre las dos tablas):
 * lo único que le importa al motor es que las DOS son gym-owned y ninguna
 * trae `tenant_id`.
 */
export function joinSinFiltro(db: FakeDb): FakeDb {
  return db
    .select()
    .from(schema.completedSessions)
    .innerJoin(
      schema.dayModes,
      eq(schema.dayModes.id, schema.completedSessions.id),
    );
}

/**
 * CUMPLEN LOS DOS (`day_modes` y `completed_sessions`) — el mismo join, con
 * `tenantWhere` en el `.where(...)` del mismo statement.
 *
 * Es el caso que prueba que sumar los joins a `TABLE_METHODS` no inventa rojos
 * donde el sitio sí nombra al gimnasio.
 */
export function joinConTenantWhere(db: FakeDb, ctx: FakeCtx): FakeDb {
  return db
    .select()
    .from(schema.completedSessions)
    .innerJoin(
      schema.dayModes,
      eq(schema.dayModes.id, schema.completedSessions.id),
    )
    .where(tenantWhere(schema.completedSessions, ctx));
}
