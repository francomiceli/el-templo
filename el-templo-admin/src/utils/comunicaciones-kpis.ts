/**
 * Números de las 5 KpiCard del dashboard de Comunicaciones (Fase 193,
 * Plan B, pedido de Franco 2026-09-03) — se calculan en el CLIENTE a partir
 * de los listados ya existentes (sin endpoint nuevo, ver plan). Funciones
 * puras y sin dependencias de Vue/Quasar a propósito: se pueden testear
 * sueltas si el admin llega a tener setup de vitest (hoy no lo tiene, ver
 * reporte final del plan).
 */
import type {
  AdminNovedad,
  AvisoRow,
  TemplateRow,
  TvAvisoRow,
} from 'src/composables/useCommunicationsApi';
import { isLive, isScheduled } from 'src/utils/novedades';

export interface KpiSummary {
  /** Número grande de la card (siempre "activas" en esta categoría). */
  value: number;
  /** Línea secundaria compacta con las métricas acumuladas. */
  hint: string;
}

function formatOpenRate(sent: number, opened: number): string {
  if (sent <= 0) return '—';
  return `${((opened / sent) * 100).toFixed(1)}%`;
}

export function computePushKpi(templates: readonly TemplateRow[]): KpiSummary {
  const active = templates.filter((t) => t.isEnabled).length;
  const sent = templates.reduce((acc, t) => acc + t.sentCount, 0);
  const opened = templates.reduce((acc, t) => acc + t.openedCount, 0);
  return {
    value: active,
    hint: `${sent} enviados · ${formatOpenRate(sent, opened)} apertura`,
  };
}

export function computeAvisosKpi(avisos: readonly AvisoRow[]): KpiSummary {
  const active = avisos.filter((a) => a.status === 'active').length;
  const reached = avisos.reduce((acc, a) => acc + a.reachedCount, 0);
  const dismissed = avisos.reduce((acc, a) => acc + a.dismissedCount, 0);
  const clicked = avisos.reduce((acc, a) => acc + a.clickedCount, 0);
  return {
    value: active,
    hint: `${reached} alcanzados · ${dismissed} cerraron · ${clicked} tocaron`,
  };
}

export function computeTarjetasKpi(tarjetas: readonly AvisoRow[]): KpiSummary {
  const active = tarjetas.filter((a) => a.status === 'active').length;
  const clicked = tarjetas.reduce((acc, a) => acc + a.clickedCount, 0);
  return {
    value: active,
    hint: `${clicked} clics`,
  };
}

export function computeTvKpi(avisos: readonly TvAvisoRow[]): KpiSummary {
  const active = avisos.filter((a) => a.isActive).length;
  return {
    value: active,
    hint: `${avisos.length} en total`,
  };
}

/**
 * Novedades de Mi Templo: el número es "activas y ya publicadas" (lo que un
 * socio puede ver hoy). El subtexto aclara cuántas están programadas o
 * pausadas; si no hay ninguna de las dos, cuenta las vistas acumuladas.
 */
export function computeNovedadesKpi(
  novedades: readonly AdminNovedad[],
  now: Date = new Date(),
): KpiSummary {
  const live = novedades.filter((n) => isLive(n, now)).length;
  const scheduled = novedades.filter((n) => n.status === 'active' && isScheduled(n, now)).length;
  const paused = novedades.filter((n) => n.status === 'paused').length;

  const parts: string[] = [];
  if (scheduled > 0) parts.push(`${scheduled} programada${scheduled === 1 ? '' : 's'}`);
  if (paused > 0) parts.push(`${paused} pausada${paused === 1 ? '' : 's'}`);
  if (parts.length === 0) {
    const views = novedades.reduce((acc, n) => acc + n.views, 0);
    parts.push(`${views} vista${views === 1 ? '' : 's'}`);
  }
  return { value: live, hint: parts.join(' · ') };
}
