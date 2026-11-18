/**
 * Motivos del regalo de Aura (fase 215, D-16). Espejo de
 * el-templo-api/src/modules/aura/gift-rules.ts: si cambian allá, cambian acá.
 */
export const GIFT_REASONS = [
  { code: 'tecnica', label: 'Buena técnica' },
  { code: 'constancia', label: 'Constancia' },
  { code: 'energia', label: 'Buena energía' },
  { code: 'ayudo', label: 'Me ayudó' },
] as const

export type GiftReasonCode = (typeof GIFT_REASONS)[number]['code']

/** Etiqueta del motivo. Un código desconocido (API más nueva) se devuelve tal cual. */
export function giftReasonLabel(code: string): string {
  return GIFT_REASONS.find((r) => r.code === code)?.label ?? code
}
