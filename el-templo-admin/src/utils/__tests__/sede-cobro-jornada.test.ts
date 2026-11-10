import { describe, it, expect } from 'vitest';
import { sedeCobroDistintaDeJornada } from '../sede-cobro-jornada';

const moreno = { branchId: 1, branchName: 'Moreno' };

describe('sedeCobroDistintaDeJornada', () => {
  it('avisa si la jornada está en una sede y el cobro va a otra (caso Pato)', () => {
    expect(sedeCobroDistintaDeJornada(moreno, 16)).toBe(true);
  });
  it('no avisa si el cobro va a la sede de la jornada', () => {
    expect(sedeCobroDistintaDeJornada(moreno, 1)).toBe(false);
  });
  it('no avisa sin jornada abierta (gestión cobra a distancia)', () => {
    expect(sedeCobroDistintaDeJornada(null, 16)).toBe(false);
  });
  it('no avisa si todavía no hay sede del cobro elegida', () => {
    expect(sedeCobroDistintaDeJornada(moreno, null)).toBe(false);
  });
});
