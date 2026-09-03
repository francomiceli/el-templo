// Catálogo de audiencias implícitas de los avisos/tarjetas/plantillas de
// SISTEMA (Fase 193, Plan C — dashboard de Comunicaciones, pedido de Franco
// 2026-09-03: "el badge Sistema no sirve, quiero saber quién lo ve"). Antes
// el chip de la card decía "Sistema"/"Propia" (origen); ahora dice la
// AUDIENCIA real, y el origen queda solo en el filete terracota de
// `ComunicacionCard.vue`.
//
// `AudienceBreadth`: 'todos' = lo ve cualquier socio; 'grupo' = solo un
// subconjunto (sede, plan, segmento, programa…); 'evento' = se dispara por
// algo que hizo/le pasó al socio (no es "quiénes son", es "cuándo les
// toca").
//
// Reglas verificadas contra el código real (no inventadas):
//  - Los 7 `code` de avisos/tarjetas: `SYSTEM_AVISO_CODES` en
//    `el-templo-api/src/modules/communications/system-avisos.ts`.
//    `card_upsell` → `showUpsellBadge = profile.branchIsVirtual` en
//    `el-templo-app/src/modules/progression/pages/MiTemplo.vue` (~L311-312).
//    `card_program` → `showProgramCta = !showProgramProgress` (~L264).
//  - Las 17 `templateKey` de plantillas push: `TEMPLATE_SEEDS` en
//    `el-templo-api/src/modules/notifications/types.ts`. Sin `triggerType`
//    en DB (lógica de negocio hardcodeada en jobs/servicios) — acá el label
//    es SOLO texto informativo para el admin, igual que
//    `systemTriggerDescription()` en `src/config/rule-triggers.ts`.

export type AudienceBreadth = 'todos' | 'grupo' | 'evento';

export interface Audience {
  label: string;
  icon: string;
  breadth: AudienceBreadth;
}

/** Los 7 avisos/tarjetas de sistema, por `code`. */
export const SYSTEM_AVISO_AUDIENCES: Readonly<Record<string, Audience>> = {
  card_referral: { label: 'Todos los socios', icon: 'groups', breadth: 'todos' },
  card_improvement: { label: 'Todos los socios', icon: 'groups', breadth: 'todos' },
  card_upsell: { label: 'Socios de sede virtual', icon: 'cloud', breadth: 'grupo' },
  card_program: { label: 'Socios sin programa activo', icon: 'flag', breadth: 'grupo' },
  rating_prompt: { label: 'Después de una clase', icon: 'bolt', breadth: 'evento' },
  improvement_prompt: { label: 'Todos los socios', icon: 'groups', breadth: 'todos' },
  plan_expiry: { label: 'Con la cuota por vencer', icon: 'event_busy', breadth: 'grupo' },
};

/**
 * Las 17 plantillas push de sistema, por `templateKey`. Decisiones de
 * clasificación donde el plan dejaba margen (ambas leídas del propio
 * disparo, ver `systemTriggerDescription()`):
 *  - `program_enrollment` → 'evento' ("se activó un programa"), no 'grupo':
 *    dispara una vez al activarse, no describe un subconjunto estable de
 *    socios.
 *  - `morning_energy` → 'grupo' (describe a quién le toca hoy, no un
 *    evento puntual del socio) con ícono `wb_sunny` (sesión de la mañana).
 *  - Íconos de `program_week_unlock`/`program_renewal_warning` reusan
 *    `flag` de `card_program` (misma familia: socio con programa activo).
 */
export const SYSTEM_TEMPLATE_AUDIENCES: Readonly<Record<string, Audience>> = {
  segment_transition_en_riesgo: {
    label: 'Socios que pasan a Alerta',
    icon: 'insights',
    breadth: 'grupo',
  },
  segment_transition_ghost: {
    label: 'Socios que pasan a Ausente',
    icon: 'insights',
    breadth: 'grupo',
  },
  segment_transition_recovery: { label: 'Socios que vuelven', icon: 'insights', breadth: 'grupo' },
  segment_transition_espartano: { label: 'Socios Espartanos', icon: 'insights', breadth: 'grupo' },
  ghost_monthly_reattempt: {
    label: 'Ausentes de largo plazo',
    icon: 'insights',
    breadth: 'grupo',
  },
  morning_energy: { label: 'Con sesión reservada hoy', icon: 'wb_sunny', breadth: 'grupo' },
  post_session_soreness: { label: 'Después de una sesión', icon: 'bolt', breadth: 'evento' },
  weekly_summary: { label: 'Todos los socios', icon: 'groups', breadth: 'todos' },
  program_enrollment: { label: 'Al activar un programa', icon: 'bolt', breadth: 'evento' },
  program_week_unlock: { label: 'Con programa activo', icon: 'flag', breadth: 'grupo' },
  program_renewal_warning: { label: 'Con programa activo', icon: 'flag', breadth: 'grupo' },
  waitlist_promoted: { label: 'Al liberarse un lugar', icon: 'bolt', breadth: 'evento' },
  plan_renewal_warning_7d: { label: 'Con la cuota por vencer', icon: 'event_busy', breadth: 'grupo' },
  plan_renewal_warning_3d: { label: 'Con la cuota por vencer', icon: 'event_busy', breadth: 'grupo' },
  plan_renewal_warning_expired: {
    label: 'Con la cuota vencida',
    icon: 'event_busy',
    breadth: 'grupo',
  },
  referral_link_activated: { label: 'Cuando un referido paga', icon: 'bolt', breadth: 'evento' },
  trial_session_reminder: {
    label: 'Con sesión de prueba reservada',
    icon: 'event_busy',
    breadth: 'grupo',
  },
};

/** Fallback para una `templateKey` de sistema no catalogada (no debería pasar hoy). */
export const DEFAULT_SYSTEM_TEMPLATE_AUDIENCE: Audience = {
  label: 'Según regla del sistema',
  icon: 'auto_awesome',
  breadth: 'evento',
};

export function systemAvisoAudience(code: string | null): Audience | undefined {
  return code ? SYSTEM_AVISO_AUDIENCES[code] : undefined;
}

export function systemTemplateAudience(templateKey: string): Audience {
  return SYSTEM_TEMPLATE_AUDIENCES[templateKey] ?? DEFAULT_SYSTEM_TEMPLATE_AUDIENCE;
}
