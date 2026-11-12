/**
 * Fase 213 Plan 05: migracion 0342 (fuente de AURA `stretch`, D-08).
 *
 * Agrega `stretch` AL FINAL del ENUM de `aura_transactions.source_type` y de
 * `aura_config.aura_config_source_type`. Se consulta INFORMATION_SCHEMA de la
 * base del worker y no `_migrations` (el runner de tests tolera errores de DDL).
 *
 * El seed de `aura_config` (fila `stretch` en 5) NO se afirma contra la fila
 * viva: otros archivos del mismo worker borran `aura_config`. Por eso se hace
 * un guard ESTATICO sobre el texto del SQL, y los tests que dependen de la
 * fuente re-siembran la fila en su `beforeEach`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createTestApp } from "../helpers";

const MIGRATION = path.resolve(
  __dirname,
  "../../src/db/migrations/0342_aura_source_stretch.sql",
);

interface EnumTypeRow extends RowDataPacket {
  columnType: string;
}

/** `enum('a','b')` -> ["a", "b"] */
function parseEnumValues(columnType: string): string[] {
  return Array.from(columnType.matchAll(/'([^']+)'/g), (m) => m[1]);
}

describe("Migracion 0342 — fuente de AURA stretch", () => {
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

  // No se afirma que sea el ULTIMO valor: la proxima fuente de AURA se agrega
  // al final y romperia este test (paso con la 0285 al agregar `stretch`). El
  // orden relativo a `extra_block` lo cubre el test de mas abajo.
  it("aura_transactions.source_type incluye stretch", async () => {
    const values = await enumValues("aura_transactions", "source_type");
    expect(values).toContain("stretch");
  });

  it("aura_config.aura_config_source_type incluye stretch", async () => {
    const values = await enumValues("aura_config", "aura_config_source_type");
    expect(values).toContain("stretch");
  });

  it("las dos listas de ENUM son identicas", async () => {
    const tx = await enumValues("aura_transactions", "source_type");
    const cfg = await enumValues("aura_config", "aura_config_source_type");
    expect(cfg).toEqual(tx);
  });

  it("conserva los valores anteriores (extra_block sigue en su lugar)", async () => {
    const tx = await enumValues("aura_transactions", "source_type");
    expect(tx).toContain("extra_block");
    expect(tx.indexOf("extra_block")).toBeLessThan(tx.indexOf("stretch"));
  });

  it("guard estatico: siembra stretch en 5 con INSERT IGNORE", () => {
    const source = readFileSync(MIGRATION, "utf8");
    expect(source).toContain("INSERT IGNORE INTO `aura_config`");
    expect(source).toContain("('stretch', 5,");
  });

  it("guard estatico: ningun comentario SQL contiene punto y coma", () => {
    const source = readFileSync(MIGRATION, "utf8");
    const offenders = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("--") && line.includes(";"));
    expect(offenders).toEqual([]);
  });
});
