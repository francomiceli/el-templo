/**
 * Fase 215 (ajustes, #30): migración 0352, categoría de notificación
 * `regalos_aura` en las dos tablas que comparten el enum.
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
  "../../src/db/migrations/0352_notification_category_regalos_aura.sql",
);

const ORIGINAL_VALUES = [
  "entrenamiento",
  "programas",
  "motivacion",
  "anuncios",
  "planes",
  "referidos",
];

interface ColumnRow extends RowDataPacket {
  columnType: string;
}

/** `enum('a','b')` -> ["a", "b"] */
function parseEnumValues(columnType: string): string[] {
  return Array.from(columnType.matchAll(/'([^']+)'/g), (m) => m[1]);
}

describe("Migración 0352 — categoría regalos_aura", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function categories(table: string): Promise<string[]> {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_TYPE AS columnType
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
          AND COLUMN_NAME = 'notification_category'`,
      [table],
    )) as [ColumnRow[], unknown];
    expect(rows, `${table}.notification_category no existe`).toHaveLength(1);
    return parseEnumValues(rows[0].columnType);
  }

  it("las dos tablas suman regalos_aura al final y conservan los seis valores originales en orden", async () => {
    for (const table of [
      "notification_templates",
      "notification_preferences",
    ]) {
      const values = await categories(table);
      expect(values.slice(0, ORIGINAL_VALUES.length)).toEqual(ORIGINAL_VALUES);
      expect(values).toContain("regalos_aura");
      expect(values[values.length - 1]).toBe("regalos_aura");
    }
  });

  it("las dos listas son idénticas", async () => {
    expect(await categories("notification_preferences")).toEqual(
      await categories("notification_templates"),
    );
  });

  it("el SQL no tiene ';' dentro de comentarios ni inserta datos", () => {
    const sqlText = readFileSync(SQL_PATH, "utf8");
    for (const line of sqlText.split("\n")) {
      if (line.trim().startsWith("--")) {
        expect(line.replace("--> statement-breakpoint", "")).not.toContain(";");
      }
    }
    expect(sqlText).not.toMatch(/\bINSERT\b/i);
  });
});
