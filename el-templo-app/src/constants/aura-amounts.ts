/**
 * Montos de Aura que la interfaz escribe en un texto antes de que el servidor responda.
 * Espejo de el-templo-api/src/modules/aura/amounts.ts (AURA_AMOUNTS.profilePhoto y
 * AURA_AMOUNTS.giftMember); si cambia allá, cambia acá. Todo otro monto sale de lo que manda
 * el servidor (`auraAwarded`, etc.).
 */
export const AURA_AMOUNTS_UI = { profilePhoto: 5, giftMember: 1 } as const
