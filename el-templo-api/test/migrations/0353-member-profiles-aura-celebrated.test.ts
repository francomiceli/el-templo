/**
 * Fase 215 (#33): migración 0353, columna `aura_celebrated_until_id` en
 * `member_profiles` (marca de la celebración de Aura).
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations` (el
 * runner de tests tolera errores de DDL). Un guard estático sobre el texto del
 * SQL cuida que no haya `;` dentro de un comentario ni datos sembrados.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createTestApp } from "../helpers";

const SQL_PATH = path.resolve(
  __dirname,
  "../../src/db/migrations/0353_member_profiles_aura_celebrated.sql",
);

interface ColumnRow extends RowDataPacket {
  columnType: string;
  nullable: string;
  defaultValue: string | null;
}

describe("Migración 0353 — member_profiles.aura_celebrated_until_id", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("la columna existe, es INT, admite NULL y no tiene default", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable,
              COLUMN_DEFAULT AS defaultValue
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profiles'
          AND COLUMN_NAME = 'aura_celebrated_until_id'`,
    )) as [ColumnRow[], unknown];

    expect(rows).toHaveLength(1);
    expect(rows[0].columnType).toMatch(/^int/);
    expect(rows[0].nullable).toBe("YES");
    expect([null, "NULL"]).toContain(rows[0].defaultValue);
  });

  it("el SQL no tiene ';' dentro de comentarios ni inserta datos", () => {
    const sqlText = readFileSync(SQL_PATH, "utf8");
    for (const line of sqlText.split("\n")) {
      if (line.trim().startsWith("--")) {
        expect(line.replace("--> statement-breakpoint", "")).not.toContain(";");
      }
    }
    expect(sqlText).not.toMatch(/\bINSERT\b/i);
    expect(sqlText).toMatch(/ADD COLUMN aura_celebrated_until_id INT NULL/);
  });
});
