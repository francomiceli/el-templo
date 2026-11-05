/**
 * Dirección del socio (calle y altura, sin piso ni depto).
 *
 * Se pide UNA vez con un pop-up en Mi Templo (AddressPromptDialog) y queda
 * editable en Perfil. Finalidad declarada en eltemplo.org/privacidad: conocer
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

/** Id del "ya se mostró" en useTipsSeenStorage (por socio). */
export const ADDRESS_PROMPT_SEEN_ID = 'address_prompt_v1'

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
