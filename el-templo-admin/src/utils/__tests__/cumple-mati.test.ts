import { describe, it, expect } from 'vitest';
import { isCumpleMatiVisible } from '../cumple-mati';

describe('isCumpleMatiVisible', () => {
  it('se ve el día del cumple', () => {
    expect(isCumpleMatiVisible(new Date(2026, 9, 31, 10, 0))).toBe(true);
  });
  it('se ve hasta el último día inclusive, a última hora', () => {
    expect(isCumpleMatiVisible(new Date(2026, 10, 3, 23, 59))).toBe(true);
  });
  it('se apaga al día siguiente del último', () => {
    expect(isCumpleMatiVisible(new Date(2026, 10, 4, 0, 0))).toBe(false);
  });
  it('se apaga en años siguientes', () => {
    expect(isCumpleMatiVisible(new Date(2027, 9, 31, 10, 0))).toBe(false);
  });
});
