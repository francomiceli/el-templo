/**
 * Fase 193 Plan 04 (COM-01/COM-02, D-05/D-08..D-11/D-17/D-18/D-30) —
 * integración HTTP contra `createTestApp()` de las 7 rutas admin de
 * `/api/communications`. Casos del plan:
 *   (1) POST crea un aviso custom válido, aparece en GET
 *   (2) POST con destinationSection inválida -> 400, no crea fila
 *   (3) POST whatsapp_sales con link en whatsappText -> 400
 *   (4) PUT sobre el aviso de sistema `plan_expiry`: frequencyDays -> 400
 *       (D-10, regla fija en código), title -> 200
 *   (5) DELETE de un aviso de sistema -> 400 (D-11); de uno custom -> 200
 *   (6) métricas: reachedCount/dismissedCount/clickedCount cuentan socios
 *       ÚNICOS (D-17), no eventos
 *   (7) GET .../clickers devuelve nombre y teléfono de quien tocó el botón
 *       (D-18)
 *   (8) un coach autenticado recibe 403 en las 7 rutas (D-30)
 *
 * LIMPIEZA (193-03, L5): `avisos`/`aviso_events`/`tv_avisos` NO están en
 * `TABLES_TO_CLEAN` (`test/helpers.ts`) a propósito — el catálogo de sistema
 * (migración 0217) es dato semilla estable, igual que `branches`/
 * `activities`. Este archivo limpia SOLO lo que crea: `aviso_events`
 * completo y `avisos WHERE kind <> 'system'` en cada `beforeEach` (mismo
 * criterio documentado en `test/communications/system-avisos.test.ts`).
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/communications/avisos-admin.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql, and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import { avisos, avisoEvents } from "../../src/db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const BASE = "/api/communications";
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const COACH_EMAIL = "coach-193-04@test.com";
const COACH_PASSWORD = "coachpass123";

/**
 * 193-03 (L5): limpieza SELECTIVA — solo lo que este archivo crea. Borrar
 * `avisos` entero (sin `kind <> 'system'`) rompería cualquier test que
 * cuente con el catálogo de sistema (migración 0217) ya sembrado.
 */
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

async function getSystemAvisoId(app: FastifyInstance, code: string): Promise<number> {
  const [row] = await app.db
    .select({ id: avisos.id })
    .from(avisos)
    .where(and(tenantWhere(avisos, CTX_TEMPLO), eq(avisos.code, code)))
    .limit(1);
  if (!row) {
    throw new Error(
      `Aviso de sistema '${code}' no encontrado para El Templo — ¿corrió la migración 0217? (test/setup.ts aplica todas las .sql)`,
    );
  }
  return row.id;
}

async function countCustomAvisos(app: FastifyInstance): Promise<number> {
  const rows = await app.db
    .select({ id: avisos.id })
    .from(avisos)
    .where(and(tenantWhere(avisos, CTX_TEMPLO), eq(avisos.kind, "custom")));
  return rows.length;
}

/**
 * Registra (o incrementa, D-11) un evento de aviso directo en la base —
 * este plan no expone todavía un endpoint de miembro que los genere (eso es
 * el endpoint "qué pop-up toca hoy" de D-07, fuera de este plan). El
 * `onDuplicateKeyUpdate` simula la unique `(aviso_id, user_id, event_type)`:
 * una segunda "shown" del MISMO socio colapsa a la misma fila, nunca crea
 * una segunda — la base del caso (6).
 */
async function seedAvisoEvent(
  app: FastifyInstance,
  avisoId: number,
  userId: number,
  eventType: "shown" | "dismissed" | "clicked",
): Promise<void> {
  await app.db
    .insert(avisoEvents)
    .values(tenantValues(CTX_TEMPLO, { avisoId, userId, eventType }))
    .onDuplicateKeyUpdate({
      set: { eventCount: sql`${avisoEvents.eventCount} + 1`, lastAt: new Date() },
    });
}

function buildValidAvisoBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    placement: "popup",
    title: "Aviso de prueba 193-04",
    body: "Cuerpo del aviso de prueba",
    buttonText: "Ver más",
    destinationType: "app_section",
    destinationSection: "mi_templo",
    frequencyType: "once",
    ...overrides,
  };
}

let app: FastifyInstance;
let adminToken: string;
let coachToken: string;

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

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es 'owner' (test/setup.ts) — cubre ADMIN_ROLES (D-30).
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarAvisosCustomDeLaBateria(app);
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await limpiarAvisosCustomDeLaBateria(app);
  // cleanAllTestData borra TODOS los users salvo admin@test.com — el coach
  // se re-siembra en cada test.
  await createStaffUser(app, {
    email: COACH_EMAIL,
    password: COACH_PASSWORD,
    firstName: "Coach",
    lastName: "193-04",
    role: "coach",
    branchId: 1,
  });
  coachToken = await getAuthToken(app, COACH_EMAIL, COACH_PASSWORD);
});

describe("communications/avisos-admin (COM-01/COM-02)", () => {
  it("(1) POST /admin/avisos crea un aviso custom válido y aparece en GET", async () => {
    const res = await postComo("/admin/avisos", adminToken, buildValidAvisoBody());
    expect(res.statusCode, res.body).toBe(201);
    const created = JSON.parse(res.body) as { id: number; kind: string; title: string };
    expect(created.kind).toBe("custom");
    expect(created.title).toBe("Aviso de prueba 193-04");

    const listRes = await getComo("/admin/avisos", adminToken);
    expect(listRes.statusCode, listRes.body).toBe(200);
    const body = JSON.parse(listRes.body) as {
      avisos: Array<{ id: number; title: string }>;
    };
    expect(body.avisos.some((a) => a.id === created.id)).toBe(true);
  });

  it("(2) POST con destinationSection fuera de la lista curada -> 400, no crea fila (D-05)", async () => {
    const before = await countCustomAvisos(app);

    const res = await postComo(
      "/admin/avisos",
      adminToken,
      buildValidAvisoBody({ destinationSection: "no-existe" }),
    );
    expect(res.statusCode, res.body).toBe(400);

    const after = await countCustomAvisos(app);
    expect(after).toBe(before);
  });

  it("(3) POST whatsapp_sales con link en whatsappText -> 400 (T-193-02)", async () => {
    const res = await postComo(
      "/admin/avisos",
      adminToken,
      buildValidAvisoBody({
        destinationType: "whatsapp_sales",
        destinationSection: null,
        whatsappText: "Mirá esto: https://evil.example",
      }),
    );
    expect(res.statusCode, res.body).toBe(400);
  });

  it("(4) PUT sobre el aviso de sistema plan_expiry: frequencyDays -> 400 (D-10), title -> 200", async () => {
    const planExpiryId = await getSystemAvisoId(app, "plan_expiry");

    const resBad = await putComo(`/admin/avisos/${planExpiryId}`, adminToken, {
      frequencyDays: 5,
    });
    expect(resBad.statusCode, resBad.body).toBe(400);

    const resOk = await putComo(`/admin/avisos/${planExpiryId}`, adminToken, {
      title: "Tu membresía vence pronto — editado",
    });
    expect(resOk.statusCode, resOk.body).toBe(200);
    const updated = JSON.parse(resOk.body) as { title: string };
    expect(updated.title).toBe("Tu membresía vence pronto — editado");
  });

  it("(5) DELETE de un aviso de sistema -> 400 (D-11); de uno custom -> 200", async () => {
    const planExpiryId = await getSystemAvisoId(app, "plan_expiry");
    const resSystem = await deleteComo(`/admin/avisos/${planExpiryId}`, adminToken);
    expect(resSystem.statusCode, resSystem.body).toBe(400);

    const createRes = await postComo(
      "/admin/avisos",
      adminToken,
      buildValidAvisoBody({ title: "A borrar" }),
    );
    const created = JSON.parse(createRes.body) as { id: number };
    const resCustom = await deleteComo(`/admin/avisos/${created.id}`, adminToken);
    expect(resCustom.statusCode, resCustom.body).toBe(200);
  });

  it("(6) métricas: reachedCount/dismissedCount/clickedCount cuentan socios ÚNICOS (D-17)", async () => {
    const createRes = await postComo("/admin/avisos", adminToken, buildValidAvisoBody());
    const created = JSON.parse(createRes.body) as { id: number };

    const socio1 = await createTestMember(app);
    const socio2 = await createTestMember(app);

    // socio1: dos "shown" — la unique (aviso_id, user_id, event_type)
    // colapsa a UNA fila. Solo debería contar una vez.
    await seedAvisoEvent(app, created.id, socio1.id, "shown");
    await seedAvisoEvent(app, created.id, socio1.id, "shown");
    // socio2: shown + clicked.
    await seedAvisoEvent(app, created.id, socio2.id, "shown");
    await seedAvisoEvent(app, created.id, socio2.id, "clicked");

    const listRes = await getComo("/admin/avisos", adminToken);
    expect(listRes.statusCode, listRes.body).toBe(200);
    const body = JSON.parse(listRes.body) as {
      avisos: Array<{
        id: number;
        reachedCount: number;
        dismissedCount: number;
        clickedCount: number;
      }>;
    };
    const item = body.avisos.find((a) => a.id === created.id);
    expect(
      item?.reachedCount,
      "reachedCount debería ser 2 (socio1 + socio2 ÚNICOS), no 3 (eventos)",
    ).toBe(2);
    expect(item?.dismissedCount).toBe(0);
    expect(item?.clickedCount, "clickedCount debería ser 1 (solo socio2)").toBe(1);
  });

  it("(7) GET /admin/avisos/:id/clickers devuelve nombre y teléfono de quien tocó el botón (D-18)", async () => {
    const createRes = await postComo("/admin/avisos", adminToken, buildValidAvisoBody());
    const created = JSON.parse(createRes.body) as { id: number };

    const socio = await createTestMember(app, {
      firstName: "Ana",
      lastName: "Clicker",
      phone: "5492235550000",
    });
    await seedAvisoEvent(app, created.id, socio.id, "clicked");

    const res = await getComo(`/admin/avisos/${created.id}/clickers`, adminToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      clickers: Array<{ userId: number; fullName: string; phone: string | null }>;
    };
    expect(body.clickers).toHaveLength(1);
    expect(body.clickers[0]?.userId).toBe(socio.id);
    expect(body.clickers[0]?.fullName).toBe("Ana Clicker");
    expect(body.clickers[0]?.phone).toBe("5492235550000");
  });

  it("(8) un coach autenticado recibe 403 en las 7 rutas admin (D-30)", async () => {
    // Sembrado con el admin para tener un id válido con el que probar los
    // handlers por :id (el 403 debe llegar ANTES de resolver el recurso).
    const createRes = await postComo("/admin/avisos", adminToken, buildValidAvisoBody());
    const created = JSON.parse(createRes.body) as { id: number };

    const getList = await getComo("/admin/avisos", coachToken);
    expect(getList.statusCode).toBe(403);

    const post = await postComo("/admin/avisos", coachToken, buildValidAvisoBody());
    expect(post.statusCode).toBe(403);

    const put = await putComo(`/admin/avisos/${created.id}`, coachToken, {
      title: "hackeado",
    });
    expect(put.statusCode).toBe(403);

    const del = await deleteComo(`/admin/avisos/${created.id}`, coachToken);
    expect(del.statusCode).toBe(403);

    const clickers = await getComo(`/admin/avisos/${created.id}/clickers`, coachToken);
    expect(clickers.statusCode).toBe(403);

    const getSales = await getComo("/admin/sales-number", coachToken);
    expect(getSales.statusCode).toBe(403);

    const putSales = await putComo("/admin/sales-number", coachToken, {
      AR: "5492235555555",
    });
    expect(putSales.statusCode).toBe(403);
  });
});
