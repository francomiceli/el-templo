import { describe, expect, it } from 'vitest'
import { blockTimerView, phaseAt, type TimerSpec } from '../blockTimer'

// Vectores tomados de el-templo-api/test/tv/__fixtures__/timer-vectors.json (la misma fase que la TV)
describe('phaseAt (port de la TV)', () => {
  const tabata: TimerSpec = { kind: 'work_rest', workMs: 20_000, restMs: 10_000, rounds: 8 }

  it('tabata 20s/10s x8', () => {
    expect(phaseAt(0, tabata)).toMatchObject({ phase: 'work', displayMs: 20_000, round: 1 })
    expect(phaseAt(19_999, tabata)).toMatchObject({ phase: 'work', displayMs: 1, round: 1 })
    expect(phaseAt(20_000, tabata)).toMatchObject({ phase: 'rest', displayMs: 10_000, round: 1 })
    expect(phaseAt(30_000, tabata)).toMatchObject({ phase: 'work', displayMs: 20_000, round: 2 })
    expect(phaseAt(240_000, tabata)).toMatchObject({ phase: 'done', finished: true, round: 8 })
  })

  it('un reloj roto (negativo, no finito) cuenta como t=0', () => {
    const amrap: TimerSpec = { kind: 'countdown', totalMs: 600_000 }
    expect(phaseAt(-5, amrap).displayMs).toBe(600_000)
    expect(phaseAt(Number.NaN, amrap).displayMs).toBe(600_000)
  })
})

describe('blockTimerView', () => {
  it('AMRAP: cuenta regresiva sin rótulo, redondeando para arriba', () => {
    const amrap: TimerSpec = { kind: 'countdown', totalMs: 720_000 }
    expect(blockTimerView(amrap, 0)).toEqual({ time: '12:00', label: '' })
    expect(blockTimerView(amrap, 500)).toEqual({ time: '12:00', label: '' })
    expect(blockTimerView(amrap, 61_000)).toEqual({ time: '10:59', label: '' })
    expect(blockTimerView(amrap, 720_000)).toEqual({ time: '00:00', label: 'Terminado' })
  })

  it('EMOM de 60s: el minuto en curso y lo que le queda', () => {
    const emom: TimerSpec = { kind: 'interval', intervalMs: 60_000, rounds: 10 }
    expect(blockTimerView(emom, 0)).toEqual({ time: '01:00', label: 'Minuto 1 de 10' })
    expect(blockTimerView(emom, 125_000)).toEqual({ time: '00:55', label: 'Minuto 3 de 10' })
  })

  it('intervalo que no es de un minuto: "Ronda"', () => {
    const e30: TimerSpec = { kind: 'interval', intervalMs: 30_000, rounds: 8 }
    expect(blockTimerView(e30, 31_000)).toEqual({ time: '00:29', label: 'Ronda 2 de 8' })
  })

  it('trabajo/descanso con la ronda', () => {
    const tabata: TimerSpec = { kind: 'work_rest', workMs: 20_000, restMs: 10_000, rounds: 8 }
    expect(blockTimerView(tabata, 5_000)).toEqual({ time: '00:15', label: 'Trabajo · 1/8' })
    expect(blockTimerView(tabata, 25_000)).toEqual({ time: '00:05', label: 'Descanso · 1/8' })
  })

  it('cronómetro libre (o sin spec): el tiempo del bloque', () => {
    expect(blockTimerView({ kind: 'countup' }, 95_000)).toEqual({ time: '01:35', label: 'Bloque' })
    expect(blockTimerView(null, 95_000)).toEqual({ time: '01:35', label: 'Bloque' })
  })
})
