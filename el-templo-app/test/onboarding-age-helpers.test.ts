import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import {
  ageToRange,
  deriveAgeRangeFromDob,
  parseDmyToAgeRange,
  AGE_RANGE_SKIP_DEFAULT,
} from 'src/modules/onboarding/types'

// Freeze "today" so age math is deterministic across CI runs.
const FIXED_NOW = new Date('2026-04-18T12:00:00Z')

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterAll(() => {
  vi.useRealTimers()
})

describe('ageToRange', () => {
  it('maps ages to the correct bucket', () => {
    expect(ageToRange(18)).toBe('18_24')
    expect(ageToRange(24)).toBe('18_24')
    expect(ageToRange(25)).toBe('25_34')
    expect(ageToRange(34)).toBe('25_34')
    expect(ageToRange(35)).toBe('35_50')
    expect(ageToRange(50)).toBe('35_50')
    expect(ageToRange(51)).toBe('50_plus')
    expect(ageToRange(80)).toBe('50_plus')
  })
})

describe('deriveAgeRangeFromDob', () => {
  it('returns null for missing or malformed input', () => {
    expect(deriveAgeRangeFromDob(null)).toBeNull()
    expect(deriveAgeRangeFromDob(undefined)).toBeNull()
    expect(deriveAgeRangeFromDob('')).toBeNull()
    expect(deriveAgeRangeFromDob('15/06/1990')).toBeNull()
    expect(deriveAgeRangeFromDob('1990-6-15')).toBeNull()
  })

  it('derives the bucket from YYYY-MM-DD strings', () => {
    // Today is 2026-04-18.
    expect(deriveAgeRangeFromDob('2005-01-01')).toBe('18_24') // age 21
    expect(deriveAgeRangeFromDob('2000-01-01')).toBe('25_34') // age 26
    expect(deriveAgeRangeFromDob('1990-01-01')).toBe('35_50') // age 36
    expect(deriveAgeRangeFromDob('1970-01-01')).toBe('50_plus') // age 56
  })

  it('accounts for whether birthday has occurred this year', () => {
    // Today is 2026-04-18.
    // Birthday April 17 → already had birthday this year, age 25.
    expect(deriveAgeRangeFromDob('2001-04-17')).toBe('25_34')
    // Birthday April 19 → birthday is tomorrow, age still 24.
    expect(deriveAgeRangeFromDob('2001-04-19')).toBe('18_24')
    // Same day as today → birthday passed (not before).
    expect(deriveAgeRangeFromDob('2001-04-18')).toBe('25_34')
  })

  it('floors underage DOBs to the youngest bucket (never returns null for under-18)', () => {
    // 10 years old — avatar logic still needs a bucket.
    expect(deriveAgeRangeFromDob('2016-01-01')).toBe('18_24')
  })
})

describe('parseDmyToAgeRange', () => {
  it('returns null for bad format', () => {
    expect(parseDmyToAgeRange('')).toBeNull()
    expect(parseDmyToAgeRange('abc')).toBeNull()
    expect(parseDmyToAgeRange('1/1/1990')).toBeNull()
    expect(parseDmyToAgeRange('1990-06-15')).toBeNull()
    expect(parseDmyToAgeRange('15/06/90')).toBeNull()
    expect(parseDmyToAgeRange('15/06/1990x')).toBeNull()
  })

  it('rejects impossible calendar dates', () => {
    expect(parseDmyToAgeRange('31/02/1990')).toBeNull() // Feb 31
    expect(parseDmyToAgeRange('29/02/2023')).toBeNull() // non-leap year
    expect(parseDmyToAgeRange('32/01/1990')).toBeNull()
    expect(parseDmyToAgeRange('15/13/1990')).toBeNull()
    expect(parseDmyToAgeRange('00/00/0000')).toBeNull()
  })

  it('accepts valid leap-year dates', () => {
    // 2000 is a leap year; Feb 29 2000 is valid.
    expect(parseDmyToAgeRange('29/02/2000')).toBe('25_34') // age 26
  })

  it('rejects ages outside the sane range (13–110)', () => {
    // 2020-01-01 is age 6 → reject
    expect(parseDmyToAgeRange('01/01/2020')).toBeNull()
    // Year 1900 is age 126 → reject
    expect(parseDmyToAgeRange('01/01/1900')).toBeNull()
  })

  it('floors 13–17 to the 18_24 bucket so avatar logic always has a value', () => {
    // 15 years old today.
    expect(parseDmyToAgeRange('18/04/2011')).toBe('18_24')
  })

  it('trims surrounding whitespace', () => {
    expect(parseDmyToAgeRange('  15/06/1990  ')).toBe('35_50')
  })
})

describe('parseDmyToAgeRange bucket boundaries', () => {
  it('18_24 covers 18 to 24 inclusive', () => {
    expect(parseDmyToAgeRange('18/04/2008')).toBe('18_24') // age 18
    expect(parseDmyToAgeRange('18/04/2002')).toBe('18_24') // age 24
  })

  it('25_34 covers 25 to 34 inclusive', () => {
    expect(parseDmyToAgeRange('18/04/2001')).toBe('25_34') // age 25
    expect(parseDmyToAgeRange('18/04/1992')).toBe('25_34') // age 34
  })

  it('35_50 covers 35 to 50 inclusive', () => {
    expect(parseDmyToAgeRange('18/04/1991')).toBe('35_50') // age 35
    expect(parseDmyToAgeRange('18/04/1976')).toBe('35_50') // age 50
  })

  it('50_plus covers 51 and above', () => {
    expect(parseDmyToAgeRange('18/04/1975')).toBe('50_plus') // age 51
    expect(parseDmyToAgeRange('18/04/1950')).toBe('50_plus') // age 76
  })
})

describe('AGE_RANGE_SKIP_DEFAULT', () => {
  it('is a neutral bucket that does not trigger age-specific avatar branches', () => {
    // Avatar K needs 18_24, H/F need 50_plus. 25_34 is the safe middle.
    expect(AGE_RANGE_SKIP_DEFAULT).toBe('25_34')
  })
})
