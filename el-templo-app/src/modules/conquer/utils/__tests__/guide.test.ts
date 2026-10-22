import { describe, it, expect } from 'vitest'
import { CQ_TEXTOS, LEVEL_INFO, holdHelp } from '../format'
import {
  GUIDE_CEILING,
  GUIDE_FAILURE_EXAMPLES,
  GUIDE_FLOOR,
  GUIDE_PAIN_MIN,
  guideLevelLine,
  guideScreens,
  plainRuns,
} from '../guide'
import type { GuideKey, GuideScreen } from '../guide'
import type { Level } from '../../types'

// Fase 201 DA-24: contenido de la guía. Los textos del anexo §9 salen de `CQ_TEXTOS`/`holdHelp`
// (el test los importa; `format.test.ts` es el que los tiene copiados a mano).

const ORDEN_TORO: GuideKey[] = ['serie', 'numero', 'apretar', 'apertura', 'subir', 'molestia']
const ORDEN_SIN_APERTURA: GuideKey[] = ['serie', 'numero', 'apretar', 'subir', 'molestia']

function screen(level: Level | null, key: GuideKey): GuideScreen {
  const found = guideScreens(level).find((s) => s.key === key)
  if (!found) throw new Error(`falta la pantalla ${key}`)
  return found
}

describe('guideScreens: cuántas pantallas y en qué orden', () => {
  it('Toro tiene 6 pantallas, con "Apertura y sábado" en cuarto lugar', () => {
    expect(guideScreens('toro').map((s) => s.key)).toEqual(ORDEN_TORO)
  })

  it.each([['novillo' as Level | null], ['ternero' as Level | null], [null]])(
    'con nivel %s hay 5 pantallas, sin "Apertura y sábado"',
    (level) => {
      expect(guideScreens(level).map((s) => s.key)).toEqual(ORDEN_SIN_APERTURA)
    },
  )
})

describe('guideScreens: pantallas completas', () => {
  it.each([
    ['toro' as Level | null],
    ['novillo' as Level | null],
    ['ternero' as Level | null],
    [null],
  ])(
    'con nivel %s todas tienen título, descripción del dibujo y texto, sin "undefined"',
    (level) => {
      for (const s of guideScreens(level)) {
        expect(s.title.length, s.key).toBeGreaterThan(0)
        expect(s.artLabel.length, s.key).toBeGreaterThan(0)
        expect(s.lead.length, s.key).toBeGreaterThan(0)
        const all = `${s.title} ${s.artLabel} ${plainRuns(s.lead)} ${plainRuns(s.foot)}`
        expect(all, s.key).not.toContain('undefined')
      }
    },
  )

  it('es una función pura: dos llamadas dan el mismo contenido', () => {
    expect(guideScreens('toro')).toEqual(guideScreens('toro'))
  })
})

describe('pantalla 2 "numero": lo que se anota', () => {
  it('el lead abre con la ayuda de carga del anexo, en énfasis', () => {
    const lead = screen('toro', 'numero').lead
    expect(plainRuns(lead)).toContain(CQ_TEXTOS.ayuda_carga)
    expect(lead[0]).toEqual({ text: CQ_TEXTOS.ayuda_carga, strong: true })
  })

  it.each(['ternero', 'novillo', 'toro'] as const)(
    'el foot de %s trae la ayuda del hold de su nivel y la de por lado',
    (level) => {
      const foot = plainRuns(screen(level, 'numero').foot)
      expect(foot).toContain(holdHelp(level))
      expect(foot).toContain(CQ_TEXTOS.ayuda_unilateral)
    },
  )

  it('Ternero corta antes del fallo en el hold; Toro no', () => {
    const ternero = plainRuns(screen('ternero', 'numero').foot)
    const toro = plainRuns(screen('toro', 'numero').foot)
    expect(ternero).not.toContain(CQ_TEXTOS.ayuda_hold)
    expect(toro).toContain(CQ_TEXTOS.ayuda_hold)
  })

  it('sin nivel usa la ayuda general del hold', () => {
    expect(plainRuns(screen(null, 'numero').foot)).toContain(CQ_TEXTOS.ayuda_hold)
  })
})

describe('pantalla 3 "apretar": los otros niveles', () => {
  it('Toro ve a Ternero y a Novillo, y NO su propio nivel', () => {
    const foot = plainRuns(screen('toro', 'apretar').foot)
    expect(foot).toContain(`Ternero: ${LEVEL_INFO.ternero.text}`)
    expect(foot).toContain(`Novillo: ${LEVEL_INFO.novillo.text}`)
    expect(foot).not.toContain(LEVEL_INFO.toro.text)
  })

  it.each([
    ['ternero', ['novillo', 'toro']],
    ['novillo', ['ternero', 'toro']],
  ] as const)('%s ve a %j y NO su propio nivel', (level, others) => {
    const foot = plainRuns(screen(level, 'apretar').foot)
    for (const other of others) {
      expect(foot).toContain(LEVEL_INFO[other].text)
    }
    expect(foot).not.toContain(LEVEL_INFO[level].text)
  })

  it('sin nivel el foot queda vacío', () => {
    expect(screen(null, 'apretar').foot).toEqual([])
  })
})

describe('guideLevelLine', () => {
  it.each(['ternero', 'novillo', 'toro'] as const)('%s: "Sos X" y el texto del nivel', (level) => {
    expect(guideLevelLine(level)).toEqual({
      title: `Sos ${LEVEL_INFO[level].name}`,
      text: LEVEL_INFO[level].text,
    })
  })

  it('sin nivel no hay línea', () => {
    expect(guideLevelLine(null)).toBeNull()
  })
})

describe('pantalla 4 "apertura" (solo Toro)', () => {
  it('el foot es exactamente el texto del combo del anexo', () => {
    expect(screen('toro', 'apertura').foot).toEqual([{ text: CQ_TEXTOS.combo }])
  })
})

describe('pantalla 5 "subir"', () => {
  it('el techo sale de las constantes del anexo §7: 8 reps o 12 s', () => {
    expect(GUIDE_CEILING).toEqual({ reps: 8, s: 12 })
    expect(plainRuns(screen('toro', 'subir').lead)).toContain('8 reps o 12 s')
  })

  it('pide techo dos sesiones seguidas, en énfasis', () => {
    expect(screen('toro', 'subir').lead).toContainEqual({
      text: 'techo dos sesiones seguidas',
      strong: true,
    })
  })

  it('Subir de un escalón se toca en Progreso, y si suben dos va primero el escalón 1', () => {
    const foot = plainRuns(screen('toro', 'subir').foot)
    expect(foot).toContain('Progreso')
    expect(foot).toContain('escalón 1')
    expect(foot).not.toContain('en Hoy')
  })
})

describe('pantalla 6 "molestia"', () => {
  it('la escala es de 0 a 10', () => {
    expect(plainRuns(screen('toro', 'molestia').lead)).toContain('0 a 10')
  })

  it('el coach la ve desde GUIDE_PAIN_MIN (4)', () => {
    expect(GUIDE_PAIN_MIN).toBe(4)
    expect(plainRuns(screen('toro', 'molestia').foot)).toContain('4 o más')
    expect(screen('toro', 'molestia').artLabel).toContain('desde 4')
  })
})

describe('constantes del anexo', () => {
  it('piso 3 reps o 4 s (§7)', () => {
    expect(GUIDE_FLOOR).toEqual({ reps: 3, s: 4 })
  })

  it('ejemplos de fallo por tipo de ejercicio (§1)', () => {
    expect(GUIDE_FAILURE_EXAMPLES).toEqual({
      rectos: 'Planche hold, planche press, front lever.',
      flexionados: 'HSPU, dominadas, muscle-up.',
    })
  })
})
