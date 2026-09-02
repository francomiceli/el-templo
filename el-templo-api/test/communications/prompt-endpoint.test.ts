/**
 * Fase 193 Plan 05 (COM-02/COM-03, D-06/D-07/D-11/D-13/D-14/D-15b/D-20) —
 * integración HTTP de las 4 rutas member-facing de `/api/communications/me`:
 *
 *   - GET  /me/prompt              — "qué pop-up toca hoy" (D-07)
 *   - POST /me/avisos/:id/event    — registro de eventos por socio (D-11)
 *   - GET  /me/tarjetas            — tarjetas del carrusel (D-15b)
 *   - GET  /me/config              — número de ventas por la sede del socio (D-20)
 *
 * Casos del plan:
 *   (1) prioridad (D-06): un socio que califica para las 4 reglas a la vez
 *       recibe SOLO plan_expiry; registrando `shown` y volviendo a pedir,
 *       recibe el aviso vigente; con ese aviso pausado, recibe rating; sin
 *       clase pendiente, recibe improvement; sin nada, `{ prompt: null }`.
 *   (2) frecuencia (D-11): `every_n_days`, `once`, `every_open`.
 *   (3) alcance (D-13): `scopeBranchIds`, `scopeCountries`, `scopeSegments`.
 *   (4) vigencia (D-14): `startsOn`/`endsOn`.
 *   (5) eventos (D-11): idempotencia por `(aviso, socio, tipo)`.
 *   (6) config (D-20): número resuelto por país de sede, `null` si no está cargado.
 *   (7) tarjetas (D-15b): las 4 de sistema + una libre, ordenadas por `sortOrder`.
 *
 * LIMPIEZA (193-03, L5): `avisos`/`aviso_events`/`tv_avisos` NO están en
 * `TABLES_TO_CLEAN` — el catálogo de sistema (migración 0217) es dato semilla
 * estable. `classCoachAssignments`/`coachRatings` TAMPOCO están en
 * `TABLES_TO_CLEAN` (mismo criterio que `test/ratings/ratings.test.ts`).
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/communications/prompt-endpoint.test.ts
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql, and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import { createPlan } from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere, tenantValues, type TenantContext } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { todayInTz } from "../../src/modules/shared/date-utils";
import { DEFAULT_WHATSAPP_TEXT } from "../../src/modules/communications/destinations";

const BASE = "/api/communications";
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const AR_TZ = "America/Argentina/Buenos_Aires";
const MARCA = "P05";

// ─── Fechas (regla dura: nada de fechas fijas, todo relativo a "hoy") ──────

/** "YYYY-MM-DD" offset por `days` desde el hoy AR — mismo criterio que `wholeDaysUntil`. */
function arDateOffset(days: number): string {
  const today = todayInTz(AR_TZ);
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/** ISO day-of-week (1=Mon..7=Sun) de un "YYYY-MM-DD". */
function isoDow(dateStr: string): number {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** ISO Monday ("YYYY-MM-DD") de la semana que contiene `dateStr`. */
function isoMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

/**
 * El día calendario-eligible (Lun-Sáb) más reciente, contando `n` hacia
 * atrás — el roster no tiene slots de domingo (`dayOfWeek` 1..6), así que una
 * `sessionDate` en domingo no podría tener coach asignado (mismo motivo que
 * `classDaysAgo` en `test/ratings/ratings.test.ts`).
 */
function classDaysAgo(n: number): string {
  let back = 0;
  let seen = 0;
  for (;;) {
    const day = arDateOffset(-back);
    if (isoDow(day) !== 7) {
      if (seen === n) return day;
      seen++;
    }
    back++;
  }
}

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

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface AvisoOverrides {
  placement?: "popup" | "tarjeta";
  body?: string;
  buttonText?: string;
  destinationType?: "app_section" | "whatsapp_sales";
  destinationSection?: string | null;
  whatsappText?: string | null;
  frequencyType?: "once" | "every_n_days" | "every_open";
  frequencyDays?: number | null;
  status?: "draft" | "active" | "paused";
  startsOn?: string | null;
  endsOn?: string | null;
  scopeBranchIds?: number[] | null;
  scopeCountries?: string[] | null;
  scopeSegments?: string[] | null;
  sortOrder?: number;
}

/** Aviso `kind: 'custom'` por INSERT directo — control total sobre alcance/vigencia/frecuencia. */
async function crearAvisoCustom(
  app: FastifyInstance,
  title: string,
  overrides: AvisoOverrides = {},
): Promise<number> {
  const [result] = await app.db.insert(schema.avisos).values(
    tenantValues(CTX_TEMPLO, {
      kind: "custom" as const,
      code: null,
      placement: overrides.placement ?? "popup",
      title,
      body: overrides.body ?? `Cuerpo de ${title}`,
      buttonText: overrides.buttonText ?? "Ver",
      destinationType: overrides.destinationType ?? "app_section",
      destinationSection:
        (overrides.destinationType ?? "app_section") === "whatsapp_sales"
          ? null
          : (overrides.destinationSection ?? "mi_templo"),
      whatsappText: overrides.whatsappText ?? null,
      frequencyType: overrides.frequencyType ?? "every_open",
      frequencyDays: overrides.frequencyDays ?? null,
      status: overrides.status ?? "active",
      startsOn: overrides.startsOn ?? null,
      endsOn: overrides.endsOn ?? null,
      scopeBranchIds: overrides.scopeBranchIds ?? null,
      scopeCountries: overrides.scopeCountries ?? null,
      scopeSegments: overrides.scopeSegments ?? null,
      sortOrder: overrides.sortOrder ?? 0,
    }),
  );
  return Number(result.insertId);
}

// ─── Utilidades HTTP ─────────────────────────────────────────────────────────

function getComo(app: FastifyInstance, url: string, token: string) {
  return app.inject({
    method: "GET",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function postComo(
  app: FastifyInstance,
  url: string,
  token: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

interface PromptBody {
  prompt: {
    kind: "plan_expiry" | "aviso" | "rating" | "improvement";
    aviso: { id: number; title: string };
    daysRemaining?: number;
    pending?: { sessionDate: string; scheduleId: number; activityName: string };
  } | null;
}

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let templeAdminToken: string;
let esBranchId: number;

beforeAll(async () => {
  app = await createTestApp();
  templeAdminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-193-05-Test",
      code: `ES${suffix}`.slice(0, 20),
      country: "ES",
      isVirtual: false,
      isActive: true,
      timezone: "Europe/Madrid",
    })
    .$returningId();
  esBranchId = es.id;
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarAvisosCustomDeLaBateria(app);
  await app.db.delete(schema.classCoachAssignments);
  await app.db.delete(schema.coachRatings);
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await limpiarAvisosCustomDeLaBateria(app);
  await app.db.delete(schema.classCoachAssignments);
  await app.db.delete(schema.coachRatings);
});

// ═══════════════════════════════════════════════════════════════════════════
// (1) Prioridad — D-06
// ═══════════════════════════════════════════════════════════════════════════

describe("prioridad — GET /api/communications/me/prompt (D-06)", () => {
  it("recorre los 5 escalones en el orden fijo: plan_expiry > aviso > rating > improvement > null", async () => {
    const member = await createTestMember(app, { branchId: 1 });

    // 1) plan_expiry: cobertura activa que vence en 2 días (0 <= x <= 3).
    const plan = await createPlan(app, templeAdminToken);
    await app.db.insert(schema.subscriptions).values({
      userId: member.id,
      planId: plan.id,
      branchId: 1,
      status: "active",
      startDate: arDateOffset(-10),
      endDate: arDateOffset(2),
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });

    // 2) aviso vigente: custom popup, sin alcance, every_open.
    const avisoVigenteId = await crearAvisoCustom(app, `${MARCA} Aviso vigente`);

    // 3) rating: clase confirmada dentro de las 48h + coach en el roster.
    const coachId = await createStaffUser(app, {
      email: "coach-p05@test.com",
      password: "coachpass123",
      firstName: "Coach",
      lastName: "P05",
      role: "coach",
      branchId: 1,
    });
    const [activity] = await app.db
      .insert(schema.activities)
      .values({ name: "Calistenia P05", isActive: true })
      .$returningId();
    const sessionDate = classDaysAgo(0);
    const dow = isoDow(sessionDate);
    const [sched] = await app.db
      .insert(schema.schedules)
      .values({
        branchId: 1,
        activityId: activity.id,
        dayOfWeek: dow,
        startTime: "09:00",
        endTime: "10:00",
        isActive: true,
      })
      .$returningId();
    await app.db.insert(schema.attendance).values({
      memberId: member.id,
      branchId: 1,
      scheduleId: sched.id,
      sessionDate,
      status: "confirmado",
      source: "qr",
      checkedInAt: new Date(),
    });
    const rosterRes = await app.inject({
      method: "POST",
      url: "/api/admin/ratings/roster",
      headers: { authorization: `Bearer ${templeAdminToken}` },
      payload: {
        branchId: 1,
        weekStartDate: isoMonday(sessionDate),
        dayOfWeek: dow,
        slot: "morning",
        coachId,
      },
    });
    expect(rosterRes.statusCode, rosterRes.body).toBe(204);

    // 4) improvement: nada sometido en los últimos 30 días -> shouldPrompt true por default.

    // Escalón 1: plan_expiry le gana a todo.
    const res1 = await getComo(app, "/me/prompt", member.token);
    expect(res1.statusCode, res1.body).toBe(200);
    const body1 = JSON.parse(res1.body) as PromptBody;
    expect(body1.prompt?.kind).toBe("plan_expiry");
    expect(body1.prompt?.daysRemaining).toBe(2);
    const planExpiryAvisoId = body1.prompt!.aviso.id;

    // Registrar "shown" hoy saca a plan_expiry de carrera (frequencyDays: 1, D-08 diaria).
    const eventRes = await postComo(app, `/me/avisos/${planExpiryAvisoId}/event`, member.token, {
      type: "shown",
    });
    expect(eventRes.statusCode, eventRes.body).toBe(200);

    // Escalón 2: cae al aviso vigente.
    const res2 = await getComo(app, "/me/prompt", member.token);
    const body2 = JSON.parse(res2.body) as PromptBody;
    expect(body2.prompt?.kind).toBe("aviso");
    expect(body2.prompt?.aviso.id).toBe(avisoVigenteId);

    // Pausar el aviso vigente -> cae a rating.
    const pauseRes = await app.inject({
      method: "PUT",
      url: `${BASE}/admin/avisos/${avisoVigenteId}`,
      headers: { authorization: `Bearer ${templeAdminToken}` },
      payload: { status: "paused" },
    });
    expect(pauseRes.statusCode, pauseRes.body).toBe(200);

    const res3 = await getComo(app, "/me/prompt", member.token);
    const body3 = JSON.parse(res3.body) as PromptBody;
    expect(body3.prompt?.kind).toBe("rating");
    expect(body3.prompt?.pending?.scheduleId).toBe(sched.id);

    // Enviar la calificación real -> ya no hay clase pendiente (D-P2 one-shot), cae a improvement.
    const submitRes = await app.inject({
      method: "POST",
      url: "/api/members/ratings",
      headers: { authorization: `Bearer ${member.token}` },
      payload: { sessionDate, scheduleId: sched.id, stars: 5, classStars: 5 },
    });
    expect(submitRes.statusCode, submitRes.body).toBe(201);

    const res4 = await getComo(app, "/me/prompt", member.token);
    const body4 = JSON.parse(res4.body) as PromptBody;
    expect(body4.prompt?.kind).toBe("improvement");

    // Enviar una propuesta -> silencio de 30 días (D-09), ya no queda nada: null.
    const proposalRes = await app.inject({
      method: "POST",
      url: "/api/members/improvement-proposals",
      headers: { authorization: `Bearer ${member.token}` },
      payload: { proposal: "Más clases de movilidad por favor" },
    });
    expect(proposalRes.statusCode, proposalRes.body).toBe(201);

    const res5 = await getComo(app, "/me/prompt", member.token);
    const body5 = JSON.parse(res5.body) as PromptBody;
    expect(body5.prompt).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (2) Frecuencia — D-11
// ═══════════════════════════════════════════════════════════════════════════

describe("frecuencia — GET /api/communications/me/prompt (D-11)", () => {
  it("every_n_days: no vuelve al día siguiente y sí al octavo", async () => {
    const member = await createTestMember(app, { branchId: 1 });
    const avisoId = await crearAvisoCustom(app, `${MARCA} Frecuencia 7 días`, {
      frequencyType: "every_n_days",
      frequencyDays: 7,
    });

    const res1 = await getComo(app, "/me/prompt", member.token);
    const body1 = JSON.parse(res1.body) as PromptBody;
    expect(body1.prompt?.aviso.id).toBe(avisoId);

    const shownRes = await postComo(app, `/me/avisos/${avisoId}/event`, member.token, {
      type: "shown",
    });
    expect(shownRes.statusCode, shownRes.body).toBe(200);

    // Al día siguiente (elapsed ~0 < 7 días) no debería volver a ganar.
    const res2 = await getComo(app, "/me/prompt", member.token);
    const body2 = JSON.parse(res2.body) as PromptBody;
    expect(body2.prompt?.kind).not.toBe("aviso");

    // Manipular last_at a 8 días atrás -> vuelve a ganar.
    const ochoDiasAtras = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await app.db
      .update(schema.avisoEvents)
      .set({ lastAt: ochoDiasAtras })
      .where(
        and(
          tenantWhere(schema.avisoEvents, CTX_TEMPLO),
          eq(schema.avisoEvents.avisoId, avisoId),
          eq(schema.avisoEvents.userId, member.id),
          eq(schema.avisoEvents.eventType, "shown"),
        ),
      );

    const res3 = await getComo(app, "/me/prompt", member.token);
    const body3 = JSON.parse(res3.body) as PromptBody;
    expect(body3.prompt?.aviso.id).toBe(avisoId);
  });

  it("once: no vuelve nunca, aunque haya pasado mucho tiempo", async () => {
    const member = await createTestMember(app, { branchId: 1 });
    const avisoId = await crearAvisoCustom(app, `${MARCA} Frecuencia once`, {
      frequencyType: "once",
    });

    const res1 = await getComo(app, "/me/prompt", member.token);
    const body1 = JSON.parse(res1.body) as PromptBody;
    expect(body1.prompt?.aviso.id).toBe(avisoId);

    await postComo(app, `/me/avisos/${avisoId}/event`, member.token, { type: "shown" });

    const res2 = await getComo(app, "/me/prompt", member.token);
    const body2 = JSON.parse(res2.body) as PromptBody;
    expect(body2.prompt?.kind).not.toBe("aviso");

    const unAnioAtras = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    await app.db
      .update(schema.avisoEvents)
      .set({ lastAt: unAnioAtras })
      .where(
        and(
          tenantWhere(schema.avisoEvents, CTX_TEMPLO),
          eq(schema.avisoEvents.avisoId, avisoId),
          eq(schema.avisoEvents.userId, member.id),
          eq(schema.avisoEvents.eventType, "shown"),
        ),
      );

    const res3 = await getComo(app, "/me/prompt", member.token);
    const body3 = JSON.parse(res3.body) as PromptBody;
    expect(body3.prompt?.kind).not.toBe("aviso");
  });

  it("every_open: vuelve siempre, incluso mostrado hace un instante", async () => {
    const member = await createTestMember(app, { branchId: 1 });
    const avisoId = await crearAvisoCustom(app, `${MARCA} Frecuencia every_open`, {
      frequencyType: "every_open",
    });

    const res1 = await getComo(app, "/me/prompt", member.token);
    const body1 = JSON.parse(res1.body) as PromptBody;
    expect(body1.prompt?.aviso.id).toBe(avisoId);

    await postComo(app, `/me/avisos/${avisoId}/event`, member.token, { type: "shown" });

    const res2 = await getComo(app, "/me/prompt", member.token);
    const body2 = JSON.parse(res2.body) as PromptBody;
    expect(body2.prompt?.aviso.id).toBe(avisoId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (3) Alcance — D-13
// ═══════════════════════════════════════════════════════════════════════════

describe("alcance — GET /api/communications/me/prompt (D-13)", () => {
  it("scopeBranchIds: solo le llega al socio de la sede incluida", async () => {
    const memberAr = await createTestMember(app, { branchId: 1 });
    const memberEs = await createTestMember(app, { branchId: esBranchId });
    const avisoId = await crearAvisoCustom(app, `${MARCA} Solo sede ES`, {
      scopeBranchIds: [esBranchId],
    });

    const resAr = await getComo(app, "/me/prompt", memberAr.token);
    const bodyAr = JSON.parse(resAr.body) as PromptBody;
    expect(bodyAr.prompt?.aviso.id).not.toBe(avisoId);

    const resEs = await getComo(app, "/me/prompt", memberEs.token);
    const bodyEs = JSON.parse(resEs.body) as PromptBody;
    expect(bodyEs.prompt?.aviso.id).toBe(avisoId);
  });

  it("scopeCountries: solo le llega al socio de una sede de ese país", async () => {
    const memberAr = await createTestMember(app, { branchId: 1 });
    const memberEs = await createTestMember(app, { branchId: esBranchId });
    const avisoId = await crearAvisoCustom(app, `${MARCA} Solo país ES`, {
      scopeCountries: ["ES"],
    });

    const resAr = await getComo(app, "/me/prompt", memberAr.token);
    const bodyAr = JSON.parse(resAr.body) as PromptBody;
    expect(bodyAr.prompt?.aviso.id).not.toBe(avisoId);

    const resEs = await getComo(app, "/me/prompt", memberEs.token);
    const bodyEs = JSON.parse(resEs.body) as PromptBody;
    expect(bodyEs.prompt?.aviso.id).toBe(avisoId);
  });

  it("scopeSegments: solo le llega al socio con ese segmento de comportamiento", async () => {
    const memberOptima = await createTestMember(app, { branchId: 1 });
    const memberSinSegmento = await createTestMember(app, { branchId: 1 });
    await app.db.insert(schema.memberProfiles).values(
      tenantValues(CTX_TEMPLO, { userId: memberOptima.id, segment: "optima" as const }),
    );
    const avisoId = await crearAvisoCustom(app, `${MARCA} Solo óptima`, {
      scopeSegments: ["optima"],
    });

    const resSinSegmento = await getComo(app, "/me/prompt", memberSinSegmento.token);
    const bodySinSegmento = JSON.parse(resSinSegmento.body) as PromptBody;
    expect(bodySinSegmento.prompt?.aviso.id).not.toBe(avisoId);

    const resOptima = await getComo(app, "/me/prompt", memberOptima.token);
    const bodyOptima = JSON.parse(resOptima.body) as PromptBody;
    expect(bodyOptima.prompt?.aviso.id).toBe(avisoId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (4) Vigencia — D-14
// ═══════════════════════════════════════════════════════════════════════════

describe("vigencia — GET /api/communications/me/prompt (D-14)", () => {
  it("fuera de startsOn/endsOn no se muestra; dentro de rango sí", async () => {
    const member = await createTestMember(app, { branchId: 1 });
    const avisoId = await crearAvisoCustom(app, `${MARCA} Vigencia`, {
      startsOn: arDateOffset(1), // empieza mañana
    });

    const resFutura = await getComo(app, "/me/prompt", member.token);
    const bodyFutura = JSON.parse(resFutura.body) as PromptBody;
    expect(bodyFutura.prompt?.aviso.id).not.toBe(avisoId);

    await app.db
      .update(schema.avisos)
      .set({ startsOn: arDateOffset(0) })
      .where(and(tenantWhere(schema.avisos, CTX_TEMPLO), eq(schema.avisos.id, avisoId)));
    const resVigente = await getComo(app, "/me/prompt", member.token);
    const bodyVigente = JSON.parse(resVigente.body) as PromptBody;
    expect(bodyVigente.prompt?.aviso.id).toBe(avisoId);

    await app.db
      .update(schema.avisos)
      .set({ startsOn: null, endsOn: arDateOffset(-1) })
      .where(and(tenantWhere(schema.avisos, CTX_TEMPLO), eq(schema.avisos.id, avisoId)));
    const resVencida = await getComo(app, "/me/prompt", member.token);
    const bodyVencida = JSON.parse(resVencida.body) as PromptBody;
    expect(bodyVencida.prompt?.aviso.id).not.toBe(avisoId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (5) Eventos — D-11
// ═══════════════════════════════════════════════════════════════════════════

describe("eventos — POST /api/communications/me/avisos/:id/event (D-11)", () => {
  it("shown dos veces deja UNA fila con event_count=2; clicked de dos socios deja dos filas", async () => {
    const memberA = await createTestMember(app, { branchId: 1 });
    const memberB = await createTestMember(app, { branchId: 1 });
    const avisoId = await crearAvisoCustom(app, `${MARCA} Aviso eventos`);

    const r1 = await postComo(app, `/me/avisos/${avisoId}/event`, memberA.token, {
      type: "shown",
    });
    expect(r1.statusCode, r1.body).toBe(200);
    const r2 = await postComo(app, `/me/avisos/${avisoId}/event`, memberA.token, {
      type: "shown",
    });
    expect(r2.statusCode, r2.body).toBe(200);

    const shownRows = await app.db
      .select({ eventCount: schema.avisoEvents.eventCount })
      .from(schema.avisoEvents)
      .where(
        and(
          tenantWhere(schema.avisoEvents, CTX_TEMPLO),
          eq(schema.avisoEvents.avisoId, avisoId),
          eq(schema.avisoEvents.userId, memberA.id),
          eq(schema.avisoEvents.eventType, "shown"),
        ),
      );
    expect(shownRows).toHaveLength(1);
    expect(shownRows[0]?.eventCount).toBe(2);

    const c1 = await postComo(app, `/me/avisos/${avisoId}/event`, memberA.token, {
      type: "clicked",
    });
    expect(c1.statusCode, c1.body).toBe(200);
    const c2 = await postComo(app, `/me/avisos/${avisoId}/event`, memberB.token, {
      type: "clicked",
    });
    expect(c2.statusCode, c2.body).toBe(200);

    const clickedRows = await app.db
      .select({ userId: schema.avisoEvents.userId })
      .from(schema.avisoEvents)
      .where(
        and(
          tenantWhere(schema.avisoEvents, CTX_TEMPLO),
          eq(schema.avisoEvents.avisoId, avisoId),
          eq(schema.avisoEvents.eventType, "clicked"),
        ),
      );
    expect(clickedRows.map((r) => r.userId).sort((a, b) => a - b)).toEqual(
      [memberA.id, memberB.id].sort((a, b) => a - b),
    );
  });

  it("un id de aviso inexistente da 404", async () => {
    const member = await createTestMember(app, { branchId: 1 });
    const res = await postComo(app, "/me/avisos/999999999/event", member.token, {
      type: "shown",
    });
    expect(res.statusCode, res.body).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (6) Config — GET /api/communications/me/config (D-20)
// ═══════════════════════════════════════════════════════════════════════════

describe("config — GET /api/communications/me/config (D-20)", () => {
  it("devuelve el número del país de la sede del socio y null si el tenant no lo cargó", async () => {
    const memberAr = await createTestMember(app, { branchId: 1 });
    const memberEs = await createTestMember(app, { branchId: esBranchId });

    const putRes = await app.inject({
      method: "PUT",
      url: `${BASE}/admin/sales-number`,
      headers: { authorization: `Bearer ${templeAdminToken}` },
      payload: { AR: "5491122334455" },
    });
    expect(putRes.statusCode, putRes.body).toBe(200);

    const resAr = await getComo(app, "/me/config", memberAr.token);
    expect(resAr.statusCode, resAr.body).toBe(200);
    const bodyAr = JSON.parse(resAr.body) as {
      salesWhatsappNumber: string | null;
      defaultWhatsappText: string;
    };
    expect(bodyAr.salesWhatsappNumber).toBe("5491122334455");
    expect(bodyAr.defaultWhatsappText).toBe(DEFAULT_WHATSAPP_TEXT);

    const resEs = await getComo(app, "/me/config", memberEs.token);
    expect(resEs.statusCode, resEs.body).toBe(200);
    const bodyEs = JSON.parse(resEs.body) as { salesWhatsappNumber: string | null };
    expect(bodyEs.salesWhatsappNumber).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (7) Tarjetas — GET /api/communications/me/tarjetas (D-15b)
// ═══════════════════════════════════════════════════════════════════════════

describe("tarjetas — GET /api/communications/me/tarjetas (D-15b)", () => {
  it("devuelve las 4 tarjetas de sistema más una libre, en orden de sortOrder", async () => {
    const member = await createTestMember(app, { branchId: 1 });
    const freeId = await crearAvisoCustom(app, `${MARCA} Tarjeta libre`, {
      placement: "tarjeta",
      frequencyType: "every_open",
      sortOrder: 99,
    });

    const res = await getComo(app, "/me/tarjetas", member.token);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      tarjetas: Array<{ id: number; title: string; code: string | null }>;
    };
    expect(body.tarjetas).toHaveLength(5);
    expect(body.tarjetas[body.tarjetas.length - 1]?.id).toBe(freeId);
    const idsSistema = body.tarjetas.slice(0, 4).map((t) => t.id);
    expect(new Set(idsSistema).size).toBe(4);
    expect(idsSistema).not.toContain(freeId);
  });

  it("expone `code` de sistema en las 4 fijas y `code: null` en la libre (plan 193-15)", async () => {
    const member = await createTestMember(app, { branchId: 1 });
    const freeId = await crearAvisoCustom(app, `${MARCA} Tarjeta libre code`, {
      placement: "tarjeta",
      frequencyType: "every_open",
      sortOrder: 99,
    });

    const res = await getComo(app, "/me/tarjetas", member.token);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      tarjetas: Array<{ id: number; code: string | null }>;
    };
    const codesSistema = body.tarjetas.filter((t) => t.id !== freeId).map((t) => t.code);
    expect(codesSistema.sort()).toEqual(
      ["card_improvement", "card_program", "card_referral", "card_upsell"].sort(),
    );
    const libre = body.tarjetas.find((t) => t.id === freeId);
    expect(libre?.code ?? null).toBeNull();
  });
});
