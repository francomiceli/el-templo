/**
 * Programadas por grupo (caso Alan Maldonado, 2026-10-30)
 *
 * Un socio puede tener en paralelo una sub por grupo (presencial + especial +
 * online). Los chequeos y cascadas sobre "la programada" tienen que mirar solo
 * el grupo de la sub involucrada:
 *   - Programar un cambio de plan (after_current) y renovar: una Aura
 *     programada NO bloquea la presencial (antes: 409 "ya existe una
 *     programada"). Una programada del MISMO grupo sigue bloqueando.
 *   - Cambiar de plan ahora y cancelar la presencial: cancelan la renovación
 *     programada de la presencial, pero NO la Aura programada ya paga.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";

import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
} from "./_helpers";

describe("Subscriptions API — programadas por grupo", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  async function post(
    url: string,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}${url}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function statusOf(subId: number): Promise<string> {
    const [row] = await app.db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, subId),
        ),
      );
    return row.status;
  }

  /**
   * Presencial activa + Aura activa + Aura renovada (programada). Sin cobros
   * (override 0 / amountReceived 0) para que cancelar no choque con el guard de
   * cobros vivos (REQ-3).
   */
  async function setupPresencialConAuraProgramada(): Promise<{
    memberId: number;
    presencialId: number;
    auraActiveId: number;
    auraScheduledId: number;
    upgradePlanId: number;
  }> {
    const presencialPlan = await createPlan(app, adminToken, {
      name: "Presencial Grupo",
      planCategory: "presencial",
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 5000,
    });
    const upgradePlan = await createPlan(app, adminToken, {
      name: "Presencial Anual Grupo",
      planCategory: "presencial",
      durationDays: 365,
      priceRegular: 90000,
      priceZero: 45000,
    });
    // Mismo armado que especial-pass-core: `grantsAllPrograms` satisface las
    // invariantes del plan especial creado por la API.
    const auraPlan = await createPlan(app, adminToken, {
      name: "Aura Grupo",
      planCategory: "especial",
      grantsAllPrograms: true,
      durationDays: 30,
      priceRegular: 5000,
      priceZero: 2500,
    });
    const member = await createMember(app);
    const noCharge = {
      priceOverrideAmount: 0,
      priceOverrideReason: "test (sin cobro — REQ-3)",
    };

    const presencial = await assignPlan(app, adminToken, member.id, {
      planId: presencialPlan.id,
      startDate: todayStr(),
      ...noCharge,
    });
    expect(presencial.statusCode, JSON.stringify(presencial.body)).toBe(201);

    const aura = await assignPlan(app, adminToken, member.id, {
      planId: auraPlan.id,
      startDate: todayStr(),
      ...noCharge,
    });
    expect(aura.statusCode, JSON.stringify(aura.body)).toBe(201);

    const auraRenewal = await post(
      `/members/${member.id}/subscription/renew`,
      {
        paymentMethod: "cash",
        subscriptionId: aura.body.id,
        amountReceived: 0,
      },
    );
    expect(auraRenewal.statusCode, JSON.stringify(auraRenewal.body)).toBe(201);
    expect(auraRenewal.body.status).toBe("scheduled");

    return {
      memberId: member.id,
      presencialId: presencial.body.id as number,
      auraActiveId: aura.body.id as number,
      auraScheduledId: auraRenewal.body.id as number,
      upgradePlanId: upgradePlan.id,
    };
  }

  function renewPresencial(memberId: number, presencialId: number) {
    return post(`/members/${memberId}/subscription/renew`, {
      paymentMethod: "cash",
      subscriptionId: presencialId,
      amountReceived: 0,
    });
  }

  it("una Aura programada no bloquea programar el cambio de la presencial (after_current)", async () => {
    const s = await setupPresencialConAuraProgramada();

    const res = await post(`/members/${s.memberId}/subscription/change-plan`, {
      planId: s.upgradePlanId,
      branchId: 1,
      startDate: todayStr(),
      priceTypeApplied: "regular",
      paymentMethod: "cash",
      startMode: "after_current",
    });

    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(res.body.status).toBe("scheduled");
    expect(await statusOf(s.auraScheduledId)).toBe("scheduled");
  });

  it("una Aura programada no bloquea renovar la presencial", async () => {
    const s = await setupPresencialConAuraProgramada();

    const res = await renewPresencial(s.memberId, s.presencialId);

    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(res.body.status).toBe("scheduled");
    expect(await statusOf(s.auraScheduledId)).toBe("scheduled");
  });

  it("una programada del MISMO grupo sigue bloqueando (renovar y programar cambio → 409)", async () => {
    const s = await setupPresencialConAuraProgramada();
    const first = await renewPresencial(s.memberId, s.presencialId);
    expect(first.statusCode).toBe(201);

    const second = await renewPresencial(s.memberId, s.presencialId);
    expect(second.statusCode).toBe(409);

    const change = await post(
      `/members/${s.memberId}/subscription/change-plan`,
      {
        planId: s.upgradePlanId,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        startMode: "after_current",
      },
    );
    expect(change.statusCode).toBe(409);
  });

  it("cambiar de plan ahora cancela la renovación presencial programada pero no la Aura", async () => {
    const s = await setupPresencialConAuraProgramada();
    const presencialRenewal = await renewPresencial(
      s.memberId,
      s.presencialId,
    );
    expect(presencialRenewal.statusCode).toBe(201);

    const res = await post(`/members/${s.memberId}/subscription/change-plan`, {
      planId: s.upgradePlanId,
      branchId: 1,
      startDate: todayStr(),
      priceTypeApplied: "regular",
      paymentMethod: "cash",
    });

    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(await statusOf(presencialRenewal.body.id as number)).toBe(
      "cancelled",
    );
    expect(await statusOf(s.auraScheduledId)).toBe("scheduled");
    expect(await statusOf(s.auraActiveId)).toBe("active");
  });

  it("cancelar la presencial cancela su renovación programada pero no la Aura", async () => {
    const s = await setupPresencialConAuraProgramada();
    const presencialRenewal = await renewPresencial(
      s.memberId,
      s.presencialId,
    );
    expect(presencialRenewal.statusCode).toBe(201);

    const res = await post(`/members/${s.memberId}/subscription/cancel`, {
      subscriptionId: s.presencialId,
      notes: "Baja de la presencial",
    });

    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(await statusOf(s.presencialId)).toBe("cancelled");
    expect(await statusOf(presencialRenewal.body.id as number)).toBe(
      "cancelled",
    );
    expect(await statusOf(s.auraScheduledId)).toBe("scheduled");
    expect(await statusOf(s.auraActiveId)).toBe("active");
  });
});
