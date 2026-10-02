import { describe, it, expect } from 'vitest';
import {
  describeTrialBookingChange,
  type TrialBookingChange,
} from '../trial-booking-changes';

const base: TrialBookingChange = {
  bookingId: 70139,
  date: '2026-10-02',
  startTime: '10:00',
  activityName: 'General',
  branchName: 'Alberti',
  outcome: 'converted',
  reason: null,
};

describe('describeTrialBookingChange', () => {
  it('convertida: día, hora, clase, sede y resultado', () => {
    expect(describeTrialBookingChange(base)).toBe(
      'vie 02/10 10:00 · General · Alberti: pasó a ser una reserva de su plan.'
    );
  });

  it('cancelada: agrega el motivo', () => {
    expect(
      describeTrialBookingChange({
        ...base,
        outcome: 'cancelled',
        reason: 'Su plan fijo no incluye ese horario.',
      })
    ).toBe('vie 02/10 10:00 · General · Alberti: se canceló. Su plan fijo no incluye ese horario.');
  });

  it('sin cambios: sigue como SP; recorta HH:MM:SS a HH:MM', () => {
    expect(
      describeTrialBookingChange({
        ...base,
        startTime: '10:00:00',
        outcome: 'kept',
        reason: 'El plan todavía no arrancó: la sesión sigue como prueba.',
      })
    ).toBe(
      'vie 02/10 10:00 · General · Alberti: sigue como Sesión de Prueba. El plan todavía no arrancó: la sesión sigue como prueba.'
    );
  });
});
