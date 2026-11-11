// El admin no declara vitest (los tests siguen la convención pero no los corre CI):
// el import no resuelve en vue-tsc. Se silencia para no sumar a la línea base.
// @ts-expect-error TS2307 vitest no está instalado en el admin
import { describe, it, expect } from 'vitest';
import {
  compareMoney,
  formatMoneyNumber,
  fractionDigitsFor,
  fromCents,
  moneyEquals,
  MONEY_PARSE_MESSAGES,
  parseMoneyInput,
  roundMoney,
  sumMoney,
  toCents,
} from '../money';

/** Atajo: valor parseado o undefined si el texto no es válido. */
function parsed(text: string): number | undefined {
  const r = parseMoneyInput(text);
  return r.ok ? r.value : undefined;
}

describe('parseMoneyInput', () => {
  const casos: Array<[string, number]> = [
    ['77.570,82', 77570.82],
    ['77570,82', 77570.82],
    ['77570.82', 77570.82],
    ['$ 1.500', 1500],
    ['1.500.000', 1500000],
    ['1.5', 1.5],
    ['1.50', 1.5],
    ['0,07', 0.07],
    ['1234,5', 1234.5],
    ['1500', 1500],
    ['  $ 2.000,00 ', 2000],
    ['€ 70,5', 70.5],
    ['0', 0],
    ['1.234.567,89', 1234567.89],
    ['10,', 10],
  ];
  for (const [text, expected] of casos) {
    it(`"${text}" -> ${expected}`, () => {
      expect(parsed(text)).toBe(expected);
    });
  }

  it('vacío o solo espacios/símbolos -> empty', () => {
    expect(parseMoneyInput('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseMoneyInput('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseMoneyInput('$')).toEqual({ ok: false, reason: 'empty' });
  });

  const invalidos = [
    'abc',
    '-5',
    '1,234,5',
    '1,2,3',
    '12a',
    '1.5.5',
    ',5',
    '.5',
    '1.500,5,0',
    '--1',
  ];
  for (const text of invalidos) {
    it(`"${text}" -> invalid`, () => {
      expect(parseMoneyInput(text)).toEqual({ ok: false, reason: 'invalid' });
    });
  }

  const demasiadosDecimales = ['10,555', '10.5555', '1.234,567', '0,001'];
  for (const text of demasiadosDecimales) {
    it(`"${text}" -> too_many_decimals`, () => {
      expect(parseMoneyInput(text)).toEqual({ ok: false, reason: 'too_many_decimals' });
    });
  }

  it('"1.500" es mil quinientos (convención es-AR) y "1.50" es uno con cincuenta', () => {
    expect(parsed('1.500')).toBe(1500);
    expect(parsed('1.50')).toBe(1.5);
  });

  it('el valor sale redondeado a centavos (sin residuo de float)', () => {
    expect(parsed('0,07')).toBe(0.07);
    expect(parsed('1.15')).toBe(1.15);
  });

  it('"1234.567" (miles mal agrupados, 3 decimales) -> invalid', () => {
    expect(parseMoneyInput('1234.567')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('puntos de miles mal agrupados con coma decimal -> invalid', () => {
    expect(parseMoneyInput('1.50,00')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('MONEY_PARSE_MESSAGES', () => {
  it('mensajes en español', () => {
    expect(MONEY_PARSE_MESSAGES.invalid).toBe('Importe inválido');
    expect(MONEY_PARSE_MESSAGES.too_many_decimals).toBe('Máximo 2 decimales');
  });
});

describe('formatMoneyNumber', () => {
  it('entero sin decimales', () => {
    expect(formatMoneyNumber(1500)).toBe('1.500');
    expect(formatMoneyNumber(0)).toBe('0');
  });

  it('con centavos: siempre 2 decimales', () => {
    expect(formatMoneyNumber(77570.82)).toBe('77.570,82');
    expect(formatMoneyNumber(1234.5)).toBe('1.234,50');
  });

  it('residuo de coma flotante', () => {
    expect(formatMoneyNumber(0.1 + 0.2)).toBe('0,30');
    expect(formatMoneyNumber(1500.0000000001)).toBe('1.500');
  });

  it('ida y vuelta con el parser', () => {
    expect(parsed(formatMoneyNumber(77570.82))).toBe(77570.82);
    expect(parsed(formatMoneyNumber(1500))).toBe(1500);
  });
});

describe('fractionDigitsFor', () => {
  it('0 para enteros (incluso con residuo), 2 si hay centavos', () => {
    expect(fractionDigitsFor(1500)).toBe(0);
    expect(fractionDigitsFor(1500.0000000001)).toBe(0);
    expect(fractionDigitsFor(0.5)).toBe(2);
    expect(fractionDigitsFor(-70.25)).toBe(2);
  });
});

describe('aritmética en centavos', () => {
  it('sumMoney no acumula error de float', () => {
    expect(sumMoney([33.33, 33.33, 33.33, 0.01])).toBe(100);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([])).toBe(0);
  });

  it('moneyEquals / compareMoney comparan en centavos', () => {
    expect(moneyEquals(0.1 + 0.2, 0.3)).toBe(true);
    expect(moneyEquals(10, 10.01)).toBe(false);
    expect(compareMoney(0.1 + 0.2, 0.3)).toBe(0);
    expect(compareMoney(1, 2)).toBe(-1);
    expect(compareMoney(2.01, 2)).toBe(1);
  });

  it('roundMoney / toCents / fromCents: redondeo simétrico y sin -0', () => {
    expect(roundMoney(0.125)).toBe(0.13);
    expect(roundMoney(-0.125)).toBe(-0.13);
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true);
    expect(toCents(77570.82)).toBe(7757082);
    expect(toCents(1.15)).toBe(115);
    expect(fromCents(115)).toBe(1.15);
  });
});
