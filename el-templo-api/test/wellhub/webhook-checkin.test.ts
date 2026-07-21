/**
 * Integration tests — webhook de check-in de Wellhub.
 *
 * POST /api/webhooks/wellhub (público, autenticado por X-Gympass-Signature).
 *
 * Coverage:
 *  - 503 sin credenciales configuradas.
 *  - 401 firma inválida / ausente; 400 JSON roto o payload sin event_type.
 *  - Firma válida en sha256 hex, sha1 hex y con prefijo "sha256=".
 *  - checkin feliz: llama a POST /access/v1/validate, crea el visitante
 *    (status='wellhub', gympass_id, sin lead_status) y registra attendance
 *    source='wellhub' SIN suscripción ni AURA.
 *  - Idempotencia: reentrega exacta → duplicate sin segunda attendance;
 *    segundo checkin del día (otro timestamp) → already_checked_in y NO
 *    llama a validate de nuevo.
 *  - gym_id sin sede mapeada → skipped, no crea nada.
 *  - validate 4xx (ticket inválido) → skipped sin attendance; validate 5xx →
 *    500 y el reintento del evento reprocesa y termina en processed.
 *  - Vinculación por email: un socio existente recibe el gympass_id y la
 *    visita queda en su cuenta.
 *
 * El fetch saliente a la API de Wellhub se mockea con vi.stubGlobal.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { createHmac } from "crypto";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData, registerUser } from "../helpers";
import * as schema from "../../src/db/schema";

const WEBHOOK_URL = "/api/webhooks/wellhub";
const SECRET = "test-wellhub-secret";

function uniqueGymId(): number {
  return 500_000 + Math.floor(Math.random() * 400_000);
}

function uniqueToken(): string {
  // 13 dígitos como los gympass_id reales del sandbox.
  return `1${String(Date.now() % 1_000_000_000).padStart(9, "0")}${String(
    Math.floor(Math.random() * 900) + 100,
  )}`;
}

function checkinPayload(input: {
  token: string;
  gymId: number;
  timestamp?: number;
  email?: string;
}): string {
  return JSON.stringify({
    event_type: "checkin",
    event_data: {
      user: {
        unique_token: input.token,
        first_name: "Wellhub",
        last_name: "Visitor",
        email: input.email ?? `wh-${input.token}@example.com`,
        phone_number: "+5492235550000",
      },
      gym: { id: input.gymId, title: "El Templo Test" },
      timestamp: input.timestamp ?? Date.now(),
    },
  });
}

function sign(raw: string, algorithm: "sha1" | "sha256" = "sha256"): string {
  return createHmac(algorithm, SECRET).update(raw).digest("hex");
}

/** fetch mock: responde OK al validate y registra las llamadas. */
function stubValidateFetch(
  status = 200,
  body: unknown = {
    metadata: { total: 1, errors: 0 },
    results: { validated_at: "2026-07-21T12:00:00Z" },
  },
): { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    async (url: string | URL, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  return { calls };
}

async function postWebhook(
  app: FastifyInstance,
  raw: string,
  signature?: string,
) {
  return app.inject({
    method: "POST",
    url: WEBHOOK_URL,
    headers: {
      "content-type": "application/json",
      ...(signature !== undefined ? { "x-gympass-signature": signature } : {}),
    },
    payload: raw,
  });
}

describe("Wellhub webhook — check-in", () => {
  let app: FastifyInstance;
  let branchId: number;
  let gymId: number;

  beforeAll(async () => {
    process.env.WELLHUB_API_KEY = "test-api-key";
    process.env.WELLHUB_WEBHOOK_SECRET = SECRET;

    app = await createTestApp();

    gymId = uniqueGymId();
    const suffix = Date.now().toString(36).slice(-6);
    const inserted = await app.db.insert(schema.branches).values({
      name: `Sede Wellhub ${suffix}`,
      code: `WH${suffix.toUpperCase()}`,
      timezone: "America/Argentina/Buenos_Aires",
      country: "AR",
      wellhubGymId: gymId,
    });
    branchId = Number(inserted[0].insertId);
  });

  afterAll(async () => {
    delete process.env.WELLHUB_API_KEY;
    delete process.env.WELLHUB_WEBHOOK_SECRET;
    vi.unstubAllGlobals();
    // Primero los datos (attendance/users referencian la sede), después la sede.
    await cleanAllTestData(app);
    await app.db
      .delete(schema.branches)
      .where(eq(schema.branches.id, branchId));
    await app.close();
  });

  beforeEach(async () => {
    vi.unstubAllGlobals();
    await cleanAllTestData(app);
  });

  // ─── Autenticación del webhook ───────────────────────────────────────────

  it("responde 503 cuando la integración no está configurada", async () => {
    const raw = checkinPayload({ token: uniqueToken(), gymId });
    const savedKey = process.env.WELLHUB_API_KEY;
    delete process.env.WELLHUB_API_KEY;
    try {
      const res = await postWebhook(app, raw, sign(raw));
      expect(res.statusCode).toBe(503);
    } finally {
      process.env.WELLHUB_API_KEY = savedKey;
    }
  });

  it("rechaza 401 sin firma o con firma inválida", async () => {
    const raw = checkinPayload({ token: uniqueToken(), gymId });

    const sinFirma = await postWebhook(app, raw);
    expect(sinFirma.statusCode).toBe(401);

    const firmaMala = await postWebhook(app, raw, "deadbeef".repeat(8));
    expect(firmaMala.statusCode).toBe(401);

    // Firma válida de OTRO body.
    const otraFirma = sign(checkinPayload({ token: uniqueToken(), gymId }));
    const firmaAjena = await postWebhook(app, raw, otraFirma);
    expect(firmaAjena.statusCode).toBe(401);

    // Nada quedó registrado.
    const events = await app.db.select().from(schema.wellhubEvents);
    expect(events).toHaveLength(0);
  });

  it("acepta firmas sha256 hex, sha1 hex y con prefijo sha256=", async () => {
    stubValidateFetch();

    const raw1 = checkinPayload({ token: uniqueToken(), gymId });
    expect((await postWebhook(app, raw1, sign(raw1))).statusCode).toBe(200);

    const raw2 = checkinPayload({ token: uniqueToken(), gymId });
    expect((await postWebhook(app, raw2, sign(raw2, "sha1"))).statusCode).toBe(
      200,
    );

    const raw3 = checkinPayload({ token: uniqueToken(), gymId });
    expect(
      (await postWebhook(app, raw3, `sha256=${sign(raw3)}`)).statusCode,
    ).toBe(200);
  });

  it("responde 400 ante JSON roto o payload sin event_type", async () => {
    const rawBroken = "{no es json";
    expect(
      (await postWebhook(app, rawBroken, sign(rawBroken))).statusCode,
    ).toBe(400);

    const rawNoType = JSON.stringify({ event_data: {} });
    expect(
      (await postWebhook(app, rawNoType, sign(rawNoType))).statusCode,
    ).toBe(400);
  });

  // ─── Flujo de check-in ───────────────────────────────────────────────────

  it("checkin feliz: valida contra Wellhub, crea visitante y attendance sin efectos de socio", async () => {
    const { calls } = stubValidateFetch();
    const token = uniqueToken();
    const raw = checkinPayload({ token, gymId });

    const res = await postWebhook(app, raw, sign(raw));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).outcome).toBe("processed");

    // Llamó al punto final de validación (transacción facturable).
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/access/v1/validate");
    const validateHeaders = calls[0].init?.headers as Record<string, string>;
    expect(validateHeaders["X-Gym-Id"]).toBe(String(gymId));
    expect(validateHeaders.Authorization).toBe("Bearer test-api-key");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      gympass_id: token,
    });

    // Visitante creado fuera del pipeline de leads.
    const [visitor] = await app.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.gympassId, token));
    expect(visitor).toBeDefined();
    expect(visitor.status).toBe("wellhub");
    expect(visitor.role).toBe("member");
    expect(visitor.leadStatus).toBeNull();
    expect(visitor.branchId).toBe(branchId);
    expect(visitor.firstName).toBe("Wellhub");

    // Attendance source wellhub, sin schedule ni suscripción ni AURA.
    const rows = await app.db
      .select()
      .from(schema.attendance)
      .where(eq(schema.attendance.memberId, visitor.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("wellhub");
    expect(rows[0].branchId).toBe(branchId);
    expect(rows[0].scheduleId).toBeNull();

    const subs = await app.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, visitor.id));
    expect(subs).toHaveLength(0);

    const aura = await app.db
      .select()
      .from(schema.auraTransactions)
      .where(eq(schema.auraTransactions.userId, visitor.id));
    expect(aura).toHaveLength(0);

    // Evento registrado como procesado.
    const [event] = await app.db
      .select()
      .from(schema.wellhubEvents)
      .where(eq(schema.wellhubEvents.eventType, "checkin"));
    expect(event.status).toBe("processed");
  });

  it("reentrega exacta → duplicate; segundo checkin del día → already_checked_in sin re-facturar", async () => {
    const { calls } = stubValidateFetch();
    const token = uniqueToken();
    const ts = Date.now();
    const raw = checkinPayload({ token, gymId, timestamp: ts });

    expect((await postWebhook(app, raw, sign(raw))).statusCode).toBe(200);

    // Reentrega idéntica (mismo event_id sintetizado).
    const retry = await postWebhook(app, raw, sign(raw));
    expect(retry.statusCode).toBe(200);
    expect(JSON.parse(retry.body).outcome).toBe("duplicate");

    // Nuevo evento, mismo día.
    const raw2 = checkinPayload({ token, gymId, timestamp: ts + 60_000 });
    const secondCheckin = await postWebhook(app, raw2, sign(raw2));
    expect(secondCheckin.statusCode).toBe(200);
    expect(JSON.parse(secondCheckin.body).outcome).toBe("already_checked_in");

    // Solo la primera llamada facturó, y hay UNA sola attendance.
    expect(calls).toHaveLength(1);
    const [visitor] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.gympassId, token));
    const rows = await app.db
      .select()
      .from(schema.attendance)
      .where(eq(schema.attendance.memberId, visitor.id));
    expect(rows).toHaveLength(1);
  });

  it("gym_id sin sede mapeada → skipped sin crear nada", async () => {
    const { calls } = stubValidateFetch();
    const token = uniqueToken();
    const raw = checkinPayload({ token, gymId: 999_999_999 });

    const res = await postWebhook(app, raw, sign(raw));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).outcome).toBe("skipped");

    expect(calls).toHaveLength(0);
    const visitors = await app.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.gympassId, token));
    expect(visitors).toHaveLength(0);
  });

  it("validate 4xx (ticket inválido) → skipped sin attendance", async () => {
    stubValidateFetch(422, { errors: [{ message: "no valid ticket" }] });
    const token = uniqueToken();
    const raw = checkinPayload({ token, gymId });

    const res = await postWebhook(app, raw, sign(raw));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).outcome).toBe("skipped");

    const [visitor] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.gympassId, token));
    // El visitante se crea igual (identidad), pero SIN attendance.
    expect(visitor).toBeDefined();
    const rows = await app.db
      .select()
      .from(schema.attendance)
      .where(eq(schema.attendance.memberId, visitor.id));
    expect(rows).toHaveLength(0);
  });

  it("validate 5xx → 500, y el reintento del mismo evento reprocesa hasta processed", async () => {
    stubValidateFetch(503, { error: "unavailable" });
    const token = uniqueToken();
    const ts = Date.now();
    const raw = checkinPayload({ token, gymId, timestamp: ts });

    const res = await postWebhook(app, raw, sign(raw));
    expect(res.statusCode).toBe(500);

    const [event] = await app.db
      .select()
      .from(schema.wellhubEvents)
      .where(eq(schema.wellhubEvents.eventType, "checkin"));
    expect(event.status).toBe("error");

    // Reintento de Wellhub con el mismo payload, ahora la API responde bien.
    stubValidateFetch();
    const retry = await postWebhook(app, raw, sign(raw));
    expect(retry.statusCode).toBe(200);
    expect(JSON.parse(retry.body).outcome).toBe("processed");

    const [visitor] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.gympassId, token));
    const rows = await app.db
      .select()
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, visitor.id),
          eq(schema.attendance.source, "wellhub"),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("vincula por email a un usuario existente en vez de duplicarlo", async () => {
    stubValidateFetch();
    const email = `socio-wh-${Date.now()}@example.com`;
    const { user } = await registerUser(app, {
      email,
      password: "Password123!",
      branchId,
    });
    const socioId = user.id as number;

    const token = uniqueToken();
    const raw = checkinPayload({ token, gymId, email });

    const res = await postWebhook(app, raw, sign(raw));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).outcome).toBe("processed");

    const [linked] = await app.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.gympassId, token));
    expect(linked.id).toBe(socioId);
    // No cambió su status por la vinculación.
    expect(linked.status).not.toBe("wellhub");

    const rows = await app.db
      .select()
      .from(schema.attendance)
      .where(eq(schema.attendance.memberId, socioId));
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("wellhub");
  });
});
