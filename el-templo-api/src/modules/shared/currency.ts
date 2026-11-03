/**
 * Moneda de una sede a partir de su país (`branches.country`).
 *
 * Regla del repo: `"ES"` → EUR; cualquier otro país (hoy solo "AR", y por
 * defecto histórico el resto) → ARS. Se resuelve por país, nunca por nombre de
 * sede (Tablero semanal, D-16).
 *
 * Deuda técnica: esta misma regla ya existe copiada en
 * `referral-partners/service.ts` (~1382), `subscriptions/service.ts` (~1122) y
 * `finance/coach-load-routes.ts` (~1242). No se migraron en la fase 206 para no
 * tocar módulos ajenos; unificarlas apuntando a esta función es trabajo futuro.
 */
export type CountryCurrency = "ARS" | "EUR";

export function currencyForCountry(country: string): CountryCurrency {
  return country === "ES" ? "EUR" : "ARS";
}
