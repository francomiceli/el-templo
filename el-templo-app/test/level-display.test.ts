import { describe, it, expect } from 'vitest'
import {
  TRAINING_LEVELS,
  LEVEL_GREEK_MAP,
  LEVEL_DISPLAY_MAP,
  isTrainingLevel,
} from 'src/modules/training/level-display'

describe('level-display enum', () => {
  it('exports the frozen tuple in declared enum order', () => {
    expect([...TRAINING_LEVELS]).toEqual(['alfa', 'delta', 'sigma', 'omega', 'spartan'])
  })

  it('TRAINING_LEVELS has exactly 5 entries', () => {
    expect(TRAINING_LEVELS).toHaveLength(5)
  })
})

describe('LEVEL_GREEK_MAP (byte-for-byte with server progression/service.ts)', () => {
  it('maps each level to its Greek letter with exact Unicode codepoints', () => {
    expect(LEVEL_GREEK_MAP.alfa).toBe('α')
    expect(LEVEL_GREEK_MAP.delta).toBe('Δ')
    expect(LEVEL_GREEK_MAP.sigma).toBe('Σ')
    expect(LEVEL_GREEK_MAP.omega).toBe('Ω')
    expect(LEVEL_GREEK_MAP.spartan).toBe('Ω')
  })

  it('spartan maps to the same Greek letter as omega', () => {
    expect(LEVEL_GREEK_MAP.spartan).toBe(LEVEL_GREEK_MAP.omega)
  })
})

describe('LEVEL_DISPLAY_MAP', () => {
  it('returns proper capitalised names', () => {
    expect(LEVEL_DISPLAY_MAP.alfa).toBe('Alfa')
    expect(LEVEL_DISPLAY_MAP.delta).toBe('Delta')
    expect(LEVEL_DISPLAY_MAP.sigma).toBe('Sigma')
    expect(LEVEL_DISPLAY_MAP.omega).toBe('Omega')
    expect(LEVEL_DISPLAY_MAP.spartan).toBe('Spartan')
  })
})

describe('isTrainingLevel type guard', () => {
  it('returns true for every known enum value', () => {
    for (const lvl of TRAINING_LEVELS) {
      expect(isTrainingLevel(lvl)).toBe(true)
    }
  })

  it.each([null, undefined, '', 'Alfa', 'ALFA', ' alfa ', 42, {}, [], true])(
    'returns false for invalid input: %p',
    (bad) => {
      expect(isTrainingLevel(bad)).toBe(false)
    },
  )
})
