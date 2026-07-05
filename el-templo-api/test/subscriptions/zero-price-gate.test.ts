/**
 * Phase 156 (PLAN-02 / D-04) — server-side "Zero" price gate.
 *
 * Blinda el punto único de verdad del precio (`subscriptions/service.ts`
 * `resolvePriceType` → `getBasePrice`): cuando la regla
 * `pricing.zero_price_enabled` está OFF, una asignación/renovación con
 * `priceType = 'zero'` debe cobrar `priceRegular` (no `priceZero`) y persistir
 * `priceTypeApplied = 'regular'` en la subscription — nunca queda grabado
 * `zero` con monto regular (el drift que PATTERNS previene).
 *
 * Cubre el punto único que sirve a assign/change/renew/preview/PoS, más:
 *   (ON)  assign zero → persiste 'zero' + priceZero (comportamiento actual).
 *   (OFF) assign zero → persiste 'regular' + priceRegular.
 *   (OFF) renovación heredada de una sub 'zero' → renueva a 'regular' (WR-04):
 *         resolvePriceType re-normaliza el tipo heredado en renew.
 *   (OFF) assign boardingPass → NO fuerza 'zero'; se normaliza a 'regular' y
 *         cobra priceRegular (ASSERTA AMBOS campos, lockea la combinación).
 *
 * MEMORY: la suite NO se corre local — corre en CI al pushear a staging.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import {
  SUBSCRIPTIONS_URL,
  assignPlan,
  createMember,
  createPlan,
  todayStr,
} from "./_helpers";
import * as schema from "../../src/db/schema";
import { PRICING_SETTINGS_KEYS } from "../../src/modules/settings/keys";

const PRICE_REGULAR = 100000;
const PRICE_ZERO = 50000;

let app: FastifyInstance;
let adminToken: string;

/** Seed the zero-price rule (ON/OFF). cleanAllTestData wipes system_settings,
 *  so each case sets the value it needs. */
async function setZeroPriceRule(enabled: boolean): Promise<void> {
  const value = enabled ? "on" : "off";
  await app.db
    .insert(schema.systemSettings)
    .values({
      settingKey: PRICING_SETTINGS_KEYS.zeroPrice,
      settingValue: value,
    })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

/** Read persisted priceTypeApplied + pricePaid of a subscription. */
async function readSub(
  subId: number,
): Promise<{ priceTypeApplied: string | null; pricePaid: number } | null> {
  const [row] = await app.db
    .select({
      priceTypeApplied: schema.subscriptions.priceTypeApplied,
      pricePaid: schema.subscriptions.pricePaid,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, subId))
    .limit(1);
  return row ?? null;
}

async function createGatePlan(name: string): Promise<{ id: number }> {
  return createPlan(app, adminToken, {
    name,
    priceRegular: PRICE_REGULAR,
    priceZero: PRICE_ZERO,
  });
}

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

// ─── regla ON → el precio Zero se aplica (comportamiento actual intacto) ──────
describe("zero-price gate — regla ON", () => {
  it("ON + assign zero → persiste 'zero' y cobra priceZero", async () => {
    await setZeroPriceRule(true);
    const plan = await createGatePlan("Zero Gate ON Plan");
    const member = await createMember(app);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      priceTypeApplied: "zero",
    });
    expect(res.statusCode).toBe(201);

    const sub = await readSub(res.body.id as number);
    expect(sub?.priceTypeApplied).toBe("zero");
    expect(sub?.pricePaid).toBe(PRICE_ZERO);
  });
});

// ─── regla OFF → 'zero' se normaliza a 'regular' server-side ──────────────────
describe("zero-price gate — regla OFF", () => {
  it("OFF + assign zero → persiste 'regular' y cobra priceRegular", async () => {
    await setZeroPriceRule(false);
    const plan = await createGatePlan("Zero Gate OFF Plan");
    const member = await createMember(app);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      priceTypeApplied: "zero",
    });
    expect(res.statusCode).toBe(201);

    const sub = await readSub(res.body.id as number);
    expect(sub?.priceTypeApplied).toBe("regular");
    expect(sub?.pricePaid).toBe(PRICE_REGULAR);
  });

  it("regla ausente (default OFF) + assign zero → 'regular' + priceRegular", async () => {
    // No sembramos la key: getZeroPriceEnabled cae al default false.
    const plan = await createGatePlan("Zero Gate Default Plan");
    const member = await createMember(app);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      priceTypeApplied: "zero",
    });
    expect(res.statusCode).toBe(201);

    const sub = await readSub(res.body.id as number);
    expect(sub?.priceTypeApplied).toBe("regular");
    expect(sub?.pricePaid).toBe(PRICE_REGULAR);
  });

  it("OFF + renovación heredada de una sub 'zero' → renueva a 'regular' (WR-04)", async () => {
    const plan = await createGatePlan("Zero Gate Renew Plan");
    const member = await createMember(app);

    // Alta con la regla ON → sub 'zero' + priceZero (estado heredable).
    await setZeroPriceRule(true);
    const assignRes = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      priceTypeApplied: "zero",
    });
    expect(assignRes.statusCode).toBe(201);

    // El owner apaga la regla; la renovación debe re-normalizar el tipo heredado.
    await setZeroPriceRule(false);
    const renewRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", amountReceived: 0 },
    });
    expect(renewRes.statusCode).toBe(201);
    const newSub = JSON.parse(renewRes.body);

    const persisted = await readSub(newSub.id as number);
    expect(persisted?.priceTypeApplied).toBe("regular");
    expect(persisted?.pricePaid).toBe(PRICE_REGULAR);
  });

  it("OFF + boardingPass → NO fuerza 'zero'; normaliza a 'regular' + priceRegular", async () => {
    await setZeroPriceRule(false);
    const plan = await createGatePlan("Zero Gate Boarding Plan");
    const member = await createMember(app);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
      boardingPass: true,
    });
    expect(res.statusCode).toBe(201);

    // ASSERTA AMBOS campos: el boarding pass no debe persistir 'zero' con la
    // regla OFF, y el monto debe quedar consistente con el tipo normalizado
    // (lockea la combinación intencional — warning 3 del plan-checker).
    const sub = await readSub(res.body.id as number);
    expect(sub?.priceTypeApplied).toBe("regular");
    expect(sub?.pricePaid).toBe(PRICE_REGULAR);
  });

  it("ON + boardingPass → sigue siendo 'zero' + priceZero (idéntico a hoy)", async () => {
    await setZeroPriceRule(true);
    const plan = await createGatePlan("Zero Gate Boarding ON Plan");
    const member = await createMember(app);

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
      boardingPass: true,
    });
    expect(res.statusCode).toBe(201);

    const sub = await readSub(res.body.id as number);
    expect(sub?.priceTypeApplied).toBe("zero");
    expect(sub?.pricePaid).toBe(PRICE_ZERO);
  });
});
