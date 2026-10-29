/**
 * Fase 158 Plan 02 — Task 3: notificación de "vínculo activado" (VIS-02).
 *
 * Al flippear un vínculo pending→qualified por el primer pago real del referido
 * (pricePaid>0), se encola UNA notificación `referral_link_activated` AL
 * REFERIDOR con el nombre del referido interpolado (D-31). El referido NO recibe
 * push; un re-cobro del mismo socio no vuelve a notificar (el flip ya ocurrió,
 * qualifyFirstPayment devuelve null). Best-effort (D-33): si la notificación se
 * skippea (referidor sin device token → queueNotification devuelve -1) o falla,
 * el cobro igual se completa sin error.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import {
  createPlan,
  createMember,
  assignPlan,
} from "../subscriptions/_helpers";
import {
  createActiveSub,
  createMembershipPlan,
  fixtureCtx,
  type InvitationsFixtureCtx,
} from "../invitations/_helpers";
import { NotificationService } from "../../src/modules/notifications/service";
import type { TenantContext } from "../../src/modules/shared/tenant";

// T-175-03: `seedTemplates` ahora exige `ctx` real (siembra por tenant).
const CTX: TenantContext = { tenantId: 1 };

let app: FastifyInstance;
let adminToken: string;
let fixtures: InvitationsFixtureCtx;

beforeAll(async () => {
  app = await createTestApp();
  fixtures = fixtureCtx(app);
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  // Local siembra default_amount=50 (stale): fijamos 10/40 explícito.
  await app.db.execute(
    sql`INSERT INTO aura_config (aura_config_source_type, default_amount)
        VALUES ('referral', 10)
        ON DUPLICATE KEY UPDATE default_amount = 10`,
  );
  await app.db.execute(
    sql`INSERT INTO system_settings (setting_key, setting_value)
        VALUES ('referral.max_percent_cap', '40')
        ON DUPLICATE KEY UPDATE setting_value = '40'`,
  );
  // El template referral_link_activated debe existir para poder encolar.
  await new NotificationService(app.db, app.log).seedTemplates(CTX);
});

/** Crea el vínculo referrer→referred con el status dado (pending por defecto). */
async function link(
  referrerId: number,
  referredId: number,
  status: "pending" | "qualified" = "pending",
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel)
        VALUES (${CTX.tenantId}, ${referrerId}, ${referredId}, ${status}, 'assisted')`,
  );
}

/**
 * F3: el aviso solo sale si el referidor tiene membresía vigente hoy (la misma
 * regla que D-10d). Le da una membresía real (no `is_trial`) con 20 días por delante.
 */
async function giveMembership(userId: number): Promise<void> {
  const plan = await createMembershipPlan(fixtures);
  await createActiveSub(fixtures, { userId, planId: plan.id });
}

/** Registra un device token para el usuario (sin él, queueNotification skippea -1). */
async function giveDeviceToken(userId: number): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO device_tokens (tenant_id, user_id, token, device_platform)
        VALUES (${CTX.tenantId}, ${userId}, ${`tok-${userId}-${Date.now()}`}, 'android')`,
  );
}

/** Cuenta las notificaciones encoladas para un usuario, devolviendo sus bodies. */
async function readNotifications(
  userId: number,
): Promise<Array<{ body: string; template_key: string | null }>> {
  const rows = await app.db.execute(
    sql`SELECT pn.body AS body, t.template_key AS template_key
        FROM pending_notifications pn
        LEFT JOIN notification_templates t ON t.id = pn.template_id
        WHERE pn.user_id = ${userId} AND pn.tenant_id = ${CTX.tenantId}`,
  );
  return rows[0] as Array<{ body: string; template_key: string | null }>;
}

// 194-15 D-10b: el flip del vínculo (y su aviso) exige el flag del plan.
describe("Referral activation notification on first payment", () => {
  it("encola UNA notificación al referidor con el nombre del referido, ninguna al referido", async () => {
    const plan = await createPlan(app, adminToken, {
      allowsInvitationDiscount: true,
    });
    const referrer = await createMember(app, {
      email: "an-r@test.com",
      firstName: "Referidor",
    });
    const referred = await createMember(app, {
      email: "an-d@test.com",
      firstName: "Nacho",
    });
    await link(referrer.id, referred.id, "pending");
    await giveMembership(referrer.id);
    await giveDeviceToken(referrer.id);

    const res = await assignPlan(app, adminToken, referred.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);

    const referrerNotifs = await readNotifications(referrer.id);
    expect(referrerNotifs).toHaveLength(1);
    expect(referrerNotifs[0].template_key).toBe("referral_link_activated");
    expect(referrerNotifs[0].body).toContain("Nacho");
    // Fase 194 D-26: el bodyOverride habla de invitaciones, igual al seed de 0261.
    expect(referrerNotifs[0].body).toBe(
      "Nacho pagó su primer plan. Ya tenés tu descuento por invitación activo.",
    );

    // El referido NO recibe push (D-31).
    const referredNotifs = await readNotifications(referred.id);
    expect(referredNotifs).toHaveLength(0);
  });

  it("un cobro sobre un vínculo YA qualified (re-cobro) NO vuelve a notificar", async () => {
    const plan = await createPlan(app, adminToken, {
      allowsInvitationDiscount: true,
    });
    const referrer = await createMember(app, {
      email: "an2-r@test.com",
      firstName: "Referidor",
    });
    const referred = await createMember(app, {
      email: "an2-d@test.com",
      firstName: "Nacho",
    });
    // El vínculo ya está qualified: cualquier cobro posterior (re-cobro) NO
    // encuentra un pending que flippear → qualifyFirstPayment devuelve null →
    // el hook no encola. Así se prueba que la notificación no se duplica.
    await link(referrer.id, referred.id, "qualified");
    await giveMembership(referrer.id);
    await giveDeviceToken(referrer.id);

    const res = await assignPlan(app, adminToken, referred.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);

    expect(await readNotifications(referrer.id)).toHaveLength(0);
  });

  it("best-effort: sin device token del referidor el cobro se completa igual y no hay fila", async () => {
    const plan = await createPlan(app, adminToken, {
      allowsInvitationDiscount: true,
    });
    const referrer = await createMember(app, {
      email: "an3-r@test.com",
      firstName: "Referidor",
    });
    const referred = await createMember(app, {
      email: "an3-d@test.com",
      firstName: "Nacho",
    });
    await link(referrer.id, referred.id, "pending");
    await giveMembership(referrer.id);
    // Referidor SIN device token → queueNotification devuelve -1 (skip).

    const res = await assignPlan(app, adminToken, referred.id, {
      planId: plan.id,
    });
    // El cobro se completa sin error pese al skip de la notificación (D-33).
    expect(res.statusCode).toBe(201);

    // El flip igual ocurrió (el vínculo cualificó); solo la notificación se saltó.
    const l = await app.db.execute(
      sql`/* tenant-safe: lectura por referred_id, UNIQUE (D-14/REF-04) */ SELECT status FROM referrals WHERE referred_id = ${referred.id} LIMIT 1`,
    );
    expect((l[0] as Array<{ status: string }>)[0]?.status).toBe("qualified");

    expect(await readNotifications(referrer.id)).toHaveLength(0);
  });

  it("F3: referidor SIN membresía vigente: el vínculo legacy igual cualifica pero no se le encola el aviso", async () => {
    const plan = await createPlan(app, adminToken, {
      allowsInvitationDiscount: true,
    });
    const referrer = await createMember(app, {
      email: "an4-r@test.com",
      firstName: "Referidor",
    });
    const referred = await createMember(app, {
      email: "an4-d@test.com",
      firstName: "Nacho",
    });
    await link(referrer.id, referred.id, "pending");
    // Con device token (el aviso se podría entregar), pero sin ninguna membresía.
    await giveDeviceToken(referrer.id);

    const res = await assignPlan(app, adminToken, referred.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);

    const l = await app.db.execute(
      sql`/* tenant-safe: lectura por referred_id, UNIQUE (D-14/REF-04) */ SELECT status FROM referrals WHERE referred_id = ${referred.id} LIMIT 1`,
    );
    expect((l[0] as unknown as Array<{ status: string }>)[0]?.status).toBe(
      "qualified",
    );
    expect(await readNotifications(referrer.id)).toHaveLength(0);
    expect(await readNotifications(referred.id)).toHaveLength(0);
  });
});
