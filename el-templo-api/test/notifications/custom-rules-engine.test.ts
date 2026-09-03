/**
 * Motor de reglas de notificaciones propias — `src/modules/notifications/rules.ts`
 * (pedido de Franco, 2026-09-03).
 *
 * Prueba `evaluateCustomRulesForTenant` contra MySQL real, un trigger a la
 * vez: candidatos positivos/negativos, alcance por sede/país, cadencia
 * (cooldown), regla pausada, y que borrar una plantilla de SISTEMA no rompe
 * el resto del pipeline de notificaciones (D-homogeneidad).
 *
 * Reloj pinneado (fake timers, mismo patrón que `jobs/tenure-milestones.test.ts`):
 * "hoy" en AR se deriva de NOW = 2026-06-15T15:00:00Z -> 2026-06-15.
 *
 * Fixtures por INSERT directo (no HTTP): control total sobre `status`,
 * `branchId`, `createdAt`, `subscriptions.endDate`, `attendance.sessionDate`
 * y `member_profiles.segment` — la única llamada HTTP es la creación del
 * plan (vía el helper compartido de subscriptions, más simple que replicar
 * las columnas de `subscription_plans` a mano).
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/notifications/custom-rules-engine.test.ts
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
import { and, eq, sql } from "drizzle-orm";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { NotificationService } from "../../src/modules/notifications/service";
import {
  evaluateCustomRulesForTenant,
  type RuleTriggerType,
} from "../../src/modules/notifications/rules";
import { runPlanRenewalWarnings } from "../../src/jobs/notification-cron";
import { createPlan } from "../subscriptions/_helpers";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const CTX = { tenantId: TENANT_TEMPLO };
// "Ahora" pinneado → hoy en AR (UTC-3) = 2026-06-15 (mismo NOW que
// jobs/tenure-milestones.test.ts, valor ya verificado en ese archivo).
const NOW = new Date("2026-06-15T15:00:00Z");
const TODAY = "2026-06-15";

type MemberSegment = "optima" | "regular" | "alerta" | "ausente";

let seq = 0;

describe("motor de reglas custom (notifications/rules.ts)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let branchAR: number;
  let branchES: number;
  let planId: number;

  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    seq += 1;

    const resAR = await app.db.insert(schema.branches).values({
      name: `RULES-AR-${seq}`,
      code: `RAR-${seq}`,
      country: "AR",
      timezone: "America/Argentina/Buenos_Aires",
    });
    branchAR = Number(resAR[0].insertId);

    const resES = await app.db.insert(schema.branches).values({
      name: `RULES-ES-${seq}`,
      code: `RES-${seq}`,
      country: "ES",
      timezone: "Europe/Madrid",
    });
    branchES = Number(resES[0].insertId);

    const plan = await createPlan(app, adminToken);
    planId = plan.id;
  });

  // ── Fixtures ────────────────────────────────────────────────────────────

  async function insertMember(opts: {
    branchId?: number;
    status?: "activo" | "inactivo" | "freemium";
    createdAt?: Date;
  }): Promise<number> {
    seq += 1;
    const res = await app.db.insert(schema.users).values({
      email: `rules-${seq}-${Date.now()}@test.com`,
      passwordHash: "x",
      firstName: "Regla",
      lastName: `Member ${seq}`,
      role: "member",
      status: opts.status ?? "activo",
      branchId: opts.branchId ?? branchAR,
      createdAt: opts.createdAt ?? NOW,
    });
    return Number(res[0].insertId);
  }

  async function giveDeviceToken(userId: number): Promise<void> {
    await app.db.insert(schema.deviceTokens).values({
      userId,
      token: `tok-${userId}-${Date.now()}`,
      platform: "android",
    });
  }

  async function insertSubscription(
    userId: number,
    branchId: number,
    status: "active" | "scheduled" | "cancelled" | "expired",
    endDateOffsetDays: number,
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId,
      branchId,
      status,
      startDate: "2026-01-01",
      endDate: dateOffset(endDateOffsetDays),
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  }

  async function insertAttendance(
    userId: number,
    branchId: number,
    sessionDateOffsetDays: number,
  ): Promise<void> {
    await app.db.insert(schema.attendance).values({
      memberId: userId,
      branchId,
      sessionDate: dateOffset(sessionDateOffsetDays),
    });
  }

  async function setSegment(
    userId: number,
    segment: MemberSegment,
  ): Promise<void> {
    await app.db.insert(schema.memberProfiles).values({
      userId,
      segment,
    });
  }

  /** Offset en días desde TODAY, formato YYYY-MM-DD (aritmética en UTC-noon, sin drift de DST). */
  function dateOffset(days: number): string {
    const d = new Date(TODAY + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split("T")[0];
  }

  async function insertCustomRule(opts: {
    triggerType: RuleTriggerType;
    triggerValue?: number | null;
    triggerSegment?: MemberSegment | null;
    scopeBranchIds?: number[] | null;
    scopeCountries?: string[] | null;
    cooldownDays?: number;
    isEnabled?: boolean;
  }): Promise<{ id: number; templateKey: string }> {
    seq += 1;
    const templateKey = `custom_test_${seq}`;
    const res = await app.db.insert(schema.notificationTemplates).values({
      tenantId: TENANT_TEMPLO,
      templateKey,
      kind: "custom",
      name: "Regla de prueba",
      category: "motivacion",
      title: "Título de prueba",
      body: "Cuerpo de prueba",
      route: "/mi-templo",
      destinationType: "app_section",
      destinationSection: "mi_templo",
      isEnabled: opts.isEnabled ?? true,
      triggerType: opts.triggerType,
      triggerValue: opts.triggerValue ?? null,
      triggerSegment: opts.triggerSegment ?? null,
      scopeBranchIds: opts.scopeBranchIds ?? null,
      scopeCountries: opts.scopeCountries ?? null,
      cooldownDays: opts.cooldownDays ?? 30,
    });
    return { id: Number(res[0].insertId), templateKey };
  }

  async function wasQueued(userId: number, templateId: number): Promise<boolean> {
    const rows = await app.db
      .select({ id: schema.pendingNotifications.id })
      .from(schema.pendingNotifications)
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX),
          eq(schema.pendingNotifications.userId, userId),
          eq(schema.pendingNotifications.templateId, templateId),
        ),
      );
    return rows.length > 0;
  }

  function newService(): NotificationService {
    return new NotificationService(app.db, app.log);
  }

  // ── Triggers ────────────────────────────────────────────────────────────

  it("plan_expires_in_days: encola a quien vence en N días, no a otro N, y suprime si ya renovó", async () => {
    const rule = await insertCustomRule({
      triggerType: "plan_expires_in_days",
      triggerValue: 5,
    });

    const positivo = await insertMember({});
    await giveDeviceToken(positivo);
    await insertSubscription(positivo, branchAR, "active", 5);

    const otroN = await insertMember({});
    await giveDeviceToken(otroN);
    await insertSubscription(otroN, branchAR, "active", 6);

    // Ya renovó: el vencimiento a los 5 días existe, pero una suscripción
    // "scheduled" adicional extiende la cobertura más allá del target — el
    // covered-until real ya no es +5, así que se suprime (mismo criterio
    // que runPlanRenewalWarnings, D-05).
    const yaRenovo = await insertMember({});
    await giveDeviceToken(yaRenovo);
    await insertSubscription(yaRenovo, branchAR, "active", 5);
    await insertSubscription(yaRenovo, branchAR, "scheduled", 35);

    const result = await evaluateCustomRulesForTenant(
      app.db,
      newService(),
      CTX,
      TODAY,
      app.log,
    );

    expect(result.rulesEvaluated).toBe(1);
    expect(await wasQueued(positivo, rule.id)).toBe(true);
    expect(await wasQueued(otroN, rule.id)).toBe(false);
    expect(await wasQueued(yaRenovo, rule.id)).toBe(false);
  });

  it("plan_expired_days_ago: encola a quien venció hace N días, no a quien ya tiene cobertura hoy", async () => {
    const rule = await insertCustomRule({
      triggerType: "plan_expired_days_ago",
      triggerValue: 3,
    });

    const positivo = await insertMember({});
    await giveDeviceToken(positivo);
    await insertSubscription(positivo, branchAR, "expired", -3);

    // Venció hace 3 días PERO ya renovó (tiene otra suscripción activa que
    // cubre hoy) -> se suprime.
    const yaRenovo = await insertMember({});
    await giveDeviceToken(yaRenovo);
    await insertSubscription(yaRenovo, branchAR, "expired", -3);
    await insertSubscription(yaRenovo, branchAR, "active", 10);

    const otroN = await insertMember({});
    await giveDeviceToken(otroN);
    await insertSubscription(otroN, branchAR, "expired", -4);

    // Canceló voluntariamente con end_date = hace 3 días: NO "venció", la
    // cerró alguien. Sin este filtro de estados se le mandaba "tu plan venció".
    const cancelo = await insertMember({});
    await giveDeviceToken(cancelo);
    await insertSubscription(cancelo, branchAR, "cancelled", -3);

    const result = await evaluateCustomRulesForTenant(
      app.db,
      newService(),
      CTX,
      TODAY,
      app.log,
    );

    expect(result.rulesEvaluated).toBe(1);
    expect(await wasQueued(positivo, rule.id)).toBe(true);
    expect(await wasQueued(yaRenovo, rule.id)).toBe(false);
    expect(await wasQueued(otroN, rule.id)).toBe(false);
    expect(await wasQueued(cancelo, rule.id)).toBe(false);
  });

  it("days_without_attendance: encola con suscripción activa hoy; no encola sin suscripción activa", async () => {
    const rule = await insertCustomRule({
      triggerType: "days_without_attendance",
      triggerValue: 7,
    });

    const positivo = await insertMember({});
    await giveDeviceToken(positivo);
    await insertAttendance(positivo, branchAR, -7);
    await insertSubscription(positivo, branchAR, "active", 20);

    // Última asistencia hace 7 días PERO sin suscripción activa hoy -> lo
    // cubre plan_expired_days_ago, no este trigger.
    const sinPlan = await insertMember({});
    await giveDeviceToken(sinPlan);
    await insertAttendance(sinPlan, branchAR, -7);

    const otroN = await insertMember({});
    await giveDeviceToken(otroN);
    await insertAttendance(otroN, branchAR, -8);
    await insertSubscription(otroN, branchAR, "active", 20);

    const result = await evaluateCustomRulesForTenant(
      app.db,
      newService(),
      CTX,
      TODAY,
      app.log,
    );

    expect(await wasQueued(positivo, rule.id)).toBe(true);
    expect(await wasQueued(sinPlan, rule.id)).toBe(false);
    expect(await wasQueued(otroN, rule.id)).toBe(false);
  });

  it("member_since_days: encola en el aniversario exacto", async () => {
    const rule = await insertCustomRule({
      triggerType: "member_since_days",
      triggerValue: 30,
    });

    const positivo = await insertMember({
      createdAt: new Date(dateOffset(-30) + "T12:00:00Z"),
    });
    await giveDeviceToken(positivo);

    const otroN = await insertMember({
      createdAt: new Date(dateOffset(-31) + "T12:00:00Z"),
    });
    await giveDeviceToken(otroN);

    const result = await evaluateCustomRulesForTenant(
      app.db,
      newService(),
      CTX,
      TODAY,
      app.log,
    );

    expect(await wasQueued(positivo, rule.id)).toBe(true);
    expect(await wasQueued(otroN, rule.id)).toBe(false);
  });

  it("segment_is: encola según member_profiles.segment", async () => {
    const rule = await insertCustomRule({
      triggerType: "segment_is",
      triggerSegment: "alerta",
    });

    const positivo = await insertMember({});
    await giveDeviceToken(positivo);
    await setSegment(positivo, "alerta");

    const otroSegmento = await insertMember({});
    await giveDeviceToken(otroSegmento);
    await setSegment(otroSegmento, "regular");

    const result = await evaluateCustomRulesForTenant(
      app.db,
      newService(),
      CTX,
      TODAY,
      app.log,
    );

    expect(await wasQueued(positivo, rule.id)).toBe(true);
    expect(await wasQueued(otroSegmento, rule.id)).toBe(false);
  });

  // ── Alcance ─────────────────────────────────────────────────────────────

  it("scopeBranchIds/scopeCountries filtran la audiencia", async () => {
    const ruleBranch = await insertCustomRule({
      triggerType: "segment_is",
      triggerSegment: "alerta",
      scopeBranchIds: [branchAR],
    });
    const ruleCountry = await insertCustomRule({
      triggerType: "segment_is",
      triggerSegment: "alerta",
      scopeCountries: ["ES"],
    });

    const enAR = await insertMember({ branchId: branchAR });
    await giveDeviceToken(enAR);
    await setSegment(enAR, "alerta");

    const enES = await insertMember({ branchId: branchES });
    await giveDeviceToken(enES);
    await setSegment(enES, "alerta");

    await evaluateCustomRulesForTenant(
      app.db,
      newService(),
      CTX,
      TODAY,
      app.log,
    );

    expect(await wasQueued(enAR, ruleBranch.id)).toBe(true);
    expect(await wasQueued(enES, ruleBranch.id)).toBe(false);

    expect(await wasQueued(enES, ruleCountry.id)).toBe(true);
    expect(await wasQueued(enAR, ruleCountry.id)).toBe(false);
  });

  // ── Cadencia / estado ───────────────────────────────────────────────────

  it("cooldown: no re-encola dentro de la ventana; sí después de cooldown_days", async () => {
    const rule = await insertCustomRule({
      triggerType: "segment_is",
      triggerSegment: "alerta",
      cooldownDays: 30,
    });

    const member = await insertMember({});
    await giveDeviceToken(member);
    await setSegment(member, "alerta");

    const first = await evaluateCustomRulesForTenant(
      app.db,
      newService(),
      CTX,
      TODAY,
      app.log,
    );
    expect(first.queued).toBe(1);
    expect(await wasQueued(member, rule.id)).toBe(true);

    // Segunda corrida el MISMO día: sigue cumpliendo la condición, pero el
    // cooldown de 30 días lo bloquea.
    const second = await evaluateCustomRulesForTenant(
      app.db,
      newService(),
      CTX,
      TODAY,
      app.log,
    );
    expect(second.queued).toBe(0);
    expect(second.skippedCooldown).toBe(1);

    // Envejecer la fila encolada más allá del cooldown (31 días).
    await app.db.execute(
      sql`UPDATE pending_notifications SET created_at = DATE_SUB(NOW(), INTERVAL 31 DAY) WHERE tenant_id = ${TENANT_TEMPLO} AND user_id = ${member} AND template_id = ${rule.id}`,
    );

    const third = await evaluateCustomRulesForTenant(
      app.db,
      newService(),
      CTX,
      TODAY,
      app.log,
    );
    expect(third.queued).toBe(1);
  });

  it("regla pausada (isEnabled: false) no encola nada", async () => {
    const rule = await insertCustomRule({
      triggerType: "segment_is",
      triggerSegment: "alerta",
      isEnabled: false,
    });

    const member = await insertMember({});
    await giveDeviceToken(member);
    await setSegment(member, "alerta");

    const result = await evaluateCustomRulesForTenant(
      app.db,
      newService(),
      CTX,
      TODAY,
      app.log,
    );

    expect(result.rulesEvaluated).toBe(0);
    expect(await wasQueued(member, rule.id)).toBe(false);
  });

  // ── Plantilla de sistema borrada: no rompe el resto del pipeline ────────

  it("plantilla de sistema borrada: runPlanRenewalWarnings no rompe y encola 0 para esa key", async () => {
    const service = newService();
    await service.seedTemplates(CTX);

    const [template] = await app.db
      .select({ id: schema.notificationTemplates.id })
      .from(schema.notificationTemplates)
      .where(
        and(
          tenantWhere(schema.notificationTemplates, CTX),
          eq(schema.notificationTemplates.templateKey, "plan_renewal_warning_7d"),
        ),
      );
    expect(template).toBeDefined();

    // Homogeneidad (2026-09-03): un template de sistema se borra igual que
    // uno propio — el FK de pending_notifications.template_id ya es
    // ON DELETE SET NULL (migración 0219).
    await app.db
      .delete(schema.notificationTemplates)
      .where(
        and(
          tenantWhere(schema.notificationTemplates, CTX),
          eq(schema.notificationTemplates.id, template.id),
        ),
      );

    const member = await insertMember({});
    await giveDeviceToken(member);
    await insertSubscription(member, branchAR, "active", 7);

    await expect(
      runPlanRenewalWarnings(app.db, service, CTX),
    ).resolves.toBe(0);
  });
});
