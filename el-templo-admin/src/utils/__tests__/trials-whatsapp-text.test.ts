// El admin no declara vitest (los tests siguen la convención pero no los corre CI):
// el import no resuelve en vue-tsc. Se silencia para no sumar a la línea base.
// @ts-expect-error TS2307 vitest no está instalado en el admin
import { describe, it, expect } from 'vitest';
import type { TrialListItem } from 'src/types/scheduling';
import { trialsWhatsappText } from '../trials-whatsapp-text';

function trial(overrides: Partial<TrialListItem>): TrialListItem {
  return {
    bookingId: 1,
    userId: 1,
    firstName: 'Sofía',
    lastName: 'Martínez',
    phone: '+54 9 223 555-1234',
    scheduleId: 1,
    startTime: '10:00',
    endTime: '11:00',
    activityName: 'Funcional',
    status: 'confirmed',
    ...overrides,
  };
}

describe('trialsWhatsappText (Copiar para WhatsApp)', () => {
  const groups = [
    {
      branchId: 1,
      branchName: 'Alberti',
      trials: [
        trial({}),
        trial({ startTime: '18:00', firstName: 'Juan', lastName: 'Pérez', phone: null }),
      ],
    },
    {
      branchId: 2,
      branchName: 'Rivadavia',
      trials: [trial({ startTime: '09:00', phone: '2235559999' })],
    },
  ];

  it('arma título, sedes con cantidad y una línea por persona', () => {
    expect(trialsWhatsappText(groups, '2026-11-25', 'Día completo')).toBe(
      [
        '*Sesiones de Prueba — 2026-11-25 (Día completo)*',
        '',
        '*Alberti* (2)',
        '• 10:00 — Sofía Martínez',
        '• 18:00 — Juan Pérez',
        '',
        '*Rivadavia* (1)',
        '• 09:00 — Sofía Martínez',
      ].join('\n')
    );
  });

  it('nunca incluye el teléfono', () => {
    const text = trialsWhatsappText(groups, '2026-11-25', 'Día completo');
    expect(text).not.toContain('555');
    expect(text).not.toContain('2235559999');
    expect(text).not.toContain('·');
  });
});
