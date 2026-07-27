// Module: finance — phase 138 (cash_registers entity)
import {
  mysqlTable,
  int,
  varchar,
  boolean,
  date,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { branches } from "./branches";
import { tenantIdColumn } from "./tenant-column";

// Phase 138 — caja como entidad de primera clase (D-04). Una caja NUNCA
// mezcla monedas: `currency` es fija (D-09, guard espejo de applyDelta).
//
// Tipos:
//   efectivo + branch_id=X      → caja de efectivo de la sucursal X
//   efectivo + branch_id=NULL   → caja de efectivo central
//   banco    + branch_id=NULL   → caja banco POR MONEDA (una ARS, una EUR)
//
// El saldo es DERIVADO (D-08): opening_balance (constante por caja, D-06/D-07)
// + Σ validados de la caja DESDE cutoff_date. cutoff_date es el go-live del
// módulo, sembrado con un único valor global (D-06). Las transacciones previas
// al corte se etiquetan con cash_register_id para historial pero quedan
// EXCLUIDAS del saldo vía el cutoff. enum order MUST match migration 0154
// byte-for-byte (enum drift = CI "Unknown column" que tsc no detecta).
export const cashRegisters = mysqlTable(
  "cash_registers",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    name: varchar("name", { length: 100 }).notNull(),
    type: mysqlEnum("type", ["efectivo", "banco"]).notNull(),
    // NULLABLE: NULL = caja central (efectivo) o banco (por moneda). NOT NULL
    // sólo para las cajas efectivo de sucursal.
    branchId: int("branch_id").references(() => branches.id),
    currency: varchar("currency", { length: 3 }).notNull(),
    // Phase 150 (CTA-01 / D-01) — datos bancarios flexibles del ABM de cuentas.
    // Todas NULLABLE: solo aplican a las cajas tipo 'banco' y el ABM impone en
    // el service qué 3 son obligatorias (D-03); las cajas efectivo las dejan
    // NULL. `name` (arriba, NOT NULL) NO cambia: se autogenera en el service
    // (D-03). Nombres SQL byte-for-byte con la migración 0163.
    bankName: varchar("bank_name", { length: 100 }),
    accountHolder: varchar("account_holder", { length: 120 }),
    taxId: varchar("tax_id", { length: 20 }), // CUIT
    cbuCvu: varchar("cbu_cvu", { length: 34 }),
    accountAlias: varchar("account_alias", { length: 60 }),
    accountNumber: varchar("account_number", { length: 50 }),
    // Conteo físico inicial por caja (D-06/D-07). Arranca en 0 en 138; los
    // valores reales se cargan por migración cuando Franco haga el conteo.
    openingBalance: int("opening_balance").default(0).notNull(),
    // Go-live del módulo. transacciones con transaction_date < cutoff_date
    // quedan excluidas del saldo (D-05/D-06). Sembrado con un único valor
    // global; "global" es invariante por convención del seed.
    cutoffDate: date("cutoff_date", { mode: "string" }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_cash_registers_type_currency").on(table.type, table.currency),
    index("idx_cash_registers_branch").on(table.branchId),
  ],
);

export const cashRegistersRelations = relations(cashRegisters, ({ one }) => ({
  branch: one(branches, {
    fields: [cashRegisters.branchId],
    references: [branches.id],
  }),
}));
