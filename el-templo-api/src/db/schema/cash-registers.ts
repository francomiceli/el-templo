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
    name: varchar("name", { length: 100 }).notNull(),
    type: mysqlEnum("type", ["efectivo", "banco"]).notNull(),
    // NULLABLE: NULL = caja central (efectivo) o banco (por moneda). NOT NULL
    // sólo para las cajas efectivo de sucursal.
    branchId: int("branch_id").references(() => branches.id),
    currency: varchar("currency", { length: 3 }).notNull(),
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
