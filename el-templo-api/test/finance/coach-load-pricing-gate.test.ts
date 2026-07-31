/**
 * Phase 154 (ALUM-03 / D-04) — server-side card-surcharge price gate.
 *
 * Blinda el punto único de verdad del precio (`subscriptions/service.ts`
 * `resolvePriceType` → `getBasePrice`): cuando la regla
 * `pricing.card_surcharge_enabled` está OFF, un cobro por tarjeta debe cobrar
 * `priceRegular` (no `priceCreditCard`) y persistir `priceTypeApplied = 'regular'`
 * en la subscription — nunca queda grabado `credit_card` con monto regular.
 *
 * Ejercita el flujo del coach PoS (fase 148, `coach-load/alta` mapea
 * `paymentMethod:'card'` → `credit_card` y llama `assignPlan`), que es el MISMO
 * code path que el `assignPlan` del admin (AssignPlanDialog manda
 * `priceTypeApplied` directo). Gatear en `assignPlan` cubre ambos.
 *
 *   (a) regla ON  + card → charge.amount = priceCreditCard (comportamiento actual).
 *   (b) regla OFF + card → charge.amount = priceRegular (recargo NO aplicado).
 *   (c) regla OFF + card → subscription.priceTypeApplied persistido = 'regular'.
 *
 * MEMORY: la suite NO se corre local — corre en CI al pushear a staging.
 * Correr un caso: `npx vitest run test/finance/coach-load-pricing-gate.test.ts -t "<tag>"`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  ensureEfectivoCaja,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { PRICING_SETTINGS_KEYS } from "../../src/modules/settings/keys";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 172 (172-14): gimnasio de las queries DIRECTAS de este archivo. Sale del
 * fixture, nunca de un `1` a mano. Con `finance` en `TENANT_STRICT_MODULES` el
 * sentinel hace throw sobre cualquier acceso a `financial_transactions` /
 * `cash_registers` / `transaction_links` / `balances` sin gimnasio.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const COACH_LOAD_URL = "/api/admin/finance/coach-load";
const PRICE_REGULAR = 100000;
const PRICE_CREDIT_CARD = 120000;

let app: FastifyInstance;
let coachToken: string;
let branchId: number;
let planId: number;
let bancoArsId: number;
let dniSeq = 0;

/** Globally-unique DNI per call so alta-created members never collide. */
function uniqueDni(): string {
  dniSeq = (dniSeq + 1) % 100000;
  return `PG${Date.now().toString(36)}${String(dniSeq).padStart(5, "0")}`;
}

interface AltaBody {
  firstName?: string;
  lastName?: string;
  dni?: string;
  branchId: number;
  planId: number;
  paymentMethod: "cash" | "transfer" | "card";
  bankAccountId?: number;
  idempotencyKey: string;
}

async function postAlta(body: AltaBody, token = coachToken) {
  const res = await app.inject({
    method: "POST",
    url: `${COACH_LOAD_URL}/alta`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

/** Seed the card-surcharge rule (ON/OFF) — cleaned between tests, so each case
 *  must set the value it needs (helpers.cleanAllTestData wipes systemSettings). */
async function setCardSurchargeRule(enabled: boolean): Promise<void> {
  const value = enabled ? "on" : "off";
  await app.db
    .insert(schema.systemSettings)
    .values({
      settingKey: PRICING_SETTINGS_KEYS.cardSurcharge,
      settingValue: value,
    })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

/** Read the persisted charge amount by idempotency key. */
async function readChargeAmountByKey(key: string): Promise<number | null> {
  const [row] = await app.db
    .select({ amount: schema.financialTransactions.amount })
    .from(schema.financialTransactions)
    .where(
      and(
        eq(schema.financialTransactions.idempotencyKey, key),
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
      ),
    )
    .limit(1);
  return row ? row.amount : null;
}

/** Read the persisted priceTypeApplied of a subscription. */
async function readSubPriceType(subId: number): Promise<string | null> {
  const [row] = await app.db
    .select({ priceTypeApplied: schema.subscriptions.priceTypeApplied })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, subId))
    .limit(1);
  return row?.priceTypeApplied ?? null;
}

beforeAll(async () => {
  app = await createTestApp();

  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  branchId = admin.branchId ?? 1;
  await ensureEfectivoCaja(app, branchId, "ARS");

  // Caja banco ARS: fase 151 (validateBankAccountForCharge) exige bankAccountId
  // explícito para cobros por tarjeta/transferencia.
  const existingBanco = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        eq(schema.cashRegisters.type, "banco"),
        eq(schema.cashRegisters.currency, "ARS"),
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
      ),
    )
    .limit(1);
  if (existingBanco.length > 0) {
    bancoArsId = existingBanco[0].id;
  } else {
    const [banco] = await app.db
      .insert(schema.cashRegisters)
      .values(
        tenantValues(TEMPLO_CTX, {
          name: "Banco ARS",
          type: "banco" as const,
          branchId: null,
          currency: "ARS",
          cutoffDate: "2020-01-01",
        }),
      )
      .$returningId();
    bancoArsId = banco.id;
  }

  await createStaffUser(app, {
    email: "coach-pricing@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Pricing",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(
    app,
    "coach-pricing@test.local",
    "pass123456",
  );

  // Plan flexible con recargo por tarjeta (priceCreditCard > priceRegular).
  const [flexRes] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Pricing Gate Plan",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: PRICE_REGULAR,
      priceZero: 0,
      priceCreditCard: PRICE_CREDIT_CARD,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
    })
    .$returningId();
  planId = flexRes.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  // Clean finance + subscription state on a SINGLE pooled connection with FK
  // checks disabled (same pattern as coach-load.test.ts): FOREIGN_KEY_CHECKS
  // is a per-connection session variable, and program_enrollments left behind
  // by another test file sharing this per-worker DB (isolate=false) otherwise
  // fail `DELETE FROM subscriptions` with ER_ROW_IS_REFERENCED_2.
  // 172-14: los 3 DELETE sobre tablas strict se ACOTAN al gimnasio (regla del
  // 172-13: global a proposito -> exencion; acotable -> filtro). Este archivo no
  // siembra en otro gimnasio, asi que el borrado global era comodidad. La
  // conexion cruda del pool es una de las puertas que el sentinel intercepta,
  // asi que sin filtro haria throw.
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query("DELETE FROM `transaction_links` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query(
      "DELETE FROM `financial_transactions` WHERE tenant_id = ?",
      [TENANT_TEMPLO],
    );
    await conn.query("DELETE FROM `balances` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query("DELETE FROM `bookings`");
    await conn.query("DELETE FROM `subscription_schedules`");
    await conn.query("DELETE FROM `program_enrollments`");
    await conn.query("DELETE FROM `subscriptions`");
    await conn.query("DELETE FROM `system_settings`");
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
});

// ─── (a) regla ON → tarjeta aplica el recargo ────────────────────────────────
describe("card-surcharge gate — regla ON", () => {
  it("ON + card → cobra priceCreditCard (comportamiento actual intacto)", async () => {
    await setCardSurchargeRule(true);
    const key = `pg-on-${Date.now()}`;
    const { statusCode, body } = await postAlta({
      firstName: "On",
      lastName: "Card",
      dni: uniqueDni(),
      branchId,
      planId,
      paymentMethod: "card",
      bankAccountId: bancoArsId,
      idempotencyKey: key,
    });

    expect(statusCode).toBe(201);
    expect(await readChargeAmountByKey(key)).toBe(PRICE_CREDIT_CARD);
    // Con la regla ON el priceType persiste como 'credit_card'.
    expect(await readSubPriceType(body.subscription.id)).toBe("credit_card");
  });
});

// ─── (b) regla OFF → tarjeta NO aplica el recargo ────────────────────────────
describe("card-surcharge gate — regla OFF", () => {
  it("OFF + card → cobra priceRegular (recargo NO aplicado)", async () => {
    await setCardSurchargeRule(false);
    const key = `pg-off-amount-${Date.now()}`;
    const { statusCode } = await postAlta({
      firstName: "Off",
      lastName: "Amount",
      dni: uniqueDni(),
      branchId,
      planId,
      paymentMethod: "card",
      bankAccountId: bancoArsId,
      idempotencyKey: key,
    });

    expect(statusCode).toBe(201);
    expect(await readChargeAmountByKey(key)).toBe(PRICE_REGULAR);
  });

  // (c) el priceType persistido queda normalizado (no 'credit_card' con monto regular).
  it("OFF + card → subscription.priceTypeApplied persistido = 'regular'", async () => {
    await setCardSurchargeRule(false);
    const key = `pg-off-type-${Date.now()}`;
    const { statusCode, body } = await postAlta({
      firstName: "Off",
      lastName: "Type",
      dni: uniqueDni(),
      branchId,
      planId,
      paymentMethod: "card",
      bankAccountId: bancoArsId,
      idempotencyKey: key,
    });

    expect(statusCode).toBe(201);
    expect(await readSubPriceType(body.subscription.id)).toBe("regular");
  });

  // Default: sin la key sembrada (ausente) también es OFF → no aplica recargo.
  it("regla ausente (default OFF) + card → cobra priceRegular", async () => {
    // No sembramos la key: getCardSurchargeEnabled cae al default false.
    const key = `pg-default-${Date.now()}`;
    const { statusCode } = await postAlta({
      firstName: "Default",
      lastName: "Off",
      dni: uniqueDni(),
      branchId,
      planId,
      paymentMethod: "card",
      bankAccountId: bancoArsId,
      idempotencyKey: key,
    });

    expect(statusCode).toBe(201);
    expect(await readChargeAmountByKey(key)).toBe(PRICE_REGULAR);
  });
});
