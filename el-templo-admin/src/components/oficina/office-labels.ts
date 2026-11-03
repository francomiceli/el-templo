/**
 * Etiquetas, colores y textos de eventos de Oficina (fase 205). Un solo lugar para
 * que lista, detalle y diálogo hablen igual.
 */
import type {
  OfficeEvent,
  OfficeEventType,
  OfficePerson,
  OfficeTargetKind,
  OfficeTopicListItem,
  OfficeTopicOrigin,
  OfficeTopicStatus,
} from 'src/composables/useOfficeApi';

export const STATUS_LABELS: Record<OfficeTopicStatus, string> = {
  abierto: 'Abierto',
  dormido: 'Dormido',
  cerrado: 'Cerrado',
};

export const STATUS_COLORS: Record<OfficeTopicStatus, string> = {
  abierto: 'primary',
  dormido: 'warning',
  cerrado: 'grey-7',
};

export const ORIGIN_LABELS: Record<OfficeTopicOrigin, string> = {
  manual: 'Manual',
  sistema: 'Del sistema',
};

export const TARGET_KIND_LABELS: Record<OfficeTargetKind, string> = {
  socio: 'Socio',
  jornada: 'Jornada',
  wellhub_evento: 'Wellhub',
  horario: 'Horario',
};

export const TARGET_KIND_ICONS: Record<OfficeTargetKind, string> = {
  socio: 'person',
  jornada: 'badge',
  wellhub_evento: 'cloud_sync',
  horario: 'schedule',
};

/** Ruta del admin a la que lleva el vínculo de un tema; null si no hay pantalla. */
export function targetRoute(kind: OfficeTargetKind, id: number | null): string | null {
  switch (kind) {
    case 'socio':
      return id !== null ? `/alumnos/${id}` : null;
    case 'jornada':
      return '/check-in';
    case 'horario':
      return '/horarios';
    case 'wellhub_evento':
      return null;
    default:
      return null;
  }
}

export function personName(person: OfficePerson | null | undefined): string {
  if (!person) return '';
  return [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
}

export function personInitials(person: OfficePerson | null | undefined): string {
  if (!person) return '?';
  const first = person.firstName?.trim()[0] ?? '';
  const last = person.lastName?.trim()[0] ?? '';
  const initials = `${first}${last}`.toUpperCase();
  return initials || '?';
}

/** "dd/mm" desde un YYYY-MM-DD, sin pasar por Date (evita corrimientos de zona). */
export function shortDate(ymd: string): string {
  const [, month, day] = ymd.split('-');
  return month && day ? `${day}/${month}` : ymd;
}

function payloadString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Qué pasó, en pasado y sin actor ("abrió el tema", "durmió el tema hasta 12/11").
 * Los eventos `sistema` traen su propio texto en `body`.
 */
export function eventText(
  type: OfficeEventType,
  body: string | null,
  payload: Record<string, unknown> | null
): string {
  switch (type) {
    case 'creado':
      return 'abrió el tema';
    case 'comentario':
      return body ?? '';
    case 'tomado':
      return 'tomó el tema';
    case 'asignado': {
      const name = payloadString(payload, 'assigneeName');
      return name ? `asignó el tema a ${name}` : 'asignó el tema';
    }
    case 'desasignado':
      return 'quitó el responsable';
    case 'dormido': {
      const until = payloadString(payload, 'until');
      return until ? `durmió el tema hasta el ${shortDate(until)}` : 'durmió el tema';
    }
    case 'cerrado':
      return body ? `cerró el tema: ${body}` : 'cerró el tema';
    case 'reabierto':
      return payload?.auto === true ? 'el tema se despertó solo' : 'reabrió el tema';
    case 'editado':
      return 'editó el tema';
    case 'sistema':
      return body ?? 'novedad del sistema';
    default:
      return '';
  }
}

/** Línea completa de un evento que no es comentario: "Ana tomó el tema". */
export function eventLine(ev: OfficeEvent): string {
  // Los eventos `sistema` traen una frase entera en el body: se leen solos.
  if (ev.type === 'sistema') return eventText(ev.type, ev.body, ev.payload);
  // El despertar automático de un tema dormido no tiene sujeto humano.
  if (ev.type === 'reabierto' && ev.payload?.auto === true) return 'El tema se despertó solo';
  const text = eventText(ev.type, ev.body, ev.payload);
  const actor = ev.actor ? personName(ev.actor) || 'Alguien' : 'El sistema';
  return `${actor} ${text}`.trim();
}

/** Resumen de una línea del último movimiento de un tema, para la lista. */
export function lastEventLine(last: OfficeTopicListItem['lastEvent']): string {
  if (!last) return '';
  const actor = last.actorFirstName ?? '';
  switch (last.type) {
    case 'comentario':
      return actor ? `${actor}: ${last.body ?? ''}` : (last.body ?? '');
    case 'sistema':
      return last.body ?? 'Novedad del sistema';
    case 'reabierto':
      if (!actor) return 'El tema se despertó solo';
      return `${actor} reabrió el tema`;
    default:
      return `${actor || 'El sistema'} ${eventText(last.type, last.body, null)}`.trim();
  }
}
