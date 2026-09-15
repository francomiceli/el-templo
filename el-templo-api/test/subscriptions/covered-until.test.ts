import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  deriveCoveredUntil,
  deriveReminderCoveredUntil,
  deriveReminderCoveredUntilBatch,
  EXPIRY_REMINDER_MIN_DURATION_DAYS,
} from "../../src/modules/subscriptions/service";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { createPlan, createMember, dateOffsetStr } from "./_helpers";

/**
 * Phase 144-01 Task 2 — covered-until derivation (D-00, D-13, D-14).
 *
 * deriveCoveredUntil(db, userId) returns the furthest end_date across the
 * member's active+scheduled subscription chain, or null when there is no
 * covering subscription (none / only cancelled / all-NULL end_date).
 */
describe("Subscriptions — deriveCoveredUntil (covered-until chain)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let planId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const plan = await createPlan(app, adminToken);
    planId = plan.id;
  });

  /** Insert a subscription row directly, bypassing service business rules. */
  async function insertSub(
    userId: number,
    status: "active" | "scheduled" | "cancelled" | "expired",
    endDate: string | null,
    planIdOverride?: number,
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId: planIdOverride ?? planId,
      branchId: 1,
      status,
      startDate: dateOffsetStr(-30),
      endDate,
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  }

  it("returns the active sub end_date when there is no scheduled successor", async () => {
    const member = await createMember(app, { email: "covered-1@test.com" });
    await insertSub(member.id, "active", "2026-07-10");

    const result = await deriveCoveredUntil(app.db, member.id);
    expect(result).toBe("2026-07-10");
  });

  it("returns the furthest end_date across active + scheduled chain", async () => {
    const member = await createMember(app, { email: "covered-2@test.com" });
    await insertSub(member.id, "active", "2026-07-10");
    await insertSub(member.id, "scheduled", "2026-08-09");

    const result = await deriveCoveredUntil(app.db, member.id);
    expect(result).toBe("2026-08-09");
  });

  it("returns null when the member only has cancelled/expired subs", async () => {
    const member = await createMember(app, { email: "covered-3@test.com" });
    await insertSub(member.id, "cancelled", "2026-07-10");
    await insertSub(member.id, "expired", "2026-06-01");

    const result = await deriveCoveredUntil(app.db, member.id);
    expect(result).toBeNull();
  });

  it("returns null when the member has no subscriptions at all", async () => {
    const member = await createMember(app, { email: "covered-4@test.com" });

    const result = await deriveCoveredUntil(app.db, member.id);
    expect(result).toBeNull();
  });

  it("returns null when the only active sub has a NULL end_date (D-14 guard)", async () => {
    const member = await createMember(app, { email: "covered-5@test.com" });
    await insertSub(member.id, "active", null);

    const result = await deriveCoveredUntil(app.db, member.id);
    expect(result).toBeNull();
  });
});

// Clase única (2026-09-15): la variante "Reminder" comparte la cadena de
// deriveCoveredUntil pero devuelve null cuando la suscripción que define el
// covered-until es de un plan corto (< EXPIRY_REMINDER_MIN_DURATION_DAYS).
describe("Subscriptions — deriveReminderCoveredUntil (plan corto no se recuerda)", () => {
  const CTX = { tenantId: TENANT_TEMPLO };
  let app: FastifyInstance;
  let adminToken: string;
  let planId: number;
  let shortPlanId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const plan = await createPlan(app, adminToken);
    planId = plan.id;
    const shortPlan = await createPlan(app, adminToken, {
      name: "Clase única",
      durationDays: 1,
      classesPerWeek: 1,
    });
    shortPlanId = shortPlan.id;
  });

  async function insertSub(
    userId: number,
    status: "active" | "scheduled",
    endDate: string,
    subPlanId: number,
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId: subPlanId,
      branchId: 1,
      status,
      startDate: dateOffsetStr(-1),
      endDate,
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  }

  it("el mínimo es 7 días (una semana): un plan de 6 días tampoco se recuerda", () => {
    expect(EXPIRY_REMINDER_MIN_DURATION_DAYS).toBe(7);
  });

  it("devuelve el covered-until crudo para un plan normal (mismo valor que deriveCoveredUntil)", async () => {
    const member = await createMember(app, { email: "rem-normal@test.com" });
    await insertSub(member.id, "active", "2026-07-10", planId);

    expect(await deriveReminderCoveredUntil(app.db, member.id, CTX)).toBe(
      "2026-07-10",
    );
    expect(await deriveCoveredUntil(app.db, member.id, CTX)).toBe("2026-07-10");
  });

  it("devuelve null para una Clase única (plan de 1 día) aunque la cobertura cruda exista", async () => {
    const member = await createMember(app, { email: "rem-corto@test.com" });
    await insertSub(member.id, "active", dateOffsetStr(1), shortPlanId);

    expect(await deriveReminderCoveredUntil(app.db, member.id, CTX)).toBeNull();
    // El bloqueo de reservas y el pill "Venc" siguen viendo la cobertura real.
    expect(await deriveCoveredUntil(app.db, member.id, CTX)).toBe(
      dateOffsetStr(1),
    );
  });

  it("si un plan normal programado extiende la cobertura más allá de la Clase única, se recuerda el normal", async () => {
    const member = await createMember(app, { email: "rem-cadena@test.com" });
    await insertSub(member.id, "active", dateOffsetStr(1), shortPlanId);
    await insertSub(member.id, "scheduled", dateOffsetStr(31), planId);

    expect(await deriveReminderCoveredUntil(app.db, member.id, CTX)).toBe(
      dateOffsetStr(31),
    );
  });

  it("si la Clase única es la que más lejos llega, tapa al plan normal que termina antes", async () => {
    const member = await createMember(app, { email: "rem-tapa@test.com" });
    await insertSub(member.id, "active", dateOffsetStr(0), planId);
    await insertSub(member.id, "scheduled", dateOffsetStr(2), shortPlanId);

    expect(await deriveReminderCoveredUntil(app.db, member.id, CTX)).toBeNull();
  });

  it("empate en el end_date máximo: alcanza con que UNA sea de plan normal", async () => {
    const member = await createMember(app, { email: "rem-empate@test.com" });
    await insertSub(member.id, "active", dateOffsetStr(3), planId);
    await insertSub(member.id, "scheduled", dateOffsetStr(3), shortPlanId);

    expect(await deriveReminderCoveredUntil(app.db, member.id, CTX)).toBe(
      dateOffsetStr(3),
    );
  });

  it("batch: mezcla socios normales, cortos y sin cobertura en una sola query", async () => {
    const normal = await createMember(app, { email: "rem-b-normal@test.com" });
    const corto = await createMember(app, { email: "rem-b-corto@test.com" });
    const nada = await createMember(app, { email: "rem-b-nada@test.com" });
    await insertSub(normal.id, "active", dateOffsetStr(5), planId);
    await insertSub(corto.id, "active", dateOffsetStr(1), shortPlanId);

    const map = await deriveReminderCoveredUntilBatch(
      app.db,
      [normal.id, corto.id, nada.id],
      CTX,
    );
    expect(map.get(normal.id)).toBe(dateOffsetStr(5));
    expect(map.get(corto.id)).toBeNull();
    expect(map.has(nada.id)).toBe(false);
    expect(await deriveReminderCoveredUntilBatch(app.db, [], CTX)).toEqual(
      new Map(),
    );
  });
});
