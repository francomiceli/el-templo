/**
 * Textos y reglas puras del estiramiento post-clase (fase 213).
 *
 * T-213-27: la app NO selecciona ejercicios ni mide nada que el servidor no mida. Todo sale de
 * `GET /sessions/stretch/today`; acá solo se formatea. Funciones puras: sin stores, sin Vue y sin
 * reloj (la hora la pasa quien llama).
 */
import type { StretchCompleteResponse, StretchDose } from '../types/stretch'

/** Segundos medidos por el servidor (desde el último `started`) que dan AURA. */
export const STRETCH_AURA_SECONDS = 180
/**
 * Margen extra antes de prometer el AURA en pantalla: el servidor mide desde que recibió el
 * `started`, no desde nuestro reloj, así que a los 180 s justos todavía puede medir 179.
 */
export const STRETCH_AURA_MARGIN_SECONDS = 2

/** "30 s", "20 a 30 s", "10 repeticiones", "1 repetición", "8 a 10 repeticiones". */
export function stretchDoseLabel(dose: StretchDose): string {
  const hasRange = dose.max !== null && dose.max > dose.value
  const amount = hasRange ? `${dose.value} a ${dose.max}` : `${dose.value}`
  if (dose.unit === 'seconds') return `${amount} s`
  const singular = !hasRange && dose.value === 1
  return `${amount} ${singular ? 'repetición' : 'repeticiones'}`
}

/**
 * true cuando ya se puede decir "Ya sumás +5 AURA": el servidor confirmó el `started` y pasaron
 * 180 s + margen desde ESE momento (no desde el reloj visible). Sin confirmación, nunca.
 */
export function stretchAuraReady(startedConfirmedAt: number | null, nowMs: number): boolean {
  if (startedConfirmedAt === null) return false
  return nowMs - startedConfirmedAt >= (STRETCH_AURA_SECONDS + STRETCH_AURA_MARGIN_SECONDS) * 1000
}

/** "7 minutos de estiramiento" / "1 minuto de estiramiento" (nunca menos de 1). */
export function stretchMinutesLabel(minutes: number): string {
  const n = Number.isFinite(minutes) ? Math.max(1, Math.round(minutes)) : 1
  return `${n} ${n === 1 ? 'minuto' : 'minutos'} de estiramiento`
}

/**
 * Línea de minutos de la pantalla final. Con `durationSeconds: null` (el `started` nunca llegó al
 * servidor) el `minutes` de la respuesta es una estimación vieja que ya no significa nada: la
 * pantalla dice "Listo." sin cifra (null = no se muestra la línea).
 */
export function stretchDoneMinutesLabel(
  res: Pick<StretchCompleteResponse, 'durationSeconds' | 'minutes'>,
): string | null {
  return res.durationSeconds === null ? null : stretchMinutesLabel(res.minutes)
}

/** Frases de cierre propias del estiramiento: aflojar, soltar, bajar un cambio (SPEC §4.2). */
export const STRETCH_CLOSING_PHRASES: readonly string[] = [
  'Soltá los hombros y la mandíbula. Ya bajaste un cambio.',
  'Aflojar también es parte del entrenamiento.',
  'Un poco de rango cada día: así se va ganando.',
]

/** Frase del día, estable para una misma fecha local (YYYY-MM-DD); fecha inválida = la primera. */
export function stretchClosingPhrase(localDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate)
  if (!match) return STRETCH_CLOSING_PHRASES[0]
  const day = Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000)
  return STRETCH_CLOSING_PHRASES[day % STRETCH_CLOSING_PHRASES.length]
}

/**
 * El cierre falló porque la oferta venció (410, D-12): el servidor manda "Este estiramiento ya
 * venció" y `useStretchCompletion` deja ese texto en `error`. Distingue "ya no se puede guardar"
 * de una falla de red, donde sí tiene sentido reintentar.
 */
export function isStretchExpiredMessage(message: string | null): boolean {
  return message !== null && /venci/i.test(message)
}
