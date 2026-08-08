/**
 * Fase 158 Plan 01 — Task 3: endpoint admin GET /api/admin/members/:id/referrals.
 *
 * Datos de la sección "Referidos" de la ficha del alumno (VIS-03/D-34). Gestión
 * lee el overview de CUALQUIER alumno; el mismo estado derivado que la app. El
 * guard es MEMBER_LIFECYCLE_ROLES (WR-05) → coach, recepción y los tokens de
 * socio reciben 403.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import { createPlan, createMember } from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

/**
 * Fase 173 (ADO-02): gimnasio de la escritura DIRECTA de `users` en este
 * archivo. Con `members` en TENANT_STRICT_MODULES un UPDATE crudo sin
 * `tenant_id` en el predicado hace throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const MEMBER_PASSWORD = "pass123456";

interface LinkView {
  userId: number;
  fullName: string;
  state: "pending" | "active" | "suspended";
}
interface OverviewBody {
  referralCode: string;
  discount: { percent: number; activeCount: number };
  referred: LinkView[];
  referredBy: LinkView | null;
}

function url(userId: number): string {
  return `/api/admin/members/${userId}/referrals`;
}

let app: FastifyInstance;
let adminToken: string;
let esBranchId: number;

// Branches are NOT in TABLES_TO_CLEAN — código único por corrida para evitar
// colisiones UNIQUE entre archivos del mismo worker (patrón outstanding-concepts).
function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-Referrals-Test",
      code: nextSuffix("ESRF"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  esBranchId = es.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await app.db.execute(
    sql`INSERT INTO aura_config (aura_config_source_type, default_amount)
        VALUES ('referral', 10)
        ON DUPLICATE KEY UPDATE default_amount = 10`,
  );
  await app.db.execute(
    sql`INSERT INTO system_settings (setting_key, setting_value)
        VALUES ('referral.max_percent_cap', '40')
        ON DUPLICATE KEY UPDATE setting_value = '40'`,
  );
});

async function link(
  referrerId: number,
  referredId: number,
  status: "pending" | "qualified",
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (referrer_id, referred_id, status, attribution_channel, qualified_at)
        VALUES (${referrerId}, ${referredId}, ${status}, 'assisted', NOW())`,
  );
}

async function giveCoverage(
  userId: number,
  planId: number,
  endDate: string,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO subscriptions (user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied)
        VALUES (${userId}, ${planId}, 1, 'active', ${todayStr()}, ${endDate}, 10000, 'ARS', 'regular')`,
  );
}

describe("GET /api/admin/members/:id/referrals — ficha admin", () => {
  it("admin obtiene el overview del alumno objetivo (200 con ambos lados)", async () => {
    const plan = await createPlan(app, adminToken);
    const target = await createMember(app, { email: "a-target@test.com" });
    const bringer = await createMember(app, {
      email: "a-bringer@test.com",
      firstName: "Ana",
      lastName: "Gómez",
    });
    const broughtIn = await createMember(app, { email: "a-brought@test.com" });

    // target fue traído por bringer, y target trajo a broughtIn (activo).
    await link(bringer.id, target.id, "qualified");
    await giveCoverage(bringer.id, plan.id, dateOffsetStr(30));
    await link(target.id, broughtIn.id, "qualified");
    await giveCoverage(broughtIn.id, plan.id, dateOffsetStr(30));

    const res = await app.inject({
      method: "GET",
      url: url(target.id),
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as OverviewBody;

    expect(body.referredBy?.userId).toBe(bringer.id);
    expect(body.referredBy?.fullName).toBe("Ana Gómez");
    expect(body.referred).toHaveLength(1);
    expect(body.referred[0].userId).toBe(broughtIn.id);
    expect(body.referred[0].state).toBe("active");
  });

  it("un socio no-admin recibe 403", async () => {
    const target = await createMember(app, { email: "a-t2@test.com" });
    await createMember(app, { email: "a-socio@test.com" });
    const socioToken = await getAuthToken(
      app,
      "a-socio@test.com",
      MEMBER_PASSWORD,
    );

    const res = await app.inject({
      method: "GET",
      url: url(target.id),
      headers: { authorization: `Bearer ${socioToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("requiere autenticación (401 sin token)", async () => {
    const target = await createMember(app, { email: "a-t3@test.com" });
    const res = await app.inject({ method: "GET", url: url(target.id) });
    expect(res.statusCode).toBe(401);
  });

  // T-106-02 — guard per-member (mismo patrón que financial-history y
  // outstanding-concepts): existencia, soft-delete y country-scope con 404
  // anti info-leak.
  it("404 para un miembro inexistente (no 500)", async () => {
    const res = await app.inject({
      method: "GET",
      url: url(99999999),
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("404 para un miembro soft-deleted", async () => {
    const target = await createMember(app, { email: "a-deleted@test.com" });
    await app.db.execute(
      sql`UPDATE users SET deleted_at = NOW() WHERE id = ${target.id} AND tenant_id = ${TEMPLO_CTX.tenantId}`,
    );
    const res = await app.inject({
      method: "GET",
      url: url(target.id),
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("cross-country: admin ES (no-owner) recibe 404 para un alumno AR", async () => {
    const target = await createMember(app, { email: "a-ar-target@test.com" });
    await createStaffUser(app, {
      email: "ref-admin-es@test.local",
      password: "pass123456",
      firstName: "Admin",
      lastName: "ES",
      role: "admin",
      branchId: esBranchId,
    });
    const adminEsToken = await getAuthToken(
      app,
      "ref-admin-es@test.local",
      "pass123456",
    );
    const res = await app.inject({
      method: "GET",
      url: url(target.id),
      headers: { authorization: `Bearer ${adminEsToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  // WR-05: el guard es MEMBER_LIFECYCLE_ROLES, no ADMIN_ROLES — gestión entra,
  // coach y recepción no (el admin les oculta el tab).
  it("gestión lee el overview de un alumno (200)", async () => {
    const target = await createMember(app, { email: "a-gestion-t@test.com" });
    await createStaffUser(app, {
      email: "ref-gestion@test.local",
      password: MEMBER_PASSWORD,
      firstName: "Gestión",
      lastName: "AR",
      role: "gestion",
      branchId: 1,
    });
    const gestionToken = await getAuthToken(
      app,
      "ref-gestion@test.local",
      MEMBER_PASSWORD,
    );

    const res = await app.inject({
      method: "GET",
      url: url(target.id),
      headers: { authorization: `Bearer ${gestionToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it.each(["coach", "recepcion"])("%s recibe 403", async (role) => {
    const target = await createMember(app, { email: `a-${role}-t@test.com` });
    await createStaffUser(app, {
      email: `ref-${role}@test.local`,
      password: MEMBER_PASSWORD,
      firstName: "Staff",
      lastName: role,
      role,
      branchId: 1,
    });
    const staffToken = await getAuthToken(
      app,
      `ref-${role}@test.local`,
      MEMBER_PASSWORD,
    );

    const res = await app.inject({
      method: "GET",
      url: url(target.id),
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("owner sí lee cross-country (200)", async () => {
    // admin@test.com es owner: el scope de país no lo restringe (T-106-02).
    const target = await createMember(app, { email: "a-any@test.com" });
    const res = await app.inject({
      method: "GET",
      url: url(target.id),
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
