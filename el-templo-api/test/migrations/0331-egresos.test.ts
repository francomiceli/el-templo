/**
 * Fase 209 Plan 01: migracion 0331 (Egresos: gasto, reparto y pagos).
 *
 *  - DI-01: tres tablas gym-owned `expense_*` que nacen strict.
 *  - D-23 / DI-02: toda la plata es `int`, el unico decimal es `fx_rate`.
 *  - DI-16: uniques de idempotencia con tenant_id al frente.
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations`: el
 * runner y el provisioning de tests toleran errores de DDL, asi que una
 * migracion rota puede figurar como aplicada.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { createTestApp } from "../helpers";
import { splitSqlStatements } from "../../src/db/run-migrations";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../src/db/migrations/0331_egresos_gastos_repartos_pagos.sql",
);

const EXPENSE_TABLES = [
  "expense_allocations",
  "expense_payments",
  "expense_records",
];

interface ColumnRow extends RowDataPacket {
  tableName: string;
  columnName: string;
  isNullable: string;
  dataType: string;
  columnType: string;
  charLength: number | null;
  numPrecision: number | null;
  numScale: number | null;
}

interface IndexRow extends RowDataPacket {
  tableName: string;
  indexName: string;
  nonUnique: number;
  seqInIndex: number;
  columnName: string;
}

interface FkRow extends RowDataPacket {
  constraintName: string;
  tableName: string;
  deleteRule: string;
  referencedTable: string;
}

/** Columna esperada: [tabla, columna, DATA_TYPE, IS_NULLABLE]. */
type Expected = [string, string, string, "YES" | "NO"];

const COLUMNAS_ESPERADAS: Expected[] = [
  // expense_records
  ["expense_records", "id", "int", "NO"],
  ["expense_records", "tenant_id", "int", "NO"],
  ["expense_records", "country", "varchar", "NO"],
  ["expense_records", "concept", "varchar", "NO"],
  ["expense_records", "beneficiary", "varchar", "YES"],
  ["expense_records", "cost_center_id", "int", "NO"],
  ["expense_records", "imputation_month", "char", "NO"],
  ["expense_records", "amount", "int", "NO"],
  ["expense_records", "currency", "varchar", "NO"],
  ["expense_records", "amount_status", "enum", "NO"],
  ["expense_records", "fx_rate", "decimal", "YES"],
  ["expense_records", "receipt_links", "json", "YES"],
  ["expense_records", "notes", "text", "YES"],
  ["expense_records", "idempotency_key", "varchar", "YES"],
  ["expense_records", "created_by", "int", "NO"],
  ["expense_records", "voided_at", "timestamp", "YES"],
  ["expense_records", "voided_by", "int", "YES"],
  ["expense_records", "void_reason", "text", "YES"],
  // expense_allocations
  ["expense_allocations", "id", "int", "NO"],
  ["expense_allocations", "tenant_id", "int", "NO"],
  ["expense_allocations", "expense_record_id", "int", "NO"],
  ["expense_allocations", "branch_id", "int", "YES"],
  ["expense_allocations", "amount", "int", "NO"],
  // expense_payments
  ["expense_payments", "id", "int", "NO"],
  ["expense_payments", "tenant_id", "int", "NO"],
  ["expense_payments", "expense_record_id", "int", "NO"],
  ["expense_payments", "transaction_id", "int", "NO"],
  ["expense_payments", "paid_on", "date", "NO"],
  ["expense_payments", "cash_register_id", "int", "NO"],
  ["expense_payments", "payment_method", "varchar", "NO"],
  ["expense_payments", "amount", "int", "NO"],
  ["expense_payments", "currency", "varchar", "NO"],
  ["expense_payments", "applied_amount", "int", "NO"],
  ["expense_payments", "fx_rate", "decimal", "YES"],
  ["expense_payments", "amount_ars", "int", "YES"],
  ["expense_payments", "reference", "varchar", "YES"],
  ["expense_payments", "notes", "text", "YES"],
  ["expense_payments", "idempotency_key", "varchar", "YES"],
  ["expense_payments", "created_by", "int", "NO"],
  ["expense_payments", "voided_at", "timestamp", "YES"],
  ["expense_payments", "voided_by", "int", "YES"],
  ["expense_payments", "void_reason", "text", "YES"],
];

describe("Migracion 0331 — tablas expense_*", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function columnas(): Promise<ColumnRow[]> {
    const [rows] = (await app.dbPool.query(
      `SELECT TABLE_NAME AS tableName,
              COLUMN_NAME AS columnName,
              IS_NULLABLE AS isNullable,
              DATA_TYPE AS dataType,
              COLUMN_TYPE AS columnType,
              CHARACTER_MAXIMUM_LENGTH AS charLength,
              NUMERIC_PRECISION AS numPrecision,
              NUMERIC_SCALE AS numScale
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('expense_allocations', 'expense_payments', 'expense_records')`,
    )) as [ColumnRow[], unknown];
    return rows;
  }

  it("0331: las 3 tablas existen", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT TABLE_NAME AS tableName
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('expense_allocations', 'expense_payments', 'expense_records')`,
    )) as [RowDataPacket[], unknown];
    expect(rows.map((r) => r.tableName as string).sort()).toEqual(
      EXPENSE_TABLES,
    );
  });

  it("0331: cada columna tiene el tipo y la nulabilidad de DI-01", async () => {
    const rows = await columnas();
    const porClave = new Map(
      rows.map((r) => [`${r.tableName}.${r.columnName}`, r]),
    );
    for (const [tabla, columna, tipo, nullable] of COLUMNAS_ESPERADAS) {
      const fila = porClave.get(`${tabla}.${columna}`);
      expect(fila, `${tabla}.${columna} existe`).toBeDefined();
      expect(fila?.dataType, `${tabla}.${columna} DATA_TYPE`).toBe(tipo);
      expect(fila?.isNullable, `${tabla}.${columna} IS_NULLABLE`).toBe(nullable);
    }
  });

  it("0331: toda la plata es int y el unico decimal es fx_rate DECIMAL(12,4)", async () => {
    const rows = await columnas();
    const decimales = rows.filter((r) => r.dataType === "decimal");
    expect(
      decimales.map((r) => `${r.tableName}.${r.columnName}`).sort(),
    ).toEqual(["expense_payments.fx_rate", "expense_records.fx_rate"]);
    for (const d of decimales) {
      expect(Number(d.numPrecision), `${d.tableName} precision`).toBe(12);
      expect(Number(d.numScale), `${d.tableName} scale`).toBe(4);
    }
    // Los importes son int en las tres tablas.
    for (const [tabla, columna] of [
      ["expense_records", "amount"],
      ["expense_allocations", "amount"],
      ["expense_payments", "amount"],
      ["expense_payments", "applied_amount"],
      ["expense_payments", "amount_ars"],
    ]) {
      const fila = rows.find(
        (r) => r.tableName === tabla && r.columnName === columna,
      );
      expect(fila?.dataType, `${tabla}.${columna}`).toBe("int");
    }
  });

  it("0331: imputation_month es char(7), receipt_links json y amount_status enum", async () => {
    const rows = await columnas();
    const mes = rows.find(
      (r) =>
        r.tableName === "expense_records" && r.columnName === "imputation_month",
    );
    expect(mes?.dataType).toBe("char");
    expect(Number(mes?.charLength)).toBe(7);
    const links = rows.find(
      (r) =>
        r.tableName === "expense_records" && r.columnName === "receipt_links",
    );
    expect(links?.dataType).toBe("json");
    const estado = rows.find(
      (r) =>
        r.tableName === "expense_records" && r.columnName === "amount_status",
    );
    expect(estado?.columnType).toBe("enum('estimado','confirmado')");
  });

  it("0331: las 3 uniques existen y arrancan por tenant_id", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT TABLE_NAME AS tableName,
              INDEX_NAME AS indexName,
              NON_UNIQUE AS nonUnique,
              SEQ_IN_INDEX AS seqInIndex,
              COLUMN_NAME AS columnName
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('expense_allocations', 'expense_payments', 'expense_records')
          AND NON_UNIQUE = 0
          AND INDEX_NAME <> 'PRIMARY'
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    )) as [IndexRow[], unknown];
    const nombres = [...new Set(rows.map((r) => r.indexName))].sort();
    expect(nombres).toEqual([
      "uq_expense_payments_tenant_idempotency",
      "uq_expense_payments_tenant_transaction",
      "uq_expense_records_tenant_idempotency",
    ]);
    for (const nombre of nombres) {
      const cols = rows.filter((r) => r.indexName === nombre);
      expect(cols[0].seqInIndex, nombre).toBe(1);
      expect(cols[0].columnName, nombre).toBe("tenant_id");
    }
    const cols = (nombre: string) =>
      rows.filter((r) => r.indexName === nombre).map((r) => r.columnName);
    expect(cols("uq_expense_records_tenant_idempotency")).toEqual([
      "tenant_id",
      "idempotency_key",
    ]);
    expect(cols("uq_expense_payments_tenant_idempotency")).toEqual([
      "tenant_id",
      "idempotency_key",
    ]);
    expect(cols("uq_expense_payments_tenant_transaction")).toEqual([
      "tenant_id",
      "transaction_id",
    ]);
  });

  it("0331: los indices no unicos empiezan por tenant_id", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT TABLE_NAME AS tableName,
              INDEX_NAME AS indexName,
              COLUMN_NAME AS columnName
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('expense_allocations', 'expense_payments', 'expense_records')
          AND NON_UNIQUE = 1
          AND INDEX_NAME LIKE 'idx_expense_%'
          AND SEQ_IN_INDEX = 1`,
    )) as [IndexRow[], unknown];
    expect(rows.map((r) => r.indexName).sort()).toEqual([
      "idx_expense_allocations_tenant_branch",
      "idx_expense_allocations_tenant_record",
      "idx_expense_payments_tenant_paid_on",
      "idx_expense_payments_tenant_record",
      "idx_expense_payments_tenant_register",
      "idx_expense_records_tenant_cost_center",
      "idx_expense_records_tenant_country_month",
    ]);
    for (const row of rows) {
      expect(row.columnName, row.indexName).toBe("tenant_id");
    }
  });

  it("0331: existen las FK fk_expense_*_tenant hacia tenants", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT CONSTRAINT_NAME AS constraintName,
              TABLE_NAME AS tableName,
              DELETE_RULE AS deleteRule,
              REFERENCED_TABLE_NAME AS referencedTable
         FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND CONSTRAINT_NAME LIKE 'fk_expense_%_tenant'`,
    )) as [FkRow[], unknown];
    expect(rows.map((r) => r.constraintName).sort()).toEqual([
      "fk_expense_allocations_tenant",
      "fk_expense_payments_tenant",
      "fk_expense_records_tenant",
    ]);
    for (const row of rows) {
      expect(row.referencedTable, row.constraintName).toBe("tenants");
    }
  });

  it("0331: expense_allocations cae en cascada con su gasto", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT DELETE_RULE AS deleteRule,
              REFERENCED_TABLE_NAME AS referencedTable
         FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'expense_allocations'
          AND REFERENCED_TABLE_NAME = 'expense_records'`,
    )) as [FkRow[], unknown];
    expect(rows.length).toBe(1);
    expect(rows[0].deleteRule).toBe("CASCADE");
  });

  it("0331: el pago apunta al ledger, a la cuenta y al gasto sin cascada", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT DELETE_RULE AS deleteRule,
              REFERENCED_TABLE_NAME AS referencedTable
         FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'expense_payments'
          AND REFERENCED_TABLE_NAME IN ('expense_records', 'financial_transactions', 'cash_registers')`,
    )) as [FkRow[], unknown];
    expect(rows.map((r) => r.referencedTable).sort()).toEqual([
      "cash_registers",
      "expense_records",
      "financial_transactions",
    ]);
    for (const row of rows) {
      expect(row.deleteRule, row.referencedTable).not.toBe("CASCADE");
    }
  });

  it("0331: el archivo SQL tiene exactamente 3 sentencias y ningun ';' en comentarios", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    const comentariosConPuntoYComa = sql
      .split("\n")
      .filter((l) => /^\s*--/.test(l) && l.includes(";"));
    expect(comentariosConPuntoYComa).toEqual([]);
    expect(splitSqlStatements(sql).length).toBe(3);
  });
});
