/**
 * Caras de los anotados del dia en la Reservas (D-59 revisada, 2026-11-20).
 *
 * GET /api/members/scheduling/day-attendees?date=YYYY-MM-DD&branchId=N
 *
 * Misma privacidad que la lista de un horario (`attendees.test.ts`), en lote:
 * hasta 4 caras por horario en el orden de la lista, totales que cuentan a los
 * ocultos, y SIN registrar la apertura de la lista (`community_list_opens`).
 * Fechas relativas a hoy en la zona de la sede y usuarios siempre por fabrica
 * (ningun id de `users` hardcodeado).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import {
  createTestApp,
  createTestPlan,
  createStaffUser,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";
import { restoreTemploFlags } from "../fixtures/module-flags";
import { mockPrivateMedia } from "../conquer/_helpers";
import { seedMemberPhoto } from "../members/_profile-photo-helpers";
import {
  DEFAULT_TENANT_TIMEZONE,
  addDays,
  dowInTz,
  todayInTz,
} from "../../src/modules/shared/date-utils";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const MEMBER_URL = "/api/members/scheduling";

/** Claves que NUNCA pueden aparecer en la respuesta. */
const FORBIDDEN_KEYS = [
  "lastName",
  "phone",
  "email",
  "userId",
  "memberId",
  "role",
  "status",
  "kind",
  "source",
  "isStaff",
  "isWellhub",
  "dateOfBirth",
  "aura",
  "photoId",
] as const;

interface Face {
  firstName: string;
  lastInitial: string | null;
  photoUrl: string | null;
  isMe: boolean;
}

interface DayBody {
  canSeeFaces: boolean;
  slots: Array<{ scheduleId: number; total: number; faces: Face[] }>;
}

interface Persona {
  id: number;
  token: string;
  firstName: string;
  lastName: string;
}

type BookingStatus = (typeof schema.bookings.status.enumValues)[number];

/** Recorre el JSON entero y falla si aparece alguna clave prohibida. */
function assertNoForbiddenKeys(json: unknown, path = "$"): void {
  if (Array.isArray(json)) {
    json.forEach((item, i) => assertNoForbiddenKeys(item, `${path}[${i}]`));
    return;
  }
  if (json !== null && typeof json === "object") {
    for (const [key, value] of Object.entries(json)) {
      expect(
        (FORBIDDEN_KEYS as readonly string[]).includes(key),
        `clave prohibida "${key}" en ${path}`,
      ).toBe(false);
      assertNoForbiddenKeys(value, `${path}.${key}`);
    }
  }
}

/** Misma fecha con `years` anios menos (la fecha local de la sede es la de hoy). */
function yearsAgo(today: string, years: number): string {
  const md = today.slice(4) === "-02-29" ? "-02-28" : today.slice(4);
  return `${Number(today.slice(0, 4)) - years}${md}`;
}

describe("Caras de los anotados del dia (D-59 revisada)", () => {
  let app: FastifyInstance;
  let testBranchId: number;
  let today: string;
  let tz: string;
  let planId: number;
  let scheduleId: number;
  let esBranchId: number | null = null;
  let seq = 0;

  beforeAll(async () => {
    app = await createTestApp();
    const [branch] = await app.db
      .select({ id: schema.branches.id, tz: schema.branches.timezone })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX),
          eq(schema.branches.isVirtual, false),
          // Solo se sirven sedes activas: la primera no virtual de la base de
          // pruebas (PARK) esta desactivada.
          eq(schema.branches.isActive, true),
        ),
      )
      .orderBy(asc(schema.branches.id))
      .limit(1);
    testBranchId = branch.id;
    tz = branch.tz ?? DEFAULT_TENANT_TIMEZONE;
    today = todayInTz(tz);
  });

  afterAll(async () => {
    await restoreTemploFlags(app);
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    if (esBranchId !== null) {
      await app.db
        .delete(schema.schedules)
        .where(
          and(
            tenantWhere(schema.schedules, CTX),
            eq(schema.schedules.branchId, esBranchId),
          ),
        );
      await app.db
        .delete(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, CTX),
            eq(schema.branches.id, esBranchId),
          ),
        );
    }
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await restoreTemploFlags(app);
    seq += 1;
    const adminToken = await getAuthToken(
      app,
      "admin@test.com",
      "adminpass123",
    );
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan caras dia ${seq} ${Date.now()}`,
    });
    planId = plan.id;
    scheduleId = await sembrarHorario(testBranchId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Fabricas ──────────────────────────────────────────────────────────────

  /** Horario de HOY en la sede indicada (el dia de la semana sale de la fecha). */
  async function sembrarHorario(
    branchId: number,
    isActive = true,
  ): Promise<number> {
    const [activity] = await app.db
      .insert(schema.activities)
      .values({ name: "General", description: "caras-dia" })
      .$returningId();
    const [schedule] = await app.db
      .insert(schema.schedules)
      .values({
        branchId,
        activityId: activity.id,
        dayOfWeek: dowInTz(tz),
        startTime: "19:00",
        endTime: "20:00",
        isActive,
      })
      .$returningId();
    return schedule.id;
  }

  async function crearPersona(
    campos: {
      status?: "freemium" | "activo" | "wellhub";
      dateOfBirth?: string | null;
      branchId?: number;
      deletedAt?: Date;
    } = {},
  ): Promise<Persona> {
    seq += 1;
    const firstName = `Cara${seq}`;
    const lastName = `Apellido${seq}Largo`;
    const email = `caras-dia-${seq}-${Date.now()}@test.com`;
    const registered = await registerUser(app, {
      email,
      password: "pass123456",
      firstName,
      lastName,
      branchId: testBranchId,
    });
    const id = (registered.user as { id: number }).id;
    const cambios: Partial<typeof schema.users.$inferInsert> = {};
    if (campos.status !== undefined) cambios.status = campos.status;
    if (campos.dateOfBirth !== undefined) {
      cambios.dateOfBirth = campos.dateOfBirth;
    }
    if (campos.branchId !== undefined) cambios.branchId = campos.branchId;
    if (Object.keys(cambios).length > 0) {
      await app.db
        .update(schema.users)
        .set(cambios)
        .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)));
    }
    // El login va ANTES de borrar la cuenta: una cuenta eliminada ya no entra.
    const token = await getAuthToken(app, email, "pass123456");
    if (campos.deletedAt !== undefined) {
      await app.db
        .update(schema.users)
        .set({ deletedAt: campos.deletedAt })
        .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)));
    }
    return { id, token, firstName, lastName };
  }

  async function sembrarSuscripcion(
    userId: number,
    endDate: string,
    startDate: string = addDays(today, -40),
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      tenantId: TENANT_TEMPLO,
      userId,
      planId,
      branchId: testBranchId,
      status: "active",
      startDate,
      endDate,
      pricePaid: 15000,
      currency: "ARS",
      priceTypeApplied: "regular",
    });
  }

  /** Alumno con plan en vigor: puede ver las caras. */
  async function crearAlumnoConPlan(
    campos: Parameters<typeof crearPersona>[0] = {},
  ): Promise<Persona> {
    const persona = await crearPersona({ status: "activo", ...campos });
    await sembrarSuscripcion(persona.id, addDays(today, 20));
    return persona;
  }

  async function reservar(
    userId: number,
    opts: {
      status?: BookingStatus;
      isTrial?: boolean;
      bookedAt?: Date;
      date?: string;
      forScheduleId?: number;
    } = {},
  ): Promise<void> {
    await app.db.insert(schema.bookings).values(
      tenantValues(CTX, {
        memberId: userId,
        scheduleId: opts.forScheduleId ?? scheduleId,
        bookingDate: opts.date ?? today,
        status: opts.status ?? "reservado",
        isTrial: opts.isTrial ?? false,
        bookedAt: opts.bookedAt ?? new Date(),
      }),
    );
  }

  async function guardarPreferencia(
    userId: number,
    visible: boolean,
  ): Promise<void> {
    await app.db
      .insert(schema.memberProfiles)
      .values(tenantValues(CTX, { userId, communityVisible: visible }))
      .onDuplicateKeyUpdate({ set: { communityVisible: visible } });
  }

  async function sedeEspana(): Promise<number> {
    if (esBranchId === null) {
      const [{ id }] = await app.db
        .insert(schema.branches)
        .values({
          name: "Sede ES caras-dia",
          code: "TCARASDIA-ES",
          country: "ES",
        })
        .$returningId();
      esBranchId = id;
    }
    return esBranchId;
  }

  async function contarAperturas(): Promise<number> {
    const filas = await app.db
      .select({ id: schema.communityListOpens.id })
      .from(schema.communityListOpens)
      .where(tenantWhere(schema.communityListOpens, CTX));
    return filas.length;
  }

  /** GET del dia; si responde 200 aplica el barrido de claves prohibidas. */
  async function pedir(
    token: string | null,
    query: { date?: string; branchId?: number | null } = {},
  ) {
    const params = new URLSearchParams();
    params.set("date", query.date ?? today);
    if (query.branchId !== null) {
      params.set("branchId", String(query.branchId ?? testBranchId));
    }
    const res = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/day-attendees?${params.toString()}`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body) as DayBody;
      assertNoForbiddenKeys(body);
      return { res, body };
    }
    return { res, body: null };
  }

  async function pedirOk(
    token: string,
    query: { date?: string; branchId?: number | null } = {},
  ): Promise<DayBody> {
    const { res, body } = await pedir(token, query);
    expect(res.statusCode, res.body).toBe(200);
    if (!body) throw new Error("sin cuerpo");
    return body;
  }

  const slotDe = (body: DayBody, id: number) =>
    body.slots.find((s) => s.scheduleId === id);

  // ── Caras, tope y totales ─────────────────────────────────────────────────

  it("hasta 4 caras por horario en el orden de la lista, con el total completo; cada horario por separado", async () => {
    const yo = await crearAlumnoConPlan();
    const otros: Persona[] = [];
    for (let i = 0; i < 5; i += 1) otros.push(await crearAlumnoConPlan());
    const base = Date.now() - 600_000;
    // Orden de reserva: yo primero, luego los 5 en orden.
    await reservar(yo.id, { bookedAt: new Date(base) });
    for (const [i, p] of otros.entries()) {
      await reservar(p.id, { bookedAt: new Date(base + (i + 1) * 1000) });
    }
    const segundo = await sembrarHorario(testBranchId);
    await reservar(otros[4].id, { forScheduleId: segundo });
    await reservar(otros[3].id, { forScheduleId: segundo });

    const body = await pedirOk(yo.token);

    expect(body.canSeeFaces).toBe(true);
    const primero = slotDe(body, scheduleId);
    expect(primero?.total).toBe(6);
    expect(primero?.faces.map((f) => f.firstName)).toEqual([
      yo.firstName,
      otros[0].firstName,
      otros[1].firstName,
      otros[2].firstName,
    ]);
    expect(primero?.faces.map((f) => f.isMe)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    for (const cara of primero?.faces ?? []) {
      expect(Object.keys(cara).sort()).toEqual(
        ["firstName", "isMe", "lastInitial", "photoUrl"].sort(),
      );
    }
    const otroSlot = slotDe(body, segundo);
    expect(otroSlot?.total).toBe(2);
    expect(otroSlot?.faces).toHaveLength(2);
    const crudo = JSON.stringify(body);
    for (const persona of [yo, ...otros]) {
      expect(crudo).not.toContain(persona.lastName);
      expect(crudo).not.toContain(persona.token);
    }
  });

  it("las caras son las primeras de la lista de un horario (mismo orden que la hoja)", async () => {
    const yo = await crearAlumnoConPlan();
    const base = Date.now() - 600_000;
    await reservar(yo.id, { bookedAt: new Date(base) });
    for (let i = 0; i < 5; i += 1) {
      const p = await crearAlumnoConPlan();
      await reservar(p.id, { bookedAt: new Date(base + (i + 1) * 1000) });
    }

    const dia = await pedirOk(yo.token);
    const lista = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/slots/${scheduleId}/${today}/attendees`,
      headers: { authorization: `Bearer ${yo.token}` },
    });
    const hoja = JSON.parse(lista.body) as {
      attendees: Array<{ firstName: string; isMe: boolean }>;
    };

    expect(
      slotDe(dia, scheduleId)?.faces.map((f) => [f.firstName, f.isMe]),
    ).toEqual(hoja.attendees.slice(0, 4).map((a) => [a.firstName, a.isMe]));
  });

  it("el oculto por preferencia y el menor no tienen cara pero cuentan en el total; el menor con preferencia visible si", async () => {
    const yo = await crearAlumnoConPlan();
    const oculto = await crearAlumnoConPlan();
    await guardarPreferencia(oculto.id, false);
    const menor = await crearPersona({ dateOfBirth: yearsAgo(today, 15) });
    const menorActivado = await crearPersona({
      dateOfBirth: yearsAgo(today, 15),
    });
    await guardarPreferencia(menorActivado.id, true);
    const visible = await crearAlumnoConPlan();
    const base = Date.now() - 600_000;
    for (const [i, p] of [
      yo,
      oculto,
      menor,
      menorActivado,
      visible,
    ].entries()) {
      await reservar(p.id, { bookedAt: new Date(base + i * 1000) });
    }

    const body = await pedirOk(yo.token);

    const slot = slotDe(body, scheduleId);
    expect(slot?.total).toBe(5);
    expect(slot?.faces.map((f) => f.firstName)).toEqual([
      yo.firstName,
      menorActivado.firstName,
      visible.firstName,
    ]);
    const crudo = JSON.stringify(body);
    expect(crudo).not.toContain(oculto.firstName);
    expect(crudo).not.toContain(menor.firstName);
  });

  it("un alumno de sede ES sin preferencia no tiene cara pero cuenta (D-11)", async () => {
    const yo = await crearAlumnoConPlan();
    const deEspana = await crearPersona({ branchId: await sedeEspana() });
    await reservar(yo.id);
    await reservar(deEspana.id);

    const body = await pedirOk(yo.token);

    const slot = slotDe(body, scheduleId);
    expect(slot?.total).toBe(2);
    expect(slot?.faces.map((f) => f.firstName)).toEqual([yo.firstName]);
  });

  it("excluidos: trial, cancelado, lista de espera y no_show no cuentan ni tienen cara; la cuenta borrada tampoco; otro dia y horario inactivo tampoco", async () => {
    const yo = await crearAlumnoConPlan();
    await reservar(yo.id);
    for (const estado of ["cancelado", "lista_espera", "no_show"] as const) {
      const otro = await crearPersona();
      await reservar(otro.id, { status: estado });
    }
    const prueba = await crearPersona();
    await reservar(prueba.id, { isTrial: true });
    const borrada = await crearPersona({ deletedAt: new Date() });
    await reservar(borrada.id);
    const confirmado = await crearPersona();
    await reservar(confirmado.id, { status: "confirmado" });
    const manana = await crearPersona();
    await reservar(manana.id, { date: addDays(today, 1) });
    const inactivo = await sembrarHorario(testBranchId, false);
    const enInactivo = await crearPersona();
    await reservar(enInactivo.id, { forScheduleId: inactivo });

    const body = await pedirOk(yo.token);

    expect(body.slots.map((s) => s.scheduleId)).toEqual([scheduleId]);
    const slot = slotDe(body, scheduleId);
    expect(slot?.total).toBe(2);
    expect(slot?.faces.map((f) => f.firstName).sort()).toEqual(
      [yo.firstName, confirmado.firstName].sort(),
    );
    expect(JSON.stringify(body)).not.toContain(borrada.firstName);
  });

  it("un dia sin reservas: canSeeFaces true y ningun horario", async () => {
    const yo = await crearAlumnoConPlan();

    const body = await pedirOk(yo.token);

    expect(body).toEqual({ canSeeFaces: true, slots: [] });
  });

  it("sin branchId usa la sede del propio alumno", async () => {
    const yo = await crearAlumnoConPlan();
    await reservar(yo.id);

    const body = await pedirOk(yo.token, { branchId: null });

    expect(slotDe(body, scheduleId)?.faces).toHaveLength(1);
  });

  // ── Acceso (D-07, D-09) ───────────────────────────────────────────────────

  it("sin plan en vigor (suscripcion vencida): canSeeFaces false, caras vacias y totales", async () => {
    const yo = await crearPersona({ status: "activo" });
    await sembrarSuscripcion(yo.id, addDays(today, -10), addDays(today, -40));
    const otro = await crearAlumnoConPlan();
    await reservar(otro.id);

    const body = await pedirOk(yo.token);

    expect(body.canSeeFaces).toBe(false);
    expect(body.slots).toEqual([{ scheduleId, total: 1, faces: [] }]);
  });

  it("un freemium sin suscripcion: canSeeFaces false", async () => {
    const yo = await crearPersona({ status: "freemium" });
    const otro = await crearAlumnoConPlan();
    await reservar(otro.id);

    const body = await pedirOk(yo.token);

    expect(body.canSeeFaces).toBe(false);
    expect(slotDe(body, scheduleId)?.faces).toEqual([]);
  });

  it("reciprocidad: si quien mira esta oculto, canSeeFaces false y solo totales", async () => {
    const yo = await crearAlumnoConPlan();
    await guardarPreferencia(yo.id, false);
    const otro = await crearAlumnoConPlan();
    await reservar(yo.id);
    await reservar(otro.id);

    const body = await pedirOk(yo.token);

    expect(body.canSeeFaces).toBe(false);
    expect(body.slots).toEqual([{ scheduleId, total: 2, faces: [] }]);
  });

  it("un staff que mira ve las caras aunque su status no sea activo", async () => {
    seq += 1;
    const email = `coach-caras-${seq}-${Date.now()}@test.com`;
    await createStaffUser(app, {
      email,
      password: "pass123456",
      firstName: "Mira",
      lastName: "Staff",
      role: "coach",
      branchId: testBranchId,
    });
    const token = await getAuthToken(app, email, "pass123456");
    const alumno = await crearPersona();
    await reservar(alumno.id);

    const body = await pedirOk(token);

    expect(body.canSeeFaces).toBe(true);
    expect(slotDe(body, scheduleId)?.faces.map((f) => f.firstName)).toEqual([
      alumno.firstName,
    ]);
  });

  // ── Fotos ─────────────────────────────────────────────────────────────────

  it("la foto propia aprobada sale como URL firmada; sin foto, null", async () => {
    mockPrivateMedia();
    const yo = await crearAlumnoConPlan();
    const conFoto = await crearAlumnoConPlan();
    const foto = await seedMemberPhoto(app, conFoto.id, { status: "aprobada" });
    const base = Date.now() - 600_000;
    await reservar(yo.id, { bookedAt: new Date(base) });
    await reservar(conFoto.id, { bookedAt: new Date(base + 1000) });

    const body = await pedirOk(yo.token);

    const caras = slotDe(body, scheduleId)?.faces ?? [];
    expect(
      caras.find((f) => f.firstName === yo.firstName)?.photoUrl,
    ).toBeNull();
    expect(caras.find((f) => f.firstName === conFoto.firstName)?.photoUrl).toBe(
      `https://r2.test/get/${foto.storageKey}`,
    );
  });

  // ── Metrica de aperturas ──────────────────────────────────────────────────

  it("NO registra aperturas de la lista (community_list_opens); la lista de un horario si", async () => {
    const yo = await crearAlumnoConPlan();
    await reservar(yo.id);
    const antes = await contarAperturas();

    await pedirOk(yo.token);
    await pedirOk(yo.token);

    expect(await contarAperturas()).toBe(antes);

    const lista = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/slots/${scheduleId}/${today}/attendees`,
      headers: { authorization: `Bearer ${yo.token}` },
    });
    expect(lista.statusCode).toBe(200);
    expect(await contarAperturas()).toBe(antes + 1);
  });

  // ── Fechas, sede y autenticacion ──────────────────────────────────────────

  it("fecha de ayer: 400", async () => {
    const yo = await crearAlumnoConPlan();

    const { res } = await pedir(yo.token, { date: addDays(today, -1) });

    expect(res.statusCode).toBe(400);
  });

  it("fecha a +32 dias: 400; a +31 dias: 200", async () => {
    const yo = await crearAlumnoConPlan();

    const fuera = await pedir(yo.token, { date: addDays(today, 32) });
    const limite = await pedir(yo.token, { date: addDays(today, 31) });

    expect(fuera.res.statusCode).toBe(400);
    expect(limite.res.statusCode, limite.res.body).toBe(200);
  });

  it("fecha con formato invalido o sin fecha: 400", async () => {
    const yo = await crearAlumnoConPlan();

    const mala = await pedir(yo.token, { date: "hoy" });
    const sinFecha = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/day-attendees`,
      headers: { authorization: `Bearer ${yo.token}` },
    });

    expect(mala.res.statusCode).toBe(400);
    expect(sinFecha.statusCode).toBe(400);
  });

  it("una sede de otro pais es 404", async () => {
    const yo = await crearAlumnoConPlan();

    const { res } = await pedir(yo.token, { branchId: await sedeEspana() });

    expect(res.statusCode).toBe(404);
  });

  it("una sede inexistente o de otro gimnasio es 404, indistinguible", async () => {
    const yo = await crearAlumnoConPlan();
    const gym2 = await seedSecondTenant(app);

    const ajena = await pedir(yo.token, { branchId: gym2.branchId });
    const inexistente = await pedir(yo.token, { branchId: 999_999_999 });

    expect(ajena.res.statusCode).toBe(404);
    expect(ajena.res.body).toBe(inexistente.res.body);
  });

  it("sin token: 401", async () => {
    const { res } = await pedir(null);

    expect(res.statusCode).toBe(401);
  });
});
