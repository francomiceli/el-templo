/**
 * Fase 171 Plan 04 (ISO-02) — el SEGUNDO GIMNASIO, sembrable en una llamada.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Las fases 172-175 tienen que poder correr una ruta como staff del gimnasio A
 * y afirmar que NO ve nada del gimnasio B. Hoy eso no se puede escribir sin
 * copiar 80 lineas de siembra en cada archivo: el unico precedente del repo
 * (`test/tv/tv-pairing-tenant.test.ts`, fase 169-06) siembra tenant + sede +
 * staff a mano y reasigna el dueño con un UPDATE crudo de `users.tenant_id`
 * despues del insert. Este archivo es esa siembra, hecha una vez y bien.
 *
 * El `UPDATE` posterior ya no existe y esta PROHIBIDO reintroducirlo: el plan
 * 171-04 le agrego `tenantId` a `createStaffUser` / `createTestMember`
 * justamente para eliminarlo.
 *
 * COMO SE USA
 * -----------
 * Es OPT-IN por archivo (D-05). NO esta enchufado a `test/setup.ts` y no debe
 * estarlo: la suite entera no paga la siembra, solo los archivos que la piden.
 *
 * ```ts
 * let gym2: SegundoGimnasio;
 *
 * beforeAll(async () => {
 *   app = await createTestApp();
 * });
 *
 * beforeEach(async () => {
 *   await cleanAllTestData(app);       // PRIMERO: vacia ~90 tablas sin filtro de tenant
 *   gym2 = await seedSecondTenant(app); // DESPUES: si se invierte, el gimnasio 2 desaparece
 * });
 *
 * afterAll(async () => {
 *   await cleanAllTestData(app);
 *   await limpiarSegundoGimnasio(app); // OBLIGATORIO: la base la comparten los archivos del worker
 *   await app.close();
 * });
 * ```
 *
 * El orden importa y no es cosmetico: `cleanAllTestData` hace
 * un DELETE de `users` con `WHERE NOT (email <=> 'admin@test.com')` y vacia ~90 tablas
 * SIN filtro de tenant. Sembrar antes de limpiar deja el gimnasio 2 a medias —
 * la sede y el gimnasio sobreviven (no estan en `TABLES_TO_CLEAN`) pero el staff
 * y los socios no. `seedSecondTenant` arranca por `limpiarSegundoGimnasio`, asi
 * que llamarlo dos veces seguidas es seguro.
 *
 * QUE SIEMBRA (el espejo minimo de D-06, y nada mas)
 * -------------------------------------------------
 *   1 fila de `tenants` (id {@link TENANT_DOS}, `status: 'active'`)
 *   1 sede           — `branches`
 *   1 actividad      — `activities`      (gym-owned: el gimnasio 2 no puede colgar de una del 1)
 *   1 plan           — `subscription_plans`
 *   1 horario        — `schedules`        (colgado de la sede Y de la actividad del gimnasio 2)
 *   1 admin + 1 coach — `users` (+ `user_branches` para el coach), con token
 *   2 socios          — `users`, con token
 *
 * Todos los INSERT de tabla gym-owned pasan por `tenantValues(CTX, ...)`. No es
 * ceremonia: `tenant_id` tiene DEFAULT 1 desde la fase 167, asi que un insert
 * que se olvide de la columna siembra en El Templo y el fixture MIENTE — el
 * test de aislamiento que lo use pasaria en verde probando exactamente nada
 * (T-168-15, la trampa que ya mordio dos veces en la fase 169).
 *
 * QUE **NO** SIEMBRA
 * ------------------
 *   - `aura_config`: `source_type` sigue siendo una unique GLOBAL (deuda
 *     consciente del modulo Aura, registrada con motivo en
 *     `TENANT_UNIQUE_ALLOWLIST`). Una fila del gimnasio 2 chocaria con la del 1.
 *   - `cash_registers`: D-06 no lo pide. Si una bateria de finance necesita
 *     cobrar contra la sede del gimnasio 2, que llame
 *     `ensureEfectivoCaja(app, gym2.branchId, "ARS", TENANT_DOS)` — es
 *     idempotente y desde la fase 171 (WR-02) acepta el tenant. El cuarto
 *     argumento NO es opcional en la practica: su default es 1, asi que
 *     omitirlo estampa la caja en El Templo (T-168-15) y el fixture mentiria.
 *     `limpiarSegundoGimnasio` ya borra las cajas del gimnasio 2 (antes que
 *     `branches`, por la FK `cash_registers.branch_id`), asi que la limpieza
 *     no necesita nada extra.
 *   - Subscripciones, reservas y asistencias: cada bateria siembra lo suyo. Este
 *     fixture es el ESQUELETO del gimnasio, no un gimnasio en funcionamiento.
 *
 * LOS EMAILS SON PROPIOS DEL GIMNASIO 2, SIEMPRE
 * ----------------------------------------------
 * `POST /api/auth/login` resuelve con `eq(users.email, email)` SIN filtro de
 * tenant. Si un socio del gimnasio 2 repitiera el email de uno del 1, el token
 * que devuelve `getAuthToken` seria no-deterministico (T-171-15). Por eso cada
 * corrida usa un sufijo unico.
 */
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { createStaffUser, createTestMember, getAuthToken } from "../helpers";

// ─── Constantes de gimnasio ──────────────────────────────────────────────────

/**
 * Id del segundo gimnasio. Fijo y ALTO a proposito.
 *
 * Vitest corre con `isolate: false` (`vitest.config.ts`), asi que los archivos
 * de un mismo worker comparten la base: dos que usaran el mismo id se pisarian
 * y el rojo seria intermitente (Pitfall 10).
 *
 * Ids ya tomados por otros archivos de `test/`, re-grepeados el 2026-07-29:
 * 90168 (con-01), 90169 (tenant-helpers), 90269 (con-04), 90369 (con-03),
 * 90418, 90469 (webhook Wellhub), 90569 (tv-pairing) y 90940. 90671 estaba
 * libre y este archivo es su UNICO usuario. Si un test de la fase necesita un
 * tercer gimnasio, que tome un id propio — no reusar este.
 */
export const TENANT_DOS = 90671;

/**
 * El Templo, sembrado por la migracion 0190. Este archivo NUNCA lo toca: ni
 * siembra ni borra una sola fila suya. Vive aca para que las comparaciones de
 * los tests que hagan opt-in no tengan un `1` magico suelto.
 */
export const TENANT_TEMPLO = 1;

/** Contexto de escritura del gimnasio 2. Todo INSERT gym-owned pasa por aca. */
const CTX: TenantContext = { tenantId: TENANT_DOS };

/** Nombre del gimnasio 2, tambien usado en el mensaje de un rojo. */
const NOMBRE_GIMNASIO = "Gimnasio de prueba 171";

/**
 * Sufijo unico por corrida para emails y codigos.
 *
 * Mismo generador que ya usan `createTestMember` y `createEligibleFreemium` en
 * `test/helpers.ts`: timestamp en base 36 + 4 caracteres aleatorios. Sirve para
 * los dos motivos: los emails no pueden repetir los del gimnasio 1 (el login es
 * tenant-agnostico) y `branches.code` es unique compuesta `(tenant_id, code)`
 * desde la fase 168, asi que dos corridas del mismo worker chocarian.
 */
function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Forma del handle ────────────────────────────────────────────────────────

/** Un socio del gimnasio 2, ya autenticado. */
export interface SocioDelGimnasioDos {
  id: number;
  email: string;
  token: string;
}

/**
 * Todo lo que `seedSecondTenant` deja sembrado, con ids y tokens listos.
 *
 * Los tokens vienen resueltos a proposito: el 90% de los tests de aislamiento
 * lo unico que necesitan es un `authorization` del gimnasio equivocado.
 */
export interface SegundoGimnasio {
  tenantId: number;
  branchId: number;
  activityId: number;
  adminId: number;
  adminToken: string;
  coachId: number;
  coachToken: string;
  /** Dos socios: alcanza para probar "el otro socio del MISMO gimnasio tampoco". */
  socios: [SocioDelGimnasioDos, SocioDelGimnasioDos];
  planId: number;
  scheduleId: number;
}

// ─── Siembra ─────────────────────────────────────────────────────────────────

/**
 * Siembra el gimnasio 2 completo y devuelve el handle.
 *
 * Idempotente: arranca borrando su propio rastro, asi que una corrida anterior
 * abortada (o un `beforeEach` que lo llama en cada test) no choca con su propia
 * PK. Va SIEMPRE despues de `cleanAllTestData` — ver `COMO SE USA` arriba.
 */
export async function seedSecondTenant(
  app: FastifyInstance,
): Promise<SegundoGimnasio> {
  // Defensivo: una corrida abortada pudo dejar filas colgadas, y la PK de
  // `tenants` es explicita (no autoincrement) asi que el insert de abajo
  // fallaria con duplicate key.
  await limpiarSegundoGimnasio(app);

  const suf = sufijo();

  // `tenants` es la tabla RAIZ del modelo: no es gym-owned y no tiene columna
  // `tenant_id`, por eso este es el unico insert del archivo que no pasa por
  // `tenantValues`. El id va explicito porque todo lo demas lo referencia.
  await app.db.insert(schema.tenants).values({
    id: TENANT_DOS,
    name: NOMBRE_GIMNASIO,
    slug: `test-171-${TENANT_DOS}`,
    status: "active",
  });

  const [sede] = await app.db
    .insert(schema.branches)
    .values(
      tenantValues(CTX, {
        name: `Sede del ${NOMBRE_GIMNASIO}`,
        // `code` es unique compuesta (tenant_id, code) desde la fase 168, y la
        // columna es varchar(20): el sufijo entra pero hay que recortar.
        code: `G2${suf}`.toUpperCase().slice(0, 20),
        country: "AR",
        isVirtual: false,
        isActive: true,
      }),
    )
    .$returningId();

  // `activities` es gym-owned: el horario del gimnasio 2 NO puede colgar de una
  // actividad de El Templo. Si colgara, el test de aislamiento estaria mirando
  // una fila compartida y no probaria nada.
  const [actividad] = await app.db
    .insert(schema.activities)
    .values(
      tenantValues(CTX, {
        name: `Actividad ${suf}`,
        isActive: true,
      }),
    )
    .$returningId();

  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values(
      tenantValues(CTX, {
        // La unique es (tenant_id, name, country): el sufijo evita que dos
        // corridas del mismo worker choquen.
        name: `Plan del gimnasio 2 ${suf}`,
        planTier: "flex" as const,
        bookingMode: "flexible" as const,
        planCategory: "presencial" as const,
        priceRegular: 15000,
        priceZero: 10000,
        durationDays: 30,
        classesPerWeek: 3,
      }),
    )
    .$returningId();

  const [horario] = await app.db
    .insert(schema.schedules)
    .values(
      tenantValues(CTX, {
        branchId: sede.id,
        activityId: actividad.id,
        dayOfWeek: 1,
        startTime: "10:00",
        endTime: "11:00",
        isActive: true,
      }),
    )
    .$returningId();

  // El staff sale de los helpers canonicos con `tenantId` EXPLICITO (fase 171).
  // Prohibido el workaround del 169-06 (un UPDATE crudo de `users.tenant_id`
  // despues del insert): es exactamente lo que este plan vino a eliminar.
  const adminEmail = `admin-g2-${suf}@test.com`;
  const adminPassword = "gym2-admin-123";
  const adminId = await createStaffUser(app, {
    email: adminEmail,
    password: adminPassword,
    firstName: "Admin",
    lastName: "Gimnasio Dos",
    role: "admin",
    branchId: sede.id,
    tenantId: TENANT_DOS,
  });

  const coachEmail = `coach-g2-${suf}@test.com`;
  const coachPassword = "gym2-coach-123";
  const coachId = await createStaffUser(app, {
    email: coachEmail,
    password: coachPassword,
    firstName: "Coach",
    lastName: "Gimnasio Dos",
    role: "coach",
    branchId: sede.id,
    tenantId: TENANT_DOS,
  });

  // Los socios van por INSERT directo (lo resuelve `createTestMember` con
  // `tenantId`): `POST /api/auth/register` no conoce el tenant y su fila caeria
  // en el DEFAULT 1. Ver el docblock de `createTestMember`.
  const socios: SocioDelGimnasioDos[] = [];
  for (const n of [1, 2]) {
    const email = `socio${n}-g2-${suf}@test.com`;
    const creado = await createTestMember(app, {
      email,
      branchId: sede.id,
      tenantId: TENANT_DOS,
    });
    socios.push({ id: creado.id, email, token: creado.token });
  }

  // El login es tenant-agnostico hoy (resuelve por email), asi que los tokens
  // del staff salen del login normal — no hay que firmar JWTs a mano.
  const adminToken = await tokenDe(app, adminEmail, adminPassword);
  const coachToken = await tokenDe(app, coachEmail, coachPassword);

  return {
    tenantId: TENANT_DOS,
    branchId: sede.id,
    activityId: actividad.id,
    adminId,
    adminToken,
    coachId,
    coachToken,
    socios: [socios[0], socios[1]],
    planId: plan.id,
    scheduleId: horario.id,
  };
}

/**
 * Token de un usuario del gimnasio 2.
 *
 * Envoltorio delgado sobre `getAuthToken` —no reimplementa el login— para que
 * el mensaje del rojo diga de QUE gimnasio era el que fallo: un "Login failed
 * for x@test.com" pelado, en una bateria de aislamiento con dos gimnasios en
 * juego, manda a debuggear al lugar equivocado.
 */
async function tokenDe(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  try {
    return await getAuthToken(app, email, password);
  } catch (err: unknown) {
    const detalle = err instanceof Error ? err.message : String(err);
    throw new Error(
      `seedSecondTenant: no se pudo autenticar a ${email} (gimnasio ${TENANT_DOS}). ${detalle}`,
    );
  }
}

// ─── Limpieza ────────────────────────────────────────────────────────────────

/**
 * Borra TODO el rastro del gimnasio 2, en orden seguro de FKs.
 *
 * POR QUE LA LIMPIEZA ES LOCAL Y NO GLOBAL
 * ----------------------------------------
 * La tentacion obvia es agregar `branches` a `TABLES_TO_CLEAN` en
 * `test/helpers.ts` y olvidarse. NO se hace, y no es un gusto: `test/setup.ts`
 * siembra las sedes semilla una sola vez por worker y 165 archivos de test
 * dependen de que `branchId: 1` siga existiendo en cada `beforeEach`. Vaciar
 * `branches` globalmente los rompe a todos. Por eso la limpieza del gimnasio 2
 * vive aca, es local y la llama el archivo que hizo opt-in.
 *
 * (`branches` es una de las 15 tablas gym-owned que `cleanAllTestData` NO toca,
 * junto con `audit_log`, `aura_config`, `cash_registers` y once mas. Su sede
 * sobrevive entre archivos del mismo worker — `isolate: false` — asi que el
 * `afterAll` no es opcional: T-171-14.)
 *
 * ORDEN Y `tenant_id` EN CADA DELETE
 * ----------------------------------
 * Los hijos van antes que los padres porque aca los FK checks estan ENCENDIDOS
 * (a diferencia de `cleanAllTestData`, que los apaga). En particular, la fila de
 * `tenants` se va ULTIMA: no se puede borrar mientras una sede la referencie
 * (`fk_branches_tenant`) — la trampa exacta que documento el 169-06.
 *
 * Todos los DELETE llevan `WHERE tenant_id = ...` (el de `tenants`, `id`). Dos
 * motivos: uno, un DELETE sin filtro borraria datos de El Templo y romperia la
 * suite entera (T-171-13); dos, cuando `finance` entre a
 * `TENANT_STRICT_MODULES` en la fase 172, el sentinel va a hacer throw sobre un
 * DELETE crudo sin la columna. Se adopta desde ahora para no tener que volver.
 *
 * Idempotente: correrla sobre una base donde el gimnasio 2 no existe no hace
 * nada y no falla.
 */
export async function limpiarSegundoGimnasio(
  app: FastifyInstance,
): Promise<void> {
  // 173-04: `audit_log` no esta en `TABLES_TO_CLEAN` (test/helpers.ts) y hasta
  // ahora nunca hacia falta borrarla aca — el helper de auditoria no estampaba
  // `tenant_id` (D-01), asi que sus filas caian todas en el DEFAULT 1 y jamas
  // referenciaban al gimnasio 2. Migrado `shared/audit-log.ts` a
  // `tenantValues(ctx, ...)`, un void/validate/observe/correct sobre un
  // recurso del gimnasio 2 ahora escribe `tenant_id = TENANT_DOS` de verdad, y
  // sin este DELETE el `DELETE FROM tenants` de mas abajo revienta con
  // `ER_ROW_IS_REFERENCED_2` (`fk_audit_log_tenant`) — la misma bomba FK
  // latente que el `cash_registers` de abajo (Pitfall 10), por otra tabla.
  // Va PRIMERO: `audit_log.actor_id` tambien tiene FK a `users` (fk_audit_log_actor),
  // asi que tiene que salir antes del `DELETE FROM users` de mas abajo tambien.
  await app.db.execute(
    sql`DELETE FROM audit_log WHERE tenant_id = ${TENANT_DOS}`,
  );
  await app.db.execute(
    sql`DELETE FROM schedules WHERE tenant_id = ${TENANT_DOS}`,
  );
  await app.db.execute(
    sql`DELETE FROM subscription_plans WHERE tenant_id = ${TENANT_DOS}`,
  );
  await app.db.execute(
    sql`DELETE FROM activities WHERE tenant_id = ${TENANT_DOS}`,
  );
  await app.db.execute(
    sql`DELETE FROM user_branches WHERE tenant_id = ${TENANT_DOS}`,
  );
  await app.db.execute(sql`DELETE FROM users WHERE tenant_id = ${TENANT_DOS}`);
  // Defensivo (WR-02): el fixture NO siembra cajas, pero una bateria de finance
  // puede crear la suya via `ensureEfectivoCaja(app, gym2.branchId, "ARS",
  // TENANT_DOS)`. `cash_registers.branch_id` tiene FK a `branches` sin cascade
  // y la tabla no esta en `TABLES_TO_CLEAN`: sin este DELETE, esa caja
  // sobreviviria a las dos limpiezas y el DELETE de `branches` de abajo
  // reventaria con ER_ROW_IS_REFERENCED — filas del gimnasio 2 filtrandose a
  // los demas archivos del worker (Pitfall 10 por otra puerta).
  await app.db.execute(
    sql`DELETE FROM cash_registers WHERE tenant_id = ${TENANT_DOS}`,
  );
  await app.db.execute(
    sql`DELETE FROM branches WHERE tenant_id = ${TENANT_DOS}`,
  );
  await app.db.execute(sql`DELETE FROM tenants WHERE id = ${TENANT_DOS}`);
}
