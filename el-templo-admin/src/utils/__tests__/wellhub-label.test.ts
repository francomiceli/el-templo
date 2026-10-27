import { describe, it, expect } from 'vitest';
import { isWellhubSource, memberStatusLabel } from '../wellhub-label';

describe('memberStatusLabel', () => {
  it('visitante Wellhub: "Wellhub"', () => {
    expect(memberStatusLabel('wellhub', {})).toBe('Wellhub');
  });
  it('visitante Wellhub no repite el sufijo aunque venga la marca', () => {
    expect(memberStatusLabel('wellhub', { showWellhubLabel: true })).toBe('Wellhub');
  });
  it('ex-alumno vinculado: "Inactivo · Wellhub"', () => {
    expect(memberStatusLabel('inactivo', { showWellhubLabel: true })).toBe('Inactivo · Wellhub');
  });
  it('socio activo nunca lleva sufijo (defensivo, D-03)', () => {
    expect(memberStatusLabel('activo', { showWellhubLabel: true })).toBe('Activo');
  });
  it('inactivo sin marca: "Inactivo"', () => {
    expect(memberStatusLabel('inactivo', { showWellhubLabel: false })).toBe('Inactivo');
  });
  it('en prueba muestra el contador de prueba', () => {
    expect(memberStatusLabel('prueba', { hasUsedTrial: true })).toBe('En Prueba (1/1)');
    expect(memberStatusLabel('prueba', { hasUsedTrial: false })).toBe('En Prueba (0/1)');
  });
  it('estado nulo o indefinido: guion largo', () => {
    expect(memberStatusLabel(null, {})).toBe('—');
    expect(memberStatusLabel(undefined)).toBe('—');
  });
});

describe('isWellhubSource', () => {
  it('wellhub y wellhub_manual son fuente Wellhub', () => {
    expect(isWellhubSource('wellhub')).toBe(true);
    expect(isWellhubSource('wellhub_manual')).toBe(true);
  });
  it('qr, manual y null no lo son', () => {
    expect(isWellhubSource('qr')).toBe(false);
    expect(isWellhubSource('manual')).toBe(false);
    expect(isWellhubSource(null)).toBe(false);
    expect(isWellhubSource(undefined)).toBe(false);
  });
});
