/**
 * Integration tests — staff-attendance: registro multi-sede y tablero
 * (2026-10-08).
 *
 * Endpoints:
 *   GET /api/admin/staff-attendance/shifts     (branchId opcional + country)
 *   GET /api/admin/staff-attendance/dashboard
 *
 * Los inserts van directo a la DB con `tenantValues` (el sentinel de tenancy
 * rechaza queries sin tenant_id). Las asserts se acotan a las sedes que crea
 * este archivo: la DB puede tener jornadas de otras sedes.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues } from "../../src/modules/shared/tenant";
import { todayInTz } from "../../src/modules/shared/date-utils";
import { BRANCH_OUT_OF_SCOPE } from "../../src/modules/shared/branch-access";

const SHIFTS_URL = "/api/admin/staff-attendance/shifts";
const DASHBOARD_URL = "/api/admin/staff-attendance/dashboard";

const CTX = { tenantId: TENANT_TEMPLO };
const TZ_AR = "America/Argentina/Buenos_Aires";
const TZ_ES = "Europe/Madrid";

function uniqueSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 10000)
    .toString(36)
    .padStart(3, "0");
  return `${prefix}${t}${r}`;
}

/** Suma `days` a una fecha `YYYY-MM-DD` (noon-UTC, sin drift de DST). */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface ShiftRow {
  id: number;
  userId: number;
  userName: string;
  branchId: number;
  branchName: string;
  shiftDate: string;
  checkedOutAt: string | null;
  durationMinutes: number | null;
}

interface DashboardBody {
  branches: { id: number; name: string }[];
  openNow: {
    shiftId: number;
    userId: number;
    userName: string;
    branchId: number;
    branchName: string;
    checkedInAt: string;
  }[];
  staleOpen: {
    shiftId: number;
    userId: number;
    branchId: number;
    shiftDate: string;
  }[];
  totals: {
    shifts: number;
    closedShifts: number;
    openShifts: number;
    totalMinutes: number;
  };
  byPerson: {
    userId: number;
    userName: string;
    branchNames: string[];
    shifts: number;
    totalMinutes: number;
  }[];
}

describe("Staff Attendance — registro multi-sede y tablero", () => {
  let app: FastifyInstance;

  let branchAId: number;
  let branchBId: number;
  let branchEsId: number;

  let adminToken: string;
  let ownerToken: string;
  let coachToken: string;

  let person1Id: number;
  let person2Id: number;
  let person3Id: number;
  let person1Name: string;

  let today: string;
  let yesterday: string;
  let rangeFrom: string;
  let rangeTo: string;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanAllTestData(app);

    const u = uniqueSuffix("SD");
    today = todayInTz(TZ_AR);
    yesterday = addDays(today, -1);
    rangeFrom = addDays(today, -5);
    const todayEs = todayInTz(TZ_ES);
    rangeTo = todayEs > today ? todayEs : today;

    const insertBranch = async (
      label: string,
      country: "AR" | "ES",
      timezone: string,
    ): Promise<number> => {
      const [row] = await app.db
        .insert(schema.branches)
        .values(
          tenantValues(CTX, {
            name: `Dash ${label} ${u}`,
            code: `D${label}-${u}`.slice(0, 20),
            country,
            isActive: true,
            timezone,
            isVirtual: false,
          }),
        )
        .$returningId();
      return row.id;
    };
    branchAId = await insertBranch("A", "AR", TZ_AR);
    branchBId = await insertBranch("B", "AR", TZ_AR);
    branchEsId = await insertBranch("E", "ES", TZ_ES);

    const mkUser = async (
      key: string,
      role: string,
      country?: "AR" | "ES",
    ): Promise<{ id: number; email: string }> => {
      const email = `${key}-${u}@test.local`;
      const id = await createStaffUser(app, {
        email,
        password: "test1234",
        firstName: key,
        lastName: `Dash${u}`,
        role,
        branchId: branchAId,
        country,
      });
      return { id, email };
    };

    const admin = await mkUser("admin", "admin", "AR");
    const owner = await mkUser("owner", "owner");
    const coach = await mkUser("coach", "coach");
    adminToken = await getAuthToken(app, admin.email, "test1234");
    ownerToken = await getAuthToken(app, owner.email, "test1234");
    coachToken = await getAuthToken(app, coach.email, "test1234");

    const p1 = await mkUser("persona1", "coach");
    const p2 = await mkUser("persona2", "recepcion");
    const p3 = await mkUser("persona3", "coach");
    person1Id = p1.id;
    person2Id = p2.id;
    person3Id = p3.id;
    person1Name = `persona1 Dash${u}`;

    const at = (date: string, hour: number, minute = 0): Date =>
      new Date(`${date}T${String(hour).padStart(2, "0")}:${minute}:00Z`);
    const minutesLater = (d: Date, min: number): Date =>
      new Date(d.getTime() + min * 60000);

    const insertShift = async (v: {
      userId: number;
      branchId: number;
      shiftDate: string;
      checkedInAt: Date;
      checkedOutAt?: Date;
    }): Promise<void> => {
      await app.db.insert(schema.staffShifts).values(
        tenantValues(CTX, {
          userId: v.userId,
          branchId: v.branchId,
          shiftDate: v.shiftDate,
          checkedInAt: v.checkedInAt,
          checkedOutAt: v.checkedOutAt ?? null,
        }),
      );
    };

    // Sede A: persona1 con dos cerradas (90 + 30 min), persona2 abierta HOY,
    // persona3 abierta AYER (sin check-out).
    const a1 = at(today, 12);
    await insertShift({
      userId: person1Id,
      branchId: branchAId,
      shiftDate: today,
      checkedInAt: a1,
      checkedOutAt: minutesLater(a1, 90),
    });
    const a2 = at(addDays(today, -2), 12);
    await insertShift({
      userId: person1Id,
      branchId: branchAId,
      shiftDate: addDays(today, -2),
      checkedInAt: a2,
      checkedOutAt: minutesLater(a2, 30),
    });
    await insertShift({
      userId: person2Id,
      branchId: branchAId,
      shiftDate: today,
      checkedInAt: new Date(),
    });
    await insertShift({
      userId: person3Id,
      branchId: branchAId,
      shiftDate: yesterday,
      checkedInAt: at(yesterday, 12),
    });

    // Sede B (AR): persona1 cerrada 60 min.
    const b1 = at(today, 13);
    await insertShift({
      userId: person1Id,
      branchId: branchBId,
      shiftDate: today,
      checkedInAt: b1,
      checkedOutAt: minutesLater(b1, 60),
    });

    // Sede ES: persona2 cerrada 45 min (fecha de hoy en Madrid).
    const e1 = at(todayEs, 9);
    await insertShift({
      userId: person2Id,
      branchId: branchEsId,
      shiftDate: todayEs,
      checkedInAt: e1,
      checkedOutAt: minutesLater(e1, 45),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (url: string, token: string) =>
    app.inject({
      method: "GET",
      url,
      headers: { Authorization: `Bearer ${token}` },
    });

  const branchIdsOf = (rows: ShiftRow[]): Set<number> =>
    new Set(rows.map((r) => r.branchId));

  describe("GET /shifts sin branchId", () => {
    it("owner ve las jornadas de varias sedes (AR y ES)", async () => {
      const res = await get(
        `${SHIFTS_URL}?from=${rangeFrom}&to=${rangeTo}`,
        ownerToken,
      );
      expect(res.statusCode).toBe(200);
      const rows: ShiftRow[] = JSON.parse(res.body).shifts;
      const ids = branchIdsOf(rows);
      expect(ids.has(branchAId)).toBe(true);
      expect(ids.has(branchBId)).toBe(true);
      expect(ids.has(branchEsId)).toBe(true);
    });

    it("owner con ?country=ES ve solo sedes de España", async () => {
      const res = await get(
        `${SHIFTS_URL}?from=${rangeFrom}&to=${rangeTo}&country=ES`,
        ownerToken,
      );
      expect(res.statusCode).toBe(200);
      const ids = branchIdsOf(JSON.parse(res.body).shifts);
      expect(ids.has(branchEsId)).toBe(true);
      expect(ids.has(branchAId)).toBe(false);
      expect(ids.has(branchBId)).toBe(false);
    });

    it("owner con ?country=AR no ve la sede de España", async () => {
      const res = await get(
        `${SHIFTS_URL}?from=${rangeFrom}&to=${rangeTo}&country=AR`,
        ownerToken,
      );
      expect(res.statusCode).toBe(200);
      const ids = branchIdsOf(JSON.parse(res.body).shifts);
      expect(ids.has(branchAId)).toBe(true);
      expect(ids.has(branchEsId)).toBe(false);
    });

    it("admin (AR) ve las sedes de su país y NO la de España, ni con ?country=ES", async () => {
      for (const extra of ["", "&country=ES"]) {
        const res = await get(
          `${SHIFTS_URL}?from=${rangeFrom}&to=${rangeTo}${extra}`,
          adminToken,
        );
        expect(res.statusCode).toBe(200);
        const ids = branchIdsOf(JSON.parse(res.body).shifts);
        expect(ids.has(branchAId)).toBe(true);
        expect(ids.has(branchBId)).toBe(true);
        expect(ids.has(branchEsId)).toBe(false);
      }
    });

    it("admin pidiendo explícitamente la sede de España -> 403", async () => {
      const res = await get(
        `${SHIFTS_URL}?branchId=${branchEsId}&from=${rangeFrom}&to=${rangeTo}`,
        adminToken,
      );
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).code).toBe(BRANCH_OUT_OF_SCOPE);
    });

    it("con branchId solo devuelve esa sede (comportamiento previo)", async () => {
      const res = await get(
        `${SHIFTS_URL}?branchId=${branchBId}&from=${rangeFrom}&to=${rangeTo}`,
        adminToken,
      );
      expect(res.statusCode).toBe(200);
      const rows: ShiftRow[] = JSON.parse(res.body).shifts;
      expect(rows.length).toBe(1);
      expect(rows[0].branchId).toBe(branchBId);
      expect(rows[0].durationMinutes).toBe(60);
    });

    it("rango > 62 días sin branchId -> 400", async () => {
      const res = await get(
        `${SHIFTS_URL}?from=2026-01-01&to=2026-04-15`,
        ownerToken,
      );
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /dashboard", () => {
    it("openNow incluye la abierta de hoy y staleOpen la de ayer (sede A)", async () => {
      const res = await get(
        `${DASHBOARD_URL}?branchId=${branchAId}&from=${rangeFrom}&to=${rangeTo}`,
        adminToken,
      );
      expect(res.statusCode).toBe(200);
      const body: DashboardBody = JSON.parse(res.body);

      expect(body.branches.map((b) => b.id)).toEqual([branchAId]);

      expect(body.openNow.map((s) => s.userId)).toEqual([person2Id]);
      expect(body.openNow[0].branchId).toBe(branchAId);
      expect(typeof body.openNow[0].checkedInAt).toBe("string");

      expect(body.staleOpen.map((s) => s.userId)).toEqual([person3Id]);
      expect(body.staleOpen[0].shiftDate).toBe(yesterday);
    });

    it("staleOpen y openNow ignoran el rango pedido", async () => {
      // Rango en el pasado lejano: las abiertas igual aparecen.
      const from = addDays(today, -40);
      const to = addDays(today, -30);
      const res = await get(
        `${DASHBOARD_URL}?branchId=${branchAId}&from=${from}&to=${to}`,
        adminToken,
      );
      expect(res.statusCode).toBe(200);
      const body: DashboardBody = JSON.parse(res.body);
      expect(body.openNow.length).toBe(1);
      expect(body.staleOpen.length).toBe(1);
      expect(body.totals).toEqual({
        shifts: 0,
        closedShifts: 0,
        openShifts: 0,
        totalMinutes: 0,
      });
      expect(body.byPerson).toEqual([]);
    });

    it("totals y byPerson suman bien las cerradas de duración conocida (sede A)", async () => {
      const res = await get(
        `${DASHBOARD_URL}?branchId=${branchAId}&from=${rangeFrom}&to=${rangeTo}`,
        adminToken,
      );
      const body: DashboardBody = JSON.parse(res.body);

      // 2 cerradas (90 + 30) + 2 abiertas (hoy y ayer).
      expect(body.totals).toEqual({
        shifts: 4,
        closedShifts: 2,
        openShifts: 2,
        totalMinutes: 120,
      });

      expect(body.byPerson[0]).toMatchObject({
        userId: person1Id,
        userName: person1Name,
        shifts: 2,
        totalMinutes: 120,
      });
      expect(body.byPerson[0].branchNames).toHaveLength(1);
      const minutes = body.byPerson.map((p) => p.totalMinutes);
      expect([...minutes].sort((a, b) => b - a)).toEqual(minutes);
    });

    it("sin branchId, byPerson junta las sedes de cada persona", async () => {
      const res = await get(
        `${DASHBOARD_URL}?from=${rangeFrom}&to=${rangeTo}&country=AR`,
        ownerToken,
      );
      expect(res.statusCode).toBe(200);
      const body: DashboardBody = JSON.parse(res.body);
      const ids = body.branches.map((b) => b.id);
      expect(ids).toContain(branchAId);
      expect(ids).toContain(branchBId);
      expect(ids).not.toContain(branchEsId);

      const p1 = body.byPerson.find((p) => p.userId === person1Id);
      expect(p1).toBeDefined();
      expect(p1?.branchNames).toHaveLength(2);
      expect(p1?.totalMinutes).toBe(180); // 90 + 30 (A) + 60 (B)
      expect(p1?.shifts).toBe(3);
    });

    it("admin (AR) no ve la sede de España en branches ni en las jornadas", async () => {
      const res = await get(
        `${DASHBOARD_URL}?from=${rangeFrom}&to=${rangeTo}`,
        adminToken,
      );
      expect(res.statusCode).toBe(200);
      const body: DashboardBody = JSON.parse(res.body);
      const ids = body.branches.map((b) => b.id);
      expect(ids).toContain(branchAId);
      expect(ids).not.toContain(branchEsId);
      const p2 = body.byPerson.find((p) => p.userId === person2Id);
      // persona2 solo tiene una abierta (hoy, sede A): los 45 min de ES no cuentan.
      expect(p2?.totalMinutes).toBe(0);
    });

    it("owner sin country ve también la sede de España", async () => {
      const res = await get(
        `${DASHBOARD_URL}?from=${rangeFrom}&to=${rangeTo}`,
        ownerToken,
      );
      const body: DashboardBody = JSON.parse(res.body);
      expect(body.branches.map((b) => b.id)).toContain(branchEsId);
      const p2 = body.byPerson.find((p) => p.userId === person2Id);
      expect(p2?.totalMinutes).toBe(45);
    });

    it("coach -> 403", async () => {
      const res = await get(
        `${DASHBOARD_URL}?from=${rangeFrom}&to=${rangeTo}`,
        coachToken,
      );
      expect(res.statusCode).toBe(403);
    });

    it("sin token -> 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${DASHBOARD_URL}?from=${rangeFrom}&to=${rangeTo}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it("rango > 62 días -> 400", async () => {
      const res = await get(
        `${DASHBOARD_URL}?from=2026-01-01&to=2026-04-15`,
        adminToken,
      );
      expect(res.statusCode).toBe(400);
    });

    it("to < from -> 400", async () => {
      const res = await get(
        `${DASHBOARD_URL}?from=${rangeTo}&to=${rangeFrom}`,
        adminToken,
      );
      expect(res.statusCode).toBe(400);
    });

    it("sin from/to -> 400", async () => {
      const res = await get(DASHBOARD_URL, adminToken);
      expect(res.statusCode).toBe(400);
    });
  });
});
