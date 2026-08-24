// Module: streaks
//
// Fase 176 Plan 07 (MOD-02): la configuración de la recompensa por milestone
// (keys de settings, defaults, y el mapeo milestone→key) se movió a
// `aura/streak-reward.ts` — pertenece al módulo `templo-gamification`, no al
// core. Lo que queda acá define CUÁNDO hay un milestone, que sí es núcleo de
// racha (doc `.docs/saas-multitenancy/04-mecanismo-modulos.md` §4.3).

export const STREAK_MILESTONES = [7, 14, 30, 60, 100] as const;
