import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'

const logger = createLogger('bar-challenge-store')

/**
 * sessionStorage key donde queda parqueado el payload del intento cuando el
 * POST falla los 3 reintentos. Lo drenamos al próximo `GET /me` (lazy).
 */
const SESSION_KEY = 'bar-challenge-pending-submit'

/**
 * localStorage key del intento activo (post-launch 2026-05-22).
 *
 * D-08 original: "el state vive sólo en memoria". Roto en iOS: al abrir la
 * cámara nativa, iOS puede matar el WKWebView por presión de memoria. Al
 * volver, Capacitor relanza el WebView en `/` y el state se pierde — el
 * usuario aterriza en Mi Templo y tiene que reiniciar el desafío.
 *
 * Solución: persistir SÓLO `startTimestamp` en localStorage durante el
 * intento activo. El timer recalcula segundos desde wall-clock (D-09), así
 * que con startTimestamp basta para restaurar. La foto NO se persiste — si
 * el WebView muere mid-captura, el promise de `Camera.getPhoto()` nunca
 * resuelve y la foto se pierde antes de llegar al store de cualquier manera.
 */
const ACTIVE_ATTEMPT_KEY = 'bar-challenge-active-attempt'

/**
 * TTL del intento persistido. Si pasaron más de 10 min desde `start()`, lo
 * descartamos al restaurar — evita "attempts fantasma" si el usuario nunca
 * vuelve a abrir la app.
 */
const ACTIVE_ATTEMPT_TTL_MS = 10 * 60 * 1000

/** Threshold de "logro" — alinea con SPEC R6 (≥90s = lograste). */
const COMPLETED_THRESHOLD_SECONDS = 90

/** Backoff de reintentos del submit (D-10): 1s, 3s, 9s entre intentos. */
const RETRY_DELAYS_MS = [1000, 3000, 9000]

/**
 * Entry de la queue de submits pendientes. `queuedAt` permite drop por
 * antigüedad si en el futuro queremos TTL — hoy se respeta sin tope.
 */
interface PendingSubmit {
  secondsHeld: number
  queuedAt: number
}

/**
 * Snapshot del intento activo persistido en localStorage. `savedAt` permite
 * descartar entries vencidas vía `ACTIVE_ATTEMPT_TTL_MS`.
 */
interface PersistedActiveAttempt {
  startTimestamp: number
  savedAt: number
}

/**
 * Resultado final del intento del usuario.
 *
 * - `completed=true` → el usuario aguantó suficiente para validar la medalla
 *   (criterio del backend / SPEC R6 — actualmente >= 90s).
 * - `seconds` → segundos aguantados (entero >= 0).
 */
export interface BarChallengeAttemptResult {
  completed: boolean
  seconds: number
}

/**
 * Phase 115 — Desafío de la Barra store.
 *
 * Source of truth del flujo end-to-end del intento (Explicacion → Timer →
 * Resultado). Estado en memoria; sobrevive navegación entre las 3 rutas
 * mientras el SPA esté montado.
 *
 * Convención del proyecto:
 * - Pinia setup store (`defineStore(id, () => { ... })`) como sessionPlayerStore.
 * - Logger via `createLogger`, no direct stdout via the global log object (CLAUDE.md).
 * - Sin `any` — errores via `unknown` + narrowing (CLAUDE.md).
 *
 * Decisiones clave:
 * - **D-09 (timer math):** `secondsHeld` se recalcula desde
 *   `Date.now() - startTimestamp`, NO se incrementa con un contador en
 *   `tick()`. Garantiza robustez contra throttling del SO mientras la cámara
 *   nativa está abierta — al volver, el cronómetro refleja tiempo real.
 * - **D-08 (no persistencia):** el state vive sólo en memoria. Si el usuario
 *   hace refresh durante /timer, el flujo arranca de cero. El único uso de
 *   sessionStorage es el queue de retry-pendiente del submit fallido.
 * - **D-10 (retry submit):** POST con 3 reintentos (1s/3s/9s). Si los 3
 *   fallan, push del payload a sessionStorage; `drainPendingSubmits()` (que
 *   debe llamarse en boot / al cargar /me) lo reintenta una vez más. Si el
 *   backend devuelve 409 ("already_completed"), tratamos el intento como
 *   consumido y NO encolamos retry.
 */
export const useBarChallengeStore = defineStore('barChallenge', () => {
  // State ───────────────────────────────────────────────────────────────────
  const startTimestamp = ref<number | null>(null)
  const secondsHeld = ref<number>(0)
  const isRunning = ref<boolean>(false)
  const photoBase64 = ref<string | null>(null)
  const attemptResult = ref<BarChallengeAttemptResult | null>(null)

  // Actions ─────────────────────────────────────────────────────────────────

  /**
   * Arranca el cronómetro. Reset todo el state derivado para evitar leak entre
   * intentos consecutivos en la misma sesión (caso `?bar-challenge-force=1`
   * en staging).
   */
  function start(): void {
    const now = Date.now()
    startTimestamp.value = now
    secondsHeld.value = 0
    isRunning.value = true
    photoBase64.value = null
    attemptResult.value = null
    persistActiveAttempt(now)
    logger.info('start', { startTimestamp: now })
  }

  /**
   * Restaura un intento activo desde localStorage. Llamado por Timer.vue en
   * `onMounted` cuando hay un attempt persistido (caso típico: iOS mató el
   * WebView durante la cámara y Capacitor relanzó la app).
   *
   * No-op (devuelve `false`) si no hay attempt persistido o está vencido por
   * TTL. En ese caso el caller debe llamar `start()` normalmente.
   */
  function restoreActiveAttempt(): boolean {
    const persisted = readPersistedActiveAttempt()
    if (!persisted) return false
    startTimestamp.value = persisted.startTimestamp
    isRunning.value = true
    photoBase64.value = null
    attemptResult.value = null
    secondsHeld.value = Math.floor((Date.now() - persisted.startTimestamp) / 1000)
    logger.info('restoreActiveAttempt', {
      startTimestamp: persisted.startTimestamp,
      secondsHeld: secondsHeld.value,
    })
    return true
  }

  /**
   * Recalcula `secondsHeld` desde `Date.now() - startTimestamp`. No-op si el
   * timer no está corriendo o nunca arrancó. Se espera ser llamado por un
   * `setInterval` en `Timer.vue` (~100ms — el interval refresca UI; el
   * cálculo siempre usa wall-clock como fuente de verdad).
   */
  function tick(): void {
    if (!isRunning.value || startTimestamp.value === null) return
    secondsHeld.value = Math.floor((Date.now() - startTimestamp.value) / 1000)
  }

  /**
   * Guarda la última foto capturada (SPEC R7 — la última gana, no acumulamos
   * historial). Se llama tras `Camera.getPhoto()` en `Timer.vue`.
   */
  function setPhoto(base64: string): void {
    photoBase64.value = base64
    logger.info('setPhoto', { bytes: base64.length })
  }

  /**
   * Detiene el timer y genera `attemptResult`. Dispara `submit()` en
   * fire-and-forget (la UI no espera al backend — D-10 "optimistic UI"). Si
   * el timer nunca arrancó, no-op defensivo.
   */
  function finalize(): void {
    if (startTimestamp.value === null) {
      logger.warn('finalize called without start')
      return
    }
    const final = Math.floor((Date.now() - startTimestamp.value) / 1000)
    isRunning.value = false
    secondsHeld.value = final
    attemptResult.value = {
      completed: final >= COMPLETED_THRESHOLD_SECONDS,
      seconds: final,
    }
    clearPersistedActiveAttempt()
    logger.info('finalize', attemptResult.value)
    // Fire-and-forget — la pantalla /resultado avanza optimistic.
    void submit()
  }

  /**
   * POST del intento al backend con retry policy.
   *
   * - 4 intentos totales (1 inicial + 3 reintentos), con delays 1s/3s/9s.
   * - Tras agotar reintentos → push a sessionStorage queue;
   *   `drainPendingSubmits()` lo recoge al próximo boot / load /me.
   * - El backend sobrescribe cada submit, no rechaza retries.
   */
  async function submit(): Promise<void> {
    if (!attemptResult.value) {
      logger.warn('submit called without attemptResult')
      return
    }
    const payload = { secondsHeld: attemptResult.value.seconds }

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        await api.post('/bar-challenge/result', payload)
        logger.info('submit success', { attempt })
        return
      } catch (err: unknown) {
        if (attempt < RETRY_DELAYS_MS.length) {
          const delay = RETRY_DELAYS_MS[attempt] ?? 0
          logger.warn('submit failed, retrying', {
            attempt,
            delay,
            error: err instanceof Error ? err.message : String(err),
          })
          await sleep(delay)
          continue
        }
        // Retries agotados → enqueue.
        enqueuePending(payload.secondsHeld)
        logger.error('submit failed after retries — queued for later', {
          error: err instanceof Error ? err.message : String(err),
        })
        return
      }
    }
  }

  /**
   * Limpia todo el estado del intento. NO toca la sessionStorage queue (el
   * payload pendiente sobrevive al reset — la próxima boot lo drena).
   * Pensado para cleanup desde `Timer.vue` cuando el usuario abandona sin
   * finalizar.
   */
  function reset(): void {
    startTimestamp.value = null
    secondsHeld.value = 0
    isRunning.value = false
    photoBase64.value = null
    attemptResult.value = null
    clearPersistedActiveAttempt()
    logger.info('reset')
  }

  /**
   * Drena la queue de sessionStorage. Llamarse en app boot o tras cargar
   * `/me`. Cada entry se reintenta UNA vez:
   *
   * - éxito → drop.
   * - 409 → drop (el backend ya tiene un intento registrado).
   * - error de red → mantener en queue.
   *
   * Si la queue queda vacía, se borra la key entera.
   */
  async function drainPendingSubmits(): Promise<void> {
    let raw: string | null
    try {
      raw = sessionStorage.getItem(SESSION_KEY)
    } catch (err: unknown) {
      logger.error('drainPendingSubmits — failed to read sessionStorage', {
        error: err instanceof Error ? err.message : String(err),
      })
      return
    }
    if (!raw) return

    let queue: PendingSubmit[]
    try {
      const parsed: unknown = JSON.parse(raw)
      queue = Array.isArray(parsed) ? (parsed as PendingSubmit[]) : []
    } catch (err: unknown) {
      logger.error('drainPendingSubmits — corrupt queue, dropping', {
        error: err instanceof Error ? err.message : String(err),
      })
      try {
        sessionStorage.removeItem(SESSION_KEY)
      } catch {
        // best-effort cleanup
      }
      return
    }

    const remaining: PendingSubmit[] = []
    for (const entry of queue) {
      try {
        await api.post('/bar-challenge/result', { secondsHeld: entry.secondsHeld })
        logger.info('drain: entry submitted', { secondsHeld: entry.secondsHeld })
      } catch (err: unknown) {
        const status = extractHttpStatus(err)
        if (status === 409) {
          logger.warn('drain: 409 — dropping entry', { secondsHeld: entry.secondsHeld })
          continue
        }
        remaining.push(entry)
      }
    }

    try {
      if (remaining.length === 0) {
        sessionStorage.removeItem(SESSION_KEY)
      } else {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(remaining))
      }
    } catch (err: unknown) {
      logger.error('drainPendingSubmits — failed to write back queue', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Push del payload fallido a la queue de sessionStorage. Best-effort —
   * cualquier error de storage se loggea pero no rompe el flujo.
   */
  function enqueuePending(seconds: number): void {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      let queue: PendingSubmit[] = []
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw)
          if (Array.isArray(parsed)) queue = parsed as PendingSubmit[]
        } catch {
          // queue corrupta — la sobreescribimos
        }
      }
      queue.push({ secondsHeld: seconds, queuedAt: Date.now() })
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(queue))
    } catch (err: unknown) {
      logger.error('enqueuePending failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    // State
    startTimestamp,
    secondsHeld,
    isRunning,
    photoBase64,
    attemptResult,
    // Actions
    start,
    tick,
    setPhoto,
    finalize,
    submit,
    reset,
    restoreActiveAttempt,
    drainPendingSubmits,
  }
})

/**
 * Lee el intento activo persistido en localStorage. Devuelve `null` si:
 *  - No hay entry.
 *  - El entry está corrupto (parse falla o shape no coincide).
 *  - El entry venció por TTL.
 *
 * Si está vencido o corrupto, además limpia la key — auto-saneamiento.
 *
 * Exportado para uso desde el router guard (boot-time check antes de que la
 * store esté disponible).
 */
export function readPersistedActiveAttempt(): PersistedActiveAttempt | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(ACTIVE_ATTEMPT_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearPersistedActiveAttempt()
    return null
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { startTimestamp?: unknown }).startTimestamp !== 'number' ||
    typeof (parsed as { savedAt?: unknown }).savedAt !== 'number'
  ) {
    clearPersistedActiveAttempt()
    return null
  }
  const entry = parsed as PersistedActiveAttempt
  if (Date.now() - entry.savedAt > ACTIVE_ATTEMPT_TTL_MS) {
    clearPersistedActiveAttempt()
    return null
  }
  return entry
}

/**
 * `true` si hay un intento activo válido (no vencido) en localStorage. Helper
 * de consulta-rápida para el router guard.
 */
export function hasPersistedActiveAttempt(): boolean {
  return readPersistedActiveAttempt() !== null
}

function persistActiveAttempt(startTimestamp: number): void {
  try {
    const entry: PersistedActiveAttempt = { startTimestamp, savedAt: Date.now() }
    localStorage.setItem(ACTIVE_ATTEMPT_KEY, JSON.stringify(entry))
  } catch (err: unknown) {
    logger.error('persistActiveAttempt failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function clearPersistedActiveAttempt(): void {
  try {
    localStorage.removeItem(ACTIVE_ATTEMPT_KEY)
  } catch {
    // best-effort
  }
}

/**
 * Sleep helper para los reintentos. Aislado para tests futuros (poder mockear
 * el delay).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Narrowing seguro del status HTTP de un error (axios o nativo). Devuelve
 * `undefined` si no hay shape `response.status` reconocible.
 */
function extractHttpStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const candidate = (err as { response?: unknown }).response
  if (typeof candidate !== 'object' || candidate === null) return undefined
  const status = (candidate as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}
