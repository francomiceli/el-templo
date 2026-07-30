/**
 * Fase 171 Plan 05 (ISO-02): el fixture del gimnasio 2 hace lo que dice.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * `test/fixtures/second-tenant.ts` (plan 171-04) es la base sobre la que las
 * fases 172-175 van a escribir CADA batería de aislamiento. Un fixture que
 * "funciona" pero siembra en el tenant 1 es el peor resultado posible: verde y
 * falso — las baterías que lo usen pasarían probando exactamente nada. Ya pasó
 * dos veces en la fase 169 (T-168-15): `tenant_id` tiene DEFAULT 1 desde la
 * fase 167, así que un INSERT que se olvide de la columna cae en El Templo sin
 * avisar y nadie se entera.
 *
 * La única evidencia válida de que la siembra es correcta es `SELECT tenant_id`
 * sobre la fila REALMENTE creada. Ninguna aserción de este archivo mira un body
 * HTTP ni el handle que devuelve el fixture: lo que está en discusión es qué
 * quedó ESCRITO en la base.
 *
 * LO QUE SE AFIRMA
 * ----------------
 *   1. Las 7 piezas del espejo mínimo de D-06 —sede, actividad, plan, horario,
 *      admin, coach y 2 socios (+ el `user_branches` del coach)— nacen con
 *      `tenant_id = TENANT_DOS`, afirmado fila por fila.
 *   2. La cardinalidad del espejo es exacta: ni una fila de más ni una de menos.
 *   3. Las aserciones son de DOBLE LADO: las filas del gimnasio 2 aparecen
 *      filtrando por su gimnasio Y no aparecen filtrando por El Templo. Media
 *      aserción (sólo inclusión) pasaría en verde con el fixture sembrando en el
 *      tenant 1, que es justo el fallo que este archivo viene a atrapar.
 *   4. `createStaffUser` y `createTestMember` SIN `tenantId` siguen escribiendo
 *      en el tenant 1 (criterio 3 del ROADMAP, probado y no asumido: son ~215
 *      archivos de test los que dependen de ese default).
 *   5. `limpiarSegundoGimnasio` no deja rastro del gimnasio 2 y no toca El Templo.
 *   6. `test/setup.ts` no siembra el gimnasio 2: la siembra es OPT-IN por archivo
 *      (D-05).
 *
 * QUÉ **NO** ES ESTE ARCHIVO
 * --------------------------
 * NO es la batería de aislamiento. Que el gimnasio 1 no VEA los datos del 2 por
 * las rutas reales es ISO-03, fase 172. Acá no se ejerce una sola ruta de
 * negocio: lo único que se verifica es que la siembra escribe donde dice y que
 * la limpieza borra lo que dice.
 *
 * CÓMO CORRERLO
 * -------------
 * Sólo este archivo: más de uno a la vez revienta el timeout del provisioning de
 * la DB por worker en esta máquina (~100 s por archivo).
 *   pnpm exec vitest run test/tenancy/iso-02-fixtures.test.ts --hookTimeout=250000
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { eq, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  createTestMember,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

// ─── Constantes ──────────────────────────────────────────────────────────────
// Cero números mágicos sueltos en las aserciones (regla 5 de PATTERNS). Los dos
// ids de gimnasio salen del fixture: `TENANT_DOS` (90671) y `TENANT_TEMPLO` (1).

/**
 * La sede semilla que siembra `test/setup.ts` en cada worker. Es la que usan por
 * default los ~215 call sites previos de `createStaffUser` / `createTestMember`,
 * así que la prueba de retrocompatibilidad tiene que llamarlos exactamente así.
 */
const SEDE_SEMILLA = 1;

/**
 * El único usuario que sobrevive a `cleanAllTestData` (`DELETE FROM users WHERE
 * NOT (email <=> 'admin@test.com')`). Sirve de fila conocida de El Templo para
 * las aserciones de exclusión.
 */
const EMAIL_ADMIN_SEMILLA = "admin@test.com";

/** Ruta del setup global, para el gate de opt-in (D-05). */
const RUTA_SETUP = path.resolve(__dirname, "..", "setup.ts");

/**
 * Las tablas del espejo de D-06. Union cerrada de literales a propósito: los
 * helpers de abajo interpolan el nombre con `sql.raw`, y un `string` libre ahí
 * sería una puerta abierta a construir SQL desde datos.
 */
type TablaDelEspejo =
  | "branches"
  | "users"
  | "user_branches"
  | "activities"
  | "subscription_plans"
  | "schedules";

/** Las 6 tablas gym-owned que el fixture toca, para los barridos. */
const TABLAS_DEL_ESPEJO: readonly TablaDelEspejo[] = [
  "branches",
  "users",
  "user_branches",
  "activities",
  "subscription_plans",
  "schedules",
];

// ─── Utilidades de lectura contra la BASE ────────────────────────────────────

/**
 * Normaliza la salida de `app.db.execute`, que devuelve una forma incómoda
 * (`[filas, metadata]` en mysql2, a veces las filas peladas). Los dos
 * precedentes del repo la normalizan igual: `test/tenancy/tenant-helpers.test.ts`
 * y `test/tv/tv-pairing-tenant.test.ts`.
 */
async function consultar<T>(app: FastifyInstance, consulta: SQL): Promise<T[]> {
  const resultado = (await app.db.execute(consulta)) as unknown as [T[]];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as T[]);
  return filas ?? [];
}

/** Cantidad de filas en `tenants` con ese id (0 o 1). */
async function contarTenant(
  app: FastifyInstance,
  tenantId: number,
): Promise<number> {
  const filas = await consultar<{ n: number }>(
    app,
    sql`SELECT COUNT(*) AS n FROM tenants WHERE id = ${tenantId}`,
  );
  return Number(filas[0]?.n ?? -1);
}

/**
 * El `tenant_id` REAL de una fila, leído de la base por id.
 *
 * Ésta es la única evidencia que vale en este archivo: el handle que devuelve
 * `seedSecondTenant` dice de qué gimnasio CREE que es cada fila, y eso es
 * exactamente lo que está bajo prueba.
 *
 * Devuelve `null` cuando la fila no existe, para que un id equivocado se
 * distinga de un gimnasio equivocado en el mensaje del rojo.
 */
async function tenantDeLaFila(
  app: FastifyInstance,
  tabla: TablaDelEspejo,
  id: number,
): Promise<number | null> {
  const filas = await consultar<{ t: number | null }>(
    app,
    sql`SELECT tenant_id AS t FROM ${sql.raw(tabla)} WHERE id = ${id}`,
  );
  if (filas[0] === undefined || filas[0].t === null) return null;
  return Number(filas[0].t);
}

/** Ids de una tabla filtrando por gimnasio, ordenados. */
async function idsDelGimnasio(
  app: FastifyInstance,
  tabla: TablaDelEspejo,
  tenantId: number,
): Promise<number[]> {
  const filas = await consultar<{ id: number }>(
    app,
    sql`SELECT id FROM ${sql.raw(tabla)} WHERE tenant_id = ${tenantId} ORDER BY id`,
  );
  return filas.map((f) => Number(f.id));
}

/** Emails (no nulos) de los usuarios de un gimnasio. */
async function emailsDelGimnasio(
  app: FastifyInstance,
  tenantId: number,
): Promise<string[]> {
  const filas = await consultar<{ email: string | null }>(
    app,
    sql`SELECT email FROM users WHERE tenant_id = ${tenantId}`,
  );
  return filas
    .map((f) => f.email)
    .filter((e): e is string => typeof e === "string");
}

/** Un JWT es `header.payload.firma`: tres segmentos separados por punto. */
function pareceJwt(token: string): boolean {
  return token.split(".").length === 3 && token.length > 40;
}

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // EL ORDEN ES OBLIGADO, no cosmético (Pitfall 7 del RESEARCH):
  // `cleanAllTestData` vacía ~90 tablas SIN filtro de tenant y borra todos los
  // users menos `admin@test.com`. Sembrar antes de limpiar dejaría el gimnasio 2
  // a medias —la sede y la fila de `tenants` sobreviven, el staff no— y los
  // tests de acá abajo mirarían un espejo roto.
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterAll(async () => {
  // Obligatorio: la base la comparten todos los archivos del mismo worker
  // (`isolate: false`) y `branches` no está en `TABLES_TO_CLEAN`, así que sin
  // esto la sede del gimnasio 2 se filtra al archivo siguiente (T-171-14).
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

/**
 * Mensaje compartido de los rojos del espejo: siempre dice qué significa un `1`
 * en esa columna, que es el único valor equivocado que puede aparecer sin que
 * nada más falle.
 */
function porQueImporta(pieza: string): string {
  return (
    `${pieza} del fixture NO quedó en el gimnasio ${TENANT_DOS}. Si el valor leído es ` +
    `${TENANT_TEMPLO}, ese INSERT perdió su \`tenantValues(CTX, …)\` y cayó en el DEFAULT 1 de la ` +
    `columna (T-168-15): el "segundo gimnasio" sería en realidad El Templo, y toda batería de ` +
    `aislamiento de las fases 172-175 que se siembre con este fixture pasaría en verde probando ` +
    `exactamente nada. Revisar test/fixtures/second-tenant.ts antes de tocar este test.`
  );
}

describe("A. el espejo mínimo de D-06 nace en el gimnasio 2", () => {
  it("Test 1: la sede nace con el tenant_id del gimnasio 2", async () => {
    expect(
      await tenantDeLaFila(app, "branches", gym2.branchId),
      porQueImporta(`La sede ${gym2.branchId}`),
    ).toBe(TENANT_DOS);
  });

  it("Test 2: la actividad nace con el tenant_id del gimnasio 2", async () => {
    // `activities` es gym-owned: si el horario del gimnasio 2 colgara de una
    // actividad de El Templo, el aislamiento estaría mirando una fila compartida.
    expect(
      await tenantDeLaFila(app, "activities", gym2.activityId),
      porQueImporta(`La actividad ${gym2.activityId}`),
    ).toBe(TENANT_DOS);
  });

  it("Test 3: el plan nace con el tenant_id del gimnasio 2", async () => {
    expect(
      await tenantDeLaFila(app, "subscription_plans", gym2.planId),
      porQueImporta(`El plan ${gym2.planId}`),
    ).toBe(TENANT_DOS);
  });

  it("Test 4: el horario nace en el gimnasio 2 y cuelga de SU sede y SU actividad", async () => {
    expect(
      await tenantDeLaFila(app, "schedules", gym2.scheduleId),
      porQueImporta(`El horario ${gym2.scheduleId}`),
    ).toBe(TENANT_DOS);

    const [horario] = await app.db
      .select({
        tenantId: schema.schedules.tenantId,
        branchId: schema.schedules.branchId,
        activityId: schema.schedules.activityId,
      })
      .from(schema.schedules)
      .where(eq(schema.schedules.id, gym2.scheduleId));

    expect(
      { branchId: horario?.branchId, activityId: horario?.activityId },
      `El horario del gimnasio ${TENANT_DOS} no cuelga de la sede y la actividad de SU gimnasio. ` +
        `Un horario con el tenant_id correcto pero apuntando a una sede o una actividad de El Templo ` +
        `es un espejo incoherente: las rutas de reservas leen por branch_id/activity_id, así que el ` +
        `test de aislamiento de la fase 172 leería datos cruzados y no lo notaría.`,
    ).toEqual({ branchId: gym2.branchId, activityId: gym2.activityId });
  });

  it("Test 5: el admin y el coach nacen en el gimnasio 2, y el user_branches del coach también", async () => {
    expect(
      await tenantDeLaFila(app, "users", gym2.adminId),
      porQueImporta(`El admin ${gym2.adminId}`),
    ).toBe(TENANT_DOS);

    expect(
      await tenantDeLaFila(app, "users", gym2.coachId),
      porQueImporta(`El coach ${gym2.coachId}`),
    ).toBe(TENANT_DOS);

    // El segundo INSERT de `createStaffUser` es el que se olvida siempre:
    // `user_branches` también es gym-owned, y sin la columna el coach del
    // gimnasio 2 tendría su sede de trabajo registrada en El Templo.
    const [vinculo] = await app.db
      .select({
        id: schema.userBranches.id,
        tenantId: schema.userBranches.tenantId,
      })
      .from(schema.userBranches)
      .where(eq(schema.userBranches.userId, gym2.coachId));

    expect(
      vinculo?.tenantId,
      porQueImporta(`El user_branches del coach ${gym2.coachId}`),
    ).toBe(TENANT_DOS);
  });

  it("Test 6: los 2 socios nacen en el gimnasio 2, cada uno afirmado por separado", async () => {
    for (const [indice, socio] of gym2.socios.entries()) {
      expect(
        await tenantDeLaFila(app, "users", socio.id),
        porQueImporta(
          `El socio ${indice + 1} (id ${socio.id}, ${socio.email})`,
        ),
      ).toBe(TENANT_DOS);
    }
  });

  it("Test 7: la cardinalidad del espejo es exacta (ni una fila de más ni de menos)", async () => {
    const conteos = {
      sedes: (await idsDelGimnasio(app, "branches", TENANT_DOS)).length,
      actividades: (await idsDelGimnasio(app, "activities", TENANT_DOS)).length,
      planes: (await idsDelGimnasio(app, "subscription_plans", TENANT_DOS))
        .length,
      horarios: (await idsDelGimnasio(app, "schedules", TENANT_DOS)).length,
      usuarios: (await idsDelGimnasio(app, "users", TENANT_DOS)).length,
      vinculos: (await idsDelGimnasio(app, "user_branches", TENANT_DOS)).length,
    };

    expect(
      conteos,
      `La cardinalidad del gimnasio ${TENANT_DOS} no es la del espejo mínimo de D-06 ` +
        `(1 sede, 1 actividad, 1 plan, 1 horario, 4 usuarios = 1 admin + 1 coach + 2 socios, y ` +
        `1 user_branches — sólo el coach lo lleva). De MÁS significa que \`seedSecondTenant\` dejó de ` +
        `ser idempotente (no borró su rastro antes de sembrar) y las baterías de las fases 172-175 ` +
        `van a ver filas fantasma; de MENOS, que una pieza no se sembró o cayó en otro gimnasio. ` +
        `Cambiar estos números es cambiar D-06: va con decisión escrita, no en un plan de ejecución.`,
    ).toEqual({
      sedes: 1,
      actividades: 1,
      planes: 1,
      horarios: 1,
      usuarios: 4,
      vinculos: 1,
    });
  });

  it("Test 8: doble lado — las filas del gimnasio 2 no aparecen en El Templo, y las de El Templo no aparecen en el gimnasio 2", async () => {
    // Un socio recién creado por el camino de siempre: es la contraparte viva de
    // El Templo contra la que se cruza. Sin él, la mitad "El Templo conserva lo
    // suyo" no probaría nada.
    const socioDelTemplo = await createTestMember(app, {});
    const [adminSemilla] = await app.db
      .select({ id: schema.users.id, tenantId: schema.users.tenantId })
      .from(schema.users)
      .where(eq(schema.users.email, EMAIL_ADMIN_SEMILLA));

    const usuariosDelDos = await idsDelGimnasio(app, "users", TENANT_DOS);
    const usuariosDelTemplo = await idsDelGimnasio(app, "users", TENANT_TEMPLO);

    const mensajeUsuarios =
      `Los usuarios de los dos gimnasios se están mezclando. Los 4 del gimnasio ${TENANT_DOS} ` +
      `(${usuariosDelDos.join(", ")}) tienen que aparecer SÓLO filtrando por su gimnasio, y los de ` +
      `El Templo (${usuariosDelTemplo.join(", ")}) SÓLO filtrando por el 1. Una aserción de sola ` +
      `inclusión pasaría en verde con el fixture sembrando todo en el tenant 1: la mitad que ` +
      `importa es la exclusión.`;

    expect(usuariosDelDos, mensajeUsuarios).toContain(gym2.adminId);
    expect(usuariosDelDos, mensajeUsuarios).toContain(gym2.coachId);
    expect(usuariosDelDos, mensajeUsuarios).not.toContain(socioDelTemplo.id);
    expect(usuariosDelDos, mensajeUsuarios).not.toContain(adminSemilla?.id);
    expect(usuariosDelTemplo, mensajeUsuarios).toContain(socioDelTemplo.id);
    expect(usuariosDelTemplo, mensajeUsuarios).toContain(adminSemilla?.id);
    expect(usuariosDelTemplo, mensajeUsuarios).not.toContain(gym2.adminId);
    expect(usuariosDelTemplo, mensajeUsuarios).not.toContain(gym2.coachId);
    for (const socio of gym2.socios) {
      expect(usuariosDelDos, mensajeUsuarios).toContain(socio.id);
      expect(usuariosDelTemplo, mensajeUsuarios).not.toContain(socio.id);
    }

    const sedesDelDos = await idsDelGimnasio(app, "branches", TENANT_DOS);
    const sedesDelTemplo = await idsDelGimnasio(app, "branches", TENANT_TEMPLO);

    const mensajeSedes =
      `Las sedes de los dos gimnasios se están mezclando. El gimnasio ${TENANT_DOS} tiene que tener ` +
      `exactamente la suya (${gym2.branchId}) y El Templo conservar TODAS las semilla de ` +
      `test/setup.ts — si el fixture le robara una sede al 1, los ~165 archivos que dependen de la ` +
      `sede ${SEDE_SEMILLA} se caerían en cadena (criterio 4 del ROADMAP).`;

    expect(sedesDelDos, mensajeSedes).toEqual([gym2.branchId]);
    expect(sedesDelTemplo, mensajeSedes).not.toContain(gym2.branchId);
    expect(sedesDelTemplo, mensajeSedes).toContain(SEDE_SEMILLA);
  });

  it("Test 9: los tokens del gimnasio 2 son JWTs utilizables y sus emails no chocan con los de El Templo", async () => {
    const tokens: Array<[string, string]> = [
      ["admin", gym2.adminToken],
      ["coach", gym2.coachToken],
      ["socio 1", gym2.socios[0].token],
      ["socio 2", gym2.socios[1].token],
    ];

    for (const [quien, token] of tokens) {
      expect(
        pareceJwt(token),
        `El token del ${quien} del gimnasio ${TENANT_DOS} no parece un JWT. \`seedSecondTenant\` ` +
          `resuelve los 4 tokens por \`POST /api/auth/login\` justamente para que las baterías de ` +
          `aislamiento tengan un \`authorization\` del gimnasio equivocado sin trabajo extra: sin ` +
          `token utilizable, el fixture no sirve para lo que fue hecho.`,
      ).toBe(true);
    }

    const delTemplo = new Set(await emailsDelGimnasio(app, TENANT_TEMPLO));
    const repetidos = (await emailsDelGimnasio(app, TENANT_DOS))
      .filter((email) => delTemplo.has(email))
      .sort();

    expect(
      repetidos,
      `Emails compartidos entre los dos gimnasios: ${repetidos.join(", ")}. ` +
        `\`POST /api/auth/login\` resuelve con \`eq(users.email, email)\` SIN filtro de tenant, así que ` +
        `un email repetido hace que \`getAuthToken\` devuelva un token NO DETERMINÍSTICO — a veces del ` +
        `socio del gimnasio 1, a veces del 2 (T-171-15). El fixture usa un sufijo único por corrida ` +
        `para evitarlo: si esto se cae, alguien fijó un email literal.`,
    ).toEqual([]);
  });
});

describe("B. retrocompatibilidad de los helpers (criterio 3 del ROADMAP)", () => {
  it("Test 10: createStaffUser SIN tenantId escribe en El Templo, y su user_branches también", async () => {
    const sufijo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    // Llamada IDÉNTICA a la de los ~215 call sites previos: sin `tenantId`, con
    // la sede semilla. El rol `coach` es a propósito — es el único que dispara
    // el segundo INSERT (`user_branches`).
    const coachId = await createStaffUser(app, {
      email: `coach-retrocompat-${sufijo}@test.com`,
      password: "retro-pass-123",
      firstName: "Coach",
      lastName: "Retrocompat",
      role: "coach",
      branchId: SEDE_SEMILLA,
    });

    const mensaje =
      `\`createStaffUser\` SIN \`tenantId\` dejó de escribir en El Templo (${TENANT_TEMPLO}). El ` +
      `parámetro de la fase 171 tiene DEFAULT 1 justamente para que los ~215 archivos de test que ya ` +
      `llaman a este helper no cambien ni una línea: si el default se movió, la suite entera cambia ` +
      `de gimnasio de golpe y el criterio 4 del ROADMAP se rompe en silencio.`;

    expect(await tenantDeLaFila(app, "users", coachId), mensaje).toBe(
      TENANT_TEMPLO,
    );

    const [vinculo] = await app.db
      .select({ tenantId: schema.userBranches.tenantId })
      .from(schema.userBranches)
      .where(eq(schema.userBranches.userId, coachId));
    expect(vinculo?.tenantId, mensaje).toBe(TENANT_TEMPLO);

    // Doble lado: el coach legacy NO aparece entre los del gimnasio 2.
    expect(
      await idsDelGimnasio(app, "users", TENANT_DOS),
      mensaje,
    ).not.toContain(coachId);
  });

  it("Test 11: createTestMember SIN tenantId escribe en El Templo y sigue pasando por POST /api/auth/register", async () => {
    const socio = await createTestMember(app, {});

    const filas = await consultar<{ t: number; gender: string | null }>(
      app,
      sql`SELECT tenant_id AS t, gender FROM users WHERE id = ${socio.id}`,
    );
    const fila = filas[0];

    expect(
      fila === undefined ? null : Number(fila.t),
      `\`createTestMember\` SIN \`tenantId\` dejó de escribir en El Templo (${TENANT_TEMPLO}). Mismo ` +
        `riesgo que el helper de staff: es el default del que dependen los ~215 archivos previos.`,
    ).toBe(TENANT_TEMPLO);

    // `gender` es el discriminador honesto entre los dos caminos del helper: la
    // ruta `/auth/register` lo persiste (el payload de `registerUser` manda
    // "male"), y el INSERT directo del camino del gimnasio 2 NO toca la columna
    // salvo override explícito (WR-04) — y esta llamada no pasa ninguno, así
    // que dejaría NULL. Un NULL acá significa que el helper se fue por la
    // bifurcación equivocada — que es exactamente lo que rompería a los ~215
    // call sites, porque ese camino se saltea los efectos colaterales de
    // register (código de referido, member_profiles, promo code).
    expect(
      fila?.gender,
      `El socio del tenant 1 no pasó por \`POST /api/auth/register\`: la columna \`gender\` quedó en ` +
        `${String(fila?.gender)} en vez de "male". Sin \`tenantId\` (o con 1) el helper TIENE que ir ` +
        `por la ruta pública, byte por byte como antes de la fase 171; el INSERT directo es sólo para ` +
        `gimnasios distintos de El Templo, y usarlo acá dejaría a los tests existentes sin los efectos ` +
        `colaterales de register.`,
    ).toBe("male");

    expect(
      pareceJwt(socio.token),
      `\`createTestMember\` devolvió un token que no parece un JWT: los call sites previos lo usan ` +
        `directo como \`authorization\`.`,
    ).toBe(true);

    expect(
      await idsDelGimnasio(app, "users", TENANT_DOS),
      `El socio del tenant 1 apareció entre los usuarios del gimnasio ${TENANT_DOS}.`,
    ).not.toContain(socio.id);
  });
});

describe("C. higiene del archivo (D-05)", () => {
  it("Test 12: limpiarSegundoGimnasio no deja rastro del gimnasio 2 y no toca El Templo", async () => {
    await limpiarSegundoGimnasio(app);

    expect(
      await contarTenant(app, TENANT_DOS),
      `Quedó la fila de \`tenants\` del gimnasio ${TENANT_DOS} después de limpiar. La base la ` +
        `comparten todos los archivos del mismo worker (\`isolate: false\`), así que un residuo ` +
        `contamina los ~232 archivos que corren después en ese fork (T-171-17), y la siembra ` +
        `siguiente chocaría con su propia PK.`,
    ).toBe(0);

    for (const tabla of TABLAS_DEL_ESPEJO) {
      expect(
        await idsDelGimnasio(app, tabla, TENANT_DOS),
        `Quedaron filas de \`${tabla}\` del gimnasio ${TENANT_DOS} después de limpiar. Los 8 DELETE ` +
          `de \`limpiarSegundoGimnasio\` van en orden de FK con los checks ENCENDIDOS: si se agrega una ` +
          `pieza al fixture hay que agregarle su DELETE, en la posición correcta.`,
      ).toEqual([]);
    }

    // El Templo intacto: este archivo nunca lo borra.
    const mensajeTemplo =
      `La limpieza del gimnasio ${TENANT_DOS} se llevó puesto a El Templo. Todo DELETE de ` +
      `\`limpiarSegundoGimnasio\` lleva su \`WHERE tenant_id = …\` justamente para que esto no pueda ` +
      `pasar: un DELETE sin filtro rompe la suite entera (T-171-13).`;

    expect(await contarTenant(app, TENANT_TEMPLO), mensajeTemplo).toBe(1);
    expect(
      await idsDelGimnasio(app, "branches", TENANT_TEMPLO),
      mensajeTemplo,
    ).toContain(SEDE_SEMILLA);

    const [adminSemilla] = await app.db
      .select({ id: schema.users.id, tenantId: schema.users.tenantId })
      .from(schema.users)
      .where(eq(schema.users.email, EMAIL_ADMIN_SEMILLA));
    expect(adminSemilla?.tenantId, mensajeTemplo).toBe(TENANT_TEMPLO);
  });

  it("Test 13: la siembra es OPT-IN — test/setup.ts no referencia el fixture", () => {
    const contenido = fs.readFileSync(RUTA_SETUP, "utf-8");

    // Guard: si `setup.ts` se mueve o se renombra, este test tiene que ponerse
    // rojo, no pasar en verde leyendo un archivo vacío o equivocado.
    expect(
      contenido,
      `${RUTA_SETUP} no parece el setup global de vitest (no contiene \`provisionWorkerDB\`). ` +
        `Si el archivo se movió, actualizar RUTA_SETUP: un gate que lee el archivo equivocado no es ` +
        `un gate.`,
    ).toContain("provisionWorkerDB");

    const menciones = ["second-tenant", "seedSecondTenant", "TENANT_DOS"]
      .filter((marca) => contenido.includes(marca))
      .sort();

    expect(
      menciones,
      `\`test/setup.ts\` referencia el fixture del gimnasio 2 (${menciones.join(", ")}). La siembra ` +
        `es OPT-IN POR ARCHIVO (D-05) y no puede enchufarse al setup global: ese setup corre para los ` +
        `~232 archivos de test del repo, así que sembrar el gimnasio 2 ahí les cambiaría los conteos ` +
        `a todos de golpe y rompería el criterio 4 del ROADMAP ("la suite existente sigue verde sin ` +
        `tocar una línea"). El archivo que necesite el gimnasio 2 llama a \`seedSecondTenant(app)\` en ` +
        `su propio \`beforeEach\` (después de \`cleanAllTestData\`) y a \`limpiarSegundoGimnasio(app)\` ` +
        `en su \`afterAll\`. No hay atajo global.`,
    ).toEqual([]);
  });
});
