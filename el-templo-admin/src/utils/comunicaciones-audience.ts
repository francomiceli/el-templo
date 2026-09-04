// Audiencia visible de un ítem de Comunicaciones (Fase 193, Plan C, pedido
// de Franco 2026-09-03). Para `kind: 'system'` delega en el catálogo fijo
// de `src/config/system-audiences.ts`; para las propias la calcula a partir
// del alcance (`scopeBranchIds`/`scopeCountries`/`scopeSegments`) o, en
// notificaciones push, del disparador de la regla.
//
// `groupByAudience` agrupa+ordena las cards de una categoría por amplitud
// (todos → grupo → evento) para que las 4 tabs (Push/Avisos/Tarjetas/TV)
// dejen de mostrar una grilla plana. El orden DENTRO de cada grupo lo
// decide un comparador que pasa cada tab, porque no todas las filas tienen
// la misma forma ni el mismo criterio: Push/Avisos usan `byOriginThenTitle`
// (propias más recientes primero, sistema por título); Tarjetas pasa un
// comparador neutro (`() => 0`, `Array.prototype.sort` es estable) para
// RESPETAR el `sortOrder` que ya traen — si reordenáramos por id/título acá
// las flechas subir/bajar (que operan sobre el `sortOrder` real) dejarían
// de tener sentido visual; TV ordena todas por título (todas son propias).

import type { Audience, AudienceBreadth } from 'src/config/system-audiences';
import { systemAvisoAudience, systemTemplateAudience } from 'src/config/system-audiences';
import type { AvisoRow, TemplateRow, TvAvisoRow, MemberSegmentKey } from 'src/composables/useCommunicationsApi';
import type { RuleTriggerType } from 'src/config/rule-triggers';
import { MEMBER_SEGMENT_OPTIONS } from 'src/config/rule-triggers';
import type { BranchOption } from 'src/types/member';

// ── Resolución de sedes/segmentos para el alcance de las propias ─────────

function branchCountLabel(count: number): string {
  return `${count} sede${count === 1 ? '' : 's'}`;
}

function branchesLabel(branchIds: number[], branches: BranchOption[]): string {
  if (branches.length === 0) return branchCountLabel(branchIds.length);
  const names = branchIds
    .map((id) => branches.find((b) => b.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length !== branchIds.length) return branchCountLabel(branchIds.length);
  return names.join(' · ');
}

function segmentsLabel(segments: MemberSegmentKey[]): string {
  return segments
    .map((s) => MEMBER_SEGMENT_OPTIONS.find((o) => o.value === s)?.label ?? s)
    .join('/');
}

/** Partes del alcance unidas por " · ", o '' si no hay alcance (= todos). */
function scopeParts(
  branchIds: number[] | null | undefined,
  countries: string[] | null | undefined,
  segments: MemberSegmentKey[] | null | undefined,
  branches: BranchOption[],
): string {
  const parts: string[] = [];
  if (branchIds?.length) parts.push(branchesLabel(branchIds, branches));
  if (countries?.length) parts.push(countries.join('/'));
  if (segments?.length) parts.push(segmentsLabel(segments));
  return parts.join(' · ');
}

// ── Avisos/tarjetas (`avisos`, distinta `placement`) ──────────────────────

export function audienceOfAviso(row: AvisoRow, branches: BranchOption[]): Audience {
  if (row.kind === 'system') {
    const known = systemAvisoAudience(row.code);
    if (known) return known;
  }
  const parts = scopeParts(row.scopeBranchIds, row.scopeCountries, row.scopeSegments, branches);
  if (!parts) return { label: 'Todos los socios', icon: 'groups', breadth: 'todos' };
  return { label: parts, icon: 'filter_alt', breadth: 'grupo' };
}

// ── Plantillas push ────────────────────────────────────────────────────

const TRIGGER_LABEL_TEMPLATES: Record<RuleTriggerType, (value: number | null) => string> = {
  plan_expires_in_days: (v) => `Cuota vence en ${v ?? '?'} días`,
  plan_expired_days_ago: (v) => `Cuota vencida hace ${v ?? '?'} días`,
  days_without_attendance: (v) => `${v ?? '?'} días sin venir`,
  member_since_days: (v) => `Se dio de alta hace ${v ?? '?'} días`,
  segment_is: () => '',
  has_active_program: () => 'Con programa activo',
  no_active_program: () => 'Sin programa activo',
  has_booking_today: () => 'Con sesión reservada hoy',
  branch_is_virtual: () => 'Socios de sede virtual',
};

const TRIGGER_ICONS: Record<RuleTriggerType, string> = {
  plan_expires_in_days: 'event_busy',
  plan_expired_days_ago: 'event_busy',
  days_without_attendance: 'directions_run',
  member_since_days: 'person_add',
  segment_is: 'insights',
  has_active_program: 'fitness_center',
  no_active_program: 'fitness_center',
  has_booking_today: 'event_available',
  branch_is_virtual: 'laptop',
};

function triggerAudienceLabel(row: TemplateRow): string {
  if (!row.triggerType) return 'Según regla propia';
  if (row.triggerType === 'segment_is') {
    const segLabel =
      MEMBER_SEGMENT_OPTIONS.find((o) => o.value === row.triggerSegment)?.label ??
      row.triggerSegment ??
      '?';
    return `Segmento ${segLabel}`;
  }
  return TRIGGER_LABEL_TEMPLATES[row.triggerType](row.triggerValue);
}

export function audienceOfTemplate(row: TemplateRow, branches: BranchOption[]): Audience {
  if (row.kind === 'system') return systemTemplateAudience(row.templateKey);
  const label = triggerAudienceLabel(row);
  const icon = row.triggerType ? TRIGGER_ICONS[row.triggerType] : 'bolt';
  const scopePart = scopeParts(row.scopeBranchIds, row.scopeCountries, null, branches);
  return { label: scopePart ? `${label} · ${scopePart}` : label, icon, breadth: 'grupo' };
}

// ── Avisos de TV (entidad aparte, sin `kind`: todas son propias) ─────────

export function audienceOfTvAviso(row: TvAvisoRow, branches: BranchOption[]): Audience {
  if (!row.scopeBranchIds || row.scopeBranchIds.length === 0) {
    return { label: 'Todas las sedes', icon: 'tv', breadth: 'todos' };
  }
  return { label: branchesLabel(row.scopeBranchIds, branches), icon: 'location_on', breadth: 'grupo' };
}

// ── Agrupación por amplitud ────────────────────────────────────────────

export interface AudienceGroup<T> {
  breadth: AudienceBreadth;
  title: string;
  rows: T[];
}

const GROUP_TITLES: Readonly<Record<AudienceBreadth, string>> = {
  todos: 'Los ven todos los socios',
  grupo: 'Solo algunos socios',
  evento: 'Se disparan por un evento',
};

const GROUP_ORDER: readonly AudienceBreadth[] = ['todos', 'grupo', 'evento'];

/**
 * Agrupa `rows` por `audienceOf(row).breadth`, en el orden fijo
 * todos → grupo → evento (omitiendo grupos vacíos). Dentro de cada grupo,
 * ordena con `compare` (ver criterios por tab en el comentario de cabecera).
 */
export function groupByAudience<T>(
  rows: T[],
  audienceOf: (row: T) => Audience,
  compare: (a: T, b: T) => number,
): Array<AudienceGroup<T>> {
  const buckets: Record<AudienceBreadth, T[]> = { todos: [], grupo: [], evento: [] };
  for (const row of rows) {
    buckets[audienceOf(row).breadth].push(row);
  }
  return GROUP_ORDER.filter((breadth) => buckets[breadth].length > 0).map((breadth) => ({
    breadth,
    title: GROUP_TITLES[breadth],
    rows: [...buckets[breadth]].sort(compare),
  }));
}

/** Comparador estándar de Push/Avisos/Tarjetas: propias (id desc) primero, luego sistema por título. */
export function byOriginThenTitle<T>(
  getKind: (row: T) => 'system' | 'custom',
  getId: (row: T) => number,
  getTitle: (row: T) => string,
): (a: T, b: T) => number {
  return (a, b) => {
    const ak = getKind(a);
    const bk = getKind(b);
    if (ak !== bk) return ak === 'custom' ? -1 : 1;
    if (ak === 'custom') return getId(b) - getId(a);
    return getTitle(a).localeCompare(getTitle(b), 'es-AR');
  };
}
