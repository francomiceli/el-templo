import { describe, it, expect } from 'vitest'
import { dayFacesKey, facesBySchedule, facesForSlot } from 'src/utils/day-faces'
import type { DayAttendees, DayFace } from 'src/types/community'

const cara = (firstName: string, isMe = false): DayFace => ({
  firstName,
  lastInitial: 'P',
  photoUrl: null,
  isMe,
})

describe('dayFacesKey', () => {
  it('une fecha y sede', () => {
    expect(dayFacesKey('2026-11-20', 7)).toBe('2026-11-20|7')
  })

  it('sin sede explícita usa la del alumno, distinta de cualquier id', () => {
    expect(dayFacesKey('2026-11-20', null)).toBe('2026-11-20|propia')
    expect(dayFacesKey('2026-11-20', null)).not.toBe(dayFacesKey('2026-11-20', 0))
  })

  it('días o sedes distintas dan claves distintas', () => {
    expect(dayFacesKey('2026-11-20', 7)).not.toBe(dayFacesKey('2026-11-21', 7))
    expect(dayFacesKey('2026-11-20', 7)).not.toBe(dayFacesKey('2026-11-20', 8))
  })
})

describe('facesBySchedule', () => {
  it('indexa las caras por horario y omite los horarios sin caras', () => {
    const data: DayAttendees = {
      canSeeFaces: true,
      slots: [
        { scheduleId: 10, total: 6, faces: [cara('Ana'), cara('Luz')] },
        { scheduleId: 11, total: 2, faces: [] },
      ],
    }

    const map = facesBySchedule(data)

    expect([...map.keys()]).toEqual([10])
    expect(map.get(10)?.map((f) => f.firstName)).toEqual(['Ana', 'Luz'])
  })

  it('sin permiso para ver caras no devuelve ninguna, aunque vengan en la respuesta', () => {
    const data: DayAttendees = {
      canSeeFaces: false,
      slots: [{ scheduleId: 10, total: 3, faces: [cara('Ana')] }],
    }

    expect(facesBySchedule(data).size).toBe(0)
  })

  it('respuesta sin horarios: vacío', () => {
    expect(facesBySchedule({ canSeeFaces: true, slots: [] }).size).toBe(0)
  })
})

describe('facesForSlot', () => {
  const state = {
    key: dayFacesKey('2026-11-20', 7),
    bySchedule: new Map([[10, [cara('Ana')]]]),
  }

  it('devuelve las caras del horario cuando la clave es la del día que se mira', () => {
    expect(facesForSlot(state, dayFacesKey('2026-11-20', 7), 10)).toHaveLength(1)
  })

  it('un cambio de día no pinta las caras del día anterior', () => {
    expect(facesForSlot(state, dayFacesKey('2026-11-21', 7), 10)).toEqual([])
  })

  it('un cambio de sede tampoco', () => {
    expect(facesForSlot(state, dayFacesKey('2026-11-20', 8), 10)).toEqual([])
  })

  it('horario sin caras o sin estado: vacío', () => {
    expect(facesForSlot(state, state.key, 99)).toEqual([])
    expect(facesForSlot(null, state.key, 10)).toEqual([])
  })
})
