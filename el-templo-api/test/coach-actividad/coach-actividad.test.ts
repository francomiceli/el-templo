/**
 * Rol `coach_actividad` (2026-10-06, migración 0258) — profe de actividad
 * (yoga) con la superficie operativa de un coach pero SIN plata.
 *
 * Lo que fija este archivo (el valor de los sets lo fija `rbac-sets.test.ts`):
 *   - 403 en TODO lo financiero: deudas, caja del profe (caja-expected,
 *     cash-count), cobros (coach-load), planes, historial financiero,
 *     "Solo deudores", alta de alumno y export.
 *   - 200 en lo operativo, con la plata recortada de la respuesta: la lista y la
 *     ficha de alumnos salen sin plan / vencimiento / etiqueta de membresía.
 *   - Jornada (staff-attendance): checklist de cierre reducido a `espacio`
 *     (sin `cobros` ni `lote`); un `coach` normal conserva `cobros` (regresión).
 *   - TV: control de SU sede en 200, sede ajena en 403 BRANCH_OUT_OF_SCOPE.
 *   - Se puede asignar como profe de un horario y en el roster de ratings.
 *
 * Los ids de usuario NUNCA se hardcodean: los actores se crean acá con
 * `createStaffUser` y se resuelven por el id que devuelve.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  createTestPlan,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { generateQrToken } from "../../src/modules/shared/qr-token";
import { BRANCH_OUT_OF_SCOPE } from "../../src/modules/shared/branch-access";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };

const MEMBERS_URL = "/api/admin/members";
const ME_URL = "/api/admin/staff-attendance/me";
const CHECK_IN_URL = "/api/admin/staff-attendance/check-in";
const CHECK_OUT_URL = "/api/admin/staff-attendance/check-out";

interface MemberRow {
  id: number;
  planName: string | null;
  endDate: string | null;
}

function suffix(): string {
  return `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0")}`;
}

/** "YYYY-MM-DD" de hoy + `days` (UTC mediodía). */
function dateOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/** Lunes ISO de la semana de dateStr. */
function isoMonday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split("T")[0];
}

describe("Rol coach_actividad — profe sin plata", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let actToken: string; // coach_actividad de branchA
  let coachToken: string; // coach normal de branchA (regresión)
  let actId: number;

  let branchAId: number;
  let branchBId: number; // sede ajena al coach_actividad
  let memberId: number;
  let scheduleId: number;

  const u = suffix();
  const pass = "test1234";

  function auth(token: string): { authorization: string } {
    return { authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await cleanAllTestData(app);
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [a] = await app.db
      .insert(schema.branches)
      .values({
        name: `CoachAct A ${u}`,
        code: `CAA-${u}`.slice(0, 20),
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      })
      .$returningId();
    branchAId = a.id;
    const [b] = await app.db
      .insert(schema.branches)
      .values({
        name: `CoachAct B ${u}`,
        code: `CAB-${u}`.slice(0, 20),
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      })
      .$returningId();
    branchBId = b.id;

    actId = await createStaffUser(app, {
      email: `act-${u}@test.local`,
      password: pass,
      firstName: "Yoga",
      lastName: "Profe",
      role: "coach_actividad",
      branchId: branchAId,
    });
    actToken = await getAuthToken(app, `act-${u}@test.local`, pass);

    await createStaffUser(app, {
      email: `coach-${u}@test.local`,
      password: pass,
      firstName: "Coach",
      lastName: "Normal",
      role: "coach",
      branchId: branchAId,
    });
    coachToken = await getAuthToken(app, `coach-${u}@test.local`, pass);

    // Alumno con plan en la sede A: el plan es lo que NO tiene que ver el rol.
    const plan = await createTestPlan(app, ownerToken, {
      name: `Plan Yoga Test ${u}`,
    });
    const createRes = await app.inject({
      method: "POST",
      url: MEMBERS_URL,
      headers: auth(ownerToken),
      payload: {
        email: `alumno-${u}@test.local`,
        firstName: "Alumno",
        lastName: "Con Plan",
        phone: "+5491155551234",
        dni: `${Date.now() % 100000000}`,
        branchId: branchAId,
        planId: plan.id,
      },
    });
    expect(createRes.statusCode).toBe(201);
    memberId = (JSON.parse(createRes.body) as { id: number }).id;

    // Etiqueta de membresía manual: dato comercial que tampoco ve el rol.
    await app.db
      .update(schema.users)
      .set({ membershipKindOverride: "bonificada" })
      .where(
        and(tenantWhere(schema.users, CTX), eq(schema.users.id, memberId)),
      );

    // Un horario de la sede A para asignarle el profe.
    const [activity] = await app.db
      .insert(schema.activities)
      .values({ name: `Yoga ${u}`, isActive: true })
      .$returningId();
    const [sched] = await app.db
      .insert(schema.schedules)
      .values({
        tenantId: TENANT_TEMPLO,
        branchId: branchAId,
        activityId: activity.id,
        dayOfWeek: 2,
        startTime: "19:00",
        endTime: "20:00",
        isActive: true,
      })
      .$returningId();
    scheduleId = sched.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Plata: todo 403 ──────────────────────────────────────────────────────

  describe("superficie financiera → 403", () => {
    it("GET /coach/outstanding-balances (deudas)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/coach/outstanding-balances",
        headers: auth(actToken),
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET /finance/coach-load/caja-expected (caja del profe)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/finance/coach-load/caja-expected?branchId=${branchAId}`,
        headers: auth(actToken),
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST /finance/coach-load/cash-count (contar la caja)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/finance/coach-load/cash-count",
        headers: auth(actToken),
        payload: { branchId: branchAId },
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST /finance/coach-load/pay-plan (cobro)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/finance/coach-load/pay-plan",
        headers: auth(actToken),
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET /subscriptions/plans (planes)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/subscriptions/plans",
        headers: auth(actToken),
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET /members?debtorOnly=true (solo deudores)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${MEMBERS_URL}?debtorOnly=true`,
        headers: auth(actToken),
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET /members/:id/financial-history y /outstanding-concepts", async () => {
      for (const path of ["financial-history", "outstanding-concepts"]) {
        const res = await app.inject({
          method: "GET",
          url: `${MEMBERS_URL}/${memberId}/${path}`,
          headers: auth(actToken),
        });
        expect(res.statusCode).toBe(403);
      }
    });

    it("POST /members (alta con plan) y GET /members/export", async () => {
      const create = await app.inject({
        method: "POST",
        url: MEMBERS_URL,
        headers: auth(actToken),
        payload: {
          email: `nuevo-${u}@test.local`,
          firstName: "Nuevo",
          lastName: "Alumno",
          phone: "+5491155559999",
          dni: "12345678",
          branchId: branchAId,
        },
      });
      expect(create.statusCode).toBe(403);

      const exportRes = await app.inject({
        method: "GET",
        url: `${MEMBERS_URL}/export`,
        headers: auth(actToken),
      });
      expect(exportRes.statusCode).toBe(403);
    });
  });

  // ─── Alumnos: operativo sí, plata recortada ──────────────────────────────

  describe("alumnos sin plata", () => {
    it("GET /members → 200 y planName / endDate null en todas las filas", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${MEMBERS_URL}?branchId=${branchAId}`,
        headers: auth(actToken),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { members: MemberRow[] };
      const row = body.members.find((m) => m.id === memberId);
      expect(row).toBeDefined();
      expect(row?.planName).toBeNull();
      expect(row?.endDate).toBeNull();
      for (const m of body.members) {
        expect(m.planName).toBeNull();
        expect(m.endDate).toBeNull();
      }
    });

    it("el owner SÍ ve el plan del mismo alumno (el recorte es del rol)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${MEMBERS_URL}?branchId=${branchAId}`,
        headers: auth(ownerToken),
      });
      expect(res.statusCode).toBe(200);
      const row = (
        JSON.parse(res.body) as { members: MemberRow[] }
      ).members.find((m) => m.id === memberId);
      expect(row?.planName).toMatch(/^Plan Yoga Test/);
    });

    it("GET /members/search → 200 y planName null", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${MEMBERS_URL}/search?search=Alumno`,
        headers: auth(actToken),
      });
      expect(res.statusCode).toBe(200);
      const members = (
        JSON.parse(res.body) as { members: { planName: string | null }[] }
      ).members;
      expect(members.length).toBeGreaterThan(0);
      for (const m of members) expect(m.planName).toBeNull();
    });

    it("GET /members/:id → 200 sin plan comprado, etiqueta de membresía ni SEPA", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${MEMBERS_URL}/${memberId}`,
        headers: auth(actToken),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as Record<string, unknown>;
      expect(body.id).toBe(memberId);
      // Lo operativo se conserva.
      expect(body.firstName).toBe("Alumno");
      expect(body.branchId).toBe(branchAId);
      // La plata, anulada.
      expect(body.purchasedPlanId).toBeNull();
      expect(body.purchasedPlanName).toBeNull();
      expect(body.membershipKindOverride).toBeNull();
      expect(body.membershipKindEffective).toBeNull();
      expect(body.sepaDetails).toBeNull();
    });

    it("el owner ve la etiqueta de membresía real del mismo alumno", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${MEMBERS_URL}/${memberId}`,
        headers: auth(ownerToken),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as Record<string, unknown>;
      expect(body.membershipKindOverride).toBe("bonificada");
      expect(body.membershipKindEffective).toBe("bonificada");
    });

    it("PUT /members/:id: edita datos pero NO pisa la etiqueta de membresía", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `${MEMBERS_URL}/${memberId}`,
        headers: auth(actToken),
        // El formulario reenvía el override que le llegó anulado (null).
        payload: { firstName: "Editado", membershipKindOverride: null },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as Record<string, unknown>;
      expect(body.firstName).toBe("Editado");
      expect(body.membershipKindOverride).toBeNull();

      const [row] = await app.db
        .select({
          firstName: schema.users.firstName,
          override: schema.users.membershipKindOverride,
        })
        .from(schema.users)
        .where(
          and(tenantWhere(schema.users, CTX), eq(schema.users.id, memberId)),
        );
      expect(row.firstName).toBe("Editado");
      expect(row.override).toBe("bonificada");
    });
  });

  // ─── Jornada: checklist sin cobros ni lote ───────────────────────────────

  describe("jornada (staff-attendance)", () => {
    it("coach normal: el checklist conserva `cobros` (regresión)", async () => {
      const res = await app.inject({
        method: "GET",
        url: ME_URL,
        headers: auth(coachToken),
      });
      expect(res.statusCode).toBe(200);
      const keys = (
        JSON.parse(res.body) as { checklist: { key: string }[] }
      ).checklist.map((c) => c.key);
      expect(keys).toContain("cobros");
      expect(keys).toContain("espacio");
      // 2026-10-08: los profes (`coach`) además graban videos para la app.
      expect(keys).toContain("videos");
    });

    it("coach normal: check-out sin `cobros` → 400 (sigue exigiéndolo)", async () => {
      const qrToken = generateQrToken(branchAId);
      const inRes = await app.inject({
        method: "POST",
        url: CHECK_IN_URL,
        headers: auth(coachToken),
        payload: { qrToken },
      });
      expect(inRes.statusCode).toBe(201);

      const outRes = await app.inject({
        method: "POST",
        url: CHECK_OUT_URL,
        headers: auth(coachToken),
        payload: { qrToken, checklist: { espacio: true } },
      });
      expect(outRes.statusCode).toBe(400);

      // Se cierra bien con el checklist completo para no dejar la jornada abierta.
      const okRes = await app.inject({
        method: "POST",
        url: CHECK_OUT_URL,
        headers: auth(coachToken),
        payload: {
          qrToken,
          checklist: { cobros: true, espacio: true, lote: true, videos: true },
        },
      });
      expect(okRes.statusCode).toBe(200);
    });

    it("coach_actividad: GET /me → checklist = solo `espacio`", async () => {
      const res = await app.inject({
        method: "GET",
        url: ME_URL,
        headers: auth(actToken),
      });
      expect(res.statusCode).toBe(200);
      const keys = (
        JSON.parse(res.body) as { checklist: { key: string }[] }
      ).checklist.map((c) => c.key);
      expect(keys).toEqual(["espacio"]);
    });

    it("coach_actividad: check-in + check-out con {espacio:true} → 200 y snapshot sin cobros", async () => {
      const qrToken = generateQrToken(branchAId);
      const inRes = await app.inject({
        method: "POST",
        url: CHECK_IN_URL,
        headers: auth(actToken),
        payload: { qrToken },
      });
      expect(inRes.statusCode).toBe(201);

      const sinEspacio = await app.inject({
        method: "POST",
        url: CHECK_OUT_URL,
        headers: auth(actToken),
        payload: { qrToken, checklist: { espacio: false } },
      });
      expect(sinEspacio.statusCode).toBe(400);

      const outRes = await app.inject({
        method: "POST",
        url: CHECK_OUT_URL,
        headers: auth(actToken),
        payload: { qrToken, checklist: { espacio: true } },
      });
      expect(outRes.statusCode).toBe(200);

      const [shift] = await app.db
        .select({ checklist: schema.staffShifts.checklist })
        .from(schema.staffShifts)
        .where(
          and(
            tenantWhere(schema.staffShifts, CTX),
            eq(schema.staffShifts.userId, actId),
          ),
        );
      // `cobros`, `lote` y `videos` no aplicaban: null, no false.
      expect(shift.checklist).toEqual({
        cobros: null,
        espacio: true,
        lote: null,
        videos: null,
      });
    });
  });

  // ─── Operativo: horarios, TV, profe del horario, roster ──────────────────

  describe("horarios y TV de su sede", () => {
    it("GET /scheduling/schedules/weekly de su sede → 200", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/scheduling/schedules/weekly?branchId=${branchAId}&weekStart=${isoMonday(dateOffset(0))}`,
        headers: auth(actToken),
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET /tv/control/context de su sede → 200", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/tv/control/context?branchId=${branchAId}`,
        headers: auth(actToken),
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET /tv/control/context de una sede ajena → 403 BRANCH_OUT_OF_SCOPE", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/tv/control/context?branchId=${branchBId}`,
        headers: auth(actToken),
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).code).toBe(BRANCH_OUT_OF_SCOPE);
    });
  });

  describe("asignable como profe", () => {
    it("PATCH /scheduling/schedules/:id/coach como owner → 200 y queda en DB", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/scheduling/schedules/${scheduleId}/coach`,
        headers: auth(ownerToken),
        payload: { coachUserId: actId },
      });
      expect(res.statusCode).toBe(200);

      const [row] = await app.db
        .select({ coachUserId: schema.schedules.coachUserId })
        .from(schema.schedules)
        .where(
          and(
            tenantWhere(schema.schedules, CTX),
            eq(schema.schedules.id, scheduleId),
          ),
        );
      expect(row.coachUserId).toBe(actId);
    });

    it("GET /ratings/coaches lo lista y POST /ratings/roster lo asigna al turno", async () => {
      const list = await app.inject({
        method: "GET",
        url: `/api/admin/ratings/coaches?branchId=${branchAId}`,
        headers: auth(ownerToken),
      });
      expect(list.statusCode).toBe(200);
      const ids = (JSON.parse(list.body) as { id: number }[]).map((c) => c.id);
      expect(ids).toContain(actId);

      const roster = await app.inject({
        method: "POST",
        url: "/api/admin/ratings/roster",
        headers: auth(ownerToken),
        payload: {
          branchId: branchAId,
          weekStartDate: isoMonday(dateOffset(14)),
          dayOfWeek: 2,
          slot: "afternoon",
          coachId: actId,
        },
      });
      expect(roster.statusCode).toBe(204);
    });

    it("un coach_actividad de OTRA sede no es asignable al horario → 400", async () => {
      const otherId = await createStaffUser(app, {
        email: `act-otra-${u}@test.local`,
        password: pass,
        firstName: "Yoga",
        lastName: "Otra",
        role: "coach_actividad",
        branchId: branchBId,
      });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/scheduling/schedules/${scheduleId}/coach`,
        headers: auth(ownerToken),
        payload: { coachUserId: otherId },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
