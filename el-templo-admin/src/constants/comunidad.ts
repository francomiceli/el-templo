/**
 * Fase 215 (ajustes, plan C) — pestañas de la página Comunidad (Gerencia).
 *
 * La página `/comunidad` es un hub q-tabs como Caja: Fotos (revisión de fotos de perfil, fase
 * 214) y Regalos de Aura (fase 215). Estos nombres son la única fuente de verdad del modelo de
 * pestañas y de la persistencia en `?tab=`; las rutas viejas `/alumnos/fotos` y
 * `/alumnos/regalos` redirigen a la pestaña que corresponde.
 */

export const COMUNIDAD_TABS = {
  fotos: 'fotos',
  regalos: 'regalos',
} as const;

export type ComunidadTab = (typeof COMUNIDAD_TABS)[keyof typeof COMUNIDAD_TABS];

/** Pestaña de aterrizaje: Fotos (la ve todo el staff). */
export const COMUNIDAD_DEFAULT_TAB: ComunidadTab = COMUNIDAD_TABS.fotos;

/** Nombres válidos, para validar `?tab=`. */
export const COMUNIDAD_TAB_NAMES: readonly ComunidadTab[] = [
  COMUNIDAD_TABS.fotos,
  COMUNIDAD_TABS.regalos,
];
