// Module: finance — Marcador único de "fila de retiro" (fase 208, DI-05)
//
// Un retiro de caja vive en DOS formatos y todos los lectores tienen que ver
// ambos sin duplicar ni perder ninguno. Este archivo es el ÚNICO lugar donde
// se decide qué fila es un retiro; nada fuera de acá debería mirar
// `responsible_name IS NOT NULL` para detectarlo.
//
// CONTRATO DE LOS DOS FORMATOS
//
// FORMATO VIEJO (los 48 de prod, no se migran): una fila `kind 'expense'`,
//   `direction 'outflow'`, `cost_center_id` = centro "Retiros",
//   `responsible_name`, `payment_method 'internal'`. Links: expense → cada
//   cobro retirado (`allocated_amount` = monto del cobro) y ajuste por conteo
//   → expense (`allocated_amount` 0).
//
// FORMATO NUEVO (lo produce `WithdrawalService.registerWithdrawal` desde
//   208-06): un traslado. Pata de salida (= el retiro, su id es el id del
//   retiro): `kind 'cash_transfer'`, `direction 'outflow'`, `cash_register_id`
//   = caja de origen, `branch_id` = sede de esa caja (NULL si no tiene),
//   `payment_method 'internal'`, `responsible_name`, `notes`,
//   `cost_center_id` NULL. Pata de entrada: `kind 'cash_transfer'`,
//   `direction 'inflow'`, `cash_register_id` = destino (Central o Tesoro),
//   `branch_id` NULL, mismo monto/fecha/notas y mismo `responsible_name`.
//   Links (`target_kind 'transaction'`): salida → entrada y entrada → salida
//   (`allocated_amount` 0), salida → cada cobro vinculado, ajuste por conteo
//   → salida (`allocated_amount` 0). El ajuste se inserta ANTES que las patas.
//
// MARCADOR: `direction = 'outflow' AND kind IN ('expense','cash_transfer')
//   AND responsible_name IS NOT NULL`. La fila canónica del retiro nuevo es
//   la pata de SALIDA; la pata de entrada (inflow) nunca es un retiro, así no
//   se duplica. Sin columna ni migración nueva.
//
// Este módulo NO importa services (los services lo importan a él).

import { and, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { TransactionKind } from "./types";

/** Kinds de cobro de socio que pueden estar en el cajón y por lo tanto retirarse. */
export const MEMBER_INFLOW_KINDS: ReadonlyArray<TransactionKind> = [
  "plan_charge",
  "debt_settlement",
  "advance_payment",
];

/** Kinds que pueden ser la fila de un retiro (viejo = expense, nuevo = traslado). */
const WITHDRAWAL_ROW_KINDS = ["expense", "cash_transfer"] as const;

export type WithdrawalFormat = "legacy_expense" | "transfer";

/**
 * Formato de la fila si es un retiro, o null si no lo es. Un responsable vacío
 * o solo espacios cuenta como "sin responsable" (el alta lo exige no vacío).
 */
export function withdrawalFormatOf(row: {
  kind: TransactionKind;
  direction: "inflow" | "outflow";
  responsibleName: string | null;
}): WithdrawalFormat | null {
  if (row.direction !== "outflow") return null;
  if (row.responsibleName === null || row.responsibleName.trim() === "") {
    return null;
  }
  if (row.kind === "expense") return "legacy_expense";
  if (row.kind === "cash_transfer") return "transfer";
  return null;
}

/**
 * Condiciones drizzle del marcador sobre `financial_transactions` (la tabla
 * del `from` de la query). Para queries de nivel superior con `.where()`.
 */
export function withdrawalRowConditions(): SQL {
  const conds = and(
    eq(schema.financialTransactions.direction, "outflow"),
    inArray(schema.financialTransactions.kind, [...WITHDRAWAL_ROW_KINDS]),
    isNotNull(schema.financialTransactions.responsibleName),
  );
  if (!conds) throw new Error("Condiciones de retiro vacías");
  return conds;
}

/**
 * Fragmento crudo del marcador para subqueries correlacionados (nombres
 * literales: dentro de `.select()` drizzle renderiza `${schema.x.col}` sin
 * calificar y la correlación se rompe). Solo el alias va con `sql.raw` y se
 * valida: nunca se interpola un valor.
 */
export function withdrawalRowSql(alias: string): SQL {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) {
    throw new Error(`Alias SQL inválido para el marcador de retiro: ${alias}`);
  }
  const a = sql.raw(alias);
  return sql`(${a}.direction = 'outflow' AND ${a}.kind IN ('expense','cash_transfer') AND ${a}.responsible_name IS NOT NULL)`;
}
