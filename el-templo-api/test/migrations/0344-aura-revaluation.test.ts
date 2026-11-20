/**
 * Fase 214 Plan 04: migracion 0344 (re-valorizacion del ledger de Aura, D-21).
 *
 * En vez de reimplementar las reglas, el test extrae los statements REALES de
 * la migracion (UPDATE aura_transactions y UPDATE aura_balances) con el mismo
 * parser del runner (`splitSqlStatements`) y los corre contra filas frescas.
 * Los CREATE TABLE de respaldo y los ALTER no se corren: la base de test ya
 * tiene la migracion aplicada.
 *
 * Cada caso siembra un usuario propio para no chocar con el unique
 * `unique_user_source_ref`. Los ids de usuario salen de `registerUser`.
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

const MIGRATION = path.resolve(
  __dirname,
  "../../src/db/migrations/0344_aura_revaluation.sql",
);

const REVALUATION_STATEMENTS = splitSqlStatements(
  readFileSync(MIGRATION, "utf8"),
).filter((s) => {
  const head = s.trimStart().toUpperCase();
  return (
    head.startsWith("UPDATE AURA_TRANSACTIONS") ||
    head.startsWith("UPDATE AURA_BALANCES")
  );
});

interface TxRow extends RowDataPacket {
  id: number;
  user_id: number;
  source_type: string;
  reference_type: string | null;
  reference_id: number | null;
  amount: number;
}

let app: FastifyInstance;
let branchId: number;
let seq = 0;

async function newUser(): Promise<number> {
  seq += 1;
  const { user } = await registerUser(app, {
    email: `rev0344-${Date.now().toString(36)}-${seq}@test.com`,
    password: "Test1234!",
    branchId,
  });
  return Number(user.id);
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

async function insAttendance(userId: number, date: string): Promise<number> {
  const [res] = (await app.dbPool.query(
    `INSERT INTO attendance (member_id, branch_id, session_date) VALUES (?, ?, ?)`,
    [userId, branchId, date],
  )) as unknown as [{ insertId: number }, unknown];
  return Number(res.insertId);
}

async function insCompletedSession(
  userId: number,
  date: string,
  dayId: string,
): Promise<number> {
  const [res] = (await app.dbPool.query(
    `INSERT INTO completed_sessions
       (user_id, day_id, session_level, date, branch_id, started_at, completed_at, blocks_completed)
     VALUES (?, ?, 'alfa', ?, ?, NOW(), NOW(), '[]')`,
    [userId, dayId, date, branchId],
  )) as unknown as [{ insertId: number }, unknown];
  return Number(res.insertId);
}

async function ledger(userId: number): Promise<TxRow[]> {
  const [rows] = (await app.dbPool.query(
    `SELECT id, user_id, source_type, reference_type, reference_id, amount
       FROM aura_transactions WHERE user_id = ? ORDER BY id`,
    [userId],
  )) as [TxRow[], unknown];
  return rows;
}

function amountOf(
  rows: TxRow[],
  source: string,
  refType: string | null,
  refId: number | null,
): number {
  const row = rows.find(
    (r) =>
      r.source_type === source &&
      r.reference_type === refType &&
      r.reference_id === refId,
  );
  expect(
    row,
    `fila ${source}/${refType ?? "-"}/${refId ?? "-"} no existe`,
  ).toBeDefined();
  return Number(row?.amount);
}

async function runRevaluation(): Promise<void> {
  for (const stmt of REVALUATION_STATEMENTS) {
    await app.db.execute(sql.raw(stmt));
  }
}

describe("0344 re-valorizacion de Aura (fase 214 D-21)", () => {
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

  it("extrae los statements reales: 18 UPDATE de aura_transactions y 1 de saldos", () => {
    const tx = REVALUATION_STATEMENTS.filter((s) =>
      s.toUpperCase().startsWith("UPDATE AURA_TRANSACTIONS"),
    );
    expect(tx).toHaveLength(18);
    expect(REVALUATION_STATEMENTS).toHaveLength(19);
  });

  it("mapea cada valor viejo exacto al monto nuevo de D-19", async () => {
    const u = await newUser();
    await insTx(u, "attendance", "attendance", 900001, 10);
    await insTx(u, "manual_adjustment", "attendance_reversal", null, -10);
    await insTx(u, "onboarding_completion", null, null, 50);
    await insTx(u, "tenure_milestone", "tenure_milestone", 3, 50);
    await insTx(u, "tenure_milestone", "tenure_milestone", 6, 100);
    await insTx(u, "tenure_milestone", "tenure_milestone", 12, 250);
    await insTx(u, "tenure_milestone", "tenure_milestone", 24, 250);
    await insTx(u, "streak_bonus", "streak_milestone", 7, 20);
    await insTx(u, "streak_bonus", "streak_milestone", 14, 35);
    await insTx(u, "streak_bonus", "streak_milestone", 30, 50);
    await insTx(u, "streak_bonus", "streak_milestone", 60, 100);
    await insTx(u, "streak_bonus", "streak_milestone", 100, 200);
    await insTx(u, "training_completion", "training_day", 20260504, 10);
    await insTx(u, "goal_plan_completion", "goal_plan_day", 20260505, 10);
    await insTx(u, "extra_block", "extra_block_day", 20260506, 5);
    await insTx(u, "stretch", "stretch_day", 20260507, 5);
    await insTx(u, "program_week_completion", "program_enrollment", 1, 15);
    await insTx(u, "program_completion", "program_enrollment", 2, 100);
    await insTx(u, "referral", "subscription", 1, 0);

    await runRevaluation();

    const rows = await ledger(u);
    expect(amountOf(rows, "attendance", "attendance", 900001)).toBe(5);
    expect(
      amountOf(rows, "manual_adjustment", "attendance_reversal", null),
    ).toBe(-5);
    expect(amountOf(rows, "onboarding_completion", null, null)).toBe(5);
    expect(amountOf(rows, "tenure_milestone", "tenure_milestone", 3)).toBe(15);
    expect(amountOf(rows, "tenure_milestone", "tenure_milestone", 6)).toBe(25);
    expect(amountOf(rows, "tenure_milestone", "tenure_milestone", 12)).toBe(50);
    expect(amountOf(rows, "tenure_milestone", "tenure_milestone", 24)).toBe(50);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 7)).toBe(5);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 14)).toBe(10);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 30)).toBe(15);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 60)).toBe(25);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 100)).toBe(50);
    expect(
      amountOf(rows, "training_completion", "training_day", 20260504),
    ).toBe(3);
    expect(
      amountOf(rows, "goal_plan_completion", "goal_plan_day", 20260505),
    ).toBe(3);
    expect(amountOf(rows, "extra_block", "extra_block_day", 20260506)).toBe(2);
    expect(amountOf(rows, "stretch", "stretch_day", 20260507)).toBe(1);
    expect(
      amountOf(rows, "program_week_completion", "program_enrollment", 1),
    ).toBe(8);
    expect(amountOf(rows, "program_completion", "program_enrollment", 2)).toBe(
      50,
    );
    expect(amountOf(rows, "referral", "subscription", 1)).toBe(0);
  });

  it("es idempotente: una segunda corrida deja el ledger igual", async () => {
    const u = await newUser();
    await insTx(u, "attendance", "attendance", 900001, 10);
    await insTx(u, "onboarding_completion", null, null, 50);
    await insTx(u, "tenure_milestone", "tenure_milestone", 6, 100);
    await insTx(u, "streak_bonus", "streak_milestone", 30, 50);
    await insTx(u, "training_completion", "training_day", 20260504, 10);
    await insTx(u, "program_week_completion", "program_enrollment", 1, 15);
    const attId = await insAttendance(u, "2026-05-04");
    await insTx(u, "attendance", "attendance", attId, 10);
    const u2 = await newUser();
    await insTx(u2, "training_completion", "training_day", 20260510, 10);
    await insTx(u2, "goal_plan_completion", "goal_plan_day", 20260510, 10);

    await runRevaluation();
    const first = [...(await ledger(u)), ...(await ledger(u2))];
    await runRevaluation();
    const second = [...(await ledger(u)), ...(await ledger(u2))];

    expect(second).toEqual(first);
  });

  it("las filas que no encajan en ninguna regla quedan intactas", async () => {
    const u = await newUser();
    await insTx(u, "attendance", "attendance", 900001, 7);
    await insTx(u, "tenure_milestone", "tenure_milestone", 6, 50);
    await insTx(u, "streak_bonus", "streak_milestone", 30, 200);
    await insTx(u, "manual_adjustment", "subscription", 55, -500);
    await insTx(u, "referral", "subscription", 56, 0);

    await runRevaluation();

    const rows = await ledger(u);
    expect(amountOf(rows, "attendance", "attendance", 900001)).toBe(7);
    expect(amountOf(rows, "tenure_milestone", "tenure_milestone", 6)).toBe(50);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 30)).toBe(200);
    expect(amountOf(rows, "manual_adjustment", "subscription", 55)).toBe(-500);
    expect(amountOf(rows, "referral", "subscription", 56)).toBe(0);
  });

  it("los valores nuevos no se re-mapean (incluida la asistencia de 2)", async () => {
    const u = await newUser();
    await insTx(u, "tenure_milestone", "tenure_milestone", 12, 50);
    await insTx(u, "streak_bonus", "streak_milestone", 100, 50);
    await insTx(u, "attendance", "attendance", 900002, 2);
    await insTx(u, "attendance", "attendance", 900003, 5);

    await runRevaluation();

    const rows = await ledger(u);
    expect(amountOf(rows, "tenure_milestone", "tenure_milestone", 12)).toBe(50);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 100)).toBe(50);
    expect(amountOf(rows, "attendance", "attendance", 900002)).toBe(2);
    expect(amountOf(rows, "attendance", "attendance", 900003)).toBe(5);
  });

  it("tope del dia (D-64): asistencia 5 y app 0 el mismo dia, dos corridas iguales", async () => {
    const withAtt = await newUser();
    const attId = await insAttendance(withAtt, "2026-05-04");
    await insTx(withAtt, "attendance", "attendance", attId, 10);
    await insTx(withAtt, "training_completion", "training_day", 20260504, 10);

    const appAndPlan = await newUser();
    await insTx(
      appAndPlan,
      "training_completion",
      "training_day",
      20260505,
      10,
    );
    await insTx(
      appAndPlan,
      "goal_plan_completion",
      "goal_plan_day",
      20260505,
      10,
    );

    const otherDay = await newUser();
    const otherAtt = await insAttendance(otherDay, "2026-05-04");
    await insTx(otherDay, "attendance", "attendance", otherAtt, 10);
    await insTx(otherDay, "training_completion", "training_day", 20260506, 10);

    const oldTypes = await newUser();
    const oldAtt = await insAttendance(oldTypes, "2026-05-07");
    await insTx(oldTypes, "attendance", "attendance", oldAtt, 10);
    const csId = await insCompletedSession(
      oldTypes,
      "2026-05-07",
      "W1-lunes-alfa",
    );
    await insTx(oldTypes, "training_completion", "completed_session", csId, 10);

    for (let pass = 0; pass < 2; pass++) {
      await runRevaluation();

      const a = await ledger(withAtt);
      expect(amountOf(a, "attendance", "attendance", attId)).toBe(5);
      expect(amountOf(a, "training_completion", "training_day", 20260504)).toBe(
        0,
      );

      const b = await ledger(appAndPlan);
      expect(amountOf(b, "training_completion", "training_day", 20260505)).toBe(
        3,
      );
      expect(
        amountOf(b, "goal_plan_completion", "goal_plan_day", 20260505),
      ).toBe(0);

      const c = await ledger(otherDay);
      expect(amountOf(c, "attendance", "attendance", otherAtt)).toBe(5);
      expect(amountOf(c, "training_completion", "training_day", 20260506)).toBe(
        3,
      );

      const d = await ledger(oldTypes);
      expect(amountOf(d, "attendance", "attendance", oldAtt)).toBe(5);
      expect(
        amountOf(d, "training_completion", "completed_session", csId),
      ).toBe(0);
    }
  });

  it("el saldo guardado queda igual a la suma del ledger", async () => {
    const u1 = await newUser();
    const u2 = await newUser();
    const u3 = await newUser();
    await insTx(u1, "attendance", "attendance", 900001, 10);
    await insTx(u1, "onboarding_completion", null, null, 50);
    await insTx(u2, "tenure_milestone", "tenure_milestone", 6, 100);
    await insTx(u2, "manual_adjustment", "subscription", 77, -20);
    await app.dbPool.query(
      `INSERT INTO aura_balances (user_id, balance) VALUES (?, 999), (?, 12), (?, 40)`,
      [u1, u2, u3],
    );

    await runRevaluation();

    for (const userId of [u1, u2, u3]) {
      const [rows] = (await app.dbPool.query(
        `SELECT b.balance AS balance,
                (SELECT COALESCE(SUM(t.amount), 0) FROM aura_transactions t WHERE t.user_id = b.user_id) AS total
           FROM aura_balances b WHERE b.user_id = ?`,
        [userId],
      )) as [RowDataPacket[], unknown];
      expect(Number(rows[0].balance)).toBe(Number(rows[0].total));
    }
  });

  it("guard estatico: ningun comentario SQL contiene punto y coma", () => {
    const offenders = readFileSync(MIGRATION, "utf8")
      .split("\n")
      .filter(
        (line) => line.trimStart().startsWith("--") && line.includes(";"),
      );
    expect(offenders).toEqual([]);
  });

  it("guard estatico: sin formulas sobre amount", () => {
    const source = readFileSync(MIGRATION, "utf8");
    expect(source).not.toMatch(/amount\s*[/*]/i);
    expect(source).not.toMatch(/CEIL\(|FLOOR\(|ROUND\(/i);
  });

  it("guard estatico: los respaldos se crean antes del primer UPDATE", () => {
    const source = readFileSync(MIGRATION, "utf8");
    const firstCreate = source.indexOf(
      "CREATE TABLE aura_transactions_backup_0344",
    );
    const secondCreate = source.indexOf(
      "CREATE TABLE aura_balances_backup_0344",
    );
    const firstUpdate = source.search(/^UPDATE /m);
    expect(firstCreate).toBeGreaterThanOrEqual(0);
    expect(secondCreate).toBeGreaterThan(firstCreate);
    expect(firstUpdate).toBeGreaterThan(secondCreate);
  });
});
