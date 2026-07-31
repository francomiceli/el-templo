/**
 * Fase 168 Plan 04 (CON-01): los contratos de unicidad, probados por
 * COMPORTAMIENTO.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * La fase 168 ya tiene dos redes de seguridad estructurales: la introspección
 * de `INFORMATION_SCHEMA` (que prueba que el DDL de la migración 0196 quedó
 * escrito) y el verificador fail-closed `src/db/scripts/verify-tenant-uniques.ts`
 * (que prueba que ninguna unique global quedó sin clasificar). Las dos miran
 * METADATA. Ninguna de las dos prueba que el contrato que le importa al staff
 * siga vivo.
 *
 * Este archivo lo prueba con inserts reales, en las DOS direcciones, y las dos
 * mitades valen lo mismo:
 *
 *   1. ACEPTA cross-tenant — un segundo gimnasio puede usar el mismo email,
 *      DNI, código de referido, código de sede, centro de costo, código promo,
 *      baja de campaña, template key, modo de día, feriado, formato y nombre de
 *      plan que El Templo. Es lo que la fase 168 vino a habilitar.
 *   2. RECHAZA intra-tenant — repetir cualquiera de esos valores DENTRO del
 *      mismo tenant sigue explotando con duplicado, exactamente igual que ayer.
 *      Este es el criterio 5 del ROADMAP: cero cambio de comportamiento para el
 *      staff. Si el alta de alumno dejara de rechazar un DNI repetido, la
 *      conversión de la unique habría sido una regresión disfrazada de feature.
 *
 * LAS DOS TRAMPAS DE ESTE ARCHIVO
 * -------------------------------
 * (a) `tenant_id` tiene DEFAULT 1 desde la fase 167. Un insert que se OLVIDE de
 *     estampar `tenantId` cae en el tenant 1 sin avisar: el test pasaría en
 *     verde probando exactamente nada. Por eso TODO insert de acá pasa
 *     `tenantId` explícito, incluso los del tenant 1 (T-168-15).
 * (b) Una aserción de rechazo que acepte "falló por lo que sea" pasa en verde
 *     con una FK rota, una columna faltante o un enum mal escrito. Por eso el
 *     helper `esperarRechazoPorDuplicado` exige específicamente el duplicado de
 *     MySQL (`ER_DUP_ENTRY` / errno 1062) y no cualquier error (T-168-16).
 *
 * ALCANCE
 * -------
 * Los helpers de acá son mínimos y locales al archivo. Las fixtures 2-tenant
 * completas son trabajo de la fase 171 (ISO-03) — no se adelanta esa API ni se
 * agrega nada a `test/helpers.ts`.
 *
 * La ambigüedad de login con emails duplicados cross-tenant queda DIFERIDA por
 * diseño (D-04, doc 06 §1-D): este archivo prueba que la base la ACEPTA y no
 * opina sobre cómo se resuelve el login. Ningún test de acá la bloquea.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, sql, eq, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";

// ─── Constantes de tenant ────────────────────────────────────────────────────
// Ningún número mágico suelto en las aserciones: los dos ids viven acá.
//
// El tenant 1 es El Templo, sembrado por la migración 0190 — existe siempre y
// este archivo NUNCA lo borra ni lo modifica.
const TENANT_TEMPLO = 1;
// Id fijo y ALTO a propósito: no colisiona con el autoincremento de `tenants`
// (que hoy está en 1) ni con ningún id que otra fase pueda sembrar. La fila la
// crea el `beforeAll` de este archivo y la borra su `afterAll`.
const TENANT_SEGUNDO = 90168;

// ─── Detección específica del duplicado de MySQL ─────────────────────────────

interface ErrorDeMySql extends Error {
  code?: unknown;
  errno?: unknown;
  cause?: unknown;
}

/**
 * Busca el duplicado de MySQL (`ER_DUP_ENTRY`, errno 1062) en el error y en su
 * cadena de `cause`, porque el driver puede envolverlo.
 *
 * Devuelve `null` si el error NO es un duplicado — y eso es todo el punto: un
 * `ER_NO_REFERENCED_ROW_2` (FK rota), un `ER_BAD_FIELD_ERROR` (columna que no
 * existe) o un `ER_NO_DEFAULT_FOR_FIELD` (columna obligatoria sin valor) NO
 * pueden hacer pasar una aserción de rechazo por unicidad.
 */
function buscarDuplicado(err: unknown): { code: string; errno: number } | null {
  let actual: unknown = err;
  for (let profundidad = 0; profundidad < 5; profundidad += 1) {
    if (!(actual instanceof Error)) return null;
    const candidato = actual as ErrorDeMySql;
    const code = typeof candidato.code === "string" ? candidato.code : "";
    const errno = typeof candidato.errno === "number" ? candidato.errno : 0;
    if (
      code === "ER_DUP_ENTRY" ||
      errno === 1062 ||
      /Duplicate entry/i.test(candidato.message)
    ) {
      return { code, errno };
    }
    actual = candidato.cause;
  }
  return null;
}

function describirError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const e = err as ErrorDeMySql;
  const code = typeof e.code === "string" ? e.code : "sin code";
  const errno = typeof e.errno === "number" ? e.errno : 0;
  return `${code} / errno ${errno} / ${e.message}`;
}

/**
 * Ejecuta un insert que TIENE que fallar por violar una unique DENTRO del mismo
 * tenant. Dos aserciones distintas y las dos importan: que falló, y que falló
 * por duplicado.
 */
async function esperarRechazoPorDuplicado(
  contrato: string,
  insertar: () => Promise<unknown>,
): Promise<void> {
  let capturado: unknown = null;
  let paso = false;
  try {
    await insertar();
    paso = true;
  } catch (err: unknown) {
    capturado = err;
  }

  expect(
    paso,
    `${contrato}: MySQL ACEPTÓ un valor repetido DENTRO del mismo tenant. ` +
      `La unique compuesta de la migración 0196 dejó de proteger al tenant 1 — ` +
      `esto es una regresión de comportamiento para el staff (criterio 5 del ROADMAP), ` +
      `no un detalle de tenancy.`,
  ).toBe(false);

  const duplicado = buscarDuplicado(capturado);
  expect(
    duplicado,
    `${contrato}: el insert falló, pero NO por duplicado. Un test que acepte ` +
      `"falló por lo que sea" pasaría en verde con una FK rota o una columna ` +
      `faltante y no probaría el contrato de unicidad. Error real: ` +
      `${describirError(capturado)}`,
  ).not.toBeNull();
}

/**
 * Ejecuta un insert que TIENE que pasar (el mismo valor, en el otro tenant) y
 * devuelve el id generado. Si falla, el mensaje dice qué contrato quedó mal
 * convertido en vez de escupir un stack pelado.
 */
async function esperarAceptaCrossTenant<T>(
  contrato: string,
  insertar: () => Promise<T>,
): Promise<T> {
  try {
    return await insertar();
  } catch (err: unknown) {
    throw new Error(
      `${contrato}: el tenant ${TENANT_SEGUNDO} NO pudo usar el mismo valor que ` +
        `el tenant ${TENANT_TEMPLO}. La unique sigue siendo GLOBAL: la migración ` +
        `0196 no la convirtió, o la convirtió con las columnas en otro orden. ` +
        `Error real: ${describirError(err)}`,
    );
  }
}

// ─── Fixtures locales mínimas ────────────────────────────────────────────────
//
// LAS OCHO EXIGEN `tenantId: number` COMO PRIMER PARÁMETRO, y no es cosmético:
// es la mitigación de T-168-15 movida al compilador. Con el DEFAULT 1 de la
// fase 167, un payload que se olvide del tenant cae en el tenant 1 en silencio
// y el test pasa en verde probando nada. Acá no hay forma de construir el
// payload sin decir de qué tenant es — `tsc` no compila si falta. Eso es más
// fuerte que revisar a ojo que cada insert lo mencione.

/**
 * Payload de `users` con todo lo obligatorio del schema, con `tenantId` SIEMPRE
 * explícito (trampa (a) de la cabecera).
 */
function usuario(
  tenantId: number,
  sucursalId: number,
  campos: { email?: string; dni?: string; referralCode?: string },
) {
  return {
    tenantId,
    branchId: sucursalId,
    passwordHash: "x".repeat(64),
    firstName: "CON01",
    lastName: "Probe",
    role: "member" as const,
    ...campos,
  };
}

/**
 * Payload de `branches` con todo lo obligatorio, con `tenantId` explícito.
 */
function sede(tenantId: number, code: string) {
  return { tenantId, name: `CON-01 sede ${code}`, code };
}

/** Payload de `cost_centers`. El contrato es el PAR (name, country). */
function centroDeCosto(tenantId: number, name: string, country: string) {
  return { tenantId, name, country };
}

/** Payload de `subscription_plans` con todo lo obligatorio del schema. */
function planDeSuscripcion(tenantId: number, name: string, country = "AR") {
  return {
    tenantId,
    name,
    planTier: "flex" as const,
    bookingMode: "flexible" as const,
    planCategory: "presencial" as const,
    priceRegular: 15000,
    priceZero: 10000,
    durationDays: 30,
    classesPerWeek: 3,
    country,
  };
}

/**
 * Payload de `promo_plans`. `subscription_plan_id` es NOT NULL (sin FK física,
 * verificado en 0063), pero se le pasa un plan REAL del mismo tenant: si una
 * fase futura le agrega la FK, este test no se cae por eso.
 */
function promo(tenantId: number, promoCode: string, planId: number) {
  const desde = new Date("2099-01-01T00:00:00Z");
  const hasta = new Date("2099-12-31T00:00:00Z");
  return {
    tenantId,
    name: `CON-01 promo ${promoCode}`,
    promoCode,
    subscriptionPlanId: planId,
    startDate: desde,
    expiryDate: hasta,
  };
}

/**
 * Payload de `campaign_unsubscribes`. `userId` va explícitamente en `null`: la
 * baja solo-email es el caso real que motivó el backfill directo de esta tabla.
 */
function baja(tenantId: number, email: string) {
  return { tenantId, email, userId: null, campaignId: null };
}

/** Payload de `notification_templates` con todo lo obligatorio. */
function template(tenantId: number, templateKey: string) {
  return {
    tenantId,
    templateKey,
    category: "anuncios" as const,
    title: "CON-01",
    body: "Cuerpo de prueba del contrato CON-01",
  };
}

/** Payload de `holidays`. El contrato es el PAR (country, date). */
function feriado(tenantId: number, fecha: string) {
  return {
    tenantId,
    country: "AR",
    date: fecha,
    name: "CON-01 feriado de prueba",
  };
}

/**
 * Borra TODO rastro del tenant de prueba, en orden seguro de FKs.
 *
 * Se usa en el `beforeAll` (defensivo: una corrida anterior abortada podría
 * haber dejado filas) y en el `afterAll` (obligatorio: la base de test la
 * comparten todos los archivos del mismo worker de vitest — `fileParallelism`
 * con `isolate: false` —, así que una fila colgada acá rompe archivos vecinos.
 * Mitigación T-168-17).
 */
async function limpiarTenantSegundo(app: FastifyInstance): Promise<void> {
  const t = TENANT_SEGUNDO;
  // Orden seguro de FKs: primero lo que cuelga de users, después users, después
  // branches (users.branch_id) y al final la raíz `tenants`.
  await app.db
    .delete(schema.campaignUnsubscribes)
    .where(eq(schema.campaignUnsubscribes.tenantId, t));
  await app.db
    .delete(schema.promoPlans)
    .where(eq(schema.promoPlans.tenantId, t));
  await app.db
    .delete(schema.notificationTemplates)
    .where(eq(schema.notificationTemplates.tenantId, t));
  await app.db.delete(schema.dayModes).where(eq(schema.dayModes.tenantId, t));
  await app.db.delete(schema.holidays).where(eq(schema.holidays.tenantId, t));
  await app.db.delete(schema.formats).where(eq(schema.formats.tenantId, t));
  await app.db
    .delete(schema.costCenters)
    .where(eq(schema.costCenters.tenantId, t));
  await app.db
    .delete(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.tenantId, t));
  await app.db.delete(schema.users).where(eq(schema.users.tenantId, t));
  await app.db.delete(schema.branches).where(eq(schema.branches.tenantId, t));
  await app.db.delete(schema.tenants).where(eq(schema.tenants.id, t));
}

async function contar(app: FastifyInstance, statement: SQL): Promise<number> {
  const resultado = (await app.db.execute(statement)) as unknown as [
    Array<{ n: number }>,
  ];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as Array<{ n: number }>);
  return Number(filas?.[0]?.n ?? -1);
}

describe("CON-01 — los contratos de unicidad por comportamiento (cross-tenant vs intra-tenant)", () => {
  let app: FastifyInstance;
  let sedeTemplo: number;
  let sedeSegundo: number;

  beforeAll(async () => {
    app = await createTestApp();

    // Defensivo: si una corrida anterior murió a mitad, el tenant de prueba
    // podría seguir vivo y el INSERT de abajo fallaría por PK duplicada.
    await limpiarTenantSegundo(app);

    await app.db.insert(schema.tenants).values({
      id: TENANT_SEGUNDO,
      name: "Gimnasio de prueba CON-01",
      slug: `con01-tenant-${TENANT_SEGUNDO}`,
      status: "active",
    });

    // La sede del tenant 1 la siembra test/setup.ts. Se usa la presencial.
    const sedes = (await app.db.select().from(schema.branches)) as Array<{
      id: number;
      code: string;
      tenantId: number;
    }>;
    const presencial = sedes.find(
      (b) => b.code !== "ONLINE" && b.tenantId === TENANT_TEMPLO,
    );
    if (!presencial) {
      throw new Error(
        "Fixture faltante: no hay sede presencial del tenant 1 en la base de test",
      );
    }
    sedeTemplo = presencial.id;

    // La sede del tenant 2 vive todo el archivo: `branches` NO está en
    // TABLES_TO_CLEAN, así que sobrevive al `cleanAllTestData` del beforeEach.
    // La borra `limpiarTenantSegundo` en el afterAll.
    const [creada] = await app.db
      .insert(schema.branches)
      .values(sede(TENANT_SEGUNDO, "CON01T2"))
      .$returningId();
    sedeSegundo = creada.id;
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await limpiarTenantSegundo(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // ─── users.email ──────────────────────────────────────────────────────────
  describe("users.email — uq_users_tenant_email", () => {
    const EMAIL = "con01-mismo-email@tenancy.test";

    it("el mismo email existe en los dos tenants, y repetirlo dentro del tenant 1 sigue rechazando", async () => {
      await app.db
        .insert(schema.users)
        .values(usuario(TENANT_TEMPLO, sedeTemplo, { email: EMAIL }));

      // ACEPTA cross-tenant. D-04: la ambigüedad de login que esto habilita es
      // una decisión DIFERIDA por diseño — acá solo se prueba que la base lo
      // permite.
      await esperarAceptaCrossTenant("users.email", () =>
        app.db
          .insert(schema.users)
          .values(usuario(TENANT_SEGUNDO, sedeSegundo, { email: EMAIL })),
      );

      const enLosDos = await contar(
        app,
        sql`SELECT COUNT(*) AS n FROM users WHERE email = ${EMAIL}`,
      );
      expect(
        enLosDos,
        "El mismo email tiene que existir una vez por tenant: dos filas en total",
      ).toBe(2);

      // RECHAZA intra-tenant: el alta de alumno sigue frenando el email repetido.
      await esperarRechazoPorDuplicado("users.email", () =>
        app.db
          .insert(schema.users)
          .values(usuario(TENANT_TEMPLO, sedeTemplo, { email: EMAIL })),
      );
    });
  });

  // ─── users.dni ────────────────────────────────────────────────────────────
  describe("users.dni — uq_users_tenant_dni", () => {
    const DNI = "CON0130111222";

    it("el mismo DNI existe en los dos tenants, y repetirlo dentro del tenant 1 sigue rechazando", async () => {
      await app.db.insert(schema.users).values(
        usuario(TENANT_TEMPLO, sedeTemplo, {
          email: "con01-dni-t1@tenancy.test",
          dni: DNI,
        }),
      );

      await esperarAceptaCrossTenant("users.dni", () =>
        app.db.insert(schema.users).values(
          usuario(TENANT_SEGUNDO, sedeSegundo, {
            email: "con01-dni-t2@tenancy.test",
            dni: DNI,
          }),
        ),
      );

      const enLosDos = await contar(
        app,
        sql`SELECT COUNT(*) AS n FROM users WHERE dni = ${DNI}`,
      );
      expect(enLosDos, "El mismo DNI, una vez por tenant").toBe(2);

      // Este es el contrato que `members/service.ts:908` documenta como carrera
      // de unicidad (T-148-02): NO puede cambiar para el tenant 1.
      await esperarRechazoPorDuplicado("users.dni", () =>
        app.db.insert(schema.users).values(
          usuario(TENANT_TEMPLO, sedeTemplo, {
            email: "con01-dni-t1-bis@tenancy.test",
            dni: DNI,
          }),
        ),
      );
    });
  });

  // ─── users.referral_code ──────────────────────────────────────────────────
  describe("users.referral_code — uq_users_tenant_referral_code", () => {
    const CODIGO = "CON01REF";

    it("el mismo código de referido existe en los dos tenants, y repetirlo dentro del tenant 1 sigue rechazando", async () => {
      await app.db.insert(schema.users).values(
        usuario(TENANT_TEMPLO, sedeTemplo, {
          email: "con01-ref-t1@tenancy.test",
          referralCode: CODIGO,
        }),
      );

      await esperarAceptaCrossTenant("users.referral_code", () =>
        app.db.insert(schema.users).values(
          usuario(TENANT_SEGUNDO, sedeSegundo, {
            email: "con01-ref-t2@tenancy.test",
            referralCode: CODIGO,
          }),
        ),
      );

      const enLosDos = await contar(
        app,
        sql`SELECT COUNT(*) AS n FROM users WHERE referral_code = ${CODIGO}`,
      );
      expect(enLosDos, "El mismo código de referido, una vez por tenant").toBe(
        2,
      );

      await esperarRechazoPorDuplicado("users.referral_code", () =>
        app.db.insert(schema.users).values(
          usuario(TENANT_TEMPLO, sedeTemplo, {
            email: "con01-ref-t1-bis@tenancy.test",
            referralCode: CODIGO,
          }),
        ),
      );
    });
  });

  // ─── branches.code ────────────────────────────────────────────────────────
  describe("branches.code — uq_branches_tenant_code", () => {
    const CODE = "CON01SEDE";

    it("el mismo código de sede existe en los dos tenants, y repetirlo dentro del tenant 1 sigue rechazando", async () => {
      const creadas: number[] = [];
      try {
        const [t1] = await app.db
          .insert(schema.branches)
          .values(sede(TENANT_TEMPLO, CODE))
          .$returningId();
        creadas.push(t1.id);

        const [t2] = await esperarAceptaCrossTenant("branches.code", () =>
          app.db
            .insert(schema.branches)
            .values(sede(TENANT_SEGUNDO, CODE))
            .$returningId(),
        );
        creadas.push(t2.id);

        const enLosDos = await contar(
          app,
          sql`SELECT COUNT(*) AS n FROM branches WHERE code = ${CODE}`,
        );
        expect(enLosDos, "El mismo código de sede, una vez por tenant").toBe(2);

        await esperarRechazoPorDuplicado("branches.code", () =>
          app.db.insert(schema.branches).values(sede(TENANT_TEMPLO, CODE)),
        );
      } finally {
        // `branches` NO está en TABLES_TO_CLEAN: las filas se borran acá o
        // quedan colgadas para los archivos vecinos del mismo worker.
        for (const id of creadas) {
          await app.db
            .delete(schema.branches)
            .where(eq(schema.branches.id, id));
        }
      }
    });
  });

  // ─── cost_centers (name, country) ─────────────────────────────────────────
  describe("cost_centers (name, country) — uq_cost_centers_tenant_name_country", () => {
    const NOMBRE = "CON-01 Centro de costo";

    it("el mismo par (nombre, país) existe en los dos tenants, y repetirlo dentro del tenant 1 sigue rechazando", async () => {
      try {
        await app.db
          .insert(schema.costCenters)
          .values(centroDeCosto(TENANT_TEMPLO, NOMBRE, "AR"));

        await esperarAceptaCrossTenant("cost_centers (name, country)", () =>
          app.db
            .insert(schema.costCenters)
            .values(centroDeCosto(TENANT_SEGUNDO, NOMBRE, "AR")),
        );

        // Fase 172: `cost_centers` es strict, y este COUNT es global A
        // PROPOSITO — contar las filas de LOS DOS gimnasios es exactamente lo
        // que la asercion compra. Acotarlo por tenant lo volveria tautologico
        // (contaria 1 por definicion), asi que la salida honesta es la exencion
        // anotada, la misma regla que el 172-13 dejo escrita: global a
        // proposito -> exencion; acotable -> filtro.
        const enLosDos = await contar(
          app,
          sql`SELECT /* tenant-safe: la asercion cross-tenant necesita contar los dos gimnasios */ COUNT(*) AS n FROM cost_centers WHERE name = ${NOMBRE} AND country = 'AR'`,
        );
        expect(enLosDos, "El mismo centro de costo, una vez por tenant").toBe(
          2,
        );

        // El contrato es COMPUESTO: el mismo nombre en OTRO país sigue siendo
        // legal dentro del mismo tenant, igual que antes de la 0196. Sin esta
        // aserción, un contrato degradado a (tenant_id, name) pasaría en verde.
        await esperarAceptaCrossTenant(
          "cost_centers (name, country) — mismo nombre, otro país",
          () =>
            app.db
              .insert(schema.costCenters)
              .values(centroDeCosto(TENANT_TEMPLO, NOMBRE, "ES")),
        );

        // Rechazo con el PAR COMPLETO repetido: cambiar solo una de las dos
        // columnas no probaría el contrato compuesto.
        await esperarRechazoPorDuplicado("cost_centers (name, country)", () =>
          app.db
            .insert(schema.costCenters)
            .values(centroDeCosto(TENANT_TEMPLO, NOMBRE, "AR")),
        );
      } finally {
        // `cost_centers` NO está en TABLES_TO_CLEAN (y además viene seedeada por
        // las migraciones 0161/0163/0165): se borran SOLO las filas de este test.
        //
        // Fase 172: el barrido es cross-tenant a proposito — este bloque sembro
        // en El Templo (AR y ES) y en el gimnasio 2, y el nombre `NOMBRE` es de
        // uso exclusivo de este test. Acotarlo por gimnasio dejaria filas vivas
        // para los archivos vecinos del mismo worker (`isolate: false`), que es
        // justo el bug que el `finally` existe para no tener.
        await app.db
          .delete(schema.costCenters)
          .where(
            and(
              sql`/* tenant-safe: limpieza cross-tenant de las filas que sembro este mismo test */ 1 = 1`,
              eq(schema.costCenters.name, NOMBRE),
            ),
          );
      }
    });
  });

  // ─── promo_plans.promo_code ───────────────────────────────────────────────
  describe("promo_plans.promo_code — uq_promo_plans_tenant_promo_code", () => {
    const PROMO = "CON01PROMO";

    it("el mismo código promo existe en los dos tenants, y repetirlo dentro del tenant 1 sigue rechazando", async () => {
      const [planT1] = await app.db
        .insert(schema.subscriptionPlans)
        .values(planDeSuscripcion(TENANT_TEMPLO, "CON-01 Plan para promo"))
        .$returningId();
      const [planT2] = await app.db
        .insert(schema.subscriptionPlans)
        .values(planDeSuscripcion(TENANT_SEGUNDO, "CON-01 Plan para promo"))
        .$returningId();

      await app.db
        .insert(schema.promoPlans)
        .values(promo(TENANT_TEMPLO, PROMO, planT1.id));

      await esperarAceptaCrossTenant("promo_plans.promo_code", () =>
        app.db
          .insert(schema.promoPlans)
          .values(promo(TENANT_SEGUNDO, PROMO, planT2.id)),
      );

      const enLosDos = await contar(
        app,
        sql`SELECT COUNT(*) AS n FROM promo_plans WHERE promo_code = ${PROMO}`,
      );
      expect(enLosDos, "El mismo código promo, una vez por tenant").toBe(2);

      await esperarRechazoPorDuplicado("promo_plans.promo_code", () =>
        app.db
          .insert(schema.promoPlans)
          .values(promo(TENANT_TEMPLO, PROMO, planT1.id)),
      );
    });
  });

  // ─── campaign_unsubscribes.email (mina M3) ────────────────────────────────
  describe("campaign_unsubscribes.email — uq_campaign_unsubscribes_tenant_email (mina M3)", () => {
    const EMAIL = "con01-baja@tenancy.test";

    /**
     * MINA M3 (doc 05 §6 + doc 06 §8-Q5). Esta es la conversión donde el bug
     * era CUALITATIVAMENTE peor que una colisión molesta: con la unique global
     * sobre `email`, una baja de campañas en UN gimnasio suprimía los envíos de
     * TODOS los gimnasios de la plataforma. No era un duplicate-key al alta —
     * era supresión silenciosa de marketing ajeno.
     */
    it("el mismo email de baja existe en los dos tenants: una baja en un gimnasio ya no suprime los envíos del otro", async () => {
      await app.db
        .insert(schema.campaignUnsubscribes)
        .values(baja(TENANT_TEMPLO, EMAIL));

      await esperarAceptaCrossTenant("campaign_unsubscribes.email", () =>
        app.db
          .insert(schema.campaignUnsubscribes)
          .values(baja(TENANT_SEGUNDO, EMAIL)),
      );

      const enLosDos = await contar(
        app,
        sql`SELECT COUNT(*) AS n FROM campaign_unsubscribes WHERE email = ${EMAIL}`,
      );
      expect(
        enLosDos,
        "La misma baja, una vez por tenant — si diera 1, la supresión sigue siendo global (mina M3 abierta)",
      ).toBe(2);

      await esperarRechazoPorDuplicado("campaign_unsubscribes.email", () =>
        app.db
          .insert(schema.campaignUnsubscribes)
          .values(baja(TENANT_TEMPLO, EMAIL)),
      );
    });

    it("la baja solo-email (user_id NULL) respeta el mismo contrato por tenant", async () => {
      const SOLO_EMAIL = "con01-baja-sin-socio@tenancy.test";

      // `user_id` NULL es la baja de alguien que NO es socio (llegó por un link
      // de unsubscribe). Es el motivo por el que el backfill de tenant_id de
      // esta tabla en la fase 167 fue DIRECTO a 1 y no derivado del socio: no
      // hay socio del que derivarlo.
      await app.db
        .insert(schema.campaignUnsubscribes)
        .values(baja(TENANT_TEMPLO, SOLO_EMAIL));

      const sinSocio = await contar(
        app,
        sql`SELECT COUNT(*) AS n FROM campaign_unsubscribes
            WHERE email = ${SOLO_EMAIL} AND user_id IS NULL`,
      );
      expect(sinSocio, "La baja solo-email se guarda con user_id NULL").toBe(1);

      await esperarAceptaCrossTenant(
        "campaign_unsubscribes.email (user_id NULL)",
        () =>
          app.db
            .insert(schema.campaignUnsubscribes)
            .values(baja(TENANT_SEGUNDO, SOLO_EMAIL)),
      );

      await esperarRechazoPorDuplicado(
        "campaign_unsubscribes.email (user_id NULL)",
        () =>
          app.db
            .insert(schema.campaignUnsubscribes)
            .values(baja(TENANT_TEMPLO, SOLO_EMAIL)),
      );
    });
  });

  // ─── notification_templates.template_key ──────────────────────────────────
  describe("notification_templates.template_key — uq_notification_templates_tenant_key", () => {
    const CLAVE = "con01_template_key";

    it("la misma clave de template existe en los dos tenants, y repetirla dentro del tenant 1 sigue rechazando", async () => {
      await app.db
        .insert(schema.notificationTemplates)
        .values(template(TENANT_TEMPLO, CLAVE));

      await esperarAceptaCrossTenant(
        "notification_templates.template_key",
        () =>
          app.db
            .insert(schema.notificationTemplates)
            .values(template(TENANT_SEGUNDO, CLAVE)),
      );

      const enLosDos = await contar(
        app,
        sql`SELECT COUNT(*) AS n FROM notification_templates WHERE template_key = ${CLAVE}`,
      );
      expect(
        enLosDos,
        "Cada gimnasio tiene su propio juego de templates con las mismas claves",
      ).toBe(2);

      await esperarRechazoPorDuplicado(
        "notification_templates.template_key",
        () =>
          app.db
            .insert(schema.notificationTemplates)
            .values(template(TENANT_TEMPLO, CLAVE)),
      );
    });
  });

  // ─── day_modes.day_of_week ────────────────────────────────────────────────
  describe("day_modes.day_of_week — uq_day_modes_tenant_day_of_week", () => {
    // Dominio chico (1=lunes … 6=sábado) y tabla YA POBLADA: la migración 0080
    // sembró las seis filas del tenant 1 y `day_modes` NO está en
    // TABLES_TO_CLEAN, así que sobreviven a todo el archivo. Por eso la "fila
    // del tenant 1" de este contrato es la que YA EXISTE — insertar una nueva
    // chocaría contra el seed y probaría el rechazo por el motivo equivocado.
    const DIA = 1;

    it("el mismo día de la semana existe en los dos tenants, y repetirlo dentro del tenant 1 sigue rechazando", async () => {
      try {
        const seedT1 = await contar(
          app,
          sql`SELECT COUNT(*) AS n FROM day_modes
              WHERE tenant_id = ${TENANT_TEMPLO} AND day_of_week = ${DIA}`,
        );
        expect(
          seedT1,
          "Fixture esperada: la migración 0080 dejó una fila del tenant 1 para este día",
        ).toBe(1);

        await esperarAceptaCrossTenant("day_modes.day_of_week", () =>
          app.db
            .insert(schema.dayModes)
            .values({ tenantId: TENANT_SEGUNDO, dayOfWeek: DIA }),
        );

        await esperarRechazoPorDuplicado("day_modes.day_of_week", () =>
          app.db
            .insert(schema.dayModes)
            .values({ tenantId: TENANT_TEMPLO, dayOfWeek: DIA }),
        );
      } finally {
        // `day_modes` NO está en TABLES_TO_CLEAN: se borra SOLO lo del tenant 2,
        // el seed del tenant 1 queda intacto para los archivos vecinos.
        await app.db
          .delete(schema.dayModes)
          .where(eq(schema.dayModes.tenantId, TENANT_SEGUNDO));
      }
    });
  });

  // ─── holidays (country, date) ─────────────────────────────────────────────
  describe("holidays (country, date) — uq_holidays_tenant_country_date", () => {
    const FECHA = "2099-01-15";

    it("el mismo par (país, fecha) existe en los dos tenants, y repetirlo dentro del tenant 1 sigue rechazando", async () => {
      await app.db
        .insert(schema.holidays)
        .values(feriado(TENANT_TEMPLO, FECHA));

      await esperarAceptaCrossTenant("holidays (country, date)", () =>
        app.db.insert(schema.holidays).values(feriado(TENANT_SEGUNDO, FECHA)),
      );

      const enLosDos = await contar(
        app,
        sql`SELECT COUNT(*) AS n FROM holidays WHERE country = 'AR' AND date = ${FECHA}`,
      );
      expect(enLosDos, "El mismo feriado, una vez por tenant").toBe(2);

      // Contrato COMPUESTO: la misma fecha en OTRO país sigue siendo legal
      // dentro del mismo tenant.
      await esperarAceptaCrossTenant(
        "holidays (country, date) — misma fecha, otro país",
        () =>
          app.db
            .insert(schema.holidays)
            .values({ ...feriado(TENANT_TEMPLO, FECHA), country: "ES" }),
      );

      // Rechazo con el PAR COMPLETO repetido.
      await esperarRechazoPorDuplicado("holidays (country, date)", () =>
        app.db.insert(schema.holidays).values(feriado(TENANT_TEMPLO, FECHA)),
      );
    });
  });

  // ─── formats.name ─────────────────────────────────────────────────────────
  describe("formats.name — uq_formats_tenant_name", () => {
    const NOMBRE = "CON-01 Formato";

    it("el mismo nombre de formato existe en los dos tenants, y repetirlo dentro del tenant 1 sigue rechazando", async () => {
      await app.db
        .insert(schema.formats)
        .values({ tenantId: TENANT_TEMPLO, name: NOMBRE });

      await esperarAceptaCrossTenant("formats.name", () =>
        app.db
          .insert(schema.formats)
          .values({ tenantId: TENANT_SEGUNDO, name: NOMBRE }),
      );

      const enLosDos = await contar(
        app,
        sql`SELECT COUNT(*) AS n FROM formats WHERE name = ${NOMBRE}`,
      );
      expect(enLosDos, "El mismo formato, una vez por tenant").toBe(2);

      await esperarRechazoPorDuplicado("formats.name", () =>
        app.db
          .insert(schema.formats)
          .values({ tenantId: TENANT_TEMPLO, name: NOMBRE }),
      );
    });
  });

  // ─── subscription_plans (name, country) — el 12º contrato ─────────────────
  describe("subscription_plans (name, country) — uq_subscription_plans_tenant_name_country", () => {
    const NOMBRE = "CON-01 Flex";

    /**
     * EL DOCEAVO CONTRATO, que la lista D-01 no tenía.
     *
     * El índice `ux_subscription_plans_name_country` existe en MySQL desde la
     * migración 0091 y nunca se declaró en el schema Drizzle — drift schema↔DB
     * que hizo que el inventario del doc 05 anotara "name NO es unique". Lo
     * encontró el verificador fail-closed del plan 168-03 y Franco decidió el
     * 2026-07-27 convertirlo DENTRO de la misma 0196 (opción A), porque staging
     * y prod están en 0195 y nunca vieron ese archivo.
     *
     * Sin esta conversión, un segundo gimnasio en AR que quisiera vender un
     * plan llamado "Flex", "Foundation" o "Clase unica" —los nombres que hoy
     * usa El Templo— recibiría un duplicate-key al darlo de alta. Era un bloqueo
     * real del onboarding del tenant 2, no una molestia teórica.
     */
    it("el mismo par (nombre, país) de plan existe en los dos tenants, y repetirlo dentro del tenant 1 sigue rechazando", async () => {
      await app.db
        .insert(schema.subscriptionPlans)
        .values(planDeSuscripcion(TENANT_TEMPLO, NOMBRE, "AR"));

      await esperarAceptaCrossTenant("subscription_plans (name, country)", () =>
        app.db
          .insert(schema.subscriptionPlans)
          .values(planDeSuscripcion(TENANT_SEGUNDO, NOMBRE, "AR")),
      );

      const enLosDos = await contar(
        app,
        sql`SELECT COUNT(*) AS n FROM subscription_plans WHERE name = ${NOMBRE} AND country = 'AR'`,
      );
      expect(enLosDos, "El mismo plan, una vez por tenant").toBe(2);

      await esperarRechazoPorDuplicado(
        "subscription_plans (name, country)",
        () =>
          app.db
            .insert(schema.subscriptionPlans)
            .values(planDeSuscripcion(TENANT_TEMPLO, NOMBRE, "AR")),
      );
    });
  });

  // ─── Cierre: cero contaminación ───────────────────────────────────────────
  it("cierre: ninguna fila del tenant 2 queda colgada y el tenant 1 sigue entero", async () => {
    // Nueve tablas físicas para once contratos (users aporta tres) más
    // `branches`, que se chequea aparte por la sede sembrada en el beforeAll.
    const tablas = [
      "users",
      "cost_centers",
      "promo_plans",
      "campaign_unsubscribes",
      "notification_templates",
      "day_modes",
      "holidays",
      "formats",
      "subscription_plans",
    ];

    const colgadas: string[] = [];
    for (const tabla of tablas) {
      const n = await contar(
        app,
        sql.raw(
          `SELECT COUNT(*) AS n FROM \`${tabla}\` WHERE tenant_id = ${TENANT_SEGUNDO}`,
        ),
      );
      if (n !== 0) colgadas.push(`${tabla}: ${n} fila(s)`);
    }

    expect(
      colgadas,
      `Filas del tenant ${TENANT_SEGUNDO} colgadas después de los contratos. La base ` +
        `de test la comparten todos los archivos del mismo worker de vitest ` +
        `(fileParallelism con isolate: false): una fila acá rompe archivos vecinos ` +
        `por motivos que no tienen nada que ver con lo que están probando.`,
    ).toEqual([]);

    // `branches` es la excepción DOCUMENTADA: la única fila del tenant 2 que
    // puede quedar es la sede sembrada en el beforeAll, que borra el afterAll.
    const sedesSegundo = await contar(
      app,
      sql`SELECT COUNT(*) AS n FROM branches WHERE tenant_id = ${TENANT_SEGUNDO}`,
    );
    expect(
      sedesSegundo,
      "La única sede del tenant 2 tiene que ser la del beforeAll — las de los contratos se borran en su finally",
    ).toBe(1);

    // El tenant 1 sigue entero: este archivo nunca lo borró ni lo modificó.
    const templo = await contar(
      app,
      sql`SELECT COUNT(*) AS n FROM tenants WHERE id = ${TENANT_TEMPLO} AND slug = 'el-templo'`,
    );
    expect(templo, "El Templo (tenant 1) sigue siendo el tenant 1").toBe(1);

    const totalTenants = await contar(
      app,
      sql`SELECT COUNT(*) AS n FROM tenants`,
    );
    expect(
      totalTenants,
      "Dos tenants mientras corre el archivo (El Templo + el de prueba). El afterAll devuelve la base a uno solo.",
    ).toBe(2);
  });
});
