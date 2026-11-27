/**
 * Migración 0366 (2026-11-27): columna `users.can_give_aura`, permiso por
 * persona para dar el regalo de Aura del profe, y el alta del permiso para
 * Exequiel Torrone (recepción en Barcelona).
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations` (el
 * runner de tests tolera errores de DDL). Un guard estático sobre el texto del
 * SQL cuida que no haya `;` dentro de un comentario y que el UPDATE de datos
 * quede acotado a esa persona.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createTestApp } from "../helpers";

const SQL_PATH = path.resolve(
  __dirname,
  "../../src/db/migrations/0366_users_can_give_aura.sql",
);

interface ColumnRow extends RowDataPacket {
  columnType: string;
  nullable: string;
  defaultValue: string | null;
}

describe("Migración 0366 — users.can_give_aura", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("la columna existe, es booleana, NOT NULL y arranca en 0", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable,
              COLUMN_DEFAULT AS defaultValue
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'can_give_aura'`,
    )) as [ColumnRow[], unknown];

    expect(rows).toHaveLength(1);
    expect(rows[0].columnType).toMatch(/^tinyint\(1\)/);
    expect(rows[0].nullable).toBe("NO");
    expect(rows[0].defaultValue).toBe("0");
  });

  it("el SQL no tiene ';' en comentarios, no inserta y el UPDATE apunta solo a Exequiel Torrone de recepción", () => {
    const sqlText = readFileSync(SQL_PATH, "utf8");
    for (const line of sqlText.split("\n")) {
      if (line.trim().startsWith("--")) {
        expect(line.replace("--> statement-breakpoint", "")).not.toContain(";");
      }
    }
    expect(sqlText).not.toMatch(/\bINSERT\b/i);
    expect(sqlText).toMatch(
      /ADD COLUMN `can_give_aura` boolean NOT NULL DEFAULT false/,
    );
    const updates = sqlText.match(/UPDATE[\s\S]*?;/gi) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatch(/`id` = 5857/);
    expect(updates[0]).toMatch(/`role` = 'recepcion'/);
    expect(updates[0]).toMatch(/`first_name` = 'Exequiel'/);
    expect(updates[0]).toMatch(/`last_name` = 'Torrone'/);
  });
});
