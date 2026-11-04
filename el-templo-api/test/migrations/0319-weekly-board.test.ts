/**
 * Fase 206 Plan 01: migracion 0319 (Tablero semanal).
 *
 *  - D-08/D-09/D-10: `weekly_board_snapshots` con conteos crudos y dos sellos
 *    independientes (`main_closed_at`, `late_closed_at`).
 *  - D-24: los leads viven en `weekly_board_leads`, NO en la foto.
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations`: el
 * runner y el provisioning de tests toleran errores de DDL ("Duplicate",
 * "already exists"), asi que una migracion rota puede figurar como aplicada.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { createTestApp } from "../helpers";

const TABLES = ["weekly_board_snapshots", "weekly_board_leads"] as const;

interface TableRow extends RowDataPacket {
  tableName: string;
}

interface ColumnRow extends RowDataPacket {
  columnName: string;
  isNullable: string;
  columnDefault: string | null;
}

interface IndexRow extends RowDataPacket {
  indexName: string;
  nonUnique: number;
  seqInIndex: number;
  columnName: string;
}

interface FkRow extends RowDataPacket {
  constraintName: string;
  tableName: string;
  columnName: string;
  referencedTable: string;
}

describe("Migracion 0319 — weekly_board_snapshots y weekly_board_leads", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function columnas(tabla: string): Promise<ColumnRow[]> {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_NAME AS columnName,
              IS_NULLABLE AS isNullable,
              COLUMN_DEFAULT AS columnDefault
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?`,
      [tabla],
    )) as [ColumnRow[], unknown];
    return rows;
  }

  async function indice(tabla: string, nombre: string): Promise<IndexRow[]> {
    const [rows] = (await app.dbPool.query(
      `SELECT INDEX_NAME AS indexName,
              NON_UNIQUE AS nonUnique,
              SEQ_IN_INDEX AS seqInIndex,
              COLUMN_NAME AS columnName
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND INDEX_NAME = ?
        ORDER BY SEQ_IN_INDEX`,
      [tabla, nombre],
    )) as [IndexRow[], unknown];
    return rows;
  }

  it("0319: existen las dos tablas", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT TABLE_NAME AS tableName
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('weekly_board_snapshots', 'weekly_board_leads')`,
    )) as [TableRow[], unknown];
    expect(rows.map((r) => r.tableName).sort()).toEqual([...TABLES].sort());
  });

  it("0319: tenant_id es NOT NULL con default 1 en ambas tablas", async () => {
    for (const tabla of TABLES) {
      const cols = await columnas(tabla);
      const tenant = cols.find((c) => c.columnName === "tenant_id");
      expect(tenant, `${tabla}.tenant_id no existe`).toBeDefined();
      expect(tenant?.isNullable, `${tabla}.tenant_id`).toBe("NO");
      expect(Number(tenant?.columnDefault), `${tabla}.tenant_id default`).toBe(
        1,
      );
    }
  });

  it("0319: la unique de weekly_board_snapshots es (tenant_id, week_start, branch_id)", async () => {
    const rows = await indice(
      "weekly_board_snapshots",
      "uq_weekly_board_snapshots_tenant_week_branch",
    );
    expect(rows.every((r) => Number(r.nonUnique) === 0)).toBe(true);
    expect(rows.map((r) => r.columnName)).toEqual([
      "tenant_id",
      "week_start",
      "branch_id",
    ]);
  });

  it("0319: la unique de weekly_board_leads es (tenant_id, branch_id, week_start)", async () => {
    const rows = await indice(
      "weekly_board_leads",
      "uq_weekly_board_leads_tenant_branch_week",
    );
    expect(rows.every((r) => Number(r.nonUnique) === 0)).toBe(true);
    expect(rows.map((r) => r.columnName)).toEqual([
      "tenant_id",
      "branch_id",
      "week_start",
    ]);
  });

  it("0319: existen las 5 FK con sus nombres y destinos", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT CONSTRAINT_NAME AS constraintName,
              TABLE_NAME AS tableName,
              COLUMN_NAME AS columnName,
              REFERENCED_TABLE_NAME AS referencedTable
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('weekly_board_snapshots', 'weekly_board_leads')
          AND REFERENCED_TABLE_NAME IS NOT NULL`,
    )) as [FkRow[], unknown];
    const porNombre = Object.fromEntries(
      rows.map((r) => [
        r.constraintName,
        `${r.tableName}.${r.columnName}->${r.referencedTable}`,
      ]),
    );
    expect(porNombre).toEqual({
      fk_weekly_board_snapshots_tenant:
        "weekly_board_snapshots.tenant_id->tenants",
      fk_weekly_board_snapshots_branch:
        "weekly_board_snapshots.branch_id->branches",
      fk_weekly_board_leads_tenant: "weekly_board_leads.tenant_id->tenants",
      fk_weekly_board_leads_branch: "weekly_board_leads.branch_id->branches",
      fk_weekly_board_leads_updated_by: "weekly_board_leads.updated_by->users",
    });
  });

  it("0319: la foto no tiene leads (D-24) y tiene los dos sellos independientes", async () => {
    const nombres = (await columnas("weekly_board_snapshots")).map(
      (c) => c.columnName,
    );
    expect(nombres).not.toContain("leads");
    expect(nombres).toContain("main_closed_at");
    expect(nombres).toContain("late_closed_at");
  });

  it("0319: los sellos arrancan en NULL (el primer TIMESTAMP no se auto-puebla)", async () => {
    const cols = await columnas("weekly_board_snapshots");
    for (const nombre of ["main_closed_at", "late_closed_at"]) {
      const col = cols.find((c) => c.columnName === nombre);
      expect(col?.isNullable, nombre).toBe("YES");
      expect(col?.columnDefault, nombre).toBeNull();
    }
  });
});
