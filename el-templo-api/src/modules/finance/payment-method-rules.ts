// Module: finance — fase 208 (DI-04)
//
// Regla ÚNICA de coherencia medio de pago ↔ tipo de cuenta. Función pura, sin
// I/O ni DB: la API la aplica en las altas nuevas de egresos, traslados y
// retiros, y el admin la espeja para filtrar las opciones (plan 208-08).
//
//   cash                                → solo cuentas de efectivo (sede, Caja
//                                         central o Tesoro)
//   transfer | card | cheque | direct_debit → solo cuentas banco
//   internal | aura_credit              → exentos
import { BadRequestError } from "../shared/errors";
import type { PaymentMethod } from "./types";

export type AccountType = "efectivo" | "banco";

/**
 * Tipo de cuenta que admite cada medio. `exento` = no se valida:
 * - internal: asientos internos que no mueven plata real entre terceros
 *   (traslados, ajustes, retiros).
 * - aura_credit: circuito propio de créditos AURA.
 * Es un Record sobre PaymentMethod: sumar un medio sin regla no compila.
 */
export const METHOD_ACCOUNT_RULE: Record<
  PaymentMethod,
  AccountType | "exento"
> = {
  cash: "efectivo",
  transfer: "banco",
  card: "banco",
  cheque: "banco",
  direct_debit: "banco",
  internal: "exento",
  aura_credit: "exento",
};

const METHOD_LABELS_ES: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  aura_credit: "AURA",
  internal: "Interno",
  direct_debit: "Domiciliación",
  cheque: "Cheque",
};

export function isMethodAllowedForAccount(
  method: PaymentMethod,
  accountType: AccountType,
): boolean {
  const rule = METHOD_ACCOUNT_RULE[method];
  return rule === "exento" || rule === accountType;
}

export function assertMethodAllowedForAccount(
  method: PaymentMethod,
  account: { type: AccountType; name?: string },
): void {
  if (isMethodAllowedForAccount(method, account.type)) return;
  const tipo =
    account.type === "efectivo" ? "caja de efectivo" : "cuenta banco";
  const nombre = account.name ? ` ${account.name}` : "";
  throw new BadRequestError(
    `El medio ${METHOD_LABELS_ES[method]} no corresponde a la ${tipo}${nombre}: el efectivo va con cajas de efectivo (sede, Caja central o Tesoro) y transferencia, tarjeta, débito y cheque con cuentas banco`,
  );
}
