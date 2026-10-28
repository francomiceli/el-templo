import { describe, expect, it } from 'vitest'
import type { PlanHistoryItem, PlanSummary, PlanSummaryItem } from '../../types'
import {
  buildPlanTimeline,
  type CurrentNode,
  type EmptyNode,
  type GapNode,
  type NextNode,
  type PlanTimelineModel,
} from '../plan-timeline'

// Todo relativo al año en curso: el test no vence con el calendario.
const Y = new Date().getFullYear()
const TODAY = `${Y}-10-28`
const d = (mmdd: string, year = Y): string => `${year}-${mmdd}`

function item(over: Partial<PlanSummaryItem> = {}): PlanSummaryItem {
  return {
    id: 1,
    planId: 10,
    planName: 'Mensual 3x semana',
    planCategory: 'regular',
    status: 'active',
    startDate: d('10-20'),
    endDate: d('11-19'),
    pauseEndDate: null,
    classesPerWeek: 3,
    classesRemaining: null,
    classesBudget: null,
    isNew: false,
    ...over,
  }
}

function summary(over: Partial<PlanSummary> = {}): PlanSummary {
  return { current: null, next: null, history: [], hasUnseen: false, ...over }
}

const hist = (over: Partial<PlanHistoryItem> = {}): PlanHistoryItem => ({
  id: 99,
  planName: 'Libre mensual',
  startDate: d('09-01'),
  endDate: d('09-30'),
  ...over,
})

function nodes(model: PlanTimelineModel) {
  if (model.kind !== 'timeline') throw new Error(`se esperaba timeline, vino ${model.kind}`)
  return model.nodes
}
const current = (model: PlanTimelineModel) =>
  nodes(model).find((n) => n.kind === 'current') as CurrentNode
const next = (model: PlanTimelineModel) => nodes(model).find((n) => n.kind === 'next') as NextNode
const gap = (model: PlanTimelineModel) => nodes(model).find((n) => n.kind === 'gap') as GapNode
const empty = (model: PlanTimelineModel) =>
  nodes(model).find((n) => n.kind === 'empty') as EmptyNode

describe('buildPlanTimeline · plan actual', () => {
  it('solo actual con muchos días: clases por semana, rango, días y barra', () => {
    const m = buildPlanTimeline(summary({ current: item({ endDate: d('11-19') }) }), TODAY)
    expect(m.kind).toBe('timeline')
    expect(nodes(m).map((n) => n.kind)).toEqual(['current'])
    const c = current(m)
    expect(c.name).toBe('Mensual 3x semana')
    expect(c.meta).toBe('3 clases por semana')
    expect(c.period).toBe('Del 20 oct al 19 nov · quedan 22 días')
    // quedan 22 de 30 días
    expect(c.progress).toBe(73)
    expect(c.pill).toBeNull()
  })

  it('"1 clase por semana" en singular y sin meta si el plan no trae clases', () => {
    expect(
      current(buildPlanTimeline(summary({ current: item({ classesPerWeek: 1 }) }), TODAY)).meta,
    ).toBe('1 clase por semana')
    expect(
      current(buildPlanTimeline(summary({ current: item({ classesPerWeek: null }) }), TODAY)).meta,
    ).toBeNull()
  })

  it('queda 1 día', () => {
    const c = current(buildPlanTimeline(summary({ current: item({ endDate: d('10-29') }) }), TODAY))
    expect(c.period).toBe('Del 20 oct al 29 oct · queda 1 día')
  })

  it('vence hoy', () => {
    const c = current(buildPlanTimeline(summary({ current: item({ endDate: d('10-28') }) }), TODAY))
    expect(c.period).toBe('Del 20 oct al 28 oct · vence hoy')
    expect(c.progress).toBe(0)
    expect(c.pill).toEqual({ text: 'Vence pronto', tone: 'low', icon: 'schedule' })
  })

  it('"Vence pronto" con 3 días, no con 4', () => {
    const tres = current(
      buildPlanTimeline(summary({ current: item({ endDate: d('10-31') }) }), TODAY),
    )
    expect(tres.pill?.text).toBe('Vence pronto')
    const cuatro = current(
      buildPlanTimeline(summary({ current: item({ endDate: d('11-01') }) }), TODAY),
    )
    expect(cuatro.pill).toBeNull()
  })

  it('sin fecha de fin: "Desde el …", sin barra y sin pill', () => {
    const c = current(buildPlanTimeline(summary({ current: item({ endDate: null }) }), TODAY))
    expect(c.period).toBe('Desde el 20 oct')
    expect(c.progress).toBeNull()
    expect(c.pill).toBeNull()
  })

  it('cruza de año: el año aparece solo en la fecha de otro año', () => {
    const c = current(
      buildPlanTimeline(summary({ current: item({ endDate: d('01-15', Y + 1) }) }), TODAY),
    )
    expect(c.period).toBe(`Del 20 oct al 15 ene ${Y + 1} · quedan 79 días`)
  })

  it('barra: 100% el primer día del período y nunca fuera de 0..100', () => {
    const primero = current(
      buildPlanTimeline(
        summary({ current: item({ startDate: TODAY, endDate: d('11-27') }) }),
        TODAY,
      ),
    )
    expect(primero.progress).toBe(100)
    const raro = current(
      buildPlanTimeline(
        summary({ current: item({ startDate: d('11-10'), endDate: d('11-20') }) }),
        TODAY,
      ),
    )
    expect(raro.progress).toBe(100)
    const mismoDia = current(
      buildPlanTimeline(
        summary({ current: item({ startDate: d('10-28'), endDate: d('10-28') }) }),
        TODAY,
      ),
    )
    expect(mismoDia.progress).toBe(0)
  })

  it('status scheduled con inicio ya llegado se dibuja como actual', () => {
    const c = current(buildPlanTimeline(summary({ current: item({ status: 'scheduled' }) }), TODAY))
    expect(c.pill).toBeNull()
  })
})

describe('buildPlanTimeline · pausa', () => {
  it('con pauseEndDate: "En pausa hasta el …" (ocre), sin "Vence pronto"', () => {
    const c = current(
      buildPlanTimeline(
        summary({
          current: item({ status: 'paused', pauseEndDate: d('11-05'), endDate: d('10-30') }),
        }),
        TODAY,
      ),
    )
    expect(c.pill).toEqual({ text: 'En pausa hasta el 5 nov', tone: 'mid', icon: 'pause' })
  })

  it('sin pauseEndDate: "En pausa"', () => {
    const c = current(buildPlanTimeline(summary({ current: item({ status: 'paused' }) }), TODAY))
    expect(c.pill).toEqual({ text: 'En pausa', tone: 'mid', icon: 'pause' })
  })

  it('pausa con fin ya pasado: no inventa días', () => {
    const c = current(
      buildPlanTimeline(
        summary({ current: item({ status: 'paused', endDate: d('10-20') }) }),
        TODAY,
      ),
    )
    expect(c.period).toBe('Del 20 oct al 20 oct')
  })

  it('pausado a ≤7 días y sin próxima: no muestra el nodo vacío', () => {
    const m = buildPlanTimeline(
      summary({ current: item({ status: 'paused', endDate: d('10-30') }) }),
      TODAY,
    )
    expect(nodes(m).map((n) => n.kind)).toEqual(['current'])
  })
})

describe('buildPlanTimeline · pase especial', () => {
  const pase = (over: Partial<PlanSummaryItem> = {}) =>
    item({
      planCategory: 'especial',
      planName: 'Pase Yoga',
      classesPerWeek: null,
      classesRemaining: 3,
      classesBudget: 8,
      endDate: d('10-30'),
      ...over,
    })

  it('muestra el saldo de clases y la barra sale del saldo', () => {
    const c = current(buildPlanTimeline(summary({ current: pase() }), TODAY))
    expect(c.meta).toBe('Te quedan 3 de 8 clases')
    expect(c.progress).toBe(38)
    expect(c.period).toBe('Del 20 oct al 30 oct · quedan 2 días')
  })

  it('nunca "Vence pronto" ni nodo vacío aunque falten pocos días', () => {
    const m = buildPlanTimeline(summary({ current: pase() }), TODAY)
    expect(current(m).pill).toBeNull()
    expect(nodes(m).map((n) => n.kind)).toEqual(['current'])
  })

  it('saldo en 0: barra vacía', () => {
    const c = current(buildPlanTimeline(summary({ current: pase({ classesRemaining: 0 }) }), TODAY))
    expect(c.meta).toBe('Te quedan 0 de 8 clases')
    expect(c.progress).toBe(0)
  })
})

describe('buildPlanTimeline · plan regular con tope mensual de clases', () => {
  it('no muestra el saldo ("Te quedan 30 de 30 clases"): clases por semana y barra por días', () => {
    const regular = item({ classesPerWeek: 6, classesRemaining: 30, classesBudget: 30 })
    const c = current(buildPlanTimeline(summary({ current: regular }), TODAY))
    expect(c.meta).toBe('6 clases por semana')
    expect(c.progress).toBe(
      current(buildPlanTimeline(summary({ current: item({ classesPerWeek: 6 }) }), TODAY)).progress,
    )
  })
})

describe('buildPlanTimeline · próxima', () => {
  it('misma plan: "Después sigue", "Nuevo" si isNew', () => {
    const m = buildPlanTimeline(
      summary({
        current: item({ planId: 10 }),
        next: item({
          id: 2,
          planId: 10,
          status: 'scheduled',
          startDate: d('11-20'),
          endDate: d('12-19'),
          isNew: true,
        }),
      }),
      TODAY,
    )
    expect(nodes(m).map((n) => n.kind)).toEqual(['current', 'next'])
    const n = next(m)
    expect(n.label).toBe('Después sigue')
    expect(n.name).toBe('Mensual 3x semana')
    expect(n.period).toBe('Del 20 nov al 19 dic')
    expect(n.pill).toEqual({ text: 'Nuevo', tone: 'new' })
    expect(n.confirmed).toBe(false)
  })

  it('ya vista: "Cargada" con check y nodo cerrado', () => {
    const m = buildPlanTimeline(
      summary({
        current: item(),
        next: item({ id: 2, status: 'scheduled', startDate: d('11-20'), isNew: false }),
      }),
      TODAY,
    )
    const n = next(m)
    expect(n.pill).toEqual({ text: 'Cargada', tone: 'ok', icon: 'check' })
    expect(n.confirmed).toBe(true)
  })

  it('otro plan: "Después cambia a"', () => {
    const m = buildPlanTimeline(
      summary({
        current: item({ planId: 10 }),
        next: item({
          id: 2,
          planId: 11,
          planName: 'Libre mensual',
          status: 'scheduled',
          startDate: d('11-20'),
        }),
      }),
      TODAY,
    )
    expect(next(m).label).toBe('Después cambia a')
    expect(next(m).name).toBe('Libre mensual')
  })

  it('con próxima cargada no aparece el nodo vacío aunque venza mañana', () => {
    const m = buildPlanTimeline(
      summary({
        current: item({ endDate: d('10-29') }),
        next: item({ id: 2, status: 'scheduled', startDate: d('10-30') }),
      }),
      TODAY,
    )
    expect(nodes(m).map((n) => n.kind)).toEqual(['current', 'next'])
  })

  it('próxima de otro año lleva año; sin fin: "Desde el …"', () => {
    const m = buildPlanTimeline(
      summary({
        current: item(),
        next: item({ id: 2, status: 'scheduled', startDate: d('01-02', Y + 1), endDate: null }),
      }),
      TODAY,
    )
    expect(next(m).period).toBe(`Desde el 2 ene ${Y + 1}`)
  })
})

describe('buildPlanTimeline · hueco (sin actual, con próxima)', () => {
  it('"Hoy no tenés plan" + fecha del anterior + próxima', () => {
    const m = buildPlanTimeline(
      summary({
        next: item({
          id: 2,
          status: 'scheduled',
          startDate: d('11-02'),
          endDate: d('12-01'),
          isNew: true,
        }),
        history: [hist({ endDate: d('10-25') }), hist({ id: 98, endDate: d('09-01') })],
      }),
      TODAY,
    )
    expect(nodes(m).map((n) => n.kind)).toEqual(['gap', 'next'])
    expect(gap(m).title).toBe('Hoy no tenés plan')
    expect(gap(m).detail).toBe('Tu plan anterior venció el 25 oct')
    // sin actual no hay "cambia a"
    expect(next(m).label).toBe('Después sigue')
  })

  it('sin historial: solo el título', () => {
    const m = buildPlanTimeline(
      summary({ next: item({ id: 2, status: 'scheduled', startDate: d('11-02') }) }),
      TODAY,
    )
    expect(gap(m).detail).toBeNull()
  })

  it('el anterior sin fecha de fin: sin detalle', () => {
    const m = buildPlanTimeline(
      summary({
        next: item({ id: 2, status: 'scheduled', startDate: d('11-02') }),
        history: [hist({ endDate: null })],
      }),
      TODAY,
    )
    expect(gap(m).detail).toBeNull()
  })

  it('el anterior del año pasado lleva año', () => {
    const m = buildPlanTimeline(
      summary({
        next: item({ id: 2, status: 'scheduled', startDate: d('11-02') }),
        history: [hist({ endDate: d('12-20', Y - 1) })],
      }),
      TODAY,
    )
    expect(gap(m).detail).toBe(`Tu plan anterior venció el 20 dic ${Y - 1}`)
  })
})

describe('buildPlanTimeline · nodo vacío (sin renovación cargada)', () => {
  const texto =
    'Todavía no hay renovación cargada. Cuando la carguemos aparece acá y te avisamos al teléfono.'

  it('a 7 días: aparece', () => {
    const m = buildPlanTimeline(summary({ current: item({ endDate: d('11-04') }) }), TODAY)
    expect(nodes(m).map((n) => n.kind)).toEqual(['current', 'empty'])
    expect(empty(m)).toEqual({ kind: 'empty', label: 'Después', text: texto })
  })

  it('a 8 días: no aparece', () => {
    const m = buildPlanTimeline(summary({ current: item({ endDate: d('11-05') }) }), TODAY)
    expect(nodes(m).map((n) => n.kind)).toEqual(['current'])
  })

  it('vence hoy: aparece', () => {
    const m = buildPlanTimeline(summary({ current: item({ endDate: d('10-28') }) }), TODAY)
    expect(nodes(m).map((n) => n.kind)).toEqual(['current', 'empty'])
  })

  it('sin fin: no aparece', () => {
    const m = buildPlanTimeline(summary({ current: item({ endDate: null }) }), TODAY)
    expect(nodes(m).map((n) => n.kind)).toEqual(['current'])
  })
})

describe('buildPlanTimeline · sin plan', () => {
  it('con historial: "Sin plan activo" + último plan + Renovar por WhatsApp', () => {
    const m = buildPlanTimeline(
      summary({ history: [hist({ planName: 'Mensual 2x semana', endDate: d('10-10') })] }),
      TODAY,
    )
    expect(m).toEqual({
      kind: 'no-plan',
      kicker: 'Tu plan',
      title: 'Sin plan activo',
      text: 'Tu último plan, Mensual 2x semana, venció el 10 oct.',
      cta: {
        label: 'Renovar por WhatsApp',
        message: 'Hola! Quiero renovar mi plan Mensual 2x semana.',
      },
    })
  })

  it('último plan sin fecha de fin', () => {
    const m = buildPlanTimeline(
      summary({ history: [hist({ planName: 'Libre', endDate: null })] }),
      TODAY,
    )
    expect(m.kind === 'no-plan' && m.text).toBe('Tu último plan, Libre, venció.')
  })

  it('nunca tuvo plan: Bienvenido / Elegí tu plan / Consultar por WhatsApp', () => {
    const m = buildPlanTimeline(summary(), TODAY)
    expect(m.kind).toBe('welcome')
    if (m.kind !== 'welcome') return
    expect(m.kicker).toBe('Bienvenido')
    expect(m.title).toBe('Elegí tu plan')
    expect(m.text).toBe('Te lo cargamos en recepción o por WhatsApp.')
    expect(m.cta.label).toBe('Consultar por WhatsApp')
  })
})

describe('buildPlanTimeline · invariantes', () => {
  it('nunca aparece "Cubierto hasta" ni un monto en ningún estado', () => {
    const casos: PlanSummary[] = [
      summary(),
      summary({ history: [hist()] }),
      summary({ current: item() }),
      summary({
        current: item({ endDate: d('10-29') }),
        next: item({ id: 2, status: 'scheduled', startDate: d('10-30'), isNew: true }),
      }),
      summary({
        next: item({ id: 2, status: 'scheduled', startDate: d('11-02') }),
        history: [hist()],
      }),
    ]
    for (const c of casos) {
      const json = JSON.stringify(buildPlanTimeline(c, TODAY))
      expect(json).not.toMatch(/cubierto/i)
      expect(json).not.toMatch(/\$|ARS|EUR|€/)
    }
  })
})
