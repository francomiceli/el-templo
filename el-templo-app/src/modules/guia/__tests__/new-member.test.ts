import { describe, expect, it } from 'vitest'
import { isNewMember, NEW_MEMBER_DAYS } from '../new-member'

const NOW = new Date('2026-09-24T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString()

describe('isNewMember', () => {
  it('alta de hace pocos días → nuevo', () => {
    expect(isNewMember(daysAgo(3), NOW)).toBe(true)
  })

  it(`justo antes de ${NEW_MEMBER_DAYS} días → nuevo; en el límite → veterano`, () => {
    expect(isNewMember(daysAgo(NEW_MEMBER_DAYS - 0.01), NOW)).toBe(true)
    expect(isNewMember(daysAgo(NEW_MEMBER_DAYS), NOW)).toBe(false)
  })

  it('alta de hace años → veterano', () => {
    expect(isNewMember(daysAgo(800), NOW)).toBe(false)
  })

  it('sin fecha o fecha inválida → veterano (no interrumpir)', () => {
    expect(isNewMember(undefined, NOW)).toBe(false)
    expect(isNewMember('no-es-fecha', NOW)).toBe(false)
  })
})
