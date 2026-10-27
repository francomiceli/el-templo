/**
 * Fase 204 Plan 01: migracion 0300 (Usuarios Wellhub).
 *
 *  - D-19: `attendance.attendance_source` suma `wellhub_manual` al final del ENUM.
 *  - D-23/D-28: tabla gym-owned `wellhub_conversions`.
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations`: el
 * runner y el provisioning de tests toleran errores de DDL ("Duplicate",
 * "already exists"), asi que una migracion rota puede figurar como aplicada.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { createTestApp } from "../helpers";

const EXPECTED_COLUMNS = [
  "id",
  "tenant_id",
  "user_id",
  "subscription_id",
  "plan_id",
  "branch_id",
  "from_status",
  "kind",
  "local_date",
  "converted_at",
];

interface EnumTypeRow extends RowDataPacket {
  columnType: string;
}

interface ColumnRow extends RowDataPacket {
  columnName: string;
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

describe("Migracion 0300 — wellhub_manual y wellhub_conversions", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("0300: attendance_source termina en wellhub_manual", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_TYPE AS columnType
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'attendance'
          AND COLUMN_NAME = 'attendance_source'`,
    )) as [EnumTypeRow[], unknown];
    expect(rows.length, "attendance.attendance_source no existe").toBe(1);
    expect(parseEnumValues(rows[0].columnType)).toEqual([
      "qr",
      "manual",
      "wellhub",
      "wellhub_manual",
    ]);
  });

  it("0300: wellhub_conversions tiene tenant_id NOT NULL y las columnas esperadas", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_NAME AS columnName,
              IS_NULLABLE AS isNullable
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'wellhub_conversions'`,
    )) as [ColumnRow[], unknown];
    const names = rows.map((r) => r.columnName).sort();
    expect(names).toEqual([...EXPECTED_COLUMNS].sort());
    const tenant = rows.find((r) => r.columnName === "tenant_id");
    expect(tenant?.isNullable).toBe("NO");
  });

  it("0300: la unique de wellhub_conversions arranca por tenant_id", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT INDEX_NAME AS indexName,
              NON_UNIQUE AS nonUnique,
              SEQ_IN_INDEX AS seqInIndex,
              COLUMN_NAME AS columnName
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'wellhub_conversions'
          AND INDEX_NAME = 'idx_wellhub_conversions_tenant_user_sub'
        ORDER BY SEQ_IN_INDEX`,
    )) as [IndexRow[], unknown];
    expect(rows.length).toBe(3);
    expect(rows.every((r) => Number(r.nonUnique) === 0)).toBe(true);
    const first = rows.find((r) => Number(r.seqInIndex) === 1);
    expect(first?.columnName).toBe("tenant_id");
    expect(rows.map((r) => r.columnName)).toEqual([
      "tenant_id",
      "user_id",
      "subscription_id",
    ]);
  });
});
