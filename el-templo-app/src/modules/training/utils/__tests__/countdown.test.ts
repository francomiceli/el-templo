import { describe, it, expect } from 'vitest'
import {
  COUNTDOWN_DONE_AT_MS,
  COUNTDOWN_START,
  COUNTDOWN_TICK_MS,
  GO_ANIMATION_MAX_MS,
  GO_ANIMATION_MS,
  GO_DONE_DELAY_MS,
  GO_VISIBLE_MS,
} from '../countdown'

describe('contrato de tiempos del 3-2-1', () => {
  it('cuenta 3-2-1 de a un segundo y `done` espera 1 s tras el tick del 0', () => {
    expect(COUNTDOWN_START).toBe(3)
    expect(COUNTDOWN_TICK_MS).toBe(1000)
    expect(GO_DONE_DELAY_MS).toBe(1000)
  })

  it('el arranque del bloque sale a los 5 s, igual que antes del cartel nuevo', () => {
    expect(COUNTDOWN_DONE_AT_MS).toBe(5000)
  })

  it('la animación del cartel respeta el tope de 1,4 s', () => {
    expect(GO_ANIMATION_MS).toBeLessThanOrEqual(GO_ANIMATION_MAX_MS)
    expect(GO_ANIMATION_MAX_MS).toBe(1400)
  })

  it('la animación entera se alcanza a ver antes de que salga `done`', () => {
    expect(GO_ANIMATION_MS).toBeLessThanOrEqual(GO_VISIBLE_MS)
  })
})
