/**
 * Phase 152 Plan 04 — ABM de centros de costo (CAJA-05, levanta EGR-F2 de v5.3).
 *
 * Cubre los endpoints HTTP montados bajo /api/admin/finance sobre el
 * CashRegisterService (plan 04) y los schemas del plan 04:
 *   1. CRUD happy path (owner → 2xx): crear (201) / renombrar (200) /
 *      desactivar (200, isActive=false) / reactivar (200, isActive=true).
 *   2. Unicidad por país (D-08): crear un nombre ya existente → 409; renombrar
 *      otro centro a un nombre existente → 409.
 *   3. RBAC admin/owner-only (149 D-04 / T-152-08): gestion y coach en cualquier
 *      escritura → 403; owner → 2xx.
 *   4. Egreso con un centro DESACTIVADO → 400 (registerExpense ya filtra
 *      isActive=true, ~294-304): desactivar saca la categoría del egreso.
 *   5. GET /cost-centers/all incluye inactivos; GET /cost-centers (selector de
 *      egresos) los EXCLUYE.
 *
 * Reusa el harness createTestApp + createStaffUser + getAuthToken de
 * bank-accounts.test.ts. Corre contra la MySQL de test del worker (migración
 * 0165 agrega el uniqueIndex uq_cost_centers_name_country).
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { createTestApp, getAuthToken, createStaffUser } from "../helpers";
import * as schema from "../../src/db/schema";

let app: FastifyInstance;
let ownerToken: string;
let gestionToken: string;
let coachToken: string;
let arsBranchId: number;
let cajaId: number;

const P = `ABM${Date.now() % 1000000}`; // prefijo único por corrida
const createdCenterIds: number[] = [];
const seededCajaIds: number[] = [];
const CUTOFF = "2020-01-01"; // bien antes de "hoy" para que el egreso cuente

interface CenterBody {
  center: {
    id: number;
    name: string;
    country: string;
    isActive: boolean;
  };
}

async function createCenter(
  token: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/finance/cost-centers",
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
  if (res.statusCode === 201) {
    createdCenterIds.push((JSON.parse(res.body) as CenterBody).center.id);
  }
  return { statusCode: res.statusCode, body: res.body };
}

beforeAll(async () => {
  app = await createTestApp();

  const [branch] = await app.db
    .insert(schema.branches)
    .values({ name: "ABM-Test AR", code: `ABM${Date.now() % 100000}` });
  arsBranchId = Number(branch.insertId);

  const [caja] = await app.db.insert(schema.cashRegisters).values({
    name: `ABM-Caja ${Date.now()}`,
    type: "efectivo",
    branchId: arsBranchId,
    currency: "ARS",
    openingBalance: 1000,
    cutoffDate: CUTOFF,
  });
  cajaId = Number(caja.insertId);
  seededCajaIds.push(cajaId);

  const ownerEmail = `abm-owner-${Date.now()}@test.com`;
  await createStaffUser(app, {
    email: ownerEmail,
    password: "TestPass123!",
    firstName: "Owner",
    lastName: "ABM",
    role: "owner",
    branchId: arsBranchId,
    country: "AR",
  });
  ownerToken = await getAuthToken(app, ownerEmail, "TestPass123!");

  const gestionEmail = `abm-gestion-${Date.now()}@test.com`;
  await createStaffUser(app, {
    email: gestionEmail,
    password: "TestPass123!",
    firstName: "Gestion",
    lastName: "ABM",
    role: "gestion",
    branchId: arsBranchId,
    country: "AR",
  });
  gestionToken = await getAuthToken(app, gestionEmail, "TestPass123!");

  const coachEmail = `abm-coach-${Date.now()}@test.com`;
  await createStaffUser(app, {
    email: coachEmail,
    password: "TestPass123!",
    firstName: "Coach",
    lastName: "ABM",
    role: "coach",
    branchId: arsBranchId,
  });
  coachToken = await getAuthToken(app, coachEmail, "TestPass123!");
});

afterAll(async () => {
  // Borrar egresos que referencian la caja seedeada, luego la caja y los centros.
  if (seededCajaIds.length > 0) {
    const txRows = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        inArray(schema.financialTransactions.cashRegisterId, seededCajaIds),
      );
    const txIds = txRows.map((r) => r.id);
    if (txIds.length > 0) {
      await app.db
        .delete(schema.transactionLinks)
        .where(inArray(schema.transactionLinks.transactionId, txIds));
      await app.db
        .delete(schema.financialTransactions)
        .where(inArray(schema.financialTransactions.id, txIds));
    }
    await app.db
      .delete(schema.cashRegisters)
      .where(inArray(schema.cashRegisters.id, seededCajaIds));
  }
  if (createdCenterIds.length > 0) {
    await app.db
      .delete(schema.costCenters)
      .where(inArray(schema.costCenters.id, createdCenterIds));
  }
  await app.close();
});

describe("Phase 152: ABM de centros de costo", () => {
  // ─── CRUD happy path (owner → 2xx) ───────────────────────────────────────
  describe("CRUD (owner)", () => {
    it("crea un centro → 201 con isActive=true", async () => {
      const res = await createCenter(ownerToken, {
        name: `${P} Marketing`,
        country: "AR",
      });
      expect(res.statusCode).toBe(201);
      const { center } = JSON.parse(res.body) as CenterBody;
      expect(center.name).toBe(`${P} Marketing`);
      expect(center.country).toBe("AR");
      expect(center.isActive).toBe(true);
    });

    it("renombra un centro → 200 con el nombre nuevo", async () => {
      const created = await createCenter(ownerToken, {
        name: `${P} Servicios`,
        country: "AR",
      });
      const id = (JSON.parse(created.body) as CenterBody).center.id;

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/finance/cost-centers/${id}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: `${P} Servicios Generales` },
      });
      expect(res.statusCode).toBe(200);
      const { center } = JSON.parse(res.body) as CenterBody;
      expect(center.name).toBe(`${P} Servicios Generales`);
    });

    it("desactiva → 200 isActive=false y reactiva → 200 isActive=true", async () => {
      const created = await createCenter(ownerToken, {
        name: `${P} Ciclo`,
        country: "AR",
      });
      const id = (JSON.parse(created.body) as CenterBody).center.id;

      const off = await app.inject({
        method: "POST",
        url: `/api/admin/finance/cost-centers/${id}/deactivate`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(off.statusCode).toBe(200);
      expect((JSON.parse(off.body) as CenterBody).center.isActive).toBe(false);

      const on = await app.inject({
        method: "POST",
        url: `/api/admin/finance/cost-centers/${id}/reactivate`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(on.statusCode).toBe(200);
      expect((JSON.parse(on.body) as CenterBody).center.isActive).toBe(true);
    });
  });

  // ─── Unicidad por país (D-08 / T-152-10) ─────────────────────────────────
  describe("unicidad de nombre por país → 409", () => {
    it("crear un nombre ya existente en el país → 409", async () => {
      const name = `${P} Duplicado`;
      const first = await createCenter(ownerToken, { name, country: "AR" });
      expect(first.statusCode).toBe(201);

      const dup = await createCenter(ownerToken, { name, country: "AR" });
      expect(dup.statusCode).toBe(409);
    });

    it("renombrar otro centro a un nombre existente → 409", async () => {
      const target = `${P} Ocupado`;
      const occ = await createCenter(ownerToken, {
        name: target,
        country: "AR",
      });
      expect(occ.statusCode).toBe(201);

      const other = await createCenter(ownerToken, {
        name: `${P} Libre`,
        country: "AR",
      });
      const otherId = (JSON.parse(other.body) as CenterBody).center.id;

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/finance/cost-centers/${otherId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: target },
      });
      expect(res.statusCode).toBe(409);
    });

    it("renombrar un centro a su MISMO nombre → 200 (no auto-colisiona)", async () => {
      const name = `${P} MismoNombre`;
      const created = await createCenter(ownerToken, { name, country: "AR" });
      const id = (JSON.parse(created.body) as CenterBody).center.id;

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/finance/cost-centers/${id}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ─── RBAC admin/owner-only (T-152-08) ────────────────────────────────────
  describe("RBAC: escritura admin/owner-only", () => {
    it("gestion en POST create → 403", async () => {
      const res = await createCenter(gestionToken, {
        name: `${P} GestionCreate`,
        country: "AR",
      });
      expect(res.statusCode).toBe(403);
    });

    it("coach en POST create → 403", async () => {
      const res = await createCenter(coachToken, {
        name: `${P} CoachCreate`,
        country: "AR",
      });
      expect(res.statusCode).toBe(403);
    });

    it("gestion en PATCH/deactivate/reactivate → 403", async () => {
      const created = await createCenter(ownerToken, {
        name: `${P} RbacTarget`,
        country: "AR",
      });
      const id = (JSON.parse(created.body) as CenterBody).center.id;

      const rename = await app.inject({
        method: "PATCH",
        url: `/api/admin/finance/cost-centers/${id}`,
        headers: { authorization: `Bearer ${gestionToken}` },
        payload: { name: `${P} NoDeberia` },
      });
      expect(rename.statusCode).toBe(403);

      const off = await app.inject({
        method: "POST",
        url: `/api/admin/finance/cost-centers/${id}/deactivate`,
        headers: { authorization: `Bearer ${gestionToken}` },
      });
      expect(off.statusCode).toBe(403);

      const on = await app.inject({
        method: "POST",
        url: `/api/admin/finance/cost-centers/${id}/reactivate`,
        headers: { authorization: `Bearer ${gestionToken}` },
      });
      expect(on.statusCode).toBe(403);
    });

    it("gestion en GET /cost-centers/all → 403 (ABM admin-only)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/finance/cost-centers/all",
        headers: { authorization: `Bearer ${gestionToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── Egreso con centro desactivado → 400 (T-152-11) ──────────────────────
  describe("egreso con centro desactivado → 400", () => {
    it("registerExpense rechaza un centro is_active=false", async () => {
      const created = await createCenter(ownerToken, {
        name: `${P} EgresoOff`,
        country: "AR",
      });
      const id = (JSON.parse(created.body) as CenterBody).center.id;

      // Con el centro ACTIVO el egreso pasa (201).
      const ok = await app.inject({
        method: "POST",
        url: "/api/admin/finance/expenses",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { cajaId, amount: 100, costCenterId: id },
      });
      expect(ok.statusCode).toBe(201);

      // Se desactiva vía el ABM.
      const off = await app.inject({
        method: "POST",
        url: `/api/admin/finance/cost-centers/${id}/deactivate`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(off.statusCode).toBe(200);

      // Ahora el egreso con ese centro es rechazado (registerExpense filtra activos).
      const rejected = await app.inject({
        method: "POST",
        url: "/api/admin/finance/expenses",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { cajaId, amount: 100, costCenterId: id },
      });
      expect(rejected.statusCode).toBe(400);
    });
  });

  // ─── Selector excluye inactivos / ABM los incluye (D-08) ─────────────────
  describe("selector vs ABM: visibilidad de inactivos", () => {
    it("GET /cost-centers/all incluye el inactivo y GET /cost-centers lo excluye", async () => {
      const name = `${P} Visibilidad`;
      const created = await createCenter(ownerToken, { name, country: "AR" });
      const id = (JSON.parse(created.body) as CenterBody).center.id;

      await app.inject({
        method: "POST",
        url: `/api/admin/finance/cost-centers/${id}/deactivate`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      // ABM (all) → incluye el inactivo con isActive=false.
      const all = await app.inject({
        method: "GET",
        url: "/api/admin/finance/cost-centers/all?country=AR",
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(all.statusCode).toBe(200);
      const centers = (
        JSON.parse(all.body) as { centers: CenterBody["center"][] }
      ).centers;
      const found = centers.find((c) => c.id === id);
      expect(found).toBeDefined();
      expect(found?.isActive).toBe(false);

      // Selector de egresos (active-only) → NO lo incluye.
      const selector = await app.inject({
        method: "GET",
        url: "/api/admin/finance/cost-centers?country=AR",
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(selector.statusCode).toBe(200);
      const rows = JSON.parse(selector.body) as Array<{ id: number }>;
      expect(rows.some((r) => r.id === id)).toBe(false);
    });
  });
});
