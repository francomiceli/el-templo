import { describe, expect, it } from 'vitest'
import type { CelebrationMovement, CelebrationResponse } from 'src/types/aura-celebration'
import { celebrationCard, celebrationFace, faceInitials, shortReason } from '../celebration-view'

function movement(overrides: Partial<CelebrationMovement> = {}): CelebrationMovement {
  return {
    id: 1,
    amount: 5,
    source: 'profile_photo',
    label: 'Foto de perfil',
    gift: null,
    ...overrides,
  }
}

function response(movements: CelebrationMovement[], extra: Partial<CelebrationResponse> = {}) {
  return {
    movements,
    count: movements.length,
    sum: movements.reduce((acc, m) => acc + m.amount, 0),
    total: 100,
    maxId: 50,
    ...extra,
  } satisfies CelebrationResponse
}

const plain = (card: NonNullable<ReturnType<typeof celebrationCard>>) =>
  card.segments.map((s) => s.text).join('')

describe('celebrationCard: un solo movimiento', () => {
  it('sin nada para celebrar no hay tarjeta', () => {
    expect(celebrationCard(response([]))).toBeNull()
    expect(celebrationCard(response([movement()], { count: 0 }))).toBeNull()
  })

  it('un movimiento que no es regalo dice su texto y la pastilla lleva el monto', () => {
    const card = celebrationCard(response([movement({ amount: 10, label: 'Programa completo' })]))
    expect(card).not.toBeNull()
    expect(plain(card!)).toBe('Programa completo')
    expect(card!.pill).toBe('+10')
    expect(card!.amount).toBe(10)
    expect(card!.reasons).toEqual([])
    expect(card!.more).toBeNull()
  })

  it('regalo de un alumno: "Juan P. te dio Aura por Buena energía"', () => {
    const card = celebrationCard(
      response([
        movement({
          source: 'social',
          amount: 1,
          gift: { kind: 'alumno', anonymous: false, name: 'Juan P.', reason: 'Buena energía' },
        }),
      ]),
    )
    expect(plain(card!)).toBe('Juan P. te dio Aura por Buena energía')
    expect(card!.pill).toBe('+1')
    expect(card!.face).toEqual({ kind: 'initials', text: 'JP', coach: false })
  })

  it('regalo del profe: "Tu profe Fran te dio Aura por Constancia"', () => {
    const card = celebrationCard(
      response([
        movement({
          source: 'social',
          amount: 2,
          gift: { kind: 'profe', anonymous: false, name: 'Fran', reason: 'Constancia' },
        }),
      ]),
    )
    expect(plain(card!)).toBe('Tu profe Fran te dio Aura por Constancia')
    expect(card!.face).toEqual({ kind: 'initials', text: 'F', coach: true })
  })

  it('profe sin nombre: "Tu profe te dio Aura por X"', () => {
    const card = celebrationCard(
      response([
        movement({
          source: 'social',
          gift: { kind: 'profe', anonymous: false, name: null, reason: 'Constancia' },
        }),
      ]),
    )
    expect(plain(card!)).toBe('Tu profe te dio Aura por Constancia')
  })

  it('regalo anónimo: "Te dieron 1 de Aura por Buena energía", sin nombre ni "Alguien"', () => {
    const card = celebrationCard(
      response([
        movement({
          source: 'social',
          amount: 1,
          label: 'Te dieron 1 de Aura por Buena energía',
          gift: { kind: 'alumno', anonymous: true, name: null, reason: 'Buena energía' },
        }),
      ]),
    )
    expect(plain(card!)).toBe('Te dieron 1 de Aura por Buena energía')
    expect(card!.announcement).not.toContain('Alguien')
    expect(card!.face).toEqual({ kind: 'spark' })
  })

  it('un regalo con nombre vacío (dato incompleto) usa la chispa', () => {
    const face = celebrationFace(
      movement({ gift: { kind: 'alumno', anonymous: false, name: '', reason: 'X' } }),
    )
    expect(face).toEqual({ kind: 'spark' })
  })
})

describe('celebrationCard: varios movimientos', () => {
  const three = response([
    movement({ id: 3, amount: 50, source: 'program_completion', label: 'Programa completo' }),
    movement({ id: 2, amount: 5, source: 'profile_photo', label: 'Foto de perfil' }),
    movement({
      id: 1,
      amount: 1,
      source: 'social',
      gift: { kind: 'alumno', anonymous: false, name: 'Juan P.', reason: 'Buena energía' },
    }),
  ])

  it('"Sumaste N de Aura" con la suma, los dos últimos motivos y "y N más"', () => {
    const card = celebrationCard(three)!
    expect(plain(card)).toBe('Sumaste 56 de Aura')
    expect(card.pill).toBe('+56')
    expect(card.amount).toBe(56)
    expect(card.reasons).toEqual(['Programa completo', 'Foto de perfil'])
    expect(card.more).toBe('y 1 más')
    expect(card.face).toEqual({ kind: 'spark' })
  })

  it('con exactamente dos movimientos no hay "y N más"', () => {
    const card = celebrationCard(response([three.movements[0], three.movements[1]]))!
    expect(card.more).toBeNull()
    expect(card.reasons).toHaveLength(2)
  })

  it('usa `count` y `sum` del servidor aunque la lista esté recortada', () => {
    const card = celebrationCard({ ...three, count: 25, sum: 1240 })!
    expect(plain(card)).toBe('Sumaste 1.240 de Aura')
    expect(card.more).toBe('y 23 más')
  })

  it('el motivo corto de un regalo no nombra a nadie', () => {
    expect(shortReason(three.movements[2])).toBe('Regalo: Buena energía')
    expect(celebrationCard(three)!.announcement).not.toContain('Juan')
  })
})

describe('celebrationFace e iniciales', () => {
  it('elige el ícono por fuente y cae en la chispa', () => {
    expect(celebrationFace(movement({ source: 'streak_bonus' }))).toEqual({
      kind: 'icon',
      name: 'local_fire_department',
    })
    expect(celebrationFace(movement({ source: 'tenure_milestone' }))).toEqual({
      kind: 'icon',
      name: 'workspace_premium',
    })
    expect(celebrationFace(movement({ source: 'algo_nuevo' }))).toEqual({ kind: 'spark' })
  })

  it('faceInitials respeta el tope y tolera nombres vacíos', () => {
    expect(faceInitials('Juan P.', 2)).toBe('JP')
    expect(faceInitials('Fran', 1)).toBe('F')
    expect(faceInitials('ana maría pérez', 2)).toBe('AM')
    expect(faceInitials('   ', 2)).toBe('')
    expect(faceInitials(null, 2)).toBe('')
  })
})
