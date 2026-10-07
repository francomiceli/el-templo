import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { InAppReview } from '@capacitor-community/in-app-review'
import { createLogger } from 'src/utils/logger'

/**
 * Pedido de reseña nativa de las tiendas (fase 195, D-14).
 *
 * Reglas de las tiendas: se usa SOLO la API nativa, sin preguntar antes si la
 * app le gusta al usuario (nada de "gating") y con poca frecuencia. Acá: recién
 * tras 14 días desde el primer uso y como mucho una vez cada 120 días.
 */
export const REVIEW_FIRST_SEEN_KEY = 'in_app_review_first_seen_v1'
export const REVIEW_LAST_REQUEST_KEY = 'in_app_review_last_request_v1'
export const MIN_DAYS_SINCE_FIRST_SEEN = 14
export const MIN_DAYS_BETWEEN_REQUESTS = 120

const DAY_MS = 24 * 60 * 60 * 1000
const log = createLogger('in-app-review')

export interface ReviewState {
  /** Epoch ms del primer uso registrado (null = todavía no se registró). */
  firstSeenAt: number | null
  /** Epoch ms del último pedido hecho (null = nunca se pidió). */
  lastRequestedAt: number | null
  /** Epoch ms actual. */
  now: number
}

/** Puro: ¿corresponde pedir la reseña ahora? */
export function shouldRequestReview({ firstSeenAt, lastRequestedAt, now }: ReviewState): boolean {
  if (firstSeenAt === null) return false
  if (now - firstSeenAt < MIN_DAYS_SINCE_FIRST_SEEN * DAY_MS) return false
  if (lastRequestedAt !== null && now - lastRequestedAt < MIN_DAYS_BETWEEN_REQUESTS * DAY_MS) {
    return false
  }
  return true
}

/** Lee un timestamp guardado; un valor corrupto cuenta como "no hay dato". */
async function readTimestamp(key: string): Promise<number | null> {
  const { value } = await Preferences.get({ key })
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

let inFlight: Promise<void> | null = null

async function run(): Promise<void> {
  try {
    const now = Date.now()
    const firstSeenAt = await readTimestamp(REVIEW_FIRST_SEEN_KEY)
    if (firstSeenAt === null) {
      // Primer uso: solo se registra la fecha, nunca se pide en el mismo momento.
      await Preferences.set({ key: REVIEW_FIRST_SEEN_KEY, value: String(now) })
      return
    }
    const lastRequestedAt = await readTimestamp(REVIEW_LAST_REQUEST_KEY)
    if (!shouldRequestReview({ firstSeenAt, lastRequestedAt, now })) return

    await InAppReview.requestReview()
    // Se guarda solo si el pedido no falló: si falla se reintenta en otra sesión.
    await Preferences.set({ key: REVIEW_LAST_REQUEST_KEY, value: String(now) })
    log.info('Review requested')
  } catch (err: unknown) {
    // Nunca rompe la UI: la reseña es un extra.
    log.warn('Review request skipped', { error: err instanceof Error ? err.message : String(err) })
  }
}

/** Pide la reseña si corresponde. Solo iOS/Android; no hace nada en web. */
export function maybeRequestReview(): Promise<void> {
  if (Capacitor.getPlatform() === 'web') return Promise.resolve()
  // Una sola evaluación a la vez (evita doble pedido si el layout dispara dos veces).
  if (inFlight) return inFlight
  inFlight = run().finally(() => {
    inFlight = null
  })
  return inFlight
}
