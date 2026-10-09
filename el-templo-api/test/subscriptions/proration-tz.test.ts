/**
 * Prorrateo del cambio de plan con "hoy" en la zona de la SEDE (2026-10-08).
 *
 * `calculateProration` usaba el día UTC. Entre las 21:00 y las 24:00 de
 * Argentina el día UTC ya es el siguiente: el cambio inmediato contaba un día
 * más de uso y daba un día menos de crédito (lo destapó un CI corrido de noche
 * en test/invitations/discount-arbiter-paths.test.ts). Acá se fija el reloj en
 * una hora de la noche argentina en que UTC ya pasó de día y se verifica que
 * los días restantes salgan del calendario de la sede.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken } from "../helpers";
import { todayInTz } from "../../src/modules/shared/date-utils";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
} from "./_helpers";

const TZ_AR = "America/Argentina/Buenos_Aires";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Próximas 01:30 UTC (= 22:30 AR del día anterior), SIEMPRE hacia adelante
 *  respecto del reloj real (ver reference_fake_timers_salto_relativo). */
function nextArNightInstant(): Date {
  const d = new Date(Date.now() + DAY_MS);
  d.setUTCHours(1, 30, 0, 0);
  return d;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("Prorrateo del cambio de plan — fecha de la sede, no UTC", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(nextArNightInstant());
    // Token emitido con el reloj ya movido (el exp es relativo a "ahora").
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  it("22:30 AR (UTC ya es mañana): sub de 30 días arrancada hace 15 → 15/30 días de crédito", async () => {
    const now = new Date();
    const todayAr = todayInTz(TZ_AR, now);
    // Precondición del escenario: UTC ya cambió de día y AR todavía no.
    expect(now.toISOString().slice(0, 10)).not.toBe(todayAr);

    const u = Date.now().toString(36);
    const planA = await createPlan(app, adminToken, {
      name: `Proration TZ A ${u}`,
      classesPerWeek: undefined,
      durationDays: 30,
      priceRegular: 30000,
      priceZero: 20000,
    });
    const planB = await createPlan(app, adminToken, {
      name: `Proration TZ B ${u}`,
      classesPerWeek: undefined,
      durationDays: 30,
      priceRegular: 45000,
      priceZero: 30000,
    });
    const member = await createMember(app, {
      email: `proration-tz-${u}@test.com`,
      dni: `7${String(Date.now()).slice(-7)}`,
    });
    const assigned = await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      startDate: addDays(todayAr, -15),
    });
    expect(assigned.statusCode).toBe(201);

    const res = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan-preview?targetPlanId=${planB.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      proration: { remainingDetail: string; remainingValue: number } | null;
    };
    // Con el día UTC daba "14/30 dias" y 14000 de crédito.
    expect(body.proration?.remainingDetail).toBe("15/30 dias");
    expect(body.proration?.remainingValue).toBe(15000);
  });
});
