/**
 * Migracion 0324 (2026-11-10): mueve el cobro suelto "Vertis" (tx 3278, $10.000
 * efectivo del 07/11) de la sede/caja de Alberti a la de Moreno.
 *
 * Contrato:
 *  - Con el estado ANTERIOR exacto: mueve branch + caja efectivo y deja UNA
 *    fila en audit_log con origen/destino.
 *  - Reaplicar es no-op (ni mueve de nuevo ni duplica auditoria).
 *  - Si la fila con id 3278 no es ese cobro (staging, otro entorno) o esta
 *    anulada: no toca nada y no audita.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { createTestApp, createStaffUser } from "../helpers";
import { splitSqlStatements } from "../../src/db/run-migrations";

const MIG_0324 = path.resolve(
  __dirname,
  "../../src/db/migrations/0324_mover_cobro_vertis_alberti_a_moreno.sql",
);
const TX_ID = 3278;

interface TxRow extends RowDataPacket {
  branch_id: number;
  cash_register_id: number;
}
interface AuditRow extends RowDataPacket {
  actor_id: number;
  payload: string;
}

describe("Migracion 0324 — cobro Vertis de Alberti a Moreno", () => {
  let app: FastifyInstance;
  let statements: string[];
  let morenoId: number;
  let albertiId: number;
  let cajaMorenoId: number;
  let cajaAlbertiId: number;
  let pato: number;
  const createdCajas: number[] = [];

  async function q<T extends RowDataPacket>(
    sqlText: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const [rows] = await app.dbPool.query(sqlText, params);
    return rows as T[];
  }

  async function ensureBranch(code: string, name: string): Promise<number> {
    const rows = await q<RowDataPacket & { id: number }>(
      "SELECT id FROM branches WHERE code = ? AND tenant_id = 1",
      [code],
    );
    if (rows[0]) return rows[0].id;
    const [res] = await app.dbPool.query(
      "INSERT INTO branches (name, code, tenant_id) VALUES (?, ?, 1)",
      [name, code],
    );
    return (res as ResultSetHeader).insertId;
  }

  /** La caja efectivo ARS activa de la sede (la crea si el schema de test no la trae). */
  async function ensureCajaEfectivo(branchId: number, name: string): Promise<number> {
    const rows = await q<RowDataPacket & { id: number }>(
      `SELECT id FROM cash_registers
        WHERE branch_id = ? AND type = 'efectivo' AND is_active = 1 AND currency = 'ARS'
          AND tenant_id = 1`,
      [branchId],
    );
    // La migracion asume UNA caja efectivo ARS activa por sede (como en prod).
    expect(rows.length).toBeLessThanOrEqual(1);
    if (rows[0]) return rows[0].id;
    const [res] = await app.dbPool.query(
      `INSERT INTO cash_registers (name, type, branch_id, currency, cutoff_date, tenant_id)
       VALUES (?, 'efectivo', ?, 'ARS', '2026-06-30', 1)`,
      [name, branchId],
    );
    const id = (res as ResultSetHeader).insertId;
    createdCajas.push(id);
    return id;
  }

  async function insertTx(over: { notes?: string; voided?: boolean } = {}): Promise<void> {
    await app.dbPool.query(
      `INSERT INTO financial_transactions
         (id, tenant_id, kind, direction, amount, currency, payment_method,
          transaction_date, effective_date, branch_id, cash_register_id,
          recorded_by, validation_status, notes, misc_reason, voided_at)
       VALUES (?, 1, 'advance_payment', 'inflow', 10000, 'ARS', 'cash',
               '2026-11-07', '2026-11-07', ?, ?, ?, 'validado', ?, 'otro', ?)`,
      [
        TX_ID,
        albertiId,
        cajaAlbertiId,
        pato,
        over.notes ?? "Vertis",
        over.voided ? new Date() : null,
      ],
    );
  }

  async function runMigration(): Promise<void> {
    for (const stmt of statements) await app.dbPool.query(stmt);
  }

  async function readTx(): Promise<TxRow> {
    const rows = await q<TxRow>(
      "SELECT branch_id, cash_register_id FROM financial_transactions WHERE id = ? AND tenant_id = 1",
      [TX_ID],
    );
    return rows[0];
  }

  async function readAudit(): Promise<AuditRow[]> {
    return q<AuditRow>(
      `SELECT actor_id, CAST(payload_json AS CHAR) AS payload FROM audit_log
        WHERE action = 'transaction_branch_moved' AND target_id = ? AND tenant_id = 1`,
      [TX_ID],
    );
  }

  async function cleanup(): Promise<void> {
    await app.dbPool.query(
      "DELETE FROM audit_log WHERE action = 'transaction_branch_moved' AND target_id = ? AND tenant_id = 1",
      [TX_ID],
    );
    await app.dbPool.query("DELETE FROM financial_transactions WHERE id = ? AND tenant_id = 1", [TX_ID]);
  }

  beforeAll(async () => {
    app = await createTestApp();
    const source = readFileSync(MIG_0324, "utf8");
    // Invariante Fase 103-01: ningun `;` dentro de un comentario `--`.
    const offending = source
      .split("\n")
      .filter((line) => /^\s*--/.test(line) && line.includes(";"));
    expect(offending).toEqual([]);
    statements = splitSqlStatements(source);
    expect(statements.length).toBe(2);

    morenoId = await ensureBranch("MORENO", "Moreno");
    albertiId = await ensureBranch("ALBERTI", "Alberti");
    cajaMorenoId = await ensureCajaEfectivo(morenoId, "Moreno");
    cajaAlbertiId = await ensureCajaEfectivo(albertiId, "Alberti");
    pato = await createStaffUser(app, {
      email: `pato-0324-${Date.now()}@test.com`,
      password: "Test1234!",
      firstName: "Patricio",
      lastName: "Test",
      role: "coach",
      branchId: morenoId,
    });
  });

  beforeEach(cleanup);

  afterAll(async () => {
    await cleanup();
    for (const id of createdCajas) {
      await app.dbPool.query("DELETE FROM cash_registers WHERE id = ? AND tenant_id = 1", [id]);
    }
    await app.close();
  });

  it("mueve el cobro a la sede y caja efectivo de Moreno y lo audita", async () => {
    await insertTx();
    await runMigration();

    const tx = await readTx();
    expect(tx.branch_id).toBe(morenoId);
    expect(tx.cash_register_id).toBe(cajaMorenoId);

    const audit = await readAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_id).toBe(pato);
    expect(JSON.parse(audit[0].payload)).toEqual({
      fromBranchId: albertiId,
      fromCashRegisterId: cajaAlbertiId,
      toBranchId: morenoId,
      toCashRegisterId: cajaMorenoId,
    });
  });

  it("reaplicar es no-op: no duplica la auditoria", async () => {
    await insertTx();
    await runMigration();
    await runMigration();

    const tx = await readTx();
    expect(tx.branch_id).toBe(morenoId);
    expect(await readAudit()).toHaveLength(1);
  });

  it("no toca una fila 3278 que no es el cobro Vertis (otro entorno)", async () => {
    await insertTx({ notes: "Otro cobro" });
    await runMigration();

    const tx = await readTx();
    expect(tx.branch_id).toBe(albertiId);
    expect(tx.cash_register_id).toBe(cajaAlbertiId);
    expect(await readAudit()).toHaveLength(0);
  });

  it("no toca el cobro si ya fue anulado", async () => {
    await insertTx({ voided: true });
    await runMigration();

    const tx = await readTx();
    expect(tx.branch_id).toBe(albertiId);
    expect(await readAudit()).toHaveLength(0);
  });

  it("sin la fila (staging) no hace nada", async () => {
    await runMigration();
    expect(await readTx()).toBeUndefined();
    expect(await readAudit()).toHaveLength(0);
  });
});
