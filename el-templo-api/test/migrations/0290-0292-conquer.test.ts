/**
 * Fase 201 Plan 01: migraciones 0290 y 0291 (Conquer v2), contrato de
 * estructura de las 10 tablas `conquer_*`.
 *
 *  - 0290: catalogo (ladders, rungs, exercises, template_days).
 *  - 0291: estado del alumno (members, steps, sessions, session_steps, alerts,
 *    body_checks).
 *  - 0292 (semilla del catalogo) la agrega el plan 201-02 en ESTE archivo.
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations`: el
 * runner y el provisioning de tests toleran errores de DDL ("Duplicate",
 * "already exists"), asi que una migracion rota puede figurar como aplicada.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { createTestApp } from "../helpers";

const CONQUER_TABLES = [
  "conquer_ladders",
  "conquer_rungs",
  "conquer_exercises",
  "conquer_template_days",
  "conquer_members",
  "conquer_steps",
  "conquer_sessions",
  "conquer_session_steps",
  "conquer_alerts",
  "conquer_body_checks",
] as const;

/** Columnas enum: el COLUMN_TYPE tiene que calzar byte a byte con el schema. */
const ENUM_COLUMNS: ReadonlyArray<readonly [string, string, string]> = [
  ["conquer_exercises", "unit", "enum('reps','s')"],
  ["conquer_members", "status", "enum('pedido','activo')"],
  ["conquer_members", "level", "enum('ternero','novillo','toro')"],
  ["conquer_steps", "step", "enum('e1','e2','e3','hold')"],
  ["conquer_steps", "mode", "enum('completa','negativa','hold')"],
  ["conquer_steps", "calibration", "enum('pendiente','resuelta')"],
  ["conquer_session_steps", "step", "enum('e1','e2','e3','hold')"],
  ["conquer_session_steps", "mode", "enum('completa','negativa','hold')"],
  [
    "conquer_alerts",
    "type",
    "enum('molestia','caida','tope_escalera','paso_nivel')",
  ],
  ["conquer_alerts", "status", "enum('abierta','vista','resuelta')"],
  ["conquer_body_checks", "kind", "enum('dia0','periodico')"],
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

interface ColumnTypeRow extends RowDataPacket {
  columnType: string;
}

describe("Migraciones 0290-0291 — estructura de las tablas conquer_*", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(CONQUER_TABLES)("%s existe", async (table) => {
    const [rows] = (await app.dbPool.query(
      `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?`,
      [table],
    )) as [CountRow[], unknown];
    expect(Number(rows[0].total)).toBe(1);
  });

  it.each(CONQUER_TABLES)(
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

  it.each(CONQUER_TABLES)(
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

  it.each(CONQUER_TABLES)(
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

  it.each(ENUM_COLUMNS)(
    "%s.%s tiene el enum exacto del schema",
    async (table, column, expected) => {
      const [rows] = (await app.dbPool.query(
        `SELECT COLUMN_TYPE AS columnType
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = ?`,
        [table, column],
      )) as [ColumnTypeRow[], unknown];
      expect(rows.length, `${table}.${column} no existe`).toBe(1);
      expect(rows[0].columnType).toBe(expected);
    },
  );
});
