/**
 * Reordenar patrocinadores dentro de un país sobre el orden GLOBAL (Fase 199,
 * REVIEW-admin WR-01). Helpers PUROS, sin Vue/Quasar ni imports de la app.
 *
 * `sortOrder` es global: el feed de cada país es la lista global filtrada por
 * país. Las marcas AR+ES aparecen en las dos, así que al mover una dentro de
 * un país no se puede repartir los valores solo entre las marcas de ese país
 * (la marca saltaría por encima de marcas del otro país sin que nadie lo pida).
 *
 * Se trabaja sobre la lista global:
 *   1. se ubica la vecina de la marca en la lista del país visible;
 *   2. hay dos formas equivalentes de intercambiarlas en esa lista visible:
 *      A) mover la marca a la posición de su vecina (antes si sube, después si baja);
 *      B) mover la VECINA al otro lado de la marca;
 *   3. se elige la que cambia menos el orden relativo de las marcas del OTRO
 *      país (empate → A, la literal);
 *   4. se renumera de forma estable: se reparten los mismos valores que ya
 *      tenía la lista global, ordenados, sobre el nuevo orden (estrictamente
 *      crecientes, así también funciona con empates), y se devuelven solo las
 *      marcas cuyo valor cambia.
 */

export interface ReorderableSponsor {
  id: number;
  sortOrder: number;
  countries: readonly string[];
}

export interface ReorderChange {
  id: number;
  /** Valor actual (para deshacer una falla parcial). */
  previous: number;
  next: number;
}

/** Orden global tal como lo ve el server: por `sortOrder` y, a igualdad, por id. */
export function sortGlobally<T extends ReorderableSponsor>(sponsors: readonly T[]): T[] {
  return [...sponsors].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

/** Copia de `list` sin `id` y con `id` insertado justo antes/después de `anchorId`. */
function withMovedNextTo<T extends ReorderableSponsor>(
  list: readonly T[],
  id: number,
  anchorId: number,
  placement: 'before' | 'after'
): T[] {
  const moved = list.find((s) => s.id === id);
  if (!moved) return [...list];
  const rest = list.filter((s) => s.id !== id);
  const anchorIdx = rest.findIndex((s) => s.id === anchorId);
  if (anchorIdx < 0) return [...list];
  rest.splice(placement === 'before' ? anchorIdx : anchorIdx + 1, 0, moved);
  return rest;
}

/**
 * Pares de marcas que comparten algún país distinto de `country` y cuyo orden
 * relativo cambió entre `before` y `after`: cuánto se desordenó "el otro país".
 */
function otherCountryInversions<T extends ReorderableSponsor>(
  before: readonly T[],
  after: readonly T[],
  country: string
): number {
  const posAfter = new Map(after.map((s, i) => [s.id, i]));
  let inversions = 0;
  for (let i = 0; i < before.length; i++) {
    for (let j = i + 1; j < before.length; j++) {
      const a = before[i];
      const b = before[j];
      if (!a || !b) continue;
      const sharesOther = a.countries.some((c) => c !== country && b.countries.includes(c));
      if (!sharesOther) continue;
      if ((posAfter.get(a.id) ?? 0) > (posAfter.get(b.id) ?? 0)) inversions++;
    }
  }
  return inversions;
}

/**
 * Reparte los valores que ya tenía la lista (ordenados) sobre el nuevo orden,
 * forzándolos estrictamente crecientes. Devuelve solo lo que cambia.
 */
function renumberStable<T extends ReorderableSponsor>(
  before: readonly T[],
  reordered: readonly T[]
): ReorderChange[] {
  const values = before.map((s) => s.sortOrder).sort((a, b) => a - b);
  const changes: ReorderChange[] = [];
  let prev = Number.NEGATIVE_INFINITY;
  reordered.forEach((sponsor, i) => {
    const next = Math.max(values[i] ?? 0, prev + 1);
    prev = next;
    if (next !== sponsor.sortOrder) {
      changes.push({ id: sponsor.id, previous: sponsor.sortOrder, next });
    }
  });
  return changes;
}

/**
 * Cambios de `sortOrder` para subir/bajar `movedId` un lugar en la lista del
 * país `country`, sin alterar el orden relativo de las demás marcas de ese país
 * y alterando lo menos posible el del otro. Lista vacía si no hay vecina.
 */
export function planCountryReorder<T extends ReorderableSponsor>(
  sponsors: readonly T[],
  movedId: number,
  direction: 'up' | 'down',
  country: string
): ReorderChange[] {
  const global = sortGlobally(sponsors);
  const visible = global.filter((s) => s.countries.includes(country));
  const idx = visible.findIndex((s) => s.id === movedId);
  const neighbor = visible[direction === 'up' ? idx - 1 : idx + 1];
  if (idx < 0 || !neighbor) return [];

  // A) la marca ocupa el lugar de su vecina. B) la vecina pasa al otro lado de la marca.
  const moveSelf = withMovedNextTo(
    global,
    movedId,
    neighbor.id,
    direction === 'up' ? 'before' : 'after'
  );
  const moveNeighbor = withMovedNextTo(
    global,
    neighbor.id,
    movedId,
    direction === 'up' ? 'after' : 'before'
  );

  const best =
    otherCountryInversions(global, moveNeighbor, country) <
    otherCountryInversions(global, moveSelf, country)
      ? moveNeighbor
      : moveSelf;

  return renumberStable(global, best);
}
