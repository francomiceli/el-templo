/**
 * Migración 0359: re-valorización retroactiva de la Aura por asistencia a
 * actividades especiales (2026-11-25). Una especial sin Aura propia pasa a
 * valer 10 (antes 5) también en el historial de 2026.
 *
 * Como el test de la 0344, extrae los statements REALES de la migración
 * (UPDATE aura_transactions y UPDATE aura_balances) con el parser del runner
 * (`splitSqlStatements`) y los corre contra filas frescas. Los CREATE TABLE de
 * respaldo no se corren: la base de test ya tiene la migración aplicada.
 *
 * Los ids de usuario salen de `registerUser` (nunca hardcodeados).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { eq, sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createTestApp, cleanAllTestData, registerUser } from "../helpers";
import * as schema from "../../src/db/schema";
import { splitSqlStatements } from "../../src/db/run-migrations";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const MIGRATION = path.resolve(
  __dirname,
  "../../src/db/migrations/0359_aura_retro_especiales.sql",
);

const RETRO_STATEMENTS = splitSqlStatements(
  readFileSync(MIGRATION, "utf8"),
).filter((s) => {
  const head = s.trimStart().toUpperCase();
  return (
    head.startsWith("UPDATE AURA_TRANSACTIONS") ||
    head.startsWith("UPDATE AURA_BALANCES")
  );
});

let app: FastifyInstance;
let branchId: number;
let seq = 0;

async function newUser(): Promise<number> {
  seq += 1;
  const { user } = await registerUser(app, {
    email: `retro0359-${Date.now().toString(36)}-${seq}@test.com`,
    password: "Test1234!",
    branchId,
  });
  return Number(user.id);
}

/** Actividad + horario. Devuelve el id del horario. */
async function insSchedule(opts: {
  isSpecial: boolean;
  auraAmount?: number | null;
}): Promise<number> {
  seq += 1;
  const [act] = (await app.dbPool.query(
    `INSERT INTO activities (name, is_special, aura_amount) VALUES (?, ?, ?)`,
    [`Retro 0359 ${seq}`, opts.isSpecial ? 1 : 0, opts.auraAmount ?? null],
  )) as unknown as [{ insertId: number }, unknown];
  const [sch] = (await app.dbPool.query(
    `INSERT INTO schedules (tenant_id, activity_id, branch_id, day_of_week, start_time, end_time, is_active)
     VALUES (?, ?, ?, 3, '10:00', '11:00', 1)`,
    [TENANT_TEMPLO, act.insertId, branchId],
  )) as unknown as [{ insertId: number }, unknown];
  return Number(sch.insertId);
}

async function insAttendance(
  userId: number,
  scheduleId: number,
  date: string,
): Promise<number> {
  const [res] = (await app.dbPool.query(
    `INSERT INTO attendance (member_id, branch_id, schedule_id, session_date) VALUES (?, ?, ?, ?)`,
    [userId, branchId, scheduleId, date],
  )) as unknown as [{ insertId: number }, unknown];
  return Number(res.insertId);
}

async function insTx(
  userId: number,
  source: string,
  refType: string | null,
  refId: number | null,
  amount: number,
): Promise<void> {
  await app.dbPool.query(
    `INSERT INTO aura_transactions (user_id, source_type, reference_type, reference_id, amount)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, source, refType, refId, amount],
  );
}

/** Asistencia + su crédito de Aura en el ledger. Devuelve el id de asistencia. */
async function credited(
  userId: number,
  scheduleId: number,
  date: string,
  amount: number,
): Promise<number> {
  const attendanceId = await insAttendance(userId, scheduleId, date);
  await insTx(userId, "attendance", "attendance", attendanceId, amount);
  return attendanceId;
}

async function attendanceAmount(
  userId: number,
  attendanceId: number,
): Promise<number> {
  const [rows] = (await app.dbPool.query(
    `SELECT amount FROM aura_transactions
      WHERE user_id = ? AND source_type = 'attendance'
        AND reference_type = 'attendance' AND reference_id = ?`,
    [userId, attendanceId],
  )) as [RowDataPacket[], unknown];
  expect(rows).toHaveLength(1);
  return Number(rows[0].amount);
}

async function setBalance(userId: number, balance: number): Promise<void> {
  await app.dbPool.query(
    `INSERT INTO aura_balances (user_id, balance) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE balance = VALUES(balance)`,
    [userId, balance],
  );
}

async function balanceAndLedger(
  userId: number,
): Promise<{ balance: number; total: number }> {
  const [rows] = (await app.dbPool.query(
    `SELECT b.balance AS balance,
            (SELECT COALESCE(SUM(t.amount), 0) FROM aura_transactions t WHERE t.user_id = b.user_id) AS total
       FROM aura_balances b WHERE b.user_id = ?`,
    [userId],
  )) as [RowDataPacket[], unknown];
  return { balance: Number(rows[0].balance), total: Number(rows[0].total) };
}

async function runRetro(): Promise<void> {
  for (const stmt of RETRO_STATEMENTS) {
    // Como en el test de la 0315: la migración corre tal cual la aplica el
    // runner (sin sentinel), sobre todos los gimnasios.
    await app.db.execute(
      sql.raw(
        `/* tenant-safe: migracion aplicada tal cual la corre el runner, revaloriza el ledger de todos los gimnasios */ ${stmt}`,
      ),
    );
  }
}

describe("0359 Aura retroactiva de actividades especiales", () => {
  beforeAll(async () => {
    app = await createTestApp();
    const [b] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "TEST"));
    branchId = b.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  it("extrae los statements reales: 2 UPDATE del ledger y 1 de saldos", () => {
    const tx = RETRO_STATEMENTS.filter((s) =>
      s.toUpperCase().startsWith("UPDATE AURA_TRANSACTIONS"),
    );
    expect(tx).toHaveLength(2);
    expect(RETRO_STATEMENTS).toHaveLength(3);
  });

  it("especial sin Aura propia en 2026: 5 pasa a 10 y 2 (tope del día) pasa a 7", async () => {
    const u = await newUser();
    const especial = await insSchedule({ isSpecial: true });
    const full = await credited(u, especial, "2026-10-01", 5);
    const capped = await credited(u, especial, "2026-10-08", 2);

    await runRetro();

    expect(await attendanceAmount(u, full)).toBe(10);
    expect(await attendanceAmount(u, capped)).toBe(7);
  });

  it("no toca clases regulares, especiales con Aura propia, ni asistencias de 2025", async () => {
    const u = await newUser();
    const regular = await insSchedule({ isSpecial: false });
    const especialPropia = await insSchedule({
      isSpecial: true,
      auraAmount: 15,
    });
    const especial = await insSchedule({ isSpecial: true });

    const reg = await credited(u, regular, "2026-10-01", 5);
    const propia = await credited(u, especialPropia, "2026-10-02", 5);
    const old = await credited(u, especial, "2025-12-31", 5);

    await runRetro();

    expect(await attendanceAmount(u, reg)).toBe(5);
    expect(await attendanceAmount(u, propia)).toBe(5);
    expect(await attendanceAmount(u, old)).toBe(5);
  });

  it("otros montos quedan intactos (solo mapea 5 y 2)", async () => {
    const u = await newUser();
    const especial = await insSchedule({ isSpecial: true });
    const odd = await credited(u, especial, "2026-10-01", 3);

    await runRetro();

    expect(await attendanceAmount(u, odd)).toBe(3);
  });

  it("una asistencia deshecha (sin fila en attendance) deja crédito y reversa iguales", async () => {
    const u = await newUser();
    const especial = await insSchedule({ isSpecial: true });
    const attId = await credited(u, especial, "2026-10-01", 5);
    await insTx(u, "manual_adjustment", "attendance_reversal", null, -5);
    await app.dbPool.query(`DELETE FROM attendance WHERE id = ?`, [attId]);

    await runRetro();

    const [rows] = (await app.dbPool.query(
      `SELECT source_type, amount FROM aura_transactions WHERE user_id = ? ORDER BY id`,
      [u],
    )) as [RowDataPacket[], unknown];
    expect(rows.map((r) => Number(r.amount))).toEqual([5, -5]);
  });

  it("es idempotente: una segunda corrida deja el ledger igual", async () => {
    const u = await newUser();
    const especial = await insSchedule({ isSpecial: true });
    const full = await credited(u, especial, "2026-10-01", 5);
    const capped = await credited(u, especial, "2026-10-08", 2);
    await setBalance(u, 7);

    await runRetro();
    await runRetro();

    expect(await attendanceAmount(u, full)).toBe(10);
    expect(await attendanceAmount(u, capped)).toBe(7);
    expect(await balanceAndLedger(u)).toEqual({ balance: 17, total: 17 });
  });

  it("recalcula el saldo de los afectados y no toca el de los demás", async () => {
    const afectado = await newUser();
    const ajeno = await newUser();
    const especial = await insSchedule({ isSpecial: true });
    const regular = await insSchedule({ isSpecial: false });

    await credited(afectado, especial, "2026-10-01", 5);
    await credited(afectado, regular, "2026-10-02", 5);
    await insTx(afectado, "training_completion", "training_day", 20261003, 3);
    await setBalance(afectado, 13);

    await credited(ajeno, regular, "2026-10-01", 5);
    // Saldo desfasado a propósito: la migración no recalcula a quien no toca.
    await setBalance(ajeno, 999);

    await runRetro();

    expect(await balanceAndLedger(afectado)).toEqual({
      balance: 18,
      total: 18,
    });
    expect((await balanceAndLedger(ajeno)).balance).toBe(999);
  });

  it("guard estático: ningún comentario SQL contiene punto y coma", () => {
    const offenders = readFileSync(MIGRATION, "utf8")
      .split("\n")
      .filter(
        (line) => line.trimStart().startsWith("--") && line.includes(";"),
      );
    expect(offenders).toEqual([]);
  });

  it("guard estático: sin fórmulas sobre amount (solo valores literales)", () => {
    const source = readFileSync(MIGRATION, "utf8");
    expect(source).not.toMatch(/amount\s*[+\-/*]/i);
  });

  it("guard estático: los respaldos se crean antes del primer UPDATE", () => {
    const source = readFileSync(MIGRATION, "utf8");
    const firstCreate = source.indexOf(
      "CREATE TABLE aura_transactions_backup_0359",
    );
    const secondCreate = source.indexOf(
      "CREATE TABLE aura_balances_backup_0359",
    );
    const firstUpdate = source.search(/^UPDATE /m);
    expect(firstCreate).toBeGreaterThanOrEqual(0);
    expect(secondCreate).toBeGreaterThan(firstCreate);
    expect(firstUpdate).toBeGreaterThan(secondCreate);
  });
});
