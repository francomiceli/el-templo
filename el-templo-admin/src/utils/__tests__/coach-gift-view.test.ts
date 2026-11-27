// El admin no declara vitest (los tests siguen la convención pero no los corre CI):
// el import no resuelve en vue-tsc. Se silencia para no sumar a la línea base.
// @ts-expect-error TS2307 vitest no está instalado en el admin
import { describe, expect, it } from 'vitest';
import {
  coachGiftCellKind,
  coachGiftDisabledNote,
  coachGiftGivenTooltip,
  firstNameOf,
} from '../coach-gift-view';

const base = { enabled: true, attendanceId: 10 };

describe('coachGiftCellKind', () => {
  it('disponible → botón para dar Aura', () => {
    expect(
      coachGiftCellKind({ ...base, gift: { state: 'disponible', amount: 5, reason: null } }),
    ).toBe('give');
  });

  it('dado → chip de dado', () => {
    expect(
      coachGiftCellKind({ ...base, gift: { state: 'dado', amount: 5, reason: 'tecnica' } }),
    ).toBe('given');
  });

  it('anulado → chip de anulado', () => {
    expect(
      coachGiftCellKind({ ...base, gift: { state: 'anulado', amount: 5, reason: 'tecnica' } }),
    ).toBe('voided');
  });

  it('no_participa (fuera de la ventana, oculto) → nada', () => {
    expect(
      coachGiftCellKind({ ...base, gift: { state: 'no_participa', amount: 5, reason: null } }),
    ).toBe('none');
  });

  it('gift en null (no es profe de la sede) → botón gris con la nota', () => {
    expect(coachGiftCellKind({ ...base, gift: null })).toBe('disabled');
  });

  it('sin el campo gift (API vieja) → nada', () => {
    expect(coachGiftCellKind({ ...base, gift: undefined })).toBe('none');
  });

  it('sin asistencia marcada → nada, aunque la API diga disponible', () => {
    expect(
      coachGiftCellKind({
        enabled: true,
        attendanceId: null,
        gift: { state: 'disponible', amount: 5, reason: null },
      }),
    ).toBe('none');
  });

  it('módulo de Aura apagado → nada, ni el botón gris', () => {
    expect(coachGiftCellKind({ enabled: false, attendanceId: 10, gift: null })).toBe('none');
    expect(
      coachGiftCellKind({
        enabled: false,
        attendanceId: 10,
        gift: { state: 'disponible', amount: 5, reason: null },
      }),
    ).toBe('none');
  });
});

describe('textos', () => {
  it('nota del botón gris según si la persona regala', () => {
    expect(coachGiftDisabledNote(true)).toBe('Solo los profes de esta sede pueden dar Aura');
    expect(coachGiftDisabledNote(false)).toBe('Solo los profes pueden dar Aura');
  });

  it('tooltip del regalo dado, con y sin motivo', () => {
    expect(coachGiftGivenTooltip('tecnica')).toBe('Ya le diste Aura hoy · Buena técnica');
    expect(coachGiftGivenTooltip(null)).toBe('Ya le diste Aura hoy');
  });

  it('nombre de pila', () => {
    expect(firstNameOf('  Juan Pérez ')).toBe('Juan');
    expect(firstNameOf('Ana')).toBe('Ana');
  });
});
