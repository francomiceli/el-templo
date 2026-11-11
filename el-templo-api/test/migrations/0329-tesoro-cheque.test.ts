/**
 * Fase 208 Plan 01: migración 0329 (cash_registers.is_treasury + valor 'cheque'
 * en financial_transactions.payment_method).
 *
 * Se consulta INFORMATION_SCHEMA: el provisioning de tests (`test/setup.ts`)
 * TOLERA errores `Unknown column` y similares, así que un typo en la migración
 * la deja "aplicada" sin aplicar. Este test es lo que lo detecta.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { and, eq } from "drizzle-orm";
import { createStaffUser, createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { splitSqlStatements } from "../../src/db/run-migrations";

const MIG_0329 = path.resolve(
  __dirname,
  "../../src/db/migrations/0329_tesoro_y_cheque.sql",
);

interface ColRow extends RowDataPacket {
  dataType: string;
  columnType: string;
  isNullable: string;
  columnDefault: string | null;
}

describe("Migración 0329 — Tesoro y cheque", () => {
  let app: FastifyInstance;

  async function q<T extends RowDataPacket>(
    sqlText: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const [rows] = await app.dbPool.query(sqlText, params);
    return rows as T[];
  }

  async function columna(tabla: string, nombre: string): Promise<ColRow[]> {
    return q<ColRow>(
      `SELECT DATA_TYPE AS dataType, COLUMN_TYPE AS columnType,
              IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS columnDefault
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tabla, nombre],
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("el .sql no tiene ningún `;` dentro de un comentario y da 2 sentencias", () => {
    const sql = readFileSync(MIG_0329, "utf8");
    const offending = sql
      .split("\n")
      .filter((line) => /^\s*--/.test(line) && line.includes(";"));
    expect(offending).toEqual([]);
    expect(splitSqlStatements(sql)).toHaveLength(2);
  });

  it("cash_registers.is_treasury es tinyint(1) NOT NULL DEFAULT 0", async () => {
    const rows = await columna("cash_registers", "is_treasury");
    expect(rows, "is_treasury no existe").toHaveLength(1);
    expect(rows[0].columnType).toBe("tinyint(1)");
    expect(rows[0].isNullable).toBe("NO");
    expect(String(rows[0].columnDefault)).toBe("0");
  });

  it("payment_method conserva el orden de los 6 valores y suma 'cheque' al final", async () => {
    const rows = await columna("financial_transactions", "payment_method");
    expect(rows).toHaveLength(1);
    expect(rows[0].columnType).toBe(
      "enum('cash','transfer','card','aura_credit','internal','direct_debit','cheque')",
    );
    expect(rows[0].isNullable).toBe("NO");
  });

  it("todas las cajas existentes del tenant 1 quedan con is_treasury = 0", async () => {
    const rows = await app.db
      .select({
        id: schema.cashRegisters.id,
        isTreasury: schema.cashRegisters.isTreasury,
      })
      .from(schema.cashRegisters)
      .where(tenantWhere(schema.cashRegisters, { tenantId: 1 }));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.isTreasury, `caja ${r.id}`).toBe(false);
    }
  });

  it("se puede insertar y leer de vuelta un egreso con medio 'cheque'", async () => {
    const staffId = await createStaffUser(app, {
      email: `cheque-0329-${Date.now()}@test.com`,
      password: "Test1234!",
      firstName: "Cheque",
      lastName: "Test",
      role: "coach",
      branchId: 1,
    });
    const [ins] = await app.db.insert(schema.financialTransactions).values(
      tenantValues(
        { tenantId: 1 },
        {
          kind: "expense" as const,
          direction: "outflow" as const,
          amount: 1234.56,
          currency: "ARS",
          paymentMethod: "cheque" as const,
          transactionDate: "2026-11-10",
          effectiveDate: "2026-11-10",
          recordedBy: staffId,
        },
      ),
    );
    const id = ins.insertId;
    try {
      const [fila] = await app.db
        .select({
          paymentMethod: schema.financialTransactions.paymentMethod,
          amount: schema.financialTransactions.amount,
        })
        .from(schema.financialTransactions)
        .where(
          and(
            tenantWhere(schema.financialTransactions, { tenantId: 1 }),
            eq(schema.financialTransactions.id, id),
          ),
        );
      expect(fila.paymentMethod).toBe("cheque");
      expect(fila.amount).toBe(1234.56);
    } finally {
      await app.dbPool.query(
        "DELETE FROM financial_transactions WHERE id = ? AND tenant_id = 1",
        [id],
      );
    }
  });
});
