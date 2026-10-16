// El admin no tiene vitest instalado (sin runner propio): se corre con el binario de la app,
// `cd el-templo-admin && ../el-templo-app/node_modules/.bin/vitest run --root . <este archivo>`.
// @ts-expect-error vitest no se resuelve desde el admin; si se instala, borrar esta línea.
import { describe, it, expect } from 'vitest';
import {
  planCountryReorder,
  sortGlobally,
  type ReorderChange,
  type ReorderableSponsor,
} from '../sponsors-reorder';

type Country = 'AR' | 'ES';

function sponsor(
  id: number,
  sortOrder: number,
  ...countries: Country[]
): ReorderableSponsor & { name: string } {
  return { id, name: String.fromCharCode(64 + id), sortOrder, countries };
}

/** Aplica los cambios y devuelve los nombres de la lista de un país en su orden. */
function orderFor(
  sponsors: Array<ReorderableSponsor & { name: string }>,
  changes: ReorderChange[],
  country: Country
): string[] {
  const next = new Map(changes.map((c) => [c.id, c.next]));
  return sortGlobally(sponsors.map((s) => ({ ...s, sortOrder: next.get(s.id) ?? s.sortOrder })))
    .filter((s) => s.countries.includes(country))
    .map((s) => s.name);
}

describe('planCountryReorder (REVIEW-admin WR-01)', () => {
  // A(1, AR+ES) B(2, AR) C(3, ES) D(4, AR+ES)
  const example = () => [
    sponsor(1, 1, 'AR', 'ES'),
    sponsor(2, 2, 'AR'),
    sponsor(3, 3, 'ES'),
    sponsor(4, 4, 'AR', 'ES'),
  ];

  it('ejemplo del review: subir D sobre B en AR deja el orden de ES intacto', () => {
    const sponsors = example();
    const changes = planCountryReorder(sponsors, 4, 'up', 'AR');
    expect(orderFor(sponsors, changes, 'AR')).toEqual(['A', 'D', 'B']);
    expect(orderFor(sponsors, changes, 'ES')).toEqual(['A', 'C', 'D']);
    // Valores resultantes A=1 C=2 D=3 B=4: solo cambian C, D y B.
    expect(changes).toEqual(
      expect.arrayContaining([
        { id: 3, previous: 3, next: 2 },
        { id: 4, previous: 4, next: 3 },
        { id: 2, previous: 2, next: 4 },
      ])
    );
    expect(changes).toHaveLength(3);
  });

  it('ejemplo del review: bajar B bajo D en AR da el mismo resultado', () => {
    const sponsors = example();
    const changes = planCountryReorder(sponsors, 2, 'down', 'AR');
    expect(orderFor(sponsors, changes, 'AR')).toEqual(['A', 'D', 'B']);
    expect(orderFor(sponsors, changes, 'ES')).toEqual(['A', 'C', 'D']);
  });

  it('subir C sobre A en ES: A queda detrás y B (solo AR) mantiene su lugar relativo', () => {
    const sponsors = example();
    const changes = planCountryReorder(sponsors, 3, 'up', 'ES');
    expect(orderFor(sponsors, changes, 'ES')).toEqual(['C', 'A', 'D']);
    expect(orderFor(sponsors, changes, 'AR')).toEqual(['A', 'B', 'D']);
  });

  it('marcas de un solo país: es un intercambio simple de dos valores', () => {
    const sponsors = [sponsor(1, 0, 'AR'), sponsor(2, 1, 'AR'), sponsor(3, 2, 'AR')];
    const changes = planCountryReorder(sponsors, 3, 'up', 'AR');
    expect(orderFor(sponsors, changes, 'AR')).toEqual(['A', 'C', 'B']);
    expect(changes).toEqual([
      { id: 3, previous: 2, next: 1 },
      { id: 2, previous: 1, next: 2 },
    ]);
  });

  it('dos marcas AR+ES: moverlas cambia inevitablemente los dos países', () => {
    const sponsors = [sponsor(1, 0, 'AR', 'ES'), sponsor(2, 1, 'AR', 'ES')];
    const changes = planCountryReorder(sponsors, 2, 'up', 'AR');
    expect(orderFor(sponsors, changes, 'AR')).toEqual(['B', 'A']);
    expect(orderFor(sponsors, changes, 'ES')).toEqual(['B', 'A']);
  });

  it('con sortOrder repetidos desempata por id y los deja estrictamente crecientes', () => {
    const sponsors = [sponsor(1, 0, 'AR'), sponsor(2, 0, 'AR'), sponsor(3, 0, 'AR')];
    const changes = planCountryReorder(sponsors, 2, 'down', 'AR');
    expect(orderFor(sponsors, changes, 'AR')).toEqual(['A', 'C', 'B']);
    const next = new Map(sponsors.map((s) => [s.id, s.sortOrder]));
    for (const c of changes) next.set(c.id, c.next);
    expect(new Set(next.values()).size).toBe(3);
  });

  it('sin vecina (primera subiendo, última bajando, id inexistente, país sin la marca) → sin cambios', () => {
    const sponsors = example();
    expect(planCountryReorder(sponsors, 1, 'up', 'AR')).toEqual([]);
    expect(planCountryReorder(sponsors, 4, 'down', 'AR')).toEqual([]);
    expect(planCountryReorder(sponsors, 99, 'up', 'AR')).toEqual([]);
    expect(planCountryReorder(sponsors, 3, 'up', 'AR')).toEqual([]); // C no está en AR
    expect(planCountryReorder([], 1, 'up', 'AR')).toEqual([]);
  });

  it('no modifica la lista de entrada', () => {
    const sponsors = example();
    const snapshot = JSON.stringify(sponsors);
    planCountryReorder(sponsors, 4, 'up', 'AR');
    expect(JSON.stringify(sponsors)).toBe(snapshot);
  });

  it('propiedad: la lista del país movido siempre cambia en un solo intercambio, con valores únicos', () => {
    // Generador determinista (LCG) para no depender de Math.random.
    let seed = 20261016;
    const rand = (n: number): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % n;
    };
    const combos: Country[][] = [['AR'], ['ES'], ['AR', 'ES']];

    for (let run = 0; run < 300; run++) {
      const size = 2 + rand(6);
      const sponsors = Array.from({ length: size }, (_, i) =>
        sponsor(i + 1, rand(4) === 0 ? rand(3) : i * 2, ...(combos[rand(3)] ?? ['AR']))
      );
      const country: Country = rand(2) === 0 ? 'AR' : 'ES';
      const direction = rand(2) === 0 ? 'up' : 'down';
      const visible = sortGlobally(sponsors).filter((s) => s.countries.includes(country));
      if (visible.length < 2) continue;
      const moved = visible[rand(visible.length)];
      if (!moved) continue;

      const idx = visible.findIndex((s) => s.id === moved.id);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      const expected = visible.map((s) => s.name);
      if (swapIdx >= 0 && swapIdx < expected.length) {
        [expected[idx], expected[swapIdx]] = [expected[swapIdx]!, expected[idx]!];
      }

      const changes = planCountryReorder(sponsors, moved.id, direction, country);
      const label = JSON.stringify({ sponsors, moved: moved.id, direction, country });
      expect(orderFor(sponsors, changes, country), label).toEqual(expected);

      // Cada marca se cambia como mucho una vez y solo si el valor es distinto.
      expect(new Set(changes.map((c) => c.id)).size, label).toBe(changes.length);
      for (const c of changes) expect(c.next, label).not.toBe(c.previous);
    }
  });
});
