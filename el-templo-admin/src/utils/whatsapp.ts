/**
 * Fuente única del link `wa.me` en el admin (Fase 193, D-18/T-193-32).
 *
 * Antes de este archivo había 7 copias de esta misma normalización
 * dispersas en `PartnersPage.vue`, `TrialSessionsReport.vue` y otros 5
 * archivos con variantes propias (ver deviations del SUMMARY del plan 08:
 * las copias que NO agregan el prefijo de país "549" para números de 10
 * dígitos se dejaron sin migrar a propósito, para no cambiarle el número a
 * nadie). Cualquier link nuevo a WhatsApp en el admin debe usar ESTE
 * archivo — está PROHIBIDO agregar una copia local de esta normalización.
 *
 * Normalización (idéntica a la que tenía `TrialSessionsReport.vue`, D-06 de
 * la fase 165): se descarta todo lo que no sea dígito; un número de
 * exactamente 10 dígitos se interpreta como un móvil argentino sin código
 * de país y se le antepone "549" (AR + 9 de móvil). Números con más o menos
 * de 10 dígitos se usan tal cual (ya traen país, o son legacy incompletos
 * que no se adivinan).
 */

export function whatsappUrl(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  const intl = digits.length === 10 ? `549${digits}` : digits;
  return `https://wa.me/${intl}`;
}

export function whatsappUrlWithText(phone: string, text: string): string {
  return `${whatsappUrl(phone)}?text=${encodeURIComponent(text)}`;
}
