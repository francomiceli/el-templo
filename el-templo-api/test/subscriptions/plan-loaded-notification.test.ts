/**
 * Planes — aviso al socio cuando el staff le carga una membresía
 * (`notifyMemberPlanLoaded`, template `plan_loaded`, columnas
 * `subscriptions.member_notified_at` / `member_seen_at`).
 *
 * Los call sites que avisan son SOLO los de carga manual por staff: admin
 * assign, admin change-plan (inmediato y after_current), admin renew y los
 * cobros renew / alta. El alta de socio no avisa.
 *
 * CRITICAL SETUP (igual que notification-plan-renewal.test.ts):
 * `queueNotification` no encola si falta la fila del template ni si el socio no
 * tiene device token. Los tests no bootean el cron (no hay auto-seed), así que
 * `seedTemplates` corre en cada beforeEach DESPUÉS de `cleanAllTestData`.
 *
 * Fechas relativas a hoy (año actual), nunca fijas: los formateadores se
 * prueban con años derivados del año en curso.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { NotificationService } from "../../src/modules/notifications/service";
import {
  buildPlanLoadedBody,
  formatShortDateEs,
  notifyMemberPlanLoaded,
} from "../../src/modules/subscriptions/plan-loaded-notification";
import { todayInTz } from "../../src/modules/shared/date-utils";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
  ensureEfectivoCaja,
  getAuthToken,
  dateOffsetStr,
  todayStr,
} from "../helpers";
import { SUBSCRIPTIONS_URL, createPlan } from "./_helpers";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const AR_TIMEZONE = "America/Argentina/Buenos_Aires";
const COACH_LOAD_URL = "/api/admin/finance/coach-load";

const TITLE_LOADED = "Tu plan ya está cargado";
const TITLE_CHANGE = "Tu cambio de plan está cargado";

// ─── Formateadores puros ─────────────────────────────────────────────────────

describe("formatShortDateEs / buildPlanLoadedBody (puros)", () => {
  const year = Number(todayInTz(AR_TIMEZONE).split("-")[0]);
  const today = `${year}-10-28`;

  it("fecha corta en español, sin cero a la izquierda y sin año si es el año en curso", () => {
    expect(formatShortDateEs(`${year}-11-16`, today)).toBe("16 nov");
    expect(formatShortDateEs(`${year}-12-15`, today)).toBe("15 dic");
    expect(formatShortDateEs(`${year}-03-05`, today)).toBe("5 mar");
  });

  it("agrega el año SOLO si no es el año en curso (futuro o pasado)", () => {
    expect(formatShortDateEs(`${year + 1}-01-15`, today)).toBe(
      `15 ene ${year + 1}`,
    );
    expect(formatShortDateEs(`${year - 1}-12-30`, today)).toBe(
      `30 dic ${year - 1}`,
    );
  });

  it("los 12 meses tienen su abreviatura", () => {
    const meses = [
      "ene",
      "feb",
      "mar",
      "abr",
      "may",
      "jun",
      "jul",
      "ago",
      "sep",
      "oct",
      "nov",
      "dic",
    ];
    meses.forEach((mes, i) => {
      const mm = String(i + 1).padStart(2, "0");
      expect(formatShortDateEs(`${year}-${mm}-10`, today)).toBe(`10 ${mes}`);
    });
  });

  it("cuerpo con fin: del {inicio} al {fin}", () => {
    expect(
      buildPlanLoadedBody("Plan Full", `${year}-11-16`, `${year}-12-15`, today),
    ).toBe("Plan Full: del 16 nov al 15 dic. Tocá para verlo.");
  });

  it("cuerpo que cruza de año: el año va solo en la fecha que no es del año en curso", () => {
    expect(
      buildPlanLoadedBody(
        "Plan Full",
        `${year}-12-16`,
        `${year + 1}-01-15`,
        today,
      ),
    ).toBe(`Plan Full: del 16 dic al 15 ene ${year + 1}. Tocá para verlo.`);
  });

  it("cuerpo sin fecha de fin: desde el {inicio}", () => {
    expect(buildPlanLoadedBody("Plan Full", `${year}-11-16`, null, today)).toBe(
      "Plan Full: desde el 16 nov. Tocá para verlo.",
    );
  });
});

// ─── Integración ─────────────────────────────────────────────────────────────

describe("notifyMemberPlanLoaded — pelotita + push al cargar una membresía", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let planId: number;
  let planName: string;
  let planBigId: number;
  let planBigName: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await ensureEfectivoCaja(app, 1, "ARS");
    // queueNotification no-opea sin la fila del template: sembrar DESPUÉS del clean.
    await new NotificationService(app.db, app.log).seedTemplates(TEMPLO_CTX);
    planName = "Plan Cargado Basico";
    planBigName = "Plan Cargado Pro";
    const plan = await createPlan(app, adminToken, {
      name: planName,
      classesPerWeek: undefined,
      durationDays: 30,
      priceRegular: 8000,
      priceZero: 4000,
    });
    planId = plan.id;
    // Más caro que el básico: un cambio de plan no puede ser downgrade.
    const planBig = await createPlan(app, adminToken, {
      name: planBigName,
      classesPerWeek: undefined,
      durationDays: 30,
      priceRegular: 12000,
      priceZero: 6000,
    });
    planBigId = planBig.id;
  });

  // ── helpers ────────────────────────────────────────────────────────────────

  async function giveDeviceToken(userId: number): Promise<void> {
    await app.db.insert(schema.deviceTokens).values({
      tenantId: TENANT_TEMPLO,
      userId,
      token: `tok-${userId}-${Date.now()}`,
      platform: "android",
    });
  }

  interface PendingRow {
    templateKey: string;
    title: string;
    body: string;
    route: string | null;
    destinationSection: string | null;
  }

  async function pendingFor(userId: number): Promise<PendingRow[]> {
    const rows = await app.db
      .select({
        templateKey: schema.notificationTemplates.templateKey,
        title: schema.pendingNotifications.title,
        body: schema.pendingNotifications.body,
        route: schema.pendingNotifications.route,
        destinationSection: schema.pendingNotifications.destinationSection,
      })
      .from(schema.pendingNotifications)
      .innerJoin(
        schema.notificationTemplates,
        eq(
          schema.pendingNotifications.templateId,
          schema.notificationTemplates.id,
        ),
      )
      .where(
        and(
          eq(schema.pendingNotifications.userId, userId),
          eq(schema.pendingNotifications.tenantId, TENANT_TEMPLO),
        ),
      );
    return rows;
  }

  async function clearPending(userId: number): Promise<void> {
    await app.db
      .delete(schema.pendingNotifications)
      .where(
        and(
          eq(schema.pendingNotifications.userId, userId),
          eq(schema.pendingNotifications.tenantId, TENANT_TEMPLO),
        ),
      );
  }

  async function readMarks(
    subscriptionId: number,
  ): Promise<{ notified: boolean; seen: boolean }> {
    const [row] = await app.db
      .select({
        notifiedAt: schema.subscriptions.memberNotifiedAt,
        seenAt: schema.subscriptions.memberSeenAt,
      })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, subscriptionId),
        ),
      );
    return { notified: row?.notifiedAt != null, seen: row?.seenAt != null };
  }

  async function adminAssign(
    userId: number,
    overrides: Record<string, unknown> = {},
    plan: number = planId,
  ): Promise<{ id: number; startDate: string; endDate: string | null }> {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: plan,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        ...overrides,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    return JSON.parse(res.body) as {
      id: number;
      startDate: string;
      endDate: string | null;
    };
  }

  /** Cuerpo esperado, armado con el mismo formateador y el "hoy" de la ruta. */
  function expectedBody(
    name: string,
    sub: { startDate: string; endDate: string | null },
  ): string {
    return buildPlanLoadedBody(
      name,
      sub.startDate,
      sub.endDate,
      todayInTz(AR_TIMEZONE),
    );
  }

  // ── admin assign ───────────────────────────────────────────────────────────

  it("assign con fecha futura notifica: push plan_loaded con las fechas y la pelotita prendida", async () => {
    const member = await createTestMember(app);
    await giveDeviceToken(member.id);

    const sub = await adminAssign(member.id, { startDate: dateOffsetStr(10) });

    const pending = await pendingFor(member.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].templateKey).toBe("plan_loaded");
    expect(pending[0].title).toBe(TITLE_LOADED);
    expect(pending[0].body).toBe(expectedBody(planName, sub));
    expect(pending[0].body).toMatch(
      new RegExp(
        `^${planName}: del \\d{1,2} [a-z]{3}.* al \\d{1,2} [a-z]{3}.*\\. Tocá para verlo\\.$`,
      ),
    );
    expect(pending[0].route).toBe("/planes");
    // La push abre Planes (mi_plan), no el fallback Mi Templo.
    expect(pending[0].destinationSection).toBe("mi_plan");
    expect(await readMarks(sub.id)).toEqual({ notified: true, seen: false });
  });

  it("sin device token: no hay fila en pending_notifications pero member_notified_at SÍ se setea", async () => {
    const member = await createTestMember(app);

    const sub = await adminAssign(member.id);

    expect(await pendingFor(member.id)).toEqual([]);
    expect(await readMarks(sub.id)).toEqual({ notified: true, seen: false });
  });

  // ── admin renew ────────────────────────────────────────────────────────────

  it("renew anticipado por la ruta admin encola plan_loaded con las fechas de la sub NUEVA", async () => {
    const member = await createTestMember(app);
    await giveDeviceToken(member.id);
    const first = await adminAssign(member.id);
    await clearPending(member.id);

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });
    expect(res.statusCode, res.body).toBe(201);
    const renewed = JSON.parse(res.body) as {
      id: number;
      status: string;
      startDate: string;
      endDate: string | null;
    };
    expect(renewed.status).toBe("scheduled");
    expect(renewed.id).not.toBe(first.id);

    const pending = await pendingFor(member.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].templateKey).toBe("plan_loaded");
    expect(pending[0].title).toBe(TITLE_LOADED);
    expect(pending[0].body).toBe(expectedBody(planName, renewed));
    // La pelotita queda en la sub NUEVA, no en la que se renovó.
    expect(await readMarks(renewed.id)).toEqual({
      notified: true,
      seen: false,
    });
  });

  // ── admin change-plan ──────────────────────────────────────────────────────

  async function changePlan(
    userId: number,
    startMode?: "after_current",
  ): Promise<{ id: number; status: string }> {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: planBigId,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        ...(startMode ? { startMode } : {}),
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    return JSON.parse(res.body) as { id: number; status: string };
  }

  it("change-plan inmediato usa el título de cambio y marca la sub NUEVA", async () => {
    const member = await createTestMember(app);
    await giveDeviceToken(member.id);
    const first = await adminAssign(member.id);
    await clearPending(member.id);

    const changed = await changePlan(member.id);

    expect(changed.id).not.toBe(first.id);
    const pending = await pendingFor(member.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].templateKey).toBe("plan_loaded");
    expect(pending[0].title).toBe(TITLE_CHANGE);
    expect(pending[0].body.startsWith(`${planBigName}: `)).toBe(true);
    expect(await readMarks(changed.id)).toEqual({
      notified: true,
      seen: false,
    });
  });

  it("change-plan after_current (programado) también usa el título de cambio", async () => {
    const member = await createTestMember(app);
    await giveDeviceToken(member.id);
    await adminAssign(member.id);
    await clearPending(member.id);

    const changed = await changePlan(member.id, "after_current");

    expect(changed.status).toBe("scheduled");
    const pending = await pendingFor(member.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].title).toBe(TITLE_CHANGE);
    expect(pending[0].body.startsWith(`${planBigName}: `)).toBe(true);
    expect(await readMarks(changed.id)).toEqual({
      notified: true,
      seen: false,
    });
  });

  // ── alta de socio: NO notifica ─────────────────────────────────────────────

  it("el alta de socio (POST /admin/members con plan) NO marca la sub ni encola plan_loaded", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: `alta-sin-aviso-${Date.now()}@test.com`,
        firstName: "Alta",
        lastName: "SinAviso",
        phone: "+5491155550000",
        dni: `AL${Date.now() % 10000000}`,
        branchId: 1,
        planId,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const member = JSON.parse(res.body) as { id: number };

    const subs = await app.db
      .select({
        id: schema.subscriptions.id,
        notifiedAt: schema.subscriptions.memberNotifiedAt,
        seenAt: schema.subscriptions.memberSeenAt,
      })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.userId, member.id),
        ),
      );
    expect(subs).toHaveLength(1);
    expect(subs[0].notifiedAt).toBeNull();
    expect(subs[0].seenAt).toBeNull();
    expect(
      (await pendingFor(member.id)).filter(
        (p) => p.templateKey === "plan_loaded",
      ),
    ).toEqual([]);
  });

  // ── cobros (coach-load) ────────────────────────────────────────────────────

  it("cobros renew (pay-plan sobre una sub vencida) avisa con la sub nueva", async () => {
    const member = await createTestMember(app);
    await giveDeviceToken(member.id);
    const [oldSub] = await app.db
      .insert(schema.subscriptions)
      .values({
        tenantId: TENANT_TEMPLO,
        userId: member.id,
        planId,
        branchId: 1,
        status: "active",
        startDate: dateOffsetStr(-31),
        endDate: dateOffsetStr(-1),
        pricePaid: 8000,
        currency: "ARS",
        priceTypeApplied: "regular",
      })
      .$returningId();

    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId: member.id,
        paymentMethod: "cash",
        idempotencyKey: `plan-loaded-renew-${Date.now()}`,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = JSON.parse(res.body) as {
      subscription: { id: number; startDate: string; endDate: string | null };
    };
    expect(body.subscription.id).not.toBe(oldSub.id);

    const pending = await pendingFor(member.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].templateKey).toBe("plan_loaded");
    expect(pending[0].title).toBe(TITLE_LOADED);
    expect(pending[0].body).toBe(expectedBody(planName, body.subscription));
    expect(await readMarks(body.subscription.id)).toEqual({
      notified: true,
      seen: false,
    });
    expect((await readMarks(oldSub.id)).notified).toBe(false);
  });

  it("cobros alta (con userId de un socio existente) avisa; el replay idempotente no vuelve a avisar", async () => {
    const member = await createTestMember(app);
    await giveDeviceToken(member.id);
    const idempotencyKey = `plan-loaded-alta-${Date.now()}`;
    const payload = {
      userId: member.id,
      branchId: 1,
      planId,
      paymentMethod: "cash",
      idempotencyKey,
    };

    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/alta`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = JSON.parse(res.body) as {
      subscription: { id: number; startDate: string; endDate: string | null };
    };

    const pending = await pendingFor(member.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].templateKey).toBe("plan_loaded");
    expect(pending[0].body).toBe(expectedBody(planName, body.subscription));
    expect(await readMarks(body.subscription.id)).toEqual({
      notified: true,
      seen: false,
    });

    // Doble submit con la misma key: 200 no-op, sin segundo aviso.
    const replay = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/alta`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(await pendingFor(member.id)).toHaveLength(1);
  });

  // ── el helper en sí ────────────────────────────────────────────────────────

  it("re-avisar una sub ya vista vuelve a prender la pelotita (seen vuelve a NULL)", async () => {
    const member = await createTestMember(app);
    const sub = await adminAssign(member.id);
    await app.db
      .update(schema.subscriptions)
      .set({ memberSeenAt: new Date() })
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, sub.id),
        ),
      );
    expect(await readMarks(sub.id)).toEqual({ notified: true, seen: true });

    await notifyMemberPlanLoaded(app.db, app.log, TEMPLO_CTX, sub.id, "loaded");

    expect(await readMarks(sub.id)).toEqual({ notified: true, seen: false });
  });

  it("es best-effort: una sub inexistente no lanza ni escribe nada", async () => {
    await expect(
      notifyMemberPlanLoaded(app.db, app.log, TEMPLO_CTX, 2147483000, "loaded"),
    ).resolves.toBeUndefined();
  });

  it("es best-effort y con tenant: un ctx de otro gimnasio no toca la sub ni notifica", async () => {
    const member = await createTestMember(app);
    await giveDeviceToken(member.id);
    const sub = await adminAssign(member.id);
    await clearPending(member.id);
    await app.db
      .update(schema.subscriptions)
      .set({ memberNotifiedAt: null })
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, sub.id),
        ),
      );

    await notifyMemberPlanLoaded(
      app.db,
      app.log,
      { tenantId: TENANT_TEMPLO + 1000 },
      sub.id,
      "loaded",
    );

    expect(await readMarks(sub.id)).toEqual({ notified: false, seen: false });
    expect(await pendingFor(member.id)).toEqual([]);
  });

  it("si la push no se puede encolar (template sin sembrar), la pelotita igual se prende y no lanza", async () => {
    const member = await createTestMember(app);
    await giveDeviceToken(member.id);
    const sub = await adminAssign(member.id);
    await clearPending(member.id);
    // Sin template: queueNotification devuelve -1 en vez de encolar.
    await app.db
      .delete(schema.notificationTemplates)
      .where(
        and(
          tenantWhere(schema.notificationTemplates, TEMPLO_CTX),
          eq(schema.notificationTemplates.templateKey, "plan_loaded"),
        ),
      );
    await app.db
      .update(schema.subscriptions)
      .set({ memberNotifiedAt: null })
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, sub.id),
        ),
      );

    await expect(
      notifyMemberPlanLoaded(app.db, app.log, TEMPLO_CTX, sub.id, "loaded"),
    ).resolves.toBeUndefined();

    expect(await pendingFor(member.id)).toEqual([]);
    expect(await readMarks(sub.id)).toEqual({ notified: true, seen: false });
  });

  // ── pelotita de punta a punta ──────────────────────────────────────────────

  it("tras la carga la sub queda isNew y plan-status.hasUnseenPlanUpdate=true; tras POST seen ambas en false", async () => {
    const member = await createTestMember(app);
    const sub = await adminAssign(member.id);

    const summary = async (): Promise<{
      current: { id: number; isNew: boolean } | null;
      hasUnseen: boolean;
    }> => {
      const res = await app.inject({
        method: "GET",
        url: "/api/members/subscription/me/plan-summary",
        headers: { authorization: `Bearer ${member.token}` },
      });
      return JSON.parse(res.body);
    };
    const planStatusUnseen = async (): Promise<boolean> => {
      const res = await app.inject({
        method: "GET",
        url: "/api/members/subscription/me/plan-status",
        headers: { authorization: `Bearer ${member.token}` },
      });
      return JSON.parse(res.body).hasUnseenPlanUpdate;
    };

    const antes = await summary();
    expect(antes.current?.id).toBe(sub.id);
    expect(antes.current?.isNew).toBe(true);
    expect(antes.hasUnseen).toBe(true);
    expect(await planStatusUnseen()).toBe(true);

    const seen = await app.inject({
      method: "POST",
      url: "/api/members/subscription/me/plan-summary/seen",
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(seen.statusCode).toBe(200);
    expect(JSON.parse(seen.body)).toEqual({ updated: 1 });

    const despues = await summary();
    expect(despues.current?.isNew).toBe(false);
    expect(despues.hasUnseen).toBe(false);
    expect(await planStatusUnseen()).toBe(false);
  });
});
