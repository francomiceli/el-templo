/**
 * Atribución de altas desde la app (fase 195-07, D-18).
 *
 * La web (eltemplo.org) manda al visitante a `/register` con su origen en la
 * query (`utm_*`, `fbclid`, `gclid`, `src_ref`, `landing`, `fbp`, `ft`; contrato
 * de 195-06). Este módulo:
 *  - guarda el PRIMER origen de la sesión (`captureFirstTouch`, en un boot file)
 *    para no perderlo si el visitante aterriza en `/login` u otra pantalla antes
 *    de llegar al registro, y
 *  - arma el objeto `attribution` del body de `POST /api/auth/register`
 *    (`buildSignupAttribution`), con los largos máximos del schema de la API.
 *
 * Todo es puro (storage y hora se inyectan) y nunca lanza: la atribución es
 * best-effort y jamás debe romper el arranque ni el registro. La API vuelve a
 * validar largo y charset (T-195-24).
 */

export type SignupPlatform = 'web' | 'android' | 'ios'

/** Clave de sessionStorage del first-touch de la app. */
export const FIRST_TOUCH_KEY = 'et_ft_app_v1'

/**
 * Claves del contrato con la API y largo máximo de cada una (iguales al schema
 * `signupAttributionBodySchema` de la API: un valor más largo es 400).
 */
const ATTRIBUTION_LIMITS = {
  utm_source: 150,
  utm_medium: 150,
  utm_campaign: 150,
  utm_content: 150,
  utm_term: 150,
  fbclid: 255,
  gclid: 255,
  src_ref: 255,
  landing: 500,
  fbp: 100,
  ft: 15,
} as const

type AttributionKey = keyof typeof ATTRIBUTION_LIMITS

const ATTRIBUTION_KEYS = Object.keys(ATTRIBUTION_LIMITS) as AttributionKey[]

/** Datos que, por sí solos, cuentan como "hay un origen" para guardar first-touch. */
const ORIGIN_KEYS: readonly string[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'promo',
  'src_ref',
]

export type SignupAttribution = { platform: SignupPlatform } & Partial<
  Record<AttributionKey, string>
>

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'getItem' | 'setItem'>

/** Valor de la query como string recortado y truncado (primer valor si es array). */
function readParam(query: Record<string, unknown>, key: string, max: number): string | null {
  let raw = query[key]
  if (Array.isArray(raw)) raw = raw[0]
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return cleaned === '' ? null : cleaned.slice(0, max)
}

/** `ft` es un timestamp en ms: solo dígitos, o se descarta. */
function normalizeFt(value: string | null): string | null {
  return value !== null && /^[0-9]{1,15}$/.test(value) ? value : null
}

function readQueryAttribution(
  query: Record<string, unknown>,
): Partial<Record<AttributionKey, string>> {
  const out: Partial<Record<AttributionKey, string>> = {}
  for (const key of ATTRIBUTION_KEYS) {
    // `ft` se lee sin truncar a 15: un valor más largo es inválido, no "recortable".
    const value = readParam(query, key, key === 'ft' ? 64 : ATTRIBUTION_LIMITS[key])
    if (value === null) continue
    if (key === 'ft') {
      const ft = normalizeFt(value)
      if (ft !== null) out.ft = ft
    } else {
      out[key] = value
    }
  }
  return out
}

function readStored(
  storage: StorageReader | null | undefined,
): Partial<Record<AttributionKey, string>> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(FIRST_TOUCH_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    // Se vuelve a validar: sessionStorage lo puede tocar cualquiera.
    return readQueryAttribution(parsed as Record<string, unknown>)
  } catch {
    return {}
  }
}

/** Host del referrer si es externo a eltemplo.org (y subdominios); si no, null. */
function externalReferrerHost(referrer: string): string | null {
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname
    if (host === '') return null
    if (host === 'eltemplo.org' || host.endsWith('.eltemplo.org')) return null
    return host.slice(0, ATTRIBUTION_LIMITS.src_ref)
  } catch {
    return null
  }
}

/**
 * Guarda el primer origen de la sesión. No pisa uno existente. Solo guarda si
 * hay algún dato de origen (utm, click ids, promo, `src_ref` o un referrer
 * externo). Devuelve `true` si guardó. Nunca lanza.
 */
export function captureFirstTouch(
  query: Record<string, unknown>,
  referrer: string,
  storage: StorageWriter,
  now: number,
): boolean {
  try {
    if (storage.getItem(FIRST_TOUCH_KEY)) return false

    const fromQuery = readQueryAttribution(query)
    const hasQueryOrigin = ORIGIN_KEYS.some((key) => readParam(query, key, 1) !== null)
    const referrerHost = externalReferrerHost(referrer)
    if (!hasQueryOrigin && referrerHost === null) return false

    const touch: Partial<Record<AttributionKey, string>> = { ...fromQuery }
    if (touch.src_ref === undefined && referrerHost !== null) touch.src_ref = referrerHost
    // Si la web ya trajo su timestamp de first-touch se conserva; si no, el de ahora.
    if (touch.ft === undefined) touch.ft = String(now)

    storage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch))
    return true
  } catch {
    return false
  }
}

/**
 * Arma el `attribution` del registro: la query actual manda, y lo que falte se
 * completa con el first-touch guardado. Omite vacíos y trunca a los largos de la
 * API. Sin nada de origen devuelve solo `{ platform }`. Nunca lanza.
 */
export function buildSignupAttribution(
  query: Record<string, unknown>,
  storage: StorageReader | null | undefined,
  platform: SignupPlatform,
): SignupAttribution {
  try {
    const fromQuery = readQueryAttribution(query)
    const stored = readStored(storage)
    const merged: Partial<Record<AttributionKey, string>> = { ...stored, ...fromQuery }
    // `ft` solo tiene sentido junto a un origen: la query sola con `ft` y nada
    // más no cuenta (el first-touch guardado ya trae el suyo).
    const hasOrigin = ATTRIBUTION_KEYS.some((key) => key !== 'ft' && merged[key] !== undefined)
    if (!hasOrigin) return { platform }
    return { ...merged, platform }
  } catch {
    return { platform }
  }
}

/** `Capacitor.getPlatform()` devuelve un string libre: lo que no se conoce es 'web'. */
export function toSignupPlatform(platform: string): SignupPlatform {
  return platform === 'android' || platform === 'ios' ? platform : 'web'
}

const MAX_BRANCH_NAME = 60

/**
 * Encabezado de `/register` (Pitfall 14): antes decía "Registrarse en Park" para
 * cualquier sede. Con `branchName` (lo manda la web) muestra esa sede; con solo
 * `branchId` mantiene "Park" (los QR impresos del Park, fase 57 no llevan nombre).
 */
export function registerHeaderText(query: Record<string, unknown>): string {
  const branchName = readParam(query, 'branchName', MAX_BRANCH_NAME)
  if (branchName !== null) return `Registrarse en ${branchName}`
  if (readParam(query, 'branchId', 10) !== null) return 'Registrarse en Park'
  return 'Bienvenido al Templo'
}
