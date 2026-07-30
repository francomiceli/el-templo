/**
 * backfill-historical-payments.ts -- ONE-SHOT (post-v4.8 deploy)
 *
 * Reinjects 21 historical payments from the dropped `payments` table into
 * the v4.8 financial model (financial_transactions + transaction_links),
 * plus 1 balance row for Purinán (sub 6116 — pre-existing ADEUDA).
 *
 * Source: backup eltemplo_20260428_060001.sql.gz, post-cleanup of test
 * data, auto-charges, sub recreations, and duplicate users (60 raw rows
 * → 22 real, of which 21 are full payments and 1 is the open debt).
 *
 * Idempotency: NOT idempotent. The pre-flight aborts if any of the 21
 * (memberId, subscriptionId, transactionDate, amount) tuples already
 * exist in financial_transactions, OR if a balance row already exists
 * for sub 6116.
 *
 * `--tenant=<id>` es OBLIGATORIO (fase 169 D-06, adoptado acá por la 172 D-02).
 * Este script escribe plata en batch sin request y sin JWT, así que el gimnasio
 * sólo puede venir del flag: sin él el proceso corta con exit code **2** antes
 * de abrir la transacción y sin escribir una sola fila. El id se verifica contra
 * la tabla `tenants` de ESTA base, o sea que un typo tampoco escribe en el
 * gimnasio de al lado.
 *
 * Usage (local):
 *   pnpm tsx src/scripts/backfill-historical-payments.ts --tenant=<id>            # dry run
 *   pnpm tsx src/scripts/backfill-historical-payments.ts --tenant=<id> --apply    # real
 *
 * Usage (server, post-deploy):
 *   NODE_ENV=production node dist/scripts/backfill-historical-payments.js --tenant=<id>
 *   NODE_ENV=production node dist/scripts/backfill-historical-payments.js --tenant=<id> --apply
 *
 * Exit codes: 0 OK · 1 fallo de datos o inesperado · 2 error de USO (falta
 * `--tenant`, id inválido o gimnasio inexistente).
 *
 * Works against any env via .env DATABASE_URL. Single DB transaction —
 * partial failure rolls back everything.
 *
 * EXECUTED IN PROD: <FILL DATE WHEN APPLIED>
 */

import "dotenv/config";
import { createSingleConnection } from "../db/index";
import {
  financialTransactions,
  transactionLinks,
  balances,
  subscriptions,
  users,
  branches,
} from "../db/schema";
import {
  failTenantArg,
  queryFnFromConnection,
  requireTenant,
} from "../db/scripts/require-tenant";
import { tenantValues, tenantWhere } from "../modules/shared/tenant";
import { and, eq, inArray } from "drizzle-orm";

type Currency = "ARS" | "EUR";
type PaymentMethod = "cash" | "transfer" | "card";

interface HistoricalPayment {
  payId: number; // for traceability/logging only
  memberId: number;
  subscriptionId: number;
  branchId: number;
  amount: number;
  currency: Currency;
  paymentMethod: PaymentMethod;
  transactionDate: string; // YYYY-MM-DD
  recordedBy: number;
  notes: string | null;
}

// ── Source data — 21 real payments (Chapa + BCN, 2026-04-20 → 2026-05-04) ──

const PAYMENTS: HistoricalPayment[] = [
  {
    payId: 31,
    memberId: 5821,
    subscriptionId: 6086,
    branchId: 14,
    amount: 75,
    currency: "EUR",
    paymentMethod: "transfer",
    transactionDate: "2026-04-23",
    recordedBy: 5721,
    notes: null,
  },
  {
    payId: 32,
    memberId: 5822,
    subscriptionId: 6087,
    branchId: 14,
    amount: 75,
    currency: "EUR",
    paymentMethod: "transfer",
    transactionDate: "2026-04-23",
    recordedBy: 5721,
    notes:
      "Había pagado preventa en febrero. Se le activa hoy que fue su primera clase.",
  },
  {
    payId: 34,
    memberId: 5825,
    subscriptionId: 6089,
    branchId: 15,
    amount: 65000,
    currency: "ARS",
    paymentMethod: "cash",
    transactionDate: "2026-04-23",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 35,
    memberId: 5826,
    subscriptionId: 6090,
    branchId: 14,
    amount: 75,
    currency: "EUR",
    paymentMethod: "transfer",
    transactionDate: "2026-05-04",
    recordedBy: 5721,
    notes: null,
  },
  {
    payId: 36,
    memberId: 5827,
    subscriptionId: 6091,
    branchId: 15,
    amount: 65000,
    currency: "ARS",
    paymentMethod: "transfer",
    transactionDate: "2026-04-23",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 39,
    memberId: 5832,
    subscriptionId: 6094,
    branchId: 15,
    amount: 65000,
    currency: "ARS",
    paymentMethod: "transfer",
    transactionDate: "2026-04-20",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 40,
    memberId: 5831,
    subscriptionId: 6095,
    branchId: 15,
    amount: 65000,
    currency: "ARS",
    paymentMethod: "transfer",
    transactionDate: "2026-04-20",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 41,
    memberId: 5803,
    subscriptionId: 6096,
    branchId: 15,
    amount: 65000,
    currency: "ARS",
    paymentMethod: "transfer",
    transactionDate: "2026-04-22",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 43,
    memberId: 5833,
    subscriptionId: 6098,
    branchId: 15,
    amount: 65000,
    currency: "ARS",
    paymentMethod: "transfer",
    transactionDate: "2026-04-27",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 44,
    memberId: 5834,
    subscriptionId: 6099,
    branchId: 15,
    amount: 65000,
    currency: "ARS",
    paymentMethod: "cash",
    transactionDate: "2026-04-27",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 45,
    memberId: 5835,
    subscriptionId: 6100,
    branchId: 15,
    amount: 65000,
    currency: "ARS",
    paymentMethod: "cash",
    transactionDate: "2026-04-27",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 47,
    memberId: 5836,
    subscriptionId: 6102,
    branchId: 15,
    amount: 65000,
    currency: "ARS",
    paymentMethod: "transfer",
    transactionDate: "2026-04-28",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 48,
    memberId: 5839,
    subscriptionId: 6103,
    branchId: 15,
    amount: 65000,
    currency: "ARS",
    paymentMethod: "cash",
    transactionDate: "2026-04-28",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 49,
    memberId: 5841,
    subscriptionId: 6104,
    branchId: 14,
    amount: 75,
    currency: "EUR",
    paymentMethod: "transfer",
    transactionDate: "2026-04-24",
    recordedBy: 5721,
    notes: null,
  },
  {
    payId: 50,
    memberId: 5842,
    subscriptionId: 6105,
    branchId: 15,
    amount: 80000,
    currency: "ARS",
    paymentMethod: "cash",
    transactionDate: "2026-04-22",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 51,
    memberId: 5843,
    subscriptionId: 6106,
    branchId: 15,
    amount: 65000,
    currency: "ARS",
    paymentMethod: "transfer",
    transactionDate: "2026-04-21",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 52,
    memberId: 5851,
    subscriptionId: 6108,
    branchId: 14,
    amount: 75,
    currency: "EUR",
    paymentMethod: "card",
    transactionDate: "2026-04-27",
    recordedBy: 5721,
    notes: null,
  },
  {
    payId: 53,
    memberId: 5844,
    subscriptionId: 6109,
    branchId: 15,
    amount: 80000,
    currency: "ARS",
    paymentMethod: "transfer",
    transactionDate: "2026-04-27",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 54,
    memberId: 5852,
    subscriptionId: 6110,
    branchId: 15,
    amount: 65000,
    currency: "ARS",
    paymentMethod: "cash",
    transactionDate: "2026-04-28",
    recordedBy: 5707,
    notes: null,
  },
  {
    payId: 55,
    memberId: 5855,
    subscriptionId: 6111,
    branchId: 14,
    amount: 75,
    currency: "EUR",
    paymentMethod: "cash",
    transactionDate: "2026-04-27",
    recordedBy: 5721,
    notes: null,
  },
  {
    payId: 56,
    memberId: 5856,
    subscriptionId: 6112,
    branchId: 14,
    amount: 75,
    currency: "EUR",
    paymentMethod: "cash",
    transactionDate: "2026-04-27",
    recordedBy: 5721,
    notes: null,
  },
];

// Purinán: pay_id 60, sub 6116, ADEUDA (no payment, just balance seed)
const PURINAN_MEMBER_ID = 5860;
const PURINAN_SUBSCRIPTION_ID = 6116;

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const mode = apply ? "APPLY" : "DRY-RUN";

  console.log(`\n=== Backfill Historical Payments (v4.8) ===`);
  console.log(`Mode: ${mode}`);
  console.log(`Database: ${process.env.DB_NAME || "eltemplo"}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Payments to insert: ${PAYMENTS.length}`);
  console.log(`Purinán balance seed: sub ${PURINAN_SUBSCRIPTION_ID}\n`);

  const { db, connection } = await createSingleConnection();

  try {
    // ── Gimnasio: ANTES de cualquier query (fase 169 D-06) ─────────────────
    // Va primero a propósito: si falta `--tenant`, si el id no es un entero
    // positivo o si no existe esa fila en `tenants`, esto lanza un
    // `TenantArgError` y el proceso muere con exit 2 sin haber leído ni escrito
    // una sola fila de negocio. El `finally` de abajo igual cierra la conexión.
    const ctx = await requireTenant(queryFnFromConnection(connection));
    console.log(`Tenant: ${ctx.tenantId}\n`);

    // ── Pre-flight: existence checks ───────────────────────────────────────
    const subIds = [
      ...PAYMENTS.map((p) => p.subscriptionId),
      PURINAN_SUBSCRIPTION_ID,
    ];
    const memberIds = [
      ...new Set([...PAYMENTS.map((p) => p.memberId), PURINAN_MEMBER_ID]),
    ];
    const recorderIds = [...new Set(PAYMENTS.map((p) => p.recordedBy))];
    const branchIds = [...new Set(PAYMENTS.map((p) => p.branchId))];

    const existingSubs = await db
      .select({
        id: subscriptions.id,
        pricePaid: subscriptions.pricePaid,
        currency: subscriptions.currency,
      })
      .from(subscriptions)
      .where(inArray(subscriptions.id, subIds));
    const foundSubIds = new Set(existingSubs.map((s) => s.id));
    const missingSubs = subIds.filter((id) => !foundSubIds.has(id));
    if (missingSubs.length > 0) {
      throw new Error(`Subscriptions missing in DB: ${missingSubs.join(", ")}`);
    }

    const existingMembers = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [...memberIds, ...recorderIds]));
    const foundMemberIds = new Set(existingMembers.map((u) => u.id));
    const missingMembers = [...memberIds, ...recorderIds].filter(
      (id) => !foundMemberIds.has(id),
    );
    if (missingMembers.length > 0) {
      throw new Error(
        `Users (members or recorders) missing in DB: ${missingMembers.join(", ")}`,
      );
    }

    const existingBranches = await db
      .select({ id: branches.id })
      .from(branches)
      .where(inArray(branches.id, branchIds));
    const foundBranchIds = new Set(existingBranches.map((b) => b.id));
    const missingBranches = branchIds.filter((id) => !foundBranchIds.has(id));
    if (missingBranches.length > 0) {
      throw new Error(`Branches missing in DB: ${missingBranches.join(", ")}`);
    }

    console.log("✓ Pre-flight: subs, members, recorders, branches all exist.");

    // ── Pre-flight: idempotency — abort if any backfill row already present ─
    for (const p of PAYMENTS) {
      const existing = await db
        .select({ id: financialTransactions.id })
        .from(financialTransactions)
        .where(
          and(
            tenantWhere(financialTransactions, ctx),
            eq(financialTransactions.memberId, p.memberId),
            eq(financialTransactions.amount, p.amount),
            eq(financialTransactions.transactionDate, p.transactionDate),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new Error(
          `Backfill collision: financial_transaction already exists for member ${p.memberId}, amount ${p.amount}, date ${p.transactionDate} (id=${existing[0].id}). Aborting to prevent duplicates.`,
        );
      }
    }

    const purinanBalance = await db
      .select({ id: balances.id })
      .from(balances)
      .where(
        and(
          tenantWhere(balances, ctx),
          eq(balances.memberId, PURINAN_MEMBER_ID),
          eq(balances.targetKind, "subscription"),
          eq(balances.targetId, PURINAN_SUBSCRIPTION_ID),
        ),
      )
      .limit(1);
    if (purinanBalance.length > 0) {
      throw new Error(
        `Backfill collision: balance row already exists for Purinán sub ${PURINAN_SUBSCRIPTION_ID}. Aborting.`,
      );
    }

    console.log("✓ Pre-flight: no collisions detected.");

    // ── Resolve Purinán's chargeBase (= sub.pricePaid) ─────────────────────
    const purinanSub = existingSubs.find(
      (s) => s.id === PURINAN_SUBSCRIPTION_ID,
    );
    if (!purinanSub) {
      throw new Error(
        `Purinán subscription ${PURINAN_SUBSCRIPTION_ID} not found.`,
      );
    }
    if (purinanSub.pricePaid <= 0) {
      throw new Error(
        `Purinán sub ${PURINAN_SUBSCRIPTION_ID} has pricePaid=${purinanSub.pricePaid} — expected > 0.`,
      );
    }
    console.log(
      `✓ Purinán sub ${PURINAN_SUBSCRIPTION_ID}: pricePaid=${purinanSub.pricePaid} ${purinanSub.currency}`,
    );

    // ── DRY-RUN: print plan and exit ───────────────────────────────────────
    if (!apply) {
      console.log("\n--- DRY-RUN PLAN ---");
      console.log(`Would insert ${PAYMENTS.length} financial_transactions:`);
      for (const p of PAYMENTS) {
        console.log(
          `  pay_id=${p.payId} → member ${p.memberId}, sub ${p.subscriptionId}, ${p.amount} ${p.currency} ${p.paymentMethod} on ${p.transactionDate}, branch ${p.branchId}, by ${p.recordedBy}${p.notes ? `, notes="${p.notes}"` : ""}`,
        );
      }
      console.log(
        `Would insert ${PAYMENTS.length} transaction_links (one per tx → subscription).`,
      );
      console.log(
        `Would insert 1 balance row: member ${PURINAN_MEMBER_ID}, sub ${PURINAN_SUBSCRIPTION_ID}, amount ${purinanSub.pricePaid} ${purinanSub.currency}.`,
      );
      console.log(
        "\nDRY-RUN COMPLETE. No DB writes performed. Re-run with --apply to execute.\n",
      );
      return;
    }

    // ── APPLY: single transaction ──────────────────────────────────────────
    let insertedTx = 0;
    let insertedLinks = 0;
    let insertedBalance = 0;

    await db.transaction(async (tx) => {
      for (const p of PAYMENTS) {
        // `tenantValues` estampa el gimnasio DESPUÉS del spread, así que pisa
        // cualquier `tenantId` que viniera adentro y no depende del DEFAULT 1
        // de la columna. Sin `as const`: `tenantValues` conserva los tipos
        // literales de `kind`/`direction`/`targetKind` (hallazgo 169-07).
        const [result] = await tx.insert(financialTransactions).values(
          tenantValues(ctx, {
            memberId: p.memberId,
            kind: "plan_charge",
            direction: "inflow",
            amount: p.amount,
            currency: p.currency,
            paymentMethod: p.paymentMethod,
            transactionDate: p.transactionDate,
            effectiveDate: p.transactionDate,
            branchId: p.branchId,
            recordedBy: p.recordedBy,
            notes: p.notes,
          }),
        );
        const newTxId = result.insertId;
        insertedTx++;

        await tx.insert(transactionLinks).values(
          tenantValues(ctx, {
            transactionId: newTxId,
            targetKind: "subscription",
            targetId: p.subscriptionId,
            allocatedAmount: p.amount,
          }),
        );
        insertedLinks++;
      }

      await tx.insert(balances).values(
        tenantValues(ctx, {
          memberId: PURINAN_MEMBER_ID,
          targetKind: "subscription",
          targetId: PURINAN_SUBSCRIPTION_ID,
          currency: purinanSub.currency,
          amount: purinanSub.pricePaid,
        }),
      );
      insertedBalance++;
    });

    console.log(`\n✓ APPLY COMPLETE`);
    console.log(`  financial_transactions inserted: ${insertedTx}`);
    console.log(`  transaction_links inserted: ${insertedLinks}`);
    console.log(
      `  balances inserted: ${insertedBalance} (Purinán sub ${PURINAN_SUBSCRIPTION_ID})`,
    );
    console.log("");
  } finally {
    await connection.end();
  }
}

// `failTenantArg` sale con **2** ante un error de USO (falta el flag, id
// inválido, gimnasio inexistente) y con **1** para cualquier otro fallo. La
// distinción importa: un 1 significaría "corrió y encontró un problema en los
// datos", que es exactamente lo que NO pasó cuando el operador se olvidó del
// `--tenant`.
main().catch((err: unknown) =>
  failTenantArg(err, "backfill-historical-payments"),
);
