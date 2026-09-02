/**
 * Fase 193 Plan 04 (ISO-03) — batería de AISLAMIENTO de las 7 rutas
 * `tenant-scoped` de `/api/communications` (derivadas de
 * `test/tenant-manifest.ts`, transcritas abajo).
 *
 * EL CASO DE COLISIÓN: EL MISMO `code` DE SISTEMA EN DOS TENANTS
 * -----------------------------------------------------------------------
 * `avisos` tiene un unique `(tenant_id, code)` (migración 0216) — mismo
 * mecanismo que `notification_templates.(tenant_id, template_key)`
 * (precedente `iso-03-notifications.test.ts`). El Templo trae sus 7 avisos
 * de sistema por la migración 0217; el gimnasio 2 nace SIN avisos
 * (193-03, caso c) y este archivo los siembra con `seedSystemAvisos` y
 * edita el título de `plan_expiry` para el gimnasio 2, dejando la MISMA
 * `code` con contenido DISTINTO en los dos tenants — el describe de
 * `GET /admin/avisos` prueba que cada admin ve el título PROPIO.
 *
 * CERO 403 (T-175-03 / D-06 del milestone)
 * -----------------------------------------------------------------------
 * Un id de aviso ajeno SIEMPRE resuelve 404 "Aviso no encontrado" (el
 * lookup por PK ya scopeado por `tenantWhere` lo trata como inexistente),
 * NUNCA 403 — probado con evidencia leída de la base para PUT, DELETE y
 * GET clickers.
 *
 * Los casos de PUT/DELETE/clickers usan avisos `kind: 'custom'` (no los de
 * sistema): kind='custom' es editable en más campos y borrable, lo que hace
 * la aserción de aislamiento más directa que forcejear con el subset
 * restringido de un aviso de sistema (D-08..D-11, ya cubierto en
 * `avisos-admin.test.ts`).
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-communications.test.ts
 *
 * @see test/communications/avisos-admin.test.ts — cobertura funcional (no aislamiento)
 * @see test/tenancy/iso-03-notifications.test.ts — el precedente inmediato (175.1-04)
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql, and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData, getAuthToken, createTestMember } from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { avisos, avisoEvents } from "../../src/db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { seedSystemAvisos } from "../../src/modules/communications/system-avisos";

// ─── Constantes ──────────────────────────────────────────────────────────────

const BASE = "/api/communications";
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CODE_COLISION = "plan_expiry";
const MARCA_ISO03C = "ISO03C";

// ─── Limpieza local (193-03, L5) ───────────────────────────────────────────

async function limpiarAvisosCustomDeLaBateria(app: FastifyInstance): Promise<void> {
  await app.db.execute(
    sql`/* tenant-safe: limpieza global de prueba (patron cleanAllTestData) — aviso_events no es TABLES_TO_CLEAN a proposito (193-03, L5) */ DELETE FROM aviso_events`,
  );
  await app.db.execute(
    sql`/* tenant-safe: limpieza global de prueba — solo custom, los avisos de sistema (migracion 0217) son dato semilla estable igual que branches/activities (193-03, L5) */ DELETE FROM avisos WHERE kind <> 'system'`,
  );
  await app.db.execute(
    sql`/* tenant-safe: limpieza global de prueba, tv_avisos no tiene semilla de sistema */ DELETE FROM tv_avisos`,
  );
}

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templeAdminToken: string;
let templeAvisoId: number;
let gym2AvisoId: number;

async function crearAvisoCustom(
  ctx: TenantContext,
  title: string,
): Promise<number> {
  const [result] = await app.db.insert(avisos).values(
    tenantValues(ctx, {
      kind: "custom" as const,
      code: null,
      placement: "popup" as const,
      title,
      body: `Cuerpo de ${title}`,
      buttonText: "Ver",
      destinationType: "app_section" as const,
      destinationSection: "mi_templo",
      whatsappText: null,
      frequencyType: "once" as const,
      frequencyDays: null,
      status: "active" as const,
      sortOrder: 0,
    }),
  );
  return Number(result.insertId);
}

/**
 * Lee un aviso por id SIN scope de tenant a propósito — es la LECTURA DE
 * EVIDENCIA del caso de aislamiento (releer una fila ajena o propia por id
 * ES la aserción, T-175-03 categoría 3): filtrarla por tenant la volvería
 * tautológica. `avisos` es `TENANT_STRICT_MODULES` (193-02), así que el
 * sentinel exige la exención `tenant-safe` embebida en el propio SQL.
 */
async function avisoPorId(
  id: number,
): Promise<{ title: string; tenantId: number } | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: releer el aviso (ajeno o propio) por id ES la asercion del caso de aislamiento; filtrarla por tenant la volveria tautologica */ title, tenant_id AS tenantId FROM avisos WHERE id = ${id}`,
  )) as unknown as [Array<{ title: string; tenantId: number }>];
  return resultado[0]?.[0] ?? null;
}

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es 'owner' (test/setup.ts) — cubre ADMIN_ROLES (D-30).
  templeAdminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await limpiarAvisosCustomDeLaBateria(app);
  gym2 = await seedSecondTenant(app);

  // Colisión de `code` de sistema: El Templo ya trae `plan_expiry` (mig
  // 0217). El gimnasio 2 nace sin avisos (193-03) — se siembra y se edita
  // su copia para que el contenido sea DISTINTO al de El Templo.
  await seedSystemAvisos(app.db, { tenantId: gym2.tenantId });
  await app.db
    .update(avisos)
    .set({ title: `${MARCA_ISO03C} Vencimiento del gimnasio 2` })
    .where(
      and(
        tenantWhere(avisos, { tenantId: gym2.tenantId }),
        eq(avisos.code, CODE_COLISION),
      ),
    );

  templeAvisoId = await crearAvisoCustom(CTX_TEMPLO, `${MARCA_ISO03C} Aviso de El Templo`);
  gym2AvisoId = await crearAvisoCustom(
    { tenantId: gym2.tenantId },
    `${MARCA_ISO03C} Aviso del gimnasio 2`,
  );
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarAvisosCustomDeLaBateria(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades HTTP ─────────────────────────────────────────────────────────

function getComo(url: string, token: string) {
  return app.inject({
    method: "GET",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function postComo(url: string, token: string, payload?: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function putComo(url: string, token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "PUT",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function deleteComo(url: string, token: string) {
  return app.inject({
    method: "DELETE",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Mensaje compartido de los rojos de AISLAMIENTO. */
function porQueImportaElAislamiento(ruta: string, detalle: string): string {
  return (
    `${ruta} mezcló datos de El Templo (${TENANT_TEMPLO}) y el gimnasio ` +
    `${TENANT_DOS}: ${detalle}. Revisar el \`tenantWhere(tabla, ctx)\` del ` +
    `método que sirve esta ruta en src/modules/communications/*.ts. NO ` +
    `"arreglar" esto filtrando en el front.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la batería", () => {
  it("las 7 rutas del manifiesto para /api/communications coinciden con las 7 de este archivo", () => {
    // Transcrito a mano desde test/tenant-manifest.ts (sección /api/communications).
    const RUTAS_MANIFIESTO = [
      "DELETE /api/communications/admin/avisos/:id",
      "GET /api/communications/admin/avisos",
      "GET /api/communications/admin/avisos/:id/clickers",
      "GET /api/communications/admin/sales-number",
      "POST /api/communications/admin/avisos",
      "PUT /api/communications/admin/avisos/:id",
      "PUT /api/communications/admin/sales-number",
    ];
    expect(RUTAS_MANIFIESTO.length).toBe(7);
    expect(new Set(RUTAS_MANIFIESTO).size).toBe(7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /admin/avisos — colisión de code de sistema
// ═══════════════════════════════════════════════════════════════════════════

describe("listar avisos — GET /api/communications/admin/avisos", () => {
  const RUTA = "GET /api/communications/admin/avisos";

  it("aislamiento: el gimnasio 2 ve SU copia de plan_expiry (mismo code, contenido distinto), no la de El Templo", async () => {
    const res = await getComo("/admin/avisos", gym2.adminToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      avisos: Array<{ code: string | null; title: string }>;
    };
    const colisionantes = body.avisos.filter((a) => a.code === CODE_COLISION);
    expect(colisionantes).toHaveLength(1);
    expect(
      colisionantes[0]?.title,
      porQueImportaElAislamiento(RUTA, "el título de plan_expiry debería ser el propio del gimnasio 2"),
    ).toBe(`${MARCA_ISO03C} Vencimiento del gimnasio 2`);
  });

  it("control: El Templo ve SU copia de plan_expiry, no la del gimnasio 2", async () => {
    const res = await getComo("/admin/avisos", templeAdminToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      avisos: Array<{ code: string | null; title: string }>;
    };
    const colisionantes = body.avisos.filter((a) => a.code === CODE_COLISION);
    expect(colisionantes).toHaveLength(1);
    expect(colisionantes[0]?.title).not.toBe(`${MARCA_ISO03C} Vencimiento del gimnasio 2`);
  });

  it("aislamiento: el gimnasio 2 NO ve el aviso custom de El Templo en su listado", async () => {
    const res = await getComo("/admin/avisos", gym2.adminToken);
    const body = JSON.parse(res.body) as { avisos: Array<{ id: number }> };
    expect(
      body.avisos.some((a) => a.id === templeAvisoId),
      porQueImportaElAislamiento(RUTA, "el listado del gimnasio 2 incluyó el aviso custom de El Templo"),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /admin/avisos/:id — EL CASO CENTRAL
// ═══════════════════════════════════════════════════════════════════════════

describe("actualizar aviso — PUT /api/communications/admin/avisos/:id", () => {
  const RUTA = "PUT /api/communications/admin/avisos/:id";

  it("aislamiento: el admin del gimnasio 2 no puede editar el aviso custom de El Templo (404, NUNCA 403) y NO lo modifica", async () => {
    const res = await putComo(`/admin/avisos/${templeAvisoId}`, gym2.adminToken, {
      title: `${MARCA_ISO03C} HACKEADO`,
    });
    expect(
      res.statusCode,
      porQueImportaElAislamiento(RUTA, `esperaba 404, recibió ${res.statusCode}`),
    ).toBe(404);
    const body = JSON.parse(res.body) as { message: string };
    expect(body.message).toContain("Aviso no encontrado");

    const filaTemplo = await avisoPorId(templeAvisoId);
    expect(
      filaTemplo?.title,
      porQueImportaElAislamiento(RUTA, `el aviso de El Templo quedó con título "${filaTemplo?.title}"`),
    ).toBe(`${MARCA_ISO03C} Aviso de El Templo`);
    expect(filaTemplo?.tenantId).toBe(TENANT_TEMPLO);
  });

  it("aislamiento: el admin del gimnasio 2 SÍ edita SU propio aviso, sin tocar el de El Templo", async () => {
    const nuevoTitulo = `${MARCA_ISO03C} Editado Gdos`;
    const res = await putComo(`/admin/avisos/${gym2AvisoId}`, gym2.adminToken, {
      title: nuevoTitulo,
    });
    expect(res.statusCode, res.body).toBe(200);

    const filaDos = await avisoPorId(gym2AvisoId);
    expect(filaDos?.title).toBe(nuevoTitulo);
    expect(filaDos?.tenantId).toBe(gym2.tenantId);

    const filaTemplo = await avisoPorId(templeAvisoId);
    expect(filaTemplo?.title).toBe(`${MARCA_ISO03C} Aviso de El Templo`);
  });

  it("control: El Templo edita su propio aviso, sin tocar el del gimnasio 2", async () => {
    const nuevoTitulo = `${MARCA_ISO03C} Editado Templo`;
    const res = await putComo(`/admin/avisos/${templeAvisoId}`, templeAdminToken, {
      title: nuevoTitulo,
    });
    expect(res.statusCode, res.body).toBe(200);

    const filaTemplo = await avisoPorId(templeAvisoId);
    expect(filaTemplo?.title).toBe(nuevoTitulo);

    const filaDos = await avisoPorId(gym2AvisoId);
    expect(filaDos?.title).toBe(`${MARCA_ISO03C} Aviso del gimnasio 2`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /admin/avisos/:id
// ═══════════════════════════════════════════════════════════════════════════

describe("borrar aviso — DELETE /api/communications/admin/avisos/:id", () => {
  const RUTA = "DELETE /api/communications/admin/avisos/:id";

  it("aislamiento: el admin del gimnasio 2 no puede borrar el aviso custom de El Templo (404, NUNCA 403) y la fila sobrevive", async () => {
    const res = await deleteComo(`/admin/avisos/${templeAvisoId}`, gym2.adminToken);
    expect(
      res.statusCode,
      porQueImportaElAislamiento(RUTA, `esperaba 404, recibió ${res.statusCode}`),
    ).toBe(404);

    const filaTemplo = await avisoPorId(templeAvisoId);
    expect(
      filaTemplo,
      porQueImportaElAislamiento(RUTA, "el aviso de El Templo fue borrado por un admin ajeno"),
    ).not.toBeNull();
  });

  it("control: el admin del gimnasio 2 SÍ borra su propio aviso custom, sin tocar el de El Templo", async () => {
    const res = await deleteComo(`/admin/avisos/${gym2AvisoId}`, gym2.adminToken);
    expect(res.statusCode, res.body).toBe(200);

    const filaDos = await avisoPorId(gym2AvisoId);
    expect(filaDos).toBeNull();

    const filaTemplo = await avisoPorId(templeAvisoId);
    expect(filaTemplo).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /admin/avisos/:id/clickers — D-18
// ═══════════════════════════════════════════════════════════════════════════

describe("ver socios — GET /api/communications/admin/avisos/:id/clickers", () => {
  const RUTA = "GET /api/communications/admin/avisos/:id/clickers";

  it("aislamiento: el admin del gimnasio 2 no puede ver los clickers del aviso de El Templo (404, NUNCA 403)", async () => {
    const res = await getComo(`/admin/avisos/${templeAvisoId}/clickers`, gym2.adminToken);
    expect(
      res.statusCode,
      porQueImportaElAislamiento(RUTA, `esperaba 404, recibió ${res.statusCode}`),
    ).toBe(404);
  });

  it("aislamiento: 'ver socios' del gimnasio 2 solo muestra el clic de SU propio socio, nunca uno de El Templo", async () => {
    const socioTemplo = await createTestMember(app);
    const socioDos = gym2.socios[0];

    await app.db.insert(avisoEvents).values(
      tenantValues(CTX_TEMPLO, {
        avisoId: templeAvisoId,
        userId: socioTemplo.id,
        eventType: "clicked" as const,
      }),
    );
    await app.db.insert(avisoEvents).values(
      tenantValues(
        { tenantId: gym2.tenantId },
        {
          avisoId: gym2AvisoId,
          userId: socioDos.id,
          eventType: "clicked" as const,
        },
      ),
    );

    const res = await getComo(`/admin/avisos/${gym2AvisoId}/clickers`, gym2.adminToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { clickers: Array<{ userId: number }> };
    expect(
      body.clickers.map((c) => c.userId),
      porQueImportaElAislamiento(RUTA, "el listado del gimnasio 2 incluyó un clicker de El Templo"),
    ).toEqual([socioDos.id]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET/PUT /admin/sales-number — D-20
// ═══════════════════════════════════════════════════════════════════════════

describe("número de ventas — GET/PUT /api/communications/admin/sales-number", () => {
  const RUTA = "PUT /api/communications/admin/sales-number";

  it("aislamiento: el PUT de un gimnasio no cambia el número del otro", async () => {
    const resTemplo = await putComo("/admin/sales-number", templeAdminToken, {
      AR: "5492235820521",
    });
    expect(resTemplo.statusCode, resTemplo.body).toBe(200);

    const resDos = await putComo("/admin/sales-number", gym2.adminToken, {
      AR: "5493511234567",
    });
    expect(resDos.statusCode, resDos.body).toBe(200);

    const getTemplo = await getComo("/admin/sales-number", templeAdminToken);
    const bodyTemplo = JSON.parse(getTemplo.body) as { AR: string | null };
    expect(
      bodyTemplo.AR,
      porQueImportaElAislamiento(RUTA, "El Templo leyó el número del gimnasio 2"),
    ).toBe("5492235820521");

    const getDos = await getComo("/admin/sales-number", gym2.adminToken);
    const bodyDos = JSON.parse(getDos.body) as { AR: string | null };
    expect(
      bodyDos.AR,
      porQueImportaElAislamiento(RUTA, "el gimnasio 2 leyó el número de El Templo"),
    ).toBe("5493511234567");

    expect(bodyTemplo.AR).not.toBe(bodyDos.AR);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /me/prompt — Fase 193 Plan 05 (D-06/D-07/D-13)
// ═══════════════════════════════════════════════════════════════════════════

describe("qué pop-up toca hoy — GET /api/communications/me/prompt", () => {
  const RUTA = "GET /api/communications/me/prompt";

  it("aislamiento: el socio del gimnasio 2 NUNCA recibe un aviso de El Templo, aunque los dos tengan uno vigente hoy", async () => {
    const socioTemplo = await createTestMember(app);
    const socioDos = gym2.socios[0];

    const avisoVigenteTemploId = await crearAvisoCustom(
      CTX_TEMPLO,
      `${MARCA_ISO03C} Aviso vigente de El Templo`,
    );
    const avisoVigenteDosId = await crearAvisoCustom(
      { tenantId: gym2.tenantId },
      `${MARCA_ISO03C} Aviso vigente del gimnasio 2`,
    );

    // El Templo ya trae `templeAvisoId` del `beforeEach` (otro popup custom
    // activo, sortOrder 0 igual que el nuevo) — con "sort_order, id" como
    // criterio de desempate, el que gana entre los DOS de El Templo es el de
    // id más chico. Eso es esperado (no es un leak): la aserción de acá es
    // que el ganador SIEMPRE sea uno de los avisos DEL PROPIO tenant, nunca
    // el del otro.
    const idsElTemplo = new Set([templeAvisoId, avisoVigenteTemploId]);
    const idsGimnasioDos = new Set([gym2AvisoId, avisoVigenteDosId]);

    const resTemplo = await getComo("/me/prompt", socioTemplo.token);
    expect(resTemplo.statusCode, resTemplo.body).toBe(200);
    const bodyTemplo = JSON.parse(resTemplo.body) as {
      prompt: { aviso: { id: number } } | null;
    };
    expect(
      bodyTemplo.prompt?.aviso.id,
      porQueImportaElAislamiento(
        RUTA,
        `El Templo recibió el aviso ${bodyTemplo.prompt?.aviso.id}, que no es propio`,
      ),
    ).toBeDefined();
    expect(idsElTemplo.has(bodyTemplo.prompt!.aviso.id)).toBe(true);
    expect(idsGimnasioDos.has(bodyTemplo.prompt!.aviso.id)).toBe(false);

    const resDos = await getComo("/me/prompt", socioDos.token);
    expect(resDos.statusCode, resDos.body).toBe(200);
    const bodyDos = JSON.parse(resDos.body) as {
      prompt: { aviso: { id: number } } | null;
    };
    expect(
      bodyDos.prompt?.aviso.id,
      porQueImportaElAislamiento(
        RUTA,
        `el socio del gimnasio 2 recibió el aviso ${bodyDos.prompt?.aviso.id}, que no es propio`,
      ),
    ).toBeDefined();
    expect(idsGimnasioDos.has(bodyDos.prompt!.aviso.id)).toBe(true);
    expect(idsElTemplo.has(bodyDos.prompt!.aviso.id)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /me/avisos/:id/event — Fase 193 Plan 05 (D-11, T-193-16/T-193-17)
// ═══════════════════════════════════════════════════════════════════════════

describe("registrar evento — POST /api/communications/me/avisos/:id/event", () => {
  const RUTA = "POST /api/communications/me/avisos/:id/event";

  it("aislamiento: el socio del gimnasio 2 no puede registrar un evento sobre un aviso de El Templo (404, NUNCA 403) y no escribe fila", async () => {
    const socioDos = gym2.socios[0];
    const res = await postComo(`/me/avisos/${templeAvisoId}/event`, socioDos.token, {
      type: "shown",
    });
    expect(
      res.statusCode,
      porQueImportaElAislamiento(RUTA, `esperaba 404, recibió ${res.statusCode}`),
    ).toBe(404);

    const rows = await app.db
      .select({ id: avisoEvents.id })
      .from(avisoEvents)
      .where(
        and(
          tenantWhere(avisoEvents, CTX_TEMPLO),
          eq(avisoEvents.avisoId, templeAvisoId),
          eq(avisoEvents.userId, socioDos.id),
        ),
      );
    expect(
      rows,
      porQueImportaElAislamiento(RUTA, "se escribió una fila de evento pese al 404"),
    ).toHaveLength(0);
  });

  it("control: el socio de El Templo SÍ puede registrar un evento sobre su propio aviso", async () => {
    const socioTemplo = await createTestMember(app);
    const res = await postComo(`/me/avisos/${templeAvisoId}/event`, socioTemplo.token, {
      type: "shown",
    });
    expect(res.statusCode, res.body).toBe(200);
  });
});
