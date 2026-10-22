/**
 * Fase 201 plan 201-27: migración 0294 (guía "¿Cómo funciona?" vista, DA-21).
 *
 *  - la columna `conquer_members.guide_seen_at` existe, es `datetime` y admite
 *    NULL sin default (los alumnos que ya existían no la vieron),
 *  - el `.sql` no tiene `;` dentro de un comentario (el runner parte los
 *    statements crudos antes de borrar los comentarios de doble guion).
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations`: el
 * provisioning de tests tolera errores de DDL, así que una migración rota
 * puede figurar como aplicada.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { createTestApp } from "../helpers";
import { splitSqlStatements } from "../../src/db/run-migrations";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../src/db/migrations/0294_conquer_guide_seen.sql",
);

interface GuideColumnRow extends RowDataPacket {
  dataType: string;
  isNullable: string;
  columnDefault: string | null;
}

describe("Migración 0294 — conquer_members.guide_seen_at", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function readColumn(): Promise<GuideColumnRow[]> {
    const [rows] = (await app.dbPool.query(
      `SELECT DATA_TYPE AS dataType,
              IS_NULLABLE AS isNullable,
              COLUMN_DEFAULT AS columnDefault
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'conquer_members'
          AND COLUMN_NAME = 'guide_seen_at'`,
    )) as [GuideColumnRow[], unknown];
    return rows;
  }

  it("la columna existe una sola vez", async () => {
    const rows = await readColumn();
    expect(rows.length).toBe(1);
  });

  it("es datetime", async () => {
    const rows = await readColumn();
    expect(rows[0].dataType).toBe("datetime");
  });

  it("admite NULL (nadie la vio al migrar)", async () => {
    const rows = await readColumn();
    expect(rows[0].isNullable).toBe("YES");
  });

  it("no tiene valor por defecto", async () => {
    const rows = await readColumn();
    expect(rows[0].columnDefault).toBeNull();
  });

  it("el .sql no tiene ; dentro de un comentario", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    const offending = sql
      .split("\n")
      .filter((line) => /^\s*--/.test(line) && line.includes(";"));
    expect(offending).toEqual([]);
  });

  it("el .sql se parte en un solo statement: el ALTER de la columna", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    const statements = splitSqlStatements(sql);
    expect(statements.length).toBe(1);
    expect(statements[0]).toContain("ADD COLUMN guide_seen_at datetime NULL");
  });
});
