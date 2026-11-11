/**
 * Fase 207 Plan 01: migraciones 0327 (member_branch_id) y 0328 (backfill de la
 * sede del alumno). D-23 (2026-11-11): el paso a DECIMAL(14,2) se retiro, las
 * columnas de plata siguen siendo enteras y este test lo vigila.
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker columna por columna: el
 * provisioning de tests (`test/setup.ts`) TOLERA errores `Unknown column` y
 * similares, asi que un typo en un nombre de columna de la migracion la deja
 * "aplicada" con la columna sin cambiar. Este test es lo que lo detecta.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { createStaffUser, createTestApp, createTestMember } from "../helpers";
import * as schema from "../../src/db/schema";
import { and, eq } from "drizzle-orm";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { splitSqlStatements } from "../../src/db/run-migrations";

const MIG_0327 = path.resolve(
  __dirname,
  "../../src/db/migrations/0327_sede_del_alumno_en_cobros.sql",
);
const MIG_0328 = path.resolve(
  __dirname,
  "../../src/db/migrations/0328_backfill_member_branch_id.sql",
);

interface ColumnaEsperada {
  tabla: string;
  columna: string;
  nullable: "YES" | "NO";
  /** Prefijo esperado de COLUMN_DEFAULT (solo donde la columna tiene default). */
  defaultPrefijo?: string;
}

// Las 15 columnas de importe del ledger y las cajas: siguen enteras (D-23).
const COLUMNAS_DE_PLATA: ColumnaEsperada[] = [
  { tabla: "financial_transactions", columna: "amount", nullable: "NO" },
  { tabla: "transaction_links", columna: "allocated_amount", nullable: "NO" },
  { tabla: "balances", columna: "amount", nullable: "NO" },
  {
    tabla: "cash_registers",
    columna: "opening_balance",
    nullable: "NO",
    defaultPrefijo: "0",
  },
  {
    tabla: "cash_registers",
    columna: "change_fund",
    nullable: "NO",
    defaultPrefijo: "0",
  },
  { tabla: "cash_counts", columna: "change_fund", nullable: "NO" },
  { tabla: "cash_counts", columna: "firme_amount", nullable: "NO" },
  { tabla: "cash_counts", columna: "pendiente_amount", nullable: "NO" },
  { tabla: "cash_counts", columna: "expected_amount", nullable: "NO" },
  { tabla: "cash_counts", columna: "counted_amount", nullable: "NO" },
  { tabla: "cash_counts", columna: "difference", nullable: "NO" },
  { tabla: "weekly_board_snapshots", columna: "cobrado", nullable: "YES" },
  {
    tabla: "weekly_board_snapshots",
    columna: "deuda_cobrable",
    nullable: "YES",
  },
  { tabla: "weekly_board_snapshots", columna: "deuda_mas_10", nullable: "YES" },
  {
    tabla: "weekly_board_snapshots",
    columna: "deuda_incobrable",
    nullable: "YES",
  },
];

interface ColumnRow extends RowDataPacket {
  dataType: string;
  precision: number | null;
  scale: number | null;
  isNullable: string;
  columnDefault: string | null;
}

interface IndexRow extends RowDataPacket {
  columnName: string;
  seqInIndex: number;
}

interface FkRow extends RowDataPacket {
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
}

interface TxRow extends RowDataPacket {
  id: number;
  member_branch_id: number | null;
  updated_at: Date;
}

describe("Migraciones 0327/0328 — sede del alumno (plata en enteros)", () => {
  let app: FastifyInstance;
  let backfill: string[];

  async function q<T extends RowDataPacket>(
    sqlText: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const [rows] = await app.dbPool.query(sqlText, params);
    return rows as T[];
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("los .sql no tienen ningun `;` dentro de un comentario `--`", () => {
    for (const archivo of [MIG_0327, MIG_0328]) {
      const offending = readFileSync(archivo, "utf8")
        .split("\n")
        .filter((line) => /^\s*--/.test(line) && line.includes(";"));
      expect(offending, archivo).toEqual([]);
    }
  });

  it.each(COLUMNAS_DE_PLATA)(
    "$tabla.$columna sigue siendo entera, con nulabilidad y default originales",
    async ({ tabla, columna, nullable, defaultPrefijo }) => {
      const rows = await q<ColumnRow>(
        `SELECT DATA_TYPE AS dataType,
                NUMERIC_PRECISION AS \`precision\`,
                NUMERIC_SCALE AS scale,
                IS_NULLABLE AS isNullable,
                COLUMN_DEFAULT AS columnDefault
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tabla, columna],
      );
      expect(rows, `${tabla}.${columna} no existe`).toHaveLength(1);
      const col = rows[0];
      expect(["int", "bigint"], `${tabla}.${columna} dataType`).toContain(
        col.dataType,
      );
      expect(Number(col.scale), `${tabla}.${columna} scale`).toBe(0);
      expect(col.isNullable, `${tabla}.${columna} nullable`).toBe(nullable);
      if (defaultPrefijo !== undefined) {
        expect(
          String(col.columnDefault).startsWith(defaultPrefijo),
          `${tabla}.${columna} default = ${col.columnDefault}`,
        ).toBe(true);
      }
    },
  );

  it("cash_counts.payments_count sigue siendo un conteo entero", async () => {
    const rows = await q<ColumnRow>(
      `SELECT DATA_TYPE AS dataType
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cash_counts'
          AND COLUMN_NAME = 'payments_count'`,
    );
    expect(rows[0]?.dataType).toBe("int");
  });

  it("financial_transactions.member_branch_id es INT NULL", async () => {
    const rows = await q<ColumnRow>(
      `SELECT DATA_TYPE AS dataType, IS_NULLABLE AS isNullable
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financial_transactions'
          AND COLUMN_NAME = 'member_branch_id'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].dataType).toBe("int");
    expect(rows[0].isNullable).toBe("YES");
  });

  it("member_branch_id tiene la FK fk_financial_tx_member_branch a branches.id", async () => {
    const rows = await q<FkRow>(
      `SELECT COLUMN_NAME AS columnName,
              REFERENCED_TABLE_NAME AS referencedTable,
              REFERENCED_COLUMN_NAME AS referencedColumn
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'financial_transactions'
          AND CONSTRAINT_NAME = 'fk_financial_tx_member_branch'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].columnName).toBe("member_branch_id");
    expect(rows[0].referencedTable).toBe("branches");
    expect(rows[0].referencedColumn).toBe("id");
  });

  it("el indice idx_financial_tx_tenant_member_branch_date es (tenant_id, member_branch_id, transaction_date)", async () => {
    const rows = await q<IndexRow>(
      `SELECT COLUMN_NAME AS columnName, SEQ_IN_INDEX AS seqInIndex
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'financial_transactions'
          AND INDEX_NAME = 'idx_financial_tx_tenant_member_branch_date'
        ORDER BY SEQ_IN_INDEX`,
    );
    expect(rows.map((r) => r.columnName)).toEqual([
      "tenant_id",
      "member_branch_id",
      "transaction_date",
    ]);
  });

  it("ida y vuelta de un importe entero: Drizzle y SQL crudo dan number", async () => {
    const staffId = await createStaffUser(app, {
      email: `roundtrip-0327-${Date.now()}@test.com`,
      password: "Test1234!",
      firstName: "Round",
      lastName: "Trip",
      role: "coach",
      branchId: 1,
    });
    const [ins] = await app.db.insert(schema.financialTransactions).values(
      tenantValues(
        { tenantId: 1 },
        {
          kind: "advance_payment" as const,
          direction: "inflow" as const,
          amount: 77571,
          currency: "ARS",
          paymentMethod: "cash" as const,
          transactionDate: "2026-11-10",
          effectiveDate: "2026-11-10",
          recordedBy: staffId,
        },
      ),
    );
    const id = ins.insertId;
    try {
      const [viaDrizzle] = await app.db
        .select({ amount: schema.financialTransactions.amount })
        .from(schema.financialTransactions)
        .where(
          and(
            tenantWhere(schema.financialTransactions, { tenantId: 1 }),
            eq(schema.financialTransactions.id, id),
          ),
        );
      expect(viaDrizzle.amount).toBe(77571);
      expect(typeof viaDrizzle.amount).toBe("number");

      // Columna INT: el SQL crudo tambien devuelve number.
      const crudo = await q<RowDataPacket & { amount: unknown }>(
        "SELECT amount FROM financial_transactions WHERE id = ? AND tenant_id = 1",
        [id],
      );
      expect(crudo[0].amount).toBe(77571);
    } finally {
      await app.dbPool.query(
        "DELETE FROM financial_transactions WHERE id = ? AND tenant_id = 1",
        [id],
      );
    }
  });

  describe("backfill 0328", () => {
    const sufijo = Date.now().toString(36);
    const sedes: number[] = [];
    const txIds: number[] = [];
    let sedeA: number;
    let sedeB: number;
    let socioA: number;
    let staffId: number;

    async function crearSede(code: string): Promise<number> {
      const [res] = await app.dbPool.query(
        "INSERT INTO branches (name, code, tenant_id) VALUES (?, ?, 1)",
        [`Sede ${code}`, code],
      );
      const id = (res as ResultSetHeader).insertId;
      sedes.push(id);
      return id;
    }

    async function crearCobro(over: {
      memberId: number | null;
      memberBranchId: number | null;
      kind?: "advance_payment" | "expense";
    }): Promise<number> {
      const kind = over.kind ?? "advance_payment";
      const [res] = await app.dbPool.query(
        `INSERT INTO financial_transactions
           (tenant_id, member_id, member_branch_id, kind, direction, amount,
            currency, payment_method, transaction_date, effective_date,
            recorded_by, validation_status)
         VALUES (1, ?, ?, ?, ?, 1500, 'ARS', 'cash', '2026-11-10',
                 '2026-11-10', ?, 'validado')`,
        [
          over.memberId,
          over.memberBranchId,
          kind,
          kind === "expense" ? "outflow" : "inflow",
          staffId,
        ],
      );
      const id = (res as ResultSetHeader).insertId;
      txIds.push(id);
      return id;
    }

    async function leer(id: number): Promise<TxRow> {
      const rows = await q<TxRow>(
        "SELECT id, member_branch_id, updated_at FROM financial_transactions WHERE id = ? AND tenant_id = 1",
        [id],
      );
      return rows[0];
    }

    async function correrBackfill(): Promise<void> {
      for (const stmt of backfill) await app.dbPool.query(stmt);
    }

    beforeAll(async () => {
      backfill = splitSqlStatements(readFileSync(MIG_0328, "utf8"));
      expect(backfill.length).toBe(1);
      sedeA = await crearSede(`A0328${sufijo}`.slice(0, 20));
      sedeB = await crearSede(`B0328${sufijo}`.slice(0, 20));
      const socio = await createTestMember(app, { branchId: sedeA });
      socioA = socio.id;
      staffId = await createStaffUser(app, {
        email: `staff-0328-${sufijo}@test.com`,
        password: "Test1234!",
        firstName: "Staff",
        lastName: "Backfill",
        role: "coach",
        branchId: sedeA,
      });
    });

    afterAll(async () => {
      for (const id of txIds) {
        await app.dbPool.query(
          "DELETE FROM financial_transactions WHERE id = ? AND tenant_id = 1",
          [id],
        );
      }
      await app.dbPool.query(
        "DELETE FROM users WHERE id IN (?, ?) AND tenant_id = 1",
        [socioA, staffId],
      );
      for (const id of sedes) {
        await app.dbPool.query(
          "DELETE FROM branches WHERE id = ? AND tenant_id = 1",
          [id],
        );
      }
    });

    it("completa solo cobros con socio y sin snapshot, preserva updated_at y es idempotente", async () => {
      const conSocio = await crearCobro({
        memberId: socioA,
        memberBranchId: null,
      });
      const egreso = await crearCobro({
        memberId: null,
        memberBranchId: null,
        kind: "expense",
      });
      const yaSnapshot = await crearCobro({
        memberId: socioA,
        memberBranchId: sedeB,
      });
      const updatedAntes = (await leer(conSocio)).updated_at.getTime();

      // Espera de reloj DENTRO del test: sin ella, un updated_at pisado por
      // ON UPDATE CURRENT_TIMESTAMP caeria en el mismo segundo y pasaria igual.
      await new Promise((r) => setTimeout(r, 1100));
      await correrBackfill();

      const a = await leer(conSocio);
      expect(a.member_branch_id).toBe(sedeA);
      expect(a.updated_at.getTime()).toBe(updatedAntes);
      expect((await leer(egreso)).member_branch_id).toBeNull();
      expect((await leer(yaSnapshot)).member_branch_id).toBe(sedeB);

      // Re-ejecutar es un no-op.
      await correrBackfill();
      expect((await leer(conSocio)).member_branch_id).toBe(sedeA);
      expect((await leer(conSocio)).updated_at.getTime()).toBe(updatedAntes);
      expect((await leer(egreso)).member_branch_id).toBeNull();
      expect((await leer(yaSnapshot)).member_branch_id).toBe(sedeB);
    });

    it("no re-escribe un snapshot cuando el socio despues cambio de sede", async () => {
      const id = await crearCobro({ memberId: socioA, memberBranchId: sedeA });
      await app.dbPool.query(
        "UPDATE users SET branch_id = ? WHERE id = ? AND tenant_id = 1",
        [sedeB, socioA],
      );
      try {
        await correrBackfill();
        expect((await leer(id)).member_branch_id).toBe(sedeA);
      } finally {
        await app.dbPool.query(
          "UPDATE users SET branch_id = ? WHERE id = ? AND tenant_id = 1",
          [sedeA, socioA],
        );
      }
    });
  });

  it("0327 no contiene datos (solo un ALTER que agrega member_branch_id, sin tocar columnas de plata)", () => {
    const sentencias = splitSqlStatements(readFileSync(MIG_0327, "utf8"));
    // D-23: la migracion ya no cambia el tipo de la plata, queda un solo ALTER.
    expect(sentencias.length).toBe(1);
    expect(sentencias[0]).toMatch(/ADD COLUMN `member_branch_id`/);
    expect(sentencias[0]).not.toMatch(/MODIFY|DECIMAL/i);
    for (const s of sentencias) {
      // El primer statement arrastra el header de comentarios `--`.
      const sinComentarios = s
        .split("\n")
        .filter((l) => !/^\s*--/.test(l))
        .join("\n")
        .trim();
      expect(sinComentarios).toMatch(/^ALTER TABLE/);
    }
  });
});
