import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import {
  ageToRange,
  deriveAgeRangeFromDob,
  parseDmyToAgeRange,
  AGE_RANGE_SKIP_DEFAULT,
} from 'src/modules/onboarding/types'

const FIXED_NOW = new Date('2026-04-18T12:00:00Z')

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterAll(() => {
  vi.useRealTimers()
})

describe('ageToRange', () => {
  it('maps ages to buckets', () => {
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
  it('returns null for missing/malformed input', () => {
    expect(deriveAgeRangeFromDob(null)).toBeNull()
    expect(deriveAgeRangeFromDob(undefined)).toBeNull()
    expect(deriveAgeRangeFromDob('')).toBeNull()
    expect(deriveAgeRangeFromDob('15/06/1990')).toBeNull()
    expect(deriveAgeRangeFromDob('1990-6-15')).toBeNull()
  })

  it('derives bucket from YYYY-MM-DD', () => {
    expect(deriveAgeRangeFromDob('2005-01-01')).toBe('18_24')
    expect(deriveAgeRangeFromDob('2000-01-01')).toBe('25_34')
    expect(deriveAgeRangeFromDob('1990-01-01')).toBe('35_50')
    expect(deriveAgeRangeFromDob('1970-01-01')).toBe('50_plus')
  })

  it('respects whether birthday has occurred this year', () => {
    expect(deriveAgeRangeFromDob('2001-04-17')).toBe('25_34') // age 25
    expect(deriveAgeRangeFromDob('2001-04-19')).toBe('18_24') // still 24
    expect(deriveAgeRangeFromDob('2001-04-18')).toBe('25_34') // 25 today
  })

  it('floors under-18 to 18_24 so avatar logic always has a value', () => {
    expect(deriveAgeRangeFromDob('2016-01-01')).toBe('18_24')
  })
})

describe('parseDmyToAgeRange', () => {
  it('rejects bad format', () => {
    expect(parseDmyToAgeRange('')).toBeNull()
    expect(parseDmyToAgeRange('abc')).toBeNull()
    expect(parseDmyToAgeRange('1/1/1990')).toBeNull()
    expect(parseDmyToAgeRange('1990-06-15')).toBeNull()
    expect(parseDmyToAgeRange('15/06/90')).toBeNull()
    expect(parseDmyToAgeRange('15/06/1990x')).toBeNull()
  })

  it('rejects impossible calendar dates', () => {
    expect(parseDmyToAgeRange('31/02/1990')).toBeNull()
    expect(parseDmyToAgeRange('29/02/2023')).toBeNull()
    expect(parseDmyToAgeRange('32/01/1990')).toBeNull()
    expect(parseDmyToAgeRange('15/13/1990')).toBeNull()
    expect(parseDmyToAgeRange('00/00/0000')).toBeNull()
  })

  it('accepts valid leap-year dates', () => {
    expect(parseDmyToAgeRange('29/02/2000')).toBe('25_34')
  })

  it('rejects ages outside sane range (13–110)', () => {
    expect(parseDmyToAgeRange('01/01/2020')).toBeNull()
    expect(parseDmyToAgeRange('01/01/1900')).toBeNull()
  })

  it('floors 13–17 to 18_24 so avatar logic always has a value', () => {
    expect(parseDmyToAgeRange('18/04/2011')).toBe('18_24')
  })

  it('trims whitespace', () => {
    expect(parseDmyToAgeRange('  15/06/1990  ')).toBe('35_50')
  })
})

describe('parseDmyToAgeRange bucket boundaries', () => {
  it('18_24 covers 18–24', () => {
    expect(parseDmyToAgeRange('18/04/2008')).toBe('18_24')
    expect(parseDmyToAgeRange('18/04/2002')).toBe('18_24')
  })

  it('25_34 covers 25–34', () => {
    expect(parseDmyToAgeRange('18/04/2001')).toBe('25_34')
    expect(parseDmyToAgeRange('18/04/1992')).toBe('25_34')
  })

  it('35_50 covers 35–50', () => {
    expect(parseDmyToAgeRange('18/04/1991')).toBe('35_50')
    expect(parseDmyToAgeRange('18/04/1976')).toBe('35_50')
  })

  it('50_plus covers 51+', () => {
    expect(parseDmyToAgeRange('18/04/1975')).toBe('50_plus')
    expect(parseDmyToAgeRange('18/04/1950')).toBe('50_plus')
  })
})

describe('AGE_RANGE_SKIP_DEFAULT', () => {
  it('is a neutral bucket (avoids K/H/F avatar branches)', () => {
    expect(AGE_RANGE_SKIP_DEFAULT).toBe('25_34')
  })
})
