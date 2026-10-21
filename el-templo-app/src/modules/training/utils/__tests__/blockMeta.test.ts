import { describe, it, expect } from 'vitest'
import type { Block, BlockRole, Prescription, Session } from '../../types/session'
import {
  blockDisplayName,
  blockMetaLine,
  declaredMinutes,
  defaultBlockIndex,
  estimatedMinutes,
  figureZones,
  formatLabel,
  keepHyphenWords,
  sessionTitle,
} from '../blockMeta'

function rx(fields: Partial<Prescription>): Prescription {
  return {
    exerciseId: 1,
    exerciseName: 'EJ',
    contraction: 'CON',
    reps: 10,
    repsMax: null,
    seconds: null,
    secondsMax: null,
    increment: null,
    rest: 30,
    notes: null,
    sortOrder: 0,
    videoUrl: null,
    ...fields,
  }
}

function block(fields: Partial<Block>): Block {
  return {
    blockId: 'b1',
    role: 'NUCLEUS',
    route: 'PL',
    pattern: 'General',
    intensity: 5,
    repsBudget: 0,
    format: 'Cluster',
    formatParams: { type: 'cluster' },
    formatDescription: null,
    sortOrder: 0,
    exercises: [rx({}), rx({}), rx({})],
    mobilityExercise: null,
    ...fields,
  }
}

function session(roles: Array<[BlockRole, string]>): Session {
  return {
    dayId: 'W1-lunes-alfa',
    week: 1,
    day: 'lunes',
    levelGroup: 'alfa',
    blockCount: roles.length,
    blocks: roles.map(([role, route], i) => block({ role, route, sortOrder: i })),
  }
}

describe('formatLabel (D-11)', () => {
  it('AMRAP Series: 3 rondas dentro de 10 minutos', () => {
    expect(
      formatLabel({
        format: 'AMRAP Series',
        formatParams: { type: 'amrap_series', rounds: 3, minutes: 10 },
      }),
    ).toBe("AMRAP · 10' · 3 rondas")
  })

  it('AMRAP simple y una sola ronda', () => {
    expect(formatLabel({ format: 'AMRAP', formatParams: { type: 'amrap', minutes: 10 } })).toBe(
      "AMRAP · 10'",
    )
    expect(
      formatLabel({
        format: 'AMRAP Series',
        formatParams: { type: 'amrap_series', rounds: 1, minutes: 10 },
      }),
    ).toBe("AMRAP · 10' · 1 ronda")
  })

  it('EMOM con minutos totales', () => {
    expect(formatLabel({ format: 'EMOM', formatParams: { type: 'emom', totalMinutes: 3 } })).toBe(
      "EMOM · 3'",
    )
  })

  it('el nombre con guion no se corta', () => {
    expect(
      formatLabel({ format: 'Buy-in / Cash-out', formatParams: { type: 'buy_in_cash_out' } }),
    ).toBe('Buy-in / Cash-out')
  })

  it('sin formatParams devuelve solo el nombre', () => {
    expect(formatLabel({ format: 'Singlet', formatParams: null })).toBe('Singlet')
  })
})

describe('declaredMinutes y estimatedMinutes', () => {
  it('cluster no declara minutos', () => {
    expect(declaredMinutes({ type: 'cluster', clusterSize: 3 })).toBeNull()
    expect(declaredMinutes(null)).toBeNull()
  })

  it('declara por tipo', () => {
    expect(declaredMinutes({ type: 'amrap_series', rounds: 3, minutes: 10 })).toBe(10)
    expect(declaredMinutes({ type: 'emom', totalMinutes: 3 })).toBe(3)
    expect(declaredMinutes({ type: 'for_time' })).toBeNull()
    expect(declaredMinutes({ type: 'for_time', timeCapMinutes: 8 })).toBe(8)
    expect(declaredMinutes({ type: 'open_style', minutes: 'x' })).toBeNull()
  })

  it('3 ejercicios de 10 reps con rest 30 y 2 rondas dan 6 minutos', () => {
    const b = block({ formatParams: { type: 'complex', rounds: 2 } })
    expect(estimatedMinutes(b)).toBe(6)
  })

  it('usa los segundos prescriptos cuando hay y totalRounds', () => {
    const b = block({
      exercises: [rx({ reps: null, seconds: 45, rest: 15 })],
      formatParams: { type: 'i_go_you_go', totalRounds: 4 },
    })
    expect(estimatedMinutes(b)).toBe(4)
  })

  it('mínimo 1 minuto', () => {
    expect(estimatedMinutes(block({ exercises: [rx({ reps: 1, rest: 0 })] }))).toBe(1)
    expect(estimatedMinutes(block({ exercises: [] }))).toBe(1)
  })
})

describe('blockMetaLine', () => {
  it('AMRAP Series con grupos', () => {
    const b = block({
      format: 'AMRAP Series',
      formatParams: { type: 'amrap_series', rounds: 3, minutes: 10 },
      exercises: [rx({}), rx({}), rx({}), rx({})],
      groups: ['hombros', 'brazos'],
    })
    expect(blockMetaLine(b, { withEstimate: true })).toBe(
      "AMRAP · 10' · 3 rondas · 4 ejercicios · Hombros, Brazos",
    )
  })

  it('con estimación y sin minutos declarados suma ≈N', () => {
    const b = block({ groups: ['piernas'] })
    expect(blockMetaLine(b, { withEstimate: true })).toBe("Cluster · ≈3' · 3 ejercicios · Piernas")
    expect(blockMetaLine(b, { withEstimate: false })).not.toContain('≈')
  })

  it('un solo ejercicio va en singular y sin grupos se omiten', () => {
    const b = block({ exercises: [rx({})] })
    expect(blockMetaLine(b, { withEstimate: false })).toBe('Cluster · 1 ejercicio')
  })

  it('deriva los grupos de las zonas si el payload no trae groups', () => {
    const b = block({ zones: ['deltoids', 'biceps'] })
    expect(blockMetaLine(b, { withEstimate: false })).toBe(
      'Cluster · 3 ejercicios · Hombros, Brazos',
    )
  })
})

describe('blockDisplayName y sessionTitle', () => {
  it('INITIUM es Entrada en calor', () => {
    expect(blockDisplayName({ role: 'INITIUM', route: 'PL' })).toBe('Entrada en calor')
  })

  it('ROM es Movilidad · ROM y TECNICA usa el rótulo del rol', () => {
    expect(blockDisplayName({ role: 'ROM_LOWER', route: 'MOVILIDAD' })).toBe('Movilidad · ROM')
    expect(blockDisplayName({ role: 'TECNICA_I', route: 'PL' })).toBe('Técnica I')
  })

  it('el resto usa la etiqueta de la ruta', () => {
    expect(blockDisplayName({ role: 'NUCLEUS', route: 'PL' })).toBe('Planche')
  })

  it('sesión con ROM_* es Movilidad', () => {
    expect(sessionTitle(session([['ROM_LOWER', 'MOVILIDAD']]))).toBe('Movilidad')
  })

  it('usa la ruta del NUCLEUS y, sin NUCLEUS, la del primer bloque', () => {
    expect(
      sessionTitle(
        session([
          ['INITIUM', 'FL'],
          ['NUCLEUS', 'PL'],
        ]),
      ),
    ).toBe('Planche')
    expect(
      sessionTitle(
        session([
          ['INITIUM', 'FL'],
          ['ATHLOS', 'PL'],
        ]),
      ),
    ).toBe('Front Lever')
  })

  it('sesión sin bloques: título vacío', () => {
    expect(sessionTitle(session([]))).toBe('')
  })
})

describe('defaultBlockIndex', () => {
  it('prefiere el NUCLEUS', () => {
    const blocks = [
      block({ role: 'INITIUM' }),
      block({ role: 'NUCLEUS' }),
      block({ role: 'DEUTEROS_1' }),
    ]
    expect(defaultBlockIndex(blocks)).toBe(1)
  })

  it('sin NUCLEUS, el primero que no sea INITIUM', () => {
    expect(defaultBlockIndex([block({ role: 'INITIUM' }), block({ role: 'ATHLOS' })])).toBe(1)
  })

  it('solo INITIUM o vacío: 0', () => {
    expect(defaultBlockIndex([block({ role: 'INITIUM' })])).toBe(0)
    expect(defaultBlockIndex([])).toBe(0)
  })
})

describe('figureZones', () => {
  const blocks = [
    block({ role: 'INITIUM', zones: ['abs'] }),
    block({ role: 'NUCLEUS', zones: ['chest', 'triceps'] }),
    block({ role: 'DEUTEROS_1', zones: ['triceps', 'deltoids'] }),
  ]

  it('lit = zonas del elegido; lit2 = las de los otros sin las del elegido', () => {
    const { lit, lit2 } = figureZones(blocks, 1)
    expect(lit).toEqual(['chest', 'triceps'])
    expect([...lit2].sort()).toEqual(['abs', 'deltoids'])
  })

  it('bloques sin zonas o índice fuera de rango no rompen', () => {
    expect(figureZones([block({})], 0)).toEqual({ lit: [], lit2: [] })
    expect(figureZones(blocks, 9).lit).toEqual([])
  })
})

describe('keepHyphenWords', () => {
  it('no ofrece corte en el guion de Buy-in / Cash-out (word joiner)', () => {
    const out = keepHyphenWords('Front Lever Pull Ups · Buy-in / Cash-out')
    expect(out).toBe('Front Lever Pull Ups · Buy-\u2060in / Cash-\u2060out')
    expect(out.replace(/\u2060/g, '')).toBe('Front Lever Pull Ups · Buy-in / Cash-out')
  })

  it('deja igual el resto de los textos', () => {
    expect(keepHyphenWords("AMRAP · 10' · 3 rondas")).toBe("AMRAP · 10' · 3 rondas")
  })
})
