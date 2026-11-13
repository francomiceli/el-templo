// El admin no declara vitest (los tests siguen la convención pero no los corre CI):
// el import no resuelve en vue-tsc. Se silencia para no sumar a la línea base.
// @ts-expect-error TS2307 vitest no está instalado en el admin
import { describe, it, expect } from 'vitest';
import { openingExpected, openingDifference } from '../opening-count';

describe('openingExpected (espejo de la API)', () => {
  const caja = { changeFund: 200, firmeBalance: 1000, pendienteAmount: 300 };

  it('efectivo: fondo de cambio + firme + pendiente', () => {
    expect(openingExpected(caja, 'efectivo')).toBe(1500);
  });

  it('banco: firme + pendiente, sin fondo de cambio', () => {
    expect(openingExpected(caja, 'banco')).toBe(1300);
  });

  it('banco: respeta un firme negativo', () => {
    expect(openingExpected({ changeFund: 0, firmeBalance: -50, pendienteAmount: 0 }, 'banco')).toBe(
      -50
    );
  });
});

describe('openingDifference', () => {
  it('sin importe cargado: null', () => {
    expect(openingDifference(null, 1000)).toBeNull();
  });

  it('coincide: ok con 0', () => {
    expect(openingDifference(1000, 1000)).toEqual({ kind: 'ok', amount: 0 });
  });

  it('más que lo esperado: sobrante', () => {
    expect(openingDifference(1200, 1000)).toEqual({ kind: 'sobrante', amount: 200 });
  });

  it('menos que lo esperado: faltante', () => {
    expect(openingDifference(700, 1000)).toEqual({ kind: 'faltante', amount: 300 });
  });
});
