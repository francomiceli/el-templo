/**
 * Fixture del motor del lint (fase 170, CON-06): las formas de acceso.
 *
 * NO ES CÓDIGO DE PRODUCCIÓN y nadie lo importa: es entrada del analizador.
 * Cada función de acá es un caso con veredicto esperado, afirmado por nombre en
 * `test/tenancy/con-06-lint.test.ts`. Si tocás una función, actualizá su
 * aserción — no al revés.
 *
 * Cinco accesos esperados en este archivo, dos de ellos violación.
 */

import { sql } from "drizzle-orm";
import * as schema from "../../../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
} from "../../../../src/modules/shared/tenant";
import type { FakeCtx, FakeDb } from "./tipos";

/** VIOLACIÓN — `bookings` es gym-owned y el statement no nombra el gimnasio. */
export function selectSinFiltro(db: FakeDb): FakeDb {
  return db.select().from(schema.bookings);
}

/** CUMPLE — `tenantWhere` es la forma canónica premiada (fase 169). */
export function selectConTenantWhere(db: FakeDb, ctx: FakeCtx): FakeDb {
  return db
    .select()
    .from(schema.bookings)
    .where(tenantWhere(schema.bookings, ctx));
}

/** CUMPLE — `tenantValues` estampa el gimnasio del scope en el INSERT. */
export function insertConTenantValues(db: FakeDb, ctx: FakeCtx): FakeDb {
  return db.insert(schema.users).values(tenantValues(ctx, { firstName: "x" }));
}

/** VIOLACIÓN — template `sql` crudo sobre tabla gym-owned, sin filtro. */
export function sqlCrudoSinTenant(db: FakeDb): FakeDb {
  return db.execute(sql`select count(*) from bookings`);
}

/** CUMPLE — el mismo template, con el filtro escrito a mano. */
export function sqlCrudoConTenant(db: FakeDb, ctx: FakeCtx): FakeDb {
  return db.execute(
    sql`select count(*) from bookings where tenant_id = ${ctx.tenantId}`,
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
