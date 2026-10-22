import { describe, it, expect } from 'vitest'
import { queryTabKeys, tabFromQuery, visibleTabKeys } from '../entrenarTabs'

// Fase 201 D-10: Entrenar vuelve con dos tabs (Semana y Conquer). Libre y Desafíos siguen apagados.
describe('visibleTabKeys', () => {
  it('hoy: Semana y Conquer, en ese orden', () => {
    expect(visibleTabKeys({ tabs: true, libre: false, desafios: false })).toEqual([
      'semana',
      'conquer',
    ])
  })

  it('con Libre prendido va entre Semana y Conquer', () => {
    expect(visibleTabKeys({ tabs: true, libre: true, desafios: false })).toEqual([
      'semana',
      'libre',
      'conquer',
    ])
  })

  it('con Desafíos prendido va antes de Conquer', () => {
    expect(visibleTabKeys({ tabs: true, libre: false, desafios: true })).toEqual([
      'semana',
      'desafios',
      'conquer',
    ])
  })

  it('con todo prendido: las cuatro en orden', () => {
    expect(visibleTabKeys({ tabs: true, libre: true, desafios: true })).toEqual([
      'semana',
      'libre',
      'desafios',
      'conquer',
    ])
  })

  it.each([
    { libre: false, desafios: false },
    { libre: true, desafios: true },
  ])('sin tabs solo queda Semana (libre=$libre, desafios=$desafios)', (rest) => {
    expect(visibleTabKeys({ tabs: false, ...rest })).toEqual(['semana'])
  })
})

describe('queryTabKeys', () => {
  it('son las visibles menos Semana', () => {
    expect(queryTabKeys({ tabs: true, libre: false, desafios: false })).toEqual(['conquer'])
    expect(queryTabKeys({ tabs: true, libre: true, desafios: true })).toEqual([
      'libre',
      'desafios',
      'conquer',
    ])
  })

  it('sin tabs no hay ninguna', () => {
    expect(queryTabKeys({ tabs: false, libre: true, desafios: true })).toEqual([])
  })
})

describe('tabFromQuery', () => {
  const allowed = ['conquer'] as const

  it('una tab permitida la abre', () => {
    expect(tabFromQuery('conquer', allowed)).toBe('conquer')
  })

  it('una tab conocida pero apagada abre Semana', () => {
    expect(tabFromQuery('desafios', allowed)).toBe('semana')
    expect(tabFromQuery('libre', allowed)).toBe('semana')
  })

  it('un array usa el primer elemento', () => {
    expect(tabFromQuery(['conquer', 'x'], allowed)).toBe('conquer')
    expect(tabFromQuery(['x', 'conquer'], allowed)).toBe('semana')
  })

  it.each([undefined, null, 42, '', 'CONQUER', 'semana', {}, []])(
    'valor no permitido (%j) abre Semana',
    (raw) => {
      expect(tabFromQuery(raw, allowed)).toBe('semana')
    },
  )

  it('sin tabs permitidas todo abre Semana', () => {
    expect(tabFromQuery('conquer', [])).toBe('semana')
  })
})
