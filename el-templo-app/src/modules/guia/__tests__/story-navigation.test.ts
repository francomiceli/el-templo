import { describe, it, expect } from 'vitest'
import { reduceStoryNav, isLastSlide } from '../story-navigation'

describe('reduceStoryNav (SPEC "Empezá acá" B — navegación de historias)', () => {
  it('next avanza un slide cuando no es el último', () => {
    expect(reduceStoryNav(0, 5, 'next')).toEqual({ index: 1, closed: false, completed: false })
    expect(reduceStoryNav(3, 5, 'next')).toEqual({ index: 4, closed: false, completed: false })
  })

  it('next en el último slide cierra y marca completado', () => {
    expect(reduceStoryNav(4, 5, 'next')).toEqual({ index: 4, closed: true, completed: true })
  })

  it('prev retrocede un slide sin pasar de 0', () => {
    expect(reduceStoryNav(2, 5, 'prev')).toEqual({ index: 1, closed: false, completed: false })
    expect(reduceStoryNav(0, 5, 'prev')).toEqual({ index: 0, closed: false, completed: false })
  })

  it('close cierra sin marcar completado, sin importar el slide', () => {
    expect(reduceStoryNav(0, 5, 'close')).toEqual({ index: 0, closed: true, completed: false })
    expect(reduceStoryNav(4, 5, 'close')).toEqual({ index: 4, closed: true, completed: false })
    expect(reduceStoryNav(2, 5, 'close')).toEqual({ index: 2, closed: true, completed: false })
  })

  it('total <= 0 es un caso defensivo: cierra sin completar (nunca lanza)', () => {
    expect(reduceStoryNav(0, 0, 'next')).toEqual({ index: 0, closed: true, completed: false })
  })

  it('un solo slide: next ya es el último — completa de una', () => {
    expect(reduceStoryNav(0, 1, 'next')).toEqual({ index: 0, closed: true, completed: true })
  })
})

describe('isLastSlide', () => {
  it('true solo en el último índice', () => {
    expect(isLastSlide(4, 5)).toBe(true)
    expect(isLastSlide(3, 5)).toBe(false)
  })

  it('total 0 nunca es "último" (caso defensivo)', () => {
    expect(isLastSlide(0, 0)).toBe(false)
  })
})
