/**
 * Fase 166 Plan 03: test de introspección del DDL de las tandas A y B
 * (migraciones 0190_tenants_core.sql y 0191_tenant_anchors.sql).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * El provisioning de la DB de tests (`test/setup.ts`, líneas ~165-230) aplica
 * las migraciones con `SET FOREIGN_KEY_CHECKS=0` y **tolera** una lista larga
 * de errores ("Duplicate", "already exists", "Unknown column", "Table",
 * "doesn't exist"…), y después inserta la fila de `_migrations` igual. Es
 * deliberado (hay migraciones de datos que referencian filas que una DB de
 * test fresca no tiene), pero tiene una consecuencia dura: **una migración de
 * DDL rota puede pasar en silencio y la suite entera seguir en verde**.
 *
 * Por eso "las migraciones corrieron" no prueba nada. Lo único que prueba que
 * FUND-01 y FUND-02 quedaron bien es interrogar a INFORMATION_SCHEMA por el
 * resultado real: columnas, tipos, defaults, uniques, índices y FKs con sus
 * nombres exactos de contrato. Este archivo falla si una migración se aplicó a
 * medias.
 *
 * Cobertura:
 *   1. Forma de `tenants` (FUND-01): enum de status byte a byte, slug, los tres
 *      defaults, y la trampa de `mysqlEnum` (no debe existir `tenant_status`).
 *   2. Unique e índices de `tenants` / `tenant_settings` + FK a `tenants`.
 *   3. Seed: exactamente un tenant (id=1, el-templo, active) y KV vacío.
 *   4. Anclas (FUND-02): `users.tenant_id` y `branches.tenant_id` INT NOT NULL
 *      DEFAULT 1, con índice, FK y backfill al 100%.
 *   5. Round-trip Drizzle: insert SIN `tenantId` resuelve a 1 — la prueba viva
 *      de la compatibilidad con el código viejo y con `test/setup.ts`.
 *   6. Idempotencia: cada migración aparece una sola vez en `_migrations`.
 *   7. Slugs reservados (D-05).
 *
 * Este archivo NO modifica el status del tenant: eso es del plan 166-05, que
 * lo restaura. Acá el tenant 1 se lee, nunca se escribe.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { RESERVED_TENANT_SLUGS } from "../../src/db/schema/tenants";

interface ColumnRow {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_DEFAULT: string | null;
}

interface FKRow {
  CONSTRAINT_NAME: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string | null;
  REFERENCED_COLUMN_NAME: string | null;
}

interface IndexRow {
  INDEX_NAME: string;
  COLUMN_NAME: string;
  SEQ_IN_INDEX: number;
  NON_UNIQUE: number;
}

interface CountRow {
  n: number;
}

interface MigrationRow {
  name: string;
  n: number;
}

interface TenantRow {
  id: number;
  name: string;
  slug: string;
  status: string;
}

/**
 * mysql2 devuelve `[rows, fields]`; drizzle `execute` lo pasa tal cual para
 * SQL crudo. Se normaliza acá una sola vez para no repetir el cast en cada
 * test (mismo patrón que test/migrations/0121-users-lead-fields.test.ts).
 */
async function queryRows<T>(
  app: FastifyInstance,
  statement: SQL,
): Promise<T[]> {
  const result = (await app.db.execute(statement)) as unknown as [T[]];
  const rows = Array.isArray(result) ? result[0] : (result as unknown as T[]);
  return Array.isArray(rows) ? rows : [];
}

async function getColumn(
  app: FastifyInstance,
  tableName: string,
  columnName: string,
): Promise<ColumnRow | undefined> {
  const rows = await queryRows<ColumnRow>(
    app,
    sql`SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${tableName}
          AND COLUMN_NAME = ${columnName}`,
  );
  return rows[0];
}

async function getIndexRows(
  app: FastifyInstance,
  tableName: string,
  indexName: string,
): Promise<IndexRow[]> {
  return queryRows<IndexRow>(
    app,
    sql`SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${tableName}
          AND INDEX_NAME = ${indexName}
        ORDER BY SEQ_IN_INDEX`,
  );
}

async function getForeignKey(
  app: FastifyInstance,
  constraintName: string,
): Promise<FKRow | undefined> {
  const rows = await queryRows<FKRow>(
    app,
    sql`SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME,
               REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND CONSTRAINT_NAME = ${constraintName}
          AND REFERENCED_TABLE_NAME IS NOT NULL`,
  );
  return rows[0];
}

async function countRows(
  app: FastifyInstance,
  statement: SQL,
): Promise<number> {
  const rows = await queryRows<CountRow>(app, statement);
  return Number(rows[0]?.n ?? -1);
}

describe("Migraciones 0190 + 0191 — tenants, tenant_settings y anclas", () => {
  let app: FastifyInstance;
  let presentialBranchId: number;

  beforeAll(async () => {
    app = await createTestApp();
    const branchRows = (await app.db.select().from(schema.branches)) as Array<{
      id: number;
      code: string;
    }>;
    const presential = branchRows.find((b) => b.code !== "ONLINE");
    if (!presential) {
      throw new Error("Test fixture missing presential branch");
    }
    presentialBranchId = presential.id;
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // ─── 1. Forma de la tabla tenants (FUND-01) ─────────────────────────────
  it("Test 1: tenants.status es enum('active','suspended','archived') NOT NULL DEFAULT 'active'", async () => {
    const col = await getColumn(app, "tenants", "status");
    expect(col).toBeDefined();
    expect(col?.DATA_TYPE.toLowerCase()).toBe("enum");
    // Byte a byte: mismos valores y mismo orden que el mysqlEnum del schema.
    expect(col?.COLUMN_TYPE.toLowerCase()).toBe(
      "enum('active','suspended','archived')",
    );
    expect(col?.IS_NULLABLE).toBe("NO");
    expect(col?.COLUMN_DEFAULT).toBe("active");
  });

  it("Test 1b: tenants.slug es varchar(50) NOT NULL y los tres defaults del tenant son AR / ARS / America/Argentina/Buenos_Aires", async () => {
    const slug = await getColumn(app, "tenants", "slug");
    expect(slug).toBeDefined();
    expect(slug?.COLUMN_TYPE.toLowerCase()).toBe("varchar(50)");
    expect(slug?.IS_NULLABLE).toBe("NO");

    const country = await getColumn(app, "tenants", "default_country");
    expect(country?.COLUMN_DEFAULT).toBe("AR");
    expect(country?.IS_NULLABLE).toBe("NO");

    const currency = await getColumn(app, "tenants", "default_currency");
    expect(currency?.COLUMN_DEFAULT).toBe("ARS");
    expect(currency?.IS_NULLABLE).toBe("NO");

    const timezone = await getColumn(app, "tenants", "default_timezone");
    expect(timezone?.COLUMN_DEFAULT).toBe("America/Argentina/Buenos_Aires");
    expect(timezone?.IS_NULLABLE).toBe("NO");
  });

  it("Test 1c: tenants NO tiene una columna llamada tenant_status (trampa del primer argumento de mysqlEnum)", async () => {
    const cols = await queryRows<{ COLUMN_NAME: string }>(
      app,
      sql`SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tenants'`,
    );
    const names = new Set(cols.map((c) => c.COLUMN_NAME));
    // El snippet del README §5 pasa el nombre equivocado como primer argumento
    // de mysqlEnum, que en Drizzle es el NOMBRE DE COLUMNA FÍSICA (incidentes
    // 0138/0139). Si alguien "corrige" el schema hacia el snippet, este assert
    // lo caza antes que el drift llegue a producción.
    expect(names.has("status")).toBe(true);
    expect(names.has("tenant_status")).toBe(false);
  });

  // ─── 2. Unique, índices y FK de tenants / tenant_settings ───────────────
  it("Test 2: tenants_slug_unique, uq_tenant_setting y fk_tenant_settings_tenant existen con la forma esperada", async () => {
    const slugIdx = await getIndexRows(app, "tenants", "tenants_slug_unique");
    expect(slugIdx).toHaveLength(1);
    expect(slugIdx[0].COLUMN_NAME).toBe("slug");
    expect(Number(slugIdx[0].NON_UNIQUE)).toBe(0);

    // Unique COMPUESTA: dos filas en STATISTICS, en este orden.
    const kvIdx = await getIndexRows(
      app,
      "tenant_settings",
      "uq_tenant_setting",
    );
    expect(kvIdx).toHaveLength(2);
    expect(Number(kvIdx[0].SEQ_IN_INDEX)).toBe(1);
    expect(kvIdx[0].COLUMN_NAME).toBe("tenant_id");
    expect(Number(kvIdx[1].SEQ_IN_INDEX)).toBe(2);
    expect(kvIdx[1].COLUMN_NAME).toBe("setting_key");
    expect(Number(kvIdx[0].NON_UNIQUE)).toBe(0);

    const fk = await getForeignKey(app, "fk_tenant_settings_tenant");
    expect(fk).toBeDefined();
    expect(fk?.TABLE_NAME).toBe("tenant_settings");
    expect(fk?.COLUMN_NAME).toBe("tenant_id");
    expect(fk?.REFERENCED_TABLE_NAME).toBe("tenants");
    expect(fk?.REFERENCED_COLUMN_NAME).toBe("id");
  });

  // ─── 3. Seed del tenant 1 ───────────────────────────────────────────────
  it("Test 3: existe exactamente un tenant (id=1, el-templo, El Templo, active) y tenant_settings nace vacía", async () => {
    const total = await countRows(app, sql`SELECT COUNT(*) AS n FROM tenants`);
    expect(total).toBe(1);

    const rows = await queryRows<TenantRow>(
      app,
      sql`SELECT id, name, slug, status FROM tenants WHERE id = 1`,
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].id)).toBe(1);
    expect(rows[0].slug).toBe("el-templo");
    expect(rows[0].name).toBe("El Templo");
    expect(rows[0].status).toBe("active");

    // D-05: el KV por tenant nace vacío (coexistencia gradual con
    // system_settings, que no recibe tenant_id en todo el milestone).
    const settings = await countRows(
      app,
      sql`SELECT COUNT(*) AS n FROM tenant_settings`,
    );
    expect(settings).toBe(0);
  });

  // ─── 4. Anclas: users y branches (FUND-02) ──────────────────────────────
  it("Test 4: users.tenant_id y branches.tenant_id son INT NOT NULL DEFAULT 1", async () => {
    for (const table of ["users", "branches"]) {
      const col = await getColumn(app, table, "tenant_id");
      expect(col, `${table}.tenant_id debe existir`).toBeDefined();
      expect(col?.DATA_TYPE.toLowerCase()).toBe("int");
      expect(col?.IS_NULLABLE).toBe("NO");
      // El DEFAULT es la garantía de compatibilidad: sin él, los INSERT IGNORE
      // de test/setup.ts y el código viejo del rolling deploy no insertan fila.
      expect(String(col?.COLUMN_DEFAULT)).toBe("1");
    }
  });

  it("Test 4b: las anclas tienen idx_*_tenant_id y las FK fk_users_tenant / fk_branches_tenant apuntando a tenants", async () => {
    const usersIdx = await getIndexRows(app, "users", "idx_users_tenant_id");
    expect(usersIdx).toHaveLength(1);
    expect(usersIdx[0].COLUMN_NAME).toBe("tenant_id");

    const branchesIdx = await getIndexRows(
      app,
      "branches",
      "idx_branches_tenant_id",
    );
    expect(branchesIdx).toHaveLength(1);
    expect(branchesIdx[0].COLUMN_NAME).toBe("tenant_id");

    const usersFk = await getForeignKey(app, "fk_users_tenant");
    expect(usersFk).toBeDefined();
    expect(usersFk?.TABLE_NAME).toBe("users");
    expect(usersFk?.COLUMN_NAME).toBe("tenant_id");
    expect(usersFk?.REFERENCED_TABLE_NAME).toBe("tenants");
    expect(usersFk?.REFERENCED_COLUMN_NAME).toBe("id");

    const branchesFk = await getForeignKey(app, "fk_branches_tenant");
    expect(branchesFk).toBeDefined();
    expect(branchesFk?.TABLE_NAME).toBe("branches");
    expect(branchesFk?.COLUMN_NAME).toBe("tenant_id");
    expect(branchesFk?.REFERENCED_TABLE_NAME).toBe("tenants");
    expect(branchesFk?.REFERENCED_COLUMN_NAME).toBe("id");
  });

  it("Test 4c: el backfill dejó cero filas fuera del tenant 1 en las dos anclas", async () => {
    const strayUsers = await countRows(
      app,
      sql`SELECT COUNT(*) AS n FROM users WHERE tenant_id <> 1 OR tenant_id IS NULL`,
    );
    expect(strayUsers).toBe(0);

    const strayBranches = await countRows(
      app,
      sql`SELECT COUNT(*) AS n FROM branches WHERE tenant_id <> 1 OR tenant_id IS NULL`,
    );
    expect(strayBranches).toBe(0);

    // Sanity: las anclas no están vacías, así que el 0 de arriba es una
    // afirmación sobre filas reales y no sobre una tabla sin datos.
    const branchCount = await countRows(
      app,
      sql`SELECT COUNT(*) AS n FROM branches`,
    );
    expect(branchCount).toBeGreaterThan(0);
  });

  // ─── 5. Round-trip Drizzle: compatibilidad con el código viejo ──────────
  it("Test 5: insertar una branch por Drizzle SIN tenantId resuelve a tenant_id = 1", async () => {
    const code = `TN${Date.now()}`.slice(0, 20);
    // Exactamente la forma del código viejo y de test/setup.ts: la columna
    // nueva ni se menciona.
    const [inserted] = await app.db
      .insert(schema.branches)
      .values({ name: "Tenancy probe branch", code })
      .$returningId();

    try {
      const [readBack] = await app.db
        .select({
          id: schema.branches.id,
          tenantId: schema.branches.tenantId,
        })
        .from(schema.branches)
        .where(eq(schema.branches.id, inserted.id))
        .limit(1);

      expect(readBack).toBeDefined();
      expect(readBack.tenantId).toBe(1);
    } finally {
      // branches NO está en TABLES_TO_CLEAN: la fila se borra acá o queda
      // colgada para las suites vecinas del mismo worker.
      await app.db
        .delete(schema.branches)
        .where(eq(schema.branches.id, inserted.id));
    }
  });

  it("Test 5b: insertar un user por Drizzle SIN tenantId resuelve a tenant_id = 1", async () => {
    const [inserted] = await app.db
      .insert(schema.users)
      .values({
        email: `tenancy-probe-${Date.now()}@test.local`,
        passwordHash: "x".repeat(64),
        firstName: "Tenancy",
        lastName: "Probe",
        role: "member",
        branchId: presentialBranchId,
      })
      .$returningId();

    const [readBack] = await app.db
      .select({ id: schema.users.id, tenantId: schema.users.tenantId })
      .from(schema.users)
      .where(eq(schema.users.id, inserted.id))
      .limit(1);

    expect(readBack).toBeDefined();
    expect(readBack.tenantId).toBe(1);

    // users SÍ se limpia en el beforeEach, pero borrar acá deja el archivo
    // autocontenido y no depende del orden de los tests.
    await app.db.delete(schema.users).where(eq(schema.users.id, inserted.id));
  });

  // ─── 6. Idempotencia ────────────────────────────────────────────────────
  it("Test 6: cada migración de la fase aparece exactamente una vez en _migrations", async () => {
    const rows = await queryRows<MigrationRow>(
      app,
      sql`SELECT name, COUNT(*) AS n
          FROM _migrations
          WHERE name IN ('0190_tenants_core.sql', '0191_tenant_anchors.sql')
          GROUP BY name
          ORDER BY name`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("0190_tenants_core.sql");
    expect(Number(rows[0].n)).toBe(1);
    expect(rows[1].name).toBe("0191_tenant_anchors.sql");
    expect(Number(rows[1].n)).toBe(1);
  });

  // ─── 7. Slugs reservados (D-05) ─────────────────────────────────────────
  it("Test 7: RESERVED_TENANT_SLUGS cubre admin/api/www y no colisiona con el slug sembrado", async () => {
    const reserved: readonly string[] = RESERVED_TENANT_SLUGS;
    expect(reserved).toContain("admin");
    expect(reserved).toContain("api");
    expect(reserved).toContain("www");
    // El slug del tenant 1 no puede estar en la lista de reservados: sería un
    // tenant existente e inalcanzable el día que el alta valide contra ella.
    expect(reserved).not.toContain("el-templo");

    const rows = await queryRows<{ slug: string }>(
      app,
      sql`SELECT slug FROM tenants`,
    );
    for (const row of rows) {
      expect(reserved).not.toContain(row.slug);
    }
  });
});
