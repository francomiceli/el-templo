import { describe, it, expect } from 'vitest';
import type { BranchOption } from 'src/types/member';
import {
  SCHEDULED_MARGIN_MS,
  countryScopeLabel,
  groupBranchesByCountry,
  isScheduled,
  scopeFromSelection,
  selectionFromScope,
} from '../novedades';

const BRANCHES: BranchOption[] = [
  { id: 1, name: 'Alberti', country: 'AR' },
  { id: 2, name: 'BCN', country: 'ES' },
  { id: 3, name: 'Moreno', country: 'AR' },
  { id: 4, name: 'Online', country: 'AR', isVirtual: true },
];

describe('isScheduled', () => {
  const now = new Date('2026-10-15T15:00:00.000Z');
  const at = (offsetMs: number) => ({
    publishAt: new Date(now.getTime() + offsetMs).toISOString(),
  });

  it('una creada con "Ahora" que vuelve ~1 s en el futuro NO es programada', () => {
    expect(isScheduled(at(1_000), now)).toBe(false);
  });

  it('justo en el margen todavía no es programada', () => {
    expect(isScheduled(at(SCHEDULED_MARGIN_MS), now)).toBe(false);
  });

  it('pasado el margen sí es programada', () => {
    expect(isScheduled(at(SCHEDULED_MARGIN_MS + 1), now)).toBe(true);
  });

  it('una del pasado no es programada', () => {
    expect(isScheduled(at(-86_400_000), now)).toBe(false);
  });
});

describe('groupBranchesByCountry', () => {
  it('agrupa en el orden de COUNTRY_OPTIONS y conserva el orden de las sedes', () => {
    const groups = groupBranchesByCountry(BRANCHES);
    expect(groups.map((g) => [g.country, g.label, g.branches.map((b) => b.id)])).toEqual([
      ['AR', 'Argentina', [1, 3, 4]],
      ['ES', 'España', [2]],
    ]);
  });

  it('países desconocidos y sedes sin país van al final', () => {
    const groups = groupBranchesByCountry([
      { id: 9, name: 'Sin país' },
      { id: 8, name: 'Lisboa', country: 'PT' },
      { id: 2, name: 'BCN', country: 'ES' },
    ]);
    expect(groups.map((g) => [g.country, g.label])).toEqual([
      ['ES', 'España'],
      ['', 'Otras sedes'],
      ['PT', 'PT'],
    ]);
  });

  it('sin sedes devuelve vacío', () => {
    expect(groupBranchesByCountry([])).toEqual([]);
  });
});

describe('selectionFromScope', () => {
  it('null o vacío = todas las sedes visibles tildadas', () => {
    expect(selectionFromScope(null, BRANCHES)).toEqual([1, 2, 3, 4]);
    expect(selectionFromScope([], BRANCHES)).toEqual([1, 2, 3, 4]);
  });

  it('con alcance devuelve una copia de los IDs', () => {
    const scope = [3, 1];
    const result = selectionFromScope(scope, BRANCHES);
    expect(result).toEqual([3, 1]);
    expect(result).not.toBe(scope);
  });
});

describe('scopeFromSelection', () => {
  it('owner con todas tildadas guarda null (incluye sedes futuras)', () => {
    expect(scopeFromSelection([4, 3, 2, 1], BRANCHES, true)).toBeNull();
  });

  it('admin con todas tildadas guarda los IDs (null llegaría al otro país)', () => {
    expect(scopeFromSelection([4, 3, 2, 1], BRANCHES, false)).toEqual([1, 2, 3, 4]);
  });

  it('una parte tildada guarda los IDs ordenados y sin duplicados', () => {
    expect(scopeFromSelection([3, 1, 3], BRANCHES, true)).toEqual([1, 3]);
  });

  it('sin sedes cargadas nunca devuelve null', () => {
    expect(scopeFromSelection([], [], true)).toEqual([]);
  });
});

describe('countryScopeLabel', () => {
  it('exactamente las sedes de un país', () => {
    expect(countryScopeLabel([4, 1, 3], BRANCHES)).toBe('Todas las sedes de Argentina');
    expect(countryScopeLabel([2], BRANCHES)).toBe('Todas las sedes de España');
  });

  it('un país incompleto o mezclado no tiene etiqueta de país', () => {
    expect(countryScopeLabel([1, 3], BRANCHES)).toBeNull();
    expect(countryScopeLabel([1, 3, 4, 2], BRANCHES)).toBeNull();
  });

  it('las sedes sin país no forman "Todas las sedes de …"', () => {
    expect(countryScopeLabel([9], [{ id: 9, name: 'Sin país' }])).toBeNull();
  });
});
