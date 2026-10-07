/**
 * Fase 194 Plan 21: migraciones de datos de produccion 0260 y 0261.
 *
 *  - 0260 (D-28) corrige el vinculo de referidos id=3 invertido (Guido/Valentina).
 *  - 0261 renombra el copy vivo de la notificacion `referral_link_activated` y del
 *    aviso `card_referral` SOLO donde la fila conserva el texto por defecto.
 *
 * EXCEPCION a "no hardcodear ids" (registrada en 194-EXECUTOR-RULES.md): este es
 * el UNICO test de la fase que siembra `users.id` 6613 y 7286, `referrals.id` 3 y
 * `subscriptions.id` 8074, porque el SQL de 0260 apunta a esos ids de PRODUCCION
 * (precedente: 0109_reconcile_soledad.test.ts). Antes de sembrar se verifica que
 * no existan en la DB del worker y se borran en `afterAll`.
 *
 * El SQL se lee de disco y se parte con `splitSqlStatements` (el mismo parser que
 * usa el runner de produccion).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import argon2 from "argon2";
import { createTestApp } from "../helpers";
import { splitSqlStatements } from "../../src/db/run-migrations";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../src/db/migrations");
const MIG_0260 = path.join(MIGRATIONS_DIR, "0260_fix_referral_3_inverted.sql");

// Ids de PRODUCCION a los que apunta 0260 (CONTEXT D-28, verificado 2026-10-06).
const GUIDO = 7286;
const VALENTINA = 6613;
const REFERRAL_ID = 3;
const FIRST_PAYMENT_SUB_ID = 8074;

const DAY_MS = 86_400_000;
// Gimnasio inexistente a proposito: solo para probar que 0260 filtra por tenant.
const OTHER_TENANT_ID = 999_999;

interface ReferralRow extends RowDataPacket {
  id: number;
  referrerId: number;
  referredId: number;
  status: string;
  copyVariant: string | null;
  qualifiedAt: string | null;
}

interface UserRefRow extends RowDataPacket {
  id: number;
  referredBy: number | null;
}

interface CreditRow extends RowDataPacket {
  id: number;
  userId: number;
  subscriptionId: number;
  percent: number;
  amount: number;
}

interface Snapshot {
  referral: ReferralRow | null;
  users: UserRefRow[];
  credits: CreditRow[];
}

function toMysqlDateTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function readStatements(file: string): string[] {
  const source = readFileSync(file, "utf8");
  // Invariante Fase 103-01: ningun `;` dentro de un comentario `--`.
  const offending = source
    .split("\n")
    .filter((line) => /^\s*--/.test(line) && line.includes(";"));
  expect(offending).toEqual([]);
  const statements = splitSqlStatements(source);
  expect(statements.length).toBeGreaterThan(0);
  return statements;
}

describe("Migracion 0260 — vinculo de referidos 3 invertido (D-28)", () => {
  let app: FastifyInstance;
  let argonHash: string;
  let branchId: number;
  let planId: number;
  let statements0260: string[];
  let strangerReferrerId: number | null = null;

  beforeAll(async () => {
    app = await createTestApp();
    argonHash = await argon2.hash("test-password-ignored");
    statements0260 = readStatements(MIG_0260);

    const [branch] = (await app.dbPool.query(
      "SELECT id FROM branches WHERE code = 'TEST' AND tenant_id = ? LIMIT 1",
      [TENANT_TEMPLO],
    )) as [RowDataPacket[], unknown];
    if (!branch[0]) throw new Error("Falta la sede TEST en el fixture");
    branchId = Number(branch[0].id);

    // Los ids de produccion NO deben existir en la DB del worker: si existen,
    // son de otro archivo y borrarlos seria pisar su fixture.
    const [clash] = (await app.dbPool.query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE id IN (?, ?) AND tenant_id = ?) AS u,
         (SELECT COUNT(*) FROM referrals WHERE (id = ? OR referred_id IN (?, ?)) AND tenant_id = ?) AS r,
         (SELECT COUNT(*) FROM subscriptions WHERE id = ? AND tenant_id = ?) AS s`,
      [
        GUIDO,
        VALENTINA,
        TENANT_TEMPLO,
        REFERRAL_ID,
        GUIDO,
        VALENTINA,
        TENANT_TEMPLO,
        FIRST_PAYMENT_SUB_ID,
        TENANT_TEMPLO,
      ],
    )) as [RowDataPacket[], unknown];
    expect(Number(clash[0].u)).toBe(0);
    expect(Number(clash[0].r)).toBe(0);
    expect(Number(clash[0].s)).toBe(0);

    const [planRow] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        tenantId: TENANT_TEMPLO,
        name: "Migracion 0260 plan de prueba",
        planTier: "foundation",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 65000,
        priceZero: 0,
        durationDays: 30,
      })
      .$returningId();
    planId = planRow.id;
  });

  afterAll(async () => {
    await resetRows();
    await app.dbPool.query(
      "DELETE FROM subscription_plans WHERE id = ? AND tenant_id = ?",
      [planId, TENANT_TEMPLO],
    );
    await app.close();
  });

  beforeEach(async () => {
    await resetRows();
  });

  /** Borra todo lo que siembra este archivo (ids de prod + el referidor "extrano"). */
  async function resetRows(): Promise<void> {
    const conn = await app.dbPool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");
      await conn.query(
        "DELETE FROM referral_credits WHERE user_id IN (?, ?) AND tenant_id = ?",
        [GUIDO, VALENTINA, TENANT_TEMPLO],
      );
      await conn.query(
        "DELETE FROM referrals WHERE (id = ? OR referred_id IN (?, ?) OR referrer_id IN (?, ?)) AND tenant_id = ?",
        [REFERRAL_ID, GUIDO, VALENTINA, GUIDO, VALENTINA, TENANT_TEMPLO],
      );
      await conn.query(
        "DELETE FROM subscriptions WHERE user_id IN (?, ?) AND tenant_id = ?",
        [GUIDO, VALENTINA, TENANT_TEMPLO],
      );
      await conn.query(
        "DELETE FROM users WHERE id IN (?, ?) AND tenant_id = ?",
        [GUIDO, VALENTINA, TENANT_TEMPLO],
      );
      if (strangerReferrerId !== null) {
        await conn.query("DELETE FROM users WHERE id = ? AND tenant_id = ?", [
          strangerReferrerId,
          TENANT_TEMPLO,
        ]);
        strangerReferrerId = null;
      }
      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      conn.release();
    }
  }

  async function insertUser(
    id: number | null,
    email: string,
    referredBy: number | null,
  ): Promise<number> {
    const [res] = (await app.dbPool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, role, branch_id, level, status, referred_by)
       VALUES (?, ?, ?, ?, 'Mig', 'Test', 'member', ?, 'alfa', 'activo', ?)`,
      [id, TENANT_TEMPLO, email, argonHash, branchId, referredBy],
    )) as [{ insertId: number }, unknown];
    return id ?? res.insertId;
  }

  interface SeedOptions {
    /** Referrer/referred/estado del vinculo 3. Default: el estado INVERTIDO de prod. */
    referrerId?: number;
    referredId?: number;
    status?: "pending" | "qualified" | "revoked";
    qualifiedAt?: Date | null;
    copyVariant?: "A" | "B" | null;
    /** users.referred_by de cada uno. Default: el estado espejado al reves de prod. */
    valentinaReferredBy?: number | null;
    guidoReferredBy?: number | null;
    /** Sembrar la sub 8074 (primer pago de Guido). */
    withFirstPaymentSub?: boolean;
    /** Otro vinculo con referred = Guido, de un referidor ajeno. */
    competingLinkForGuido?: boolean;
    /** users.referred_by de Guido apunta a un usuario ajeno (distinto de Valentina). */
    guidoReferredByStranger?: boolean;
  }

  /** Fecha de alta de la sub 8074 sembrada: ~40 dias atras, truncada al segundo. */
  let firstPaymentCreatedAt = new Date(0);

  async function seedState(opts: SeedOptions = {}): Promise<void> {
    const valReferredBy =
      opts.valentinaReferredBy === undefined ? GUIDO : opts.valentinaReferredBy;
    const guidoReferredBy =
      opts.guidoReferredBy === undefined ? null : opts.guidoReferredBy;

    await insertUser(VALENTINA, `mig-valentina-${VALENTINA}@test.local`, null);
    await insertUser(GUIDO, `mig-guido-${GUIDO}@test.local`, null);
    // referred_by despues de que existan los dos (FK autorreferida).
    await app.dbPool.query(
      "UPDATE users SET referred_by = ? WHERE id = ? AND tenant_id = ?",
      [valReferredBy, VALENTINA, TENANT_TEMPLO],
    );
    await app.dbPool.query(
      "UPDATE users SET referred_by = ? WHERE id = ? AND tenant_id = ?",
      [guidoReferredBy, GUIDO, TENANT_TEMPLO],
    );

    if (opts.competingLinkForGuido || opts.guidoReferredByStranger) {
      strangerReferrerId = await insertUser(
        null,
        `mig-stranger-${Date.now()}@test.local`,
        null,
      );
    }
    if (opts.guidoReferredByStranger) {
      await app.dbPool.query(
        "UPDATE users SET referred_by = ? WHERE id = ? AND tenant_id = ?",
        [strangerReferrerId, GUIDO, TENANT_TEMPLO],
      );
    }

    await app.dbPool.query(
      `INSERT INTO referrals (id, tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at, copy_variant)
       VALUES (?, ?, ?, ?, ?, 'assisted', ?, ?)`,
      [
        REFERRAL_ID,
        TENANT_TEMPLO,
        opts.referrerId ?? GUIDO,
        opts.referredId ?? VALENTINA,
        opts.status ?? "pending",
        opts.qualifiedAt ? toMysqlDateTime(opts.qualifiedAt) : null,
        opts.copyVariant === undefined ? "A" : opts.copyVariant,
      ],
    );

    if (opts.competingLinkForGuido && strangerReferrerId !== null) {
      await app.dbPool.query(
        `INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel)
         VALUES (?, ?, ?, 'pending', 'assisted')`,
        [TENANT_TEMPLO, strangerReferrerId, GUIDO],
      );
    }

    // Suscripciones y los 2 creditos historicos que NO se deben tocar.
    firstPaymentCreatedAt = new Date(
      Math.floor((Date.now() - 40 * DAY_MS) / 1000) * 1000,
    );
    const today = toMysqlDateTime(new Date()).slice(0, 10);
    const future = toMysqlDateTime(new Date(Date.now() + 30 * DAY_MS)).slice(
      0,
      10,
    );
    const subIds: number[] = [];
    if (opts.withFirstPaymentSub !== false) {
      await app.dbPool.query(
        `INSERT INTO subscriptions (id, tenant_id, user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied, created_at)
         VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, 65000, 'ARS', 'regular', ?)`,
        [
          FIRST_PAYMENT_SUB_ID,
          TENANT_TEMPLO,
          GUIDO,
          planId,
          branchId,
          today,
          future,
          toMysqlDateTime(firstPaymentCreatedAt),
        ],
      );
      subIds.push(FIRST_PAYMENT_SUB_ID);
    }
    const [valSub] = (await app.dbPool.query(
      `INSERT INTO subscriptions (tenant_id, user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied)
       VALUES (?, ?, ?, ?, 'active', ?, ?, 58500, 'ARS', 'regular')`,
      [TENANT_TEMPLO, VALENTINA, planId, branchId, today, future],
    )) as [{ insertId: number }, unknown];
    subIds.push(valSub.insertId);

    await app.dbPool.query(
      `INSERT INTO referral_credits (tenant_id, user_id, subscription_id, percent, amount)
       VALUES (?, ?, ?, 10, 6500)`,
      [TENANT_TEMPLO, VALENTINA, subIds[subIds.length - 1]],
    );
    if (subIds.length > 1) {
      await app.dbPool.query(
        `INSERT INTO referral_credits (tenant_id, user_id, subscription_id, percent, amount)
         VALUES (?, ?, ?, 10, 6500)`,
        [TENANT_TEMPLO, GUIDO, subIds[0]],
      );
    }
  }

  /** Mueve el vinculo 3 de gimnasio (FK de tenant apagada solo en esa conexion). */
  async function moveReferralToTenant(tenantId: number): Promise<void> {
    const conn = await app.dbPool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");
      await conn.query(
        "UPDATE /* tenant-safe: el test mueve a proposito el vinculo 3 de gimnasio para probar el guard tenant_id = 1 */ referrals SET tenant_id = ? WHERE id = ?",
        [tenantId, REFERRAL_ID],
      );
      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      conn.release();
    }
  }

  async function applyMigration(statements: string[]): Promise<void> {
    const conn = await app.dbPool.getConnection();
    try {
      for (const stmt of statements) {
        await conn.query(
          `/* tenant-safe: migracion aplicada tal cual la corre el runner, con tenant_id = 1 literal en el SQL */ ${stmt}`,
        );
      }
    } finally {
      conn.release();
    }
  }

  async function snapshot(): Promise<Snapshot> {
    const [refs] = (await app.dbPool.query(
      `SELECT id, referrer_id AS referrerId, referred_id AS referredId, status,
              copy_variant AS copyVariant, CAST(qualified_at AS CHAR) AS qualifiedAt
       FROM referrals WHERE id = ? AND tenant_id = ?`,
      [REFERRAL_ID, TENANT_TEMPLO],
    )) as [ReferralRow[], unknown];
    const [users] = (await app.dbPool.query(
      `SELECT id, referred_by AS referredBy FROM users
       WHERE id IN (?, ?) AND tenant_id = ? ORDER BY id`,
      [VALENTINA, GUIDO, TENANT_TEMPLO],
    )) as [UserRefRow[], unknown];
    const [credits] = (await app.dbPool.query(
      `SELECT id, user_id AS userId, subscription_id AS subscriptionId, percent, amount
       FROM referral_credits WHERE user_id IN (?, ?) AND tenant_id = ? ORDER BY id`,
      [VALENTINA, GUIDO, TENANT_TEMPLO],
    )) as [CreditRow[], unknown];
    return {
      referral: refs[0] ?? null,
      users: users.map((u) => ({ ...u })),
      credits: credits.map((c) => ({ ...c })),
    };
  }

  async function referredByOf(userId: number): Promise<number | null> {
    const [rows] = (await app.dbPool.query(
      "SELECT referred_by AS referredBy FROM users WHERE id = ? AND tenant_id = ?",
      [userId, TENANT_TEMPLO],
    )) as [UserRefRow[], unknown];
    return rows[0].referredBy;
  }

  it("el archivo no tiene `;` en comentarios, filtra por tenant y no toca referral_credits", () => {
    const source = readFileSync(MIG_0260, "utf8");
    const codeLines = source
      .split("\n")
      .filter((l) => !/^\s*--/.test(l))
      .join("\n");
    // tenant_id = 1 en cada UPDATE de datos
    expect(
      (codeLines.match(/tenant_id = 1/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    // referral_credits solo puede aparecer en un comentario explicativo
    expect(codeLines).not.toMatch(/referral_credits/);
    expect(codeLines).not.toMatch(/aura_transactions/);
  });

  it("origen -> destino: invierte el vinculo, lo califica y espeja users.referred_by", async () => {
    await seedState();
    const before = await snapshot();
    expect(before.referral).toMatchObject({
      referrerId: GUIDO,
      referredId: VALENTINA,
      status: "pending",
      copyVariant: "A",
    });
    expect(before.credits).toHaveLength(2);

    await applyMigration(statements0260);

    const after = await snapshot();
    expect(after.referral).toMatchObject({
      id: REFERRAL_ID,
      referrerId: VALENTINA,
      referredId: GUIDO,
      status: "qualified",
      copyVariant: "B",
    });
    expect(after.referral?.qualifiedAt).not.toBeNull();
    expect(await referredByOf(VALENTINA)).toBeNull();
    expect(await referredByOf(GUIDO)).toBe(VALENTINA);
    // referral_credits idénticos (D-28 / SC-6)
    expect(after.credits).toEqual(before.credits);
  });

  it("qualified_at toma la fecha de alta de la sub 8074 (primer pago de Guido)", async () => {
    await seedState();
    await applyMigration(statements0260);

    const [rows] = (await app.dbPool.query(
      `SELECT CAST(r.qualified_at AS CHAR) AS qa, CAST(s.created_at AS CHAR) AS sa
       FROM referrals r
       JOIN subscriptions s ON s.id = ? AND s.tenant_id = ?
       WHERE r.id = ? AND r.tenant_id = ?`,
      [FIRST_PAYMENT_SUB_ID, TENANT_TEMPLO, REFERRAL_ID, TENANT_TEMPLO],
    )) as [RowDataPacket[], unknown];
    expect(rows[0].qa).toBe(rows[0].sa);
    // y la fecha es relativa (~40 dias atras), no NOW()
    const qa = new Date(String(rows[0].qa).replace(" ", "T") + "Z").getTime();
    expect(Date.now() - qa).toBeGreaterThan(30 * DAY_MS);
  });

  it("sin la sub 8074 qualified_at cae a NOW()", async () => {
    await seedState({ withFirstPaymentSub: false });
    const t0 = Date.now();
    await applyMigration(statements0260);

    const [rows] = (await app.dbPool.query(
      `SELECT UNIX_TIMESTAMP(qualified_at) AS ts FROM referrals WHERE id = ? AND tenant_id = ?`,
      [REFERRAL_ID, TENANT_TEMPLO],
    )) as [RowDataPacket[], unknown];
    expect(Math.abs(Number(rows[0].ts) * 1000 - t0)).toBeLessThan(60_000);
  });

  it("un qualified_at ya cargado se conserva (COALESCE)", async () => {
    const original = new Date(
      Math.floor((Date.now() - 10 * DAY_MS) / 1000) * 1000,
    );
    await seedState({ status: "qualified", qualifiedAt: original });
    const before = await snapshot();

    await applyMigration(statements0260);

    const after = await snapshot();
    expect(after.referral?.qualifiedAt).toBe(before.referral?.qualifiedAt);
    expect(after.referral).toMatchObject({
      referrerId: VALENTINA,
      referredId: GUIDO,
      status: "qualified",
    });
  });

  it("idempotente: reaplicar sobre el estado ya corregido no cambia nada", async () => {
    await seedState();
    await applyMigration(statements0260);
    const once = await snapshot();

    await applyMigration(statements0260);
    const twice = await snapshot();

    expect(twice).toEqual(once);
  });

  it("no-op total si el vinculo ya fue corregido a mano (estado distinto al esperado)", async () => {
    await seedState({
      referrerId: VALENTINA,
      referredId: GUIDO,
      status: "pending",
      copyVariant: "A",
      valentinaReferredBy: null,
      guidoReferredBy: VALENTINA,
    });
    const before = await snapshot();

    await applyMigration(statements0260);

    // Ni el vinculo (sigue pending, variante A) ni users cambian.
    expect(await snapshot()).toEqual(before);
  });

  it("no-op total si ya existe otro vinculo con referred = Guido", async () => {
    await seedState({ competingLinkForGuido: true });
    const before = await snapshot();

    await applyMigration(statements0260);

    const after = await snapshot();
    expect(after).toEqual(before);
    expect(after.referral).toMatchObject({
      referrerId: GUIDO,
      referredId: VALENTINA,
    });
    // users.referred_by queda como estaba (no se espeja un vinculo que no cambio)
    expect(await referredByOf(VALENTINA)).toBe(GUIDO);
    expect(await referredByOf(GUIDO)).toBeNull();
  });

  it("no pisa users.referred_by si difiere del esperado (el vinculo si se corrige)", async () => {
    // Guido ya tiene un referred_by (un usuario ajeno): el UPDATE de Guido es no-op.
    await seedState({ guidoReferredByStranger: true });
    await applyMigration(statements0260);

    const after = await snapshot();
    expect(after.referral).toMatchObject({
      referrerId: VALENTINA,
      referredId: GUIDO,
    });
    expect(await referredByOf(GUIDO)).toBe(strangerReferrerId);
    expect(await referredByOf(VALENTINA)).toBeNull();
  });

  it("no toca filas de otro gimnasio con los mismos ids", async () => {
    await seedState();
    // El vinculo 3 pertenece a otro tenant: el guard tenant_id = 1 lo deja intacto.
    await moveReferralToTenant(OTHER_TENANT_ID);
    try {
      await applyMigration(statements0260);

      const conn = await app.dbPool.getConnection();
      try {
        const [rows] = (await conn.query(
          "SELECT referrer_id AS referrerId, status FROM referrals WHERE id = ? AND tenant_id = ?",
          [REFERRAL_ID, OTHER_TENANT_ID],
        )) as [RowDataPacket[], unknown];
        expect(rows[0]).toMatchObject({ referrerId: GUIDO, status: "pending" });
      } finally {
        conn.release();
      }
      expect(await referredByOf(VALENTINA)).toBe(GUIDO);
    } finally {
      await moveReferralToTenant(TENANT_TEMPLO);
    }
  });
});
