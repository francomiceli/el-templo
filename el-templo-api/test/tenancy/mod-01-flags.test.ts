/**
 * Fase 176 Plan 01 (MOD-01) — gate de comportamiento del resolver de flags
 * `module.*.enabled` + idempotencia de la migración 0209.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ----------------------------
 * `module-flags.ts` es el cimiento de toda la fase: el guard `requireModule`
 * y el registry de hooks (planes siguientes) confían en que
 * `enabledModulesFor` fail-closed y en que la migración 0209 sea
 * verdaderamente idempotente. Sin este gate, un bug acá se cuela silencioso
 * hasta que un módulo apagado en prod sigue respondiendo (o al revés).
 *
 * LO QUE SE AFIRMA
 * -----------------
 *   1. Las 4 filas `module.*.enabled = 'true'` existen para TENANT_TEMPLO
 *      (SELECT directo, confirma que la migración 0209 corrió en la DB de
 *      test — `test/setup.ts` aplica todas las migraciones committeadas).
 *   2. `enabledModulesFor(TENANT_TEMPLO, app.db)` devuelve los 4 nombres.
 *   3. `enabledModulesFor(TENANT_DOS, app.db)` (sin flags sembrados) devuelve
 *      un set vacío — fail-closed (T-176-06).
 *   4. `setModuleFlag(..., false)` apaga un módulo en el acto
 *      (`invalidateModuleFlags` corta el cache sin esperar el TTL), y
 *      `restoreTemploFlags` lo repone.
 *   5. Re-ejecutar los statements de la migración 0209 es no-op: el COUNT de
 *      filas `module.%` del tenant 1 sigue siendo exactamente 4 (T-176-09).
 *
 * QUÉ HACER CUANDO SE CAIGA
 * --------------------------
 * Caso 1/2 rojo → la migración 0209 no corrió o el seed tiene un typo de key.
 * Caso 3 rojo → alguien rompió fail-closed en `enabledModulesFor` (hueco de
 * seguridad T-176-06, tratar como bloqueante).
 * Caso 4 rojo → revisar `invalidateModuleFlags` o el TTL de
 * `MODULE_FLAGS_TTL_MS` en `NODE_ENV=test`.
 * Caso 5 rojo → la migración dejó de ser idempotente (revisar el
 * `WHERE NOT EXISTS` de cada bloque).
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run test/tenancy/mod-01-flags.test.ts --hookTimeout=250000
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, like, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { createTestApp } from "../helpers";
import { tenantSettings } from "../../src/db/schema";
import { splitSqlStatements } from "../../src/db/run-migrations";
import {
  enabledModulesFor,
  isModuleEnabled,
  invalidateModuleFlags,
} from "../../src/modules/shared/module-flags";
import { MODULE_NAMES } from "../../src/modules/shared/modules";
import { TENANT_DOS, TENANT_TEMPLO } from "../fixtures/second-tenant";
import { setModuleFlag, restoreTemploFlags } from "../fixtures/module-flags";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

afterEach(async () => {
  await restoreTemploFlags(app);
});

describe("MOD-01 — flags module.*.enabled", () => {
  it("las 4 filas existen para TENANT_TEMPLO con setting_value = 'true'", async () => {
    const rows = await app.db
      .select({
        settingKey: tenantSettings.settingKey,
        settingValue: tenantSettings.settingValue,
      })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, TENANT_TEMPLO),
          like(tenantSettings.settingKey, "module.%"),
        ),
      );

    expect(
      rows.length,
      `Se esperaban 4 filas module.*.enabled para el tenant ${TENANT_TEMPLO} ` +
        `y se encontraron ${rows.length}. QUÉ HACER: verificar que la ` +
        `migración 0209 corrió (test/setup.ts la aplica automáticamente). ` +
        `POR QUÉ IMPORTA: sin el seed, El Templo arranca con los 4 módulos ` +
        `apagados (fail-closed) — regresión de comportamiento en prod.`,
    ).toBe(4);

    for (const row of rows) {
      expect(row.settingValue).toBe("true");
    }
  });

  it("enabledModulesFor(TENANT_TEMPLO) devuelve los 4 nombres", async () => {
    const flags = await enabledModulesFor(TENANT_TEMPLO, app.db);
    expect(flags.size).toBe(4);
    for (const moduleName of MODULE_NAMES) {
      expect(flags.has(moduleName)).toBe(true);
    }
  });

  it("enabledModulesFor(TENANT_DOS) devuelve un set vacío — fail-closed", async () => {
    const flags = await enabledModulesFor(TENANT_DOS, app.db);

    expect(
      flags.size,
      `TENANT_DOS (${TENANT_DOS}) no tiene filas module.*.enabled sembradas, ` +
        `así que el resolver debe devolver un set vacío por default OFF. ` +
        `QUÉ HACER: revisar enabledModulesFor en module-flags.ts — un tenant ` +
        `sin filas NUNCA debe heredar módulos habilitados de otro tenant. ` +
        `POR QUÉ IMPORTA (T-176-06): esto es la diferencia entre fail-closed ` +
        `y fail-open; un bug acá habilita módulos exclusivos de El Templo ` +
        `para cualquier instalación white-label nueva.`,
    ).toBe(0);
  });

  it("setModuleFlag(false) apaga en el acto; restoreTemploFlags repone", async () => {
    expect(
      await isModuleEnabled(TENANT_TEMPLO, "templo-marketing", app.db),
    ).toBe(true);

    await setModuleFlag(app, TENANT_TEMPLO, "templo-marketing", false);

    expect(
      await isModuleEnabled(TENANT_TEMPLO, "templo-marketing", app.db),
      "invalidateModuleFlags no cortó el cache: la lectura siguiente a " +
        "setModuleFlag(false) todavía ve el módulo habilitado.",
    ).toBe(false);

    await restoreTemploFlags(app);

    expect(
      await isModuleEnabled(TENANT_TEMPLO, "templo-marketing", app.db),
    ).toBe(true);
  });

  it("re-aplicar la migración 0209 es no-op: COUNT sigue siendo 4", async () => {
    const migrationPath = path.join(
      __dirname,
      "../../src/db/migrations/0209_seed_module_flags.sql",
    );
    const rawSql = fs.readFileSync(migrationPath, "utf-8");
    const statements = splitSqlStatements(rawSql);

    expect(statements.length).toBeGreaterThan(0);

    // Invalidar antes: un re-run no debe alterar el resultado, pero el cache
    // no debe enmascarar un bug de la migración si el TTL no fuera 0.
    invalidateModuleFlags(TENANT_TEMPLO);

    for (const statement of statements) {
      await app.db.execute(sql.raw(statement));
    }

    const rows = await app.db
      .select({ settingKey: tenantSettings.settingKey })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, TENANT_TEMPLO),
          like(tenantSettings.settingKey, "module.%"),
        ),
      );

    expect(
      rows.length,
      `Re-ejecutar los statements de 0209 produjo ${rows.length} filas ` +
        `module.% para el tenant ${TENANT_TEMPLO}, se esperaban 4. QUÉ ` +
        `HACER: revisar el WHERE NOT EXISTS de cada bloque INSERT — un re-run ` +
        `no debe duplicar filas. POR QUÉ IMPORTA (T-176-09): el pipeline de ` +
        `deploy corre las migraciones committeadas en cada release; si 0209 ` +
        `no es idempotente, un segundo deploy duplica o pisa un flag que un ` +
        `admin apagó a mano.`,
    ).toBe(4);
  });
});
