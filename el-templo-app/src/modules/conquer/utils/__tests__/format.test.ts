import { describe, it, expect } from 'vitest'
import {
  CQ_TEXTOS,
  GREEK_STEP,
  LEVEL_INFO,
  calibrationText,
  canResolveCalibration,
  effortHint,
  estadoChip,
  failureHint,
  finisherLine,
  holdHelp,
  shortDate,
  techoText,
  unitText,
} from '../format'
import type { CalibrationProposal, Estado, Level, SessionTecho, StepKey } from '../../types'

describe('GREEK_STEP', () => {
  it.each([
    ['e1', 'Α'],
    ['e2', 'Β'],
    ['e3', 'Γ'],
    ['hold', 'Ω'],
  ] as const)('el escalón %s se escribe %s', (step, letter) => {
    expect(GREEK_STEP[step]).toBe(letter)
  })
})

// Fase 201 201-26 (anexo §9): los textos del modo, copiados A MANO al test (el app no lee el
// fixture del API). Si Nacho ajusta uno, se cambia en `format.ts` y acá, y en nada más.
const TEXTOS_DEL_ANEXO: [string, string][] = [
  ['boton_bloqueado', 'Quiero desbloquearlo'],
  ['confirmacion_pedido', 'Listo. Te contactamos para activarlo.'],
  [
    'leyenda_milon',
    'Milón de Crotona cargó un ternero todos los días. El ternero creció, y Milón con él, hasta cargar un toro.',
  ],
  ['nivel_ternero', 'Aprendés el método. Cortás una rep antes del fallo en cada escalón.'],
  ['nivel_novillo', 'Llegás al fallo en el último escalón de cada serie.'],
  ['nivel_toro', 'Los tres escalones al fallo. El método completo, con combos.'],
  ['fallo_rectos', 'Fallo técnico: cuando se rompe la línea del cuerpo.'],
  ['fallo_flexionados', 'Fallo muscular: cuando no podés más.'],
  ['ayuda_carga', 'Anotá la peor de tus 3 series.'],
  ['ayuda_hold', 'Hold final: al fallo. Anotá los segundos.'],
  ['ayuda_unilateral', 'Por lado: anotá el lado más flojo.'],
  ['finisher', '3 series, lejos del fallo (te tienen que quedar 4 o 5 reps).'],
  [
    'combo',
    'Press (sube y baja) → Push → Hold, al fallo. Anotá con qué progresión arrancaste y cuántas series completaste.',
  ],
  [
    'sabado_combo',
    '3 series a máxima progresión al fallo y 10 drops: si no sale, bajás la progresión y seguís.',
  ],
  ['calibracion_subir', 'Te quedó fácil: probá la progresión siguiente.'],
  ['calibracion_quedar', 'Estás bien ubicado.'],
  ['calibracion_bajar', 'Te quedó pesado: bajá una progresión.'],
  ['estado_techo1', 'Techo 1 de 2'],
  ['estado_bajo', 'Bajo el piso'],
  ['estado_rango', 'En rango'],
  ['estado_sin', 'Sin datos'],
  [
    'fin_sesion_techo',
    'Llegaste al techo en {ejercicio}, escalón {n}. Si lo repetís la próxima, subís de progresión.',
  ],
]

describe('CQ_TEXTOS (anexo §9)', () => {
  it('tiene exactamente las 22 claves del anexo que usa el app', () => {
    expect(Object.keys(CQ_TEXTOS).sort()).toEqual(TEXTOS_DEL_ANEXO.map(([key]) => key).sort())
    expect(TEXTOS_DEL_ANEXO).toHaveLength(22)
  })

  it.each(TEXTOS_DEL_ANEXO)('%s dice lo del anexo, byte a byte', (key, texto) => {
    expect(CQ_TEXTOS[key as keyof typeof CQ_TEXTOS]).toBe(texto)
  })
})

describe('LEVEL_INFO', () => {
  it.each([
    ['ternero', 'Aprendés el método. Cortás una rep antes del fallo en cada escalón.'],
    ['novillo', 'Llegás al fallo en el último escalón de cada serie.'],
    ['toro', 'Los tres escalones al fallo. El método completo, con combos.'],
  ] as const)('el texto de %s es el del anexo', (level, texto) => {
    expect(LEVEL_INFO[level].text).toBe(texto)
  })

  it.each([
    ['ternero', 'Legionario', 'Inicial'],
    ['novillo', 'Centurión', 'Intermedio'],
    ['toro', 'Espartano', 'Avanzado'],
  ] as const)('el nivel %s se llama %s (%s)', (level, name, kicker) => {
    expect(LEVEL_INFO[level].name).toBe(name)
    expect(LEVEL_INFO[level].kicker).toBe(kicker)
    expect(LEVEL_INFO[level].text.length).toBeGreaterThan(20)
  })
})

describe('unitText', () => {
  it.each([
    [4, 'reps', false, '4 reps'],
    [1, 'reps', false, '1 rep'],
    [0, 'reps', false, '0 reps'],
    [6, 's', false, '6 s'],
    [4, 'reps', true, '4 por lado'],
    [1, 'reps', true, '1 por lado'],
    [6, 's', true, '6 s por lado'],
  ] as const)('unitText(%i, %s, unilateral=%s) = %s', (value, unit, unilateral, expected) => {
    expect(unitText(value, unit, unilateral)).toBe(expected)
  })
})

describe('estadoChip', () => {
  it.each([
    ['subir', 'Subir de progresión', 'subir'],
    ['techo1', 'Techo 1 de 2', 'techo'],
    ['bajo', 'Bajo el piso', 'bajo'],
    ['rango', 'En rango', 'rango'],
    ['sin_datos', 'Sin datos', 'neutro'],
  ] as const)('el estado %s dice "%s" con tono %s', (estado, label, tone) => {
    expect(estadoChip(estado as Estado)).toEqual({ label, tone })
  })

  it('un escalón sin estado (el hold) se muestra neutro', () => {
    expect(estadoChip(null)).toEqual({ label: 'Sin datos', tone: 'neutro' })
  })
})

describe('effortHint', () => {
  it.each([
    ['ternero', 'e1', 'Dejá 1 rep'],
    ['ternero', 'e2', 'Dejá 1 rep'],
    ['ternero', 'e3', 'Dejá 1 rep'],
    ['ternero', 'hold', 'Cortá antes del fallo'],
    ['novillo', 'e1', 'Dejá 1 rep'],
    ['novillo', 'e2', 'Dejá 1 rep'],
    ['novillo', 'e3', 'Al fallo'],
    ['novillo', 'hold', 'Al fallo'],
    ['toro', 'e1', 'Al fallo'],
    ['toro', 'e2', 'Al fallo'],
    ['toro', 'e3', 'Al fallo'],
    ['toro', 'hold', 'Al fallo'],
  ] as const)('%s en %s: "%s"', (level, step, hint) => {
    expect(effortHint(level as Level, step as StepKey)).toBe(hint)
  })
})

describe('failureHint', () => {
  it('brazos rectos: fallo técnico, tal cual el anexo', () => {
    expect(failureHint(true)).toBe('Fallo técnico: cuando se rompe la línea del cuerpo.')
  })

  it('brazos flexionados: fallo muscular, tal cual el anexo', () => {
    expect(failureHint(false)).toBe('Fallo muscular: cuando no podés más.')
  })
})

describe('holdHelp (DA-14)', () => {
  it.each([
    ['ternero', 'Hold final: cortá antes del fallo. Anotá los segundos.'],
    ['novillo', 'Hold final: al fallo. Anotá los segundos.'],
    ['toro', 'Hold final: al fallo. Anotá los segundos.'],
  ] as const)('%s: "%s"', (level, expected) => {
    expect(holdHelp(level as Level)).toBe(expected)
  })
})

describe('finisherLine', () => {
  it('el finisher del día y la ayuda del anexo', () => {
    expect(finisherLine('Fondos o push-ups, 15–20 reps')).toBe(
      'Fondos o push-ups, 15–20 reps · 3 series, lejos del fallo (te tienen que quedar 4 o 5 reps).',
    )
  })
})

describe('techoText', () => {
  it.each([
    ['e1', '1'],
    ['e2', '2'],
    ['e3', '3'],
  ] as const)('el escalón %s dice "escalón %s"', (step, n) => {
    const item: SessionTecho = { exerciseName: 'Planche press', step }
    expect(techoText(item)).toBe(
      `Llegaste al techo en Planche press, escalón ${n}. Si lo repetís la próxima, subís de progresión.`,
    )
  })
})

describe('shortDate', () => {
  it.each([
    ['2026-10-21', '21/10'],
    ['2026-01-05', '5/1'],
    ['2026-12-31', '31/12'],
  ] as const)('shortDate(%s) = %s', (iso, expected) => {
    expect(shortDate(iso)).toBe(expected)
  })
})

function proposal(
  kind: CalibrationProposal['proposal'],
  toRungName: string | null,
): CalibrationProposal {
  return {
    exerciseId: 4,
    exerciseName: 'Front lever hold',
    proposal: kind,
    fromRungName: 'full',
    toRungName,
  }
}

describe('calibrationText', () => {
  it.each([
    [
      proposal('subir', 'half lay'),
      'Front lever hold · Te quedó fácil: probá la progresión siguiente. (half lay)',
    ],
    [
      proposal('bajar', 'adv tuck'),
      'Front lever hold · Te quedó pesado: bajá una progresión. (adv tuck)',
    ],
    [proposal('quedarse', null), 'Front lever hold · Estás bien ubicado.'],
    [
      proposal('subir', null),
      'Front lever hold · Te quedó fácil, pero ya estás en la progresión más difícil.',
    ],
    [
      proposal('bajar', null),
      'Front lever hold · Te quedó pesado, pero ya estás en la progresión más fácil.',
    ],
  ] as const)('%j', (item, expected) => {
    expect(calibrationText({ ...item })).toBe(expected)
  })
})

describe('canResolveCalibration', () => {
  it.each([
    [proposal('subir', 'half lay'), true],
    [proposal('bajar', 'adv tuck'), true],
    [proposal('quedarse', null), false],
    [proposal('subir', null), false],
    [proposal('bajar', null), false],
  ] as const)('%j -> %s', (item, expected) => {
    expect(canResolveCalibration({ ...item })).toBe(expected)
  })
})
