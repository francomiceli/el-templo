/**
 * Fase 195 Plan 01 (D-10, D-07, D-16, D-30, D-28; T-195-01/T-195-02):
 * migraciones 0270 (columnas web de `branches`) y 0271 (datos de sedes y
 * WhatsApp de ventas por pais).
 *
 *   A. Forma: tipos, nulabilidad y defaults de las 16 columnas + la unique
 *      (tenant_id, web_slug) en ese orden.
 *   B. Datos: con las sedes de produccion sembradas (mismos codigos), la 0271
 *      deja slug, nombre publico, direccion, geo y publicacion esperados.
 *   C. Idempotencia: aplicar la 0271 dos veces deja el mismo snapshot.
 *   D. La 0271 NO pisa un WhatsApp ya cargado desde el admin; sin fila previa,
 *      siembra AR y ES.
 *   E. Ningun .sql tiene punto y coma dentro de un comentario `--` (el runner
 *      parte por punto y coma antes de sacar los comentarios).
 *
 * El SQL se lee de disco y se parte con `splitSqlStatements` (el MISMO parser
 * que usa el runner de produccion).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { createTestApp } from "../helpers";
import { splitSqlStatements } from "../../src/db/run-migrations";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../src/db/migrations");
const PATH_0270 = path.join(MIGRATIONS_DIR, "0270_branches_web_fields.sql");
const PATH_0271 = path.join(MIGRATIONS_DIR, "0271_seed_branches_web.sql");

/**
 * Codigos de sede que usa este test (los de produccion). Algunas ya existen en
 * la DB de test (las siembran migraciones historicas: PARK, CHAPADMALAL,
 * ALBERTI) y OTRAS NO. El test inserta solo las que faltan y, al terminar,
 * borra SOLO esas: las preexistentes tienen cash_registers colgando (FK) y las
 * comparten los demas archivos del worker. NUNCA incluye 'TEST' ni 'ONLINE'.
 */
const SEEDED_CODES = [
  "CONST",
  "JUJUY",
  "MORENO",
  "ALEM",
  "ALBERTI",
  "MOGOTES",
  "PARK",
  "CHAPADMALAL",
  "BCN",
] as const;

/** Estado "previo a la 0271" con nombres y direcciones de produccion. */
const PREVIO: Record<
  (typeof SEEDED_CODES)[number],
  { name: string; country: string; address: string; publish: number }
> = {
  CONST: {
    name: "Constitucion",
    country: "AR",
    address: "Av. Constitución 6745",
    publish: 0,
  },
  JUJUY: { name: "Jujuy", country: "AR", address: "Jujuy 3761", publish: 0 },
  MORENO: { name: "Moreno", country: "AR", address: "Moreno 3751", publish: 0 },
  ALEM: {
    name: "Juan B. Justo",
    country: "AR",
    address: "Alem 3958",
    publish: 0,
  },
  ALBERTI: {
    name: "Alberti",
    country: "AR",
    address: "Alberti 2024",
    publish: 0,
  },
  MOGOTES: {
    name: "Mario Bravo",
    country: "AR",
    address: "Mario Bravo 618",
    publish: 0,
  },
  PARK: {
    name: "El Templo Park",
    country: "AR",
    address: "Parque Primavesi",
    publish: 0,
  },
  CHAPADMALAL: {
    name: "Chapadmalal",
    country: "AR",
    address: "Los Lobos, Chapadmalal",
    publish: 1,
  },
  BCN: {
    name: "Barcelona",
    country: "AR",
    address: "Eixample, Av. Diagonal 368",
    publish: 0,
  },
};

const KEY_AR = "whatsapp.sales_number.AR";
const KEY_ES = "whatsapp.sales_number.ES";
const SEED_AR = "5492235820521";
const SEED_ES = "34680774331";

interface ColumnRow {
  name: string;
  type: string;
  nullable: string;
  dflt: string | null;
}
interface IndexRow {
  col: string;
  seq: number;
  nonUnique: number;
}
interface BranchRow {
  code: string;
  web_slug: string | null;
  public_name: string | null;
  address: string | null;
  locality: string | null;
  region: string | null;
  country: string;
  publish_on_web: number;
  web_kind: string;
  latitude: string | null;
  longitude: string | null;
  photo_url: string | null;
  place_id: string | null;
  phone: string | null;
  name: string;
}
interface SettingRow {
  setting_key: string;
  setting_value: string;
}

interface Executor {
  execute(query: SQL): Promise<unknown>;
}

/** mysql2 devuelve `[rows, fields]`; drizzle `execute` lo pasa tal cual. */
function rowsOf<T>(result: unknown): T[] {
  const rows = Array.isArray(result) ? result[0] : result;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

describe("Migraciones 0270 + 0271 — columnas web de branches y datos de sedes", () => {
  let app: FastifyInstance;
  let statements0271: string[];

  async function applyMigration(
    stmts: string[],
    db: Executor = app.db,
  ): Promise<void> {
    for (const stmt of stmts) {
      await db.execute(sql.raw(stmt));
    }
  }

  /** Codigos que este test inserto (no existian) y por lo tanto debe borrar. */
  const insertedCodes: string[] = [];

  async function seedBranches(): Promise<void> {
    for (const code of SEEDED_CODES) {
      const previo = PREVIO[code];
      const existing = rowsOf<{ id: number }>(
        await app.db.execute(
          sql`SELECT id FROM branches WHERE tenant_id = ${TENANT_TEMPLO} AND code = ${code}`,
        ),
      );
      if (existing.length === 0) {
        await app.db.execute(sql`
          INSERT INTO branches (tenant_id, name, code, country, address)
          VALUES (${TENANT_TEMPLO}, ${previo.name}, ${code}, ${previo.country}, ${previo.address})
        `);
        if (!insertedCodes.includes(code)) insertedCodes.push(code);
      }
      // Estado "previo a la 0271": sin ninguna columna web cargada y con la
      // direccion/pais viejos. CHAPADMALAL arranca publicada para probar que
      // la 0271 la saca de la web. No se toca `name`.
      await app.db.execute(sql`
        UPDATE branches
        SET web_slug = NULL, public_name = NULL, locality = NULL, region = NULL,
            postal_code = NULL, phone = NULL, latitude = NULL, longitude = NULL,
            place_id = NULL, maps_url = NULL, photo_url = NULL,
            publish_on_web = ${previo.publish}, web_kind = 'gym',
            country = ${previo.country}, address = ${previo.address}
        WHERE tenant_id = ${TENANT_TEMPLO} AND code = ${code}
      `);
    }
  }

  async function readBranches(): Promise<Map<string, BranchRow>> {
    const rows = rowsOf<BranchRow>(
      await app.db.execute(sql`
        SELECT code, name, web_slug, public_name, address, locality, region,
               country, publish_on_web, web_kind, latitude, longitude,
               photo_url, place_id, phone
        FROM branches
        WHERE tenant_id = ${TENANT_TEMPLO}
          AND code IN (${sql.join(
            SEEDED_CODES.map((c) => sql`${c}`),
            sql`, `,
          )})
        ORDER BY code
      `),
    );
    return new Map(rows.map((r) => [r.code, r]));
  }

  async function readSalesNumbers(
    db: Executor = app.db,
  ): Promise<Map<string, string>> {
    const rows = rowsOf<SettingRow>(
      await db.execute(sql`
        SELECT setting_key, setting_value
        FROM tenant_settings
        WHERE tenant_id = ${TENANT_TEMPLO}
          AND setting_key LIKE 'whatsapp.sales_number.%'
      `),
    );
    return new Map(rows.map((r) => [r.setting_key, r.setting_value]));
  }

  beforeAll(async () => {
    app = await createTestApp();
    statements0271 = splitSqlStatements(readFileSync(PATH_0271, "utf8"));
    expect(statements0271.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    // Deja las sedes preexistentes en el estado migrado (la 0271 es
    // idempotente) y borra SOLO las que inserto este test. La DB de test la
    // comparten los archivos del worker (isolate:false).
    await applyMigration(statements0271);
    for (const code of insertedCodes) {
      await app.db.execute(
        sql`DELETE FROM branches WHERE tenant_id = ${TENANT_TEMPLO} AND code = ${code}`,
      );
    }
    // Deja los dos settings de WhatsApp con el valor sembrado por la 0271
    // (el namespace lo comparten sales-number.test.ts y los de comunicaciones).
    await app.db.execute(
      sql`DELETE FROM tenant_settings
          WHERE tenant_id = ${TENANT_TEMPLO}
            AND setting_key IN (${KEY_AR}, ${KEY_ES})`,
    );
    await applyMigration(statements0271);
    await app.close();
  });

  beforeEach(async () => {
    await seedBranches();
  });

  // ─── A. Forma (0270) ──────────────────────────────────────────────────────

  it("A. branches tiene las 16 columnas web con tipo, nulabilidad y default exactos", async () => {
    const rows = rowsOf<ColumnRow>(
      await app.db.execute(sql`
        SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type,
               IS_NULLABLE AS nullable, COLUMN_DEFAULT AS dflt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'branches'
      `),
    );
    const byName = new Map(rows.map((r) => [r.name, r]));

    const esperadas: Array<{
      name: string;
      type: string;
      nullable: "YES" | "NO";
      dflt?: string | null;
    }> = [
      { name: "web_slug", type: "varchar(60)", nullable: "YES" },
      { name: "public_name", type: "varchar(100)", nullable: "YES" },
      { name: "publish_on_web", type: "tinyint(1)", nullable: "NO", dflt: "0" },
      {
        name: "web_kind",
        type: "enum('gym','community_space')",
        nullable: "NO",
        dflt: "gym",
      },
      { name: "locality", type: "varchar(100)", nullable: "YES" },
      { name: "region", type: "varchar(100)", nullable: "YES" },
      { name: "postal_code", type: "varchar(20)", nullable: "YES" },
      { name: "phone", type: "varchar(30)", nullable: "YES" },
      { name: "latitude", type: "decimal(9,6)", nullable: "YES" },
      { name: "longitude", type: "decimal(9,6)", nullable: "YES" },
      { name: "place_id", type: "varchar(255)", nullable: "YES" },
      { name: "maps_url", type: "varchar(500)", nullable: "YES" },
      { name: "photo_url", type: "varchar(500)", nullable: "YES" },
      { name: "gbp_location_id", type: "varchar(100)", nullable: "YES" },
      { name: "gbp_synced_hash", type: "char(64)", nullable: "YES" },
      { name: "gbp_synced_at", type: "timestamp", nullable: "YES" },
    ];
    expect(esperadas).toHaveLength(16);

    for (const e of esperadas) {
      const col = byName.get(e.name);
      expect(col, `falta la columna branches.${e.name}`).toBeDefined();
      expect(col?.type, `tipo de ${e.name}`).toBe(e.type);
      expect(col?.nullable, `nulabilidad de ${e.name}`).toBe(e.nullable);
      if (e.dflt !== undefined) {
        expect(String(col?.dflt), `default de ${e.name}`).toBe(e.dflt);
      }
    }
  });

  it("A. existe la unique uq_branches_tenant_web_slug sobre (tenant_id, web_slug) en ese orden", async () => {
    const rows = rowsOf<IndexRow>(
      await app.db.execute(sql`
        SELECT COLUMN_NAME AS col, SEQ_IN_INDEX AS seq, NON_UNIQUE AS nonUnique
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'branches'
          AND INDEX_NAME = 'uq_branches_tenant_web_slug'
        ORDER BY SEQ_IN_INDEX
      `),
    );
    expect(rows.map((r) => r.col)).toEqual(["tenant_id", "web_slug"]);
    expect(rows.every((r) => Number(r.nonUnique) === 0)).toBe(true);
  });

  it("A. la unique impide repetir el slug dentro del mismo gimnasio", async () => {
    await applyMigration(statements0271);
    await expect(
      app.db.execute(sql`
        UPDATE branches SET web_slug = 'jujuy'
        WHERE tenant_id = ${TENANT_TEMPLO} AND code = 'MORENO'
      `),
    ).rejects.toThrow();
  });

  // ─── B. Datos (0271) ──────────────────────────────────────────────────────

  it("B. 0271 deja los datos web esperados de cada sede", async () => {
    await applyMigration(statements0271);
    const b = await readBranches();

    const alem = b.get("ALEM");
    expect(alem?.web_slug).toBe("juan-b-justo");
    expect(alem?.public_name).toBe("Juan B. Justo");
    expect(alem?.address).toBe("Juan B. Justo 1018");
    expect(Number(alem?.publish_on_web)).toBe(1);
    expect(alem?.web_kind).toBe("gym");
    expect(Number(alem?.latitude)).toBeCloseTo(-38.0335, 6);
    expect(Number(alem?.longitude)).toBeCloseTo(-57.5522, 6);
    expect(alem?.locality).toBe("Mar del Plata");
    expect(alem?.region).toBe("Buenos Aires");

    const park = b.get("PARK");
    expect(park?.web_slug).toBe("parque-primavesi");
    expect(park?.web_kind).toBe("community_space");
    expect(Number(park?.publish_on_web)).toBe(1);
    expect(park?.photo_url).toBe("/images/photos/sede-park.webp");

    expect(Number(b.get("CHAPADMALAL")?.publish_on_web)).toBe(0);

    const bcn = b.get("BCN");
    expect(bcn?.web_slug).toBe("barcelona");
    expect(bcn?.public_name).toBe("Barcelona (Eixample)");
    expect(bcn?.address).toBe("Av. Diagonal 368");
    expect(bcn?.locality).toBe("Barcelona");
    expect(bcn?.country).toBe("ES");
    expect(Number(bcn?.latitude)).toBeCloseTo(41.3996, 6);

    expect(b.get("CONST")?.public_name).toBe("Constitución");
    expect(b.get("CONST")?.web_slug).toBe("constitucion");
    expect(b.get("MOGOTES")?.web_slug).toBe("mario-bravo");
    expect(b.get("MOGOTES")?.public_name).toBe("Mario Bravo");
    expect(b.get("JUJUY")?.web_slug).toBe("jujuy");
    expect(b.get("MORENO")?.web_slug).toBe("moreno");
    expect(b.get("ALBERTI")?.web_slug).toBe("alberti");

    // Las 6 sedes de Mar del Plata + Barcelona son gimnasios publicados.
    const publicadasGym = [...b.values()].filter(
      (r) => Number(r.publish_on_web) === 1 && r.web_kind === "gym",
    );
    expect(publicadasGym.map((r) => r.code).sort()).toEqual(
      ["ALBERTI", "ALEM", "BCN", "CONST", "JUJUY", "MOGOTES", "MORENO"].sort(),
    );
  });

  it("B. 0271 no toca name, place_id ni phone (llegan con los datos de Franco)", async () => {
    const nombresAntes = new Map(
      [...(await readBranches()).entries()].map(([c, r]) => [c, r.name]),
    );
    await applyMigration(statements0271);
    const b = await readBranches();
    for (const [code, row] of b) {
      expect(row.name, `name de ${code}`).toBe(nombresAntes.get(code));
      expect(row.place_id).toBeNull();
      expect(row.phone).toBeNull();
    }
  });

  it("B. ONLINE queda sin publicar aunque estuviera publicada", async () => {
    await app.db.execute(
      sql`UPDATE branches SET publish_on_web = 1 WHERE tenant_id = ${TENANT_TEMPLO} AND code = 'ONLINE'`,
    );
    await applyMigration(statements0271);
    const rows = rowsOf<{ publish_on_web: number }>(
      await app.db.execute(
        sql`SELECT publish_on_web FROM branches WHERE tenant_id = ${TENANT_TEMPLO} AND code = 'ONLINE'`,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].publish_on_web)).toBe(0);
  });

  it("B. la 0271 solo actualiza: no crea sedes nuevas", async () => {
    const antes = await readBranches();
    await applyMigration(statements0271);
    const despues = await readBranches();
    expect([...despues.keys()].sort()).toEqual([...antes.keys()].sort());
  });

  it("B. la 0271 NO toca sedes de otro gimnasio con el mismo code, y la unique es por tenant", async () => {
    // Id propio y alto: la DB de test la comparten los archivos del worker.
    const OTRO_TENANT = 90195;
    await app.db.execute(
      sql`DELETE FROM branches WHERE tenant_id = ${OTRO_TENANT}`,
    );
    await app.db.execute(sql`DELETE FROM tenants WHERE id = ${OTRO_TENANT}`);
    await app.db.execute(sql`
      INSERT INTO tenants (id, name, slug, status)
      VALUES (${OTRO_TENANT}, 'Gimnasio de prueba 195', 'test-195-01', 'active')
    `);
    try {
      await app.db.execute(sql`
        INSERT INTO branches (tenant_id, name, code, country, address, web_slug)
        VALUES (${OTRO_TENANT}, 'Otro gym', 'ALEM', 'AR', 'Calle ajena 1', 'juan-b-justo')
      `);
      // Mismo web_slug que El Templo: la unique es (tenant_id, web_slug), no
      // global. Si fuera global este INSERT ya habria fallado... y tambien lo
      // haria el UPDATE de la 0271 sobre el ALEM de El Templo.
      await applyMigration(statements0271);

      const ajena = rowsOf<BranchRow>(
        await app.db.execute(sql`
          SELECT code, name, web_slug, public_name, address, publish_on_web, web_kind
          FROM branches WHERE tenant_id = ${OTRO_TENANT}
        `),
      );
      expect(ajena).toHaveLength(1);
      expect(ajena[0].address).toBe("Calle ajena 1");
      expect(ajena[0].public_name).toBeNull();
      expect(Number(ajena[0].publish_on_web)).toBe(0);
      expect((await readBranches()).get("ALEM")?.web_slug).toBe("juan-b-justo");
    } finally {
      await app.db.execute(
        sql`DELETE FROM branches WHERE tenant_id = ${OTRO_TENANT}`,
      );
      await app.db.execute(sql`DELETE FROM tenants WHERE id = ${OTRO_TENANT}`);
    }
  });

  // ─── C. Idempotencia ──────────────────────────────────────────────────────

  it("C. aplicar la 0271 dos veces deja el mismo snapshot de branches y de tenant_settings", async () => {
    await applyMigration(statements0271);
    const branches1 = [...(await readBranches()).entries()];
    const settings1 = [...(await readSalesNumbers()).entries()].sort();

    await applyMigration(statements0271);
    const branches2 = [...(await readBranches()).entries()];
    const settings2 = [...(await readSalesNumbers()).entries()].sort();

    expect(branches2).toEqual(branches1);
    expect(settings2).toEqual(settings1);
    expect(settings2.map(([k]) => k)).toEqual([KEY_AR, KEY_ES]);
  });

  // ─── D. WhatsApp de ventas ────────────────────────────────────────────────

  it("D. un WhatsApp ya cargado desde el admin NO se pisa", async () => {
    // Transaccion con rollback: el namespace lo borran en paralelo otros
    // archivos (sales-number.test.ts) y esto evita la carrera.
    const ROLLBACK = new Error("rollback");
    let snapshot: Map<string, string> | null = null;
    await expect(
      app.db.transaction(async (tx) => {
        await tx.execute(
          sql`DELETE FROM tenant_settings
              WHERE tenant_id = ${TENANT_TEMPLO}
                AND setting_key LIKE 'whatsapp.sales_number.%'`,
        );
        await tx.execute(
          sql`INSERT INTO tenant_settings (tenant_id, setting_key, setting_value)
              VALUES (${TENANT_TEMPLO}, ${KEY_AR}, '5491100000000')`,
        );
        await applyMigration(statements0271, tx);
        snapshot = await readSalesNumbers(tx);
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.get(KEY_AR)).toBe("5491100000000");
    expect(snapshot!.get(KEY_ES)).toBe(SEED_ES);
  });

  it("D. sin fila previa, la 0271 siembra AR y ES", async () => {
    const ROLLBACK = new Error("rollback");
    let snapshot: Map<string, string> | null = null;
    await expect(
      app.db.transaction(async (tx) => {
        await tx.execute(
          sql`DELETE FROM tenant_settings
              WHERE tenant_id = ${TENANT_TEMPLO}
                AND setting_key LIKE 'whatsapp.sales_number.%'`,
        );
        await applyMigration(statements0271, tx);
        snapshot = await readSalesNumbers(tx);
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.get(KEY_AR)).toBe(SEED_AR);
    expect(snapshot!.get(KEY_ES)).toBe(SEED_ES);
    // Mismo criterio que sales-number.ts: solo digitos, 8 a 15.
    for (const v of snapshot!.values()) {
      expect(v).toMatch(/^[0-9]{8,15}$/);
    }
  });

  // ─── E. Sin punto y coma en comentarios ───────────────────────────────────

  it("E. ningun .sql tiene punto y coma dentro de un comentario `--`", () => {
    for (const file of [PATH_0270, PATH_0271]) {
      const lineasMalas = readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.trimStart().startsWith("--") && l.includes(";"));
      expect(lineasMalas, path.basename(file)).toEqual([]);
    }
  });

  it("E. el parser del runner parte 0270 en 2 sentencias y 0271 en 10", () => {
    expect(splitSqlStatements(readFileSync(PATH_0270, "utf8"))).toHaveLength(2);
    expect(splitSqlStatements(readFileSync(PATH_0271, "utf8"))).toHaveLength(
      10,
    );
  });
});
