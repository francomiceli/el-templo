/**
 * Fase 214 Plan 17 (D-01..D-09, D-37, D-43, D-52, D-59, D-65, D-68): anotados de
 * un horario.
 *
 * GET /api/members/scheduling/slots/:scheduleId/:date/attendees
 *
 * La privacidad se afirma de afuera hacia adentro: cada respuesta 200 pasa por
 * `assertNoForbiddenKeys` (ninguna clave de dato personal ni de tipo de
 * persona) y por el barrido de valores (ningun id de usuario, ninguna ruta de
 * foto con el id). El apellido completo sembrado nunca aparece en el JSON.
 *
 * Fechas relativas a hoy en la zona de la sede (nada fijo) y usuarios siempre
 * por fabrica (ningun id de `users` hardcodeado).
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
import { and, eq } from "drizzle-orm";
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
import { restoreTemploFlags, setModuleFlag } from "../fixtures/module-flags";
import { mockPrivateMedia } from "../conquer/_helpers";
import {
  FOTO_PUBLIC_URL,
  seedMemberPhoto,
  setUserPhotoUrl,
} from "../members/_profile-photo-helpers";
import {
  DEFAULT_TENANT_TIMEZONE,
  addDays,
  dowInTz,
  todayInTz,
} from "../../src/modules/shared/date-utils";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const MEMBER_URL = "/api/members/scheduling";

/** Claves que NUNCA pueden aparecer en la respuesta (T-214-17-01/02). */
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
  "branchId",
  "dateOfBirth",
] as const;

interface Attendee {
  firstName: string;
  lastInitial: string | null;
  photoUrl: string | null;
  photoId: number | null;
  aura: number | null;
  isMe: boolean;
}

interface AttendeesBody {
  total: number;
  canSeeList: boolean;
  reason: "ok" | "sin_plan" | "oculto";
  attendees: Attendee[];
  hiddenCount: number;
  viewer: { visible: boolean; noticeSeen: boolean };
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

/** Todos los valores hoja (strings y numeros) del JSON. */
function leafValues(json: unknown): Array<string | number> {
  if (Array.isArray(json)) return json.flatMap(leafValues);
  if (json !== null && typeof json === "object") {
    return Object.values(json).flatMap(leafValues);
  }
  if (typeof json === "string" || typeof json === "number") return [json];
  return [];
}

/** Misma fecha con `years` anios menos (la fecha local de la sede es la de hoy). */
function yearsAgo(today: string, years: number): string {
  const md = today.slice(4) === "-02-29" ? "-02-28" : today.slice(4);
  return `${Number(today.slice(0, 4)) - years}${md}`;
}

describe("Fase 214-17: anotados del horario (D-01..D-09)", () => {
  let app: FastifyInstance;
  let testBranchId: number;
  let today: string;
  let tz: string;
  let planId: number;
  let scheduleId: number;
  let esBranchId: number | null = null;
  let seq = 0;
  let auraRef = 0;

  beforeAll(async () => {
    app = await createTestApp();
    const [branch] = await app.db
      .select({ id: schema.branches.id, tz: schema.branches.timezone })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, false))
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
      name: `Plan anotados 214-17 ${seq} ${Date.now()}`,
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
      .values({ name: "General", description: "214-17" })
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

  /**
   * Registra un socio de la sede de prueba con nombre y apellido propios y lo
   * deja con los campos pedidos.
   */
  async function crearPersona(
    campos: {
      status?: "freemium" | "activo" | "wellhub";
      dateOfBirth?: string | null;
      branchId?: number;
      deletedAt?: Date;
    } = {},
  ): Promise<Persona> {
    seq += 1;
    const firstName = `Nom${seq}`;
    const lastName = `Apellido${seq}Largo`;
    const email = `anotados-${seq}-${Date.now()}@test.com`;
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
    if (campos.deletedAt !== undefined) cambios.deletedAt = campos.deletedAt;
    if (Object.keys(cambios).length > 0) {
      await app.db
        .update(schema.users)
        .set(cambios)
        .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)));
    }
    const token = await getAuthToken(app, email, "pass123456");
    return { id, token, firstName, lastName };
  }

  /** Suscripcion real: en vigor si `endDate` es futura, vencida si es pasada. */
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

  /** Alumno con plan en vigor: puede ver la lista. */
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
      source?: string | null;
      bookedAt?: Date;
      date?: string;
      forScheduleId?: number;
    } = {},
  ): Promise<number> {
    const [row] = await app.db
      .insert(schema.bookings)
      .values(
        tenantValues(CTX, {
          memberId: userId,
          scheduleId: opts.forScheduleId ?? scheduleId,
          bookingDate: opts.date ?? today,
          status: opts.status ?? "reservado",
          isTrial: opts.isTrial ?? false,
          source: opts.source ?? null,
          bookedAt: opts.bookedAt ?? new Date(),
        }),
      )
      .$returningId();
    return row.id;
  }

  async function sembrarAura(userId: number, amount: number): Promise<void> {
    auraRef += 1;
    await app.db.insert(schema.auraTransactions).values(
      tenantValues(CTX, {
        userId,
        sourceType: "attendance" as const,
        amount,
        referenceType: "attendance",
        referenceId: auraRef,
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
        .values({ name: "Sede ES 214-17", code: "T21417-ES", country: "ES" })
        .$returningId();
      esBranchId = id;
    }
    return esBranchId;
  }

  /** GET de anotados; si responde 200 aplica el barrido de claves prohibidas. */
  async function pedir(
    token: string | null,
    forSchedule: number = scheduleId,
    date: string = today,
  ) {
    const res = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/slots/${forSchedule}/${date}/attendees`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body) as AttendeesBody;
      assertNoForbiddenKeys(body);
      return { res, body };
    }
    return { res, body: null };
  }

  /** Igual que `pedir` pero exige 200. */
  async function pedirOk(
    token: string,
    forSchedule: number = scheduleId,
    date: string = today,
  ): Promise<AttendeesBody> {
    const { res, body } = await pedir(token, forSchedule, date);
    expect(res.statusCode, res.body).toBe(200);
    if (!body) throw new Error("sin cuerpo");
    return body;
  }

  // ── Lista, orden y privacidad ─────────────────────────────────────────────

  it("alumno activo visible: lista en orden de reserva con nombre, inicial de un caracter y aura; isMe solo en la propia; el apellido completo no aparece", async () => {
    const yo = await crearAlumnoConPlan();
    const b = await crearAlumnoConPlan();
    const c = await crearAlumnoConPlan();
    await sembrarAura(b.id, 40);
    await sembrarAura(yo.id, 15);
    const base = Date.now() - 600_000;
    // Se insertan en otro orden para probar que manda `bookedAt`.
    await reservar(c.id, { bookedAt: new Date(base + 120_000) });
    await reservar(yo.id, { bookedAt: new Date(base) });
    await reservar(b.id, { bookedAt: new Date(base + 60_000) });

    const body = await pedirOk(yo.token);

    expect(body.canSeeList).toBe(true);
    expect(body.reason).toBe("ok");
    expect(body.total).toBe(3);
    expect(body.hiddenCount).toBe(0);
    expect(body.attendees.map((a) => a.firstName)).toEqual([
      yo.firstName,
      b.firstName,
      c.firstName,
    ]);
    for (const fila of body.attendees) {
      expect(fila.lastInitial).toBe("A");
      expect(fila.lastInitial?.length).toBe(1);
      expect(Object.keys(fila).sort()).toEqual(
        [
          "aura",
          "firstName",
          "isMe",
          "lastInitial",
          "photoId",
          "photoUrl",
        ].sort(),
      );
    }
    expect(body.attendees.map((a) => a.isMe)).toEqual([true, false, false]);
    expect(body.attendees.map((a) => a.aura)).toEqual([15, 40, null]);
    const crudo = JSON.stringify(body);
    for (const persona of [yo, b, c]) {
      expect(crudo).not.toContain(persona.lastName);
      expect(crudo).not.toContain(persona.token);
    }
  });

  it("excluidos: trial, cancelado, lista de espera y no_show no tienen fila ni cuentan; la cuenta borrada tampoco (D-68)", async () => {
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
    const qr = await crearPersona();
    await reservar(qr.id, { status: "qr_escaneado" });

    const body = await pedirOk(yo.token);

    expect(body.total).toBe(3);
    expect(body.hiddenCount).toBe(0);
    expect(body.attendees.map((a) => a.firstName).sort()).toEqual(
      [yo.firstName, confirmado.firstName, qr.firstName].sort(),
    );
    expect(JSON.stringify(body)).not.toContain(borrada.firstName);
  });

  it("el total es el mismo bookedCount de la grilla semanal, y ninguno cuenta cuentas borradas (D-59)", async () => {
    const yo = await crearAlumnoConPlan();
    await reservar(yo.id);
    const otro = await crearPersona();
    await reservar(otro.id);
    const borrada = await crearPersona({ deletedAt: new Date() });
    await reservar(borrada.id);
    const prueba = await crearPersona();
    await reservar(prueba.id, { isTrial: true });
    const cancelada = await crearPersona();
    await reservar(cancelada.id, { status: "cancelado" });

    const body = await pedirOk(yo.token);
    const weekStart = addDays(today, -(dowInTz(tz) - 1));
    const grilla = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/weekly?weekStart=${weekStart}&branchId=${testBranchId}`,
      headers: { authorization: `Bearer ${yo.token}` },
    });
    expect(grilla.statusCode, grilla.body).toBe(200);
    const slot = (
      JSON.parse(grilla.body) as {
        slots: Array<{ id: number; bookedCount: number }>;
      }
    ).slots.find((s) => s.id === scheduleId);

    expect(slot, "el horario aparece en la grilla").toBeDefined();
    expect(body.total).toBe(2);
    expect(slot?.bookedCount).toBe(body.total);
  });

  // ── Alcance de la consulta ────────────────────────────────────────────────

  it("un horario inactivo es 404", async () => {
    const yo = await crearAlumnoConPlan();
    const inactivo = await sembrarHorario(testBranchId, false);

    const { res } = await pedir(yo.token, inactivo);

    expect(res.statusCode).toBe(404);
  });

  it("un horario de una sede de otro pais es 404", async () => {
    const yo = await crearAlumnoConPlan();
    const enEspana = await sembrarHorario(await sedeEspana());

    const { res } = await pedir(yo.token, enEspana);

    expect(res.statusCode).toBe(404);
  });

  // ── Ocultos y visibilidad por defecto ─────────────────────────────────────

  it("quien se oculta por preferencia no tiene fila y cuenta en total y en hiddenCount", async () => {
    const yo = await crearAlumnoConPlan();
    const oculto = await crearAlumnoConPlan();
    await guardarPreferencia(oculto.id, false);
    await reservar(yo.id);
    await reservar(oculto.id);

    const body = await pedirOk(yo.token);

    expect(body.total).toBe(2);
    expect(body.hiddenCount).toBe(1);
    expect(body.attendees.map((a) => a.firstName)).toEqual([yo.firstName]);
    expect(JSON.stringify(body)).not.toContain(oculto.firstName);
  });

  it("un menor sin preferencia queda oculto y con community_visible = 1 aparece", async () => {
    const yo = await crearAlumnoConPlan();
    const menor = await crearPersona({ dateOfBirth: yearsAgo(today, 15) });
    const menorActivado = await crearPersona({
      dateOfBirth: yearsAgo(today, 15),
    });
    await guardarPreferencia(menorActivado.id, true);
    await reservar(yo.id);
    await reservar(menor.id);
    await reservar(menorActivado.id);

    const body = await pedirOk(yo.token);

    expect(body.total).toBe(3);
    expect(body.hiddenCount).toBe(1);
    expect(body.attendees.map((a) => a.firstName).sort()).toEqual(
      [yo.firstName, menorActivado.firstName].sort(),
    );
  });

  it("un alumno de sede ES sin preferencia queda oculto (D-11)", async () => {
    const yo = await crearAlumnoConPlan();
    const deEspana = await crearPersona({ branchId: await sedeEspana() });
    await reservar(yo.id);
    await reservar(deEspana.id);

    const body = await pedirOk(yo.token);

    expect(body.total).toBe(2);
    expect(body.hiddenCount).toBe(1);
    expect(body.attendees.map((a) => a.firstName)).toEqual([yo.firstName]);
  });

  it("reciprocidad: si quien mira esta oculto ve solo el total (reason oculto)", async () => {
    const yo = await crearAlumnoConPlan();
    await guardarPreferencia(yo.id, false);
    const otro = await crearPersona();
    await reservar(yo.id);
    await reservar(otro.id);

    const body = await pedirOk(yo.token);

    expect(body.canSeeList).toBe(false);
    expect(body.reason).toBe("oculto");
    expect(body.attendees).toEqual([]);
    expect(body.hiddenCount).toBe(0);
    expect(body.total).toBe(2);
    expect(body.viewer.visible).toBe(false);
  });

  // ── Plan en vigor (blocker 2) ─────────────────────────────────────────────

  it("status activo con su unica suscripcion VENCIDA: sin_plan, solo el total", async () => {
    const yo = await crearPersona({ status: "activo" });
    await sembrarSuscripcion(yo.id, addDays(today, -10), addDays(today, -40));
    const otro = await crearPersona();
    await reservar(otro.id);

    const body = await pedirOk(yo.token);

    expect(body.canSeeList).toBe(false);
    expect(body.reason).toBe("sin_plan");
    expect(body.attendees).toEqual([]);
    expect(body.total).toBe(1);
  });

  it("con una suscripcion en vigor ve la lista (reason ok)", async () => {
    const yo = await crearAlumnoConPlan();
    const otro = await crearPersona();
    await reservar(otro.id);

    const body = await pedirOk(yo.token);

    expect(body.canSeeList).toBe(true);
    expect(body.reason).toBe("ok");
    expect(body.attendees).toHaveLength(1);
  });

  it("un freemium sin suscripcion es sin_plan", async () => {
    const yo = await crearPersona({ status: "freemium" });
    const otro = await crearPersona();
    await reservar(otro.id);

    const body = await pedirOk(yo.token);

    expect(body.canSeeList).toBe(false);
    expect(body.reason).toBe("sin_plan");
    expect(body.total).toBe(1);
  });

  // ── Sin ids en ningun valor (warning 6) ───────────────────────────────────

  it("ningun valor lleva el id de un usuario ni la ruta publica de la foto (ids grandes para evitar colisiones)", async () => {
    await app.dbPool.query("ALTER TABLE users AUTO_INCREMENT = 54321");
    mockPrivateMedia();
    const yo = await crearAlumnoConPlan();
    const conFotoPropia = await crearAlumnoConPlan();
    const conFicha = await crearAlumnoConPlan();
    expect(yo.id).toBeGreaterThan(1000);
    await seedMemberPhoto(app, conFotoPropia.id, { status: "aprobada" });
    const urlFicha = `${FOTO_PUBLIC_URL}/members/photos/${conFicha.id}-1700000000000.jpg`;
    await setUserPhotoUrl(app, conFicha.id, urlFicha);
    await seedMemberPhoto(app, conFicha.id, {
      origin: "ficha",
      status: "aprobada",
      sourceUrl: urlFicha,
    });
    for (const persona of [yo, conFotoPropia, conFicha]) {
      await reservar(persona.id);
    }
    const ids = [yo.id, conFotoPropia.id, conFicha.id];

    const body = await pedirOk(yo.token);

    expect(body.attendees.filter((a) => a.photoUrl !== null)).toHaveLength(2);
    for (const valor of leafValues(body)) {
      if (typeof valor === "number") {
        expect(ids).not.toContain(valor);
        continue;
      }
      expect(ids.map(String)).not.toContain(valor);
      expect(valor).not.toContain("members/photos/");
      const segmentos = valor.split("/");
      for (const id of ids) {
        expect(segmentos).not.toContain(String(id));
      }
      const avatar = /private\/avatars\/(\d+)\/([^/]+)\//.exec(valor);
      if (avatar) {
        expect(avatar[2]).toMatch(/^[0-9a-f]{24}$/);
        expect(ids.map(String)).not.toContain(avatar[2]);
      }
    }
  });

  // ── Sin etiquetas (D-52, D-15 revocada) ───────────────────────────────────

  it("el coach anotado aparece con nombre y su aura; las filas de coach, Wellhub y alumno tienen las mismas claves", async () => {
    const yo = await crearAlumnoConPlan();
    const alumno = await crearAlumnoConPlan();
    seq += 1;
    const coachEmail = `coach-anotados-${seq}-${Date.now()}@test.com`;
    const coachId = await createStaffUser(app, {
      email: coachEmail,
      password: "pass123456",
      firstName: "Coachy",
      lastName: "Profesor",
      role: "coach",
      branchId: testBranchId,
    });
    const wellhub = await crearPersona({ status: "wellhub" });
    await sembrarAura(coachId, 30);
    await sembrarAura(alumno.id, 25);
    await reservar(yo.id);
    await reservar(alumno.id);
    await reservar(coachId);
    await reservar(wellhub.id, { source: "wellhub" });

    const body = await pedirOk(yo.token);

    const coach = body.attendees.find((a) => a.firstName === "Coachy");
    const socioWellhub = body.attendees.find(
      (a) => a.firstName === wellhub.firstName,
    );
    const filaAlumno = body.attendees.find(
      (a) => a.firstName === alumno.firstName,
    );
    expect(body.total).toBe(4);
    expect(coach?.aura).toBe(30);
    expect(socioWellhub?.aura).toBeNull();
    expect(filaAlumno?.aura).toBe(25);
    const clavesAlumno = Object.keys(filaAlumno ?? {}).sort();
    expect(Object.keys(coach ?? {}).sort()).toEqual(clavesAlumno);
    expect(Object.keys(socioWellhub ?? {}).sort()).toEqual(clavesAlumno);
  });

  it("un alumno con Aura 0 viene con aura null (D-65)", async () => {
    const yo = await crearAlumnoConPlan();
    await reservar(yo.id);

    const body = await pedirOk(yo.token);

    expect(body.attendees[0].aura).toBeNull();
  });

  it("un staff que mira ve la lista aunque su status no sea activo", async () => {
    seq += 1;
    const email = `coach-viewer-${seq}-${Date.now()}@test.com`;
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

    expect(body.canSeeList).toBe(true);
    expect(body.reason).toBe("ok");
    expect(body.attendees.map((a) => a.firstName)).toEqual([alumno.firstName]);
  });

  // ── Fotos (D-43) ──────────────────────────────────────────────────────────

  it("foto propia aprobada y espejo de ficha: URL firmada y photoId; ficha sin espejo, espejo fallido o sin foto: null. El endpoint no escribe nada", async () => {
    mockPrivateMedia();
    const yo = await crearAlumnoConPlan();
    const propia = await crearAlumnoConPlan();
    const espejada = await crearAlumnoConPlan();
    const sinEspejo = await crearAlumnoConPlan();
    const fallida = await crearAlumnoConPlan();
    const nada = await crearAlumnoConPlan();
    const fotoPropia = await seedMemberPhoto(app, propia.id, {
      status: "aprobada",
    });
    const urlEspejada = `${FOTO_PUBLIC_URL}/members/photos/${espejada.id}-1700000000000.jpg`;
    await setUserPhotoUrl(app, espejada.id, urlEspejada);
    const espejo = await seedMemberPhoto(app, espejada.id, {
      origin: "ficha",
      status: "aprobada",
      sourceUrl: urlEspejada,
    });
    await setUserPhotoUrl(
      app,
      sinEspejo.id,
      `${FOTO_PUBLIC_URL}/members/photos/${sinEspejo.id}-1700000000001.jpg`,
    );
    const urlFallida = `${FOTO_PUBLIC_URL}/members/photos/${fallida.id}-1700000000002.jpg`;
    await setUserPhotoUrl(app, fallida.id, urlFallida);
    await seedMemberPhoto(app, fallida.id, {
      origin: "ficha",
      status: "fallida",
      sourceUrl: urlFallida,
    });
    for (const persona of [yo, propia, espejada, sinEspejo, fallida, nada]) {
      await reservar(persona.id);
    }
    const filasAntes = await app.db
      .select()
      .from(schema.memberPhotos)
      .where(tenantWhere(schema.memberPhotos, CTX));

    const body = await pedirOk(yo.token);

    const fila = (p: Persona) =>
      body.attendees.find((a) => a.firstName === p.firstName);
    expect(fila(propia)?.photoUrl).toBe(
      `https://r2.test/get/${fotoPropia.storageKey}`,
    );
    expect(fila(propia)?.photoId).toBe(fotoPropia.id);
    expect(fila(espejada)?.photoUrl).toBe(
      `https://r2.test/get/${espejo.storageKey}`,
    );
    expect(fila(espejada)?.photoId).toBe(espejo.id);
    for (const persona of [sinEspejo, fallida, nada, yo]) {
      expect(fila(persona)?.photoUrl).toBeNull();
      expect(fila(persona)?.photoId).toBeNull();
    }
    const filasDespues = await app.db
      .select()
      .from(schema.memberPhotos)
      .where(tenantWhere(schema.memberPhotos, CTX));
    expect(filasDespues).toHaveLength(filasAntes.length);
  });

  // ── Modulo de gamificacion ────────────────────────────────────────────────

  it("con templo-gamification apagado todos los aura vienen en null", async () => {
    const yo = await crearAlumnoConPlan();
    await sembrarAura(yo.id, 50);
    await reservar(yo.id);
    await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", false);

    const body = await pedirOk(yo.token);

    expect(body.attendees).toHaveLength(1);
    expect(body.attendees[0].aura).toBeNull();
  });

  // ── Fechas, horarios inexistentes y autenticacion ─────────────────────────

  it("fecha de ayer: 400", async () => {
    const yo = await crearAlumnoConPlan();

    const { res } = await pedir(yo.token, scheduleId, addDays(today, -1));

    expect(res.statusCode).toBe(400);
  });

  it("fecha a +32 dias: 400; a +31 dias: 200", async () => {
    const yo = await crearAlumnoConPlan();

    const fuera = await pedir(yo.token, scheduleId, addDays(today, 32));
    const limite = await pedir(yo.token, scheduleId, addDays(today, 31));

    expect(fuera.res.statusCode).toBe(400);
    expect(limite.res.statusCode, limite.res.body).toBe(200);
  });

  it("fecha con formato invalido: 400", async () => {
    const yo = await crearAlumnoConPlan();

    const { res } = await pedir(yo.token, scheduleId, "hoy");

    expect(res.statusCode).toBe(400);
  });

  it("scheduleId inexistente: 404", async () => {
    const yo = await crearAlumnoConPlan();

    const { res } = await pedir(yo.token, 999_999_999);

    expect(res.statusCode).toBe(404);
  });

  it("sin token: 401", async () => {
    const { res } = await pedir(null);

    expect(res.statusCode).toBe(401);
  });

  it("un horario de otro gimnasio es 404, indistinguible de uno inexistente", async () => {
    const yo = await crearAlumnoConPlan();
    const gym2 = await seedSecondTenant(app);

    const ajeno = await pedir(yo.token, gym2.scheduleId);
    const inexistente = await pedir(yo.token, 999_999_999);

    expect(ajeno.res.statusCode).toBe(404);
    expect(ajeno.res.body).toBe(inexistente.res.body);
  });
});
