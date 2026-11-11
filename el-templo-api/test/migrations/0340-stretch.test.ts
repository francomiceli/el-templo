/**
 * Fase 213 Plan 01: migraciones 0340 y 0341 (estiramiento post-clase).
 *
 *  - 0340 (D-02, D-15, D-16) crea `stretch_catalog` (lista curada) y
 *    `stretch_offers` (una fila por alumno y dia = la oferta).
 *  - 0341 (D-02) carga la lista curada de 20 ejercicios, solo si el ejercicio
 *    existe con ese id Y ese nombre.
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations`: el
 * runner y el provisioning de tests toleran errores de DDL ("Duplicate",
 * "already exists"), asi que una migracion rota puede figurar como aplicada.
 *
 * La semilla NO se afirma contra filas vivas (en CI `exercises` esta vacia y
 * otros tests limpian tablas): se hace un guard ESTATICO sobre el texto del SQL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createTestApp } from "../helpers";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../src/db/migrations");
const TABLES = ["stretch_catalog", "stretch_offers"] as const;

interface TableRow extends RowDataPacket {
  tableName: string;
}

interface ColumnRow extends RowDataPacket {
  columnName: string;
  isNullable: string;
  columnDefault: string | null;
}

interface IndexRow extends RowDataPacket {
  indexName: string;
  nonUnique: number;
  seqInIndex: number;
  columnName: string;
}

interface FkRow extends RowDataPacket {
  constraintName: string;
  tableName: string;
  columnName: string;
  referencedTable: string;
}

interface CountRow extends RowDataPacket {
  total: number;
}

describe("Migraciones 0340/0341 — stretch_catalog y stretch_offers", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function columnas(tabla: string): Promise<ColumnRow[]> {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_NAME AS columnName,
              IS_NULLABLE AS isNullable,
              COLUMN_DEFAULT AS columnDefault
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?`,
      [tabla],
    )) as [ColumnRow[], unknown];
    return rows;
  }

  async function indice(tabla: string, nombre: string): Promise<IndexRow[]> {
    const [rows] = (await app.dbPool.query(
      `SELECT INDEX_NAME AS indexName,
              NON_UNIQUE AS nonUnique,
              SEQ_IN_INDEX AS seqInIndex,
              COLUMN_NAME AS columnName
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND INDEX_NAME = ?
        ORDER BY SEQ_IN_INDEX`,
      [tabla, nombre],
    )) as [IndexRow[], unknown];
    return rows;
  }

  it("0340: existen las dos tablas", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT TABLE_NAME AS tableName
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('stretch_catalog', 'stretch_offers')`,
    )) as [TableRow[], unknown];
    expect(rows.map((r) => r.tableName).sort()).toEqual([...TABLES].sort());
  });

  it("0340: tenant_id es NOT NULL con default 1 en ambas tablas", async () => {
    for (const tabla of TABLES) {
      const cols = await columnas(tabla);
      const tenant = cols.find((c) => c.columnName === "tenant_id");
      expect(tenant, `${tabla}.tenant_id no existe`).toBeDefined();
      expect(tenant?.isNullable, `${tabla}.tenant_id`).toBe("NO");
      expect(Number(tenant?.columnDefault), `${tabla}.tenant_id default`).toBe(
        1,
      );
    }
  });

  it("0340: la unique de stretch_offers es (tenant_id, user_id, local_date) con tenant primero", async () => {
    const rows = await indice(
      "stretch_offers",
      "uq_stretch_offers_tenant_user_date",
    );
    expect(rows.every((r) => Number(r.nonUnique) === 0)).toBe(true);
    expect(rows.map((r) => r.columnName)).toEqual([
      "tenant_id",
      "user_id",
      "local_date",
    ]);
  });

  it("0340: la unique de stretch_catalog es (tenant_id, exercise_id) con tenant primero", async () => {
    const rows = await indice(
      "stretch_catalog",
      "uq_stretch_catalog_tenant_exercise",
    );
    expect(rows.every((r) => Number(r.nonUnique) === 0)).toBe(true);
    expect(rows.map((r) => r.columnName)).toEqual(["tenant_id", "exercise_id"]);
  });

  it("0340: los indices de consulta existen con sus columnas en orden", async () => {
    expect(
      (
        await indice("stretch_catalog", "idx_stretch_catalog_tenant_family")
      ).map((r) => r.columnName),
    ).toEqual(["tenant_id", "family", "sort_order"]);
    expect(
      (await indice("stretch_offers", "idx_stretch_offers_tenant_date")).map(
        (r) => r.columnName,
      ),
    ).toEqual(["tenant_id", "local_date"]);
    expect(
      (
        await indice("stretch_offers", "idx_stretch_offers_tenant_user_queued")
      ).map((r) => r.columnName),
    ).toEqual(["tenant_id", "user_id", "push_queued_at"]);
  });

  it("0340: existen las 6 FK con sus nombres y destinos", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT CONSTRAINT_NAME AS constraintName,
              TABLE_NAME AS tableName,
              COLUMN_NAME AS columnName,
              REFERENCED_TABLE_NAME AS referencedTable
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('stretch_catalog', 'stretch_offers')
          AND REFERENCED_TABLE_NAME IS NOT NULL`,
    )) as [FkRow[], unknown];
    const porNombre = Object.fromEntries(
      rows.map((r) => [
        r.constraintName,
        `${r.tableName}.${r.columnName}->${r.referencedTable}`,
      ]),
    );
    expect(porNombre).toEqual({
      fk_stretch_catalog_tenant: "stretch_catalog.tenant_id->tenants",
      fk_stretch_catalog_exercise: "stretch_catalog.exercise_id->exercises",
      fk_stretch_offers_tenant: "stretch_offers.tenant_id->tenants",
      fk_stretch_offers_user: "stretch_offers.user_id->users",
      fk_stretch_offers_attendance: "stretch_offers.attendance_id->attendance",
      fk_stretch_offers_branch: "stretch_offers.branch_id->branches",
    });
  });

  it("0340: stretch_offers tiene las columnas de oferta, push, embudo y completado", async () => {
    const nombres = (await columnas("stretch_offers")).map((c) => c.columnName);
    for (const esperada of [
      "arm",
      "push_decision",
      "pending_notification_id",
      "card_seen_at",
      "push_opened_at",
      "started_at",
      "completed_at",
      "duration_seconds",
      "aura_awarded",
    ]) {
      expect(nombres, `stretch_offers.${esperada}`).toContain(esperada);
    }
  });

  it("0340: las marcas del embudo arrancan en NULL y pending_notification_id no tiene FK", async () => {
    const cols = await columnas("stretch_offers");
    for (const nombre of [
      "card_seen_at",
      "push_queued_at",
      "push_sent_at",
      "push_opened_at",
      "started_at",
      "completed_at",
    ]) {
      const col = cols.find((c) => c.columnName === nombre);
      expect(col?.isNullable, nombre).toBe("YES");
      expect(col?.columnDefault, nombre).toBeNull();
    }
  });

  it("0341: guard estatico de la semilla (20 INSERT IGNORE por id y nombre, sin ';' en comentarios)", () => {
    const source = readFileSync(
      path.join(MIGRATIONS_DIR, "0331_stretch_catalog_seed.sql"),
      "utf8",
    );
    const inserts = source
      .split("\n")
      .filter((l) => l.startsWith("INSERT IGNORE INTO `stretch_catalog`"));
    expect(inserts).toHaveLength(20);
    for (const insert of inserts) {
      expect(insert).toMatch(
        /WHERE e\.tenant_id = 1 AND e\.id = \d+ AND e\.exercise = '/,
      );
    }
    const comentarios = source.split("\n").filter((l) => l.startsWith("--"));
    expect(comentarios.filter((l) => l.includes(";"))).toEqual([]);
    // Lista de base: 5 ejercicios con orden propio 1..5.
    const base = inserts
      .map((l) => /, (\d+|NULL), 1 FROM exercises/.exec(l)?.[1])
      .filter((v) => v !== "NULL")
      .sort();
    expect(base).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("0341: la semilla no rompe el provisioning (el conteo del tenant 1 se puede leer)", async () => {
    // En la base de test no hay `exercises` de prod: la semilla inserta 0 filas.
    // Lo que se afirma es que la lectura funciona, no una cantidad.
    const [rows] = (await app.dbPool.query(
      `SELECT COUNT(*) AS total FROM stretch_catalog WHERE tenant_id = 1`,
    )) as [CountRow[], unknown];
    expect(Number(rows[0].total)).toBeGreaterThanOrEqual(0);
  });
});
