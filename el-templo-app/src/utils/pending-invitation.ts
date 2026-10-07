/**
 * Código de invitación pendiente (Fase 194, plan 28, D-06).
 *
 * El link de invitación (`/invitacion/:code`, o el viejo `/register?ref=`) puede
 * abrirse SIN sesión: el código se recuerda localmente mientras la persona se
 * registra o inicia sesión y se consume en "Activar invitación". El storage solo
 * recuerda el código (T-194-87): el servidor valida todo al activar.
 *
 * Lógica pura sobre un storage inyectable (testeable en entorno node); en runtime
 * se usa `localStorage` vía `pendingInvitation`. NO guarda teléfono ni datos
 * personales: el teléfono tipeado en el registro viaja por memoria
 * (`rememberPhoneForActivation`), nunca por storage persistente.
 */
import { createLogger } from 'src/utils/logger'

export interface PendingInvitationStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const PENDING_INVITATION_KEY = 'pendingInvitation'
/** Pasada una semana el código pendiente se descarta (el cupo y las reglas cambian). */
export const PENDING_INVITATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// Mismo formato que acepta el servidor (`code`: 1..24, [A-Za-z0-9-]): PREFIJO-XXXX.
const CODE_PATTERN = /^[A-Z0-9-]{1,24}$/

/**
 * Motivos de `eligibility`/`activate` que no se resuelven reintentando: el código
 * pendiente se limpia al verlos (D-26). `inviter_not_member`/`inviter_quota_exhausted`
 * dependen del invitador y NO están acá (pueden cambiar).
 */
const DEFINITIVE_REASONS: ReadonlySet<string> = new Set([
  'invitee_is_member',
  'invitee_recent_member',
  'invitee_recent_invitation',
  'self_invite',
  'inviter_not_found',
])

export function isDefinitiveInvitationReason(reason: string | null | undefined): boolean {
  return !!reason && DEFINITIVE_REASONS.has(reason)
}

/** trim + mayúsculas; null si no tiene el formato de un código (vacío, > 24, caracteres raros). */
export function normalizeInvitationCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toUpperCase()
  return CODE_PATTERN.test(code) ? code : null
}

interface StoredPending {
  code: string
  savedAt: number
}

/** Guarda el código (normalizado) con su timestamp. Devuelve false si el código no es válido. */
export function savePendingInvitation(
  storage: PendingInvitationStorage,
  raw: unknown,
  now: number = Date.now(),
): boolean {
  const code = normalizeInvitationCode(raw)
  if (!code) return false
  const value: StoredPending = { code, savedAt: now }
  storage.setItem(PENDING_INVITATION_KEY, JSON.stringify(value))
  return true
}

/** Lee el código pendiente; null si no hay, está corrupto o pasaron más de 7 días (y lo borra). */
export function readPendingInvitation(
  storage: PendingInvitationStorage,
  now: number = Date.now(),
): string | null {
  const raw = storage.getItem(PENDING_INVITATION_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      const { code, savedAt } = parsed as Partial<StoredPending>
      const valid = normalizeInvitationCode(code)
      if (valid && typeof savedAt === 'number' && now - savedAt <= PENDING_INVITATION_MAX_AGE_MS) {
        return valid
      }
    }
  } catch {
    // JSON corrupto: se trata como "no hay pendiente" y se limpia abajo.
  }
  storage.removeItem(PENDING_INVITATION_KEY)
  return null
}

export function clearPendingInvitation(storage: PendingInvitationStorage): void {
  storage.removeItem(PENDING_INVITATION_KEY)
}

// ---- Runtime: localStorage best-effort (modo privado / cuota llena nunca bloquean el flujo) ----

const log = createLogger('pending-invitation')

function browserStorage(): PendingInvitationStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch (err: unknown) {
    log.warn('localStorage no disponible', {
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

function guarded<T>(fallback: T, action: (storage: PendingInvitationStorage) => T): T {
  const storage = browserStorage()
  if (!storage) return fallback
  try {
    return action(storage)
  } catch (err: unknown) {
    log.warn('storage de invitación falló', {
      err: err instanceof Error ? err.message : String(err),
    })
    return fallback
  }
}

export const pendingInvitation = {
  save: (raw: unknown): boolean => guarded(false, (s) => savePendingInvitation(s, raw)),
  read: (): string | null => guarded(null, (s) => readPendingInvitation(s)),
  clear: (): void => guarded(undefined, (s) => clearPendingInvitation(s)),
}

// ---- Teléfono del registro → "Activar invitación" (solo memoria, sin PII persistente) ----

let rememberedPhone: string | null = null

/** El registro ya pidió el teléfono: se lo pasa a la pantalla de activación para no tipearlo dos veces. */
export function rememberPhoneForActivation(phone: string | null | undefined): void {
  const trimmed = (phone ?? '').trim()
  rememberedPhone = trimmed ? trimmed : null
}

/** Devuelve el teléfono recordado y lo olvida (se consume una sola vez). */
export function takeRememberedPhone(): string | null {
  const phone = rememberedPhone
  rememberedPhone = null
  return phone
}
