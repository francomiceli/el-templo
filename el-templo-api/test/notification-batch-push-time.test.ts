import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, createTestMember, cleanAllTestData } from "./helpers";
import * as schema from "../src/db/schema";
import {
  BATCH_PUSH_LOCAL_TIME,
  batchPushDeliveryAt,
  resolveBatchPushDeliveryAt,
} from "../src/jobs/notification-cron";
import { TENANT_TEMPLO } from "./fixtures/second-tenant";

/**
 * Hotfix 2026-11-11 — los avisos que encola el batch de las 03:00 AR (cambio de
 * segmento, reintento mensual de ausentes, renovación de programa y de plan)
 * salían a las ~03:00-03:05 AR porque se encolaban sin `scheduledAt`. Ahora se
 * programan para BATCH_PUSH_LOCAL_TIME en la tz de la sede del socio.
 */

const AR = "America/Argentina/Buenos_Aires";

describe("batchPushDeliveryAt (puro)", () => {
  it("la hora local configurada es las 10:00", () => {
    expect(BATCH_PUSH_LOCAL_TIME).toBe("10:00");
  });

  it("corrida de las 03:00 AR → 10:00 AR del mismo día", () => {
    const now = new Date("2026-11-11T06:00:00Z"); // 03:00 AR (UTC-3)
    expect(batchPushDeliveryAt(AR, now).toISOString()).toBe(
      "2026-11-11T13:00:00.000Z",
    );
  });

  it("corrida justo antes de medianoche UTC sigue usando el día local AR", () => {
    // 2026-11-11T02:30Z = 23:30 AR del 10/11 → 10:00 AR ya pasó ese día local.
    const now = new Date("2026-11-11T02:30:00Z");
    expect(batchPushDeliveryAt(AR, now)).toEqual(now);
  });

  it("si las 10:00 locales ya pasaron, devuelve now (ni pasado ni mañana)", () => {
    const now = new Date("2026-11-11T17:00:00Z"); // 14:00 AR
    expect(batchPushDeliveryAt(AR, now)).toEqual(now);
  });

  it("exactamente a las 10:00 locales devuelve now", () => {
    const now = new Date("2026-11-11T13:00:00Z"); // 10:00 AR
    expect(batchPushDeliveryAt(AR, now)).toEqual(now);
  });

  it("respeta la tz de la sede: Madrid en invierno (CET, UTC+1)", () => {
    const now = new Date("2026-11-11T06:00:00Z"); // 03:00 AR = 07:00 Madrid
    expect(batchPushDeliveryAt("Europe/Madrid", now).toISOString()).toBe(
      "2026-11-11T09:00:00.000Z",
    );
  });

  it("respeta el horario de verano: Madrid en julio (CEST, UTC+2)", () => {
    const now = new Date("2026-07-01T06:00:00Z"); // 03:00 AR = 08:00 Madrid
    expect(batchPushDeliveryAt("Europe/Madrid", now).toISOString()).toBe(
      "2026-07-01T08:00:00.000Z",
    );
  });
});

describe("resolveBatchPushDeliveryAt (tz de la sede del socio)", () => {
  let app: FastifyInstance;
  const CTX = { tenantId: TENANT_TEMPLO };
  const NOW = new Date("2026-11-11T06:00:00Z"); // 03:00 AR

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  async function branchWithTz(tz: string, country: string): Promise<number> {
    const [row] = await app.db.insert(schema.branches).values({
      tenantId: TENANT_TEMPLO,
      name: `Sede test ${tz}`,
      code: `BP-${country}-${Date.now()}`,
      timezone: tz,
      country,
    });
    return Number(row.insertId);
  }

  it("socio de una sede AR → 10:00 AR", async () => {
    const branchId = await branchWithTz(AR, "AR");
    const member = await createTestMember(app, { branchId });

    const at = await resolveBatchPushDeliveryAt(app.db, CTX, member.id, NOW);
    expect(at.toISOString()).toBe("2026-11-11T13:00:00.000Z");
  });

  it("socio de una sede Madrid → 10:00 Madrid, no 10:00 AR", async () => {
    const branchId = await branchWithTz("Europe/Madrid", "ES");
    const member = await createTestMember(app, { branchId });

    const at = await resolveBatchPushDeliveryAt(app.db, CTX, member.id, NOW);
    expect(at.toISOString()).toBe("2026-11-11T09:00:00.000Z");
  });

  it("usuario inexistente (o de otro gimnasio) → fallback AR", async () => {
    const at = await resolveBatchPushDeliveryAt(app.db, CTX, 999_999_999, NOW);
    expect(at.toISOString()).toBe("2026-11-11T13:00:00.000Z");
  });
});
