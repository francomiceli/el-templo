// El admin no declara vitest (los tests siguen la convención pero no los corre CI):
// el import no resuelve en vue-tsc. Se silencia para no sumar a la línea base.
// @ts-expect-error TS2307 vitest no está instalado en el admin
import { describe, it, expect } from 'vitest';
import { waitlistBadgeLabel, waitlistCheckInMessage } from '../waitlist-attendance';

describe('waitlistBadgeLabel', () => {
  it('con puesto', () => {
    expect(waitlistBadgeLabel(2)).toBe('LE #2');
  });

  it('sin puesto', () => {
    expect(waitlistBadgeLabel(null)).toBe('LE');
    expect(waitlistBadgeLabel(undefined)).toBe('LE');
    expect(waitlistBadgeLabel(0)).toBe('LE');
  });
});

describe('waitlistCheckInMessage', () => {
  it('clase completa', () => {
    expect(
      waitlistCheckInMessage({ memberName: 'Juan Pérez', position: 2, booked: 20, maxCapacity: 20 })
    ).toBe(
      'Juan Pérez está en lista de espera (puesto 2) y la clase tiene 20/20 (completa). ¿Darle el presente igual?'
    );
  });

  it('con lugar (se liberó y todavía no se promovió)', () => {
    expect(
      waitlistCheckInMessage({ memberName: 'Ana', position: 1, booked: 19, maxCapacity: 20 })
    ).toBe('Ana está en lista de espera (puesto 1) y la clase tiene 19/20. ¿Darle el presente igual?');
  });

  it('sin puesto ni cupo conocido', () => {
    expect(
      waitlistCheckInMessage({ memberName: 'Ana', position: null, booked: 0, maxCapacity: 0 })
    ).toBe('Ana está en lista de espera. ¿Darle el presente igual?');
  });
});
