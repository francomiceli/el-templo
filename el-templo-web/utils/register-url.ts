/**
 * URL de registro online de la app (CTA "Reservá online", fase 195, D-07).
 *
 * `branchId` preselecciona la sede en el alta y `branchName` lo usa la app para
 * el encabezado (195-07). El plan 195-06 le pasa la atribucion (`utm_*`,
 * `promo`, etc.) en `attribution`.
 */
export const APP_REGISTER_BASE = "https://app.eltemplo.org/register";

export interface RegisterUrlParams {
  branchId?: number;
  branchName?: string;
}

export function buildRegisterUrl(
  params: RegisterUrlParams,
  attribution?: Record<string, string>,
): string {
  const query = new URLSearchParams();
  if (params.branchId !== undefined) {
    query.set("branchId", String(params.branchId));
  }
  if (params.branchName) {
    query.set("branchName", params.branchName);
  }
  for (const [key, value] of Object.entries(attribution ?? {})) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `${APP_REGISTER_BASE}?${qs}` : APP_REGISTER_BASE;
}
