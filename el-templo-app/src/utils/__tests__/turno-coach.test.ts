import { describe, it, expect } from 'vitest'
import { turnoCoachName } from 'src/utils/turno-coach'

const slot = (coachFirstName: string | null, coachOverride = false) => ({
  coachFirstName,
  coachOverride,
})

describe('turnoCoachName', () => {
  it('sin slots → null', () => {
    expect(turnoCoachName([])).toBeNull()
  })

  it('todos con el mismo profe → ese profe', () => {
    expect(turnoCoachName([slot('Nacho'), slot('Nacho')])).toBe('Nacho')
  })

  it('profes distintos → null', () => {
    expect(turnoCoachName([slot('Nacho'), slot('Lean')])).toBeNull()
  })

  it('primer slot sin profe → null', () => {
    expect(turnoCoachName([slot(null), slot('Nacho')])).toBeNull()
  })

  it('ignora los slots con coachOverride (yoga dentro del turno de otro profe)', () => {
    expect(turnoCoachName([slot('Nacho'), slot('Vale', true), slot('Nacho')])).toBe('Nacho')
    // El override va primero: tampoco define el profe del turno.
    expect(turnoCoachName([slot('Vale', true), slot('Nacho')])).toBe('Nacho')
  })

  it('si TODOS los slots son override → null (el profe va en cada tarjeta)', () => {
    expect(turnoCoachName([slot('Vale', true), slot('Vale', true)])).toBeNull()
  })
})
