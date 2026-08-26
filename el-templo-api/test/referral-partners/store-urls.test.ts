/**
 * Fase 179-12 (D-01/D-04/D-20) — URLs de tienda configurables sin deploy.
 *
 * Blinda GET/PUT /api/admin/settings/store-urls:
 *
 *   a. default-null   — GET sin sembrar ninguna key ⇒ { android: null, ios: null }.
 *   b. put-owner       — PUT owner { android, ios } ⇒ 200 y GET posterior refleja
 *                        lo guardado (upsert, no duplica fila).
 *   c. put-invalid-url — PUT con una URL sin `https://` ⇒ 400, nada se persiste.
 *   d. write-guard-403 — PUT con token NO-owner (coach) ⇒ 403 (mismo guard que
 *                        el resto de las rutas de escritura del plugin).
 *
 * Gotcha (test/helpers.ts): `cleanAllTestData` limpia `system_settings`, así
 * que cada test parte sin ninguna key seedeada.
 *
 * MEMORY: la suite NO se corre local — corre en CI al pushear a staging.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, createStaffUser, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const SETTING_URL = "/api/admin/settings/store-urls";

let app: FastifyInstance;
let ownerToken: string;
let coachToken: string;

async function getStoreUrls(token: string) {
  const res = await app.inject({
    method: "GET",
    url: SETTING_URL,
    headers: { authorization: `Bearer ${token}` },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function putStoreUrls(
  payload: { android?: string; ios?: string },
  token: string,
) {
  const res = await app.inject({
    method: "PUT",
    url: SETTING_URL,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

beforeAll(async () => {
  app = await createTestApp();

  // admin@test.com is seeded with role 'owner' (test/setup.ts).
  const [owner] = await app.db
    .select({ branchId: schema.users.branchId })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  const branchId = owner.branchId ?? 1;
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  await createStaffUser(app, {
    email: "coach-store-urls@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "StoreUrls",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(
    app,
    "coach-store-urls@test.local",
    "pass123456",
  );
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.db.delete(schema.systemSettings);
});

describe("URLs de tienda (system_settings)", () => {
  it("a. GET sin sembrar las keys devuelve { android: null, ios: null }", async () => {
    const { statusCode, body } = await getStoreUrls(ownerToken);
    expect(statusCode).toBe(200);
    expect(body).toEqual({ android: null, ios: null });
  });

  it("b. PUT owner guarda ambas URLs y GET las refleja (upsert, sin duplicar)", async () => {
    const put = await putStoreUrls(
      {
        android:
          "https://play.google.com/store/apps/details?id=com.eltemplo.app",
        ios: "https://apps.apple.com/app/id0000000000",
      },
      ownerToken,
    );
    expect(put.statusCode).toBe(200);
    expect(put.body).toEqual({
      android: "https://play.google.com/store/apps/details?id=com.eltemplo.app",
      ios: "https://apps.apple.com/app/id0000000000",
    });

    const get = await getStoreUrls(ownerToken);
    expect(get.statusCode).toBe(200);
    expect(get.body).toEqual(put.body);

    const rows = await app.db
      .select({
        key: schema.systemSettings.settingKey,
        value: schema.systemSettings.settingValue,
      })
      .from(schema.systemSettings);
    expect(rows).toHaveLength(2);

    // Segundo PUT solo de android — upsert, no duplica ni pisa ios.
    const put2 = await putStoreUrls(
      {
        android:
          "https://play.google.com/store/apps/details?id=com.eltemplo.app2",
      },
      ownerToken,
    );
    expect(put2.statusCode).toBe(200);
    expect(put2.body).toEqual({
      android:
        "https://play.google.com/store/apps/details?id=com.eltemplo.app2",
      ios: "https://apps.apple.com/app/id0000000000",
    });

    const rowsAfter = await app.db
      .select({ key: schema.systemSettings.settingKey })
      .from(schema.systemSettings);
    expect(rowsAfter).toHaveLength(2);
  });

  it("c. PUT con una URL sin https:// devuelve 400 y no persiste nada", async () => {
    const put = await putStoreUrls(
      {
        android:
          "http://play.google.com/store/apps/details?id=com.eltemplo.app",
      },
      ownerToken,
    );
    expect(put.statusCode).toBe(400);

    const get = await getStoreUrls(ownerToken);
    expect(get.body).toEqual({ android: null, ios: null });
  });

  it("d. PUT con token no-owner (coach) devuelve 403 y no persiste nada", async () => {
    const put = await putStoreUrls(
      {
        android:
          "https://play.google.com/store/apps/details?id=com.eltemplo.app",
      },
      coachToken,
    );
    expect(put.statusCode).toBe(403);

    const get = await getStoreUrls(ownerToken);
    expect(get.body).toEqual({ android: null, ios: null });
  });
});
