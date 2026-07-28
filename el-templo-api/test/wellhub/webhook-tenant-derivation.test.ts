/**
 * Fase 169 Plan 05 (CON-04): la derivación del tenant en el webhook de Wellhub,
 * probada por COMPORTAMIENTO contra MySQL real.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * El webhook de Wellhub es el único camino de ESCRITURA que entra sin sesión:
 * crea usuarios (`status='wellhub'`) y asistencias a partir de un POST firmado
 * con HMAC. Hasta la fase 169 no sabía de qué gimnasio era lo que creaba. Ahora
 * lo deriva server-side:
 *
 *   event_data.gym.id → branches.wellhub_gym_id → branches.tenant_id → tenants.status
 *
 * Lo que se prueba acá es la TABLA DE CORTE de `WellhubService.resolverTenant`,
 * fila por fila, más el estampado de `wellhub_events`:
 *
 * | Caso                                  | HTTP | outcome | detail             |
 * | ------------------------------------- | ---- | ------- | ------------------ |
 * | gym sin sede mapeada (D-04, no cambia)| 200  | skipped | `gym_sin_sede`     |
 * | sede de un gimnasio `suspended` (D-05)| 200  | skipped | `tenant_no_activo` |
 * | sede de un gimnasio `archived` (D-05) | 200  | skipped | `tenant_no_activo` |
 *
 * (La cuarta fila de la tabla del service, `tenant_no_resoluble`, es corrupción
 * de datos: exige una `branches.tenant_id` apuntando a una fila de `tenants` que
 * no existe, y la FK `fk_branches_tenant` lo vuelve imposible de sembrar desde
 * un test sin apagar los FK checks globalmente. Queda cubierta por typecheck y
 * por el `log.error` explícito del service — no se simula acá.)
 *
 * LAS DOS TRAMPAS DE ESTE ARCHIVO
 * -------------------------------
 * (a) `branches.tenant_id` tiene DEFAULT 1 desde la fase 167 (T-168-15). Una
 *     sede sembrada sin `tenantId` cae en el tenant 1 EN SILENCIO, y entonces
 *     "la sede del segundo gimnasio" sería en realidad una sede de El Templo:
 *     los tests de corte pasarían en verde probando exactamente nada. Por eso
 *     las dos sedes de acá estampan `tenantId` EXPLÍCITO, incluida la del
 *     tenant 1.
 * (b) Una aserción de corte que sólo mire el código HTTP pasa en verde con un
 *     webhook que igual creó el usuario y la asistencia y después devolvió 200.
 *     Por eso cada corte afirma ADEMÁS la EXCLUSIÓN: cero usuarios con ese
 *     `gympass_id`, cero asistencias, y cero llamadas al endpoint facturable de
 *     Wellhub (T-169-22).
 *
 * ALCANCE
 * -------
 * Las fixtures 2-tenant completas son trabajo de la fase 171 (ISO-03): este
 * archivo no adelanta esa API ni agrega nada a `test/helpers.ts`. Sus helpers
 * son mínimos y locales, y el harness del webhook (constantes, builders de
 * payload, firma HMAC, stub de `fetch`) se reutiliza TEXTUALMENTE de
 * `webhook-checkin.test.ts`, que NO se modifica.
 *
 * Tampoco se usa `cleanAllTestData`: es admin-global y borra `users` y
 * `wellhub_events` de todos los gimnasios (warning heredado del 168-REVIEW). La
 * limpieza de acá es local y explícita — cada caso usa su propio `unique_token`,
 * así que las aserciones son scopeadas y no necesitan una base vacía.
 *
 * Correr SOLO este archivo: más de uno a la vez revienta el timeout de 120 s del
 * provisioning en esta máquina.
 *   npx vitest run test/wellhub/webhook-tenant-derivation.test.ts --no-file-parallelism
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { createHmac } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";

// ─── Constantes de tenant ────────────────────────────────────────────────────
// Ningún número mágico suelto en las aserciones: los dos ids viven acá.
//
// El tenant 1 es El Templo, sembrado por la migración 0190 — existe siempre y
// este archivo NUNCA lo borra (sólo lo devuelve a 'active' en el afterEach).
const TENANT_TEMPLO = 1;
// Id fijo y ALTO a propósito: no colisiona con el autoincremento de `tenants`
// (que hoy está en 1) ni con ningún id de otro archivo de la fase (90169 es de
// `tenant-helpers`, 90168 del `con-01`, 90269 del `con-04`). Dos archivos del
// mismo worker que usaran el mismo id se pisarían (`fileParallelism` con
// `isolate: false`). La fila la crea el `beforeAll` y la borra el `afterAll`.
const TENANT_SEGUNDO = 90469;

// ─── Harness del webhook (idéntico al de webhook-checkin.test.ts) ────────────

const WEBHOOK_URL = "/api/webhooks/wellhub";
const SECRET = "test-wellhub-secret";

/** Tokens emitidos por este archivo, para poder limpiarlos al final. */
const tokensEmitidos: string[] = [];
/** event_id sintetizados por este archivo, para poder limpiarlos al final. */
const eventosEmitidos: string[] = [];

function uniqueGymId(): number {
  return 500_000 + Math.floor(Math.random() * 400_000);
}

function uniqueToken(): string {
  // 13 dígitos como los gympass_id reales del sandbox.
  const token = `1${String(Date.now() % 1_000_000_000).padStart(9, "0")}${String(
    Math.floor(Math.random() * 900) + 100,
  )}`;
  tokensEmitidos.push(token);
  return token;
}

function checkinPayload(input: {
  token: string;
  gymId: number;
  timestamp: number;
}): string {
  return JSON.stringify({
    event_type: "checkin",
    event_data: {
      user: {
        unique_token: input.token,
        first_name: "Wellhub",
        last_name: "Visitor",
        email: `wh-${input.token}@example.com`,
        phone_number: "+5492235550000",
      },
      gym: { id: input.gymId, title: "El Templo Test" },
      timestamp: input.timestamp,
    },
  });
}

/**
 * Réplica EXACTA de `WellhubService.eventIdFor` para el caso checkin (que no
 * trae `event_id` y lo sintetiza). Es lo que permite buscar la fila de
 * `wellhub_events` de un evento puntual sin barrer la tabla entera — importante
 * porque este archivo no vacía la base.
 */
function eventIdDeCheckin(token: string, timestamp: number): string {
  const eventId = `checkin:${token}:${timestamp}`;
  eventosEmitidos.push(eventId);
  return eventId;
}

function sign(raw: string, algorithm: "sha1" | "sha256" = "sha256"): string {
  return createHmac(algorithm, SECRET).update(raw).digest("hex");
}

/** fetch mock: responde OK al validate y registra las llamadas. */
function stubValidateFetch(): { calls: Array<{ url: string }> } {
  const calls: Array<{ url: string }> = [];
  vi.stubGlobal(
    "fetch",
    async (url: string | URL): Promise<Response> => {
      calls.push({ url: String(url) });
      return new Response(
        JSON.stringify({
          metadata: { total: 1, errors: 0 },
          results: { validated_at: "2026-07-21T12:00:00Z" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  );
  return { calls };
}

async function postWebhook(app: FastifyInstance, raw: string) {
  return app.inject({
    method: "POST",
    url: WEBHOOK_URL,
    headers: {
      "content-type": "application/json",
      "x-gympass-signature": sign(raw),
    },
    payload: raw,
  });
}

// ─── Utilidades locales ──────────────────────────────────────────────────────

async function setTenantStatus(
  app: FastifyInstance,
  tenantId: number,
  status: string,
): Promise<void> {
  await app.db.execute(
    sql`UPDATE tenants SET status = ${status} WHERE id = ${tenantId}`,
  );
}

async function contarTenant(
  app: FastifyInstance,
  tenantId: number,
): Promise<number> {
  const resultado = (await app.db.execute(
    sql`SELECT COUNT(*) AS n FROM tenants WHERE id = ${tenantId}`,
  )) as unknown as [Array<{ n: number }>];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as Array<{ n: number }>);
  return Number(filas?.[0]?.n ?? -1);
}

/** Usuarios visitantes creados por un token puntual (aserción de exclusión). */
async function visitantesDe(app: FastifyInstance, token: string) {
  return app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.gympassId, token));
}

/** Fila de `wellhub_events` de un evento puntual, con su tenant estampado. */
async function eventoDe(app: FastifyInstance, eventId: string) {
  const [fila] = await app.db
    .select({
      id: schema.wellhubEvents.id,
      status: schema.wellhubEvents.status,
      tenantId: schema.wellhubEvents.tenantId,
    })
    .from(schema.wellhubEvents)
    .where(eq(schema.wellhubEvents.eventId, eventId));
  return fila;
}

let app: FastifyInstance;
/** Sede de El Templo (tenant 1) mapeada a Wellhub. */
let branchTemploId: number;
let gymTemplo: number;
/** Sede del segundo gimnasio (tenant 90469) mapeada a Wellhub. */
let branchSegundoId: number;
let gymSegundo: number;

beforeAll(async () => {
  process.env.WELLHUB_API_KEY = "test-api-key";
  process.env.WELLHUB_WEBHOOK_SECRET = SECRET;

  app = await createTestApp();

  // Defensivo: una corrida anterior abortada podría haber dejado la fila.
  await app.db.execute(sql`DELETE FROM tenants WHERE id = ${TENANT_SEGUNDO}`);
  await app.db.insert(schema.tenants).values({
    id: TENANT_SEGUNDO,
    name: "Gimnasio de prueba 169-05",
    slug: `test-169-wellhub-${TENANT_SEGUNDO}`,
    status: "active",
  });

  const suffix = Date.now().toString(36).slice(-6);

  // `tenantId` EXPLÍCITO en las DOS sedes — trampa (a) de la cabecera.
  gymTemplo = uniqueGymId();
  const templo = await app.db.insert(schema.branches).values({
    tenantId: TENANT_TEMPLO,
    name: `Sede WH Templo ${suffix}`,
    code: `WT${suffix.toUpperCase()}`,
    timezone: "America/Argentina/Buenos_Aires",
    country: "AR",
    wellhubGymId: gymTemplo,
  });
  branchTemploId = Number(templo[0].insertId);

  gymSegundo = uniqueGymId();
  const segundo = await app.db.insert(schema.branches).values({
    tenantId: TENANT_SEGUNDO,
    name: `Sede WH Segundo ${suffix}`,
    code: `WS${suffix.toUpperCase()}`,
    timezone: "America/Argentina/Buenos_Aires",
    country: "AR",
    wellhubGymId: gymSegundo,
  });
  branchSegundoId = Number(segundo[0].insertId);
});

beforeEach(async () => {
  vi.unstubAllGlobals();
  await setTenantStatus(app, TENANT_TEMPLO, "active");
  await setTenantStatus(app, TENANT_SEGUNDO, "active");
});

// Red INCONDICIONAL: pase lo que pase en un test, el worker sigue con los dos
// gimnasios operativos. Sin esto, un test que deje el tenant 1 suspendido rompe
// TODOS los archivos siguientes del mismo worker (`isolate: false`).
afterEach(async () => {
  vi.unstubAllGlobals();
  await setTenantStatus(app, TENANT_TEMPLO, "active");
  await setTenantStatus(app, TENANT_SEGUNDO, "active");
});

afterAll(async () => {
  delete process.env.WELLHUB_API_KEY;
  delete process.env.WELLHUB_WEBHOOK_SECRET;
  vi.unstubAllGlobals();
  await setTenantStatus(app, TENANT_TEMPLO, "active");

  // Orden seguro de FKs: attendance y user_status_history cuelgan de users,
  // users cuelga de branches, branches cuelga de tenants. wellhub_events no
  // tiene FK a nuestro dominio (mina M6) pero sí a tenants, así que va antes.
  if (tokensEmitidos.length > 0) {
    const visitantes = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(inArray(schema.users.gympassId, tokensEmitidos));
    const ids = visitantes.map((v) => v.id);
    if (ids.length > 0) {
      await app.db
        .delete(schema.attendance)
        .where(inArray(schema.attendance.memberId, ids));
      await app.db
        .delete(schema.userStatusHistory)
        .where(inArray(schema.userStatusHistory.userId, ids));
      await app.db.delete(schema.users).where(inArray(schema.users.id, ids));
    }
  }
  if (eventosEmitidos.length > 0) {
    await app.db
      .delete(schema.wellhubEvents)
      .where(inArray(schema.wellhubEvents.eventId, eventosEmitidos));
  }
  await app.db
    .delete(schema.branches)
    .where(inArray(schema.branches.id, [branchTemploId, branchSegundoId]));
  await app.db.execute(sql`DELETE FROM tenants WHERE id = ${TENANT_SEGUNDO}`);

  await app.close();
});

describe("Wellhub webhook — derivación del tenant (CON-04)", () => {
  it("gym_id sin sede mapeada → 200 skipped 'gym_sin_sede' sin crear nada (D-04)", async () => {
    const { calls } = stubValidateFetch();
    const token = uniqueToken();
    const ts = Date.now();
    const eventId = eventIdDeCheckin(token, ts);
    const raw = checkinPayload({ token, gymId: 999_999_999, timestamp: ts });

    const res = await postWebhook(app, raw);

    // El contrato de D-04 es literal: mismo status, mismo outcome, mismo detail
    // que antes de la fase 169. Un 4xx haría que Wellhub reintente eternamente.
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      outcome: "skipped",
      detail: "gym_sin_sede",
    });

    // Exclusión: ni usuario, ni asistencia, ni transacción facturable.
    expect(calls).toHaveLength(0);
    expect(await visitantesDe(app, token)).toHaveLength(0);

    const evento = await eventoDe(app, eventId);
    expect(evento.status).toBe("skipped");
  });

  it("sede de un gimnasio 'suspended' → 200 skipped 'tenant_no_activo' sin crear nada (D-05)", async () => {
    const { calls } = stubValidateFetch();
    await setTenantStatus(app, TENANT_SEGUNDO, "suspended");

    const token = uniqueToken();
    const ts = Date.now();
    const eventId = eventIdDeCheckin(token, ts);
    const raw = checkinPayload({ token, gymId: gymSegundo, timestamp: ts });

    const res = await postWebhook(app, raw);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      outcome: "skipped",
      detail: "tenant_no_activo",
    });

    // Exclusión (T-169-22): el corte va ANTES de findOrCreateVisitor, así que no
    // hay usuario nuevo; y antes del validate, así que no se facturó nada.
    expect(calls).toHaveLength(0);
    expect(await visitantesDe(app, token)).toHaveLength(0);
    const asistencias = await app.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(eq(schema.attendance.branchId, branchSegundoId));
    expect(asistencias).toHaveLength(0);

    const evento = await eventoDe(app, eventId);
    expect(evento.status).toBe("skipped");
  });

  it("sede de un gimnasio 'archived' → 200 skipped 'tenant_no_activo' sin crear nada (D-05)", async () => {
    const { calls } = stubValidateFetch();
    // El segundo estado no-activo del enum, no sólo el feliz: la comparación del
    // service es POSITIVA contra 'active', y este test es lo que lo prueba.
    await setTenantStatus(app, TENANT_SEGUNDO, "archived");

    const token = uniqueToken();
    const ts = Date.now();
    const eventId = eventIdDeCheckin(token, ts);
    const raw = checkinPayload({ token, gymId: gymSegundo, timestamp: ts });

    const res = await postWebhook(app, raw);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      outcome: "skipped",
      detail: "tenant_no_activo",
    });

    expect(calls).toHaveLength(0);
    expect(await visitantesDe(app, token)).toHaveLength(0);
    const asistencias = await app.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(eq(schema.attendance.branchId, branchSegundoId));
    expect(asistencias).toHaveLength(0);

    const evento = await eventoDe(app, eventId);
    expect(evento.status).toBe("skipped");
  });

  it("sede del tenant 1 activo → procesa como siempre y estampa wellhub_events con 1", async () => {
    const { calls } = stubValidateFetch();
    const token = uniqueToken();
    const ts = Date.now();
    const eventId = eventIdDeCheckin(token, ts);
    const raw = checkinPayload({ token, gymId: gymTemplo, timestamp: ts });

    const res = await postWebhook(app, raw);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).outcome).toBe("processed");
    expect(calls).toHaveLength(1);

    const [visitante] = await visitantesDe(app, token);
    expect(visitante).toBeDefined();
    const asistencias = await app.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(eq(schema.attendance.memberId, visitante.id));
    expect(asistencias).toHaveLength(1);

    const evento = await eventoDe(app, eventId);
    expect(evento.status).toBe("processed");
    expect(evento.tenantId).toBe(TENANT_TEMPLO);
  });

  it("sede de un gimnasio ACTIVO distinto de 1 → wellhub_events estampado con ESE tenant", async () => {
    // ESTE es el test que prueba de verdad el estampado. Los tres anteriores
    // pasarían en verde con un `tenantId: 1` hardcodeado en el UPDATE de cierre,
    // o incluso sin UPDATE (la columna tiene DEFAULT 1 desde la fase 167). Acá
    // el evento tiene que quedar con 90469: si el service estampara 1, o dejara
    // el DEFAULT, esta aserción se cae. Es la mitigación de T-169-21 —
    // "el tenant sale de NUESTRA fila, no del payload" — probada por
    // comportamiento y no por lectura del código.
    const { calls } = stubValidateFetch();
    const token = uniqueToken();
    const ts = Date.now();
    const eventId = eventIdDeCheckin(token, ts);
    const raw = checkinPayload({ token, gymId: gymSegundo, timestamp: ts });

    const res = await postWebhook(app, raw);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).outcome).toBe("processed");
    expect(calls).toHaveLength(1);

    const [visitante] = await visitantesDe(app, token);
    expect(visitante).toBeDefined();
    const asistencias = await app.db
      .select({
        id: schema.attendance.id,
        branchId: schema.attendance.branchId,
      })
      .from(schema.attendance)
      .where(eq(schema.attendance.memberId, visitante.id));
    expect(asistencias).toHaveLength(1);
    expect(asistencias[0].branchId).toBe(branchSegundoId);

    const evento = await eventoDe(app, eventId);
    expect(evento.status).toBe("processed");
    expect(evento.tenantId).toBe(TENANT_SEGUNDO);
  });

  it("el mismo gimnasio, suspendido y reactivado, cambia de resultado sin tocar código", async () => {
    // Cierre de la tabla de corte: el corte NO es una propiedad de la sede sino
    // del ESTADO del gimnasio, resuelto en cada evento. Mismo gym_id, dos
    // eventos, dos resultados.
    stubValidateFetch();

    await setTenantStatus(app, TENANT_SEGUNDO, "suspended");
    const tokenCortado = uniqueToken();
    const tsCortado = Date.now();
    eventIdDeCheckin(tokenCortado, tsCortado);
    const cortado = await postWebhook(
      app,
      checkinPayload({
        token: tokenCortado,
        gymId: gymSegundo,
        timestamp: tsCortado,
      }),
    );
    expect(JSON.parse(cortado.body).detail).toBe("tenant_no_activo");

    await setTenantStatus(app, TENANT_SEGUNDO, "active");
    const tokenOk = uniqueToken();
    const tsOk = Date.now() + 1;
    const eventIdOk = eventIdDeCheckin(tokenOk, tsOk);
    const ok = await postWebhook(
      app,
      checkinPayload({ token: tokenOk, gymId: gymSegundo, timestamp: tsOk }),
    );
    expect(JSON.parse(ok.body).outcome).toBe("processed");

    expect(await visitantesDe(app, tokenCortado)).toHaveLength(0);
    expect(await visitantesDe(app, tokenOk)).toHaveLength(1);

    const evento = await eventoDe(app, eventIdOk);
    expect(evento.tenantId).toBe(TENANT_SEGUNDO);
  });
});

describe("Higiene: el segundo gimnasio no sobrevive al archivo", () => {
  it("el tenant de prueba existe durante la corrida y el tenant 1 queda intacto", async () => {
    // El borrado real lo hace el `afterAll`; lo que se afirma acá es que el
    // tenant de prueba fue una fila REAL de MySQL (no un mock) y que el tenant 1
    // sigue en pie para los archivos siguientes del mismo worker.
    expect(await contarTenant(app, TENANT_SEGUNDO)).toBe(1);
    expect(await contarTenant(app, TENANT_TEMPLO)).toBe(1);
  });
});
