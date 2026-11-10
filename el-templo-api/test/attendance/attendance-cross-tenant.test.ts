/**
 * Tanda 2 de seguridad (hallazgo #2) — el check-in manual y por horario exigen
 * que el socio sea del gimnasio del actor.
 *
 * Antes del fix, `POST /api/admin/attendance/force` y
 * `POST /api/admin/attendance/slot/:scheduleId/:date/check-in` aceptaban un
 * `memberId` de OTRO gimnasio: escribian `attendance` (con el tenant del actor
 * pero el miembro ajeno), otorgaban AURA al socio ajeno y espejaban
 * `completed_sessions`. Y `removeCheckIn` sobre una fila envenenada de antes del
 * fix disparaba las restauraciones sobre el usuario ajeno.
 *
 * Contrato (mismo que `iso-03-sched-escritura`, T-174.1-08-04): un socio de otro
 * gimnasio es INDISTINGUIBLE de uno inexistente → 404 "Alumno no encontrado" y
 * cero filas nuevas / saldo AURA intacto.
 *
 * Las lecturas de evidencia se hacen bajo los DOS gimnasios (`AuraService.award`
 * hoy no estampa `tenant_id`, asi que sus filas caen en el DEFAULT 1 aun para
 * socios del gimnasio 2): contar solo bajo un gimnasio podria dar un falso verde.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  createTestMember,
  getAuthToken,
  seedAuraBalance,
  todayStr,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const ATTENDANCE_URL = "/api/admin/attendance";
const CTX_TEMPLO = { tenantId: TENANT_TEMPLO };
const CTX_DOS = { tenantId: TENANT_DOS };
const CTXS = [CTX_TEMPLO, CTX_DOS];
const SALDO_INICIAL = 50;

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let temploCoachToken: string;
let temploSocioId: number;
let temploScheduleId: number;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);

  const sufijo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `coach-templo-${sufijo}@test.com`;
  await createStaffUser(app, {
    email,
    password: "coachpass123",
    firstName: "Coach",
    lastName: "Templo",
    role: "coach",
    branchId: 1,
  });
  temploCoachToken = await getAuthToken(app, email, "coachpass123");

  const socio = await createTestMember(app, {});
  temploSocioId = socio.id;
  await seedAuraBalance(app, temploSocioId, SALDO_INICIAL);

  const [act] = await app.db.insert(schema.activities).values(
    tenantValues(CTX_TEMPLO, {
      name: `Funcional ${sufijo}`,
      isActive: true,
      isSpecial: false,
    }),
  );
  const [sched] = await app.db.insert(schema.schedules).values(
    tenantValues(CTX_TEMPLO, {
      branchId: 1,
      activityId: Number(act.insertId),
      dayOfWeek: 3,
      startTime: "10:00",
      endTime: "11:00",
      isActive: true,
    }),
  );
  temploScheduleId = Number(sched.insertId);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

interface Foto {
  attendance: number;
  auraTx: number;
  saldo: number;
  completedSessions: number;
  bookings: number;
}

/** Foto del socio bajo AMBOS gimnasios (ver nota del encabezado). */
async function foto(userId: number): Promise<Foto> {
  const f: Foto = {
    attendance: 0,
    auraTx: 0,
    saldo: 0,
    completedSessions: 0,
    bookings: 0,
  };
  for (const ctx of CTXS) {
    const att = await app.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(
        and(
          tenantWhere(schema.attendance, ctx),
          eq(schema.attendance.memberId, userId),
        ),
      );
    f.attendance += att.length;
    const tx = await app.db
      .select({ id: schema.auraTransactions.id })
      .from(schema.auraTransactions)
      .where(
        and(
          tenantWhere(schema.auraTransactions, ctx),
          eq(schema.auraTransactions.userId, userId),
        ),
      );
    f.auraTx += tx.length;
    const bal = await app.db
      .select({ balance: schema.auraBalances.balance })
      .from(schema.auraBalances)
      .where(
        and(
          tenantWhere(schema.auraBalances, ctx),
          eq(schema.auraBalances.userId, userId),
        ),
      );
    f.saldo += bal.reduce((acc, r) => acc + r.balance, 0);
    const cs = await app.db
      .select({ id: schema.completedSessions.id })
      .from(schema.completedSessions)
      .where(
        and(
          tenantWhere(schema.completedSessions, ctx),
          eq(schema.completedSessions.userId, userId),
        ),
      );
    f.completedSessions += cs.length;
    const bk = await app.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(
        and(
          tenantWhere(schema.bookings, ctx),
          eq(schema.bookings.memberId, userId),
        ),
      );
    f.bookings += bk.length;
  }
  return f;
}

async function post(
  token: string,
  url: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `${ATTENDANCE_URL}${url}`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function expectAlumnoNoEncontrado(res: { statusCode: number; body: string }) {
  expect(res.statusCode, res.body).toBe(404);
  const body = JSON.parse(res.body) as { message: string };
  expect(body.message).toContain("Alumno no encontrado");
}

describe("POST /api/admin/attendance/force — memberId de otro gimnasio", () => {
  it("coach del gimnasio 2 con socio del Templo: 404 'Alumno no encontrado' y cero escrituras", async () => {
    const antes = await foto(temploSocioId);
    expect(antes.saldo).toBe(SALDO_INICIAL);

    const res = await post(gym2.coachToken, "/force", {
      memberId: temploSocioId,
      branchId: gym2.branchId,
      reason: "intento cruzado",
    });

    expectAlumnoNoEncontrado(res);
    expect(await foto(temploSocioId)).toEqual(antes);
  });

  it("coach del Templo con socio del gimnasio 2: 404 'Alumno no encontrado' y cero escrituras", async () => {
    const socioDos = gym2.socios[0].id;
    const antes = await foto(socioDos);

    const res = await post(temploCoachToken, "/force", {
      memberId: socioDos,
      branchId: 1,
      reason: "intento cruzado inverso",
    });

    expectAlumnoNoEncontrado(res);
    expect(await foto(socioDos)).toEqual(antes);
  });

  it("memberId inexistente: mismo 404 (indistinguible de un socio ajeno)", async () => {
    const res = await post(gym2.coachToken, "/force", {
      memberId: 2_000_000_000,
      branchId: gym2.branchId,
      reason: "inexistente",
    });
    expectAlumnoNoEncontrado(res);
  });

  it("control: coach del gimnasio 2 con socio propio → 201 y AURA +10", async () => {
    const socioDos = gym2.socios[0].id;
    const antes = await foto(socioDos);

    const res = await post(gym2.coachToken, "/force", {
      memberId: socioDos,
      branchId: gym2.branchId,
      reason: "control",
    });

    expect(res.statusCode, res.body).toBe(201);
    const body = JSON.parse(res.body) as { memberId: number; source: string };
    expect(body.memberId).toBe(socioDos);
    expect(body.source).toBe("manual");

    const despues = await foto(socioDos);
    expect(despues.attendance).toBe(antes.attendance + 1);
    expect(despues.auraTx).toBe(antes.auraTx + 1);
    expect(despues.saldo).toBe(antes.saldo + 10);
    expect(despues.completedSessions).toBe(antes.completedSessions + 1);
  });

  it("control: coach del Templo con socio del Templo → 201 y AURA +10", async () => {
    const antes = await foto(temploSocioId);
    const res = await post(temploCoachToken, "/force", {
      memberId: temploSocioId,
      branchId: 1,
      reason: "control",
    });
    expect(res.statusCode, res.body).toBe(201);
    const despues = await foto(temploSocioId);
    expect(despues.attendance).toBe(antes.attendance + 1);
    expect(despues.saldo).toBe(SALDO_INICIAL + 10);
  });
});

describe("POST /api/admin/attendance/slot/:scheduleId/:date/check-in — memberId de otro gimnasio", () => {
  it("coach del gimnasio 2 (horario propio) con socio del Templo: 404 'Alumno no encontrado' y cero escrituras", async () => {
    const antes = await foto(temploSocioId);

    const res = await post(
      gym2.coachToken,
      `/slot/${gym2.scheduleId}/${todayStr()}/check-in`,
      { memberId: temploSocioId },
    );

    expectAlumnoNoEncontrado(res);
    expect(await foto(temploSocioId)).toEqual(antes);
  });

  it("coach del Templo (horario propio) con socio del gimnasio 2: 404 'Alumno no encontrado' y cero escrituras", async () => {
    const socioDos = gym2.socios[1].id;
    const antes = await foto(socioDos);

    const res = await post(
      temploCoachToken,
      `/slot/${temploScheduleId}/${todayStr()}/check-in`,
      { memberId: socioDos },
    );

    expectAlumnoNoEncontrado(res);
    expect(await foto(socioDos)).toEqual(antes);
  });

  it("control: coach del gimnasio 2 con socio propio → 201 y AURA +10", async () => {
    const socioDos = gym2.socios[0].id;
    const antes = await foto(socioDos);

    const res = await post(
      gym2.coachToken,
      `/slot/${gym2.scheduleId}/${todayStr()}/check-in`,
      { memberId: socioDos },
    );

    expect(res.statusCode, res.body).toBe(201);
    const despues = await foto(socioDos);
    expect(despues.attendance).toBe(antes.attendance + 1);
    expect(despues.saldo).toBe(antes.saldo + 10);
    expect(despues.bookings).toBe(antes.bookings + 1);
  });

  it("control: coach del Templo con socio del Templo → 201 y AURA +10", async () => {
    const antes = await foto(temploSocioId);
    const res = await post(
      temploCoachToken,
      `/slot/${temploScheduleId}/${todayStr()}/check-in`,
      { memberId: temploSocioId },
    );
    expect(res.statusCode, res.body).toBe(201);
    const despues = await foto(temploSocioId);
    expect(despues.attendance).toBe(antes.attendance + 1);
    expect(despues.saldo).toBe(SALDO_INICIAL + 10);
  });
});

describe("DELETE /api/admin/attendance/:id — fila heredada con member_id de otro gimnasio", () => {
  it("admin del gimnasio 2 sobre una fila envenenada: 404 y el socio del Templo queda intacto", async () => {
    // Estado heredado de antes del fix: fila con tenant del gimnasio 2 pero
    // member_id de un socio del Templo (INSERT directo, la API ya no lo permite).
    const [ins] = await app.db.insert(schema.attendance).values(
      tenantValues(CTX_DOS, {
        memberId: temploSocioId,
        branchId: gym2.branchId,
        scheduleId: null,
        sessionDate: todayStr(),
        status: "confirmado",
        source: "manual",
      }),
    );
    const attendanceId = Number(ins.insertId);
    const antes = await foto(temploSocioId);
    expect(antes.attendance).toBe(1);

    const res = await app.inject({
      method: "DELETE",
      url: `${ATTENDANCE_URL}/${attendanceId}`,
      headers: { authorization: `Bearer ${gym2.adminToken}` },
    });

    expectAlumnoNoEncontrado(res);
    // La fila sigue (no se borro nada) y el saldo/clases del socio ajeno intactos.
    expect(await foto(temploSocioId)).toEqual(antes);
    expect(antes.saldo).toBe(SALDO_INICIAL);
  });

  it("control: admin del gimnasio 2 deshace un check-in de un socio propio → 200", async () => {
    const socioDos = gym2.socios[0].id;
    const alta = await post(gym2.coachToken, "/force", {
      memberId: socioDos,
      branchId: gym2.branchId,
      reason: "control",
    });
    expect(alta.statusCode, alta.body).toBe(201);
    const { id } = JSON.parse(alta.body) as { id: number };
    const antes = await foto(socioDos);

    const res = await app.inject({
      method: "DELETE",
      url: `${ATTENDANCE_URL}/${id}`,
      headers: { authorization: `Bearer ${gym2.adminToken}` },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect((JSON.parse(res.body) as { removed: boolean }).removed).toBe(true);
    const despues = await foto(socioDos);
    expect(despues.attendance).toBe(antes.attendance - 1);
    expect(despues.completedSessions).toBe(antes.completedSessions - 1);
  });
});
