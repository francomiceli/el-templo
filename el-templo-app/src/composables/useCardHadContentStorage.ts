/**
 * useCardHadContentStorage
 *
 * Fase 203, D-02 + D-03: persiste, por socio, un booleano por card que dice si la última vez
 * tuvo contenido ("tuvo contenido"). Con ese flag, una card que puede terminar vacía
 * (Novedades, Patrocinadores, ...) reserva su lugar con un esqueleto SOLO si la vez anterior
 * mostró algo, y no hace saltar el layout al resolverse.
 *
 * D-03: se guardan SOLO booleanos por card, nunca contenido (textos, ids, reservas). Aunque
 * el JSON del teléfono sea manipulado, al leer se descarta toda clave desconocida y todo valor
 * que no sea booleano; el peor caso es un salto de layout.
 *
 * Mismo patrón dual-path que useTipsSeenStorage / useLevelSelectionStorage: Capacitor
 * Preferences en nativo, localStorage en web; UNA clave JSON por socio
 * (`eltemplo.cardHadContent:<userId>`) para que un dispositivo compartido no mezcle socios.
 * Best-effort: las fallas se logean y se swallean (leer devuelve `{}`).
 */

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { createLogger } from 'src/utils/logger'

export type CardKey = 'novedades' | 'sponsors' | 'checkIn' | 'weekStrip' | 'evaluation'
export type CardHadContentMap = Partial<Record<CardKey, boolean>>

const KEY_PREFIX = 'eltemplo.cardHadContent:'
const CARD_KEYS: readonly CardKey[] = [
  'novedades',
  'sponsors',
  'checkIn',
  'weekStrip',
  'evaluation',
]
const log = createLogger('useCardHadContentStorage')

/** Deja solo las CardKey conocidas con valor booleano. Cualquier otra cosa se descarta. */
function sanitize(raw: unknown): CardHadContentMap {
  const result: CardHadContentMap = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return result
  const record = raw as Record<string, unknown>
  for (const key of CARD_KEYS) {
    const value = record[key]
    if (typeof value === 'boolean') result[key] = value
  }
  return result
}

export function useCardHadContentStorage() {
  const isNative = Capacitor.isNativePlatform()
  const keyFor = (userId: number) => `${KEY_PREFIX}${userId}`

  async function read(userId: number): Promise<CardHadContentMap> {
    try {
      let raw: string | null
      if (isNative) {
        const { value } = await Preferences.get({ key: keyFor(userId) })
        raw = value ?? null
      } else {
        raw = localStorage.getItem(keyFor(userId))
      }
      if (raw === null) return {}
      return sanitize(JSON.parse(raw))
    } catch (err: unknown) {
      log.warn('read failed', {
        err: err instanceof Error ? err.message : String(err),
      })
      return {}
    }
  }

  async function write(userId: number, map: CardHadContentMap): Promise<void> {
    try {
      const value = JSON.stringify(sanitize(map))
      if (isNative) {
        await Preferences.set({ key: keyFor(userId), value })
        return
      }
      localStorage.setItem(keyFor(userId), value)
    } catch (err: unknown) {
      log.warn('write failed', {
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { read, write }
}
