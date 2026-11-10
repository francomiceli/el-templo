/**
 * Gate de cuenta compartido: una sola regla para "esta cuenta ya no puede
 * tener sesión". Lo usan /auth/refresh, el hook de scope (`attachScope`, en
 * cada pedido autenticado) y la recuperación de contraseña.
 *
 * Misma regla que /login: cuenta borrada, o staff deshabilitado. Los socios no
 * se deshabilitan (`staffDisabled` solo aplica a roles distintos de "member").
 */

export type AccountBlockReason = "deleted" | "disabled";

export interface AccountGateRow {
  deletedAt: Date | null;
  role: string;
  staffDisabled: boolean | null;
}

/** `null` cuando la cuenta puede operar; si no, el motivo del bloqueo. */
export function accountBlockReason(
  user: AccountGateRow,
): AccountBlockReason | null {
  if (user.deletedAt) return "deleted";
  if (user.role !== "member" && user.staffDisabled === true) return "disabled";
  return null;
}

/** Mismos textos que devuelve /login para cada motivo. */
export const ACCOUNT_BLOCK_MESSAGES: Record<AccountBlockReason, string> = {
  deleted: "Esta cuenta fue eliminada",
  disabled: "Cuenta desactivada",
};
