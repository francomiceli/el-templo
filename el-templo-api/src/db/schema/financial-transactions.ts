// Module: finance — phase 105
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  date,
  mysqlEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { branches } from "./branches";
import { cashRegisters } from "./cash-registers";
import { costCenters } from "./cost-centers";
import { transactionLinks } from "./transaction-links";

// D-05: enums declared inline on the column. TS literals are inferred from
// $inferSelect downstream (see modules/finance/types.ts). Single source of truth.
export const financialTransactions = mysqlTable(
  "financial_transactions",
  {
    id: int("id").primaryKey().autoincrement(),
    // Phase 139 (D-06): NULLABLE — egresos/movimientos no tienen socio (modelo
    // honesto, sin usuario sentinel "Gimnasio" que ensucie listas/conteos). Los
    // reportes member-keyed los excluyen por INNER JOIN users / kind / direction.
    memberId: int("member_id").references(() => users.id),
    // Phase 139: APPEND 'cash_transfer' (movimiento inter-caja) + 'expense'
    // (egreso) al FINAL — NUNCA reordenar los 5 valores existentes (enum drift =
    // CI "Unknown column" que tsc no detecta, reference_drizzle_enum_column_name).
    // Order MUST match migration 0155 byte-for-byte.
    kind: mysqlEnum("kind", [
      "plan_charge",
      "debt_settlement",
      "refund",
      "adjustment",
      "advance_payment",
      "cash_transfer",
      "expense",
    ]).notNull(),
    direction: mysqlEnum("direction", ["inflow", "outflow"]).notNull(),
    amount: int("amount").notNull(),
    currency: varchar("currency", { length: 3 }).default("ARS").notNull(),
    paymentMethod: mysqlEnum("payment_method", [
      "cash",
      "transfer",
      "card",
      "aura_credit",
      "internal",
    ]).notNull(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    // Phase 139 (extends D-06 to branch_id): NULLABLE — movimientos/egresos a
    // cajas branch-less (central efectivo, banco ARS/EUR) no tienen una sola
    // sucursal, el modelo honesto guarda NULL. Las lecturas branch-keyed
    // (revenueByBranch/getSummary) INNER JOIN branches y descartan las filas NULL.
    branchId: int("branch_id").references(() => branches.id),
    // Phase 138: caja a la que fue la plata (D-04). NULLABLE — NULL para
    // aura_credit/internal (no es plata firme de caja) e históricos sin
    // backfillear. branchId (dónde se cobró) NO mapea 1:1 con cash_register_id
    // (adónde fue la plata): p.ej. una transferencia cobrada en Jujuy cae en
    // la caja banco de la moneda, no en la caja de Jujuy.
    cashRegisterId: int("cash_register_id").references(() => cashRegisters.id),
    // Phase 147 (EGR-02): centro de costo del egreso. NULLABLE — solo las filas
    // kind='expense' lo setean (obligatorio a nivel app, validado en
    // movement-service.registerExpense); las históricas y los no-egresos quedan
    // NULL. Mismo patrón FK nullable que cash_register_id.
    costCenterId: int("cost_center_id").references(() => costCenters.id),
    recordedBy: int("recorded_by")
      .references(() => users.id)
      .notNull(),
    voidedAt: timestamp("voided_at"),
    voidedBy: int("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
    // Phase 137: validation state machine, ORTHOGONAL to the soft-void axis
    // above. ANULADO stays as voidedAt IS NOT NULL; this enum is a separate
    // axis. Order MUST match migration 0153 byte-for-byte (enum drift = CI
    // "Unknown column" that tsc cannot detect). DEFAULT 'validado' backfills
    // all existing rows so the 6 v5.0 metrics keep identical numbers (VAL-05).
    validationStatus: mysqlEnum("validation_status", [
      "pendiente",
      "observado",
      "corregido",
      "validado",
    ])
      .default("validado")
      .notNull(),
    notes: text("notes"),
    // Phase 145 (COBRO-01): structured reason for a cobro suelto. NULLABLE —
    // only kind='advance_payment' rows set it ('sin_plan' = socio sin plan
    // activo, 'otro' = otro motivo); every other row stays NULL. NOT folded
    // into the free-text `notes`. 1st arg = column name, MUST match migration
    // 0159 byte-for-byte (enum drift = CI "Unknown column" tsc cannot detect,
    // reference_drizzle_enum_column_name). No new index.
    miscReason: mysqlEnum("misc_reason", ["sin_plan", "otro"]),
    // Phase 140 (CARGA-02 / D-09): client-generated opaque ticket key for
    // idempotent coach loads. NULLABLE — every historical/admin row stays NULL;
    // MySQL allows unlimited NULLs under a UNIQUE index, so the uq index below
    // dedups only non-null keys (a repeated Confirm/double-tap → same key →
    // duplicate-key error caught endpoint-side in Wave 2). Not a secret.
    idempotencyKey: varchar("idempotency_key", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_financial_tx_member_id").on(table.memberId),
    index("idx_financial_tx_transaction_date").on(table.transactionDate),
    index("idx_financial_tx_branch_date").on(
      table.branchId,
      table.transactionDate,
    ),
    index("idx_financial_tx_kind_voided").on(table.kind, table.voidedAt),
    // Phase 137: firm-money read path (validation_status='validado' AND voided_at IS NULL).
    index("idx_financial_tx_validation_voided").on(
      table.validationStatus,
      table.voidedAt,
    ),
    // Phase 138: backs the per-caja SUM with the cutoff range in getBalance
    // (cash_register_id = X AND transaction_date >= cutoff_date).
    index("idx_financial_tx_cash_register").on(
      table.cashRegisterId,
      table.transactionDate,
    ),
    // Phase 140 (CARGA-02 / D-09): nullable UNIQUE dedup key for coach loads.
    uniqueIndex("uq_financial_tx_idempotency_key").on(table.idempotencyKey),
  ],
);

export const financialTransactionsRelations = relations(
  financialTransactions,
  ({ one, many }) => ({
    member: one(users, {
      fields: [financialTransactions.memberId],
      references: [users.id],
      relationName: "financialTxMember",
    }),
    recorder: one(users, {
      fields: [financialTransactions.recordedBy],
      references: [users.id],
      relationName: "financialTxRecorder",
    }),
    voider: one(users, {
      fields: [financialTransactions.voidedBy],
      references: [users.id],
      relationName: "financialTxVoider",
    }),
    branch: one(branches, {
      fields: [financialTransactions.branchId],
      references: [branches.id],
    }),
    cashRegister: one(cashRegisters, {
      fields: [financialTransactions.cashRegisterId],
      references: [cashRegisters.id],
    }),
    costCenter: one(costCenters, {
      fields: [financialTransactions.costCenterId],
      references: [costCenters.id],
    }),
    links: many(transactionLinks),
  }),
);
