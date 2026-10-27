/**
 * Fase 202 plan 202-01: migraciones 0298 y 0299 (Conquer: correcciones y
 * tutoriales con video, DA-37), contrato de estructura.
 *
 *  - 0298: `conquer_corrections` (el alumno manda un video, el coach responde).
 *  - 0299: `conquer_tutorials` (un video por ejercicio o por combo).
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations`: el
 * runner y el provisioning de tests toleran errores de DDL ("Duplicate",
 * "already exists"), asi que una migracion rota puede figurar como aplicada.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { createTestApp } from "../helpers";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../src/db/migrations");

const MIGRATION_FILES = [
  "0298_conquer_corrections.sql",
  "0299_conquer_tutorials.sql",
] as const;

const VIDEO_TABLES = ["conquer_corrections", "conquer_tutorials"] as const;

/** [tabla, columna, ¿admite NULL?] — DA-41, DA-45, DA-46, DA-48. */
const NULLABLE_COLUMNS: ReadonlyArray<readonly [string, string, boolean]> = [
  ["conquer_corrections", "video_key", true],
  ["conquer_corrections", "video_seconds", false],
  ["conquer_corrections", "reply_seen_at", true],
  ["conquer_tutorials", "video_key", false],
];

interface TenantColumnRow extends RowDataPacket {
  dataType: string;
  isNullable: string;
  columnDefault: string | null;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface UniqueIndexRow extends RowDataPacket {
  indexName: string;
  columnName: string;
}

interface NullableRow extends RowDataPacket {
  isNullable: string;
}

interface ColumnTypeRow extends RowDataPacket {
  columnType: string;
}

describe("Migraciones 0298-0299 — estructura de conquer_corrections y conquer_tutorials", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(VIDEO_TABLES)("%s existe", async (table) => {
    const [rows] = (await app.dbPool.query(
      `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?`,
      [table],
    )) as [CountRow[], unknown];
    expect(Number(rows[0].total)).toBe(1);
  });

  it.each(VIDEO_TABLES)(
    "%s.tenant_id es int NOT NULL DEFAULT 1",
    async (table) => {
      const [rows] = (await app.dbPool.query(
        `SELECT DATA_TYPE AS dataType,
              IS_NULLABLE AS isNullable,
              COLUMN_DEFAULT AS columnDefault
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = 'tenant_id'`,
        [table],
      )) as [TenantColumnRow[], unknown];
      expect(rows.length, `${table}.tenant_id no existe`).toBe(1);
      expect(rows[0].dataType).toBe("int");
      expect(rows[0].isNullable).toBe("NO");
      expect(Number(rows[0].columnDefault)).toBe(1);
    },
  );

  it.each(VIDEO_TABLES)(
    "%s tiene la FK de tenant_id a tenants",
    async (table) => {
      const [rows] = (await app.dbPool.query(
        `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = 'tenant_id'
          AND REFERENCED_TABLE_NAME = 'tenants'`,
        [table],
      )) as [CountRow[], unknown];
      expect(Number(rows[0].total)).toBeGreaterThan(0);
    },
  );

  it.each(VIDEO_TABLES)(
    "%s: todo UNIQUE no-PRIMARY arranca con tenant_id (y hay al menos uno)",
    async (table) => {
      const [rows] = (await app.dbPool.query(
        `SELECT INDEX_NAME AS indexName, COLUMN_NAME AS columnName
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND NON_UNIQUE = 0
            AND INDEX_NAME <> 'PRIMARY'
            AND SEQ_IN_INDEX = 1`,
        [table],
      )) as [UniqueIndexRow[], unknown];
      // Sin esta guarda el test pasaria "vacio" si la tabla perdiera sus UNIQUE.
      expect(rows.length, `${table} no tiene UNIQUE`).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.columnName, `${table}.${row.indexName}`).toBe("tenant_id");
      }
    },
  );

  it.each(NULLABLE_COLUMNS)(
    "%s.%s admite NULL: %s",
    async (table, column, nullable) => {
      const [rows] = (await app.dbPool.query(
        `SELECT IS_NULLABLE AS isNullable
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = ?`,
        [table, column],
      )) as [NullableRow[], unknown];
      expect(rows.length, `${table}.${column} no existe`).toBe(1);
      expect(rows[0].isNullable).toBe(nullable ? "YES" : "NO");
    },
  );

  it("conquer_corrections.status tiene el enum exacto del schema", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_TYPE AS columnType
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'conquer_corrections'
          AND COLUMN_NAME = 'status'`,
    )) as [ColumnTypeRow[], unknown];
    expect(rows.length).toBe(1);
    expect(rows[0].columnType).toBe("enum('pendiente','respondida')");
  });

  it.each(MIGRATION_FILES)("%s no tiene ; dentro de un comentario", (file) => {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    const offending = sql
      .split("\n")
      .filter((line) => /^\s*--/.test(line) && line.includes(";"));
    expect(offending).toEqual([]);
  });
});
