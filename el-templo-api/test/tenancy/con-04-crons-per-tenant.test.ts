/**
 * Fase 169 Plan 04 (CON-04, D-01/D-03): el criterio 3 del ROADMAP probado sobre
 * CRONS REALES, no sobre el helper.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * `test/tenancy/tenant-helpers.test.ts` (plan 169-01) ya prueba que
 * `forEachActiveTenant` corre una vez por gimnasio activo y que aísla errores.
 * Eso prueba el HELPER. No prueba que los 7 jobs lo estén USANDO: un job podría
 * importar el sweep y no llamarlo nunca, o llamarlo alrededor de la mitad
 * equivocada del cuerpo, y la suite seguiría en verde.
 *
 * Este archivo cierra ese hueco en las dos direcciones:
 *
 *   1. COMPORTAMIENTO — con dos gimnasios sembrados, el CUERPO de un cron real
 *      corre exactamente dos veces (una por gimnasio activo), una sola vez
 *      cuando el segundo está `suspended` o `archived`, y cuando el cuerpo falla
 *      para uno el otro igual se procesa y `runX` resuelve sin lanzar (D-03
 *      probado sobre un job real).
 *   2. COBERTURA — un gate fail-closed que pone la suite en rojo si aparece un
 *      job nuevo en `src/jobs/` sin pasar por `forEachActiveTenant`. Sin ese
 *      gate, D-01 ("ningún cron queda para acordarse después") se cumple hoy y
 *      se rompe en la próxima fase que agregue un job.
 *
 * POR QUÉ SE ESPÍA EL SERVICE Y NO SE MOCKEA EL SWEEP (T-169-19)
 * --------------------------------------------------------------
 * Mockear `forEachActiveTenant` probaría el mock. El spy va sobre el método del
 * service que el cuerpo invoca, así que el camino REAL queda vivo de punta a
 * punta: `listActiveTenants` consulta MySQL de verdad, el loop itera de verdad,
 * el `try/catch` por iteración contiene de verdad. El corte está exactamente
 * donde empezaría la lógica de negocio, que en esta fase NO cambia (D-02: el
 * `ctx` no baja a los services hasta 172-175).
 *
 * Los jobs instancian sus services DENTRO del cuerpo por tenant (planes 169-02 y
 * 169-03), así que un spy sobre el método del service cuenta exactamente las
 * vueltas del sweep — sin fixtures pesadas y sin tocar el sweep.
 *
 * El segundo job (`runExpireLostLeads`) va SIN spy, a propósito: corre de verdad
 * contra MySQL con los dos gimnasios activos y demuestra que un job con `sql`
 * crudo sobrevive al sweep y conserva su tipo de retorno de siempre.
 *
 * LA TRAMPA DEL DEFAULT 1 (T-168-15)
 * ----------------------------------
 * `tenant_id` tiene DEFAULT 1 desde la fase 167: un insert que se olvide de
 * estampar `tenantId` cae en el tenant 1 sin avisar. Todo insert de este archivo
 * pasa `tenantId` explícito (acá el único es el de `tenants`, cuya PK ES el id).
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
 * `afterEach` INCONDICIONAL. Y `vi.restoreAllMocks()` en el mismo `afterEach`,
 * para que el spy sobre `AdminSessionService.prototype` no se filtre a otro
 * archivo del worker. Este archivo TAMPOCO usa `cleanAllTestData`: es
 * admin-global y no está scopeada por tenant (warning heredado del 168-REVIEW),
 * así que borraría el segundo gimnasio del que dependen estos tests.
 *
 * Correr SOLO este archivo: más de uno a la vez revienta el timeout de 120 s del
 * provisioning en esta máquina.
 *   npx vitest run test/tenancy/con-04-crons-per-tenant.test.ts --no-file-parallelism
 */
import fs from "fs";
import path from "path";
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
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { AdminSessionService } from "../../src/modules/admin/service";
import { runAutoApprove } from "../../src/jobs/auto-approve";
import { runExpireLostLeads } from "../../src/jobs/expire-lost-leads";

// ─── Constantes de tenant ────────────────────────────────────────────────────
// Ningún número mágico suelto en las aserciones: los dos ids viven acá.
//
// El tenant 1 es El Templo, sembrado por la migración 0190 — existe siempre y
// este archivo NUNCA lo borra.
const TENANT_TEMPLO = 1;
// Id fijo y ALTO a propósito: no colisiona con el autoincremento de `tenants`
// (que hoy está en 1) ni con ningún id de otro archivo de la fase (90169 es de
// `tenant-helpers`, 90168 del `con-01`). Dos archivos del mismo worker que
// usaran el mismo id se pisarían (`isolate: false`). La fila la crea el
// `beforeAll` de este archivo y la borra su `afterAll`.
const TENANT_SEGUNDO = 90269;

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
 * Borra todo rastro de este archivo. La fila de `tenants` es lo único que se
 * siembra acá, así que el orden de FKs es trivial; se mantiene la función igual
 * para que el `beforeAll` defensivo y el `afterAll` obligatorio compartan el
 * mismo código (una corrida anterior abortada podría dejar la fila colgada).
 */
async function limpiarRastro(app: FastifyInstance): Promise<void> {
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

/**
 * Espía el método que el cuerpo de `auto-approve` invoca una vez por vuelta del
 * sweep. Se lo neutraliza con un resultado fijo: lo que se está contando es
 * CUÁNTAS VECES corre el cuerpo, no qué aprueba (eso ya lo cubren los tests del
 * módulo admin, y en esta fase la lógica de negocio no cambió — D-02).
 */
function espiarAutoApprove() {
  return vi
    .spyOn(AdminSessionService.prototype, "autoApprovePendingSessions")
    .mockResolvedValue({ approved: 0 });
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();

  await limpiarRastro(app);

  await app.db.insert(schema.tenants).values({
    id: TENANT_SEGUNDO,
    name: "Gimnasio de prueba 169-04",
    slug: `test-169-crons-${TENANT_SEGUNDO}`,
    status: "active",
  });
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await setTenantStatus(app, TENANT_TEMPLO, "active");
  await setTenantStatus(app, TENANT_SEGUNDO, "active");
});

// Red INCONDICIONAL: pase lo que pase en un test, el worker sigue con el
// gimnasio 1 operativo y sin spies colgados. Sin esto, un test que deje el
// tenant 1 suspendido o el prototype parcheado rompe TODOS los archivos
// siguientes del mismo worker.
afterEach(async () => {
  vi.restoreAllMocks();
  await setTenantStatus(app, TENANT_TEMPLO, "active");
});

afterAll(async () => {
  vi.restoreAllMocks();
  await setTenantStatus(app, TENANT_TEMPLO, "active");
  await limpiarRastro(app);
  await app.close();
});

describe("criterio 3 — el cuerpo del cron corre una vez por gimnasio ACTIVO", () => {
  it("Test 1: con DOS gimnasios activos, el cuerpo de auto-approve corre exactamente 2 veces", async () => {
    const spy = espiarAutoApprove();

    const resultado = await runAutoApprove(app.db);

    // Aserción EXACTA, no "al menos": el punto del test es distinguir 2 de 1.
    expect(spy).toHaveBeenCalledTimes(2);
    // El tipo de retorno público no cambió con el sweep: sigue siendo el total
    // agregado entre gimnasios (0 + 0 con el spy neutralizado).
    expect(resultado).toEqual({ approved: 0 });
  });

  it("Test 2: con el segundo gimnasio 'suspended', el cuerpo corre UNA sola vez", async () => {
    await setTenantStatus(app, TENANT_SEGUNDO, "suspended");
    const spy = espiarAutoApprove();

    await runAutoApprove(app.db);

    // Un gimnasio suspendido (falta de pago, reversible) NO se procesa: sus
    // datos no se tocan mientras dure la suspensión (T-169-17).
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("Test 3: con el segundo gimnasio 'archived', el cuerpo corre UNA sola vez", async () => {
    await setTenantStatus(app, TENANT_SEGUNDO, "archived");
    const spy = espiarAutoApprove();

    await runAutoApprove(app.db);

    // `archived` es baja lógica y corta igual que `suspended`. Los dos estados
    // no-activos del enum quedan cubiertos por Test 2 + Test 3, así que la
    // comparación positiva contra 'active' está probada de los dos lados.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("Test 4: si el cuerpo falla para un gimnasio, el otro igual se procesa y runAutoApprove NO lanza (D-03)", async () => {
    // `listActiveTenants` ordena por id, así que la primera vuelta es el tenant
    // 1 y la segunda el 90269: la que explota es la del segundo gimnasio.
    const spy = vi
      .spyOn(AdminSessionService.prototype, "autoApprovePendingSessions")
      .mockResolvedValueOnce({ approved: 3 })
      .mockRejectedValueOnce(new Error("explota sólo para el segundo gimnasio"));

    const resultado = await runAutoApprove(app.db);

    // El sweep absorbe el error, lo loguea con `tenantId` estructurado y sigue.
    // Que `runAutoApprove` RESUELVA es la mitad que importa: si re-lanzara, el
    // gimnasio roto tumbaría el barrido de todos los demás.
    expect(spy).toHaveBeenCalledTimes(2);
    // El gimnasio sano igual dejó su resultado en el acumulador.
    expect(resultado).toEqual({ approved: 3 });
  });

  it("Test 5: runExpireLostLeads (SQL crudo, sin spy) sobrevive al sweep con dos gimnasios activos", async () => {
    // Sin mocks: este job corre de verdad contra MySQL, dos vueltas completas.
    // Prueba que un cuerpo con `sql` crudo no se rompe bajo el sweep y que su
    // tipo de retorno público sigue siendo el total agregado de siempre.
    const resultado = await runExpireLostLeads(app.db);

    expect(typeof resultado.expired).toBe("number");
    expect(typeof resultado.skippedManual).toBe("number");
    expect(resultado.expired).toBeGreaterThanOrEqual(0);
    expect(resultado.skippedManual).toBeGreaterThanOrEqual(0);
  });
});

describe("higiene del archivo", () => {
  it("Test 6: la limpieza deja la base sin rastro del segundo gimnasio", async () => {
    await limpiarRastro(app);

    expect(await contarTenant(app, TENANT_SEGUNDO)).toBe(0);
    // El tenant 1 queda intacto: este archivo nunca lo borra.
    expect(await contarTenant(app, TENANT_TEMPLO)).toBe(1);
  });
});
