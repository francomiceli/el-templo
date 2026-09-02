/**
 * WhatsApp contact resolution by branch country.
 *
 * The member app surfaces a "Contactanos por WhatsApp" CTA in several places
 * (reservations, plan CTAs, onboarding, upsells). Historically all of them
 * pointed at the Argentine support number; Spain (BCN) now has its own line.
 *
 * The routing key is the authenticated member's `branchCountry`, which the
 * API returns in /auth/register, /auth/login, and /auth/me responses. Virtual
 * branches (e.g. ONLINE) inherit the branch's own `country` field — currently
 * AR — so an ES-resident who self-registers before reassignment will briefly
 * see the AR number. That is an accepted edge case of the virtual-branch
 * cross-country fix (hotfix d2a8ad49); once a coach reassigns them to their
 * physical branch the country resolves correctly.
 */

type Country = 'AR' | 'ES'

export const WHATSAPP_NUMBERS: Record<Country, string> = {
  AR: '5492235820521',
  ES: '34680774331',
}

// Fase 193 (D-20/D-21): número de ventas resuelto por el servidor, cacheado
// en memoria de módulo. `null` = sin override del servidor (app vieja, error
// de red, o tenant sin número cargado) → se usa el mapa hardcodeado AR/ES de
// arriba como fallback. Solo dígitos, mismo criterio fail-closed que el
// server (`el-templo-api/src/modules/communications/sales-number.ts`).
let serverSalesNumber: string | null = null

const SALES_NUMBER_PATTERN = /^[0-9]{8,15}$/

/**
 * Setea el número de ventas resuelto por `GET /communications/me/config`.
 * Cualquier valor que no matchee el patrón (nulo, con `+`, con espacios, muy
 * corto/largo) deja el estado en `null` — fail-closed, nunca un número a
 * medio validar termina en una URL de `wa.me`.
 */
export function setServerSalesNumber(value: string | null): void {
  serverSalesNumber = value !== null && SALES_NUMBER_PATTERN.test(value) ? value : null
}

/** Solo para tests: limpia el override de módulo entre casos. */
export function resetWhatsAppOverridesForTests(): void {
  serverSalesNumber = null
}

// D-21 — el número del servidor gana; el mapa AR/ES queda como fallback para
// app vieja o tenant sin número cargado.
export function getWhatsAppNumber(country: Country | null | undefined): string {
  return serverSalesNumber ?? WHATSAPP_NUMBERS[country ?? 'AR']
}

export function buildWhatsAppUrl(country: Country | null | undefined, text?: string): string {
  const number = getWhatsAppNumber(country)
  const query = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${number}${query}`
}
