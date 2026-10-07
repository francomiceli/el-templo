import { describe, it, expect, vi } from 'vitest'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { INVITATION_CODE_MAX_LENGTH, INVITATION_CODE_PATTERN } from '../invitation-code'
import { normalizeSignupCode } from '../signup-code'
import { normalizeInvitationCode } from '../pending-invitation'

// LO-10: el formato del código vive en un solo módulo; el registro y el código pendiente lo comparten.
describe('invitation-code (Fase 194 LO-10)', () => {
  it('el patrón acepta PREFIJO-XXXX y rechaza vacío, minúsculas y más de 24 caracteres', () => {
    expect(INVITATION_CODE_PATTERN.test('ABC-1234')).toBe(true)
    expect(INVITATION_CODE_PATTERN.test('')).toBe(false)
    expect(INVITATION_CODE_PATTERN.test('abc-1234')).toBe(false)
    expect(INVITATION_CODE_PATTERN.test('A'.repeat(INVITATION_CODE_MAX_LENGTH))).toBe(true)
    expect(INVITATION_CODE_PATTERN.test('A'.repeat(INVITATION_CODE_MAX_LENGTH + 1))).toBe(false)
  })

  it('lo que normaliza el registro siempre pasa el patrón del código pendiente', () => {
    const typed = '  abc-12 34!! ' + 'x'.repeat(40)
    const normalized = normalizeSignupCode(typed)
    expect(normalized.length).toBe(INVITATION_CODE_MAX_LENGTH)
    expect(normalizeInvitationCode(normalized)).toBe(normalized)
  })
})
