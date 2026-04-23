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

export function getWhatsAppNumber(country: Country | null | undefined): string {
  return WHATSAPP_NUMBERS[country ?? 'AR']
}

export function buildWhatsAppUrl(country: Country | null | undefined, text?: string): string {
  const number = getWhatsAppNumber(country)
  const query = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${number}${query}`
}
