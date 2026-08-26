import { describe, it, expect } from 'vitest'
import { normalizeSignupCode } from 'src/utils/signup-code'

describe('normalizeSignupCode', () => {
  it('uppercases and strips non-alphanumeric characters (incl. surrounding whitespace)', () => {
    expect(normalizeSignupCode(' cafe-x ')).toBe('CAFEX')
  })

  it('returns an empty string for an empty input', () => {
    expect(normalizeSignupCode('')).toBe('')
  })

  it('returns an empty string for a whitespace-only input', () => {
    expect(normalizeSignupCode('   ')).toBe('')
  })

  it('clamps to 24 characters', () => {
    const raw = 'a'.repeat(30)
    const result = normalizeSignupCode(raw)
    expect(result).toHaveLength(24)
    expect(result).toBe('A'.repeat(24))
  })

  it('leaves digits untouched', () => {
    expect(normalizeSignupCode('CAFE2')).toBe('CAFE2')
  })
})
