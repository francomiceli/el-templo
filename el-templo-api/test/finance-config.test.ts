/**
 * Phase 142 (MIG-01) — Finance config (umbral de pendientes) integration tests.
 *
 * GET/PUT /api/admin/finance/config/overdue-threshold reuse the system_settings
 * key-value table (key finance.pending_overdue_days) to make the 141 bandeja
 * overdue threshold admin-configurable.
 *
 * Covers:
 *   - GET as owner/admin → 200 with the current threshold (seeded/default 3)
 *   - GET/PUT as gestion → 403 (FINANCE_READ_ROLES trap: passes the module
 *     guard, fails the per-handler ADMIN_ROLES check)
 *   - PUT as coach/recepcion → 403
 *   - PUT valid as owner → 200; subsequent GET round-trips the value
 *   - PUT 0 / negative / >365 / non-integer → 400 (no write)
 *   - Dynamic threshold: PUT 5 → GET /pending-tray returns thresholdDays=5 and
 *     isOverdue reflects 5 (a 4-day-old pendiente is NOT overdue, a 6-day-old IS)
 *   - Absent setting: delete the row → reads fall back to the canonical 3
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  registerUser,
  ensureEfectivoCaja,
} from "./helpers";
import * as schema from "../src/db/schema";
import { OVERDUE_DAYS } from "../src/modules/finance/constants";
import { FINANCE_SETTINGS_KEYS } from "../src/modules/finance/config-service";

const CONFIG_URL = "/api/admin/finance/config/overdue-threshold";
const PENDING_TRAY_URL = "/api/admin/finance/pending-tray";

let app: FastifyInstance;
let adminId: number;
let branchId: number;
let memberId: number;
let cajaId: number;

let ownerToken: string;
let adminToken: string;
let gestionToken: string;
let coachToken: string;
let recepcionToken: string;

/** YYYY-MM-DD `n` days before today (local). */
function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Insert a pendiente row directly so the test pins its age + caja. */
async function seedPendiente(transactionDate: string): Promise<number> {
  const [res] = await app.db
    .insert(schema.financialTransactions)
    .values({
      memberId,
      kind: "plan_charge",
      direction: "inflow",
      amount: 1000,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate,
      effectiveDate: transactionDate,
      branchId,
      cashRegisterId: cajaId,
      recordedBy: adminId,
      validationStatus: "pendiente",
    })
    .$returningId();
  return res.id;
}

/** Force the system_settings threshold value (bypassing the PUT bounds). */
async function setThresholdRow(value: string): Promise<void> {
  await app.db
    .insert(schema.systemSettings)
    .values({
      settingKey: FINANCE_SETTINGS_KEYS.PENDING_OVERDUE_DAYS,
      settingValue: value,
    })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

async function deleteThresholdRow(): Promise<void> {
  await app.db
    .delete(schema.systemSettings)
    .where(
      eq(
        schema.systemSettings.settingKey,
        FINANCE_SETTINGS_KEYS.PENDING_OVERDUE_DAYS,
      ),
    );
}

interface PendingTrayRow {
  id: number;
  ageInDays: number;
  isOverdue: boolean;
  transactionDate: string;
}

async function fetchTray(token: string): Promise<{
  statusCode: number;
  rows: PendingTrayRow[];
  thresholdDays: number;
}> {
  const res = await app.inject({
    method: "GET",
    url: PENDING_TRAY_URL,
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.statusCode !== 200) {
    return { statusCode: res.statusCode, rows: [], thresholdDays: 0 };
  }
  const body = JSON.parse(res.body) as {
    rows: PendingTrayRow[];
    thresholdDays: number;
  };
  return {
    statusCode: res.statusCode,
    rows: body.rows,
    thresholdDays: body.thresholdDays,
  };
}

async function getConfig(token: string): Promise<{
  statusCode: number;
  thresholdDays: number | null;
}> {
  const res = await app.inject({
    method: "GET",
    url: CONFIG_URL,
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.statusCode !== 200) {
    return { statusCode: res.statusCode, thresholdDays: null };
  }
  const body = JSON.parse(res.body) as { thresholdDays: number };
  return { statusCode: res.statusCode, thresholdDays: body.thresholdDays };
}

async function putConfig(
  token: string,
  thresholdDays: unknown,
): Promise<{ statusCode: number; body: unknown }> {
  const res = await app.inject({
    method: "PUT",
    url: CONFIG_URL,
    headers: { authorization: `Bearer ${token}` },
    payload: { thresholdDays },
  });
  let body: unknown = null;
  try {
    body = JSON.parse(res.body);
  } catch {
    body = res.body;
  }
  return { statusCode: res.statusCode, body };
}

beforeAll(async () => {
  app = await createTestApp();

  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  adminId = admin.id;
  branchId = admin.branchId ?? 1;
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  await createStaffUser(app, {
    email: "owner-cfg@test.local",
    password: "pass123456",
    firstName: "Owner",
    lastName: "Cfg",
    role: "owner",
    branchId,
  });
  ownerToken = await getAuthToken(app, "owner-cfg@test.local", "pass123456");

  await createStaffUser(app, {
    email: "gestion-cfg@test.local",
    password: "pass123456",
    firstName: "Gestion",
    lastName: "Cfg",
    role: "gestion",
    branchId,
  });
  gestionToken = await getAuthToken(
    app,
    "gestion-cfg@test.local",
    "pass123456",
  );

  await createStaffUser(app, {
    email: "coach-cfg@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Cfg",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(app, "coach-cfg@test.local", "pass123456");

  await createStaffUser(app, {
    email: "recepcion-cfg@test.local",
    password: "pass123456",
    firstName: "Recepcion",
    lastName: "Cfg",
    role: "recepcion",
    branchId,
  });
  recepcionToken = await getAuthToken(
    app,
    "recepcion-cfg@test.local",
    "pass123456",
  );

  const member = await registerUser(app, {
    email: `cfg-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Cfg",
    lastName: "Member",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  await ensureEfectivoCaja(app, branchId);
  const [caja] = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(eq(schema.cashRegisters.branchId, branchId))
    .limit(1);
  cajaId = caja.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.db.execute(sql`DELETE FROM transaction_links`);
  await app.db.execute(sql`DELETE FROM financial_transactions`);
  // Each test starts from the canonical default (3) so reads/flows are
  // deterministic regardless of prior PUTs.
  await setThresholdRow(String(OVERDUE_DAYS));
});

describe("MIG-01: GET /config/overdue-threshold", () => {
  it("owner → 200 with the current threshold", async () => {
    const { statusCode, thresholdDays } = await getConfig(ownerToken);
    expect(statusCode).toBe(200);
    expect(thresholdDays).toBe(OVERDUE_DAYS);
  });

  it("admin → 200 with the current threshold", async () => {
    const { statusCode, thresholdDays } = await getConfig(adminToken);
    expect(statusCode).toBe(200);
    expect(thresholdDays).toBe(OVERDUE_DAYS);
  });

  it("gestion → 403 (FINANCE_READ_ROLES trap closed by per-handler ADMIN_ROLES)", async () => {
    const { statusCode } = await getConfig(gestionToken);
    expect(statusCode).toBe(403);
  });

  it("coach → 403", async () => {
    const { statusCode } = await getConfig(coachToken);
    expect(statusCode).toBe(403);
  });

  it("recepcion → 403", async () => {
    const { statusCode } = await getConfig(recepcionToken);
    expect(statusCode).toBe(403);
  });

  it("absent setting → falls back to the canonical default (3)", async () => {
    await deleteThresholdRow();
    const { statusCode, thresholdDays } = await getConfig(ownerToken);
    expect(statusCode).toBe(200);
    expect(thresholdDays).toBe(OVERDUE_DAYS);
  });
});

describe("MIG-01: PUT /config/overdue-threshold", () => {
  it("owner valid → 200 and GET round-trips the value", async () => {
    const put = await putConfig(ownerToken, 7);
    expect(put.statusCode).toBe(200);
    expect(put.body).toEqual({ thresholdDays: 7 });

    const { thresholdDays } = await getConfig(ownerToken);
    expect(thresholdDays).toBe(7);
  });

  it("admin valid → 200", async () => {
    const put = await putConfig(adminToken, 10);
    expect(put.statusCode).toBe(200);
    const { thresholdDays } = await getConfig(adminToken);
    expect(thresholdDays).toBe(10);
  });

  it("gestion → 403 (no write)", async () => {
    const put = await putConfig(gestionToken, 9);
    expect(put.statusCode).toBe(403);
    const { thresholdDays } = await getConfig(ownerToken);
    expect(thresholdDays).toBe(OVERDUE_DAYS);
  });

  it("coach → 403", async () => {
    const put = await putConfig(coachToken, 9);
    expect(put.statusCode).toBe(403);
  });

  it("recepcion → 403", async () => {
    const put = await putConfig(recepcionToken, 9);
    expect(put.statusCode).toBe(403);
  });

  it("0 → 400 (no write)", async () => {
    const put = await putConfig(ownerToken, 0);
    expect(put.statusCode).toBe(400);
    const { thresholdDays } = await getConfig(ownerToken);
    expect(thresholdDays).toBe(OVERDUE_DAYS);
  });

  it("negative → 400", async () => {
    const put = await putConfig(ownerToken, -5);
    expect(put.statusCode).toBe(400);
  });

  it("> 365 → 400", async () => {
    const put = await putConfig(ownerToken, 366);
    expect(put.statusCode).toBe(400);
  });

  it("non-integer → 400", async () => {
    const put = await putConfig(ownerToken, 3.5);
    expect(put.statusCode).toBe(400);
  });
});

describe("MIG-01: dynamic threshold flows into /pending-tray", () => {
  it("PUT 5 → /pending-tray thresholdDays=5 and isOverdue reflects 5", async () => {
    const fresh = await seedPendiente(daysAgo(4)); // 4 days < 5 → NOT overdue
    const old = await seedPendiente(daysAgo(6)); // 6 days > 5 → overdue

    const put = await putConfig(ownerToken, 5);
    expect(put.statusCode).toBe(200);

    const { statusCode, rows, thresholdDays } = await fetchTray(adminToken);
    expect(statusCode).toBe(200);
    expect(thresholdDays).toBe(5);

    const freshRow = rows.find((r) => r.id === fresh);
    const oldRow = rows.find((r) => r.id === old);
    expect(freshRow?.isOverdue).toBe(false);
    expect(oldRow?.isOverdue).toBe(true);
  });

  it("absent setting → /pending-tray falls back to thresholdDays=3", async () => {
    await deleteThresholdRow();
    await seedPendiente(daysAgo(4)); // 4 > 3 → overdue under the fallback

    const { rows, thresholdDays } = await fetchTray(adminToken);
    expect(thresholdDays).toBe(OVERDUE_DAYS);
    expect(rows[0]?.isOverdue).toBe(true);
  });
});
