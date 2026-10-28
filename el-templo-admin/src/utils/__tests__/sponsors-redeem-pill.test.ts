// El admin no tiene vitest instalado (sin runner propio): se corre con el binario de la app,
// `../el-templo-app/node_modules/.bin/vitest run --config <cfg>` con un config mínimo que apunte
// `root` al admin y defina el alias `src` -> `el-templo-admin/src` (este archivo importa `src/...`).
// @ts-expect-error vitest no se resuelve desde el admin; si se instala, borrar esta línea.
import { describe, it, expect } from 'vitest';
import { sponsorRedeemPill } from '../sponsors';

describe('sponsorRedeemPill — espejo de la app (REVIEW-admin WR-04)', () => {
  it('código y socio con plan → sell + el código', () => {
    expect(sponsorRedeemPill({ redeemType: 'code', redeemCode: 'TEMPLO20' }, true)).toEqual({
      icon: 'sell',
      label: 'TEMPLO20',
    });
  });

  it('código y socio SIN plan → candado + "Socios con plan"', () => {
    expect(sponsorRedeemPill({ redeemType: 'code', redeemCode: 'TEMPLO20' }, false)).toEqual({
      icon: 'lock',
      label: 'Socios con plan',
    });
  });

  it('código vacío o en blanco, aun con plan → candado (la app no tiene nada que mostrar)', () => {
    expect(sponsorRedeemPill({ redeemType: 'code', redeemCode: null }, true).icon).toBe('lock');
    expect(sponsorRedeemPill({ redeemType: 'code', redeemCode: '   ' }, true).icon).toBe('lock');
  });

  it('carnet → "Mostrá tu carnet" con y sin plan', () => {
    for (const canRedeem of [true, false]) {
      expect(sponsorRedeemPill({ redeemType: 'carnet', redeemCode: null }, canRedeem)).toEqual({
        icon: 'card_membership',
        label: 'Mostrá tu carnet',
      });
    }
  });

  it('recorta espacios del código', () => {
    expect(sponsorRedeemPill({ redeemType: 'code', redeemCode: ' AB1 ' }, true).label).toBe('AB1');
  });
});
