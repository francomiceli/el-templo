import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import {
  PENDING_INVITATION_KEY,
  PENDING_INVITATION_MAX_AGE_MS,
  clearPendingInvitation,
  isDefinitiveInvitationReason,
  normalizeInvitationCode,
  readPendingInvitation,
  rememberPhoneForActivation,
  savePendingInvitation,
  takeRememberedPhone,
  type PendingInvitationStorage,
} from '../pending-invitation'

function memoryStorage(): PendingInvitationStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

describe('pending-invitation (Fase 194-28)', () => {
  let storage: ReturnType<typeof memoryStorage>
  beforeEach(() => {
    storage = memoryStorage()
  })

  it('guarda normalizado (mayúsculas, trim) y lo lee de vuelta', () => {
    expect(savePendingInvitation(storage, '  abc-123 ', 1_000)).toBe(true)
    expect(readPendingInvitation(storage, 1_000)).toBe('ABC-123')
  })

  it('lo guarda con timestamp: expira pasados 7 días y se borra al leerlo', () => {
    savePendingInvitation(storage, 'ABC-123', 0)
    expect(readPendingInvitation(storage, PENDING_INVITATION_MAX_AGE_MS)).toBe('ABC-123')
    expect(readPendingInvitation(storage, PENDING_INVITATION_MAX_AGE_MS + 1)).toBeNull()
    expect(storage.data.has(PENDING_INVITATION_KEY)).toBe(false)
  })

  it('clearPendingInvitation lo borra', () => {
    savePendingInvitation(storage, 'ABC-123')
    clearPendingInvitation(storage)
    expect(readPendingInvitation(storage)).toBeNull()
  })

  it('un código inválido no se guarda (vacío, > 24, caracteres raros, no string)', () => {
    expect(savePendingInvitation(storage, '')).toBe(false)
    expect(savePendingInvitation(storage, '   ')).toBe(false)
    expect(savePendingInvitation(storage, 'A'.repeat(25))).toBe(false)
    expect(savePendingInvitation(storage, 'AB CD')).toBe(false)
    expect(savePendingInvitation(storage, 'AB<script>')).toBe(false)
    expect(savePendingInvitation(storage, undefined)).toBe(false)
    expect(savePendingInvitation(storage, 123)).toBe(false)
    expect(storage.data.size).toBe(0)
  })

  it('un código inválido NO pisa uno válido ya guardado', () => {
    savePendingInvitation(storage, 'ABC-123')
    savePendingInvitation(storage, 'mal código!')
    expect(readPendingInvitation(storage)).toBe('ABC-123')
  })

  it('un valor corrupto o manipulado se trata como vacío y se limpia', () => {
    storage.setItem(PENDING_INVITATION_KEY, 'no es json')
    expect(readPendingInvitation(storage)).toBeNull()
    expect(storage.data.has(PENDING_INVITATION_KEY)).toBe(false)

    storage.setItem(PENDING_INVITATION_KEY, JSON.stringify({ code: '<x>', savedAt: Date.now() }))
    expect(readPendingInvitation(storage)).toBeNull()

    storage.setItem(PENDING_INVITATION_KEY, JSON.stringify({ code: 'ABC' }))
    expect(readPendingInvitation(storage)).toBeNull()
  })

  it('normalizeInvitationCode acepta el formato PREFIJO-XXXX', () => {
    expect(normalizeInvitationCode('fran-a3b2')).toBe('FRAN-A3B2')
    expect(normalizeInvitationCode('A'.repeat(24))).toBe('A'.repeat(24))
  })

  it('motivos definitivos vs. dependientes del invitador', () => {
    for (const reason of [
      'invitee_is_member',
      'invitee_recent_member',
      'invitee_recent_invitation',
      'self_invite',
      'inviter_not_found',
    ]) {
      expect(isDefinitiveInvitationReason(reason)).toBe(true)
    }
    expect(isDefinitiveInvitationReason('inviter_quota_exhausted')).toBe(false)
    expect(isDefinitiveInvitationReason('inviter_not_member')).toBe(false)
    expect(isDefinitiveInvitationReason('phone_taken')).toBe(false)
    expect(isDefinitiveInvitationReason(null)).toBe(false)
    expect(isDefinitiveInvitationReason(undefined)).toBe(false)
  })

  it('el teléfono del registro se recuerda en memoria y se consume una sola vez', () => {
    expect(takeRememberedPhone()).toBeNull()
    rememberPhoneForActivation(' 11 5555-1234 ')
    expect(takeRememberedPhone()).toBe('11 5555-1234')
    expect(takeRememberedPhone()).toBeNull()
    rememberPhoneForActivation('   ')
    expect(takeRememberedPhone()).toBeNull()
    rememberPhoneForActivation(undefined)
    expect(takeRememberedPhone()).toBeNull()
  })
})
