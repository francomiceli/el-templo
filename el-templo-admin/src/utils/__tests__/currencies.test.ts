// El admin no declara vitest (los tests siguen la convención pero no los corre CI):
// el import no resuelve en vue-tsc. Se silencia para no sumar a la línea base.
// @ts-expect-error TS2307 vitest no está instalado en el admin
import { describe, it, expect } from 'vitest';
import { ACCOUNT_CURRENCIES, ACCOUNT_CURRENCY_OPTIONS, currencySymbol } from '../currencies';
import { formatPrice } from '../format-price';

describe('monedas de cuenta', () => {
  it('ARS, EUR y USD en ese orden', () => {
    expect([...ACCOUNT_CURRENCIES]).toEqual(['ARS', 'EUR', 'USD']);
  });

  it('las opciones cubren todas las monedas con etiqueta en español', () => {
    expect(ACCOUNT_CURRENCY_OPTIONS).toEqual([
      { label: 'Pesos (ARS)', value: 'ARS' },
      { label: 'Euros (EUR)', value: 'EUR' },
      { label: 'Dólares (USD)', value: 'USD' },
    ]);
    expect(ACCOUNT_CURRENCY_OPTIONS.map((o) => o.value)).toEqual([...ACCOUNT_CURRENCIES]);
  });

  it('currencySymbol: símbolo por moneda y código si es desconocida', () => {
    expect(currencySymbol('ARS')).toBe('$');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('USD')).toBe('US$');
    expect(currencySymbol('XYZ')).toBe('XYZ');
  });
});

describe('formatPrice con USD', () => {
  it('entero: US$ y miles sin decimales', () => {
    const out = formatPrice(1500, 'USD');
    expect(out).toContain('US$');
    expect(out).toContain('1.500');
    expect(out).not.toContain(',');
  });

  it('con centavos: siempre 2 decimales', () => {
    const out = formatPrice(1500.5, 'USD');
    expect(out).toContain('US$');
    expect(out.endsWith('1.500,50')).toBe(true);
  });

  it('ARS y EUR no cambian', () => {
    expect(formatPrice(1500, 'ARS')).toContain('1.500');
    expect(formatPrice(1500, 'ARS')).not.toContain('US$');
    expect(formatPrice(70, 'EUR')).toContain('€');
  });
});
