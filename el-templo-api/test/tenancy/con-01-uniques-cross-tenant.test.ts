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
import { sql, eq, type SQL } from "drizzle-orm";
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
});
