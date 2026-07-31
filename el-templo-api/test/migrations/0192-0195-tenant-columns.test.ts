/**
 * Fase 167 Plan 06: gate de CI sobre la tanda C (migraciones 0192 a 0195).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * Dos capas distintas pueden afirmar "la migración se aplicó" sin que sea cierto:
 *
 *   1. El runner de producción (`src/db/run-migrations.ts`) tiene la heurística
 *      `alreadyApplied`: en cuanto un statement falla con "Duplicate"/"already
 *      exists", TODOS los errores posteriores del mismo archivo se saltean y el
 *      archivo se registra igual en `_migrations`. Una migración de 108
 *      statements que murió a mitad de camino queda marcada como aplicada.
 *   2. El provisioning de la DB de tests (`test/setup.ts`, líneas ~165-230)
 *      aplica las migraciones con `SET FOREIGN_KEY_CHECKS=0` y tolera una lista
 *      todavía más amplia: "Duplicate", "already exists", "Can't DROP",
 *      "foreign key constraint fails", "Unknown column", "Table", "Cannot add or
 *      update", "doesn't exist". Es deliberado (hay migraciones de datos que
 *      referencian filas que una base fresca no tiene), pero significa que una
 *      migración de DDL rota pasa en silencio y la suite entera sigue en verde.
 *
 * Por eso este archivo no le pregunta a `_migrations` si la tanda C corrió: corre
 * la MISMA verificación del script `src/db/scripts/verify-tenant-backfill.ts`
 * contra la base per-worker y le pregunta al schema real. Es la única red que
 * pone CI en rojo si la tanda C queda parcialmente aplicada.
 *
 * Cobertura:
 *   1. DDL completo de las 87 tablas gym-owned (`ddlMissing` vacío).
 *   2. Cobertura: se verificaron las 87, no un subconjunto.
 *   3. Exclusiones de diseño: `system_settings` y `labs_inquiries` sin columna,
 *      afirmado dos veces (por el reporte y directo por INFORMATION_SCHEMA).
 *   4. Consistencia: 0 discrepancias sobre la base recién provisionada.
 *   5. Las 4 migraciones de la tanda C registradas exactamente una vez.
 *   6. Round-trip Drizzle: insertar SIN `tenantId` resuelve a 1.
 *
 * Este archivo es de SOLO LECTURA sobre el schema y no deja filas: la única
 * escritura es la fila del round-trip, que se borra en el mismo test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  verifyTenantBackfill,
  formatReport,
  type QueryFn,
  type TenantBackfillReport,
} from "../../src/db/scripts/verify-tenant-backfill";

const TANDA_C_MIGRATIONS = [
  "0192_tenant_id_core_ops.sql",
  "0193_tenant_id_core_comms.sql",
  "0194_tenant_id_templo_spom.sql",
  "0195_tenant_id_templo_rest.sql",
];

/**
 * Motivo de la exención `tenant-safe:` que se le antepone a cada statement del
 * script (fase 172).
 *
 * `verifyTenantBackfill` audita el backfill de `tenant_id` en las 87 tablas
 * gym-owned de TODA la base: cuenta filas sin tenant y busca huérfanos de FK
 * cruzando tablas. Tres de las que cruza —`transaction_links`, `balances` y
 * `financial_transactions`— son strict, así que con `finance` en
 * `TENANT_STRICT_MODULES` el barrido hace throw.
 *
 * Acotarlo por gimnasio no es una opción: un huérfano del gimnasio 2 que el
 * barrido no viera sería exactamente el bug que el script existe para cazar.
 * Es global A PROPÓSITO — el caso de manual de la regla que dejó escrita el
 * 172-13 (global a propósito → exención; acotable → filtro).
 *
 * La anotación va acá y NO en `src/db/scripts/verify-tenant-backfill.ts` porque
 * el sentinel solo intercepta el pool de la app: el script se usa por CLI con
 * `createSingleConnection`, que no pasa por esa puerta, y este test es el ÚNICO
 * call site que lo enchufa a `app.db`. Si algún día el script se llama desde una
 * ruta o un job, la exención se muda al script.
 */
const MOTIVO_EXENCION =
  "/* tenant-safe: auditoria global del backfill de tenant_id sobre las 87 " +
  "tablas gym-owned de toda la base, de todos los gimnasios */\n";

/**
 * Adapta `app.db` al `QueryFn` del script.
 *
 * mysql2 devuelve `[rows, fields]` y drizzle lo pasa tal cual para SQL crudo:
 * se normaliza acá una sola vez, con el mismo cast `as unknown as` que usan los
 * tests de migración existentes.
 */
function makeQueryFn(app: FastifyInstance): QueryFn {
  return async (statement: string) => {
    const result = (await app.db.execute(
      sql.raw(MOTIVO_EXENCION + statement),
    )) as unknown as [Record<string, unknown>[]];
    const rows = Array.isArray(result)
      ? result[0]
      : (result as unknown as Record<string, unknown>[]);
    return Array.isArray(rows) ? rows : [];
  };
}

async function queryRows<T>(
  app: FastifyInstance,
  statement: ReturnType<typeof sql>,
): Promise<T[]> {
  const result = (await app.db.execute(statement)) as unknown as [T[]];
  const rows = Array.isArray(result) ? result[0] : (result as unknown as T[]);
  return Array.isArray(rows) ? rows : [];
}

describe("Migraciones 0192-0195 — tenant_id en las 87 tablas gym-owned", () => {
  let app: FastifyInstance;
  let report: TenantBackfillReport;

  beforeAll(async () => {
    app = await createTestApp();
    // Una sola corrida compartida: la verificación completa son ~25 round-trips
    // y todos los bloques miran el mismo reporte.
    report = await verifyTenantBackfill(makeQueryFn(app));
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── 1. DDL completo de la tanda C ──────────────────────────────────────
  it("Test 1: las 87 tablas gym-owned tienen tenant_id INT NOT NULL DEFAULT 1 con FK a tenants", () => {
    // El mensaje imprime QUÉ tabla falla y por qué: un fallo que solo dice
    // "esperaba 0" manda a bisecar 108 statements a mano.
    const detail = report.ddlMissing
      .map((issue) => `${issue.table}: ${issue.reason}`)
      .join("\n");
    expect(
      report.ddlMissing,
      `Tanda C parcialmente aplicada en ${report.database}:\n${detail}`,
    ).toEqual([]);
  });

  // ─── 2. Cobertura ───────────────────────────────────────────────────────
  it("Test 2: la verificacion cubre las 87 tablas gym-owned, no un subconjunto", () => {
    expect(report.gymOwnedChecked).toBe(87);
  });

  // ─── 3. Exclusiones de diseño ───────────────────────────────────────────
  it("Test 3: system_settings y labs_inquiries NO tienen columna tenant_id", async () => {
    const detail = report.exemptViolations
      .map((issue) => `${issue.table}: ${issue.reason}`)
      .join("\n");
    expect(
      report.exemptViolations,
      `Exclusion de diseno revertida:\n${detail}`,
    ).toEqual([]);

    // Assert directo, no derivado del reporte: es el criterio de éxito 1 de la
    // fase y merece su propia consulta.
    const rows = await queryRows<{ TABLE_NAME: string }>(
      app,
      sql`SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND COLUMN_NAME = 'tenant_id'
             AND TABLE_NAME IN ('system_settings', 'labs_inquiries')`,
    );
    expect(
      rows.map((r) => r.TABLE_NAME),
      "system_settings (mina M2) y labs_inquiries (plataforma) no deben recibir tenant_id en todo v6.0",
    ).toEqual([]);
  });

  // ─── 4. Consistencia del backfill ───────────────────────────────────────
  it("Test 4: la base de test recien provisionada tiene 0 discrepancias", () => {
    expect(
      report.discrepancies,
      `Reporte completo:\n${formatReport(report)}`,
    ).toBe(0);
    expect(report.badRows).toEqual([]);
    expect(report.fkMismatches).toEqual([]);
    expect(report.logicalMismatches).toEqual([]);
    expect(report.derivationMismatches).toEqual([]);
    // Las 9 aristas lógicas de la mina M9 siguen declaradas en el código: si
    // alguien las borra, el reporte daría 0 discrepancias sin haber mirado nada.
    expect(report.logicalEdgesDeclared).toBe(9);
    expect(report.fkEdgesChecked).toBeGreaterThanOrEqual(60);
  });

  // ─── 5. Registro de las 4 migraciones ───────────────────────────────────
  it("Test 5: cada migracion de la tanda C aparece exactamente una vez en _migrations", async () => {
    // MySQL LIKE no soporta clases de caracteres ('019[2-5]%' matchea los
    // caracteres literales y devuelve 0 siempre): lista explícita.
    const rows = await queryRows<{ name: string; n: number }>(
      app,
      sql`SELECT name, COUNT(*) AS n
            FROM _migrations
           WHERE name IN (${sql.join(
             TANDA_C_MIGRATIONS.map((name) => sql`${name}`),
             sql`, `,
           )})
           GROUP BY name
           ORDER BY name`,
    );
    expect(rows.map((r) => r.name)).toEqual(TANDA_C_MIGRATIONS);
    for (const row of rows) {
      expect(Number(row.n), `${row.name} duplicada en _migrations`).toBe(1);
    }
  });

  // ─── 6. Round-trip Drizzle ──────────────────────────────────────────────
  it("Test 6: insertar por Drizzle SIN tenantId resuelve a tenant_id = 1", async () => {
    // Exactamente la forma del código pre-tenancy: la columna ni se menciona.
    // Prueba que el `.default(1)` del helper y el DEFAULT de la DB coinciden.
    const [inserted] = await app.db
      .insert(schema.activities)
      .values({ name: `Tenancy probe ${Date.now()}` })
      .$returningId();

    try {
      const [readBack] = await app.db
        .select({
          id: schema.activities.id,
          tenantId: schema.activities.tenantId,
        })
        .from(schema.activities)
        .where(eq(schema.activities.id, inserted.id))
        .limit(1);

      expect(readBack).toBeDefined();
      expect(readBack.tenantId).toBe(1);
    } finally {
      // activities no está en TABLES_TO_CLEAN: la fila se borra acá o queda
      // colgada para las suites vecinas del mismo worker.
      await app.db
        .delete(schema.activities)
        .where(eq(schema.activities.id, inserted.id));
    }
  });
});
