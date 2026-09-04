// ESPEJO de `el-templo-api/src/modules/notifications/rules.ts` (catálogo
// cerrado `RULE_TRIGGERS`). Fase 193, Plan B (dashboard de Comunicaciones,
// pedido de Franco 2026-09-03): el editor de notificaciones propias necesita
// el mismo catálogo con labels en español pensados para el admin (el label
// de la API es más técnico). Igual que `src/config/destinations.ts`, la
// validación de CONTENIDO (rango, combinación value/segment) es SIEMPRE
// server-side — esto solo arma las opciones del selector y los límites del
// input numérico para que el admin no pueda ni intentar un valor fuera de
// rango.

export type RuleTriggerType =
  | 'plan_expires_in_days'
  | 'plan_expired_days_ago'
  | 'days_without_attendance'
  | 'member_since_days'
  | 'segment_is'
  // Disparadores de ESTADO (2026-09-04): sin N ni segmento.
  | 'has_active_program'
  | 'no_active_program'
  | 'has_booking_today'
  | 'branch_is_virtual';

export interface RuleTriggerDef {
  type: RuleTriggerType;
  label: string;
  helpText: string;
  /** Si el trigger necesita `triggerValue` (N días). */
  needsValue: boolean;
  /** Si el trigger necesita `triggerSegment`. */
  needsSegment: boolean;
  minValue?: number;
  maxValue?: number;
}

export const RULE_TRIGGERS: readonly RuleTriggerDef[] = [
  {
    type: 'plan_expires_in_days',
    label: 'La cuota vence en N días',
    helpText: 'Alcanza a socios cuya cuota vence exactamente dentro de N días.',
    needsValue: true,
    needsSegment: false,
    minValue: 0,
    maxValue: 365,
  },
  {
    type: 'plan_expired_days_ago',
    label: 'La cuota venció hace N días',
    helpText: 'Alcanza a socios cuya cuota venció exactamente hace N días, sin renovar.',
    needsValue: true,
    needsSegment: false,
    minValue: 1,
    maxValue: 365,
  },
  {
    type: 'days_without_attendance',
    label: 'Lleva N días sin venir',
    helpText: 'Alcanza a socios con cuota vigente cuya última asistencia fue hace N días.',
    needsValue: true,
    needsSegment: false,
    minValue: 1,
    maxValue: 365,
  },
  {
    type: 'member_since_days',
    label: 'Se dio de alta hace N días',
    helpText: 'Alcanza a socios que cumplen exactamente N días de antigüedad hoy.',
    needsValue: true,
    needsSegment: false,
    minValue: 0,
    maxValue: 365,
  },
  {
    type: 'segment_is',
    label: 'Está en el segmento…',
    helpText: 'Alcanza a socios cuyo segmento de asistencia actual es el elegido.',
    needsValue: false,
    needsSegment: true,
  },
  {
    type: 'has_active_program',
    label: 'Tiene un programa activo',
    helpText:
      'Alcanza a socios con un programa en curso. Se repite según la cadencia mientras el programa siga activo.',
    needsValue: false,
    needsSegment: false,
  },
  {
    type: 'no_active_program',
    label: 'No tiene programa activo',
    helpText:
      'Alcanza a socios activos sin ningún programa en curso (útil para ofrecer uno). Se repite según la cadencia.',
    needsValue: false,
    needsSegment: false,
  },
  {
    type: 'has_booking_today',
    label: 'Tiene una sesión reservada hoy',
    helpText:
      'Alcanza a socios con una reserva vigente para hoy (no cuenta cancelada, lista de espera ni ausente). Se evalúa cada mañana.',
    needsValue: false,
    needsSegment: false,
  },
  {
    type: 'branch_is_virtual',
    label: 'Es socio de una sede virtual',
    helpText:
      'Alcanza a socios cuya sede es virtual (Templo Online). Se repite según la cadencia.',
    needsValue: false,
    needsSegment: false,
  },
];

const RULE_TRIGGER_BY_TYPE: ReadonlyMap<RuleTriggerType, RuleTriggerDef> = new Map(
  RULE_TRIGGERS.map((t) => [t.type, t]),
);

export function findRuleTrigger(type: string): RuleTriggerDef | undefined {
  return RULE_TRIGGER_BY_TYPE.get(type as RuleTriggerType);
}

export const RULE_TRIGGER_OPTIONS = RULE_TRIGGERS.map((t) => ({
  label: t.label,
  value: t.type,
}));

// ── Segmentos de asistencia (óptima/regular/alerta/ausente) ───────────────
// Mismos 4 valores/labels que ya usaban PushTab.vue y AvisoEditorDialog.vue
// por separado — centralizados acá para no repetir el mismo array literal
// en un tercer lugar (el nuevo editor de reglas propias).

export type MemberSegmentKey = 'optima' | 'regular' | 'alerta' | 'ausente';

export const MEMBER_SEGMENT_OPTIONS: ReadonlyArray<{
  value: MemberSegmentKey;
  label: string;
}> = [
  { value: 'optima', label: 'Óptima' },
  { value: 'regular', label: 'Regular' },
  { value: 'alerta', label: 'Alerta' },
  { value: 'ausente', label: 'Ausente' },
];

// ── Descripción fija del disparador de cada plantilla de SISTEMA ──────────
// Las 17 `TEMPLATE_SEEDS` (el-templo-api/src/modules/notifications/types.ts)
// no tienen `triggerType` en la DB (son lógica de negocio hardcodeada en
// distintos jobs/servicios, no el motor de reglas) — este mapa es SOLO texto
// informativo para el editor ("Disparador del sistema: …"), nunca se manda
// al server ni se usa para validar nada.
export const SYSTEM_TEMPLATE_TRIGGER_DESCRIPTIONS: Readonly<Record<string, string>> = {
  segment_transition_en_riesgo: 'Automático: el socio pasó a segmento Alerta.',
  segment_transition_ghost: 'Automático: el socio pasó de Alerta a Ausente.',
  segment_transition_recovery: 'Automático: el socio volvió a entrenar tras estar inactivo.',
  segment_transition_espartano: 'Automático: el socio pasó a segmento Óptima.',
  ghost_monthly_reattempt: 'Automático: reintento mensual a socios Ausentes de largo plazo.',
  morning_energy: 'Automático: antes de una sesión reservada para hoy.',
  post_session_soreness: 'Automático: después de registrar una sesión.',
  weekly_summary: 'Automático: resumen semanal de entrenamiento.',
  program_enrollment: 'Automático: se activó un programa para el socio.',
  program_week_unlock: 'Automático: se desbloqueó una nueva semana del programa.',
  program_renewal_warning: 'Automático: el programa del socio está por vencer.',
  waitlist_promoted: 'Automático: el socio pasó de lista de espera a reserva confirmada.',
  plan_renewal_warning_7d: 'Automático: la cuota vence en 7 días.',
  plan_renewal_warning_3d: 'Automático: la cuota vence en 3 días.',
  plan_renewal_warning_expired: 'Automático: la cuota vence hoy o ya venció.',
  referral_link_activated: 'Automático: un referido del socio pagó su primer plan.',
  trial_session_reminder: 'Automático: recordatorio ~24 h antes de una sesión de prueba reservada.',
};

export function systemTriggerDescription(templateKey: string): string {
  return (
    SYSTEM_TEMPLATE_TRIGGER_DESCRIPTIONS[templateKey] ??
    'Disparador automático del sistema (lógica interna, no editable).'
  );
}

// ── Condiciones que pisan una plantilla fija de vencimiento de cuota ──────
// Pedido de Franco (2026-09-03): al crear/editar una regla propia con
// `plan_expires_in_days` en 7, 3 o 0, el editor avisa (sin bloquear) si la
// plantilla fija correspondiente está activa — el socio podría recibir dos
// avisos parecidos el mismo día.
export const PLAN_EXPIRY_OVERLAP_WARNINGS: ReadonlyArray<{
  triggerType: RuleTriggerType;
  value: number;
  systemTemplateKey: string;
}> = [
  { triggerType: 'plan_expires_in_days', value: 7, systemTemplateKey: 'plan_renewal_warning_7d' },
  { triggerType: 'plan_expires_in_days', value: 3, systemTemplateKey: 'plan_renewal_warning_3d' },
  {
    triggerType: 'plan_expires_in_days',
    value: 0,
    systemTemplateKey: 'plan_renewal_warning_expired',
  },
];

// ── Categorías de notificación push (las 6 de `NOTIFICATION_CATEGORIES`,
// el-templo-api/src/modules/notifications/types.ts) — PushTab.vue solo tenía
// 4 mapeadas (faltaban 'planes'/'referidos', usadas por plantillas de
// sistema reales: plan_renewal_warning_*, referral_link_activated).
export type NotificationCategoryKey =
  | 'entrenamiento'
  | 'programas'
  | 'motivacion'
  | 'anuncios'
  | 'planes'
  | 'referidos';

export const NOTIFICATION_CATEGORY_OPTIONS: ReadonlyArray<{
  value: NotificationCategoryKey;
  label: string;
}> = [
  { value: 'entrenamiento', label: 'Entrenamiento' },
  { value: 'programas', label: 'Programas' },
  { value: 'motivacion', label: 'Motivación' },
  { value: 'anuncios', label: 'Anuncios' },
  { value: 'planes', label: 'Planes' },
  { value: 'referidos', label: 'Referidos' },
];

const CATEGORY_COLORS: Readonly<Record<string, string>> = {
  entrenamiento: 'blue',
  programas: 'green',
  motivacion: 'orange',
  anuncios: 'purple',
  planes: 'teal',
  referidos: 'brown',
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? 'grey';
}

export function categoryLabel(category: string): string {
  return NOTIFICATION_CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category;
}
