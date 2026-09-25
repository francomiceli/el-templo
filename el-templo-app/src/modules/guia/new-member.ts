/**
 * "Socio nuevo" para "Empezá acá" (decisión de Franco, 2026-09-24): las
 * historias se abren solas y los globos de primer uso aparecen SOLO a quien
 * tiene menos de {@link NEW_MEMBER_DAYS} días de alta. Los veteranos las
 * encuentran en la Guía, señaladas con la pelotita roja del nav.
 *
 * Sin `memberSince` (API vieja) se lo trata como veterano: mejor no
 * interrumpir que interrumpir de más.
 */
export const NEW_MEMBER_DAYS = 60

export function isNewMember(memberSince: string | undefined, now: Date = new Date()): boolean {
  if (!memberSince) return false
  const since = new Date(memberSince).getTime()
  if (Number.isNaN(since)) return false
  return now.getTime() - since < NEW_MEMBER_DAYS * 24 * 60 * 60 * 1000
}
