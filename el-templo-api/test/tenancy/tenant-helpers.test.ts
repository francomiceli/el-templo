/**
 * Fase 169 Plan 01 (CON-03/CON-04): los cinco helpers de `shared/tenant.ts`,
 * probados por COMPORTAMIENTO.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * `src/modules/shared/tenant.ts` es la única API de tenancy del sistema: los 8
 * planes siguientes de la fase (los 7 crons, el webhook de Wellhub, el helper
 * CLI) importan de ahí, y las fases de adopción 172-175 van a migrar los
 * services a esos mismos helpers. Si la firma o el fail-closed están mal acá,
 * están mal en todos lados a la vez. Por eso las aserciones no miran tipos:
 * insertan y leen contra MySQL real.
 *
 * LO QUE SE AFIRMA
 * ----------------
 *   1. `tenantValues` no muta su entrada y el gimnasio del scope PISA cualquier
 *      `tenantId` que viniera en `values` (mitigación de mass-assignment,
 *      T-169-02).
 *   2. `tenantWhere` produce un filtro que nombra `tenant_id` y, contra la base,
 *      devuelve sólo las filas del gimnasio pedido (T-169-01).
 *   3. `assertTenant` devuelve el contexto con un id numérico y corta con 403
 *      `TENANT_UNRESOLVED` cuando el scope trae `null` — nunca "todos los
 *      gimnasios", nunca un default numérico.
 *   4. `listActiveTenants` incluye el segundo gimnasio mientras está `active` y
 *      lo excluye con `suspended` Y con `archived` (T-169-03: la comparación es
 *      positiva contra 'active', así que un estado futuro del enum también
 *      quedaría afuera).
 *   5. `forEachActiveTenant` corre el callback una vez por gimnasio activo y,
 *      cuando falla para uno, lo loguea con `tenantId` estructurado y SIGUE con
 *      el siguiente (D-03, T-169-04).
 *
 * LA TRAMPA DEL DEFAULT 1 (T-168-15)
 * ----------------------------------
 * `tenant_id` tiene DEFAULT 1 desde la fase 167. Un insert que se OLVIDE de
 * estampar `tenantId` cae en el tenant 1 sin avisar: el test pasaría en verde
 * probando exactamente nada. Por eso TODO insert de este archivo pasa
 * `tenantId` explícito, incluso los del tenant 1 — y lo hace a través de
 * `tenantValues`, que es justamente el helper bajo prueba.
 *
 * ALCANCE
 * -------
 * Los helpers de acá son mínimos y locales al archivo. Las fixtures 2-tenant
 * completas son trabajo de la fase 171 (ISO-03) — no se adelanta esa API ni se
 * agrega nada a `test/helpers.ts`.
 *
 * ⚠️ Higiene obligatoria: la DB de test es por worker y compartida entre
 * archivos del mismo fork (`isolate: false`, `vitest.config.ts:33-40`). Dejar el
 * tenant 1 suspendido rompería TODOS los tests siguientes del worker — de ahí el
 * `afterEach` incondicional. Y este archivo NO usa `cleanAllTestData`: es
 * admin-global y no está scopeada por tenant (warning heredado del 168-REVIEW),
 * así que la limpieza de acá es local y explícita.
 *
 * Correr SOLO este archivo: más de uno a la vez revienta el timeout de 120 s del
 * provisioning en esta máquina.
 *   npx vitest run test/tenancy/tenant-helpers.test.ts --no-file-parallelism
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { sql, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  tenantValues,
  assertTenant,
  listActiveTenants,
  forEachActiveTenant,
  TENANT_UNRESOLVED,
  type TenantContext,
  type TenantLogger,
} from "../../src/modules/shared/tenant";

// ─── Constantes de tenant ────────────────────────────────────────────────────
// Ningún número mágico suelto en las aserciones: los dos ids viven acá.
//
// El tenant 1 es El Templo, sembrado por la migración 0190 — existe siempre y
// este archivo NUNCA lo borra.
const TENANT_TEMPLO = 1;
// Id fijo y ALTO a propósito: no colisiona con el autoincremento de `tenants`
// (que hoy está en 1) ni con el 90168 que usa
// `test/tenancy/con-01-uniques-cross-tenant.test.ts` — dos archivos del mismo
// worker que usaran el mismo id se pisarían (`isolate: false`). La fila la crea
// el `beforeAll` de este archivo y la borra su `afterAll`.
const TENANT_SEGUNDO = 90169;

const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_SEGUNDO: TenantContext = { tenantId: TENANT_SEGUNDO };

// ─── Filas de prueba en `aura_config` ────────────────────────────────────────
// `aura_config` es gym-owned y tiene pocas FKs, así que sirve para probar el
// filtro sin arrastrar medio schema.
//
// ⚠️ `aura_config.source_type` sigue siendo una unique GLOBAL (deuda consciente
// del módulo Aura, registrada con motivo en `TENANT_UNIQUE_ALLOWLIST`), así que
// los dos gimnasios NO pueden compartir el mismo `source_type`. Por eso cada uno
// usa el suyo. Los dos valores elegidos no los usa ningún otro archivo de test.
const SOURCE_TEMPLO = "program_completion" as const;
const SOURCE_SEGUNDO = "program_week_completion" as const;
const SOURCES_DEL_ARCHIVO = [SOURCE_TEMPLO, SOURCE_SEGUNDO];

// ─── Logger falso ────────────────────────────────────────────────────────────

interface LlamadaDeLog {
  obj: Record<string, unknown>;
  msg: string;
}

interface LoggerCapturado {
  log: TenantLogger;
  info: LlamadaDeLog[];
  warn: LlamadaDeLog[];
  error: LlamadaDeLog[];
}

/**
 * `TenantLogger` es una interfaz estructural mínima justamente para poder
 * hacer esto: capturar las llamadas sin montar pino ni Fastify. El sweep real
 * recibe el `pino()` de cada job.
 */
function crearLoggerCapturado(): LoggerCapturado {
  const info: LlamadaDeLog[] = [];
  const warn: LlamadaDeLog[] = [];
  const error: LlamadaDeLog[] = [];
  return {
    info,
    warn,
    error,
    log: {
      info: (obj, msg) => {
        info.push({ obj, msg });
      },
      warn: (obj, msg) => {
        warn.push({ obj, msg });
      },
      error: (obj, msg) => {
        error.push({ obj, msg });
      },
    },
  };
}

// ─── Utilidades locales ──────────────────────────────────────────────────────

async function setTenantStatus(
  app: FastifyInstance,
  tenantId: number,
  status: string,
): Promise<void> {
  await app.db.execute(
    sql`UPDATE tenants SET status = ${status} WHERE id = ${tenantId}`,
  );
}

/**
 * Borra TODO rastro de este archivo, en orden seguro de FKs: primero las filas
 * de `aura_config` (que apuntan a `tenants` por `tenant_id`) y después la raíz.
 *
 * Corre en el `beforeAll` (defensivo: una corrida anterior abortada podría
 * haber dejado filas colgadas) y en el `afterAll` (obligatorio: la base la
 * comparten todos los archivos del mismo worker).
 */
async function limpiarRastro(app: FastifyInstance): Promise<void> {
  await app.db
    .delete(schema.auraConfig)
    .where(inArray(schema.auraConfig.sourceType, SOURCES_DEL_ARCHIVO));
  await app.db.execute(sql`DELETE FROM tenants WHERE id = ${TENANT_SEGUNDO}`);
}

async function contarTenant(
  app: FastifyInstance,
  tenantId: number,
): Promise<number> {
  const resultado = (await app.db.execute(
    sql`SELECT COUNT(*) AS n FROM tenants WHERE id = ${tenantId}`,
  )) as unknown as [Array<{ n: number }>];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as Array<{ n: number }>);
  return Number(filas?.[0]?.n ?? -1);
}

let app: FastifyInstance;
let idFilaTemplo: number;
let idFilaSegundo: number;

beforeAll(async () => {
  app = await createTestApp();

  await limpiarRastro(app);

  await app.db.insert(schema.tenants).values({
    id: TENANT_SEGUNDO,
    name: "Gimnasio de prueba 169-01",
    slug: `test-169-helpers-${TENANT_SEGUNDO}`,
    status: "active",
  });

  // Los DOS inserts pasan por `tenantValues`, o sea que estampan `tenantId`
  // explícito — incluido el del tenant 1 (T-168-15). Un insert sin la columna
  // caería en el DEFAULT 1 y el test del filtro pasaría en verde probando nada.
  const [filaTemplo] = await app.db
    .insert(schema.auraConfig)
    .values(
      tenantValues(CTX_TEMPLO, {
        sourceType: SOURCE_TEMPLO,
        defaultAmount: 11,
        description: "169-01 fila del tenant 1",
      }),
    )
    .$returningId();
  idFilaTemplo = filaTemplo.id;

  const [filaSegundo] = await app.db
    .insert(schema.auraConfig)
    .values(
      tenantValues(CTX_SEGUNDO, {
        sourceType: SOURCE_SEGUNDO,
        defaultAmount: 22,
        description: "169-01 fila del segundo gimnasio",
      }),
    )
    .$returningId();
  idFilaSegundo = filaSegundo.id;
});

// Red incondicional: pase lo que pase en un test, el worker sigue con los dos
// gimnasios operativos. Sin esto, un test que deje el tenant 1 suspendido rompe
// TODOS los archivos siguientes del mismo worker.
afterEach(async () => {
  await setTenantStatus(app, TENANT_TEMPLO, "active");
  await setTenantStatus(app, TENANT_SEGUNDO, "active");
});

afterAll(async () => {
  await setTenantStatus(app, TENANT_TEMPLO, "active");
  await limpiarRastro(app);
  await app.close();
});

describe("tenantValues — el gimnasio sale del scope, no de los values (T-169-02)", () => {
  it("Test 1: estampa el tenant del scope y NO muta el objeto de entrada", () => {
    const entrada = { sourceType: "x", defaultAmount: 3 };

    const salida = tenantValues({ tenantId: 7 }, entrada);

    expect(salida).toEqual({ sourceType: "x", defaultAmount: 3, tenantId: 7 });
    // Pureza: el llamador puede seguir usando su objeto sin sorpresas.
    expect(entrada).toEqual({ sourceType: "x", defaultAmount: 3 });
    expect(entrada).not.toHaveProperty("tenantId");
    expect(salida).not.toBe(entrada);
  });

  it("Test 2: el tenant del scope PISA un tenantId que venga en los values (mass-assignment)", () => {
    // Simula el peor caso: un body del cliente que llegó spreadeado hasta el
    // INSERT trayendo su propio gimnasio. El servidor gana igual.
    const salida = tenantValues({ tenantId: 7 }, { tenantId: 99, a: 1 });

    expect(salida.tenantId).toBe(7);
    expect(salida.a).toBe(1);
  });
});

describe("tenantWhere — filtro por gimnasio (T-169-01)", () => {
  it("Test 3: el SQL generado nombra tenant_id y el parámetro es el del scope", () => {
    const consulta = app.db
      .select()
      .from(schema.auraConfig)
      .where(tenantWhere(schema.auraConfig, CTX_SEGUNDO))
      .toSQL();

    expect(consulta.sql).toContain("tenant_id");
    expect(consulta.params).toContain(TENANT_SEGUNDO);
    expect(consulta.params).not.toContain(TENANT_TEMPLO);
  });

  it("Test 4: contra MySQL devuelve sólo las filas del gimnasio pedido", async () => {
    const delSegundo = await app.db
      .select({ id: schema.auraConfig.id, tenantId: schema.auraConfig.tenantId })
      .from(schema.auraConfig)
      .where(tenantWhere(schema.auraConfig, CTX_SEGUNDO));

    const ids = delSegundo.map((f) => f.id);
    expect(ids).toContain(idFilaSegundo);
    // La mitad que importa: la fila del otro gimnasio NO aparece. Una aserción
    // de sola inclusión pasaría en verde con un WHERE sin filtro.
    expect(ids).not.toContain(idFilaTemplo);
    expect(delSegundo.every((f) => f.tenantId === TENANT_SEGUNDO)).toBe(true);

    const delTemplo = await app.db
      .select({ id: schema.auraConfig.id })
      .from(schema.auraConfig)
      .where(tenantWhere(schema.auraConfig, CTX_TEMPLO));
    const idsTemplo = delTemplo.map((f) => f.id);
    expect(idsTemplo).toContain(idFilaTemplo);
    expect(idsTemplo).not.toContain(idFilaSegundo);
  });
});

describe("assertTenant — narrowing fail-closed de number|null", () => {
  it("Test 5: devuelve el contexto cuando el scope trae un gimnasio resuelto", () => {
    const ctx = assertTenant({ tenantId: 5 }, "test.assertTenant");

    expect(ctx).toEqual({ tenantId: 5 });
    expect(typeof ctx.tenantId).toBe("number");
  });

  it("Test 6: con tenantId null corta con 403 TENANT_UNRESOLVED antes de tocar datos", () => {
    // `null` es corrupción de datos y significa DENY. Jamás "todos los
    // gimnasios", jamás un default numérico.
    expect(() => assertTenant({ tenantId: null }, "test.assertTenant")).toThrow(
      expect.objectContaining({
        statusCode: 403,
        code: TENANT_UNRESOLVED,
      }),
    );
  });
});

describe("listActiveTenants — sólo gimnasios activos (T-169-03)", () => {
  it("Test 7: incluye el segundo gimnasio mientras está 'active', ordenado por id", async () => {
    const activos = await listActiveTenants(app.db);
    const ids = activos.map((c) => c.tenantId);

    expect(ids).toContain(TENANT_TEMPLO);
    expect(ids).toContain(TENANT_SEGUNDO);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it("Test 8: excluye el gimnasio 'suspended'", async () => {
    await setTenantStatus(app, TENANT_SEGUNDO, "suspended");

    const ids = (await listActiveTenants(app.db)).map((c) => c.tenantId);

    expect(ids).not.toContain(TENANT_SEGUNDO);
    // El resto del barrido no se ve afectado: suspender uno no apaga a los demás.
    expect(ids).toContain(TENANT_TEMPLO);
  });

  it("Test 9: excluye el gimnasio 'archived'", async () => {
    await setTenantStatus(app, TENANT_SEGUNDO, "archived");

    const ids = (await listActiveTenants(app.db)).map((c) => c.tenantId);

    expect(ids).not.toContain(TENANT_SEGUNDO);
    expect(ids).toContain(TENANT_TEMPLO);
  });
});

describe("forEachActiveTenant — barrido por gimnasio activo (D-01/D-03)", () => {
  it("Test 10: corre el callback exactamente una vez por gimnasio activo", async () => {
    const capturado = crearLoggerCapturado();
    const vistos: number[] = [];

    const resultado = await forEachActiveTenant(
      app.db,
      capturado.log,
      "test-sweep",
      async (ctx) => {
        vistos.push(ctx.tenantId);
      },
    );

    expect(vistos).toEqual([TENANT_TEMPLO, TENANT_SEGUNDO]);
    expect(resultado).toEqual({ tenants: 2, ok: 2, failed: 0 });
    expect(capturado.error).toEqual([]);
    expect(capturado.warn).toEqual([]);
  });

  it("Test 11: un gimnasio que falla no frena al resto y se loguea con tenantId estructurado", async () => {
    const capturado = crearLoggerCapturado();
    const vistos: number[] = [];

    const resultado = await forEachActiveTenant(
      app.db,
      capturado.log,
      "test-sweep-roto",
      async (ctx) => {
        vistos.push(ctx.tenantId);
        if (ctx.tenantId === TENANT_SEGUNDO) {
          throw new Error("explota sólo para el segundo gimnasio");
        }
      },
    );

    // El tenant 1 igual fue procesado: un gimnasio roto no frena a los demás.
    expect(vistos).toEqual([TENANT_TEMPLO, TENANT_SEGUNDO]);
    expect(resultado).toEqual({ tenants: 2, ok: 1, failed: 1 });

    expect(capturado.error).toHaveLength(1);
    const logueado = capturado.error[0];
    // El id va como CAMPO ESTRUCTURADO del primer argumento, jamás interpolado
    // en el mensaje: así se puede filtrar por gimnasio en Sentry.
    expect(logueado.obj.tenantId).toBe(TENANT_SEGUNDO);
    expect(logueado.obj.job).toBe("test-sweep-roto");
    expect(logueado.obj.err).toBeInstanceOf(Error);
    expect(logueado.msg).not.toContain(String(TENANT_SEGUNDO));
  });

  it("Test 12: sin gimnasios activos avisa y devuelve el resultado en cero", async () => {
    const capturado = crearLoggerCapturado();
    let corrio = false;

    try {
      await setTenantStatus(app, TENANT_TEMPLO, "suspended");
      await setTenantStatus(app, TENANT_SEGUNDO, "suspended");

      const resultado = await forEachActiveTenant(
        app.db,
        capturado.log,
        "test-sweep-vacio",
        async () => {
          corrio = true;
        },
      );

      expect(resultado).toEqual({ tenants: 0, ok: 0, failed: 0 });
      expect(corrio).toBe(false);
      // No es un error, pero tampoco puede pasar en silencio.
      expect(capturado.warn).toHaveLength(1);
      expect(capturado.warn[0].obj.job).toBe("test-sweep-vacio");
    } finally {
      await setTenantStatus(app, TENANT_TEMPLO, "active");
      await setTenantStatus(app, TENANT_SEGUNDO, "active");
    }
  });
});

describe("higiene del archivo", () => {
  it("Test 13: la limpieza deja la base sin rastro del segundo gimnasio", async () => {
    await limpiarRastro(app);

    expect(await contarTenant(app, TENANT_SEGUNDO)).toBe(0);
    const quedan = await app.db
      .select({ id: schema.auraConfig.id })
      .from(schema.auraConfig)
      .where(inArray(schema.auraConfig.sourceType, SOURCES_DEL_ARCHIVO));
    expect(quedan).toEqual([]);

    // El tenant 1 queda intacto: este archivo nunca lo borra.
    expect(await contarTenant(app, TENANT_TEMPLO)).toBe(1);
  });
});
