/**
 * Fase 174.1 Plan 01 (ISO-03, ADO-03/ADO-04) — el fixture ÚNICO Y COMPLETO de
 * `subscriptions` + `scheduling` del segundo gimnasio, sembrable en una
 * llamada, y la evidencia leída de la BASE.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * `test/fixtures/second-tenant.ts` (171-04) siembra el ESQUELETO del gimnasio
 * 2 (sede, actividad, plan, un horario, staff y 2 socios) pero a propósito NO
 * siembra una operación real de subs+scheduling: sin una segunda suscripción,
 * un promo, un cambio de turno auditado, una reserva, una excepción de fecha
 * o un feriado, las ~14 rutas de LECTURA de esta batería (174.1-01) y las
 * rutas de ESCRITURA/switch de los tres planes siguientes (174.1-06/07/08)
 * no tienen nada real que aislar. Este archivo es ese complemento — gemelo
 * de `members-gimnasio-dos.ts` — hecho UNA vez y compartido por los CUATRO
 * planes de la batería. Los planes de scheduling (06/07/08) lo CONSUMEN, no
 * lo re-extienden: todo lo que necesitan de subs+sched ya está sembrado acá.
 *
 * FRONTERA DE MÓDULO — LAS 8 TABLAS EXACTAS (174.1-CONTEXT, D-01)
 * -----------------------------------------------------------------
 *   subscriptions = subscriptions, subscription_plans,
 *                    subscription_schedule_changes, subscription_schedules
 *   scheduling    = bookings, schedules, schedule_exceptions, holidays
 *
 * `activities` y `branches` quedan explícitamente FUERA de esta fase (el
 * throw del sentinel es por-tabla, no por-directorio) — este fixture las usa
 * como FKs necesarias (una actividad nueva por lado, el `branchId` que ya
 * deja `seedSecondTenant`), sin que eso las meta en el boundary.
 *
 * COMO SE USA
 * -----------
 * ```ts
 * beforeEach(async () => {
 *   await cleanAllTestData(app);                          // 1. vacia TODAS las tablas del modulo
 *   gym2 = await seedSecondTenant(app);                    // 2. el esqueleto del gimnasio 2
 *   subsSched = await sembrarSubsSchedGimnasioDos(app, gym2); // 3. subs+sched de los dos lados
 * });
 *
 * afterAll(async () => {
 *   await cleanAllTestData(app);
 *   await limpiarSubsSchedDeLaBateria(app);
 *   await limpiarSegundoGimnasio(app);
 *   await app.close();
 * });
 * ```
 *
 * POR QUÉ `limpiarSubsSchedDeLaBateria` ES DEFENSIVA (no imprescindible HOY)
 * ---------------------------------------------------------------------------
 * Las 9 tablas que este archivo toca (las 8 del boundary + `subscriptions`
 * separadas arriba, MÁS `promo_plans`) están TODAS en `TABLES_TO_CLEAN`
 * (`test/helpers.ts`): `cleanAllTestData` ya las vacía por completo — de
 * TODOS los gimnasios — en cada `beforeEach`. A diferencia de `branches` (el
 * caso de `members-gimnasio-dos.ts`), nada de lo que siembra este archivo
 * sobrevive entre archivos del mismo worker por sí solo. Esta función existe
 * igual, EXPORTADA y con el orden FK-seguro completo, para que un plan
 * futuro (174.1-06/07/08) pueda resetear SOLO subs+sched del gimnasio 2 a
 * mitad de un archivo sin pagar el barrido completo de `cleanAllTestData`
 * (que también se llevaría por delante lo que otro fixture co-sembrado en el
 * mismo `beforeEach` — p.ej. `members-gimnasio-dos.ts` — dejó armado). Filtra
 * por `tenant_id = TENANT_DOS`: las filas de El Templo que este archivo
 * siembra se limpian solas con el próximo `cleanAllTestData`, igual que le
 * pasa a `sembrarSocioTemplo` en el molde de members.
 *
 * QUE SIEMBRA (y por que, mas alla de la letra literal del plan)
 * ------------------------------------------------------------------
 * El Templo (recurso AJENO, tenant 1) — {@link FichaSubsSchedTemplo}:
 *   - un socio dedicado (no reusa ninguno de otro fixture)
 *   - un plan (`subscription_plans`) y una suscripción activa sobre él
 *   - un promo plan (`promo_plans`) que referencia ese plan
 *   - una actividad y un horario (`schedules`) propios de El Templo
 *   - una reserva (`bookings`) del socio sobre ese horario
 *   - una excepción de fecha (`schedule_exceptions`) sobre ese horario
 *   - un feriado (`holidays`)
 *   - un cambio de turno auditado (`subscription_schedule_changes`) y un
 *     turno asignado (`subscription_schedules`) sobre la suscripción
 *
 * Gimnasio 2 (LO PROPIO, tenant {@link TENANT_DOS}) — {@link FichaSubsSchedGimnasioDos}:
 *   - `gym2.socios[0]` recibe una suscripción activa sobre `gym2.planId` (el
 *     plan "presencial" que ya deja `seedSecondTenant`) — la suscripción
 *     "principal" que consumen las 10 rutas admin de lectura-detalle.
 *   - un SEGUNDO plan, con `planCategory: 'especial'` (pase "Actividades con
 *     Aura"): además de satisfacer el requisito literal del plan ("un segundo
 *     plan"), le da un control positivo REAL a `GET /me/especial-pass` — sin
 *     un pase especial sembrado esa ruta solo podría devolver `hasPass: false`
 *     para cualquier gimnasio, y el control positivo pasaría sin probar nada.
 *   - `gym2.socios[1]` recibe la suscripción del pase especial.
 *   - un promo plan sobre `gym2.planId`.
 *   - una actividad y un horario propios (día/hora distintos de los de El
 *     Templo), una reserva de `gym2.socios[0]`, una excepción de fecha y un
 *     feriado.
 *   - un cambio de turno auditado y un turno asignado sobre la suscripción
 *     principal (`gym2.socios[0]`).
 *
 * VALORES IRREPETIBLES Y DE OTRO ORDEN DE MAGNITUD
 * --------------------------------------------------
 * `pricePaid`/`priceRegular` de El Templo son de 5 cifras (11100/11000); los
 * del gimnasio 2 son de 6 cifras (888800/850000) — mismo criterio que
 * `members-gimnasio-dos.ts` (777777 vs 111): si una lectura contaminada
 * sumara o devolviera el valor ajeno, el número resultante es evidentemente
 * otro, no un "de más" sutil. Nombres de plan, códigos de promo, motivos de
 * excepción y nombres de feriado llevan sufijo único por corrida
 * (`sufijo()`) y el prefijo {@link MARCA} para que sean grepeables.
 *
 * @see .planning/phases/174.1-.../174.1-CONTEXT.md — D-01/D-06/D-07
 * @see test/fixtures/members-gimnasio-dos.ts — el molde que este archivo calca
 */
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { createTestMember, todayStr, dateOffsetStr } from "../helpers";
import { TENANT_DOS, TENANT_TEMPLO, type SegundoGimnasio } from "./second-tenant";

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Contexto de escritura del gimnasio 2. */
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

/** Contexto de escritura de El Templo. */
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };

/** Prefijo grepeable de toda fila con nombre/motivo que este fixture crea. */
export const MARCA_ISO03SS = "ISO03SS";

const EMAIL_ADMIN_SEMILLA = "admin@test.com";

/** Sufijo único por corrida, mismo generador que el resto de los fixtures. */
function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Forma de los handles ────────────────────────────────────────────────────

/** El recurso ajeno: la operación completa de subs+sched de un socio de El Templo. */
export interface FichaSubsSchedTemplo {
  userId: number;
  branchId: number;
  planId: number;
  planName: string;
  priceRegular: number;
  subscriptionId: number;
  pricePaid: number;
  /** Distinta del gimnasio 2 a proposito (ver docblock del archivo): usada
   * para distinguir el caso self-scoped de /me/subscription y /coverage. */
  subscriptionEndDate: string;
  promoPlanId: number;
  promoCode: string;
  activityId: number;
  scheduleId: number;
  bookingId: number;
  bookingDate: string;
  scheduleExceptionId: number;
  scheduleExceptionDate: string;
  holidayId: number;
  holidayDate: string;
  scheduleChangeId: number;
  subscriptionScheduleId: number;
}

/** La operación completa de subs+sched del gimnasio 2. */
export interface FichaSubsSchedGimnasioDos {
  /** Suscripcion PRINCIPAL de `gym2.socios[0]`, sobre `gym2.planId` (presencial). */
  subscriptionId: number;
  pricePaid: number;
  /** Distinta de El Templo a proposito (ver docblock del archivo). */
  subscriptionEndDate: string;
  /** Segundo plan: categoria 'especial' (pase "Actividades con Aura"). */
  planEspecialId: number;
  planEspecialName: string;
  priceRegularEspecial: number;
  /** Suscripcion del pase especial, de `gym2.socios[1]`. */
  subscriptionEspecialId: number;
  promoPlanId: number;
  promoCode: string;
  activityId: number;
  scheduleId: number;
  bookingId: number;
  bookingDate: string;
  scheduleExceptionId: number;
  scheduleExceptionDate: string;
  holidayId: number;
  holidayDate: string;
  scheduleChangeId: number;
  subscriptionScheduleId: number;
}

/** Lo que deja sembrado {@link sembrarSubsSchedGimnasioDos}: los dos lados. */
export interface SubsSchedFixture {
  templo: FichaSubsSchedTemplo;
  dos: FichaSubsSchedGimnasioDos;
}

// ─── Evidencia leida de la BASE ──────────────────────────────────────────────

/**
 * Las 9 tablas que {@link tenantDeLaFila}/{@link campoDeLaFila} saben leer:
 * las 8 del boundary de la fase (174.1-CONTEXT) mas `promo_plans`. Union
 * CERRADA a proposito (mismo motivo que `TablaDelModulo` de
 * `members-gimnasio-dos.ts`): un `sql.raw` con un nombre de tabla libre seria
 * una puerta abierta a construir SQL desde datos.
 */
export type TablaDelModulo =
  | "subscriptions"
  | "subscription_plans"
  | "promo_plans"
  | "subscription_schedule_changes"
  | "subscription_schedules"
  | "bookings"
  | "schedules"
  | "schedule_exceptions"
  | "holidays";

/** Columnas que {@link campoDeLaFila} sabe leer. Union cerrada por el mismo motivo. */
export type ColumnaInspeccionable =
  | "price_paid"
  | "price_regular"
  | "name"
  | "promo_code"
  | "reason"
  | "status";

/**
 * Normaliza la salida de `app.db.execute` (mysql2 devuelve `[filas, meta]`).
 * Mismo idioma que `members-gimnasio-dos.ts`/`finance-gimnasio-dos.ts`.
 */
async function consultar<T>(app: FastifyInstance, consulta: SQL): Promise<T[]> {
  const resultado = (await app.db.execute(consulta)) as unknown as [T[]];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as T[]);
  return filas ?? [];
}

/**
 * El `tenant_id` REAL de una fila, leído de la base por id.
 *
 * ESTA ES LA UNICA EVIDENCIA QUE VALE en la batería ISO-03. La exención
 * `tenant-safe` va EMBEBIDA en el SQL (único canal que el sentinel lee):
 * leer el `tenant_id` de la fila ES la aserción, filtrarla la volvería
 * tautológica.
 */
export async function tenantDeLaFila(
  app: FastifyInstance,
  tabla: TablaDelModulo,
  id: number,
): Promise<number | null> {
  const filas = await consultar<{ t: number | null }>(
    app,
    sql`SELECT /* tenant-safe: leer el tenant_id de la fila ES la asercion; filtrar por el la volveria tautologica */ tenant_id AS t FROM ${sql.raw(tabla)} WHERE id = ${id}`,
  );
  if (filas[0] === undefined || filas[0].t === null) return null;
  return Number(filas[0].t);
}

/**
 * El valor REAL de una columna de una fila, leído de la base por id.
 * Mismo motivo de exención que {@link tenantDeLaFila}.
 */
export async function campoDeLaFila(
  app: FastifyInstance,
  tabla: TablaDelModulo,
  columna: ColumnaInspeccionable,
  id: number,
): Promise<string | null> {
  const filas = await consultar<{ v: unknown }>(
    app,
    sql`SELECT /* tenant-safe: releer la fila (ajena o propia) es la asercion de contenido; filtrarla por gimnasio la volveria tautologica */ ${sql.raw(columna)} AS v FROM ${sql.raw(tabla)} WHERE id = ${id}`,
  );
  if (filas[0] === undefined || filas[0].v === null) return null;
  return String(filas[0].v);
}

// ─── Siembra ─────────────────────────────────────────────────────────────────

/** Resuelve el id del admin semilla de El Templo, por email (nunca por id fijo). */
async function adminSemillaId(app: FastifyInstance): Promise<number> {
  const [fila] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, CTX_TEMPLO),
        eq(schema.users.email, EMAIL_ADMIN_SEMILLA),
      ),
    )
    .limit(1);
  if (!fila) {
    throw new Error(
      `subs-sched-gimnasio-dos: no existe ${EMAIL_ADMIN_SEMILLA}. Lo siembra ` +
        `test/setup.ts y es el unico usuario que sobrevive a cleanAllTestData: ` +
        `sin el no hay actor valido para el cambio de turno auditado de El Templo.`,
    );
  }
  return fila.id;
}

/** La sede no-virtual de El Templo (la misma que resuelve `sembrarSocioTemplo`). */
async function sedeNoVirtualTemplo(app: FastifyInstance): Promise<number> {
  const [sede] = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, CTX_TEMPLO),
        eq(schema.branches.isVirtual, false),
      ),
    )
    .orderBy(schema.branches.id)
    .limit(1);
  if (!sede) {
    throw new Error(
      "subs-sched-gimnasio-dos: El Templo no tiene ninguna sede no virtual. La " +
        "siembra test/setup.ts (codigos TEST/ONLINE) — revisar ese archivo.",
    );
  }
  return sede.id;
}

/**
 * Siembra la operacion completa de subs+sched de El Templo (recurso ajeno) Y
 * del gimnasio 2 (lo propio), en una sola llamada — ver el docblock del
 * archivo para el detalle de que crea cada lado y por que.
 *
 * Va SIEMPRE despues de `seedSecondTenant` (necesita `gym2.branchId`,
 * `gym2.activityId`, `gym2.planId`, `gym2.adminId` y `gym2.socios`).
 */
export async function sembrarSubsSchedGimnasioDos(
  app: FastifyInstance,
  gym2: SegundoGimnasio,
): Promise<SubsSchedFixture> {
  const templo = await sembrarLadoTemplo(app);
  const dos = await sembrarLadoGimnasioDos(app, gym2);
  return { templo, dos };
}

async function sembrarLadoTemplo(
  app: FastifyInstance,
): Promise<FichaSubsSchedTemplo> {
  const suf = sufijo();
  const authorId = await adminSemillaId(app);
  const branchId = await sedeNoVirtualTemplo(app);
  const today = todayStr();

  const socio = await createTestMember(app, {
    email: `ajeno-subs-templo-${suf}@test.com`,
    password: "pass123456",
    firstName: "AjenoSubsTemplo",
    lastName: `${MARCA_ISO03SS}173`,
    branchId,
    dni: `SST${suf}`,
  });

  // Plan de otro orden de magnitud que el del gimnasio 2 (ver docblock).
  const planName = `${MARCA_ISO03SS} Plan Templo ${suf}`;
  const priceRegular = 11100;
  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values(
      tenantValues(CTX_TEMPLO, {
        name: planName,
        planTier: "flex" as const,
        bookingMode: "flexible" as const,
        planCategory: "presencial" as const,
        priceRegular,
        priceZero: 11000,
        durationDays: 30,
        classesPerWeek: 3,
        country: "AR" as const,
      }),
    )
    .$returningId();

  const pricePaid = priceRegular;
  // endDate a 20 dias: DISTINTO de los 30 dias del gimnasio 2 (ver docblock
  // del archivo) — la evidencia de las 4 rutas app-facing self-scoped
  // (/coverage, /me/subscription) necesita poder distinguir "mi fecha" de
  // "la fecha ajena" sin depender de un id.
  const subscriptionEndDate = dateOffsetStr(20);
  const [subscription] = await app.db
    .insert(schema.subscriptions)
    .values(
      tenantValues(CTX_TEMPLO, {
        userId: socio.id,
        planId: plan.id,
        branchId,
        status: "active" as const,
        startDate: today,
        endDate: subscriptionEndDate,
        pricePaid,
        currency: "ARS" as const,
        priceTypeApplied: "regular" as const,
      }),
    )
    .$returningId();

  const promoCode = `${MARCA_ISO03SS}TPL${suf}`.slice(0, 50);
  const [promo] = await app.db
    .insert(schema.promoPlans)
    .values(
      tenantValues(CTX_TEMPLO, {
        name: `${MARCA_ISO03SS} Promo Templo ${suf}`,
        promoCode,
        planDurationDays: 30,
        subscriptionPlanId: plan.id,
        startDate: new Date(),
        expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
        promoType: "admin_assignable" as const,
        country: "AR" as const,
      }),
    )
    .$returningId();

  const [activity] = await app.db
    .insert(schema.activities)
    .values(
      tenantValues(CTX_TEMPLO, {
        name: `${MARCA_ISO03SS} Actividad Templo ${suf}`,
        isActive: true,
      }),
    )
    .$returningId();

  // Dia/horario DISTINTOS del gimnasio 2 (martes 07:00, ver sembrarLadoGimnasioDos).
  const [horario] = await app.db
    .insert(schema.schedules)
    .values(
      tenantValues(CTX_TEMPLO, {
        branchId,
        activityId: activity.id,
        dayOfWeek: 2,
        startTime: "07:00",
        endTime: "08:00",
        isActive: true,
      }),
    )
    .$returningId();

  const bookingDate = dateOffsetStr(2);
  const [booking] = await app.db
    .insert(schema.bookings)
    .values(
      tenantValues(CTX_TEMPLO, {
        memberId: socio.id,
        scheduleId: horario.id,
        bookingDate,
        status: "reservado" as const,
        isTrial: false,
      }),
    )
    .$returningId();

  const scheduleExceptionDate = dateOffsetStr(9);
  const [exception] = await app.db
    .insert(schema.scheduleExceptions)
    .values(
      tenantValues(CTX_TEMPLO, {
        scheduleId: horario.id,
        exceptionDate: scheduleExceptionDate,
        reason: `${MARCA_ISO03SS} excepcion templo ${suf}`,
      }),
    )
    .$returningId();

  // Feriado en una fecha lejana y fija (no colisiona con feriados reales
  // sembrados por otros archivos): el par (tenant, country, date) es unico.
  const holidayDate = "2097-04-10";
  const [holiday] = await app.db
    .insert(schema.holidays)
    .values(
      tenantValues(CTX_TEMPLO, {
        country: "AR" as const,
        date: holidayDate,
        name: `${MARCA_ISO03SS} Feriado Templo ${suf}`,
      }),
    )
    .$returningId();

  const [scheduleChange] = await app.db
    .insert(schema.subscriptionScheduleChanges)
    .values(
      tenantValues(CTX_TEMPLO, {
        subscriptionId: subscription.id,
        actorId: authorId,
        oldScheduleIds: [999001],
        newScheduleIds: [horario.id],
        reason: `${MARCA_ISO03SS} cambio de turno historico templo ${suf}`,
      }),
    )
    .$returningId();

  const [subscriptionSchedule] = await app.db
    .insert(schema.subscriptionSchedules)
    .values(
      tenantValues(CTX_TEMPLO, {
        subscriptionId: subscription.id,
        scheduleId: horario.id,
      }),
    )
    .$returningId();

  return {
    userId: socio.id,
    branchId,
    planId: plan.id,
    planName,
    priceRegular,
    subscriptionId: subscription.id,
    pricePaid,
    subscriptionEndDate,
    promoPlanId: promo.id,
    promoCode,
    activityId: activity.id,
    scheduleId: horario.id,
    bookingId: booking.id,
    bookingDate,
    scheduleExceptionId: exception.id,
    scheduleExceptionDate,
    holidayId: holiday.id,
    holidayDate,
    scheduleChangeId: scheduleChange.id,
    subscriptionScheduleId: subscriptionSchedule.id,
  };
}

async function sembrarLadoGimnasioDos(
  app: FastifyInstance,
  gym2: SegundoGimnasio,
): Promise<FichaSubsSchedGimnasioDos> {
  const suf = sufijo();
  const today = todayStr();
  const socio1 = gym2.socios[0];
  const socio2 = gym2.socios[1];

  // Suscripcion PRINCIPAL: sobre el plan "presencial" que ya deja
  // seedSecondTenant. De otro orden de magnitud que la de El Templo (11100).
  // endDate a 30 dias: DISTINTO de los 20 dias de El Templo (ver docblock).
  const pricePaid = 888800;
  const subscriptionEndDate = dateOffsetStr(30);
  const [subscription] = await app.db
    .insert(schema.subscriptions)
    .values(
      tenantValues(CTX_DOS, {
        userId: socio1.id,
        planId: gym2.planId,
        branchId: gym2.branchId,
        status: "active" as const,
        startDate: today,
        endDate: subscriptionEndDate,
        pricePaid,
        currency: "ARS" as const,
        priceTypeApplied: "regular" as const,
      }),
    )
    .$returningId();

  // Segundo plan: pase "Actividades con Aura" (categoria 'especial') — le da
  // control positivo real a GET /me/especial-pass (ver docblock del archivo).
  const planEspecialName = `${MARCA_ISO03SS} Plan Especial GDos ${suf}`;
  const priceRegularEspecial = 850000;
  const [planEspecial] = await app.db
    .insert(schema.subscriptionPlans)
    .values(
      tenantValues(CTX_DOS, {
        name: planEspecialName,
        planTier: "other" as const,
        bookingMode: "flexible" as const,
        planCategory: "especial" as const,
        priceRegular: priceRegularEspecial,
        priceZero: 800000,
        durationDays: 30,
        monthlyClassBudget: 2,
        requiresPresencial: false,
        country: "AR" as const,
      }),
    )
    .$returningId();

  const [subscriptionEspecial] = await app.db
    .insert(schema.subscriptions)
    .values(
      tenantValues(CTX_DOS, {
        userId: socio2.id,
        planId: planEspecial.id,
        branchId: gym2.branchId,
        status: "active" as const,
        startDate: today,
        endDate: dateOffsetStr(30),
        pricePaid: priceRegularEspecial,
        currency: "ARS" as const,
        priceTypeApplied: "regular" as const,
        classesRemaining: 1,
        classesBudget: 2,
      }),
    )
    .$returningId();

  const promoCode = `${MARCA_ISO03SS}GDOS${suf}`.slice(0, 50);
  const [promo] = await app.db
    .insert(schema.promoPlans)
    .values(
      tenantValues(CTX_DOS, {
        name: `${MARCA_ISO03SS} Promo GDos ${suf}`,
        promoCode,
        planDurationDays: 30,
        subscriptionPlanId: gym2.planId,
        startDate: new Date(),
        expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
        promoType: "admin_assignable" as const,
        country: "AR" as const,
      }),
    )
    .$returningId();

  const [activity] = await app.db
    .insert(schema.activities)
    .values(
      tenantValues(CTX_DOS, {
        name: `${MARCA_ISO03SS} Actividad GDos ${suf}`,
        isActive: true,
      }),
    )
    .$returningId();

  // Dia/horario DISTINTOS de El Templo (martes 07:00 arriba): jueves 18:00.
  const [horario] = await app.db
    .insert(schema.schedules)
    .values(
      tenantValues(CTX_DOS, {
        branchId: gym2.branchId,
        activityId: activity.id,
        dayOfWeek: 4,
        startTime: "18:00",
        endTime: "19:00",
        isActive: true,
      }),
    )
    .$returningId();

  const bookingDate = dateOffsetStr(3);
  const [booking] = await app.db
    .insert(schema.bookings)
    .values(
      tenantValues(CTX_DOS, {
        memberId: socio1.id,
        scheduleId: horario.id,
        bookingDate,
        status: "reservado" as const,
        isTrial: false,
      }),
    )
    .$returningId();

  const scheduleExceptionDate = dateOffsetStr(10);
  const [exception] = await app.db
    .insert(schema.scheduleExceptions)
    .values(
      tenantValues(CTX_DOS, {
        scheduleId: horario.id,
        exceptionDate: scheduleExceptionDate,
        reason: `${MARCA_ISO03SS} excepcion gimnasio dos ${suf}`,
      }),
    )
    .$returningId();

  const holidayDate = "2097-04-11";
  const [holiday] = await app.db
    .insert(schema.holidays)
    .values(
      tenantValues(CTX_DOS, {
        country: "AR" as const,
        date: holidayDate,
        name: `${MARCA_ISO03SS} Feriado GDos ${suf}`,
      }),
    )
    .$returningId();

  const [scheduleChange] = await app.db
    .insert(schema.subscriptionScheduleChanges)
    .values(
      tenantValues(CTX_DOS, {
        subscriptionId: subscription.id,
        actorId: gym2.adminId,
        oldScheduleIds: [999002],
        newScheduleIds: [horario.id],
        reason: `${MARCA_ISO03SS} cambio de turno historico gimnasio dos ${suf}`,
      }),
    )
    .$returningId();

  const [subscriptionSchedule] = await app.db
    .insert(schema.subscriptionSchedules)
    .values(
      tenantValues(CTX_DOS, {
        subscriptionId: subscription.id,
        scheduleId: horario.id,
      }),
    )
    .$returningId();

  return {
    subscriptionId: subscription.id,
    pricePaid,
    subscriptionEndDate,
    planEspecialId: planEspecial.id,
    planEspecialName,
    priceRegularEspecial,
    subscriptionEspecialId: subscriptionEspecial.id,
    promoPlanId: promo.id,
    promoCode,
    activityId: activity.id,
    scheduleId: horario.id,
    bookingId: booking.id,
    bookingDate,
    scheduleExceptionId: exception.id,
    scheduleExceptionDate,
    holidayId: holiday.id,
    holidayDate,
    scheduleChangeId: scheduleChange.id,
    subscriptionScheduleId: subscriptionSchedule.id,
  };
}

// ─── Limpieza ────────────────────────────────────────────────────────────────

/**
 * Borra lo que este fixture deja del GIMNASIO 2, en las 9 tablas que toca,
 * en orden FK-seguro. Ver "POR QUE `limpiarSubsSchedDeLaBateria` ES
 * DEFENSIVA" en el docblock del archivo: hoy es redundante con
 * `cleanAllTestData` (las 9 tablas están en `TABLES_TO_CLEAN`) pero se deja
 * exportada, explícita y con el orden correcto para que un plan futuro pueda
 * resetear SOLO subs+sched del gimnasio 2 sin pagar el barrido completo.
 *
 * Conexión única + `FOREIGN_KEY_CHECKS=0` (mismo patrón que
 * `limpiarSociosDeLaBateria` / `cleanAllTestData`): sin esto, cada DELETE
 * podría tomar una conexión distinta del pool y perder la sesión con
 * `FOREIGN_KEY_CHECKS=0` activo a mitad de camino.
 *
 * Orden (hijos antes que padres): schedule_exceptions → bookings →
 * subscription_schedule_changes → subscription_schedules → subscriptions →
 * holidays → schedules → promo_plans → subscription_plans.
 *
 * Filtra SOLO `tenant_id = TENANT_DOS`: las filas de El Templo que este
 * fixture siembra las limpia el próximo `cleanAllTestData` (que SIEMPRE
 * corre antes, en el `beforeEach` del archivo que hizo opt-in) — filtrar acá
 * también por El Templo correría el riesgo de llevarse datos reales de otros
 * tests del mismo worker si esta función se llamara fuera de su posición
 * habitual en el ciclo de vida.
 */
export async function limpiarSubsSchedDeLaBateria(
  app: FastifyInstance,
): Promise<void> {
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query(`DELETE FROM \`schedule_exceptions\` WHERE tenant_id = ?`, [
      TENANT_DOS,
    ]);
    await conn.query(`DELETE FROM \`bookings\` WHERE tenant_id = ?`, [
      TENANT_DOS,
    ]);
    await conn.query(
      `DELETE FROM \`subscription_schedule_changes\` WHERE tenant_id = ?`,
      [TENANT_DOS],
    );
    await conn.query(
      `DELETE FROM \`subscription_schedules\` WHERE tenant_id = ?`,
      [TENANT_DOS],
    );
    await conn.query(`DELETE FROM \`subscriptions\` WHERE tenant_id = ?`, [
      TENANT_DOS,
    ]);
    await conn.query(`DELETE FROM \`holidays\` WHERE tenant_id = ?`, [
      TENANT_DOS,
    ]);
    await conn.query(`DELETE FROM \`schedules\` WHERE tenant_id = ?`, [
      TENANT_DOS,
    ]);
    await conn.query(`DELETE FROM \`promo_plans\` WHERE tenant_id = ?`, [
      TENANT_DOS,
    ]);
    await conn.query(`DELETE FROM \`subscription_plans\` WHERE tenant_id = ?`, [
      TENANT_DOS,
    ]);
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
}

// ─── Siembra adicional: datos de `analytics` (Fase 175.1 Plan 02) ───────────

/**
 * Prefijo grepeable de toda fila que {@link sembrarDatosAnalyticsGimnasioDos}
 * crea con un campo de texto libre (hoy solo `coach_ratings.comment`, la única
 * tabla nueva de este bloque que NO está en `TABLES_TO_CLEAN` — ver
 * {@link limpiarDatosAnalyticsDeLaBateria}).
 */
export const MARCA_ISO03A = "ISO03A";

/**
 * Lo que {@link sembrarDatosAnalyticsGimnasioDos} deja sembrado para UN lado
 * (El Templo o el gimnasio 2): el complemento que `analytics` necesita y que
 * ni `subs-sched-gimnasio-dos.ts` (bookings/schedules pelados, sin
 * `attendance`/`coach_ratings`) ni `members-gimnasio-dos.ts` (ficha de socio,
 * sin cohortes vencidas ni pruebas) sembraban. `extraActive*` es `null` del
 * lado de El Templo (ver el docblock de la función: la asimetría 1 vs 2 es a
 * propósito).
 */
export interface FichaAnalyticsExtra {
  /** 3 (Templo) o 5 (gimnasio 2) filas de `attendance`, hoy, a proposito distintas. */
  attendanceIds: number[];
  coachRatingId: number;
  /** Marcado con {@link MARCA_ISO03A} — unica columna de texto libre de la tabla. */
  coachRatingComment: string;
  coachRatingStars: number;
  /** Socio DEDICADO con una unica suscripcion vencida hace 25 dias (madura, sin renovacion). */
  churnedUserId: number;
  churnedSubscriptionId: number;
  churnedPricePaid: number;
  churnedEndDate: string;
  /** Socio DEDICADO con una reserva de prueba, sin compra posterior. */
  trialUserId: number;
  trialBookingId: number;
  trialBookingDate: string;
  /** Actividad+horario marcados `isSpecial`, con una asistencia hoy. */
  especialActivityId: number;
  especialScheduleId: number;
  especialUserId: number;
  especialSubscriptionId: number;
  especialAttendanceId: number;
  /** Reserva `confirmado` (checkin-adoption necesita ese status exacto). */
  confirmedBookingId: number;
  /** `plan_charge` validado + `transaction_links` a la suscripcion principal (TICKET-01 exige el link). */
  ticketTransactionId: number;
  ticketTransactionAmount: number;
  /** Solo el gimnasio 2 (ver docblock de la funcion): rompe el empate 1=1 de "miembros activos". */
  extraActiveUserId: number | null;
  extraActiveSubscriptionId: number | null;
  extraActivePricePaid: number | null;
}

/** Lo que deja sembrado {@link sembrarDatosAnalyticsGimnasioDos}: los dos lados. */
export interface DatosAnalyticsGimnasioDos {
  templo: FichaAnalyticsExtra;
  dos: FichaAnalyticsExtra;
}

/**
 * Complemento de `analytics` (ISO-03, plan 175.1-02): siembra lo que las
 * ~22 rutas de `/api/admin/analytics` necesitan y que NINGÚN fixture existente
 * deja — `attendance`, `coach_ratings`, una cohorte de vencimiento madura
 * (churn/renovación/retención/LTV/altas-bajas/bajas detalle), una sesión de
 * prueba (trial-funnel), una actividad especial con asistencia (especiales) y
 * un cobro `plan_charge` CON link (ticket/advanced-finance/financial — el
 * `advance_payment` sin link de `members-gimnasio-dos.ts` no le sirve a
 * TICKET-01, que exige `transaction_links`).
 *
 * REUSA `fx` (subs-sched-gimnasio-dos) y `gym2` (second-tenant): NO crea un
 * tercer fixture — cuelga socios/subs/attendance NUEVOS de las sedes,
 * horarios y suscripciones YA sembrados por esos dos, tal como pide el plan
 * ("si falta un dato marcador, agregarlo al fixture existente"). Es OPT-IN:
 * ningún otro archivo de la batería la llama, así que no cambia una sola
 * aserción de `iso-03-subs-lecturas.test.ts` / `iso-03-subs-escritura.test.ts`
 * / `iso-03-sched-*.test.ts` (que solo usan `.toContain`, nunca `.toEqual` de
 * listados completos, sobre estos datos).
 *
 * ASIMETRÍA A PROPÓSITO ("miembros activos" 1 vs 2, D-06/D-07 del plan): sin
 * un dato adicional, El Templo y el gimnasio 2 quedarían EMPATADOS en 1 socio
 * con suscripción activa no-especial (`fx.templo.userId` / `gym2.socios[0]`),
 * y un 1===1 no prueba aislamiento — pasaría en verde tanto si el número
 * está bien scopeado como si viene sumado y coincide por casualidad. Por eso
 * SOLO el gimnasio 2 recibe un socio activo extra (`extraActive*`): El
 * Templo queda en 1, el gimnasio 2 en 2 — un valor contaminado sería 3 para
 * cualquiera de los dos lados, nunca 1 ni 2.
 *
 * Va SIEMPRE después de `sembrarSubsSchedGimnasioDos` (necesita `fx.templo`/
 * `fx.dos` y `gym2.socios`).
 */
export async function sembrarDatosAnalyticsGimnasioDos(
  app: FastifyInstance,
  gym2: SegundoGimnasio,
  fx: SubsSchedFixture,
): Promise<DatosAnalyticsGimnasioDos> {
  const templo = await sembrarLadoAnalyticsTemplo(app, fx);
  const dos = await sembrarLadoAnalyticsGimnasioDos(app, gym2, fx);
  return { templo, dos };
}

async function sembrarLadoAnalyticsTemplo(
  app: FastifyInstance,
  fx: SubsSchedFixture,
): Promise<FichaAnalyticsExtra> {
  const suf = sufijo();
  const authorId = await adminSemillaId(app);
  const t = fx.templo;
  const hoy = todayStr();
  const ayer = dateOffsetStr(-1);

  const attendanceIds: number[] = [];
  for (let i = 0; i < 3; i++) {
    const [row] = await app.db
      .insert(schema.attendance)
      .values(
        tenantValues(CTX_TEMPLO, {
          memberId: t.userId,
          branchId: t.branchId,
          scheduleId: t.scheduleId,
          sessionDate: hoy,
          status: "confirmado" as const,
          source: "qr" as const,
        }),
      )
      .$returningId();
    attendanceIds.push(row.id);
  }

  // checkin-adoption necesita una reserva `confirmado` — la que ya deja
  // `sembrarLadoTemplo` es `reservado` y de otra fecha (no cuenta para esta ruta).
  const [confirmedBooking] = await app.db
    .insert(schema.bookings)
    .values(
      tenantValues(CTX_TEMPLO, {
        memberId: t.userId,
        scheduleId: t.scheduleId,
        bookingDate: hoy,
        status: "confirmado" as const,
        isTrial: false,
      }),
    )
    .$returningId();

  const coachRatingComment = `${MARCA_ISO03A} rating templo ${suf}`;
  const [coachRating] = await app.db
    .insert(schema.coachRatings)
    .values(
      tenantValues(CTX_TEMPLO, {
        coachId: authorId,
        memberId: t.userId,
        branchId: t.branchId,
        scheduleId: t.scheduleId,
        sessionDate: hoy,
        stars: 1,
        classStars: 1,
        comment: coachRatingComment,
      }),
    )
    .$returningId();

  const churnedSocio = await createTestMember(app, {
    email: `analytics-churned-templo-${suf}@test.com`,
    password: "pass123456",
    firstName: "AnalyticsChurnedTemplo",
    lastName: MARCA_ISO03A,
    branchId: t.branchId,
    dni: `ACT${suf}`,
  });
  const churnedPricePaid = 44400;
  const churnedEndDate = dateOffsetStr(-25);
  const [churnedSub] = await app.db
    .insert(schema.subscriptions)
    .values(
      tenantValues(CTX_TEMPLO, {
        userId: churnedSocio.id,
        planId: t.planId,
        branchId: t.branchId,
        status: "expired" as const,
        startDate: dateOffsetStr(-55),
        endDate: churnedEndDate,
        pricePaid: churnedPricePaid,
        currency: "ARS" as const,
        priceTypeApplied: "regular" as const,
      }),
    )
    .$returningId();

  const trialSocio = await createTestMember(app, {
    email: `analytics-trial-templo-${suf}@test.com`,
    password: "pass123456",
    firstName: "AnalyticsTrialTemplo",
    lastName: MARCA_ISO03A,
    branchId: t.branchId,
    dni: `ATT${suf}`,
  });
  const trialBookingDate = dateOffsetStr(-3);
  const [trialBooking] = await app.db
    .insert(schema.bookings)
    .values(
      tenantValues(CTX_TEMPLO, {
        memberId: trialSocio.id,
        scheduleId: t.scheduleId,
        bookingDate: trialBookingDate,
        status: "confirmado" as const,
        isTrial: true,
      }),
    )
    .$returningId();

  const [especialActivity] = await app.db
    .insert(schema.activities)
    .values(
      tenantValues(CTX_TEMPLO, {
        name: `${MARCA_ISO03A} Actividad Especial Templo ${suf}`,
        isActive: true,
        isSpecial: true,
      }),
    )
    .$returningId();
  const [especialSchedule] = await app.db
    .insert(schema.schedules)
    .values(
      tenantValues(CTX_TEMPLO, {
        branchId: t.branchId,
        activityId: especialActivity.id,
        dayOfWeek: 5,
        startTime: "09:00",
        endTime: "10:00",
        isActive: true,
      }),
    )
    .$returningId();
  // Templo no tiene ninguna suscripcion especial en `fx` — a diferencia del
  // gimnasio 2 (que reusa `fx.dos.subscriptionEspecialId`), acá hace falta un
  // plan especial NUEVO. `t.userId` ya tiene la presencial activa: sumarle la
  // especial es el patron real "presencial + pase" (D-11 de analytics).
  const [especialPlan] = await app.db
    .insert(schema.subscriptionPlans)
    .values(
      tenantValues(CTX_TEMPLO, {
        name: `${MARCA_ISO03A} Plan Especial Templo ${suf}`,
        planTier: "other" as const,
        bookingMode: "flexible" as const,
        planCategory: "especial" as const,
        priceRegular: 999900,
        priceZero: 900000,
        durationDays: 30,
        monthlyClassBudget: 2,
        requiresPresencial: false,
        country: "AR" as const,
      }),
    )
    .$returningId();
  const [especialSub] = await app.db
    .insert(schema.subscriptions)
    .values(
      tenantValues(CTX_TEMPLO, {
        userId: t.userId,
        planId: especialPlan.id,
        branchId: t.branchId,
        status: "active" as const,
        startDate: hoy,
        endDate: dateOffsetStr(30),
        pricePaid: 999900,
        currency: "ARS" as const,
        priceTypeApplied: "regular" as const,
        classesRemaining: 2,
        classesBudget: 2,
      }),
    )
    .$returningId();
  // Fecha AYER (no hoy): las 3 filas de `attendance` de arriba (`attendanceIds`)
  // deben quedar como el ÚNICO aporte de El Templo al bucket "hoy" que leen
  // dailyCheckins/checkin-adoption — sembrar esta 4ta fila en la MISMA fecha
  // ensuciaría ese conteo exacto. `especiales` lee todo el MES (`monthRange`),
  // así que ayer sigue entrando.
  const [especialAttendance] = await app.db
    .insert(schema.attendance)
    .values(
      tenantValues(CTX_TEMPLO, {
        memberId: t.userId,
        branchId: t.branchId,
        scheduleId: especialSchedule.id,
        sessionDate: ayer,
        status: "confirmado" as const,
        source: "qr" as const,
      }),
    )
    .$returningId();

  // TICKET-01 exige `transaction_links`: el `advance_payment` sin link que
  // deja `members-gimnasio-dos.ts` no entra al universo `plan_charge`.
  const ticketAmount = 33300;
  const [ticketTx] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(CTX_TEMPLO, {
        memberId: t.userId,
        kind: "plan_charge" as const,
        direction: "inflow" as const,
        amount: ticketAmount,
        currency: "ARS",
        paymentMethod: "transfer" as const,
        transactionDate: hoy,
        effectiveDate: hoy,
        branchId: t.branchId,
        recordedBy: authorId,
        validationStatus: "validado" as const,
      }),
    )
    .$returningId();
  await app.db.insert(schema.transactionLinks).values(
    tenantValues(CTX_TEMPLO, {
      transactionId: ticketTx.id,
      targetKind: "subscription" as const,
      targetId: t.subscriptionId,
      allocatedAmount: ticketAmount,
    }),
  );

  return {
    attendanceIds,
    coachRatingId: coachRating.id,
    coachRatingComment,
    coachRatingStars: 1,
    churnedUserId: churnedSocio.id,
    churnedSubscriptionId: churnedSub.id,
    churnedPricePaid,
    churnedEndDate,
    trialUserId: trialSocio.id,
    trialBookingId: trialBooking.id,
    trialBookingDate,
    especialActivityId: especialActivity.id,
    especialScheduleId: especialSchedule.id,
    especialUserId: t.userId,
    especialSubscriptionId: especialSub.id,
    especialAttendanceId: especialAttendance.id,
    confirmedBookingId: confirmedBooking.id,
    ticketTransactionId: ticketTx.id,
    ticketTransactionAmount: ticketAmount,
    extraActiveUserId: null,
    extraActiveSubscriptionId: null,
    extraActivePricePaid: null,
  };
}

async function sembrarLadoAnalyticsGimnasioDos(
  app: FastifyInstance,
  gym2: SegundoGimnasio,
  fx: SubsSchedFixture,
): Promise<FichaAnalyticsExtra> {
  const suf = sufijo();
  const d = fx.dos;
  const hoy = todayStr();
  const ayer = dateOffsetStr(-1);
  const socioPrincipal = gym2.socios[0].id;
  const socioEspecial = gym2.socios[1].id;

  const attendanceIds: number[] = [];
  for (let i = 0; i < 5; i++) {
    const [row] = await app.db
      .insert(schema.attendance)
      .values(
        tenantValues(CTX_DOS, {
          memberId: socioPrincipal,
          branchId: gym2.branchId,
          scheduleId: d.scheduleId,
          sessionDate: hoy,
          status: "confirmado" as const,
          source: "qr" as const,
        }),
      )
      .$returningId();
    attendanceIds.push(row.id);
  }

  const [confirmedBooking] = await app.db
    .insert(schema.bookings)
    .values(
      tenantValues(CTX_DOS, {
        memberId: socioPrincipal,
        scheduleId: d.scheduleId,
        bookingDate: hoy,
        status: "confirmado" as const,
        isTrial: false,
      }),
    )
    .$returningId();

  const coachRatingComment = `${MARCA_ISO03A} rating dos ${suf}`;
  const [coachRating] = await app.db
    .insert(schema.coachRatings)
    .values(
      tenantValues(CTX_DOS, {
        coachId: gym2.coachId,
        memberId: socioPrincipal,
        branchId: gym2.branchId,
        scheduleId: d.scheduleId,
        sessionDate: hoy,
        stars: 5,
        classStars: 5,
        comment: coachRatingComment,
      }),
    )
    .$returningId();

  const churnedSocio = await createTestMember(app, {
    email: `analytics-churned-dos-${suf}@test.com`,
    branchId: gym2.branchId,
    tenantId: TENANT_DOS,
  });
  const churnedPricePaid = 666600;
  const churnedEndDate = dateOffsetStr(-25);
  const [churnedSub] = await app.db
    .insert(schema.subscriptions)
    .values(
      tenantValues(CTX_DOS, {
        userId: churnedSocio.id,
        planId: gym2.planId,
        branchId: gym2.branchId,
        status: "expired" as const,
        startDate: dateOffsetStr(-55),
        endDate: churnedEndDate,
        pricePaid: churnedPricePaid,
        currency: "ARS" as const,
        priceTypeApplied: "regular" as const,
      }),
    )
    .$returningId();

  const trialSocio1 = await createTestMember(app, {
    email: `analytics-trial-dos-1-${suf}@test.com`,
    branchId: gym2.branchId,
    tenantId: TENANT_DOS,
  });
  const trialSocio2 = await createTestMember(app, {
    email: `analytics-trial-dos-2-${suf}@test.com`,
    branchId: gym2.branchId,
    tenantId: TENANT_DOS,
  });
  const trialBookingDate = dateOffsetStr(-3);
  const [trialBooking] = await app.db
    .insert(schema.bookings)
    .values(
      tenantValues(CTX_DOS, {
        memberId: trialSocio1.id,
        scheduleId: d.scheduleId,
        bookingDate: trialBookingDate,
        status: "confirmado" as const,
        isTrial: true,
      }),
    )
    .$returningId();
  // Segunda reserva de prueba: SOLO cuenta = 2 del gimnasio 2 (asimetria a
  // proposito con Templo=1, mismo motivo que "miembros activos").
  await app.db.insert(schema.bookings).values(
    tenantValues(CTX_DOS, {
      memberId: trialSocio2.id,
      scheduleId: d.scheduleId,
      bookingDate: trialBookingDate,
      status: "confirmado" as const,
      isTrial: true,
    }),
  );

  const [especialActivity] = await app.db
    .insert(schema.activities)
    .values(
      tenantValues(CTX_DOS, {
        name: `${MARCA_ISO03A} Actividad Especial GDos ${suf}`,
        isActive: true,
        isSpecial: true,
      }),
    )
    .$returningId();
  const [especialSchedule] = await app.db
    .insert(schema.schedules)
    .values(
      tenantValues(CTX_DOS, {
        branchId: gym2.branchId,
        activityId: especialActivity.id,
        dayOfWeek: 6,
        startTime: "09:00",
        endTime: "10:00",
        isActive: true,
      }),
    )
    .$returningId();
  // El gimnasio 2 SI tiene una suscripcion especial en `fx` (socios[1]) — se
  // reusa, no se crea un plan especial nuevo (a diferencia de Templo).
  // Fecha AYER (no hoy) por el mismo motivo que el lado Templo: no ensuciar
  // el bucket "hoy" de dailyCheckins/checkin-adoption con una 6ta fila.
  const [especialAttendance] = await app.db
    .insert(schema.attendance)
    .values(
      tenantValues(CTX_DOS, {
        memberId: socioEspecial,
        branchId: gym2.branchId,
        scheduleId: especialSchedule.id,
        sessionDate: ayer,
        status: "confirmado" as const,
        source: "qr" as const,
      }),
    )
    .$returningId();

  const ticketAmount = 444400;
  const [ticketTx] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(CTX_DOS, {
        memberId: socioPrincipal,
        kind: "plan_charge" as const,
        direction: "inflow" as const,
        amount: ticketAmount,
        currency: "ARS",
        paymentMethod: "transfer" as const,
        transactionDate: hoy,
        effectiveDate: hoy,
        branchId: gym2.branchId,
        recordedBy: gym2.adminId,
        validationStatus: "validado" as const,
      }),
    )
    .$returningId();
  await app.db.insert(schema.transactionLinks).values(
    tenantValues(CTX_DOS, {
      transactionId: ticketTx.id,
      targetKind: "subscription" as const,
      targetId: d.subscriptionId,
      allocatedAmount: ticketAmount,
    }),
  );

  // Rompe el empate "miembros activos" 1=1 con Templo (ver docblock de
  // sembrarDatosAnalyticsGimnasioDos): SOLO el gimnasio 2 recibe este socio
  // extra, activo, no-especial.
  const extraActiveSocio = await createTestMember(app, {
    email: `analytics-extra-activo-dos-${suf}@test.com`,
    branchId: gym2.branchId,
    tenantId: TENANT_DOS,
  });
  const extraActivePricePaid = 555500;
  const [extraActiveSub] = await app.db
    .insert(schema.subscriptions)
    .values(
      tenantValues(CTX_DOS, {
        userId: extraActiveSocio.id,
        planId: gym2.planId,
        branchId: gym2.branchId,
        status: "active" as const,
        startDate: hoy,
        endDate: dateOffsetStr(30),
        pricePaid: extraActivePricePaid,
        currency: "ARS" as const,
        priceTypeApplied: "regular" as const,
      }),
    )
    .$returningId();

  return {
    attendanceIds,
    coachRatingId: coachRating.id,
    coachRatingComment,
    coachRatingStars: 5,
    churnedUserId: churnedSocio.id,
    churnedSubscriptionId: churnedSub.id,
    churnedPricePaid,
    churnedEndDate,
    trialUserId: trialSocio1.id,
    trialBookingId: trialBooking.id,
    trialBookingDate,
    especialActivityId: especialActivity.id,
    especialScheduleId: especialSchedule.id,
    especialUserId: socioEspecial,
    especialSubscriptionId: d.subscriptionEspecialId,
    especialAttendanceId: especialAttendance.id,
    confirmedBookingId: confirmedBooking.id,
    ticketTransactionId: ticketTx.id,
    ticketTransactionAmount: ticketAmount,
    extraActiveUserId: extraActiveSocio.id,
    extraActiveSubscriptionId: extraActiveSub.id,
    extraActivePricePaid,
  };
}

/**
 * Borra lo que {@link sembrarDatosAnalyticsGimnasioDos} deja en `coach_ratings`
 * — la ÚNICA tabla de este bloque que `TABLES_TO_CLEAN` (`test/helpers.ts`) NO
 * vacía (a diferencia de `attendance`/`bookings`/`subscriptions`/
 * `subscription_plans`/`activities`/`schedules`/`financial_transactions`/
 * `transaction_links`/`users`, las 9 restantes, todas cubiertas). Filtra por
 * {@link MARCA_ISO03A} en `comment` (única columna de texto libre de la
 * tabla): borrar TODO `coach_ratings` de los dos tenants se llevaría por
 * delante filas reales de otros archivos del mismo worker (`isolate: false`).
 */
export async function limpiarDatosAnalyticsDeLaBateria(
  app: FastifyInstance,
): Promise<void> {
  await app.db.execute(
    sql`DELETE FROM coach_ratings WHERE comment LIKE ${`${MARCA_ISO03A}%`}`,
  );
}
