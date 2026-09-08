/**
 * Rol `inversor` (2026-09-08, migración 0225) — alcance FORZADO por sede.
 *
 * El rol hereda la superficie de `gestion` (caja, cobros, alumnos, SP, leads),
 * pero su alcance NO es el país sino sus `user_branches`. Lo que este archivo
 * prueba no es el gate de rol (eso lo fija `rbac-sets.test.ts`) sino el
 * ENFORCEMENT: que pedir otra sede sea 403, que OMITIR la sede no degenere en
 * "todo el país", y que los accesos puntuales por id de otra sede sean 404 y no
 * 403 (criterio ISO-03: indistinguible de inexistente).
 *
 * Los ids de usuario NUNCA se hardcodean: los actores se crean acá con
 * `createStaffUser` y se resuelven por email.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
  createTestMember,
  ensureEfectivoCaja,
  todayStr,
} from "./helpers";
import * as schema from "../src/db/schema";
import { tenantValues, tenantWhere } from "../src/modules/shared/tenant";
import { BRANCH_OUT_OF_SCOPE } from "../src/modules/shared/branch-access";
import { TENANT_TEMPLO } from "./fixtures/second-tenant";

const CTX = { tenantId: TENANT_TEMPLO };
const ADMIN_SCHED = "/api/admin/scheduling";

describe("Rol inversor — alcance forzado por sede", () => {
  let app: FastifyInstance;

  let branchA: number; // la sede del inversor
  let branchB: number; // otra sede del mismo país

  let ownerToken: string;
  let inversorToken: string;
  let inversorId: number;

  let memberAId: number;
  let memberBId: number;

  let cajaAId: number;
  let cajaBId: number;

  let retiroAId: number;
  let retiroBId: number;

  const u = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const pass = "test1234";

  /** Devuelve el id de la caja efectivo de una sede (sembrada por ensureEfectivoCaja). */
  async function cajaDe(branchId: number): Promise<number> {
    const [row] = await app.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, CTX),
          eq(schema.cashRegisters.branchId, branchId),
        ),
      )
      .limit(1);
    return row.id;
  }

  /** Cobro firme (validado) imputado a la caja/sede indicada. */
  async function seedCobro(
    branchId: number,
    cashRegisterId: number,
    memberId: number,
    amount: number,
  ): Promise<number> {
    const [row] = await app.db
      .insert(schema.financialTransactions)
      .values(
        tenantValues(CTX, {
          memberId,
          kind: "plan_charge" as const,
          direction: "inflow" as const,
          amount,
          currency: "ARS",
          paymentMethod: "cash" as const,
          transactionDate: todayStr(),
          effectiveDate: todayStr(),
          branchId,
          cashRegisterId,
          recordedBy: inversorId,
          validationStatus: "validado" as const,
        }),
      )
      .$returningId();
    return row.id;
  }

  /** Cobro PENDIENTE (bandeja) imputado a la caja/sede indicada. */
  async function seedPendiente(
    branchId: number,
    cashRegisterId: number,
    memberId: number,
  ): Promise<number> {
    const [row] = await app.db
      .insert(schema.financialTransactions)
      .values(
        tenantValues(CTX, {
          memberId,
          kind: "plan_charge" as const,
          direction: "inflow" as const,
          amount: 5000,
          currency: "ARS",
          paymentMethod: "cash" as const,
          transactionDate: todayStr(),
          effectiveDate: todayStr(),
          branchId,
          cashRegisterId,
          recordedBy: inversorId,
          validationStatus: "pendiente" as const,
        }),
      )
      .$returningId();
    return row.id;
  }

  /** Retiro de caja: egreso con responsable (el predicado de GET /withdrawals). */
  async function seedRetiro(
    branchId: number,
    cashRegisterId: number,
  ): Promise<number> {
    const [row] = await app.db
      .insert(schema.financialTransactions)
      .values(
        tenantValues(CTX, {
          kind: "expense" as const,
          direction: "outflow" as const,
          amount: 1000,
          currency: "ARS",
          paymentMethod: "cash" as const,
          transactionDate: todayStr(),
          effectiveDate: todayStr(),
          branchId,
          cashRegisterId,
          recordedBy: inversorId,
          responsibleName: `Responsable ${branchId}`,
          validationStatus: "validado" as const,
        }),
      )
      .$returningId();
    return row.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await cleanAllTestData(app);

    const [a] = await app.db
      .insert(schema.branches)
      .values({
        name: `Inversor A ${u}`,
        code: `INA-${u}`.slice(0, 20),
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      })
      .$returningId();
    branchA = a.id;

    const [b] = await app.db
      .insert(schema.branches)
      .values({
        name: `Inversor B ${u}`,
        code: `INB-${u}`.slice(0, 20),
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      })
      .$returningId();
    branchB = b.id;

    await createStaffUser(app, {
      email: `owner-inv-${u}@test.local`,
      password: pass,
      firstName: "Owner",
      lastName: "Inv",
      role: "owner",
      branchId: branchA,
    });
    ownerToken = await getAuthToken(app, `owner-inv-${u}@test.local`, pass);

    inversorId = await createStaffUser(app, {
      email: `inversor-${u}@test.local`,
      password: pass,
      firstName: "Inver",
      lastName: "Sor",
      role: "inversor",
      branchId: branchA,
    });
    inversorToken = await getAuthToken(app, `inversor-${u}@test.local`, pass);

    const mA = await createTestMember(app, { branchId: branchA });
    memberAId = mA.id;
    const mB = await createTestMember(app, { branchId: branchB });
    memberBId = mB.id;

    await ensureEfectivoCaja(app, branchA);
    await ensureEfectivoCaja(app, branchB);
    cajaAId = await cajaDe(branchA);
    cajaBId = await cajaDe(branchB);

    await seedCobro(branchA, cajaAId, memberAId, 10000);
    await seedCobro(branchB, cajaBId, memberBId, 20000);
    await seedPendiente(branchA, cajaAId, memberAId);
    await seedPendiente(branchB, cajaBId, memberBId);
    retiroAId = await seedRetiro(branchA, cajaAId);
    retiroBId = await seedRetiro(branchB, cajaBId);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  function asInversor(url: string) {
    return app.inject({
      method: "GET",
      url,
      headers: { authorization: `Bearer ${inversorToken}` },
    });
  }

  // =========================================================================
  // 1. Alumnos
  // =========================================================================
  describe("Alumnos", () => {
    it("GET /admin/members sin branchId → SOLO socios de su sede", async () => {
      const res = await asInversor("/api/admin/members?page=1&limit=100");
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        members: { id: number; branchId: number }[];
      };
      const ids = body.members.map((m) => m.id);
      expect(ids).toContain(memberAId);
      expect(ids).not.toContain(memberBId);
      expect(body.members.every((m) => m.branchId === branchA)).toBe(true);
    });

    it("GET /admin/members?branchId=<otra sede> → 403 BRANCH_OUT_OF_SCOPE", async () => {
      const res = await asInversor(`/api/admin/members?branchId=${branchB}`);
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).code).toBe(BRANCH_OUT_OF_SCOPE);
    });

    it("GET /admin/members?multiBranch=true NO evade el filtro de sede", async () => {
      // Regresión: `multiBranch` compartía un `else if` con `branchId`, así que
      // el filtro inyectado quedaba sin aplicar y el listado volvía al país.
      const res = await asInversor(
        "/api/admin/members?multiBranch=true&page=1&limit=100",
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { members: { id: number }[] };
      expect(body.members.map((m) => m.id)).not.toContain(memberBId);
    });

    it("GET /admin/members/:id de otra sede → 404 (nunca 403: ISO-03)", async () => {
      const res = await asInversor(`/api/admin/members/${memberBId}`);
      expect(res.statusCode).toBe(404);
    });

    it("GET /admin/members/:id de su sede → 200", async () => {
      const res = await asInversor(`/api/admin/members/${memberAId}`);
      expect(res.statusCode).toBe(200);
    });

    it("GET /admin/members/search NO devuelve socios de otra sede", async () => {
      const res = await asInversor("/api/admin/members/search?search=Test");
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { members: { id: number }[] };
      const ids = body.members.map((m) => m.id);
      expect(ids).not.toContain(memberBId);
    });

    it("GET /admin/members/branches → SOLO su sede (ni la otra, ni la virtual)", async () => {
      const res = await asInversor("/api/admin/members/branches");
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { branches: { id: number }[] };
      const ids = body.branches.map((b) => b.id);
      expect(ids).toEqual([branchA]);
    });
  });

  // =========================================================================
  // 2. Finanzas
  // =========================================================================
  describe("Caja", () => {
    it("GET /finance/transactions sin branchId → solo su sede", async () => {
      const res = await asInversor(
        "/api/admin/finance/transactions?page=1&limit=100",
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        rows: { branchId: number | null }[];
      };
      expect(body.rows.length).toBeGreaterThan(0);
      expect(body.rows.every((r) => r.branchId === branchA)).toBe(true);
    });

    it("GET /finance/transactions?branchId=<otra> → 403", async () => {
      const res = await asInversor(
        `/api/admin/finance/transactions?branchId=${branchB}`,
      );
      // Sin `code` en el assert: `listTransactionsSchema` declara
      // `403: errorSchema`, que serializa sólo `{ error, message }` y se come el
      // `code` de `requireBranchAccess`. Es comportamiento PREEXISTENTE de esta
      // ruta (le pasa igual al 403 cross-país de admin), no algo del rol nuevo.
      expect(res.statusCode).toBe(403);
    });

    it("GET /finance/pending-tray → solo pendientes de su sede", async () => {
      const res = await asInversor(
        "/api/admin/finance/pending-tray?status=pendientes&page=1&limit=100",
      );
      expect(res.statusCode).toBe(200);
      // `PendingTrayItem` no expone `branchId` — la sede se verifica por la caja
      // (cada sede tiene la suya, sembradas en el beforeAll).
      const body = JSON.parse(res.body) as {
        rows: { cashRegisterId: number | null }[];
      };
      expect(body.rows.length).toBeGreaterThan(0);
      expect(body.rows.every((r) => r.cashRegisterId === cajaAId)).toBe(true);
    });

    it("GET /finance/cash-registers/balances → solo la caja de su sede", async () => {
      const res = await asInversor(
        "/api/admin/finance/cash-registers/balances",
      );
      expect(res.statusCode).toBe(200);
      const rows = JSON.parse(res.body) as {
        cashRegisterId: number;
        branchId: number | null;
      }[];
      const ids = rows.map((r) => r.cashRegisterId);
      expect(ids).toContain(cajaAId);
      expect(ids).not.toContain(cajaBId);
      expect(rows.every((r) => r.branchId === branchA)).toBe(true);
    });

    it("GET /finance/withdrawals → solo retiros de su sede", async () => {
      const res = await asInversor(
        "/api/admin/finance/withdrawals?page=1&limit=100",
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { rows: { id: number }[] };
      const ids = body.rows.map((r) => r.id);
      expect(ids).toContain(retiroAId);
      expect(ids).not.toContain(retiroBId);
    });

    it("GET /finance/withdrawals/:id de otra sede → 404", async () => {
      const res = await asInversor(
        `/api/admin/finance/withdrawals/${retiroBId}`,
      );
      expect(res.statusCode).toBe(404);
    });

    it("GET /finance/withdrawals/:id de su sede → 200", async () => {
      const res = await asInversor(
        `/api/admin/finance/withdrawals/${retiroAId}`,
      );
      expect(res.statusCode).toBe(200);
    });

    it("GET /finance/movements-history → solo movimientos de su caja", async () => {
      const res = await asInversor(
        "/api/admin/finance/movements-history?page=1&limit=100",
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        rows: { cashRegisterId: number | null }[];
      };
      expect(body.rows.length).toBeGreaterThan(0);
      expect(body.rows.every((r) => r.cashRegisterId !== cajaBId)).toBe(true);
    });
  });

  // =========================================================================
  // 3. Sesiones de prueba
  // =========================================================================
  describe("Sesiones de prueba", () => {
    let scheduleA: number;
    let scheduleB: number;
    let pruebaA: number;
    let pruebaB: number;
    let fecha: string;

    /** Próxima fecha (>= mañana) cuyo día de semana coincide con `dow`. */
    function proximaFecha(dow: number): string {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }

    beforeAll(async () => {
      const actRes = await app.inject({
        method: "POST",
        url: `${ADMIN_SCHED}/activities`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: `Calistenia ${u}`, description: "Clase" },
      });
      expect(actRes.statusCode).toBe(201);
      const activityId = (JSON.parse(actRes.body) as { id: number }).id;

      // Día de semana relativo a hoy (nunca una fecha fija: rompe por calendario).
      const dow = ((new Date().getDay() + 2) % 7 || 1) as number;
      fecha = proximaFecha(dow);

      for (const [branchId, sink] of [
        [branchA, "A"],
        [branchB, "B"],
      ] as const) {
        const res = await app.inject({
          method: "POST",
          url: `${ADMIN_SCHED}/schedules`,
          headers: { authorization: `Bearer ${ownerToken}` },
          payload: {
            branchId,
            activityId,
            dayOfWeek: dow,
            startTime: "10:00",
            endTime: "11:00",
          },
        });
        expect(res.statusCode).toBe(201);
        const id = (JSON.parse(res.body) as { id: number }).id;
        if (sink === "A") scheduleA = id;
        else scheduleB = id;
      }

      for (const [branchId, sink] of [
        [branchA, "A"],
        [branchB, "B"],
      ] as const) {
        const res = await app.inject({
          method: "POST",
          url: "/api/admin/members",
          headers: { authorization: `Bearer ${ownerToken}` },
          payload: {
            email: `prueba-${sink}-${u}@test.local`,
            firstName: "Prueba",
            lastName: sink,
            branchId,
            phone: `1155${sink === "A" ? "0001" : "0002"}${u.slice(0, 4)}`,
            dni: `${sink === "A" ? "81" : "82"}${u.slice(0, 6)}`,
          },
        });
        expect(res.statusCode).toBe(201);
        const id = (JSON.parse(res.body) as { id: number }).id;
        if (sink === "A") pruebaA = id;
        else pruebaB = id;
      }
    });

    it("POST /trials sobre un horario de OTRA sede → 403", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${ADMIN_SCHED}/trials`,
        headers: { authorization: `Bearer ${inversorToken}` },
        payload: {
          userId: pruebaB,
          scheduleId: scheduleB,
          bookingDate: fecha,
        },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).code).toBe(BRANCH_OUT_OF_SCOPE);
    });

    it("POST /trials sobre un horario de SU sede → 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${ADMIN_SCHED}/trials`,
        headers: { authorization: `Bearer ${inversorToken}` },
        payload: {
          userId: pruebaA,
          scheduleId: scheduleA,
          bookingDate: fecha,
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it("GET /trials sin branchId → solo su sede", async () => {
      // La SP de la sede B se agenda con el owner para que exista y NO aparezca.
      const seed = await app.inject({
        method: "POST",
        url: `${ADMIN_SCHED}/trials`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          userId: pruebaB,
          scheduleId: scheduleB,
          bookingDate: fecha,
        },
      });
      expect(seed.statusCode).toBe(201);

      const res = await asInversor(`${ADMIN_SCHED}/trials?date=${fecha}`);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        groups: { branchId: number }[];
      };
      expect(body.groups.map((g) => g.branchId)).toEqual([branchA]);
    });

    it("GET /trials?branchId=<otra> → 403", async () => {
      const res = await asInversor(
        `${ADMIN_SCHED}/trials?date=${fecha}&branchId=${branchB}`,
      );
      expect(res.statusCode).toBe(403);
    });
  });

  // =========================================================================
  // 4. Superficie de dueño: 403
  // =========================================================================
  describe("Superficies que NO le tocan", () => {
    it("GET /admin/users → 403 (owner-only)", async () => {
      const res = await asInversor("/api/admin/users");
      expect(res.statusCode).toBe(403);
    });

    it("GET /admin/analytics (KPIs) → 403 (ADMIN_ROLES)", async () => {
      const res = await asInversor("/api/admin/analytics");
      expect(res.statusCode).toBe(403);
    });

    it("GET /admin/reports/multibranch-reassignment-preview → 403 (agregado cross-sede)", async () => {
      const res = await asInversor(
        "/api/admin/reports/multibranch-reassignment-preview",
      );
      expect(res.statusCode).toBe(403);
    });

    it("GET /admin/improvement-proposals → 403 (superficie global del gimnasio)", async () => {
      const res = await asInversor("/api/admin/improvement-proposals");
      expect(res.statusCode).toBe(403);
    });

    it("GET /admin/referral-partners → 403 (superficie global del gimnasio)", async () => {
      const res = await asInversor("/api/admin/referral-partners");
      expect(res.statusCode).toBe(403);
    });
  });

  // =========================================================================
  // 5. Alta/edición del propio rol desde Usuarios
  // =========================================================================
  describe("PUT /admin/users/:id — sedes del inversor", () => {
    it("persiste branchIds en user_branches (reemplazo completo)", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/users/${inversorId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { branchIds: [branchA, branchB] },
      });
      expect(res.statusCode).toBe(200);

      const rows = await app.db
        .select({ branchId: schema.userBranches.branchId })
        .from(schema.userBranches)
        .where(
          and(
            tenantWhere(schema.userBranches, CTX),
            eq(schema.userBranches.userId, inversorId),
          ),
        );
      expect(rows.map((r) => r.branchId).sort((x, y) => x - y)).toEqual(
        [branchA, branchB].sort((x, y) => x - y),
      );

      // Con DOS sedes y sin elegir una, los agregados piden que elija (400
      // BRANCH_REQUIRED) en vez de mostrarle las dos mezcladas.
      const listado = await asInversor("/api/admin/members?page=1&limit=10");
      expect(listado.statusCode).toBe(400);

      // Y elegir cualquiera de las suyas sigue funcionando.
      const conSede = await asInversor(
        `/api/admin/members?branchId=${branchB}&page=1&limit=10`,
      );
      expect(conSede.statusCode).toBe(200);

      // Se restituye el estado de una sola sede para no contaminar otros tests.
      const restore = await app.inject({
        method: "PUT",
        url: `/api/admin/users/${inversorId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { branchIds: [branchA] },
      });
      expect(restore.statusCode).toBe(200);
    });
  });
});
