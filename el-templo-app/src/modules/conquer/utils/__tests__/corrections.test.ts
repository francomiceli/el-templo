import { describe, it, expect } from 'vitest'
import type { CorrectionTarget, CorrectionView } from '../../types'
import {
  correctionChip,
  groupCorrections,
  localDayOf,
  remainingSlots,
  targetGroups,
} from '../corrections'

// Fase 202 DA-47: agrupar y rotular las correcciones del alumno.

function item(id: number, overrides: Partial<CorrectionView> = {}): CorrectionView {
  return {
    id,
    kind: 'escalon',
    targetLabel: 'Planche press · Escalón 1 · Half lay',
    comment: null,
    durationSec: 12,
    createdAt: '2026-10-20T10:00:00.000Z',
    status: 'pendiente',
    videoDeleted: false,
    reply: null,
    replyUnseen: false,
    ...overrides,
  }
}

function answered(id: number, repliedAt: string, overrides: Partial<CorrectionView> = {}) {
  return item(id, {
    status: 'respondida',
    reply: { text: 'Bien', hasVideo: false, videoSeconds: null, repliedAt },
    ...overrides,
  })
}

describe('groupCorrections', () => {
  it('pendientes por fecha de alta DESC y respondidas por fecha de respuesta DESC', () => {
    const p1 = item(1, { createdAt: '2026-10-20T10:00:00.000Z' })
    const p2 = item(2, { createdAt: '2026-10-22T10:00:00.000Z' })
    // La respondida más vieja de alta es la que se respondió último.
    const r3 = answered(3, '2026-10-25T10:00:00.000Z', { createdAt: '2026-10-10T10:00:00.000Z' })
    const r4 = answered(4, '2026-10-23T10:00:00.000Z', { createdAt: '2026-10-21T10:00:00.000Z' })

    const { pending, answered: done } = groupCorrections([r4, p1, r3, p2])

    expect(pending.map((c) => c.id)).toEqual([2, 1])
    expect(done.map((c) => c.id)).toEqual([3, 4])
  })

  it('sin items devuelve dos listas vacías', () => {
    expect(groupCorrections([])).toEqual({ pending: [], answered: [] })
  })

  it('no muta la lista recibida', () => {
    const lista = [
      item(1, { createdAt: '2026-10-20T10:00:00.000Z' }),
      item(2, { createdAt: '2026-10-22T10:00:00.000Z' }),
    ]
    groupCorrections(lista)
    expect(lista.map((c) => c.id)).toEqual([1, 2])
  })

  it('una respondida sin reply (no debería pasar) cae por su fecha de alta, sin romper', () => {
    const rara = item(5, { status: 'respondida', createdAt: '2026-10-01T10:00:00.000Z' })
    const buena = answered(6, '2026-10-02T10:00:00.000Z')
    expect(groupCorrections([rara, buena]).answered.map((c) => c.id)).toEqual([6, 5])
  })
})

describe('correctionChip', () => {
  it.each([
    ['pendiente', item(1), 'Esperando respuesta', 'espera'],
    [
      'pendiente aunque venga replyUnseen',
      item(1, { replyUnseen: true }),
      'Esperando respuesta',
      'espera',
    ],
    [
      'respondida sin ver',
      answered(2, '2026-10-23T10:00:00.000Z', { replyUnseen: true }),
      'Nueva respuesta',
      'nueva',
    ],
    ['respondida vista', answered(3, '2026-10-23T10:00:00.000Z'), 'Respondida', 'hecha'],
  ] as const)('%s', (_caso, c, label, tone) => {
    expect(correctionChip(c)).toEqual({ label, tone })
  })
})

describe('remainingSlots', () => {
  it.each([
    [0, 3, 3],
    [1, 3, 2],
    [3, 3, 0],
    [5, 3, 0],
  ])('pending %s de %s -> %s', (pending, pendingMax, esperado) => {
    expect(remainingSlots({ pending, pendingMax })).toBe(esperado)
  })
})

describe('targetGroups', () => {
  function target(key: string, group: string, label: string): CorrectionTarget {
    return {
      key,
      kind: key.startsWith('combo') ? 'combo' : 'escalon',
      exerciseId: null,
      step: null,
      comboKey: null,
      group,
      label,
    }
  }

  it('agrupa por group, conserva el orden de llegada y no repite grupos', () => {
    const groups = targetGroups([
      target('escalon:1:e1', 'Planche press', 'Escalón 1'),
      target('escalon:1:e2', 'Planche press', 'Escalón 2'),
      target('escalon:2:e1', 'Front lever', 'Escalón 1'),
      target('combo:push', 'Combos', 'Combo Push'),
      target('combo:pull', 'Combos', 'Combo Pull'),
    ])

    expect(groups).toEqual([
      {
        group: 'Planche press',
        options: [
          { key: 'escalon:1:e1', label: 'Escalón 1' },
          { key: 'escalon:1:e2', label: 'Escalón 2' },
        ],
      },
      { group: 'Front lever', options: [{ key: 'escalon:2:e1', label: 'Escalón 1' }] },
      {
        group: 'Combos',
        options: [
          { key: 'combo:push', label: 'Combo Push' },
          { key: 'combo:pull', label: 'Combo Pull' },
        ],
      },
    ])
  })

  it('un grupo que reaparece más tarde suma a su lugar original', () => {
    const groups = targetGroups([
      target('a', 'A', 'a1'),
      target('b', 'B', 'b1'),
      target('c', 'A', 'a2'),
    ])
    expect(groups.map((g) => g.group)).toEqual(['A', 'B'])
    expect(groups[0]?.options.map((o) => o.key)).toEqual(['a', 'c'])
  })

  it('sin objetivos no hay grupos', () => {
    expect(targetGroups([])).toEqual([])
  })
})

describe('localDayOf', () => {
  it('devuelve el día de calendario local, no el UTC', () => {
    // 23:30 locales: según la zona el instante UTC ya puede ser del día siguiente
    const instant = new Date(2026, 9, 26, 23, 30).toISOString()
    expect(localDayOf(instant)).toBe('2026-10-26')
  })

  it('completa mes y día con cero', () => {
    expect(localDayOf(new Date(2026, 0, 5, 12, 0).toISOString())).toBe('2026-01-05')
  })

  it.each(['', 'no es una fecha'])('"%s" (inválida) da cadena vacía', (iso) => {
    expect(localDayOf(iso)).toBe('')
  })
})
