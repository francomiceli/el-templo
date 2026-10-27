/**
 * Fase 204 (D-02/D-20/D-26) — card "Wellhub" de la ficha y acceso a la app.
 *
 *   GET  /api/admin/members/:userId/wellhub    -> datos de la card (o null)
 *   POST /api/admin/members/:userId/app-access -> contrasena temporal + mail
 *
 * Las personas son las del brief (fixtures de `wellhub-personas.ts`): visitante
 * nuevo (status `wellhub`), socio activo con gympass_id y un socio comun sin
 * Wellhub. Fechas relativas a "hoy" en la tz de la sede, ningun id de `users`
 * hardcodeado. El aislamiento entre gimnasios vive en
 * `tenancy/iso-03-members-ficha.test.ts`; los rechazos por rol, solo aca.
 *
 * El mail no se manda en tests (sin RESEND_API_KEY el EmailService no hace
 * nada): se afirma que `emailSent` sea booleano, no su valor.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { addDays } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { MEMBER_TEMP_PASSWORD } from "../../src/modules/members/service";
import {
  cleanAllTestData,
  createStaffUser,
  createTestApp,
  createTestMember,
  createTestPlan,
  getAuthToken,
} from "../helpers";
import {
  TEMPLO_CTX,
  branchToday,
  createWellhubSocioActivo,
  createWellhubVisitor,
  insertActivityWithSchedule,
  insertAttendance,
  insertBooking,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;

interface CardBody {
  wellhub: {
    gympassId: string;
    linkedSince: string | null;
    lastVisitDate: string | null;
    visitsThisMonth: number;
    visitsTotal: number;
    manualVisitsTotal: number;
    branchesVisited: string[];
    nextWellhubBooking: {
      bookingId: number;
      date: string;
      startTime: string;
      activityName: string;
      branchName: string;
    } | null;
    recentWellhubBookings: Array<{ bookingId: number; status: string }>;
    showLabel: boolean;
    canConvert: boolean;
    canMerge: boolean;
    hasLoggedIn: boolean;
  } | null;
}

interface AppAccessBody {
  ok: boolean;
  emailSent: boolean;
}

interface ErrorBody {
  error: string;
  message: string;
}

describe("Fase 204 D-20/D-26: card Wellhub y acceso a la app", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let planId: number;
  let today: string;
  let secondBranchId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Segunda sede para probar "sedes visitadas". `branches` no se limpia en
    // cleanAllTestData: se borra en el afterAll.
    const suffix = Date.now().toString(36);
    const [branch] = await app.db
      .insert(schema.branches)
      .values(
        tenantValues(TEMPLO_CTX, {
          name: `Sede 204-09 ${suffix}`,
          code: `W9-${suffix}`.slice(0, 20),
          country: "AR",
          isActive: true,
          timezone: "America/Argentina/Buenos_Aires",
          isVirtual: false,
        }),
      )
      .$returningId();
    secondBranchId = branch.id;
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.db
      .delete(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.id, secondBranchId),
        ),
      );
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    today = await branchToday(app, BRANCH_ID);
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan 204-09 ${Date.now().toString(36)}`,
      classesPerWeek: 3,
      durationDays: 30,
    });
    planId = plan.id;
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function getCard(userId: number, token: string = adminToken) {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/${userId}/wellhub`,
      headers: { authorization: `Bearer ${token}` },
    });
    return { statusCode: res.statusCode, body: res.json() as CardBody };
  }

  async function postAppAccess(userId: number, token: string = adminToken) {
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/members/${userId}/app-access`,
      headers: { authorization: `Bearer ${token}` },
    });
    return { statusCode: res.statusCode, body: res.json() as unknown };
  }

  async function loginWorks(email: string, password: string): Promise<boolean> {
    try {
      await getAuthToken(app, email, password);
      return true;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("Login failed")) {
        return false;
      }
      throw err;
    }
  }

  // ─── Card ──────────────────────────────────────────────────────────────────

  it("card: alumno sin gympass devuelve wellhub null", async () => {
    const member = await createTestMember(app, { branchId: BRANCH_ID });

    const { statusCode, body } = await getCard(member.id);

    expect(statusCode).toBe(200);
    expect(body.wellhub).toBeNull();
  });

  it("card: visitante con visitas validadas y a mano, sedes y próxima reserva", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });

    // 2 validadas (una en cada sede) + 1 a mano, todas de hoy (mismo mes).
    await insertAttendance(app, {
      memberId: visitor.id,
      branchId: BRANCH_ID,
      sessionDate: today,
      source: "wellhub",
    });
    await insertAttendance(app, {
      memberId: visitor.id,
      branchId: secondBranchId,
      sessionDate: today,
      source: "wellhub",
    });
    await insertAttendance(app, {
      memberId: visitor.id,
      branchId: BRANCH_ID,
      sessionDate: today,
      source: "wellhub_manual",
    });
    // Una visita propia (QR) NO es Wellhub: no se cuenta.
    await insertAttendance(app, {
      memberId: visitor.id,
      branchId: BRANCH_ID,
      sessionDate: today,
      source: "qr",
    });

    const nextBookingId = await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate: addDays(today, 2),
      source: "wellhub",
    });
    // Una reserva propia (source NULL) no entra en el historial Wellhub.
    await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate: addDays(today, 3),
      source: null,
    });

    const { statusCode, body } = await getCard(visitor.id);

    expect(statusCode).toBe(200);
    const card = body.wellhub;
    expect(card).not.toBeNull();
    expect(card?.gympassId).toBe(visitor.gympassId);
    expect(card?.visitsThisMonth).toBe(3);
    expect(card?.visitsTotal).toBe(3);
    expect(card?.manualVisitsTotal).toBe(1);
    expect(card?.branchesVisited).toHaveLength(2);
    expect(card?.lastVisitDate).toBe(today);
    expect(card?.linkedSince).not.toBeNull();
    expect(card?.nextWellhubBooking?.bookingId).toBe(nextBookingId);
    expect(card?.nextWellhubBooking?.date).toBe(addDays(today, 2));
    expect(card?.recentWellhubBookings.map((b) => b.bookingId)).toEqual([
      nextBookingId,
    ]);
    expect(card?.showLabel).toBe(true);
    expect(card?.canConvert).toBe(true);
    expect(card?.canMerge).toBe(true);
    expect(card?.hasLoggedIn).toBe(false);
  });

  it("card: socio activo con gympass no muestra etiqueta ni permite unir", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId,
      branchId: BRANCH_ID,
    });

    const { statusCode, body } = await getCard(socio.id);

    expect(statusCode).toBe(200);
    expect(body.wellhub?.gympassId).toBe(socio.gympassId);
    expect(body.wellhub?.showLabel).toBe(false);
    expect(body.wellhub?.canConvert).toBe(false);
    expect(body.wellhub?.canMerge).toBe(false);
  });

  it("card: refleja que la persona ya abrió la app alguna vez", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    await app.db
      .insert(schema.memberLogins)
      .values(tenantValues(TEMPLO_CTX, { userId: visitor.id }));

    const { body } = await getCard(visitor.id);

    expect(body.wellhub?.hasLoggedIn).toBe(true);
  });

  // ─── Acceso a la app ───────────────────────────────────────────────────────

  it("app-access: antes no entra con la contraseña temporal, después sí", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });

    // D-06: el visitante nace con una contrasena aleatoria.
    expect(await loginWorks(visitor.email, MEMBER_TEMP_PASSWORD)).toBe(false);

    const { statusCode, body } = await postAppAccess(visitor.id);

    expect(statusCode).toBe(200);
    const result = body as AppAccessBody;
    expect(result.ok).toBe(true);
    expect(typeof result.emailSent).toBe("boolean");

    expect(await loginWorks(visitor.email, MEMBER_TEMP_PASSWORD)).toBe(true);
  });

  it("app-access: un rol sin permiso es rechazado", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const coachEmail = `coach-204-09-${Date.now().toString(36)}@test.com`;
    await createStaffUser(app, {
      email: coachEmail,
      password: "coachpass123",
      firstName: "Coach",
      lastName: "Wellhub",
      role: "coach",
      branchId: BRANCH_ID,
    });
    const coachToken = await getAuthToken(app, coachEmail, "coachpass123");

    const { statusCode } = await postAppAccess(visitor.id, coachToken);

    expect(statusCode).toBe(403);
    // La cuenta quedo intacta: la contrasena temporal no sirve.
    expect(await loginWorks(visitor.email, MEMBER_TEMP_PASSWORD)).toBe(false);
  });

  it("app-access: alumno sin gympass responde 400", async () => {
    const member = await createTestMember(app, { branchId: BRANCH_ID });

    const { statusCode, body } = await postAppAccess(member.id);

    expect(statusCode).toBe(400);
    expect((body as ErrorBody).message).toBe(
      "Esta acción es para alumnos que vienen por Wellhub",
    );
  });

  it("app-access: alumno Wellhub sin email responde 400 y no resetea nada", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    await app.db
      .update(schema.users)
      .set({ email: null })
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, visitor.id),
        ),
      );

    const { statusCode, body } = await postAppAccess(visitor.id);

    expect(statusCode).toBe(400);
    expect((body as ErrorBody).message).toBe(
      "El alumno no tiene email cargado",
    );
  });

  it("app-access: un alumno inexistente responde 404", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });

    // Un id mayor al de cualquier fila existente (sin hardcodear ids).
    const { statusCode } = await postAppAccess(visitor.id + 1_000_000);

    expect(statusCode).toBe(404);
  });
});
