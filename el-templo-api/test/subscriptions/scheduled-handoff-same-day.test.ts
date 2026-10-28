/**
 * Fix 2026-10-15 — traspaso completo al activar una renovación programada.
 *
 * Caso prod (Emanuel Medina): la renovación arranca el mismo día que vence la
 * anterior (startDate = endDate). El cron `activateDueScheduledSubs` la
 * activaba a las 00:05 pero la predecesora seguía `active` hasta el día
 * siguiente (`autoExpireSubscriptions` cierra con endDate < hoy). Resultado:
 * dos presenciales `active` y el admin escondía la renovación (no se podía
 * cancelar ni cambiar de plan). Ahora `activateScheduledSub` cierra la
 * predecesora (`completed`) si está en su último día; si todavía tiene días
 * por delante no la toca. Los socios que ya quedaron superpuestos se reparan
 * al leer (`getMemberSubscriptions` → `autoExpireSubscriptions`).
 *
 * Las fechas se fijan en UTC (`todayStr`) porque `activateDueScheduledSubs`
 * decide "hoy" en UTC — con fechas en la tz de la sede el test rompería de
 * noche (ver reference_test_shifts_utc_vs_tz_sede).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData, todayStr } from "../helpers";
import * as schema from "../../src/db/schema";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
import { EnrollmentService } from "../../src/modules/programs/enrollment-service";
import { addDays } from "../../src/modules/shared/date-utils";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  createActiveSub,
  createMemberInPhysicalBranch,
  createMembershipPlan,
  fixtureCtx,
  type InvitationsFixtureCtx,
} from "../invitations/_helpers";

type SubStatus = "active" | "paused" | "scheduled";

describe("activateScheduledSub — traspaso completo el día del cambio", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let svc: SubscriptionService;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    svc = new SubscriptionService(
      app.db,
      app.log,
      undefined,
      new EnrollmentService(app.db, app.log),
    );
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /** Sub con fechas UTC explícitas y, opcionalmente, su predecesora. */
  async function createSub(opts: {
    userId: number;
    planId: number;
    status: SubStatus;
    startDate: string;
    endDate: string;
    previousSubscriptionId?: number;
  }): Promise<number> {
    const { id } = await createActiveSub(ctx, {
      userId: opts.userId,
      planId: opts.planId,
      status: opts.status,
    });
    await app.db
      .update(schema.subscriptions)
      .set({
        startDate: opts.startDate,
        endDate: opts.endDate,
        previousSubscriptionId: opts.previousSubscriptionId ?? null,
      })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, id),
        ),
      );
    return id;
  }

  async function statusOf(subId: number): Promise<string> {
    const [row] = await app.db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, subId),
        ),
      );
    if (!row) throw new Error(`sub ${subId} no existe`);
    return row.status;
  }

  /** Socio con la vigente (vence `prevEnd`) y su renovación que arranca hoy. */
  async function setupRenewal(opts: {
    prevStatus: "active" | "paused";
    prevEnd: string;
  }) {
    const today = todayStr();
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    const plan = await createMembershipPlan(ctx);
    const prevId = await createSub({
      userId: member.id,
      planId: plan.id,
      status: opts.prevStatus,
      startDate: addDays(today, -30),
      endDate: opts.prevEnd,
    });
    const nextId = await createSub({
      userId: member.id,
      planId: plan.id,
      status: "scheduled",
      startDate: today,
      endDate: addDays(today, 30),
      previousSubscriptionId: prevId,
    });
    return { userId: member.id, prevId, nextId };
  }

  it("renovación que arranca el día que vence la anterior: la anterior queda completed y hay una sola vigente", async () => {
    const { userId, prevId, nextId } = await setupRenewal({
      prevStatus: "active",
      prevEnd: todayStr(),
    });

    await svc.activateDueScheduledSubs(ctx.tenant);

    expect(await statusOf(nextId)).toBe("active");
    expect(await statusOf(prevId)).toBe("completed");

    const vigentes = await svc.getMemberSubscriptions(ctx.tenant, userId);
    expect(vigentes.map((s) => s.id)).toEqual([nextId]);
  });

  it("predecesora vencida ayer y todavía active (cron antes del auto-expire): queda completed, no expired", async () => {
    const { prevId, nextId } = await setupRenewal({
      prevStatus: "active",
      prevEnd: addDays(todayStr(), -1),
    });

    await svc.activateDueScheduledSubs(ctx.tenant);

    expect(await statusOf(nextId)).toBe("active");
    expect(await statusOf(prevId)).toBe("completed");
  });

  it("predecesora con días por delante (renovación adelantada): no se toca", async () => {
    const { prevId, nextId } = await setupRenewal({
      prevStatus: "active",
      prevEnd: addDays(todayStr(), 10),
    });

    await svc.activateDueScheduledSubs(ctx.tenant);

    expect(await statusOf(nextId)).toBe("active");
    expect(await statusOf(prevId)).toBe("active");
  });

  it("predecesora pausada: no se toca (solo se cierra una active)", async () => {
    const { prevId, nextId } = await setupRenewal({
      prevStatus: "paused",
      prevEnd: todayStr(),
    });

    await svc.activateDueScheduledSubs(ctx.tenant);

    expect(await statusOf(nextId)).toBe("active");
    expect(await statusOf(prevId)).toBe("paused");
  });

  it("reparación al leer: socio que ya quedó con las dos active (estado previo al fix) se arregla al abrir la ficha", async () => {
    const { userId, prevId, nextId } = await setupRenewal({
      prevStatus: "active",
      prevEnd: todayStr(),
    });
    // Estado que dejaba el cron viejo: la sucesora active, la predecesora
    // también.
    await app.db
      .update(schema.subscriptions)
      .set({ status: "active" })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, nextId),
        ),
      );

    const vigentes = await svc.getMemberSubscriptions(ctx.tenant, userId);

    expect(await statusOf(prevId)).toBe("completed");
    expect(await statusOf(nextId)).toBe("active");
    expect(vigentes.map((s) => s.id)).toEqual([nextId]);
  });

  it("reparación al leer: no toca una predecesora con días por delante", async () => {
    const { userId, prevId, nextId } = await setupRenewal({
      prevStatus: "active",
      prevEnd: addDays(todayStr(), 10),
    });
    await app.db
      .update(schema.subscriptions)
      .set({ status: "active" })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, nextId),
        ),
      );

    await svc.getMemberSubscriptions(ctx.tenant, userId);

    expect(await statusOf(prevId)).toBe("active");
    expect(await statusOf(nextId)).toBe("active");
  });

  it("camino auto-expire (predecesora vencida ayer): sigue terminando completed con la sucesora activa", async () => {
    const { userId, prevId, nextId } = await setupRenewal({
      prevStatus: "active",
      prevEnd: addDays(todayStr(), -1),
    });

    const vigentes = await svc.getMemberSubscriptions(ctx.tenant, userId);

    expect(await statusOf(prevId)).toBe("completed");
    expect(await statusOf(nextId)).toBe("active");
    expect(vigentes.map((s) => s.id)).toEqual([nextId]);
  });
});
