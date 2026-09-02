// Fase 193 Plan 03 (COM-02/COM-03, D-08/D-09/D-10/D-15a/D-22, T-193-08/09) —
// integración contra MySQL real. Casos (a)-(e) del plan:
//   (a) tras la migración 0217, El Templo tiene los 7 codes de sistema
//   (b) seedSystemAvisos es idempotente en el mismo tenant (no duplica)
//   (c) seedSystemAvisos sobre el segundo gimnasio crea SUS 7 filas y no
//       toca las de El Templo (aislamiento, T-193-09)
//   (d) una fila de sistema editada a mano NO se pisa en una re-siembra
//   (e) las 4 tarjetas tienen sort_order 1..4 sin repetidos
//
// CONVENCIÓN DE LIMPIEZA (deviation de este plan, ver 193-03-SUMMARY.md):
// `avisos`/`aviso_events`/`tv_avisos` NO están en `TABLES_TO_CLEAN`
// (test/helpers.ts) a propósito — el catálogo de sistema de El Templo lo
// siembra la migración 0217 UNA vez durante el provisioning del DB de test
// (`test/setup.ts` aplica todas las `.sql` de `src/db/migrations/`), y ese
// estado persiste entre archivos del mismo worker (`isolate: false`),
// igual que `branches`/`activities` — NO como `notification_templates`
// (que sí está en `TABLES_TO_CLEAN` y cada test que lo necesita llama
// `seedTemplates(ctx)` a mano). Este archivo es el PRIMER consumidor de
// `avisos` en la suite: los tests de acá corren en orden de declaración
// (sin `.concurrent`) y ninguno deja el catálogo de El Templo en un estado
// que rompa al siguiente. Un plan futuro que cree avisos CUSTOM para el
// tenant 1 en un test debe limpiar los suyos (mismo criterio que
// `branches`: dato semilla compartido, no un scratch pad por test). El
// aislamiento del gimnasio 2 SÍ está cubierto: `limpiarSegundoGimnasio`
// (test/fixtures/second-tenant.ts) borra `aviso_events`/`avisos`/`tv_avisos`
// scopeados a `TENANT_DOS` antes del `DELETE FROM tenants` final.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import { avisos } from "../../src/db/schema";
import { tenantWhere, type TenantContext } from "../../src/modules/shared/tenant";
import {
  seedSystemAvisos,
  SYSTEM_AVISO_CODES,
} from "../../src/modules/communications/system-avisos";
import {
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";

describe("communications/system-avisos (D-08/D-09/D-10/D-15a/D-22)", () => {
  let app: FastifyInstance;
  const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };

  async function systemAvisosOf(ctx: TenantContext) {
    return app.db
      .select({
        id: avisos.id,
        code: avisos.code,
        placement: avisos.placement,
        title: avisos.title,
        sortOrder: avisos.sortOrder,
        tenantId: avisos.tenantId,
      })
      .from(avisos)
      .where(and(tenantWhere(avisos, ctx), eq(avisos.kind, "system")));
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    // limpiarSegundoGimnasio PRIMERO: borra (entre otras) aviso_events/
    // avisos/tv_avisos scopeados a TENANT_DOS antes del DELETE FROM tenants
    // (ver docblock del archivo). cleanAllTestData no toca avisos (arriba),
    // así que el orden respecto de ella no importa acá, a diferencia del
    // patrón habitual "cleanAllTestData primero" de otros archivos.
    await limpiarSegundoGimnasio(app);
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    // NO limpia avisos/aviso_events/tv_avisos (ver docblock del archivo) —
    // limpia las ~90 tablas restantes (users, subscriptions, etc.), que
    // ningún test de este archivo necesita pero es el patrón estándar de
    // higiene entre tests.
    await cleanAllTestData(app);
  });

  it("(a) tras la migración, El Templo tiene los 7 codes de sistema (3 popup + 4 tarjeta)", async () => {
    const rows = await systemAvisosOf(CTX_TEMPLO);

    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => r.code)).size).toBe(7);
    for (const code of SYSTEM_AVISO_CODES) {
      expect(rows.some((r) => r.code === code)).toBe(true);
    }
    expect(rows.filter((r) => r.placement === "popup")).toHaveLength(3);
    expect(rows.filter((r) => r.placement === "tarjeta")).toHaveLength(4);
    // Evidencia leída de la base: todas las filas son del tenant correcto.
    for (const row of rows) {
      expect(row.tenantId).toBe(TENANT_TEMPLO);
    }
  });

  it("(b) seedSystemAvisos es idempotente sobre el mismo tenant: no duplica y devuelve inserted:0 la segunda vez", async () => {
    // El Templo ya tiene las 7 filas (sembradas por la migración 0217, caso a).
    const first = await seedSystemAvisos(app.db, CTX_TEMPLO);
    expect(first).toEqual({ inserted: 0 });

    const second = await seedSystemAvisos(app.db, CTX_TEMPLO);
    expect(second).toEqual({ inserted: 0 });

    const rows = await systemAvisosOf(CTX_TEMPLO);
    expect(rows).toHaveLength(7); // no 14
  });

  it("(c) seedSystemAvisos sobre el segundo gimnasio crea SUS 7 filas y no toca las de El Templo", async () => {
    const gym2 = await seedSecondTenant(app);
    const ctxDos: TenantContext = { tenantId: gym2.tenantId };

    // El gimnasio 2 nace SIN avisos: la migración 0217 corrió durante el
    // provisioning del DB de test, antes de que este tenant existiera.
    const before = await systemAvisosOf(ctxDos);
    expect(before).toHaveLength(0);

    const result = await seedSystemAvisos(app.db, ctxDos);
    expect(result).toEqual({ inserted: 7 });

    const rowsDos = await systemAvisosOf(ctxDos);
    expect(rowsDos).toHaveLength(7);
    for (const row of rowsDos) {
      expect(row.tenantId).toBe(gym2.tenantId);
    }

    // Evidencia leída de la base con el ctx de El Templo: sigue en 7, ids
    // distintos, sin cruce (T-193-09).
    const rowsTemplo = await systemAvisosOf(CTX_TEMPLO);
    expect(rowsTemplo).toHaveLength(7);
    const idsTemplo = new Set(rowsTemplo.map((r) => r.id));
    const idsDos = new Set(rowsDos.map((r) => r.id));
    for (const id of idsDos) {
      expect(idsTemplo.has(id)).toBe(false);
    }

    // Limpieza local del gimnasio 2 (no es opcional: sobrevive entre
    // archivos del mismo worker, T-171-14, y avisos/tv_avisos/aviso_events
    // scopeados a TENANT_DOS deben salir ANTES de que otro test o archivo
    // vuelva a sembrarlo).
    await limpiarSegundoGimnasio(app);
  });

  it("(d) una fila de sistema editada a mano NO se pisa al re-correr seedSystemAvisos", async () => {
    const EDITED_TITLE = "Título editado a mano por el admin";

    await app.db
      .update(avisos)
      .set({ title: EDITED_TITLE })
      .where(
        and(
          tenantWhere(avisos, CTX_TEMPLO),
          eq(avisos.code, "rating_prompt"),
        ),
      );

    const result = await seedSystemAvisos(app.db, CTX_TEMPLO);
    expect(result).toEqual({ inserted: 0 });

    const rows = await systemAvisosOf(CTX_TEMPLO);
    expect(rows).toHaveLength(7); // no se duplicó la fila
    const edited = rows.find((r) => r.code === "rating_prompt");
    expect(edited?.title).toBe(EDITED_TITLE); // no se pisó

    // Deja el título como estaba para no afectar otros tests del archivo
    // (declaración en orden, sin `.concurrent`, pero prolijo de todos modos).
    await app.db
      .update(avisos)
      .set({ title: "¿Cómo estuvo tu clase?" })
      .where(
        and(
          tenantWhere(avisos, CTX_TEMPLO),
          eq(avisos.code, "rating_prompt"),
        ),
      );
  });

  it("(e) los 4 avisos de placement='tarjeta' tienen sort_order 1..4 sin repetidos", async () => {
    const rows = await systemAvisosOf(CTX_TEMPLO);
    const cardSortOrders = rows
      .filter((r) => r.placement === "tarjeta")
      .map((r) => r.sortOrder)
      .sort((a, b) => a - b);

    expect(cardSortOrders).toEqual([1, 2, 3, 4]);
    expect(new Set(cardSortOrders).size).toBe(4);
  });
});
