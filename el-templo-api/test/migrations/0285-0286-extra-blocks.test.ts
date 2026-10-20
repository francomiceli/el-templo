/**
 * Fase 197 Plan 01: migraciones 0285 y 0286 (bloque libre).
 *
 *  - 0285 (D-12) agrega la fuente de AURA `extra_block` al final del ENUM de
 *    `aura_transactions.source_type` y de `aura_config.aura_config_source_type`.
 *  - 0286 (D-13) crea la tabla gym-owned `extra_blocks_completed`.
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations`: el
 * runner y el provisioning de tests toleran errores de DDL ("Duplicate",
 * "already exists"), asi que una migracion rota puede figurar como aplicada.
 *
 * El seed de `aura_config` (fila `extra_block` en 5) NO se afirma contra la
 * fila viva: otros archivos del mismo worker borran `aura_config`
 * (test/sessions/session-complete-streak.test.ts). Por eso se hace un guard
 * ESTATICO sobre el texto del SQL, y los tests que dependen de la fuente
 * re-siembran la fila en su `beforeEach`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createTestApp } from "../helpers";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../src/db/migrations");

const EXPECTED_COLUMNS = [
  "id",
  "tenant_id",
  "user_id",
  "source_block_id",
  "source_day_id",
  "block_role",
  "local_date",
  "started_at",
  "ended_at",
  "duration_seconds",
  "exercises_completed",
  "aura_awarded",
  "created_at",
];

interface EnumTypeRow extends RowDataPacket {
  columnType: string;
}

interface ColumnRow extends RowDataPacket {
  columnName: string;
  columnDefault: string | null;
  isNullable: string;
}

interface IndexRow extends RowDataPacket {
  indexName: string;
  nonUnique: number;
  seqInIndex: number;
  columnName: string;
}

/** `enum('a','b')` -> ["a", "b"] */
function parseEnumValues(columnType: string): string[] {
  return Array.from(columnType.matchAll(/'([^']+)'/g), (m) => m[1]);
}

describe("Migraciones 0285-0286 — fuente extra_block y tabla extra_blocks_completed", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function enumValues(table: string, column: string): Promise<string[]> {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_TYPE AS columnType
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?`,
      [table, column],
    )) as [EnumTypeRow[], unknown];
    expect(rows.length, `${table}.${column} no existe`).toBe(1);
    return parseEnumValues(rows[0].columnType);
  }

  describe("0285 — ENUM de AURA", () => {
    it("aura_transactions.source_type termina en extra_block", async () => {
      const values = await enumValues("aura_transactions", "source_type");
      expect(values).toContain("extra_block");
      expect(values[values.length - 1]).toBe("extra_block");
    });

    it("aura_config.aura_config_source_type termina en extra_block", async () => {
      const values = await enumValues(
        "aura_config",
        "aura_config_source_type",
      );
      expect(values).toContain("extra_block");
      expect(values[values.length - 1]).toBe("extra_block");
    });

    it("las dos listas de ENUM son identicas", async () => {
      const tx = await enumValues("aura_transactions", "source_type");
      const cfg = await enumValues("aura_config", "aura_config_source_type");
      expect(cfg).toEqual(tx);
    });

    it("guard estatico: la 0285 siembra extra_block en 5 con INSERT IGNORE", () => {
      const source = readFileSync(
        path.join(MIGRATIONS_DIR, "0285_aura_source_extra_block.sql"),
        "utf8",
      );
      expect(source).toContain("INSERT IGNORE INTO `aura_config`");
      expect(source).toContain("('extra_block', 5,");
    });
  });

  describe("0286 — extra_blocks_completed", () => {
    it("existe con las 13 columnas del contrato", async () => {
      const [rows] = (await app.dbPool.query(
        `SELECT COLUMN_NAME AS columnName,
                COLUMN_DEFAULT AS columnDefault,
                IS_NULLABLE AS isNullable
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'extra_blocks_completed'`,
      )) as [ColumnRow[], unknown];
      const names = rows.map((r) => r.columnName).sort();
      expect(names).toEqual([...EXPECTED_COLUMNS].sort());
      // Todas NOT NULL: no hay datos opcionales en un bloque cerrado.
      expect(rows.filter((r) => r.isNullable === "YES")).toEqual([]);
    });

    it("aura_awarded tiene default 0", async () => {
      const [rows] = (await app.dbPool.query(
        `SELECT COLUMN_DEFAULT AS columnDefault
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'extra_blocks_completed'
            AND COLUMN_NAME = 'aura_awarded'`,
      )) as [ColumnRow[], unknown];
      expect(rows.length).toBe(1);
      expect(Number(rows[0].columnDefault)).toBe(0);
    });

    it("tiene un indice que arranca con tenant_id", async () => {
      const [rows] = (await app.dbPool.query(
        `SELECT INDEX_NAME AS indexName,
                NON_UNIQUE AS nonUnique,
                SEQ_IN_INDEX AS seqInIndex,
                COLUMN_NAME AS columnName
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'extra_blocks_completed'`,
      )) as [IndexRow[], unknown];
      const leadingTenant = rows.filter(
        (r) => r.seqInIndex === 1 && r.columnName === "tenant_id",
      );
      expect(leadingTenant.length).toBeGreaterThan(0);
    });

    it("no tiene uniques salvo la PRIMARY (varios bloques por dia)", async () => {
      const [rows] = (await app.dbPool.query(
        `SELECT DISTINCT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'extra_blocks_completed'`,
      )) as [IndexRow[], unknown];
      const uniques = rows
        .filter((r) => Number(r.nonUnique) === 0)
        .map((r) => r.indexName);
      expect(uniques).toEqual(["PRIMARY"]);
    });

    it("tiene la FK a tenants", async () => {
      const [rows] = (await app.dbPool.query(
        `SELECT CONSTRAINT_NAME AS columnName
           FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'extra_blocks_completed'
            AND COLUMN_NAME = 'tenant_id'
            AND REFERENCED_TABLE_NAME = 'tenants'`,
      )) as [ColumnRow[], unknown];
      expect(rows.length).toBeGreaterThan(0);
    });
  });
});
