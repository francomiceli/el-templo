/**
 * Fase 214 Plan 31: migracion de repaso de D-49 (segundo deploy).
 *
 * El repaso corre DESPUES de la 0344 y del reinicio de la API: lleva a la escala
 * nueva las filas que la API vieja acredito con montos fijos en el medio. Su tope
 * del dia esta ACOTADO (D-64): un dia con app 3 y asistencia 2 es legitimo con el
 * codigo nuevo y no se toca.
 *
 * Igual que el test de la 0344, extrae los statements REALES del archivo con
 * `splitSqlStatements` y los corre contra filas frescas. Cada caso siembra usuarios
 * propios (unique del ledger) y la ventana se mide contra el `applied_at` real de
 * la 0344 en `_migrations`: las filas "en ventana" nacen 10 minutos despues, las
 * "fuera de ventana" 2 horas despues.
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

// El repaso vive en deploy-2/ hasta el segundo deploy. ACTUALIZAR esta ruta a
// src/db/migrations/NNNN_aura_revaluation_repaso.sql cuando se mueva (README.md).
const REPASO_PATH = path.resolve(
  __dirname,
  "../../../.planning/phases/214-comunidad-anotados-aura/deploy-2/aura_revaluation_repaso.sql",
);

const REVALUATION_MIGRATION_NAME = "0344_aura_revaluation.sql";
const IN_WINDOW_MINUTES = 10;
const OUT_OF_WINDOW_MINUTES = 120;

const REPASO_STATEMENTS = splitSqlStatements(
  readFileSync(REPASO_PATH, "utf8"),
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
    email: `repaso-${Date.now().toString(36)}-${seq}@test.com`,
    password: "Test1234!",
    branchId,
  });
  return Number(user.id);
}

/** Inserta una fila del ledger con created_at relativo al applied_at de la 0344. */
async function insTx(
  userId: number,
  source: string,
  refType: string | null,
  refId: number | null,
  amount: number,
  minutesAfterApplied: number = IN_WINDOW_MINUTES,
): Promise<void> {
  await app.dbPool.query(
    `INSERT INTO aura_transactions
       (user_id, source_type, reference_type, reference_id, amount, created_at)
     VALUES (?, ?, ?, ?, ?,
       DATE_ADD((SELECT applied_at FROM _migrations WHERE name = ?), INTERVAL ? MINUTE))`,
    [
      userId,
      source,
      refType,
      refId,
      amount,
      REVALUATION_MIGRATION_NAME,
      minutesAfterApplied,
    ],
  );
}

async function insAttendance(userId: number, date: string): Promise<number> {
  const [res] = (await app.dbPool.query(
    `INSERT INTO attendance (member_id, branch_id, session_date) VALUES (?, ?, ?)`,
    [userId, branchId, date],
  )) as unknown as [{ insertId: number }, unknown];
  return Number(res.insertId);
}

/** Asistencia con su fila de Aura del monto dado. Devuelve el id de la asistencia. */
async function insAttendanceWithAura(
  userId: number,
  date: string,
  amount: number,
): Promise<number> {
  const attId = await insAttendance(userId, date);
  await insTx(userId, "attendance", "attendance", attId, amount);
  return attId;
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

async function runRepaso(): Promise<void> {
  for (const stmt of REPASO_STATEMENTS) {
    await app.db.execute(sql.raw(stmt));
  }
}

describe("repaso de D-49 (fase 214, segundo deploy)", () => {
  beforeAll(async () => {
    app = await createTestApp();
    const [b] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "TEST"));
    branchId = b.id;
    // El repaso mide la ventana contra la 0344 registrada: sin esa fila no hay prueba valida.
    const [rows] = (await app.dbPool.query(
      `SELECT applied_at FROM _migrations WHERE name = ?`,
      [REVALUATION_MIGRATION_NAME],
    )) as [RowDataPacket[], unknown];
    expect(
      rows,
      `_migrations no tiene ${REVALUATION_MIGRATION_NAME}`,
    ).toHaveLength(1);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  it("extrae los statements reales: 13 UPDATE de aura_transactions y 1 de saldos", () => {
    const tx = REPASO_STATEMENTS.filter((s) =>
      s.toUpperCase().startsWith("UPDATE AURA_TRANSACTIONS"),
    );
    expect(tx).toHaveLength(13);
    expect(REPASO_STATEMENTS).toHaveLength(14);
  });

  it("asistencia de 10 en la ventana pasa a 5 y el resto de las fuentes de codigo viejo se re-mapea", async () => {
    const u = await newUser();
    const attId = await insAttendanceWithAura(u, "2026-05-04", 10);
    await insTx(u, "manual_adjustment", "attendance_reversal", null, -10);
    await insTx(u, "onboarding_completion", null, null, 50);
    await insTx(u, "tenure_milestone", "tenure_milestone", 3, 50);
    await insTx(u, "tenure_milestone", "tenure_milestone", 6, 100);
    await insTx(u, "tenure_milestone", "tenure_milestone", 12, 250);
    await insTx(u, "streak_bonus", "streak_milestone", 7, 20);
    await insTx(u, "streak_bonus", "streak_milestone", 14, 35);
    await insTx(u, "streak_bonus", "streak_milestone", 30, 50);
    await insTx(u, "streak_bonus", "streak_milestone", 60, 100);
    await insTx(u, "streak_bonus", "streak_milestone", 100, 200);

    await runRepaso();

    const rows = await ledger(u);
    expect(amountOf(rows, "attendance", "attendance", attId)).toBe(5);
    expect(
      amountOf(rows, "manual_adjustment", "attendance_reversal", null),
    ).toBe(-5);
    expect(amountOf(rows, "onboarding_completion", null, null)).toBe(5);
    expect(amountOf(rows, "tenure_milestone", "tenure_milestone", 3)).toBe(15);
    expect(amountOf(rows, "tenure_milestone", "tenure_milestone", 6)).toBe(25);
    expect(amountOf(rows, "tenure_milestone", "tenure_milestone", 12)).toBe(50);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 7)).toBe(5);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 14)).toBe(10);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 30)).toBe(15);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 60)).toBe(25);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 100)).toBe(50);
  });

  it("no toca las fuentes que la API vieja lee de la configuracion ni de los programas", async () => {
    const u = await newUser();
    await insTx(u, "extra_block", "extra_block_day", 20260506, 5);
    await insTx(u, "stretch", "stretch_day", 20260507, 5);
    await insTx(u, "program_week_completion", "program_enrollment", 1, 15);
    await insTx(u, "program_completion", "program_enrollment", 2, 100);
    await insTx(u, "training_completion", "training_day", 20260508, 10);

    await runRepaso();

    const rows = await ledger(u);
    expect(amountOf(rows, "extra_block", "extra_block_day", 20260506)).toBe(5);
    expect(amountOf(rows, "stretch", "stretch_day", 20260507)).toBe(5);
    expect(
      amountOf(rows, "program_week_completion", "program_enrollment", 1),
    ).toBe(15);
    expect(amountOf(rows, "program_completion", "program_enrollment", 2)).toBe(
      100,
    );
    expect(
      amountOf(rows, "training_completion", "training_day", 20260508),
    ).toBe(10);
  });

  it("D-64: app 3 y asistencia 2 el mismo dia no se toca", async () => {
    const u = await newUser();
    const attId = await insAttendanceWithAura(u, "2026-05-04", 2);
    await insTx(u, "training_completion", "training_day", 20260504, 3);

    await runRepaso();

    const rows = await ledger(u);
    expect(amountOf(rows, "attendance", "attendance", attId)).toBe(2);
    expect(
      amountOf(rows, "training_completion", "training_day", 20260504),
    ).toBe(3);
  });

  it("app 3 y asistencia 10 el mismo dia en la ventana: asistencia 5 y app 0", async () => {
    const byDay = await newUser();
    const byDayAtt = await insAttendanceWithAura(byDay, "2026-05-04", 10);
    await insTx(byDay, "training_completion", "training_day", 20260504, 3);

    const byPlanDay = await newUser();
    const planAtt = await insAttendanceWithAura(byPlanDay, "2026-05-05", 10);
    await insTx(
      byPlanDay,
      "goal_plan_completion",
      "goal_plan_day",
      20260505,
      3,
    );

    const bySession = await newUser();
    const sessAtt = await insAttendanceWithAura(bySession, "2026-05-07", 10);
    const csId = await insCompletedSession(
      bySession,
      "2026-05-07",
      "W1-lunes-alfa",
    );
    await insTx(bySession, "training_completion", "completed_session", csId, 3);

    const otherDay = await newUser();
    const otherAtt = await insAttendanceWithAura(otherDay, "2026-05-04", 10);
    await insTx(otherDay, "training_completion", "training_day", 20260506, 3);

    await runRepaso();

    const a = await ledger(byDay);
    expect(amountOf(a, "attendance", "attendance", byDayAtt)).toBe(5);
    expect(amountOf(a, "training_completion", "training_day", 20260504)).toBe(
      0,
    );

    const b = await ledger(byPlanDay);
    expect(amountOf(b, "attendance", "attendance", planAtt)).toBe(5);
    expect(amountOf(b, "goal_plan_completion", "goal_plan_day", 20260505)).toBe(
      0,
    );

    const c = await ledger(bySession);
    expect(amountOf(c, "attendance", "attendance", sessAtt)).toBe(5);
    expect(amountOf(c, "training_completion", "completed_session", csId)).toBe(
      0,
    );

    // Otro dia: la asistencia se re-mapea pero la app de ese dia queda.
    const d = await ledger(otherDay);
    expect(amountOf(d, "attendance", "attendance", otherAtt)).toBe(5);
    expect(amountOf(d, "training_completion", "training_day", 20260506)).toBe(
      3,
    );
  });

  it("app 3 creada fuera de la ventana con asistencia 5 el mismo dia no se toca", async () => {
    const u = await newUser();
    const attId = await insAttendanceWithAura(u, "2026-05-04", 5);
    await insTx(
      u,
      "training_completion",
      "training_day",
      20260504,
      3,
      OUT_OF_WINDOW_MINUTES,
    );

    await runRepaso();

    const rows = await ledger(u);
    expect(amountOf(rows, "attendance", "attendance", attId)).toBe(5);
    expect(
      amountOf(rows, "training_completion", "training_day", 20260504),
    ).toBe(3);
  });

  it("dos asistencias del dia (2 y 5) con app 3 no se tocan", async () => {
    const u = await newUser();
    const smallAtt = await insAttendanceWithAura(u, "2026-05-04", 2);
    const bigAtt = await insAttendanceWithAura(u, "2026-05-04", 5);
    await insTx(u, "training_completion", "training_day", 20260504, 3);

    await runRepaso();

    const rows = await ledger(u);
    expect(amountOf(rows, "attendance", "attendance", smallAtt)).toBe(2);
    expect(amountOf(rows, "attendance", "attendance", bigAtt)).toBe(5);
    expect(
      amountOf(rows, "training_completion", "training_day", 20260504),
    ).toBe(3);
  });

  it("app 3 sin asistencia de ese dia, o con una asistencia de otro dia, no se toca", async () => {
    const noAtt = await newUser();
    await insTx(noAtt, "training_completion", "training_day", 20260504, 3);

    const oldDayAtt = await newUser();
    const attId = await insAttendanceWithAura(oldDayAtt, "2026-05-03", 10);
    await insTx(oldDayAtt, "training_completion", "training_day", 20260504, 3);

    await runRepaso();

    expect(
      amountOf(
        await ledger(noAtt),
        "training_completion",
        "training_day",
        20260504,
      ),
    ).toBe(3);
    const rows = await ledger(oldDayAtt);
    expect(amountOf(rows, "attendance", "attendance", attId)).toBe(5);
    expect(
      amountOf(rows, "training_completion", "training_day", 20260504),
    ).toBe(3);
  });

  it("app y plan a medida el mismo dia: queda la app y el plan pasa a 0", async () => {
    const u = await newUser();
    await insTx(u, "training_completion", "training_day", 20260505, 3);
    await insTx(u, "goal_plan_completion", "goal_plan_day", 20260505, 3);

    await runRepaso();

    const rows = await ledger(u);
    expect(
      amountOf(rows, "training_completion", "training_day", 20260505),
    ).toBe(3);
    expect(
      amountOf(rows, "goal_plan_completion", "goal_plan_day", 20260505),
    ).toBe(0);
  });

  it("las filas que no encajan en ninguna regla quedan intactas", async () => {
    const u = await newUser();
    await insTx(u, "attendance", "attendance", 900001, 7);
    await insTx(u, "tenure_milestone", "tenure_milestone", 6, 50);
    await insTx(u, "streak_bonus", "streak_milestone", 30, 200);
    await insTx(u, "manual_adjustment", "subscription", 55, -500);
    await insTx(u, "referral", "subscription", 56, 0);

    await runRepaso();

    const rows = await ledger(u);
    expect(amountOf(rows, "attendance", "attendance", 900001)).toBe(7);
    expect(amountOf(rows, "tenure_milestone", "tenure_milestone", 6)).toBe(50);
    expect(amountOf(rows, "streak_bonus", "streak_milestone", 30)).toBe(200);
    expect(amountOf(rows, "manual_adjustment", "subscription", 55)).toBe(-500);
    expect(amountOf(rows, "referral", "subscription", 56)).toBe(0);
  });

  it("es idempotente: dos corridas dejan el mismo ledger", async () => {
    const a = await newUser();
    await insAttendanceWithAura(a, "2026-05-04", 10);
    await insTx(a, "training_completion", "training_day", 20260504, 3);
    await insTx(a, "onboarding_completion", null, null, 50);
    await insTx(a, "streak_bonus", "streak_milestone", 30, 50);

    const b = await newUser();
    await insAttendanceWithAura(b, "2026-05-04", 2);
    await insTx(b, "training_completion", "training_day", 20260504, 3);

    const c = await newUser();
    await insTx(c, "training_completion", "training_day", 20260510, 3);
    await insTx(c, "goal_plan_completion", "goal_plan_day", 20260510, 3);

    await runRepaso();
    const first = [
      ...(await ledger(a)),
      ...(await ledger(b)),
      ...(await ledger(c)),
    ];
    await runRepaso();
    const second = [
      ...(await ledger(a)),
      ...(await ledger(b)),
      ...(await ledger(c)),
    ];

    expect(second).toEqual(first);
  });

  it("el saldo guardado queda igual a la suma del ledger", async () => {
    const u1 = await newUser();
    const u2 = await newUser();
    const u3 = await newUser();
    await insAttendanceWithAura(u1, "2026-05-04", 10);
    await insTx(u1, "training_completion", "training_day", 20260504, 3);
    await insTx(u1, "onboarding_completion", null, null, 50);
    await insTx(u2, "tenure_milestone", "tenure_milestone", 6, 100);
    await insTx(u2, "manual_adjustment", "subscription", 77, -20);
    await app.dbPool.query(
      `INSERT INTO aura_balances (user_id, balance) VALUES (?, 999), (?, 12), (?, 40)`,
      [u1, u2, u3],
    );

    await runRepaso();

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
    const offenders = readFileSync(REPASO_PATH, "utf8")
      .split("\n")
      .filter(
        (line) => line.trimStart().startsWith("--") && line.includes(";"),
      );
    expect(offenders).toEqual([]);
  });

  it("guard estatico: sin respaldo, ALTER, configuracion de Aura ni programas", () => {
    const source = readFileSync(REPASO_PATH, "utf8");
    expect(source).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE/i);
    expect(source).not.toMatch(/aura_config|UPDATE\s+programs/i);
  });
});
