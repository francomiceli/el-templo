// El admin no declara vitest (los tests siguen la convención pero no los corre CI):
// el import no resuelve en vue-tsc. Se silencia para no sumar a la línea base.
// @ts-expect-error TS2307 vitest no está instalado en el admin
import { describe, it, expect } from 'vitest';
import { formatAura } from '../aura-format';

describe('formatAura', () => {
  it('agrupa miles con punto, también los de 4 cifras', () => {
    expect(formatAura(7)).toBe('7');
    expect(formatAura(1240)).toBe('1.240');
    expect(formatAura(1234567)).toBe('1.234.567');
  });

  it('trunca decimales y respeta el signo', () => {
    expect(formatAura(150.9)).toBe('150');
    expect(formatAura(-1240)).toBe('-1.240');
  });
});
