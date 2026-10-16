import { describe, it, expect } from 'vitest'
import {
  nextUnanswered,
  answeredCount,
  answerLabel,
  summaryParts,
  weekDots,
  sessionsThisWeek,
  dotAriaLabel,
  sessionsTotalCaption,
  type CheckInAnswers,
} from '../check-in-summary'
import { CHECK_IN_QUESTIONS } from '../../types'

const soreness = CHECK_IN_QUESTIONS.find((q) => q.type === 'soreness')!
const energy = CHECK_IN_QUESTIONS.find((q) => q.type === 'energy')!
const sleep = CHECK_IN_QUESTIONS.find((q) => q.type === 'sleep')!
const ORDERED = [soreness, sleep, energy]

function answers(over: Partial<CheckInAnswers> = {}): CheckInAnswers {
  return { energy: null, soreness: null, sleep: null, ...over }
}

describe('nextUnanswered / answeredCount', () => {
  it('sin respuestas devuelve la primera del orden', () => {
    expect(nextUnanswered(ORDERED, answers())?.type).toBe('soreness')
    expect(answeredCount(ORDERED, answers())).toBe(0)
  })

  it('salta las respondidas y respeta el orden', () => {
    const a = answers({ soreness: { value: 'ninguna', bodyArea: null } })
    expect(nextUnanswered(ORDERED, a)?.type).toBe('sleep')
    expect(answeredCount(ORDERED, a)).toBe(1)
  })

  it('devuelve la primera sin responder aunque haya respondidas más adelante', () => {
    const a = answers({ sleep: { value: 'bien', bodyArea: null } })
    expect(nextUnanswered(ORDERED, a)?.type).toBe('soreness')
  })

  it('con las tres respondidas devuelve null', () => {
    const a = answers({
      energy: { value: 'alto', bodyArea: null },
      soreness: { value: 'ninguna', bodyArea: null },
      sleep: { value: 'ok', bodyArea: null },
    })
    expect(nextUnanswered(ORDERED, a)).toBeNull()
    expect(answeredCount(ORDERED, a)).toBe(3)
  })
})

describe('answerLabel', () => {
  it.each([
    ['energy', 'bajo', 'Energía: bajo'],
    ['energy', 'normal', 'Energía: normal'],
    ['energy', 'alto', 'Energía: bien'],
    ['soreness', 'ninguna', 'Sin molestias'],
    ['soreness', 'leve', 'Molestia leve'],
    ['soreness', 'moderada', 'Molestia moderada'],
    ['sleep', 'mal', 'Dormiste mal'],
    ['sleep', 'ok', 'Dormiste ok'],
    ['sleep', 'bien', 'Dormiste bien'],
  ] as const)('%s/%s -> %s', (type, value, expected) => {
    expect(answerLabel(type, value, null)).toBe(expected)
  })

  it('agrega la zona del cuerpo solo en molestia leve/moderada', () => {
    expect(answerLabel('soreness', 'leve', 'hombros')).toBe('Molestia leve (hombros)')
    expect(answerLabel('soreness', 'moderada', 'espalda')).toBe('Molestia moderada (espalda)')
    expect(answerLabel('soreness', 'ninguna', 'hombros')).toBe('Sin molestias')
    expect(answerLabel('energy', 'alto', 'hombros')).toBe('Energía: bien')
  })

  it('un valor desconocido se muestra tal cual', () => {
    expect(answerLabel('energy', 'raro', null)).toBe('raro')
  })
})

describe('CHECK_IN_QUESTIONS (UAT D16/D18)', () => {
  it('energía: etiquetas Bajo/Normal/Bien con los valores guardados intactos (T-199-65)', () => {
    expect(energy.options.map((o) => o.label)).toEqual(['Bajo', 'Normal', 'Bien'])
    expect(energy.options.map((o) => o.value)).toEqual(['bajo', 'normal', 'alto'])
  })

  it('las 3 preguntas hablan de hoy', () => {
    for (const q of CHECK_IN_QUESTIONS) expect(q.question).toMatch(/\bhoy\?$/)
  })

  it.each(energy.options.map((o) => [o.value, o.label] as const))(
    'el resumen de energía %s usa la misma etiqueta que el botón (C4)',
    (value, label) => {
      expect(answerLabel('energy', value, null)).toBe(`Energía: ${label.toLowerCase()}`)
    },
  )
})

describe('summaryParts', () => {
  it('energía alta, sin molestias y dormiste bien, en el orden de las preguntas', () => {
    const a = answers({
      energy: { value: 'alto', bodyArea: null },
      soreness: { value: 'ninguna', bodyArea: null },
      sleep: { value: 'bien', bodyArea: null },
    })
    expect(summaryParts(CHECK_IN_QUESTIONS, a)).toEqual([
      'Energía: bien',
      'Sin molestias',
      'Dormiste bien',
    ])
  })

  it('respeta el orden de las preguntas', () => {
    const a = answers({
      energy: { value: 'normal', bodyArea: null },
      soreness: { value: 'leve', bodyArea: 'core' },
      sleep: { value: 'bien', bodyArea: null },
    })
    expect(summaryParts(ORDERED, a)).toEqual([
      'Molestia leve (core)',
      'Dormiste bien',
      'Energía: normal',
    ])
  })

  it('omite las sin responder', () => {
    const a = answers({ energy: { value: 'bajo', bodyArea: null } })
    expect(summaryParts(ORDERED, a)).toEqual(['Energía: bajo'])
  })
})

describe('weekDots / sessionsThisWeek', () => {
  // Semana lunes 2026-10-12 .. domingo 2026-10-18; hoy jueves 15.
  const WEEK = '2026-10-12'

  it('arma 7 puntos L..D con hoy y entrenados lunes/martes', () => {
    const dots = weekDots(WEEK, '2026-10-15', ['2026-10-12', '2026-10-13'])
    expect(dots.map((d) => d.letter).join('')).toBe('LMMJVSD')
    expect(dots.map((d) => d.date)[0]).toBe('2026-10-12')
    expect(dots[6].date).toBe('2026-10-18')
    expect(dots.map((d) => d.trained)).toEqual([true, true, false, false, false, false, false])
    expect(dots.map((d) => d.isToday)).toEqual([false, false, false, true, false, false, false])
  })

  it('hoy puede ser un día entrenado', () => {
    const dots = weekDots(WEEK, '2026-10-15', ['2026-10-15'])
    expect(dots[3]).toMatchObject({ trained: true, isToday: true })
  })

  it('si hoy cae en otra semana ningún punto queda como hoy', () => {
    expect(weekDots(WEEK, '2026-10-20', []).some((d) => d.isToday)).toBe(false)
  })

  it('cruza el fin de mes sin saltear días', () => {
    const dots = weekDots('2026-10-26', '2026-10-26', [])
    expect(dots.map((d) => d.date)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ])
  })

  it('no cuenta fechas de otra semana ni duplicadas', () => {
    const dates = ['2026-10-11', '2026-10-12', '2026-10-12', '2026-10-18', '2026-10-19']
    expect(sessionsThisWeek(WEEK, dates)).toBe(2)
  })

  it('sin fechas es 0', () => {
    expect(sessionsThisWeek(WEEK, [])).toBe(0)
  })
})

describe('dotAriaLabel', () => {
  it('describe día, número, hoy y si entrenó', () => {
    const dots = weekDots('2026-10-12', '2026-10-15', ['2026-10-12'])
    expect(dotAriaLabel(dots[0], 0)).toBe('lunes 12: entrenaste')
    expect(dotAriaLabel(dots[3], 3)).toBe('jueves 15 (hoy): no entrenaste')
    expect(dotAriaLabel(dots[2], 2)).toBe('miércoles 14: no entrenaste')
  })
})

describe('sessionsTotalCaption', () => {
  it('total -> "sesiones en total"', () => {
    expect(sessionsTotalCaption('total', 42)).toBe('sesiones en total')
  })

  it('templo -> "sesiones en El Templo"', () => {
    expect(sessionsTotalCaption('templo', 42)).toBe('sesiones en El Templo')
  })

  it('con 1 va en singular en ambas variantes', () => {
    expect(sessionsTotalCaption('total', 1)).toBe('sesión en total')
    expect(sessionsTotalCaption('templo', 1)).toBe('sesión en El Templo')
  })

  it('con 0 va en plural', () => {
    expect(sessionsTotalCaption('total', 0)).toBe('sesiones en total')
  })
})
