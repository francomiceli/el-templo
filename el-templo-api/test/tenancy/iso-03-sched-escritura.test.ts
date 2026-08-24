/**
 * Fase 174.1 Plan 08 (ISO-03, ADO-04) — AISLAMIENTO de las ~19 rutas de
 * ESCRITURA de `scheduling`: CRUD de horarios/feriados/actividades, el
 * lifecycle completo de reservas admin, y las 4 rutas app-facing donde el
 * socio reserva/cancela.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Es el segundo archivo de la bateria de `scheduling` (el primero,
 * `iso-03-sched-lecturas.test.ts` de 174.1-07, cubrio las 13 rutas de
 * LECTURA). Aca vive el caso MAS importante del criterio SC1 del milestone:
 * "ni puede reservar contra un horario ajeno" — un socio/staff del gimnasio 2
 * que reserva contra un `scheduleId` de El Templo tiene que ser rechazado y
 * la `booking` NO puede quedar escrita. `bookings` es tabla del boundary
 * (174.1-CONTEXT, D-01): su aislamiento de ESCRITURA lo prueba esta bateria.
 *
 * QUE RUTAS CUBRE (19 rutas: 15 admin + 4 app-facing)
 * ----------------------------------------------------------------------
 *   CRUD de horarios/feriados/actividades (11):
 *     POST   /api/admin/scheduling/schedules
 *     POST   /api/admin/scheduling/schedules/seed
 *     PUT    /api/admin/scheduling/schedules/:scheduleId/toggle
 *     PATCH  /api/admin/scheduling/schedules/:scheduleId/activity
 *     POST   /api/admin/scheduling/schedules/:scheduleId/cancel-date
 *     DELETE /api/admin/scheduling/schedules/:scheduleId/cancel-date/:date
 *     POST   /api/admin/scheduling/schedules/:scheduleId/delete-from-date
 *     POST   /api/admin/scheduling/holidays
 *     DELETE /api/admin/scheduling/holidays/:holidayId
 *     POST   /api/admin/scheduling/activities
 *     PUT    /api/admin/scheduling/activities/:activityId
 *   Reservas y sesiones de prueba, admin y app-facing (8):
 *     POST   /api/admin/scheduling/bookings
 *     DELETE /api/admin/scheduling/bookings/:bookingId
 *     POST   /api/admin/scheduling/trials
 *     POST   /api/admin/scheduling/trials/:bookingId/reschedule
 *     POST   /api/members/scheduling/reserve
 *     POST   /api/members/scheduling/reserve-trial
 *     POST   /api/members/scheduling/cancel-trial
 *     DELETE /api/members/scheduling/bookings/:bookingId
 *
 * EL CONTRATO QUE SE AFIRMA (D-06 del milestone — cero "prohibido")
 * ---------------------------------------------------------------------------
 * El recurso de otro gimnasio es INDISTINGUIBLE de uno inexistente: 404 para
 * las escrituras by-id. **Nunca un "prohibido"** — un 403 confirmaria que el
 * horario/booking/actividad existe en otro gimnasio (T-174.1-08-05). El
 * criterio de aceptacion es un `grep -c` de esa asercion sobre el archivo
 * dando CERO.
 *
 * LA EVIDENCIA DE UNA ESCRITURA SE LEE DE LA BASE, CON VARIAS COLUMNAS JUNTAS
 * ----------------------------------------------------------------------------
 * Un rechazo que YA escribio la mitad se ve igual que uno limpio si se mira
 * una sola columna (Repudiation). Cada caso de escritura relee la fila
 * objetivo con una "foto" — varias columnas a la vez — ANTES y DESPUES del
 * intento, o cuenta filas (`bookings`, `schedule_exceptions`) sin filtro de
 * gimnasio para afirmar "cero filas nuevas". Mismo idioma que
 * `iso-03-members-altas-y-staff.test.ts` (173-28) e `iso-03-subs-escritura.test.ts`
 * (174.1-06).
 *
 * SC1 — "NI PUEDE RESERVAR CONTRA UN HORARIO AJENO"
 * ---------------------------------------------------------------------------
 * `POST /api/members/scheduling/reserve` (y `.../reserve-trial`) contra un
 * `scheduleId` de El Templo: `getScheduleSlotRaw` ya trae `tenantWhere`
 * (fase 173), asi que el horario ajeno es 404 "Horario no encontrado" ANTES
 * de tocar fecha/suscripcion/capacidad. Se cuenta `bookings` del memberId,
 * SIN filtro de gimnasio, antes y despues: cero filas nuevas.
 *
 * T-174.1-08-04 — EL FIX DE ESTE PLAN: `adminAddBooking` CON `memberId` AJENO
 * ---------------------------------------------------------------------------
 * A diferencia de `reserve`/`cancel` (donde `memberId` sale SIEMPRE de
 * `request.user.userId`), `POST /admin/scheduling/bookings` recibe `memberId`
 * como body field controlado por el admin. Sin la validacion agregada en este
 * plan (`booking-service.ts`, `adminAddBooking`), un `memberId` de OTRO
 * gimnasio + un `scheduleId` PROPIO pasaba de largo: `pickSubscriptionForActivity`
 * devolvia `null` (sin sub para ese userId en este tenant → solo warning) y el
 * INSERT quedaba con `tenant_id` del gimnasio actual pero `memberId` de un
 * socio ajeno — una fila de `bookings` con el ANCLA TORCIDA (mismo patron que
 * las guardas de ancla de la fase 173 para `users.branch_id`). El fix agrega
 * un lookup `tenantWhere(users, ctx)` sobre `memberId` ANTES del insert, 404
 * "Alumno no encontrado" si no matchea — mismo criterio que `bookTrial`
 * (trials-service.ts). La describe de `POST .../bookings` prueba las DOS
 * combinaciones cruzadas de ids (T-174.1-08-04 del threat_model).
 *
 * ROL MINIMO REAL
 * ----------------
 * Las 15 rutas admin estan detras del guard de MODULO `ALL_STAFF_ROLES`
 * (coach/admin/owner/gestion/recepcion) SIN un guard mas estricto por
 * handler — verificado leyendo `scheduling/routes.ts`: a diferencia de
 * `subscriptions` (que tiene 7 rutas Dueño-only via `PLANES_WRITE_ROLES`),
 * NINGUNA ruta de escritura de `scheduling` tiene un `preHandler` de rol mas
 * alla del guard de modulo. `gym2.coachToken` alcanza para las 15. Las 4
 * app-facing solo exigen autenticacion — un token de socio/freemium alcanza.
 *
 * EL THROW DEL SENTINEL LLEGA ENVUELTO — PERO ACA TODAVIA NO APLICA
 * ---------------------------------------------------------------------
 * Las 8 tablas del boundary (174.1-CONTEXT, D-01) NO estan en
 * `TENANT_STRICT_MODULES` todavia (el switch es el plan 174.1-10): todo
 * rechazo de este archivo viene del `tenantWhere` explicito que la fase 174
 * ya migro, no del sentinel.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-sched-escritura.test.ts
 *
 * @see test/tenancy/iso-03-sched-lecturas.test.ts — el plan 07, mismo fixture, ciclo de vida y helpers de mensaje
 * @see test/tenancy/iso-03-subs-escritura.test.ts — el plan 06, el molde de escritura mas cercano (dos ids, "foto" de columnas, combinaciones cruzadas)
 * @see test/tenancy/iso-03-members-altas-y-staff.test.ts — el molde original de escritura (173-28)
 * @see test/fixtures/subs-sched-gimnasio-dos.ts — la siembra que este archivo consume (NO la re-extiende)
 * @see .planning/phases/174.1-.../174.1-CONTEXT.md — D-01/D-06/D-07/D-08
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere, tenantValues, type TenantContext } from "../../src/modules/shared/tenant";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  sembrarSubsSchedGimnasioDos,
  limpiarSubsSchedDeLaBateria,
  tenantDeLaFila,
  type SubsSchedFixture,
} from "../fixtures/subs-sched-gimnasio-dos";
import {
  setDerivedLabelDescription,
  DERIVED_LABEL_DESCRIPTION_KEYS,
} from "../../src/modules/scheduling/label-descriptions";

// ─── Constantes ──────────────────────────────────────────────────────────────

const ADMIN_BASE = "/api/admin/scheduling";
const MEMBER_BASE = "/api/members/scheduling";

const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

/** Hash dummy: los leads sembrados a mano nunca inician sesion (solo los usa
 * el admin por id), asi que no hace falta `argon2.hash` real — mismo atajo
 * que `iso-03-sched-lecturas.test.ts`. */
const PASSWORD_HASH_DUMMY =
  "$argon2id$v=19$m=4096,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

// ─── Ciclo de vida (mismo criterio que 174.1-01/07) ─────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let fx: SubsSchedFixture;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
  fx = await sembrarSubsSchedGimnasioDos(app, gym2);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSubsSchedDeLaBateria(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades HTTP ─────────────────────────────────────────────────────────

/** Escritura admin como staff del gimnasio 2 (default: coach, el rol minimo real). */
async function comoAdminGimnasioDos(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: Record<string, unknown>,
  token: string = gym2.coachToken,
) {
  return app.inject({
    method,
    url: `${ADMIN_BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload }),
  });
}

/** Escritura app-facing con el token de socio/freemium indicado. */
async function comoMemberGimnasioDos(
  method: "POST" | "DELETE",
  url: string,
  token: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url: `${MEMBER_BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload }),
  });
}

// ─── Utilidades de fecha/horario ─────────────────────────────────────────────

/** Sufijo unico por corrida, mismo generador que el resto de los fixtures. */
function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

let __phoneSeqLocal = 0;
/** Telefono unico local (la unique de telefono es GLOBAL, fase 111). */
function telefonoUnico(): string {
  __phoneSeqLocal += 1;
  return `+549${String(Date.now()).slice(-8)}${String(__phoneSeqLocal).padStart(2, "0")}`;
}

/** ISO dayOfWeek (1=Lunes..7=Domingo) de una fecha YYYY-MM-DD, mismo criterio
 * que `assertDateWithinWindow`/`cancelScheduleDate` (noon UTC evita corrimientos
 * de huso horario). */
function isoDayOfWeekFor(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}

/** La primera fecha (desde HOY, hasta 8 dias) cuyo dayOfWeek ISO matchea el
 * pedido — determinista sin importar que dia de la semana corra la suite. */
function proximaFechaParaDia(targetIsoDow: number): string {
  for (let i = 0; i < 8; i++) {
    const d = dateOffsetStr(i);
    if (isoDayOfWeekFor(d) === targetIsoDow) return d;
  }
  throw new Error(
    `proximaFechaParaDia: no se encontro fecha para dow=${targetIsoDow} en 8 dias — imposible, hay 7 dias en una semana.`,
  );
}

/**
 * Crea un horario propio del gimnasio 2, con dayOfWeek = el de MAÑANA (hoy+1)
 * y horario tarde (23:00-23:59) para que nunca caiga "ya paso" — usado por
 * los controles positivos de `reserve`/`reserve-trial`, cuya ventana de
 * reserva/prueba exige que la fecha matchee el dia de la semana del horario.
 */
async function crearHorarioParaManana(): Promise<number> {
  const dow = isoDayOfWeekFor(dateOffsetStr(1));
  const [row] = await app.db
    .insert(schema.schedules)
    .values(
      tenantValues(CTX_DOS, {
        branchId: gym2.branchId,
        activityId: gym2.activityId,
        dayOfWeek: dow,
        startTime: "23:00",
        endTime: "23:59",
        isActive: true,
      }),
    )
    .$returningId();
  return row.id;
}

/** Un lead directo (`status` explicito), por INSERT crudo — mismo patron que
 * `iso-03-sched-lecturas.test.ts` (`POST /auth/register` fuerza siempre
 * `status: 'freemium'`, asi que no hay otra forma de sembrar un `status:
 * 'prueba'` real sin pasar por el admin). No necesita loguearse: los tests
 * de este archivo que lo usan (`bookTrial`/`reschedule`) son ADMIN-iniciados. */
async function crearLeadDirecto(
  ctx: TenantContext,
  branchId: number,
  opts: { firstName: string; lastName: string; status: "prueba" | "freemium" },
): Promise<number> {
  const suf = sufijo();
  const [row] = await app.db
    .insert(schema.users)
    .values(
      tenantValues(ctx, {
        email: `${opts.firstName.toLowerCase()}-${suf}@test.com`,
        passwordHash: PASSWORD_HASH_DUMMY,
        firstName: opts.firstName,
        lastName: opts.lastName,
        dni: `${opts.firstName.slice(0, 3).toUpperCase()}${suf}`,
        phone: telefonoUnico(),
        role: "member" as const,
        branchId,
        branchUpdatedAt: new Date(),
        branchSource: "manual" as const,
        level: "kairos" as const,
        status: opts.status,
      }),
    )
    .$returningId();
  return row.id;
}

/** Una reserva de PRUEBA por INSERT directo — mismo patron que
 * `iso-03-sched-lecturas.test.ts` (`crearReservaDirecta`, `isTrial: true`). */
async function crearReservaDePruebaDirecta(
  ctx: TenantContext,
  memberId: number,
  scheduleId: number,
  bookingDate: string,
): Promise<number> {
  const [row] = await app.db
    .insert(schema.bookings)
    .values(
      tenantValues(ctx, {
        memberId,
        scheduleId,
        bookingDate,
        status: "reservado" as const,
        isTrial: true,
      }),
    )
    .$returningId();
  return row.id;
}

// ─── Mensajes compartidos (mismo idioma que 174.1-06/173-28) ────────────────

function porQueImporta(ruta: string, filaId: number): string {
  return (
    `${ruta} le dejo escribir (o le devolvio datos) al staff/socio del gimnasio ${TENANT_DOS} sobre la ` +
    `fila ${filaId}, que es de El Templo (${TENANT_TEMPLO}). El contrato del milestone (D-06) es que ` +
    `el recurso ajeno sea indistinguible de uno inexistente: "no encontrado", nunca "prohibido". Revisar ` +
    `el metodo que sirve esa ruta en src/modules/scheduling/{service,booking-service,holiday-service,` +
    `activity-service,trials-service}.ts y su handler en routes.ts.`
  );
}

function porQueImportaElControl(ruta: string, filaId: number): string {
  return (
    `${ruta} NO le dejo operar al staff/socio del gimnasio ${TENANT_DOS} sobre su PROPIA fila ${filaId}. ` +
    `Esto no es aislamiento sino siembra o scope de mas: sin este control, el caso de aislamiento de al ` +
    `lado pasaria en verde por la razon equivocada. Revisar test/fixtures/subs-sched-gimnasio-dos.ts / ` +
    `test/fixtures/second-tenant.ts.`
  );
}

// ─── "Fotos" leidas de la base (varias columnas juntas) ─────────────────────

async function consultar<T>(consulta: SQL): Promise<T[]> {
  const resultado = (await app.db.execute(consulta)) as unknown as [T[]];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as T[]);
  return filas ?? [];
}

interface FotoDeSchedule {
  tenantId: number | null;
  active: boolean | null;
  activityId: number | null;
  updatedAt: string | null;
}

async function fotoDeSchedule(scheduleId: number): Promise<FotoDeSchedule> {
  const filas = await consultar<{
    tenant_id: number | null;
    is_active: number | null;
    activity_id: number | null;
    updated_at: string | null;
  }>(
    sql`SELECT /* tenant-safe: releer la fila (ajena o propia) es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ tenant_id, is_active, activity_id, updated_at FROM schedules WHERE id = ${scheduleId}`,
  );
  const f = filas[0];
  if (f === undefined) {
    return { tenantId: null, active: null, activityId: null, updatedAt: null };
  }
  return {
    tenantId: f.tenant_id === null ? null : Number(f.tenant_id),
    active: f.is_active === null ? null : Boolean(f.is_active),
    activityId: f.activity_id === null ? null : Number(f.activity_id),
    updatedAt: f.updated_at === null ? null : String(f.updated_at),
  };
}

interface FotoDeBooking {
  tenantId: number | null;
  status: string | null;
  waitlistPosition: number | null;
}

async function fotoDeBooking(bookingId: number): Promise<FotoDeBooking> {
  const filas = await consultar<{
    tenant_id: number | null;
    status: string | null;
    waitlist_position: number | null;
  }>(
    // La columna real es `booking_status` (el 1er arg de `mysqlEnum` en
    // bookings.ts) — el campo JS `status` es solo el nombre de la propiedad
    // Drizzle, no el de la columna (mismo gotcha que `subscription_status` en
    // iso-03-subs-escritura.test.ts). Alias para no arrastrar el desacople.
    sql`SELECT /* tenant-safe: releer la fila (ajena o propia) es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ tenant_id, booking_status AS status, waitlist_position FROM bookings WHERE id = ${bookingId}`,
  );
  const f = filas[0];
  if (f === undefined) {
    return { tenantId: null, status: null, waitlistPosition: null };
  }
  return {
    tenantId: f.tenant_id === null ? null : Number(f.tenant_id),
    status: f.status,
    waitlistPosition: f.waitlist_position === null ? null : Number(f.waitlist_position),
  };
}

interface FotoDeHoliday {
  tenantId: number | null;
  name: string | null;
}

async function fotoDeHoliday(holidayId: number): Promise<FotoDeHoliday> {
  const filas = await consultar<{ tenant_id: number | null; name: string | null }>(
    sql`SELECT /* tenant-safe: releer la fila (ajena o propia) es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ tenant_id, name FROM holidays WHERE id = ${holidayId}`,
  );
  const f = filas[0];
  if (f === undefined) return { tenantId: null, name: null };
  return {
    tenantId: f.tenant_id === null ? null : Number(f.tenant_id),
    name: f.name,
  };
}

interface FotoDeActivity {
  tenantId: number | null;
  active: boolean | null;
  name: string | null;
}

async function fotoDeActivity(activityId: number): Promise<FotoDeActivity> {
  const filas = await consultar<{
    tenant_id: number | null;
    is_active: number | null;
    name: string | null;
  }>(
    sql`SELECT /* tenant-safe: releer la fila (ajena o propia) es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ tenant_id, is_active, name FROM activities WHERE id = ${activityId}`,
  );
  const f = filas[0];
  if (f === undefined) return { tenantId: null, active: null, name: null };
  return {
    tenantId: f.tenant_id === null ? null : Number(f.tenant_id),
    active: f.is_active === null ? null : Boolean(f.is_active),
    name: f.name,
  };
}

/** Cuenta filas de `bookings` para un memberId, SIN filtro de gimnasio ("cero filas nuevas"). */
async function contarBookingsDeMiembro(memberId: number): Promise<number> {
  const filas = await consultar<{ c: number }>(
    sql`SELECT /* tenant-safe: contar bookings de un memberId (sin filtro de gimnasio) es la asercion de "cero filas nuevas" — filtrar la volveria tautologica */ COUNT(*) AS c FROM bookings WHERE member_id = ${memberId}`,
  );
  return Number(filas[0]?.c ?? 0);
}

/** Cuenta filas de `schedule_exceptions` para un scheduleId, SIN filtro de gimnasio. */
async function contarExcepcionesDeHorario(scheduleId: number): Promise<number> {
  const filas = await consultar<{ c: number }>(
    sql`SELECT /* tenant-safe: contar schedule_exceptions de un scheduleId (sin filtro de gimnasio) es la asercion de "cero filas nuevas" — filtrar la volveria tautologica */ COUNT(*) AS c FROM schedule_exceptions WHERE schedule_id = ${scheduleId}`,
  );
  return Number(filas[0]?.c ?? 0);
}

/** Resuelve el id de la excepcion recien creada por (scheduleId, date), sin filtro de gimnasio. */
async function idDeExcepcion(scheduleId: number, date: string): Promise<number | null> {
  const filas = await consultar<{ id: number }>(
    sql`SELECT /* tenant-safe: resolver el id de la fila recien creada ES la precondicion del resto de la asercion */ id FROM schedule_exceptions WHERE schedule_id = ${scheduleId} AND exception_date = ${date} LIMIT 1`,
  );
  return filas[0] === undefined ? null : Number(filas[0].id);
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones: sin esto, todo lo de abajo puede pasar por la razon equivocada
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la bateria", () => {
  it("las dos sedes son del MISMO pais, asi que el aislamiento no lo puede estar dando el country scope", async () => {
    const [sedeDos] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(and(tenantWhere(schema.branches, CTX_DOS), eq(schema.branches.id, gym2.branchId)));
    const [sedeTemplo] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(
        and(tenantWhere(schema.branches, CTX_TEMPLO), eq(schema.branches.id, fx.templo.branchId)),
      );
    expect(
      [sedeDos?.country, sedeTemplo?.country],
      "Las dos sedes dejaron de compartir pais. Este archivo prueba que el GIMNASIO aisla; con paises " +
        "distintos el filtro de country escondaria las filas ajenas igual.",
    ).toEqual(["AR", "AR"]);
  });

  it("El Templo y el gimnasio 2 tienen cada uno su horario/booking/excepcion/feriado/actividad VIVOS, en su propio gimnasio", async () => {
    expect(
      [
        await tenantDeLaFila(app, "schedules", fx.templo.scheduleId),
        await tenantDeLaFila(app, "bookings", fx.templo.bookingId),
        await tenantDeLaFila(app, "schedule_exceptions", fx.templo.scheduleExceptionId),
        await tenantDeLaFila(app, "holidays", fx.templo.holidayId),
      ],
      "Alguna fila ajena no quedo en El Templo. Revisar sembrarLadoTemplo en subs-sched-gimnasio-dos.ts.",
    ).toEqual(Array(4).fill(TENANT_TEMPLO));
    expect(
      [
        await tenantDeLaFila(app, "schedules", fx.dos.scheduleId),
        await tenantDeLaFila(app, "bookings", fx.dos.bookingId),
        await tenantDeLaFila(app, "schedule_exceptions", fx.dos.scheduleExceptionId),
        await tenantDeLaFila(app, "holidays", fx.dos.holidayId),
      ],
      "Alguna fila del gimnasio 2 nacio en El Templo por el DEFAULT 1.",
    ).toEqual(Array(4).fill(TENANT_DOS));
  });

  it("los dos horarios sembrados tienen dia/hora DISTINTOS, y los feriados fechas DISTINTAS", async () => {
    expect(
      fx.templo.scheduleId,
      "El scheduleId de El Templo y el del gimnasio 2 tienen que ser distintos.",
    ).not.toBe(fx.dos.scheduleId);
    expect(
      [fx.templo.holidayDate, fx.dos.holidayDate],
      "Los feriados sembrados dejaron de tener fechas distintas entre gimnasios.",
    ).toEqual(["2097-04-10", "2097-04-11"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Task 1 — CRUD de horarios, feriados y actividades (11 rutas)
// ═══════════════════════════════════════════════════════════════════════════

describe("crear horario — POST /api/admin/scheduling/schedules", () => {
  const RUTA = "POST /api/admin/scheduling/schedules";

  it("aislamiento: crear un horario con un activityId de El Templo se rechaza — no hay recurso propio que la referencia ajena pueda tocar", async () => {
    const res = await comoAdminGimnasioDos("POST", "/schedules", {
      branchId: gym2.branchId,
      activityId: fx.templo.activityId,
      dayOfWeek: 5,
      startTime: "06:00",
      endTime: "07:00",
    });
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.activityId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
  });

  it("control: crear un horario propio SI funciona, y nace con tenant_id = TENANT_DOS", async () => {
    const res = await comoAdminGimnasioDos("POST", "/schedules", {
      branchId: gym2.branchId,
      activityId: gym2.activityId,
      dayOfWeek: 5,
      startTime: "06:00",
      endTime: "07:00",
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.branchId) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const body = JSON.parse(res.body) as { id: number };
    expect(
      await tenantDeLaFila(app, "schedules", body.id),
      `${RUTA}: el horario creado por el staff del gimnasio ${TENANT_DOS} tiene que nacer con ese tenant_id.`,
    ).toBe(TENANT_DOS);
  });
});

describe("sembrar horarios default — POST /api/admin/scheduling/schedules/seed", () => {
  const RUTA = "POST /api/admin/scheduling/schedules/seed";

  it("aislamiento (unicidad por tenant): la actividad 'General' que crea el seed no choca con la de El Templo", async () => {
    // Precondicion: El Templo YA tiene una actividad 'General' (sembrada a
    // mano aca, simulando que otro seed/alta la creo antes). Si el lookup de
    // "existe o crea" del seed no filtrara por gimnasio, esta 2da creacion
    // reusaria la fila ajena en vez de crear la propia del gimnasio 2.
    await app.db.insert(schema.activities).values(
      tenantValues(CTX_TEMPLO, { name: "General", isActive: true }),
    );

    const res = await comoAdminGimnasioDos("POST", "/schedules/seed", {
      branchId: gym2.branchId,
    });
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(201);

    const [propia] = await app.db
      .select({ id: schema.activities.id })
      .from(schema.activities)
      .where(
        and(
          tenantWhere(schema.activities, CTX_DOS),
          eq(schema.activities.name, "General"),
        ),
      )
      .limit(1);
    expect(
      propia,
      `${RUTA}: el seed no creo su PROPIA actividad 'General' para el gimnasio ${TENANT_DOS} — ` +
        "probablemente reuso la de El Templo (el lookup de existencia no filtra por gimnasio).",
    ).toBeDefined();
  });

  it("control: todos los horarios sembrados nacen con tenant_id = TENANT_DOS", async () => {
    const res = await comoAdminGimnasioDos("POST", "/schedules/seed", {
      branchId: gym2.branchId,
    });
    expect(res.statusCode, porQueImportaElControl(RUTA, gym2.branchId) + ` Respuesta: ${res.body}`).toBe(
      201,
    );
    const body = JSON.parse(res.body) as { created: number };
    expect(body.created, `${RUTA}: el seed no creo ningun horario.`).toBeGreaterThan(0);

    const sembrados = await app.db
      .select({ id: schema.schedules.id })
      .from(schema.schedules)
      .where(
        and(tenantWhere(schema.schedules, CTX_DOS), eq(schema.schedules.branchId, gym2.branchId)),
      );
    for (const s of sembrados) {
      expect(
        await tenantDeLaFila(app, "schedules", s.id),
        `${RUTA}: el horario ${s.id} sembrado por el gimnasio ${TENANT_DOS} tiene que tener ese tenant_id.`,
      ).toBe(TENANT_DOS);
    }
  });
});

describe("activar/desactivar horario — PUT /api/admin/scheduling/schedules/:scheduleId/toggle", () => {
  const RUTA = "PUT /api/admin/scheduling/schedules/:scheduleId/toggle";

  it("aislamiento: desactivar un horario de El Templo se rechaza, y sigue activo (foto sin cambios)", async () => {
    const antes = await fotoDeSchedule(fx.templo.scheduleId);
    expect(antes.active, "Precondicion: el horario de El Templo empieza activo.").toBe(true);
    const res = await comoAdminGimnasioDos("PUT", `/schedules/${fx.templo.scheduleId}/toggle`, {
      isActive: false,
    });
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSchedule(fx.templo.scheduleId);
    expect(despues, `${RUTA}: el rechazo no puede dejar cambios en el horario de El Templo.`).toEqual(
      antes,
    );
  });

  it("control: desactivar el horario propio del gimnasio 2 SI funciona", async () => {
    const res = await comoAdminGimnasioDos("PUT", `/schedules/${fx.dos.scheduleId}/toggle`, {
      isActive: false,
      inactiveReason: "control 174.1-08",
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeSchedule(fx.dos.scheduleId);
    expect([despues.tenantId, despues.active]).toEqual([TENANT_DOS, false]);
  });
});

describe("cambiar actividad del horario — PATCH /api/admin/scheduling/schedules/:scheduleId/activity", () => {
  const RUTA = "PATCH /api/admin/scheduling/schedules/:scheduleId/activity";

  it("aislamiento: un scheduleId de El Templo se rechaza, y su actividad NO cambia", async () => {
    const antes = await fotoDeSchedule(fx.templo.scheduleId);
    const res = await comoAdminGimnasioDos(
      "PATCH",
      `/schedules/${fx.templo.scheduleId}/activity`,
      { activityId: gym2.activityId },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSchedule(fx.templo.scheduleId);
    expect(despues).toEqual(antes);
  });

  it("combinacion cruzada: un scheduleId PROPIO con un activityId de El Templo se rechaza, sin cambios", async () => {
    const antes = await fotoDeSchedule(fx.dos.scheduleId);
    const res = await comoAdminGimnasioDos(
      "PATCH",
      `/schedules/${fx.dos.scheduleId}/activity`,
      { activityId: fx.templo.activityId },
    );
    expect(
      res.statusCode,
      `${RUTA}: un scheduleId PROPIO con un activityId de OTRO gimnasio tiene que rechazarse. ` +
        `Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSchedule(fx.dos.scheduleId);
    expect(
      despues,
      `${RUTA}: el rechazo del activityId ajeno no puede dejar cambios en el horario propio.`,
    ).toEqual(antes);
  });

  it("control: cambiar a una actividad propia SI funciona", async () => {
    const res = await comoAdminGimnasioDos(
      "PATCH",
      `/schedules/${fx.dos.scheduleId}/activity`,
      { activityId: gym2.activityId },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeSchedule(fx.dos.scheduleId);
    expect([despues.tenantId, despues.activityId]).toEqual([TENANT_DOS, gym2.activityId]);
  });
});

describe("cancelar UNA fecha — POST /api/admin/scheduling/schedules/:scheduleId/cancel-date", () => {
  const RUTA = "POST /api/admin/scheduling/schedules/:scheduleId/cancel-date";

  it("aislamiento: un scheduleId de El Templo se rechaza, y CERO excepciones nuevas", async () => {
    const antes = await contarExcepcionesDeHorario(fx.templo.scheduleId);
    const res = await comoAdminGimnasioDos(
      "POST",
      `/schedules/${fx.templo.scheduleId}/cancel-date`,
      { date: fx.templo.bookingDate, reason: "intento cross-tenant" },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await contarExcepcionesDeHorario(fx.templo.scheduleId);
    expect(
      despues,
      `${RUTA}: el rechazo del scheduleId ajeno no puede crear NINGUNA fila en schedule_exceptions.`,
    ).toBe(antes);
  });

  it("control: cancelar una fecha del horario propio SI funciona, la excepcion nace con tenant_id = TENANT_DOS", async () => {
    // `fx.dos.scheduleId` nace con dayOfWeek=4 (jueves) — ver sembrarLadoGimnasioDos.
    const fecha = proximaFechaParaDia(4);
    const res = await comoAdminGimnasioDos(
      "POST",
      `/schedules/${fx.dos.scheduleId}/cancel-date`,
      { date: fecha, reason: "control 174.1-08" },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as { exceptionDate: string };
    expect(body.exceptionDate).toBe(fecha);
    const nuevaId = await idDeExcepcion(fx.dos.scheduleId, fecha);
    expect(nuevaId).not.toBeNull();
    expect(
      await tenantDeLaFila(app, "schedule_exceptions", nuevaId as number),
      `${RUTA}: la excepcion creada por el staff del gimnasio ${TENANT_DOS} tiene que nacer con ese tenant_id.`,
    ).toBe(TENANT_DOS);
  });
});

describe("restaurar UNA fecha — DELETE /api/admin/scheduling/schedules/:scheduleId/cancel-date/:date", () => {
  const RUTA = "DELETE /api/admin/scheduling/schedules/:scheduleId/cancel-date/:date";

  it("aislamiento: un scheduleId de El Templo se rechaza, y la excepcion ajena sigue existiendo", async () => {
    const res = await comoAdminGimnasioDos(
      "DELETE",
      `/schedules/${fx.templo.scheduleId}/cancel-date/${fx.templo.scheduleExceptionDate}`,
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      await tenantDeLaFila(app, "schedule_exceptions", fx.templo.scheduleExceptionId),
      `${RUTA}: el rechazo no puede haber borrado la excepcion de El Templo.`,
    ).toBe(TENANT_TEMPLO);
  });

  it("control: restaurar una fecha del horario propio SI funciona (borra la excepcion propia)", async () => {
    const res = await comoAdminGimnasioDos(
      "DELETE",
      `/schedules/${fx.dos.scheduleId}/cancel-date/${fx.dos.scheduleExceptionDate}`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const idAun = await idDeExcepcion(fx.dos.scheduleId, fx.dos.scheduleExceptionDate);
    expect(
      idAun,
      `${RUTA}: la excepcion propia deberia haber sido borrada por la restauracion.`,
    ).toBeNull();
  });
});

describe("eliminar horario desde una fecha — POST /api/admin/scheduling/schedules/:scheduleId/delete-from-date", () => {
  const RUTA = "POST /api/admin/scheduling/schedules/:scheduleId/delete-from-date";

  it("aislamiento: un scheduleId de El Templo se rechaza, y sigue activo (foto sin cambios)", async () => {
    const antes = await fotoDeSchedule(fx.templo.scheduleId);
    const res = await comoAdminGimnasioDos(
      "POST",
      `/schedules/${fx.templo.scheduleId}/delete-from-date`,
      { fromDate: dateOffsetStr(60) },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeSchedule(fx.templo.scheduleId);
    expect(despues).toEqual(antes);
  });

  it("control: eliminar el horario propio desde una fecha futura SI funciona (queda inactivo)", async () => {
    const res = await comoAdminGimnasioDos(
      "POST",
      `/schedules/${fx.dos.scheduleId}/delete-from-date`,
      { fromDate: dateOffsetStr(60) },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeSchedule(fx.dos.scheduleId);
    expect([despues.tenantId, despues.active]).toEqual([TENANT_DOS, false]);
  });
});

describe("crear feriado — POST /api/admin/scheduling/holidays", () => {
  const RUTA = "POST /api/admin/scheduling/holidays";

  it("aislamiento (unicidad por tenant): reusar fecha+pais del feriado de El Templo no choca — la unique es (tenant_id, country, date)", async () => {
    const res = await comoAdminGimnasioDos("POST", "/holidays", {
      country: "AR",
      date: fx.templo.holidayDate,
      name: `ISO03SS Feriado GDos Colision ${sufijo()}`,
    });
    expect(
      res.statusCode,
      `${RUTA}: crear un feriado con la misma fecha+pais que uno de El Templo tiene que funcionar — ` +
        `si choca (409), la unicidad esta mirando TODOS los gimnasios. Respuesta: ${res.body}`,
    ).toBe(201);
  });

  it("control: el alta con datos propios funciona, y la fila nace con tenant_id = TENANT_DOS", async () => {
    const res = await comoAdminGimnasioDos("POST", "/holidays", {
      country: "AR",
      date: "2097-04-12",
      name: `ISO03SS Feriado GDos Nuevo ${sufijo()}`,
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.branchId) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const body = JSON.parse(res.body) as { id: number };
    expect(
      await tenantDeLaFila(app, "holidays", body.id),
      `${RUTA}: el feriado creado por el staff del gimnasio ${TENANT_DOS} tiene que nacer con ese tenant_id.`,
    ).toBe(TENANT_DOS);
  });
});

describe("eliminar feriado — DELETE /api/admin/scheduling/holidays/:holidayId", () => {
  const RUTA = "DELETE /api/admin/scheduling/holidays/:holidayId";

  it("aislamiento: eliminar un feriado de El Templo se rechaza, y sigue existiendo", async () => {
    const antes = await fotoDeHoliday(fx.templo.holidayId);
    const res = await comoAdminGimnasioDos("DELETE", `/holidays/${fx.templo.holidayId}`);
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.holidayId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeHoliday(fx.templo.holidayId);
    expect(despues, `${RUTA}: el rechazo no puede haber borrado el feriado de El Templo.`).toEqual(
      antes,
    );
  });

  it("control: eliminar el feriado propio del gimnasio 2 SI funciona", async () => {
    const res = await comoAdminGimnasioDos("DELETE", `/holidays/${fx.dos.holidayId}`);
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.holidayId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeHoliday(fx.dos.holidayId);
    expect(despues.name, `${RUTA}: el feriado propio deberia haber sido borrado.`).toBeNull();
  });
});

describe("crear actividad — POST /api/admin/scheduling/activities", () => {
  const RUTA = "POST /api/admin/scheduling/activities";

  it("aislamiento (unicidad por tenant): reusar el NOMBRE de la actividad de El Templo no choca — la unique es por gimnasio", async () => {
    const [actTemplo] = await app.db
      .select({ name: schema.activities.name })
      .from(schema.activities)
      .where(
        and(tenantWhere(schema.activities, CTX_TEMPLO), eq(schema.activities.id, fx.templo.activityId)),
      );
    const res = await comoAdminGimnasioDos("POST", "/activities", {
      name: actTemplo?.name,
    });
    expect(
      res.statusCode,
      `${RUTA}: crear una actividad con el mismo nombre que una de El Templo tiene que funcionar — si ` +
        `choca (409), la unicidad esta mirando TODOS los gimnasios. Respuesta: ${res.body}`,
    ).toBe(201);
  });

  it("control: el alta con datos propios funciona, y la fila nace con tenant_id = TENANT_DOS", async () => {
    const res = await comoAdminGimnasioDos("POST", "/activities", {
      name: `ISO03SS Actividad Nueva ${sufijo()}`,
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.branchId) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const body = JSON.parse(res.body) as { id: number };
    expect(
      (await fotoDeActivity(body.id)).tenantId,
      `${RUTA}: la actividad creada por el staff del gimnasio ${TENANT_DOS} tiene que nacer con ese tenant_id.`,
    ).toBe(TENANT_DOS);
  });
});

describe("editar actividad — PUT /api/admin/scheduling/activities/:activityId", () => {
  const RUTA = "PUT /api/admin/scheduling/activities/:activityId";

  it("aislamiento: editar una actividad de El Templo se rechaza, y la fila (tenant_id/active/name) NO cambia", async () => {
    const antes = await fotoDeActivity(fx.templo.activityId);
    const res = await comoAdminGimnasioDos("PUT", `/activities/${fx.templo.activityId}`, {
      name: "Hackeado174.1",
    });
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.activityId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeActivity(fx.templo.activityId);
    expect(despues, `${RUTA}: el rechazo no puede dejar cambios en la actividad de El Templo.`).toEqual(
      antes,
    );
  });

  it("control: editar la actividad propia del gimnasio 2 SI funciona", async () => {
    const res = await comoAdminGimnasioDos("PUT", `/activities/${fx.dos.activityId}`, {
      name: `ISO03SS Actividad Editada ${sufijo()}`,
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.activityId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeActivity(fx.dos.activityId);
    expect(despues.tenantId).toBe(TENANT_DOS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Task 2 — Reservas y trials, admin y app-facing (8 rutas) — SC1
// ═══════════════════════════════════════════════════════════════════════════

describe("agregar reserva (admin) — POST /api/admin/scheduling/bookings", () => {
  const RUTA = "POST /api/admin/scheduling/bookings";
  const FECHA = dateOffsetStr(20);

  it("aislamiento: scheduleId Y memberId ambos de El Templo se rechaza — 'Horario no encontrado' (se evalua primero), CERO bookings nuevas", async () => {
    const antes = await contarBookingsDeMiembro(fx.templo.userId);
    const res = await comoAdminGimnasioDos("POST", "/bookings", {
      scheduleId: fx.templo.scheduleId,
      memberId: fx.templo.userId,
      date: FECHA,
    });
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await contarBookingsDeMiembro(fx.templo.userId);
    expect(despues, `${RUTA}: el rechazo no puede crear NINGUNA fila en bookings.`).toBe(antes);
  });

  it("combinacion cruzada A (T-174.1-08-04): memberId de El Templo + scheduleId PROPIO se rechaza — 'Alumno no encontrado', CERO bookings nuevas", async () => {
    const antes = await contarBookingsDeMiembro(fx.templo.userId);
    const res = await comoAdminGimnasioDos("POST", "/bookings", {
      scheduleId: gym2.scheduleId,
      memberId: fx.templo.userId,
      date: FECHA,
    });
    expect(
      res.statusCode,
      `${RUTA}: un memberId de El Templo con un scheduleId PROPIO tiene que rechazarse ("Alumno no ` +
        `encontrado", T-174.1-08-04). Respuesta: ${res.body}`,
    ).toBe(404);
    const body = JSON.parse(res.body) as { message: string };
    expect(body.message).toContain("Alumno no encontrado");
    const despues = await contarBookingsDeMiembro(fx.templo.userId);
    expect(
      despues,
      `${RUTA}: el rechazo del memberId ajeno no puede crear NINGUNA fila en bookings (ancla torcida).`,
    ).toBe(antes);
  });

  it("combinacion cruzada B: memberId PROPIO + scheduleId de El Templo se rechaza — 'Horario no encontrado', CERO bookings nuevas", async () => {
    const antes = await contarBookingsDeMiembro(gym2.socios[1].id);
    const res = await comoAdminGimnasioDos("POST", "/bookings", {
      scheduleId: fx.templo.scheduleId,
      memberId: gym2.socios[1].id,
      date: FECHA,
    });
    expect(
      res.statusCode,
      `${RUTA}: un memberId PROPIO con un scheduleId de El Templo tiene que rechazarse. Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await contarBookingsDeMiembro(gym2.socios[1].id);
    expect(
      despues,
      `${RUTA}: el rechazo del scheduleId ajeno no puede crear NINGUNA fila en bookings.`,
    ).toBe(antes);
  });

  it("control: memberId y scheduleId propios funciona, la reserva nace con tenant_id = TENANT_DOS", async () => {
    const res = await comoAdminGimnasioDos("POST", "/bookings", {
      scheduleId: gym2.scheduleId,
      memberId: gym2.socios[1].id,
      date: FECHA,
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[1].id) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const body = JSON.parse(res.body) as { booking: { id: number } };
    expect(
      await tenantDeLaFila(app, "bookings", body.booking.id),
      `${RUTA}: la reserva creada por el staff del gimnasio ${TENANT_DOS} tiene que nacer con ese tenant_id.`,
    ).toBe(TENANT_DOS);
  });
});

describe("quitar reserva (admin) — DELETE /api/admin/scheduling/bookings/:bookingId", () => {
  const RUTA = "DELETE /api/admin/scheduling/bookings/:bookingId";

  it("aislamiento: un bookingId de El Templo se rechaza, y la reserva NO cambia de estado", async () => {
    const antes = await fotoDeBooking(fx.templo.bookingId);
    expect(antes.status, "Precondicion: la reserva de El Templo empieza reservada.").toBe(
      "reservado",
    );
    const res = await comoAdminGimnasioDos("DELETE", `/bookings/${fx.templo.bookingId}`);
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.bookingId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeBooking(fx.templo.bookingId);
    expect(despues, `${RUTA}: el rechazo no puede dejar cambios en la reserva de El Templo.`).toEqual(
      antes,
    );
  });

  it("control: quitar la reserva propia del gimnasio 2 SI funciona", async () => {
    const res = await comoAdminGimnasioDos("DELETE", `/bookings/${fx.dos.bookingId}`);
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.bookingId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeBooking(fx.dos.bookingId);
    expect([despues.tenantId, despues.status]).toEqual([TENANT_DOS, "cancelado"]);
  });
});

describe("agendar sesion de prueba (admin) — POST /api/admin/scheduling/trials", () => {
  const RUTA = "POST /api/admin/scheduling/trials";
  const FECHA = dateOffsetStr(10);

  it("aislamiento: un userId de El Templo + scheduleId PROPIO se rechaza — 'Alumno no encontrado', CERO bookings nuevas", async () => {
    const antes = await contarBookingsDeMiembro(fx.templo.userId);
    const res = await comoAdminGimnasioDos("POST", "/trials", {
      userId: fx.templo.userId,
      scheduleId: gym2.scheduleId,
      bookingDate: FECHA,
    });
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.userId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await contarBookingsDeMiembro(fx.templo.userId);
    expect(despues, `${RUTA}: el rechazo no puede crear NINGUNA fila en bookings.`).toBe(antes);
  });

  it("combinacion cruzada: scheduleId de El Templo + userId PROPIO se rechaza — 'Horario no encontrado'", async () => {
    const antes = await contarBookingsDeMiembro(gym2.socios[0].id);
    const res = await comoAdminGimnasioDos("POST", "/trials", {
      userId: gym2.socios[0].id,
      scheduleId: fx.templo.scheduleId,
      bookingDate: FECHA,
    });
    expect(
      res.statusCode,
      `${RUTA}: un scheduleId de El Templo con un userId PROPIO tiene que rechazarse. Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await contarBookingsDeMiembro(gym2.socios[0].id);
    expect(despues).toBe(antes);
  });

  it("control: agendar la sesion de prueba propia SI funciona, nace con tenant_id = TENANT_DOS", async () => {
    const leadDosId = await crearLeadDirecto(CTX_DOS, gym2.branchId, {
      firstName: "TrialAdminDos",
      lastName: `ISO0308${sufijo()}`,
      status: "prueba",
    });
    const res = await comoAdminGimnasioDos("POST", "/trials", {
      userId: leadDosId,
      scheduleId: gym2.scheduleId,
      bookingDate: FECHA,
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, leadDosId) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const body = JSON.parse(res.body) as { bookingId: number };
    expect(
      await tenantDeLaFila(app, "bookings", body.bookingId),
      `${RUTA}: la sesion de prueba agendada por el staff del gimnasio ${TENANT_DOS} tiene que nacer con ese tenant_id.`,
    ).toBe(TENANT_DOS);
  });
});

describe("reprogramar sesion de prueba (admin) — POST /api/admin/scheduling/trials/:bookingId/reschedule", () => {
  const RUTA = "POST /api/admin/scheduling/trials/:bookingId/reschedule";
  const FECHA_VIEJA = dateOffsetStr(6);

  let bookingTrialTemploId: number;
  let bookingTrialDosId: number;

  beforeEach(async () => {
    const leadTemploId = await crearLeadDirecto(CTX_TEMPLO, fx.templo.branchId, {
      firstName: "ReproTemplo",
      lastName: `ISO0308${sufijo()}`,
      status: "prueba",
    });
    const leadDosId = await crearLeadDirecto(CTX_DOS, gym2.branchId, {
      firstName: "ReproDos",
      lastName: `ISO0308${sufijo()}`,
      status: "prueba",
    });
    bookingTrialTemploId = await crearReservaDePruebaDirecta(
      CTX_TEMPLO,
      leadTemploId,
      fx.templo.scheduleId,
      FECHA_VIEJA,
    );
    bookingTrialDosId = await crearReservaDePruebaDirecta(
      CTX_DOS,
      leadDosId,
      fx.dos.scheduleId,
      FECHA_VIEJA,
    );
  });

  it("aislamiento: un bookingId de El Templo se rechaza, y la reserva NO cambia de estado", async () => {
    const antes = await fotoDeBooking(bookingTrialTemploId);
    const res = await comoAdminGimnasioDos(
      "POST",
      `/trials/${bookingTrialTemploId}/reschedule`,
      {
        scheduleId: gym2.scheduleId,
        date: proximaFechaParaDia(1),
        branchId: gym2.branchId,
      },
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, bookingTrialTemploId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeBooking(bookingTrialTemploId);
    expect(despues, `${RUTA}: el rechazo no puede dejar cambios en la reserva de El Templo.`).toEqual(
      antes,
    );
  });

  it("combinacion cruzada: bookingId PROPIO con scheduleId destino de El Templo se rechaza, sin cambios", async () => {
    const antes = await fotoDeBooking(bookingTrialDosId);
    const res = await comoAdminGimnasioDos(
      "POST",
      `/trials/${bookingTrialDosId}/reschedule`,
      {
        scheduleId: fx.templo.scheduleId,
        date: proximaFechaParaDia(4),
        branchId: gym2.branchId,
      },
    );
    expect(
      res.statusCode,
      `${RUTA}: un bookingId PROPIO con un scheduleId destino de El Templo tiene que rechazarse. ` +
        `Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeBooking(bookingTrialDosId);
    expect(
      despues,
      `${RUTA}: el rechazo del scheduleId destino ajeno no puede dejar cambios en la reserva propia.`,
    ).toEqual(antes);
  });

  it("control: reprogramar la sesion propia a un horario propio distinto SI funciona", async () => {
    const res = await comoAdminGimnasioDos(
      "POST",
      `/trials/${bookingTrialDosId}/reschedule`,
      {
        scheduleId: gym2.scheduleId,
        date: proximaFechaParaDia(1),
        branchId: gym2.branchId,
      },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, bookingTrialDosId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as { bookingId: number };
    expect(
      await tenantDeLaFila(app, "bookings", body.bookingId),
      `${RUTA}: la sesion reprogramada por el staff del gimnasio ${TENANT_DOS} tiene que nacer con ese tenant_id.`,
    ).toBe(TENANT_DOS);
    const vieja = await fotoDeBooking(bookingTrialDosId);
    expect(vieja.status, `${RUTA}: la sesion vieja tiene que quedar cancelada.`).toBe("cancelado");
  });
});

describe("reservar clase (socio) — POST /api/members/scheduling/reserve", () => {
  const RUTA = "POST /api/members/scheduling/reserve";

  it("aislamiento: un scheduleId de El Templo se rechaza — SC1, 'Horario no encontrado', CERO bookings nuevas", async () => {
    const antes = await contarBookingsDeMiembro(gym2.socios[0].id);
    const res = await comoMemberGimnasioDos("POST", "/reserve", gym2.socios[0].token, {
      scheduleId: fx.templo.scheduleId,
      date: dateOffsetStr(1),
    });
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await contarBookingsDeMiembro(gym2.socios[0].id);
    expect(
      despues,
      `${RUTA}: SC1 — reservar contra un horario ajeno no puede crear NINGUNA fila en bookings.`,
    ).toBe(antes);
  });

  it("control: reservar un horario propio SI funciona, la reserva nace con tenant_id = TENANT_DOS", async () => {
    const scheduleId = await crearHorarioParaManana();
    const res = await comoMemberGimnasioDos("POST", "/reserve", gym2.socios[0].token, {
      scheduleId,
      date: dateOffsetStr(1),
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, gym2.socios[0].id) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const body = JSON.parse(res.body) as { id: number };
    expect(
      await tenantDeLaFila(app, "bookings", body.id),
      `${RUTA}: la reserva del socio del gimnasio ${TENANT_DOS} tiene que nacer con ese tenant_id.`,
    ).toBe(TENANT_DOS);
  });
});

describe("reservar sesion de prueba self-service — POST /api/members/scheduling/reserve-trial", () => {
  const RUTA = "POST /api/members/scheduling/reserve-trial";

  it("aislamiento: un scheduleId de El Templo se rechaza, CERO bookings nuevas", async () => {
    const freemiumDos = await createTestMember(app, {
      email: `reservetrial-iso-${sufijo()}@test.com`,
      branchId: gym2.branchId,
      tenantId: TENANT_DOS,
      phone: telefonoUnico(),
    });
    const antes = await contarBookingsDeMiembro(freemiumDos.id);
    const res = await comoMemberGimnasioDos("POST", "/reserve-trial", freemiumDos.token, {
      scheduleId: fx.templo.scheduleId,
      date: dateOffsetStr(1),
      branchId: gym2.branchId,
    });
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await contarBookingsDeMiembro(freemiumDos.id);
    expect(despues, `${RUTA}: el rechazo no puede crear NINGUNA fila en bookings.`).toBe(antes);
  });

  it("control: reservar la sesion de prueba propia SI funciona, nace con tenant_id = TENANT_DOS", async () => {
    const freemiumDos = await createTestMember(app, {
      email: `reservetrial-ctrl-${sufijo()}@test.com`,
      branchId: gym2.branchId,
      tenantId: TENANT_DOS,
      phone: telefonoUnico(),
    });
    const scheduleId = await crearHorarioParaManana();
    const res = await comoMemberGimnasioDos("POST", "/reserve-trial", freemiumDos.token, {
      scheduleId,
      date: dateOffsetStr(1),
      branchId: gym2.branchId,
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, freemiumDos.id) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const body = JSON.parse(res.body) as { bookingId: number };
    expect(
      await tenantDeLaFila(app, "bookings", body.bookingId),
      `${RUTA}: la sesion de prueba self-service tiene que nacer con tenant_id = ${TENANT_DOS}.`,
    ).toBe(TENANT_DOS);
  });
});

describe("cancelar sesion de prueba self-service — POST /api/members/scheduling/cancel-trial", () => {
  const RUTA = "POST /api/members/scheduling/cancel-trial";
  const FECHA = dateOffsetStr(5);

  let pruebaTemploBookingId: number;
  let pruebaDos: { id: number; token: string };
  let pruebaDosBookingId: number;

  beforeEach(async () => {
    // El lado de El Templo solo necesita un userId+branchId validos para la
    // reserva de prueba ajena (INSERT directo abajo) — `/auth/register`
    // fuerza siempre `status: 'freemium'` (ver docblock de `createTestMember`),
    // asi que un override de `status` aca seria ignorado. Las aserciones de
    // este describe nunca leen el status del usuario de El Templo, solo la
    // foto de su `booking`.
    const pruebaTemplo = await createTestMember(app, {
      email: `canceltrial-templo-${sufijo()}@test.com`,
      branchId: fx.templo.branchId,
    });
    pruebaTemploBookingId = await crearReservaDePruebaDirecta(
      CTX_TEMPLO,
      pruebaTemplo.id,
      fx.templo.scheduleId,
      FECHA,
    );

    pruebaDos = await createTestMember(app, {
      email: `canceltrial-dos-${sufijo()}@test.com`,
      branchId: gym2.branchId,
      tenantId: TENANT_DOS,
      phone: telefonoUnico(),
      status: "prueba",
    });
    pruebaDosBookingId = await crearReservaDePruebaDirecta(
      CTX_DOS,
      pruebaDos.id,
      fx.dos.scheduleId,
      FECHA,
    );
  });

  it("aislamiento: cancelar la sesion propia del gimnasio 2 NO toca la de El Templo (ctx resuelto al gimnasio correcto)", async () => {
    const antesAjena = await fotoDeBooking(pruebaTemploBookingId);
    const res = await comoMemberGimnasioDos("POST", "/cancel-trial", pruebaDos.token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const despuesAjena = await fotoDeBooking(pruebaTemploBookingId);
    expect(
      despuesAjena,
      `${RUTA}: cancelar la sesion propia del gimnasio ${TENANT_DOS} no puede tocar la reserva de El Templo — ` +
        "si el ctx hubiera resuelto mal, esta fila (ajena) habria quedado afectada.",
    ).toEqual(antesAjena);
    const propia = await fotoDeBooking(pruebaDosBookingId);
    expect(
      [propia.tenantId, propia.status],
      `${RUTA}: la sesion PROPIA del gimnasio ${TENANT_DOS} es la que tenia que quedar cancelada.`,
    ).toEqual([TENANT_DOS, "cancelado"]);
  });

  it("control: revierte prueba→freemium, la reserva sigue con tenant_id = TENANT_DOS", async () => {
    const res = await comoMemberGimnasioDos("POST", "/cancel-trial", pruebaDos.token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { cancelled: boolean };
    expect(body.cancelled).toBe(true);

    const [userRow] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, CTX_DOS), eq(schema.users.id, pruebaDos.id)));
    expect(
      userRow?.status,
      `${RUTA}: el usuario tiene que volver a 'freemium' tras cancelar su unica sesion de prueba.`,
    ).toBe("freemium");
  });
});

describe("cancelar reserva propia (socio) — DELETE /api/members/scheduling/bookings/:bookingId", () => {
  const RUTA = "DELETE /api/members/scheduling/bookings/:bookingId";

  it("aislamiento: un bookingId de El Templo se rechaza, y la reserva NO cambia de estado", async () => {
    const antes = await fotoDeBooking(fx.templo.bookingId);
    const res = await comoMemberGimnasioDos(
      "DELETE",
      `/bookings/${fx.templo.bookingId}`,
      gym2.socios[0].token,
    );
    expect(
      res.statusCode,
      porQueImporta(RUTA, fx.templo.bookingId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    const despues = await fotoDeBooking(fx.templo.bookingId);
    expect(despues, `${RUTA}: el rechazo no puede dejar cambios en la reserva de El Templo.`).toEqual(
      antes,
    );
  });

  it("control: cancelar la reserva propia del gimnasio 2 SI funciona", async () => {
    const res = await comoMemberGimnasioDos(
      "DELETE",
      `/bookings/${fx.dos.bookingId}`,
      gym2.socios[0].token,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.bookingId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const despues = await fotoDeBooking(fx.dos.bookingId);
    expect([despues.tenantId, despues.status]).toEqual([TENANT_DOS, "cancelado"]);
  });
});

// ─── Fase 180: descripciones de etiqueta derivada (KV por-tenant) ────────────
//
// `PUT /class-label-descriptions` no tiene `:id` en el path: edita por `mode`
// en el body, haciendo upsert sobre `tenant_settings` bajo `setting_key =
// class_label_description.<mode>` con `tenantValues(ctx, …)`. El recurso ajeno
// no es una fila con id (no hay 404 posible), sino la fila de El Templo del
// MISMO modo. El contrato de aislamiento es: la escritura del gimnasio 2 crea/
// pisa SU fila (tenant_id propio) y no toca ni expone la de El Templo.

/** La descripcion persistida (valor + tenant_id) de un modo para un tenant,
 * leida de `tenant_settings` por (tenant_id, setting_key). Leer el tenant_id de
 * la fila ES la asercion — misma exencion que `fotoDeBooking`/`fotoDeActivity`. */
async function fotoDeLabelDescription(
  tenantId: number,
  mode: "combos" | "tecnica",
): Promise<{ value: string; tenantId: number } | null> {
  const [row] = await app.db
    .select({
      value: schema.tenantSettings.settingValue,
      tenantId: schema.tenantSettings.tenantId,
    })
    .from(schema.tenantSettings)
    .where(
      and(
        eq(schema.tenantSettings.tenantId, tenantId),
        eq(
          schema.tenantSettings.settingKey,
          DERIVED_LABEL_DESCRIPTION_KEYS[mode],
        ),
      ),
    );
  return row ?? null;
}

describe("descripciones de etiqueta derivada — PUT /api/admin/scheduling/class-label-descriptions", () => {
  const RUTA = "PUT /api/admin/scheduling/class-label-descriptions";

  it("aislamiento: escribir un modo como gimnasio 2 no pisa ni expone la fila de El Templo del mismo modo", async () => {
    const valorTemplo = `TEMPLO combos ${sufijo()}`;
    await setDerivedLabelDescription(app.db, CTX_TEMPLO, "combos", valorTemplo);

    const valorDos = `DOS combos ${sufijo()}`;
    const res = await comoAdminGimnasioDos("PUT", "/class-label-descriptions", {
      mode: "combos",
      description: valorDos,
    });
    expect(
      res.statusCode,
      porQueImporta(RUTA, TENANT_TEMPLO) + ` Respuesta: ${res.body}`,
    ).toBe(200);

    // La fila de El Templo para "combos" quedo intacta (valor y tenant_id): la
    // upsert del gimnasio 2 no la piso (habria pasado si el `where` de la
    // onDuplicateKey no llevara tenant_id, o si la unique fuera solo por key).
    const templo = await fotoDeLabelDescription(TENANT_TEMPLO, "combos");
    expect(
      [templo?.value, templo?.tenantId],
      `${RUTA}: la escritura del gimnasio ${TENANT_DOS} piso o borro la descripcion "combos" de El Templo.`,
    ).toEqual([valorTemplo, TENANT_TEMPLO]);

    // La respuesta que recibe el gimnasio 2 es su propio KV, sin el valor ajeno.
    const body = JSON.parse(res.body) as {
      descriptions: Record<string, string | null>;
    };
    expect(body.descriptions.combos).toBe(valorDos);
    expect(body.descriptions.combos).not.toBe(valorTemplo);
  });

  it("control: escribir la descripcion propia del gimnasio 2 SI funciona y crea su fila con su tenant_id", async () => {
    const valorDos = `DOS tecnica ${sufijo()}`;
    const res = await comoAdminGimnasioDos("PUT", "/class-label-descriptions", {
      mode: "tecnica",
      description: valorDos,
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, TENANT_DOS) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const dos = await fotoDeLabelDescription(TENANT_DOS, "tecnica");
    expect([dos?.value, dos?.tenantId]).toEqual([valorDos, TENANT_DOS]);
  });
});
