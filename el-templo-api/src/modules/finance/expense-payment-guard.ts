// Módulo: finance — fase 209 (Egresos): guarda de Caja sobre los pagos de gastos.
//
// Un pago de gasto es una fila de `expense_payments` MÁS su fila `expense` del
// ledger. Si esa fila del ledger se anulara o corrigiera "por debajo" desde Caja
// (`POST /transactions/:id/void`, `POST /transactions/:id/correct`,
// `POST /expenses/:id/void`), la plata volvería a la cuenta pero el pago seguiría
// vigente en Egresos: el gasto figuraría pagado sin que haya salido plata. Por
// eso esas entradas públicas, que reciben un id arbitrario del ledger, rechazan
// las filas que son el pago de un gasto y mandan a anularlas desde Egresos.
//
// La guarda NO va en `TransactionService._void` ni en `voidInTx`: Egresos anula
// el pago justamente por `voidInTx`.
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { TxHandle } from "./balance-service";

/**
 * 400 si `transactionId` es la fila del ledger de un pago de gasto del tenant.
 * Una sola lectura por id; si la fila no es un pago (o no existe) no hace nada.
 */
export async function assertNotExpensePaymentRow(
  ctx: TenantContext,
  handle: MySql2Database<typeof schema> | TxHandle,
  transactionId: number,
): Promise<void> {
  const [payment] = await handle
    .select({ id: schema.expensePayments.id })
    .from(schema.expensePayments)
    .where(
      and(
        tenantWhere(schema.expensePayments, ctx),
        eq(schema.expensePayments.transactionId, transactionId),
      ),
    )
    .limit(1);
  if (payment) {
    throw new BadRequestError(
      "Este movimiento es el pago de un gasto: anulalo desde Egresos, en el detalle del gasto",
    );
  }
}
