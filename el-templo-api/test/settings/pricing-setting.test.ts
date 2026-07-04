/**
 * Phase 154 (ALUM-03) — pricing card-surcharge setting integration tests.
 *
 * Blinda el hogar server-side de la regla de recargo por tarjeta:
 *   GET/PUT /api/admin/settings/pricing/card-surcharge.
 *
 * Escenarios (contra el MySQL real por-worker `eltemplo_test`):
 *
 *   a. default-OFF        — GET sin sembrar la key ⇒ { enabled: false }.
 *   b. put-owner-on       — PUT owner { enabled: true } ⇒ 200 { enabled: true }
 *                           y GET posterior ⇒ { enabled: true } (persistió 'on').
 *   c. upsert-owner-off    — PUT owner { enabled: false } sobre la key existente
 *                           ⇒ 200 y GET ⇒ { enabled: false } (upsert, no duplica).
 *   d. write-guard-403    — PUT con token NO-owner (coach) ⇒ 403 (T-154-01).
 *   e. read-any-staff      — GET con token NO-owner (coach) ⇒ 200 (staff-readable).
 *
 * Gotcha (test/helpers.ts:208): `cleanAllTestData` limpia `system_settings`, así
 * que cada test parte SIN la setting (default OFF) — no se asume el seed 0166.
 *
 * MEMORY: la suite NO se corre local — corre en CI al pushear a staging.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";

const SETTING_URL = "/api/admin/settings/pricing/card-surcharge";

let app: FastifyInstance;
let ownerToken: string;
let coachToken: string;

/** GET the setting with the given token. */
async function getSetting(token: string) {
  const res = await app.inject({
    method: "GET",
    url: SETTING_URL,
    headers: { authorization: `Bearer ${token}` },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

/** PUT the setting with the given token + body. */
async function putSetting(enabled: boolean, token: string) {
  const res = await app.inject({
    method: "PUT",
    url: SETTING_URL,
    headers: { authorization: `Bearer ${token}` },
    payload: { enabled },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

beforeAll(async () => {
  app = await createTestApp();

  // admin@test.com is seeded with role 'owner' (test/setup.ts) — use it as owner.
  const [owner] = await app.db
    .select({ branchId: schema.users.branchId })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  const branchId = owner.branchId ?? 1;
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  await createStaffUser(app, {
    email: "coach-settings@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Settings",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(
    app,
    "coach-settings@test.local",
    "pass123456",
  );
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  // Reset system_settings so each test starts at default OFF (no seeded key).
  await app.db.delete(schema.systemSettings);
});

describe("pricing card-surcharge setting", () => {
  it("a. GET sin sembrar la key devuelve default OFF", async () => {
    const { statusCode, body } = await getSetting(ownerToken);
    expect(statusCode).toBe(200);
    expect(body).toEqual({ enabled: false });
  });

  it("b. PUT owner { enabled: true } persiste 'on' y GET lo refleja", async () => {
    const put = await putSetting(true, ownerToken);
    expect(put.statusCode).toBe(200);
    expect(put.body).toEqual({ enabled: true });

    const get = await getSetting(ownerToken);
    expect(get.statusCode).toBe(200);
    expect(get.body).toEqual({ enabled: true });

    // Verificar que persistió como 'on' (una sola fila).
    const rows = await app.db
      .select({ value: schema.systemSettings.settingValue })
      .from(schema.systemSettings)
      .where(
        eq(schema.systemSettings.settingKey, "pricing.card_surcharge_enabled"),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("on");
  });

  it("c. segundo PUT { enabled: false } hace upsert (no duplica fila)", async () => {
    await putSetting(true, ownerToken);
    const put = await putSetting(false, ownerToken);
    expect(put.statusCode).toBe(200);
    expect(put.body).toEqual({ enabled: false });

    const get = await getSetting(ownerToken);
    expect(get.body).toEqual({ enabled: false });

    const rows = await app.db
      .select({ value: schema.systemSettings.settingValue })
      .from(schema.systemSettings)
      .where(
        eq(schema.systemSettings.settingKey, "pricing.card_surcharge_enabled"),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("off");
  });

  it("d. PUT con token no-owner (coach) devuelve 403", async () => {
    const put = await putSetting(true, coachToken);
    expect(put.statusCode).toBe(403);

    // No debe haber persistido nada.
    const get = await getSetting(ownerToken);
    expect(get.body).toEqual({ enabled: false });
  });

  it("e. GET con token no-owner (coach) es legible (200)", async () => {
    const get = await getSetting(coachToken);
    expect(get.statusCode).toBe(200);
    expect(get.body).toEqual({ enabled: false });
  });
});
