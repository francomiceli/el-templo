/**
 * Fase 205: migracion 0321 (avisos automaticos de Oficina por sede).
 *
 *  - `office_auto_topic_mutes` existe, es gym-owned (tenant_id NOT NULL) y nace
 *    strict en el modulo `office`.
 *  - La unica es (tenant_id, detector, branch_id): una fila por detector y sede
 *    dentro de cada gimnasio.
 *  - `branch_id` es NOT NULL DEFAULT 0 (0 = todo el gimnasio) y NO tiene FK a
 *    branches por ese motivo.
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations`: el
 * runner y el provisioning de tests toleran errores de DDL, asi que una
 * migracion rota puede figurar como aplicada.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { and, eq } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { isDuplicateKeyError } from "../../src/modules/shared/sql-errors";

const TEMPLO_CTX: TenantContext = { tenantId: 1 };

interface ColumnRow extends RowDataPacket {
  columnName: string;
  isNullable: string;
  dataType: string;
  columnDefault: string | null;
}

interface IndexRow extends RowDataPacket {
  nonUnique: number;
  columnName: string;
}

interface FkRow extends RowDataPacket {
  columnName: string;
  referencedTable: string;
}

describe("Migracion 0321 — office_auto_topic_mutes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("0321: la tabla existe con tenant_id NOT NULL y branch_id NOT NULL DEFAULT 0", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_NAME AS columnName,
              IS_NULLABLE AS isNullable,
              DATA_TYPE AS dataType,
              COLUMN_DEFAULT AS columnDefault
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'office_auto_topic_mutes'`,
    )) as [ColumnRow[], unknown];
    const byName = new Map(rows.map((r) => [r.columnName, r]));
    expect([...byName.keys()].sort()).toEqual([
      "branch_id",
      "created_at",
      "created_by",
      "detector",
      "id",
      "tenant_id",
    ]);
    expect(byName.get("tenant_id")?.isNullable).toBe("NO");
    expect(byName.get("detector")?.isNullable).toBe("NO");
    expect(byName.get("detector")?.dataType).toBe("varchar");
    expect(byName.get("branch_id")?.isNullable).toBe("NO");
    expect(String(byName.get("branch_id")?.columnDefault)).toBe("0");
    expect(byName.get("created_by")?.isNullable).toBe("YES");
  });

  it("0321: la unica es (tenant_id, detector, branch_id) y arranca por tenant_id", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT NON_UNIQUE AS nonUnique,
              COLUMN_NAME AS columnName
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'office_auto_topic_mutes'
          AND INDEX_NAME = 'uq_office_auto_topic_mutes_tenant_detector_branch'
        ORDER BY SEQ_IN_INDEX`,
    )) as [IndexRow[], unknown];
    expect(rows.map((r) => r.columnName)).toEqual([
      "tenant_id",
      "detector",
      "branch_id",
    ]);
    expect(rows.every((r) => Number(r.nonUnique) === 0)).toBe(true);
  });

  it("0321: tiene FK a tenants y a users, y ninguna a branches (branch_id 0 = todo el gimnasio)", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT COLUMN_NAME AS columnName,
              REFERENCED_TABLE_NAME AS referencedTable
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'office_auto_topic_mutes'
          AND REFERENCED_TABLE_NAME IS NOT NULL`,
    )) as [FkRow[], unknown];
    const fks = rows.map((r) => `${r.columnName}->${r.referencedTable}`).sort();
    expect(fks).toEqual(["created_by->users", "tenant_id->tenants"]);
  });

  it("0321: la misma sede no se silencia dos veces para el mismo detector", async () => {
    const fila = tenantValues(TEMPLO_CTX, {
      detector: "test_dup",
      branchId: 0,
    });
    const limpiar = () =>
      app.db
        .delete(schema.officeAutoTopicMutes)
        .where(
          and(
            tenantWhere(schema.officeAutoTopicMutes, TEMPLO_CTX),
            eq(schema.officeAutoTopicMutes.detector, "test_dup"),
          ),
        );
    await limpiar();
    await app.db.insert(schema.officeAutoTopicMutes).values(fila);
    try {
      let duplicada = false;
      try {
        await app.db.insert(schema.officeAutoTopicMutes).values(fila);
      } catch (err: unknown) {
        duplicada = isDuplicateKeyError(err).isDuplicate;
      }
      expect(duplicada).toBe(true);
    } finally {
      await limpiar();
    }
  });
});
