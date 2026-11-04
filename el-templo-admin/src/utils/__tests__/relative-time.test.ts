import { describe, it, expect } from 'vitest';
import { relativeTime } from '../relative-time';

// Fecha fija en hora local (los helpers de relative-time usan día calendario local).
const NOW = new Date(2026, 10, 3, 15, 30, 0); // 3/11/2026 15:30

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe('relativeTime', () => {
  it('menos de un minuto: "recién"', () => {
    expect(relativeTime(ago(20_000), NOW)).toBe('recién');
  });

  it('minutos: "hace N min"', () => {
    expect(relativeTime(ago(5 * 60_000), NOW)).toBe('hace 5 min');
    expect(relativeTime(ago(59 * 60_000), NOW)).toBe('hace 59 min');
  });

  it('horas del mismo día: "hace N h"', () => {
    expect(relativeTime(new Date(2026, 10, 3, 12, 15).toISOString(), NOW)).toBe('hace 3 h');
  });

  it('día calendario anterior: "ayer", aunque pasaron menos de 24 h', () => {
    expect(relativeTime(new Date(2026, 10, 2, 23, 50).toISOString(), NOW)).toBe('ayer');
  });

  it('menos de una semana: "hace N días"', () => {
    expect(relativeTime(new Date(2026, 9, 31, 12).toISOString(), NOW)).toBe('hace 3 días');
  });

  it('una semana o más: fecha corta dd/mm del mismo año', () => {
    expect(relativeTime(new Date(2026, 9, 20, 10).toISOString(), NOW)).toBe('20/10');
  });

  it('otro año: dd/mm/aa', () => {
    expect(relativeTime(new Date(2025, 11, 5, 10).toISOString(), NOW)).toBe('05/12/25');
  });

  it('futuro: "ahora"', () => {
    expect(relativeTime(new Date(NOW.getTime() + 5 * 60_000).toISOString(), NOW)).toBe('ahora');
  });

  it('fecha inválida: cadena vacía', () => {
    expect(relativeTime('no-es-fecha', NOW)).toBe('');
  });
});
