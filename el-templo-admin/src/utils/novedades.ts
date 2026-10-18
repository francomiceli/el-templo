/**
 * Helpers PUROS de Novedades de Mi Templo para el admin (sin Vue/Quasar).
 *
 * `visibleNovedadesForBranch` es el ESPEJO en el cliente de la regla D-4 del
 * server (`visibleToBranch` en `el-templo-api/src/modules/communications/
 * novedades-service.ts`): activas, ya publicadas, que coinciden con la sede
 * (scope null/vacío = todas), top 3 por `publishAt DESC, id DESC`. Sirve SOLO
 * para la vista previa "Ver como socio de" — la fuente de verdad sigue siendo
 * el server.
 *
 * `relativeDaysLabel` replica D-7 (mismo texto que la app del socio).
 */
import type { AdminNovedad } from 'src/composables/useCommunicationsApi';
import { APP_SECTIONS } from 'src/config/destinations';
import { COUNTRY_OPTIONS, countryLabel } from 'src/config/countries';
import type { BranchOption } from 'src/types/member';

/** Máximo de novedades que ve un socio (D-4). */
export const NOVEDADES_MEMBER_LIMIT = 3;
/** Largo máximo del texto (D-2, espejo del server; 120 desde la migración 0283, era 80). */
export const NOVEDAD_TEXT_MAX = 120;
/**
 * Desde este largo el texto probablemente no entra en las DOS líneas visibles de
 * la card (decisión de Franco 2026-10-18; antes era una sola) y en la app sube
 * despacio para mostrar la tercera. No es un error: solo avisa. Es una estimación por caracteres (~38 por línea) para un
 * celular de 375px — la vista previa del editor, al mismo ancho, es la que manda.
 */
export const NOVEDAD_TEXT_WARN_FROM = 76;

/** Una novedad tal como la dibuja `NovedadPreview.vue` (réplica de la card de la app). */
export interface NovedadPreviewItem {
  /** Clave estable para el v-for de los puntos. */
  key: string | number;
  text: string;
  /** "hoy", "hace 3 días"... (D-7), en el encabezado de la card. */
  whenLabel: string;
  hasDestination: boolean;
}

/**
 * Margen para considerar "programada" una novedad. Una creada con "Ahora"
 * puede volver con `publishAt` hasta ~1 s en el futuro respecto del reloj del
 * navegador (MySQL DATETIME redondea al segundo + desfase de reloj con el
 * server) y quedaba marcada "Programada" (UAT 2026-10-15). Programar algo a
 * menos de un minuto es, a efectos del admin, publicarlo ya.
 */
export const SCHEDULED_MARGIN_MS = 60_000;

export function isScheduled(novedad: Pick<AdminNovedad, 'publishAt'>, now: Date): boolean {
  return new Date(novedad.publishAt).getTime() > now.getTime() + SCHEDULED_MARGIN_MS;
}

/** Activa y ya publicada: la que cuenta en el KPI. */
export function isLive(novedad: Pick<AdminNovedad, 'publishAt' | 'status'>, now: Date): boolean {
  return novedad.status === 'active' && !isScheduled(novedad, now);
}

function matchesBranch(scope: number[] | null, branchId: number | null): boolean {
  if (!scope || scope.length === 0) return true;
  return branchId !== null && scope.includes(branchId);
}

export function visibleNovedadesForBranch(
  novedades: readonly AdminNovedad[],
  branchId: number | null,
  now: Date
): AdminNovedad[] {
  return novedades
    .filter((n) => isLive(n, now) && matchesBranch(n.scopeBranchIds, branchId))
    .sort((a, b) => {
      const byDate = new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime();
      return byDate !== 0 ? byDate : b.id - a.id;
    })
    .slice(0, NOVEDADES_MEMBER_LIMIT);
}

/** D-7: "hoy", "ayer", "hace N días" (2-6), "hace 1 semana", "hace N semanas", desde 60 días "hace N meses". */
export function relativeDaysLabel(publishAtIso: string, now: Date): string {
  const published = new Date(publishAtIso);
  // Días de calendario (hora local), no 24h corridas: "ayer" es el día anterior.
  const startOf = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.max(0, Math.round((startOf(now) - startOf(published)) / 86_400_000));
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  if (days >= 60) return `hace ${Math.floor(days / 30)} meses`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'hace 1 semana' : `hace ${weeks} semanas`;
}

/** Etiqueta legible del destino ("Reservas", "WhatsApp de ventas") o null si no lleva a ningún lado. */
export function novedadDestinationLabel(
  novedad: Pick<AdminNovedad, 'destinationType' | 'destinationSection'>
): string | null {
  if (novedad.destinationType === 'whatsapp_sales') return 'WhatsApp de ventas';
  if (novedad.destinationType === 'app_section') {
    return APP_SECTIONS.find((s) => s.key === novedad.destinationSection)?.label ?? 'Mi Templo';
  }
  return null;
}

// ── Fecha/hora local <-> ISO UTC ─────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** ISO UTC -> valores para `<input type="date">` / `<input type="time">` en hora LOCAL del navegador. */
export function isoToLocalInputs(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Valores de los inputs (hora LOCAL del navegador) -> ISO UTC, o null si falta/ es inválido. */
export function localInputsToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  // 'YYYY-MM-DDTHH:mm' sin offset se interpreta como hora local.
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Fecha de publicación para las cards, formato local es-AR ("14/10/2026, 10:30"). */
export function formatPublishAt(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ── Alcance por sedes (selector con casillas) ────────────────────────────
//
// El alcance se guarda como antes: `scopeBranchIds` null = todas las sedes
// (incluye las que se abran después), o la lista de IDs. "Todas las sedes de
// un país" es un ATAJO que tilda sus sedes (decisión de Franco 2026-10-15):
// se guardan los IDs, una sede nueva de ese país NO la ve.

export interface BranchCountryGroup {
  /** ISO alfa-2, o '' para sedes sin país. */
  country: string;
  label: string;
  branches: BranchOption[];
}

/** Sedes agrupadas por país, en el orden de `COUNTRY_OPTIONS` (los desconocidos al final). */
export function groupBranchesByCountry(branches: readonly BranchOption[]): BranchCountryGroup[] {
  const order = COUNTRY_OPTIONS.map((c) => c.value);
  const byCountry = new Map<string, BranchOption[]>();
  for (const b of branches) {
    const key = b.country ?? '';
    byCountry.set(key, [...(byCountry.get(key) ?? []), b]);
  }
  const rank = (code: string): number => {
    const i = order.indexOf(code);
    return i === -1 ? order.length : i;
  };
  return [...byCountry.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([country, list]) => ({
      country,
      label: country ? countryLabel(country) : 'Otras sedes',
      branches: list,
    }));
}

/** Alcance guardado -> sedes tildadas (null/vacío = todas las visibles). */
export function selectionFromScope(
  scope: readonly number[] | null,
  branches: readonly BranchOption[]
): number[] {
  if (!scope || scope.length === 0) return branches.map((b) => b.id);
  return [...scope];
}

/**
 * Sedes tildadas -> alcance a guardar. Todas tildadas = null SOLO si
 * `allowGlobal` (owner): un admin ve solo las sedes de su país, y null
 * llegaría también al otro país.
 */
export function scopeFromSelection(
  selected: readonly number[],
  branches: readonly BranchOption[],
  allowGlobal: boolean
): number[] | null {
  const ids = [...new Set(selected)].sort((a, b) => a - b);
  const all = branches.length > 0 && branches.every((b) => ids.includes(b.id));
  return allowGlobal && all ? null : ids;
}

/** "Todas las sedes de Argentina" si el alcance es EXACTAMENTE las sedes de un país; si no, null. */
export function countryScopeLabel(
  scope: readonly number[],
  branches: readonly BranchOption[]
): string | null {
  const ids = new Set(scope);
  for (const group of groupBranchesByCountry(branches)) {
    if (!group.country) continue;
    if (group.branches.length === ids.size && group.branches.every((b) => ids.has(b.id))) {
      return `Todas las sedes de ${group.label}`;
    }
  }
  return null;
}
