/**
 * Dirección del socio (calle y altura, sin piso ni depto).
 *
 * Se pide con un pop-up en Mi Templo (AddressPromptDialog: una vez, y una
 * segunda a los 14 días si lo cerró sin guardar) y queda editable en Perfil. Finalidad declarada en eltemplo.org/privacidad: conocer
 * desde dónde vienen a entrenar para planificar sedes y horarios. Por ahora
 * solo para socios de sedes de Mar del Plata.
 *
 * La API guarda un solo string (`users.address`, el mismo campo que carga
 * recepción desde el admin): acá se arma "Calle Altura" y se separa para
 * editar. La dirección es PII: no se loguea.
 */
import type { UserProfile } from 'src/stores/useUserStore'

/** Ciudad de las sedes a cuyos socios se les pide la dirección. */
export const ADDRESS_PROMPT_LOCALITY = 'Mar del Plata'

/**
 * Cadencia del pop-up (decisión de Franco 2026-11-05): si el socio lo cierra sin guardar, vuelve
 * UNA sola vez, a los 14 días; después nunca más (queda la fila en Perfil). Guardar corta todo,
 * porque `shouldAskAddress` deja de dar true.
 */
export const ADDRESS_PROMPT_MAX_SHOWS = 2
export const ADDRESS_PROMPT_RETRY_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

/** Lo que se guarda en el dispositivo, por socio (useAddressPromptStorage). */
export interface AddressPromptState {
  /** Veces que se mostró. */
  shows: number
  /** ISO de la última vez que se mostró. */
  lastShownAt: string
}

/**
 * Lee lo guardado. `null` = nunca se mostró. Algo ilegible cuenta como "ya se mostró todas las
 * veces": ante la duda, no insistir.
 */
export function parseAddressPromptState(raw: string | null): AddressPromptState | null {
  if (raw === null) return null
  const exhausted: AddressPromptState = { shows: ADDRESS_PROMPT_MAX_SHOWS, lastShownAt: '' }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'shows' in parsed &&
      'lastShownAt' in parsed &&
      typeof parsed.shows === 'number' &&
      Number.isInteger(parsed.shows) &&
      parsed.shows >= 0 &&
      typeof parsed.lastShownAt === 'string'
    ) {
      return { shows: parsed.shows, lastShownAt: parsed.lastShownAt }
    }
    return exhausted
  } catch {
    return exhausted
  }
}

/** ¿Le toca mostrarse ahora según lo que ya se mostró? */
export function canShowAddressPrompt(state: AddressPromptState | null, now: Date): boolean {
  if (state === null || state.shows === 0) return true
  if (state.shows >= ADDRESS_PROMPT_MAX_SHOWS) return false
  const last = Date.parse(state.lastShownAt)
  // Fecha ilegible o en el futuro (reloj del teléfono atrasado): no insistir.
  if (Number.isNaN(last)) return false
  return now.getTime() - last >= ADDRESS_PROMPT_RETRY_DAYS * DAY_MS
}

/** Estado después de mostrarlo ahora. */
export function recordAddressPromptShown(
  state: AddressPromptState | null,
  now: Date,
): AddressPromptState {
  return { shows: (state?.shows ?? 0) + 1, lastShownAt: now.toISOString() }
}

export interface AddressParts {
  street: string
  number: string
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

/** Arma "Calle Altura". `null` si falta alguna de las dos partes. */
export function composeAddress(parts: AddressParts): string | null {
  const street = clean(parts.street)
  const number = clean(parts.number)
  if (street === '' || number === '') return null
  return `${street} ${number}`
}

/**
 * Separa una dirección guardada para editarla: la altura es la última palabra
 * si empieza con un dígito ("Av. Colón 2450" → "Av. Colón" + "2450",
 * "Rawson 1234 bis" no matchea → todo a la calle). Lo cargado a mano desde el
 * admin puede no tener altura: entonces todo queda en la calle.
 */
export function splitAddress(address: string | null | undefined): AddressParts {
  if (!address) return { street: '', number: '' }
  const value = clean(address)
  const match = /^(.*\S)\s+(\d\S*)$/.exec(value)
  if (!match) return { street: value, number: '' }
  return { street: match[1] ?? '', number: match[2] ?? '' }
}

type AddressGateProfile = Pick<
  UserProfile,
  'role' | 'onboardingCompleted' | 'branchIsVirtual' | 'address' | 'branchLocality'
>

/**
 * ¿Le corresponde el pop-up de dirección a este perfil? Socio con onboarding
 * hecho, de una sede presencial de Mar del Plata, sin dirección cargada.
 * `address === undefined` (API vieja sin el campo) NO cuenta como "sin
 * dirección": no se pide algo que quizás ya cargó.
 */
export function shouldAskAddress(profile: AddressGateProfile | null): boolean {
  if (!profile) return false
  return (
    profile.role === 'member' &&
    profile.onboardingCompleted &&
    !profile.branchIsVirtual &&
    profile.branchLocality === ADDRESS_PROMPT_LOCALITY &&
    profile.address === null
  )
}
