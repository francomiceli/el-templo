// Module: finance — guard de saldo de las cajas de efectivo (2026-09-18)
//
// Vive aparte (y no en movement-service.ts, donde nació) porque lo usan los
// egresos/movimientos Y los retiros, y movement-service ya importa de
// withdrawal-service: dejarlo allá obligaba a un import circular.

import { BadRequestError } from "../shared/errors";

/**
 * Guard de saldo para cajas de EFECTIVO: una salida (gasto, movimiento,
 * retiro) no puede superar la plata disponible en el cajón. `available` es el
 * saldo firme derivado (D-08) o el conteo físico declarado. Las cuentas banco
 * no pasan por acá (pueden tener fondos que el ledger no ve, ej. antes del
 * corte). Lanza 400 con el monto y el saldo para que se vea de cuánto se pasó.
 */
export function assertEfectivoCoversOutflow(
  caja: { type: "efectivo" | "banco" },
  amount: number,
  available: number,
  what: string,
): void {
  if (caja.type !== "efectivo") return;
  if (amount > available) {
    throw new BadRequestError(
      `${what} de ${amount} supera el saldo de la caja de efectivo (${available}): la caja quedaría en negativo`,
    );
  }
}
