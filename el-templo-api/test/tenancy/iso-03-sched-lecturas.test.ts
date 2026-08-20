/**
 * Fase 174.1 Plan 07 (ISO-03, ADO-04) — AISLAMIENTO de las ~13 rutas de
 * LECTURA de `scheduling`, contra un segundo gimnasio real.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Es el primer plan de la batería de `scheduling` (el plan 1 fue `subscriptions`):
 * las rutas donde el servidor entrega la GRILLA VIVA y los CUPOS — la parte
 * mas visible y mas grave para filtrar entre gimnasios. Si algo se filtra
 * acá, un staff o un socio del gimnasio 2 ve la grilla, las reservas, los
 * feriados o las sesiones de prueba de El Templo.
 *
 * QUE RUTAS CUBRE (13 rutas: 8 admin + 5 app-facing)
 * ----------------------------------------------------------------------
 *   GET /api/admin/scheduling/schedules/weekly
 *   GET /api/admin/scheduling/schedules/:scheduleId/detail
 *   GET /api/admin/scheduling/schedules/:scheduleId/next-available
 *   GET /api/admin/scheduling/schedules/:scheduleId/deletion-preview
 *   GET /api/admin/scheduling/holidays
 *   GET /api/admin/scheduling/trials
 *   GET /api/admin/scheduling/trials/eligible
 *   GET /api/admin/scheduling/activities
 *   GET /api/members/scheduling/weekly
 *   GET /api/members/scheduling/branches
 *   GET /api/members/scheduling/my-bookings
 *   GET /api/members/scheduling/bonus-usage
 *   GET /api/members/scheduling/trial-eligibility
 *
 * EL CONTRATO QUE SE AFIRMA (D-06 del milestone — cero "prohibido")
 * ---------------------------------------------------------------------------
 * El recurso de otro gimnasio es INDISTINGUIBLE de uno inexistente: un GET
 * by-id ajeno (`:scheduleId`) da 404 con el motivo afirmado junto al status.
 * Los barridos (grilla, feriados, catalogo de actividades, trials) nunca
 * traen una fila ajena — se afirma leyendo el `tenant_id` REAL de CADA fila
 * devuelta, no "no aparece el id que sembre" (eso no cazaria una fila ajena
 * que este archivo no sembro). **Nunca un "prohibido"**: el criterio de
 * aceptacion de este archivo es un `grep` (sin comentarios) de esa asercion
 * dando CERO.
 *
 * CADA CASO DE AISLAMIENTO LLEVA SU CONTROL POSITIVO
 * ---------------------------------------------------------------------
 * Un 404 (o un barrido vacio) puede venir del aislamiento o de una siembra
 * rota. Por eso cada `describe` tiene DOS `it`: aislamiento + control, que
 * hace la MISMA operacion sobre el recurso PROPIO del gimnasio 2 y exige que
 * funcione con datos reales (nunca solo el status code).
 *
 * `activities` ESTA FUERA DEL BOUNDARY DE LA FASE (D-01 del CONTEXT) PERO SE
 * PRUEBA IGUAL
 * ---------------------------------------------------------------------------
 * `activities` no es una de las 8 tablas que switchean en esta fase, pero
 * `activityService.listActivities` YA filtra por `tenantWhere` (fase
 * anterior) — su aislamiento se prueba por ese filtro, no por el sentinel.
 * `tenantDeLaFila` del fixture (union cerrada a las 8 tablas del boundary +
 * `promo_plans`) no sabe leer `activities` ni `branches`: este archivo trae
 * su PROPIA lectura de evidencia, cerrada al mismo par de tablas
 * (`tenantDeFilaFueraDelModulo`), con el mismo motivo de exencion
 * (`tenant-safe`: leer el tenant_id de la fila ES la asercion).
 *
 * LAS 5 RUTAS APP-FACING SON SELF-SCOPED
 * -----------------------------------------------------------------
 * Ninguna de las 5 acepta un id ajeno por la URL — el socio sale de
 * `request.user`. El vector cross-tenant que las 8 admin si tienen
 * (`:scheduleId` ajeno) no existe aca. El "aislamiento" de estas 5 se afirma
 * de dos formas segun la ruta:
 *   - `weekly`/`branches`: barrido — CADA fila devuelta es del gimnasio 2
 *     (misma tecnica que las rutas admin de listado).
 *   - `my-bookings`/`bonus-usage`/`trial-eligibility`: el valor devuelto es
 *     SIEMPRE el propio, nunca uno que solo tendria sentido si el `ctx` se
 *     hubiera resuelto mal (ej.: `eligible: true` cuando el ctx resolvio
 *     bien vs. `eligible: false` -por "usuario no encontrado"- si el ctx
 *     default a otro tenant).
 *
 * `bonus-usage` Y LAS RUTAS DE TRIALS NECESITAN SIEMBRA LOCAL ADICIONAL
 * ---------------------------------------------------------------------------
 * El fixture compartido (`subs-sched-gimnasio-dos.ts`) NO sembra un plan
 * `bookingMode: 'fixed'` (el mecanismo de bonus solo aplica a planes fijos)
 * ni usuarios `status: 'prueba'` con/sin reserva de sesion de prueba — no
 * hace falta para las 14 rutas del plan 01 y este archivo NO debe
 * re-extender el fixture compartido (consumido, no modificado — ver el
 * CONTEXT). Las 4 describes que lo necesitan (`bonus-usage`, `trials`,
 * `trials/eligible`, `weekly`/`my-bookings` con fecha determinista) siembran
 * ese complemento LOCALMENTE, en su propio `beforeEach` anidado, con el
 * mismo criterio de evidencia (`tenantValues`, sufijos unicos, nunca el
 * DEFAULT 1) — mismo patron que usa `iso-03-members-altas-y-staff.test.ts`
 * para sus leads `status: 'prueba'`.
 *
 * `weekStart`/fechas: SIEMPRE relativas a "hoy" (nunca al lunes calendario)
 * -----------------------------------------------------------------------
 * `getWeeklyGrid` no exige que `weekStart` sea un lunes real (el schema solo
 * valida el formato `YYYY-MM-DD`) — solo usa la fecha para desplazar
 * `dayOfWeek - 1` dias. Usar `todayStr()` como `weekStart` y anclar toda
 * fecha propia (reservas extra, `bonus-usage`) a offsets FIJOS desde "hoy"
 * hace que el archivo sea determinista sin importar que dia de la semana
 * corra la suite (evita el North-Pole de "si hoy es domingo, se cae").
 *
 * ROL MINIMO REAL
 * ----------------
 * Las 8 rutas admin estan detras del guard de MODULO `ALL_STAFF_ROLES`
 * (coach/admin/owner/gestion/recepcion) SIN un guard mas estricto por
 * handler (verificado leyendo `scheduling/routes.ts`: ningun GET de este
 * archivo tiene un `preHandler` de rol) — `gym2.coachToken` alcanza para las
 * 8. Las 5 app-facing solo exigen autenticacion — un token de socio alcanza.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-sched-lecturas.test.ts
 *
 * @see test/tenancy/iso-03-subs-lecturas.test.ts — el plan 01, mismo fixture, mismo idioma
 * @see test/tenancy/iso-03-members-listados.test.ts — el barrido leyendo tenant_id de cada fila
 * @see test/fixtures/subs-sched-gimnasio-dos.ts — la siembra que este archivo consume (NO extiende)
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, createTestMember, todayStr, dateOffsetStr } from "../helpers";
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
  campoDeLaFila,
  type SubsSchedFixture,
} from "../fixtures/subs-sched-gimnasio-dos";

// ─── Constantes ──────────────────────────────────────────────────────────────

const ADMIN_BASE = "/api/admin/scheduling";
const MEMBER_BASE = "/api/members/scheduling";

/** Contexto de escritura de cada lado, para la siembra local adicional. */
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

/** Hash dummy: los leads/usuarios sembrados a mano en este archivo nunca
 * inician sesion (solo aparecen en listados admin), asi que no hace falta
 * `argon2.hash` real — mismo atajo que `iso-03-members-altas-y-staff.test.ts`. */
const PASSWORD_HASH_DUMMY =
  "$argon2id$v=19$m=4096,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let fx: SubsSchedFixture;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // EL ORDEN ES OBLIGADO (mismo criterio que el resto de la bateria ISO-03):
  //  1. cleanAllTestData vacia TODAS las tablas del modulo, sin filtro de gimnasio.
  //  2. seedSecondTenant siembra el esqueleto del gimnasio 2.
  //  3. sembrarSubsSchedGimnasioDos siembra el recurso ajeno (El Templo) y lo
  //     propio (gimnasio 2) en una sola llamada.
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
  fx = await sembrarSubsSchedGimnasioDos(app, gym2);
});

afterAll(async () => {
  // Obligatorio: la base la comparten todos los archivos del mismo worker
  // (isolate: false).
  await cleanAllTestData(app);
  await limpiarSubsSchedDeLaBateria(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** GET admin como staff del gimnasio 2 (default: coach, el rol minimo real). */
async function getAdminComoGimnasioDos(
  url: string,
  token: string = gym2.coachToken,
) {
  return app.inject({
    method: "GET",
    url: `${ADMIN_BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

/** GET app-facing con el token de socio indicado. */
async function getMemberComo(url: string, token: string) {
  return app.inject({
    method: "GET",
    url: `${MEMBER_BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

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

/**
 * Las 2 tablas FUERA del boundary de 174.1 (D-01) que este archivo igual
 * necesita inspeccionar (`activities`, `branches`): union cerrada, mismo
 * motivo que `TablaDelModulo` del fixture — un `sql.raw` con un nombre de
 * tabla libre seria una puerta abierta a construir SQL desde datos.
 */
type TablaFueraDelModulo = "activities" | "branches";

/** El `tenant_id` REAL de una fila de `activities`/`branches`, leido de la
 * base por id. Mismo motivo de exencion que `tenantDeLaFila` del fixture:
 * leer el tenant_id de la fila ES la asercion, filtrarla la volveria
 * tautologica. */
async function tenantDeFilaFueraDelModulo(
  tabla: TablaFueraDelModulo,
  id: number,
): Promise<number | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: leer el tenant_id de la fila (fuera del boundary de 174.1, D-01) ES la asercion */ tenant_id AS t FROM ${sql.raw(tabla)} WHERE id = ${id}`,
  )) as unknown as [Array<{ t: number | null }>];
  const filas = Array.isArray(resultado) ? resultado[0] : (resultado as unknown as Array<{ t: number | null }>);
  if (!filas || filas[0] === undefined || filas[0].t === null) return null;
  return Number(filas[0].t);
}

/** Un lead directo (`status` explicito), por INSERT crudo — `POST
 * /auth/register` fuerza siempre `status: 'freemium'` (verificado leyendo
 * `src/modules/auth/routes.ts`), asi que no hay otra forma de sembrar un
 * `status: 'prueba'` real para El Templo. Mismo patron que
 * `iso-03-members-altas-y-staff.test.ts`. */
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

/** Una reserva por INSERT directo, sobre un horario ya sembrado del fixture.
 * `isTrial` explicito: lo usan tanto el describe de sesiones de prueba
 * (`isTrial: true`) como los de `weekly`/`my-bookings` (`isTrial: false`,
 * una reserva normal extra fechada de forma determinista). */
async function crearReservaDirecta(
  ctx: TenantContext,
  memberId: number,
  scheduleId: number,
  bookingDate: string,
  isTrial: boolean,
): Promise<number> {
  const [row] = await app.db
    .insert(schema.bookings)
    .values(
      tenantValues(ctx, {
        memberId,
        scheduleId,
        bookingDate,
        status: "reservado" as const,
        isTrial,
      }),
    )
    .$returningId();
  return row.id;
}

/** Mensaje compartido de los rojos de AISLAMIENTO (lectura by-id que espera 404). */
function porQueImportaLaLectura(ruta: string, filaId: number): string {
  return (
    `${ruta} le devolvio al staff del gimnasio ${TENANT_DOS} el recurso ${filaId}, ` +
    `que es de El Templo (${TENANT_TEMPLO}). El contrato del milestone (D-06) es que ` +
    `el recurso ajeno sea indistinguible de uno inexistente: "no encontrado", nunca ` +
    `"prohibido". Revisar el metodo que sirve esa ruta en ` +
    `src/modules/scheduling/{service,booking-service}.ts y su handler en routes.ts. ` +
    `NO "arreglar" esto filtrando en el front.`
  );
}

/** Mensaje compartido de los rojos de AISLAMIENTO en listados/barridos. */
function porQueImportaElListado(ruta: string, filaId: number): string {
  return (
    `${ruta} le devolvio al staff/socio del gimnasio ${TENANT_DOS} la fila ${filaId}, que NO ` +
    `es suya. Eso es una fuga de datos entre gimnasios: el listado perdio su ` +
    `\`tenantWhere(tabla, ctx)\`, o el \`ctx\` no salio de \`assertTenant(request.scope, ` +
    `…)\`. NO "arreglar" esto filtrando en el front.`
  );
}

/** Mensaje compartido de los rojos de CONTROL POSITIVO. */
function porQueImportaElControl(ruta: string, filaId: number): string {
  return (
    `${ruta} NO le devolvio al staff/socio del gimnasio ${TENANT_DOS} su PROPIO ` +
    `recurso ${filaId}. Esto no es un problema de aislamiento sino de siembra o de ` +
    `scope de mas: sin este control, el test de aislamiento de al lado pasaria en ` +
    `verde por la razon equivocada. Revisar test/fixtures/subs-sched-gimnasio-dos.ts.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones: sin esto, todo lo de abajo puede pasar por la razon equivocada
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la bateria", () => {
  it("las dos sedes son del MISMO pais, asi que el aislamiento no lo puede estar dando el country scope", async () => {
    // `GET /trials` (sin branchId) filtra ADEMAS por pais (scope.country). Si
    // las sedes tuvieran paises distintos, ese caso pasaria en verde sin que
    // la capa de tenancy hiciera nada (mismo criterio D-14 que el resto de la
    // bateria).
    const [sedeDos] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, { tenantId: TENANT_DOS }),
          eq(schema.branches.id, gym2.branchId),
        ),
      );
    const [sedeTemplo] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, { tenantId: TENANT_TEMPLO }),
          eq(schema.branches.id, fx.templo.branchId),
        ),
      );
    expect(
      [sedeDos?.country, sedeTemplo?.country],
      `Las dos sedes dejaron de compartir pais. Este archivo prueba que el GIMNASIO ` +
        `aisla; con paises distintos el filtro de country escondaria las filas ajenas ` +
        `igual. Arreglo: que las dos sedes vuelvan a ser AR, NO relajar estas ` +
        `aserciones.`,
    ).toEqual(["AR", "AR"]);
  });

  it("El Templo tiene una operacion COMPLETA de subs+scheduling, viva, que el gimnasio 2 NO tiene que ver", async () => {
    const t = fx.templo;
    expect(
      [
        await tenantDeLaFila(app, "subscription_plans", t.planId),
        await tenantDeLaFila(app, "subscriptions", t.subscriptionId),
        await tenantDeLaFila(app, "promo_plans", t.promoPlanId),
        await tenantDeLaFila(app, "schedules", t.scheduleId),
        await tenantDeLaFila(app, "bookings", t.bookingId),
        await tenantDeLaFila(app, "schedule_exceptions", t.scheduleExceptionId),
        await tenantDeLaFila(app, "holidays", t.holidayId),
        await tenantDeLaFila(app, "subscription_schedule_changes", t.scheduleChangeId),
        await tenantDeLaFila(app, "subscription_schedules", t.subscriptionScheduleId),
      ],
      `Alguna fila ajena no quedo en El Templo (${TENANT_TEMPLO}). Sin recurso ajeno ` +
        `vivo, todos los casos de aislamiento de este archivo pasan probando nada. ` +
        `Revisar sembrarLadoTemplo en test/fixtures/subs-sched-gimnasio-dos.ts.`,
    ).toEqual(Array(9).fill(TENANT_TEMPLO));
  });

  it("el gimnasio 2 tiene su propia operacion COMPLETA de subs+scheduling, nacida ahi (no en El Templo por el DEFAULT 1)", async () => {
    const d = fx.dos;
    expect(
      [
        await tenantDeLaFila(app, "subscriptions", d.subscriptionId),
        await tenantDeLaFila(app, "subscription_plans", d.planEspecialId),
        await tenantDeLaFila(app, "subscriptions", d.subscriptionEspecialId),
        await tenantDeLaFila(app, "promo_plans", d.promoPlanId),
        await tenantDeLaFila(app, "schedules", d.scheduleId),
        await tenantDeLaFila(app, "bookings", d.bookingId),
        await tenantDeLaFila(app, "schedule_exceptions", d.scheduleExceptionId),
        await tenantDeLaFila(app, "holidays", d.holidayId),
        await tenantDeLaFila(app, "subscription_schedule_changes", d.scheduleChangeId),
        await tenantDeLaFila(app, "subscription_schedules", d.subscriptionScheduleId),
      ],
      `Alguna fila del gimnasio 2 nacio en otro gimnasio. Si el valor es ${TENANT_TEMPLO}, ` +
        `ese INSERT perdio su \`tenantValues(CTX_DOS, …)\` y cayo en el DEFAULT 1: el ` +
        `"segundo gimnasio" seria en realidad El Templo y TODOS los controles positivos ` +
        `de abajo estarian mirando datos de El Templo.`,
    ).toEqual(Array(10).fill(TENANT_DOS));
  });

  it("El Templo y el gimnasio 2 tienen su horario en dias/actividades DISTINTOS, y las excepciones/feriados en fechas DISTINTAS", async () => {
    // Sin esto, un barrido que mezclara los dos lados podria pasar en verde
    // por coincidencia (mismo dia de semana, misma fecha).
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
// Las 8 rutas admin
// ═══════════════════════════════════════════════════════════════════════════

describe("grilla semanal — GET /api/admin/scheduling/schedules/weekly", () => {
  const RUTA = "GET /api/admin/scheduling/schedules/weekly";

  it("aislamiento: la grilla admin del gimnasio 2 no trae el horario de El Templo, y CADA fila devuelta es del gimnasio 2", async () => {
    const res = await getAdminComoGimnasioDos(
      `/schedules/weekly?branchId=${gym2.branchId}&weekStart=${todayStr()}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { slots: Array<{ id: number }> };
    expect(
      body.slots.map((s) => s.id),
      porQueImportaElListado(RUTA, fx.templo.scheduleId),
    ).not.toContain(fx.templo.scheduleId);
    for (const s of body.slots) {
      expect(
        await tenantDeLaFila(app, "schedules", s.id),
        porQueImportaElListado(RUTA, s.id),
      ).toBe(TENANT_DOS);
    }
  });

  it("control: la grilla admin SI trae el horario propio del gimnasio 2", async () => {
    const res = await getAdminComoGimnasioDos(
      `/schedules/weekly?branchId=${gym2.branchId}&weekStart=${todayStr()}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { slots: Array<{ id: number }> };
    expect(
      body.slots.map((s) => s.id),
      porQueImportaElControl(RUTA, fx.dos.scheduleId),
    ).toContain(fx.dos.scheduleId);
  });
});

describe("detalle de horario — GET /api/admin/scheduling/schedules/:scheduleId/detail", () => {
  const RUTA = "GET /api/admin/scheduling/schedules/:scheduleId/detail";

  it("aislamiento: el horario de El Templo da 404 (no el detalle ajeno)", async () => {
    const res = await getAdminComoGimnasioDos(
      `/schedules/${fx.templo.scheduleId}/detail?date=${fx.templo.bookingDate}`,
    );
    expect(
      res.statusCode,
      porQueImportaLaLectura(RUTA, fx.templo.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
  });

  it("control: el horario propio del gimnasio 2 SI se puede leer, con la reserva real sembrada", async () => {
    const res = await getAdminComoGimnasioDos(
      `/schedules/${fx.dos.scheduleId}/detail?date=${fx.dos.bookingDate}`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as {
      schedule: { id: number };
      bookings: Array<{ id: number; memberId: number }>;
    };
    expect(body.schedule.id).toBe(fx.dos.scheduleId);
    const propio = body.bookings.find((b) => b.id === fx.dos.bookingId);
    expect(propio, porQueImportaElControl(RUTA, fx.dos.bookingId)).toBeDefined();
    expect(propio?.memberId).toBe(gym2.socios[0].id);
  });
});

describe("proximo turno disponible — GET /api/admin/scheduling/schedules/:scheduleId/next-available", () => {
  const RUTA = "GET /api/admin/scheduling/schedules/:scheduleId/next-available";

  it("aislamiento: el horario de El Templo da 404 (no calcula disponibilidad ajena)", async () => {
    const res = await getAdminComoGimnasioDos(
      `/schedules/${fx.templo.scheduleId}/next-available`,
    );
    expect(
      res.statusCode,
      porQueImportaLaLectura(RUTA, fx.templo.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
  });

  it("control: el horario propio del gimnasio 2 SI calcula una respuesta real", async () => {
    const res = await getAdminComoGimnasioDos(
      `/schedules/${fx.dos.scheduleId}/next-available`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as { nextAvailableDate: string | null };
    expect(body).toHaveProperty("nextAvailableDate");
  });
});

describe("vista previa de eliminacion — GET /api/admin/scheduling/schedules/:scheduleId/deletion-preview", () => {
  const RUTA =
    "GET /api/admin/scheduling/schedules/:scheduleId/deletion-preview";

  it("aislamiento: el horario de El Templo da 404 (no previsualiza el impacto ajeno)", async () => {
    const res = await getAdminComoGimnasioDos(
      `/schedules/${fx.templo.scheduleId}/deletion-preview?fromDate=${fx.templo.bookingDate}`,
    );
    expect(
      res.statusCode,
      porQueImportaLaLectura(RUTA, fx.templo.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(404);
  });

  it("control: el horario propio del gimnasio 2 SI previsualiza la reserva real sembrada", async () => {
    const res = await getAdminComoGimnasioDos(
      `/schedules/${fx.dos.scheduleId}/deletion-preview?fromDate=${fx.dos.bookingDate}`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, fx.dos.scheduleId) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as { cancelledBookings: number };
    expect(
      body.cancelledBookings,
      porQueImportaElControl(RUTA, fx.dos.bookingId) +
        ` (se esperaba cancelledBookings=1 y se recibio ${body.cancelledBookings})`,
    ).toBe(1);
  });
});

describe("feriados — GET /api/admin/scheduling/holidays", () => {
  const RUTA = "GET /api/admin/scheduling/holidays";

  it("aislamiento: el listado no trae el feriado de El Templo, y CADA fila devuelta es del gimnasio 2", async () => {
    const res = await getAdminComoGimnasioDos("/holidays");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { holidays: Array<{ id: number }> };
    expect(
      body.holidays.map((h) => h.id),
      porQueImportaElListado(RUTA, fx.templo.holidayId),
    ).not.toContain(fx.templo.holidayId);
    for (const h of body.holidays) {
      expect(
        await tenantDeLaFila(app, "holidays", h.id),
        porQueImportaElListado(RUTA, h.id),
      ).toBe(TENANT_DOS);
    }
  });

  it("control: el listado SI trae el feriado propio del gimnasio 2, con su nombre real", async () => {
    const res = await getAdminComoGimnasioDos("/holidays");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      holidays: Array<{ id: number; name: string }>;
    };
    const propio = body.holidays.find((h) => h.id === fx.dos.holidayId);
    expect(propio, porQueImportaElControl(RUTA, fx.dos.holidayId)).toBeDefined();
    const nombreReal = await campoDeLaFila(app, "holidays", "name", fx.dos.holidayId);
    expect(propio?.name).toBe(nombreReal);
  });
});

describe("sesiones de prueba del dia — GET /api/admin/scheduling/trials", () => {
  const RUTA = "GET /api/admin/scheduling/trials";

  // Siembra local: el fixture compartido no incluye una reserva `is_trial`.
  // Ambos lados reservan la MISMA fecha (determinista, offset fijo desde
  // "hoy") para que el barrido tenga algo real que excluir del lado de El
  // Templo.
  const FECHA_TRIAL = dateOffsetStr(6);
  let leadTemploId: number;
  let leadDosId: number;
  let bookingTrialTemploId: number;
  let bookingTrialDosId: number;

  beforeEach(async () => {
    leadTemploId = await crearLeadDirecto(CTX_TEMPLO, fx.templo.branchId, {
      firstName: "TrialTemplo",
      lastName: "ISO0307",
      status: "prueba",
    });
    leadDosId = await crearLeadDirecto(CTX_DOS, gym2.branchId, {
      firstName: "TrialDos",
      lastName: "ISO0307",
      status: "prueba",
    });
    bookingTrialTemploId = await crearReservaDirecta(
      CTX_TEMPLO,
      leadTemploId,
      fx.templo.scheduleId,
      FECHA_TRIAL,
      true,
    );
    bookingTrialDosId = await crearReservaDirecta(
      CTX_DOS,
      leadDosId,
      fx.dos.scheduleId,
      FECHA_TRIAL,
      true,
    );
  });

  it("aislamiento: el listado del dia no trae la sesion de prueba de El Templo, y CADA fila devuelta es del gimnasio 2", async () => {
    const res = await getAdminComoGimnasioDos(`/trials?date=${FECHA_TRIAL}`);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      groups: Array<{ branchId: number; trials: Array<{ bookingId: number }> }>;
    };
    const todosLosBookingIds = body.groups.flatMap((g) =>
      g.trials.map((t) => t.bookingId),
    );
    expect(
      todosLosBookingIds,
      porQueImportaElListado(RUTA, bookingTrialTemploId),
    ).not.toContain(bookingTrialTemploId);
    for (const bookingId of todosLosBookingIds) {
      expect(
        await tenantDeLaFila(app, "bookings", bookingId),
        porQueImportaElListado(RUTA, bookingId),
      ).toBe(TENANT_DOS);
    }
  });

  it("control: el listado del dia SI trae la sesion de prueba propia del gimnasio 2", async () => {
    const res = await getAdminComoGimnasioDos(`/trials?date=${FECHA_TRIAL}`);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      groups: Array<{
        branchId: number;
        trials: Array<{ bookingId: number; userId: number }>;
      }>;
    };
    const grupoPropio = body.groups.find((g) => g.branchId === gym2.branchId);
    expect(grupoPropio, porQueImportaElControl(RUTA, bookingTrialDosId)).toBeDefined();
    const propio = grupoPropio?.trials.find((t) => t.bookingId === bookingTrialDosId);
    expect(propio, porQueImportaElControl(RUTA, bookingTrialDosId)).toBeDefined();
    expect(propio?.userId).toBe(leadDosId);
  });
});

describe("prueba elegibles — GET /api/admin/scheduling/trials/eligible", () => {
  const RUTA = "GET /api/admin/scheduling/trials/eligible";

  let leadTemploId: number;
  let leadDosId: number;

  beforeEach(async () => {
    // 'prueba' SIN reserva de sesion de prueba (elegibles: NOT EXISTS booking
    // is_trial futura). Ninguno de los dos tiene una — a diferencia del
    // describe de arriba.
    leadTemploId = await crearLeadDirecto(CTX_TEMPLO, fx.templo.branchId, {
      firstName: "EligibleTemplo",
      lastName: "ISO0307",
      status: "prueba",
    });
    leadDosId = await crearLeadDirecto(CTX_DOS, gym2.branchId, {
      firstName: "EligibleDos",
      lastName: "ISO0307",
      status: "prueba",
    });
  });

  it("aislamiento: el listado de elegibles del gimnasio 2 no trae al lead de El Templo", async () => {
    const res = await getAdminComoGimnasioDos(
      `/trials/eligible?branchId=${gym2.branchId}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { users: Array<{ id: number }> };
    expect(
      body.users.map((u) => u.id),
      porQueImportaElListado(RUTA, leadTemploId),
    ).not.toContain(leadTemploId);
  });

  it("control: el listado de elegibles SI trae al lead propio del gimnasio 2, con su dni real", async () => {
    const res = await getAdminComoGimnasioDos(
      `/trials/eligible?branchId=${gym2.branchId}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      users: Array<{ id: number; dni: string }>;
    };
    const propio = body.users.find((u) => u.id === leadDosId);
    expect(propio, porQueImportaElControl(RUTA, leadDosId)).toBeDefined();
    const [filaReal] = await app.db
      .select({ dni: schema.users.dni })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, CTX_DOS), eq(schema.users.id, leadDosId)));
    expect(propio?.dni).toBe(filaReal?.dni);
  });
});

describe("catalogo de actividades — GET /api/admin/scheduling/activities", () => {
  const RUTA = "GET /api/admin/scheduling/activities";

  it("aislamiento: el catalogo no trae la actividad de El Templo, y CADA fila devuelta es del gimnasio 2", async () => {
    const res = await getAdminComoGimnasioDos("/activities");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { activities: Array<{ id: number }> };
    expect(
      body.activities.map((a) => a.id),
      porQueImportaElListado(RUTA, fx.templo.activityId),
    ).not.toContain(fx.templo.activityId);
    for (const a of body.activities) {
      expect(
        await tenantDeFilaFueraDelModulo("activities", a.id),
        porQueImportaElListado(RUTA, a.id),
      ).toBe(TENANT_DOS);
    }
  });

  it("control: el catalogo SI trae la actividad propia del gimnasio 2, con su nombre real", async () => {
    const res = await getAdminComoGimnasioDos("/activities");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      activities: Array<{ id: number; name: string }>;
    };
    const propia = body.activities.find((a) => a.id === fx.dos.activityId);
    expect(propia, porQueImportaElControl(RUTA, fx.dos.activityId)).toBeDefined();
    const [filaReal] = await app.db
      .select({ name: schema.activities.name })
      .from(schema.activities)
      .where(eq(schema.activities.id, fx.dos.activityId));
    expect(propia?.name).toBe(filaReal?.name);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Las 5 rutas app-facing — self-scoped (ver la nota del docblock del archivo)
// ═══════════════════════════════════════════════════════════════════════════

describe("grilla del socio — GET /api/members/scheduling/weekly", () => {
  const RUTA = "GET /api/members/scheduling/weekly";

  // Reserva propia extra, fechada exactamente en `weekStart` (= "hoy"): cae
  // SIEMPRE dentro de la ventana [weekStart, weekStart+5] que usa
  // `getMyBookings`, sin importar que dia de la semana corra la suite.
  let reservaExtraDosId: number;

  beforeEach(async () => {
    reservaExtraDosId = await crearReservaDirecta(
      CTX_DOS,
      gym2.socios[0].id,
      fx.dos.scheduleId,
      todayStr(),
      false,
    );
  });

  it("aislamiento: la grilla del socio del gimnasio 2 no trae el horario de El Templo, y CADA fila (slot + reserva propia) es del gimnasio 2", async () => {
    const res = await getMemberComo(
      `/weekly?weekStart=${todayStr()}`,
      gym2.socios[0].token,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      slots: Array<{ id: number }>;
      myBookings: Array<{ id: number }>;
    };
    expect(
      body.slots.map((s) => s.id),
      porQueImportaElListado(RUTA, fx.templo.scheduleId),
    ).not.toContain(fx.templo.scheduleId);
    for (const s of body.slots) {
      expect(
        await tenantDeLaFila(app, "schedules", s.id),
        porQueImportaElListado(RUTA, s.id),
      ).toBe(TENANT_DOS);
    }
    for (const b of body.myBookings) {
      expect(
        await tenantDeLaFila(app, "bookings", b.id),
        porQueImportaElListado(RUTA, b.id),
      ).toBe(TENANT_DOS);
    }
  });

  it("control: la grilla del socio SI trae el horario y la reserva propia del gimnasio 2", async () => {
    const res = await getMemberComo(
      `/weekly?weekStart=${todayStr()}`,
      gym2.socios[0].token,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      slots: Array<{ id: number }>;
      myBookings: Array<{ id: number }>;
    };
    expect(
      body.slots.map((s) => s.id),
      porQueImportaElControl(RUTA, fx.dos.scheduleId),
    ).toContain(fx.dos.scheduleId);
    expect(
      body.myBookings.map((b) => b.id),
      porQueImportaElControl(RUTA, reservaExtraDosId),
    ).toContain(reservaExtraDosId);
  });
});

describe("reservas del socio — GET /api/members/scheduling/my-bookings", () => {
  const RUTA = "GET /api/members/scheduling/my-bookings";

  let reservaExtraDosId: number;

  beforeEach(async () => {
    reservaExtraDosId = await crearReservaDirecta(
      CTX_DOS,
      gym2.socios[0].id,
      fx.dos.scheduleId,
      todayStr(),
      false,
    );
  });

  it("aislamiento: las reservas del socio del gimnasio 2 nunca traen la reserva de El Templo, y CADA fila es del gimnasio 2", async () => {
    const res = await getMemberComo(
      `/my-bookings?weekStart=${todayStr()}`,
      gym2.socios[0].token,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { bookings: Array<{ id: number }> };
    expect(
      body.bookings.map((b) => b.id),
      porQueImportaElListado(RUTA, fx.templo.bookingId),
    ).not.toContain(fx.templo.bookingId);
    for (const b of body.bookings) {
      expect(
        await tenantDeLaFila(app, "bookings", b.id),
        porQueImportaElListado(RUTA, b.id),
      ).toBe(TENANT_DOS);
    }
  });

  it("control: las reservas del socio SI traen la reserva propia real sembrada", async () => {
    const res = await getMemberComo(
      `/my-bookings?weekStart=${todayStr()}`,
      gym2.socios[0].token,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { bookings: Array<{ id: number }> };
    expect(
      body.bookings.map((b) => b.id),
      porQueImportaElControl(RUTA, reservaExtraDosId),
    ).toContain(reservaExtraDosId);
  });
});

describe("uso de bonus — GET /api/members/scheduling/bonus-usage", () => {
  const RUTA = "GET /api/members/scheduling/bonus-usage";

  // El mecanismo de bonus SOLO aplica a planes `bookingMode: 'fixed'` — el
  // fixture compartido siembra planes 'flexible'/'other'. Se muta LOCALMENTE
  // (por test, `fx`/`gym2` se re-siembran enteros en cada `beforeEach` del
  // archivo) el plan ya asignado a `gym2.socios[0]` para tener un escenario
  // real de bonus, sin re-extender el fixture compartido.
  let scheduleBonusDosId: number;
  let bookingBonusDosId: number;

  beforeEach(async () => {
    await app.db
      .update(schema.subscriptionPlans)
      .set({ bookingMode: "fixed" })
      .where(
        and(
          tenantWhere(schema.subscriptionPlans, CTX_DOS),
          eq(schema.subscriptionPlans.id, gym2.planId),
        ),
      );

    // Un horario DISTINTO del fijo asignado en `subscription_schedules`
    // (`fx.dos.scheduleId`): una reserva ahi cuenta como "bonus" (fuera del
    // horario fijo del plan).
    const [horario] = await app.db
      .insert(schema.schedules)
      .values(
        tenantValues(CTX_DOS, {
          branchId: gym2.branchId,
          activityId: fx.dos.activityId,
          dayOfWeek: 3,
          startTime: "09:00",
          endTime: "10:00",
          isActive: true,
        }),
      )
      .$returningId();
    scheduleBonusDosId = horario.id;

    const [booking] = await app.db
      .insert(schema.bookings)
      .values(
        tenantValues(CTX_DOS, {
          memberId: gym2.socios[0].id,
          scheduleId: scheduleBonusDosId,
          bookingDate: todayStr(),
          status: "reservado" as const,
          isTrial: false,
        }),
      )
      .$returningId();
    bookingBonusDosId = booking.id;
  });

  it("aislamiento: el uso de bonus del socio del gimnasio 2 refleja SOLO su propia reserva bonus (el ctx resolvio al gimnasio 2, no a El Templo)", async () => {
    const res = await getMemberComo("/bonus-usage", gym2.socios[0].token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      applicable: boolean;
      used?: number;
    };
    // Si el `ctx` hubiera default-eado a El Templo (tenant 1), la
    // suscripcion 'fixed' de este socio (que vive en tenant_id=TENANT_DOS)
    // no se encontraria y la ruta devolveria `applicable: false` — un
    // negativo indistinguible de "no aplica", pero DISTINTO del verdadero
    // `applicable: true` que corresponde al escenario sembrado arriba.
    expect(
      body.applicable,
      `${RUTA} devolvio applicable=false para un socio con plan fijo real. El ctx no ` +
        `resolvio al gimnasio ${TENANT_DOS}: revisar SubscriptionService.getMemberSubscription.`,
    ).toBe(true);
    expect(
      body.used,
      porQueImportaElControl(RUTA, bookingBonusDosId) +
        ` (se esperaba used=1 -solo la reserva bonus propia- y se recibio ${body.used})`,
    ).toBe(1);
  });

  it("control: el uso de bonus trae el limite y el periodo reales, derivados de la suscripcion propia", async () => {
    const res = await getMemberComo("/bonus-usage", gym2.socios[0].token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      applicable: boolean;
      used?: number;
      limit?: number;
      periodStart?: string;
      periodEnd?: string;
    };
    expect(body.limit).toBe(2);
    expect(body.periodStart).toBeTruthy();
    expect(body.periodEnd).toBeTruthy();
    // El periodo bonus arranca en `subscription.startDate` (sembrado como
    // "hoy" por el fixture, ver sembrarLadoGimnasioDos) — periodStart real,
    // no un valor cualquiera.
    expect(body.periodStart).toBe(todayStr());
  });
});

describe("elegibilidad de sesion de prueba — GET /api/members/scheduling/trial-eligibility", () => {
  const RUTA = "GET /api/members/scheduling/trial-eligibility";

  // `gym2.socios[0/1]` ya tienen una suscripcion ACTIVA (fixture) — eso los
  // bloquea (BLOCKING_SUBSCRIPTION_STATUSES incluye 'active'), asi que ningun
  // socio del fixture sirve para el control positivo `eligible: true`. Se
  // crea un socio freemium fresco, sin suscripcion ni reserva de prueba.
  let freemiumDos: { id: number; token: string };

  beforeEach(async () => {
    freemiumDos = await createTestMember(app, {
      email: `elegible-${sufijo()}@test.com`,
      branchId: gym2.branchId,
      tenantId: TENANT_DOS,
      phone: telefonoUnico(),
    });
  });

  it("aislamiento: el socio freemium del gimnasio 2 ve su propio estado elegible=true (si el ctx hubiera resuelto a El Templo, el usuario no existiria ahi y daria false)", async () => {
    const res = await getMemberComo("/trial-eligibility", freemiumDos.token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      eligible: boolean;
      alreadyBooked: boolean;
    };
    expect(
      body.eligible,
      `${RUTA} devolvio eligible=false para un socio freemium recien creado, sin ` +
        `suscripcion ni reserva de prueba. Eso es la respuesta que da la ruta cuando ` +
        `\`tenantWhere(users, ctx)\` no encuentra al usuario (ctx resuelto a otro ` +
        `tenant) — revisar TrialService.getTrialEligibility.`,
    ).toBe(true);
    expect(body.alreadyBooked).toBe(false);
  });

  it("control: el estado de elegibilidad trae phoneRequired=false real (el socio tiene telefono sembrado)", async () => {
    const res = await getMemberComo("/trial-eligibility", freemiumDos.token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      eligible: boolean;
      phoneRequired: boolean;
    };
    expect(body.eligible, porQueImportaElControl(RUTA, freemiumDos.id)).toBe(
      true,
    );
    expect(body.phoneRequired).toBe(false);
  });
});

describe("sedes disponibles — GET /api/members/scheduling/branches", () => {
  const RUTA = "GET /api/members/scheduling/branches";

  it("aislamiento: el listado no trae la sede de El Templo, y CADA fila devuelta es del gimnasio 2", async () => {
    const res = await getMemberComo("/branches", gym2.socios[0].token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { branches: Array<{ id: number }> };
    expect(
      body.branches.map((b) => b.id),
      porQueImportaElListado(RUTA, fx.templo.branchId),
    ).not.toContain(fx.templo.branchId);
    for (const b of body.branches) {
      expect(
        await tenantDeFilaFueraDelModulo("branches", b.id),
        porQueImportaElListado(RUTA, b.id),
      ).toBe(TENANT_DOS);
    }
  });

  it("control: el listado SI trae la sede propia del gimnasio 2, con su nombre real", async () => {
    const res = await getMemberComo("/branches", gym2.socios[0].token);
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      branches: Array<{ id: number; name: string }>;
    };
    const propia = body.branches.find((b) => b.id === gym2.branchId);
    expect(propia, porQueImportaElControl(RUTA, gym2.branchId)).toBeDefined();
    const [filaReal] = await app.db
      .select({ name: schema.branches.name })
      .from(schema.branches)
      .where(eq(schema.branches.id, gym2.branchId));
    expect(propia?.name).toBe(filaReal?.name);
  });
});
