import { ref } from 'vue'
import { createLogger } from 'src/utils/logger'
import type { CorrectionTarget, CorrectionView, CreateCorrectionBody } from '../types'
import { checkVideo, videoMimeOf, type VideoMime } from '../utils/videoFile'
import { ConquerApiError, isConquerCanceled, useConquerApi } from './useConquerApi'

// Fase 202 D-26, D-27, DA-40, DA-41, DA-42, DA-51: el alumno le manda un video de corrección a su coach.
// Lee la duración del archivo, lo valida, pide la URL firmada al bucket privado, lo sube directo y
// da de alta la corrección.
//
// Reglas que este archivo cumple (amenazas T-201-158 y T-201-159):
//  - El PUT NO pasa por CapacitorHttp ni por axios (ver `uploadWebFetch`): el video no se convierte
//    a base64 ni cruza el puente nativo.
//  - Ni la URL firmada ni la clave del objeto se loguean. Los logs llevan el status HTTP o una causa
//    en una palabra (`timeout`, `network`).
//  - El PUT va sin token del alumno y con EXACTAMENTE el Content-Type que se pidió al firmar.

/** DA-51: un video de hasta 100 MB por datos móviles puede tardar; a los 5 minutos se corta. */
export const PUT_TIMEOUT_MS = 300000
/** Si el teléfono no entrega los metadatos en este tiempo, se da por no legible. */
const DURATION_TIMEOUT_MS = 10000

const PUT_FAILED_TEXT = 'No pudimos subir el video. Revisá tu conexión y probá de nuevo.'
const OFFLINE_TEXT = 'Necesitás conexión para mandar el video.'
const CANCELLED_TEXT = 'Se canceló el envío del video.'
const API_FAILED_TEXT = 'No pudimos mandar tu video. Probá de nuevo.'
const TOPE_CODE = 'CONQUER_CORRECCIONES_TOPE'

export type CorrectionUploadFailureKind =
  /** El video no cumple tipo, peso o duración (D-27): se corrige eligiendo otro. */
  | 'invalid'
  /** Ya hay 3 videos esperando respuesta (409 `CONQUER_CORRECCIONES_TOPE`). */
  | 'tope'
  /** El bucket privado no está configurado (503) o el PUT no llegó al almacenamiento. */
  | 'storage'
  | 'offline'
  /** Se cortó porque el alumno cerró la hoja o salió de la pantalla. */
  | 'cancelled'
  /** El API rechazó el pedido: el mensaje viene del servidor. */
  | 'api'

export type CorrectionUploadOutcome =
  | { ok: true; correction: CorrectionView }
  | { ok: false; kind: CorrectionUploadFailureKind; message: string }

export type CorrectionUploadPhase = 'idle' | 'checking' | 'uploading' | 'saving'

export interface CorrectionSendInput {
  target: CorrectionTarget
  comment: string
  file: File
  /** Duración leída del archivo con `readVideoDuration`; `null` si no se pudo leer. */
  durationSec: number | null
}

interface WindowWithWebFetch extends Window {
  CapacitorWebFetch?: typeof fetch
}

/**
 * `fetch` con el que sube el video (DA-51). Con `CapacitorHttp.enabled: true` el `window.fetch` del
 * app queda parchado y manda el cuerpo por el puente nativo: un `File` pasaría a base64 en memoria
 * (hasta 100 MB) y el teléfono se queda sin RAM. Capacitor guarda el `fetch` original del WebView en
 * `window.CapacitorWebFetch`: ese sube el archivo en streaming, sin base64. A cambio es un fetch
 * común del WebView y está sujeto a CORS: el bucket privado tiene que permitir PUT desde
 * `capacitor://localhost` (iOS) y `https://localhost` (Android), además de los dominios web. En web
 * (sin Capacitor) no existe y se usa `window.fetch`, que ya es el del navegador.
 */
function uploadWebFetch(): typeof fetch {
  const webFetch = (window as WindowWithWebFetch).CapacitorWebFetch ?? window.fetch
  return webFetch.bind(window)
}

/**
 * Duración del video en segundos leyendo solo sus metadatos. `null` si el teléfono no puede leerlos
 * (formato que el WebView no decodifica, archivo roto, tiempo agotado o duración no finita). Libera
 * siempre el object URL.
 */
export function readVideoDuration(
  file: File,
  timeoutMs = DURATION_TIMEOUT_MS,
): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let timer: ReturnType<typeof setTimeout> | null = null
    let settled = false

    function finish(result: number | null): void {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(result !== null && Number.isFinite(result) ? result : null)
    }

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => finish(video.duration)
    video.onerror = () => finish(null)
    timer = setTimeout(() => finish(null), timeoutMs)
    video.src = url
    // iOS a veces no dispara `loadedmetadata` sin `load()`
    video.load()
  })
}

function failure(kind: CorrectionUploadFailureKind, message: string): CorrectionUploadOutcome {
  return { ok: false, kind, message }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** Cuerpo del alta: `exerciseId` + `step` o `comboKey`, nunca los dos (202-11). */
function buildBody(
  target: CorrectionTarget,
  comment: string,
  key: string,
  durationSec: number,
): CreateCorrectionBody {
  const text = comment.trim()
  const common = { comment: text === '' ? null : text, key, durationSec }
  if (target.kind === 'combo') return { ...common, comboKey: target.comboKey }
  return { ...common, exerciseId: target.exerciseId, step: target.step }
}

/** Traduce un fallo del API a la causa que ve el alumno. */
function apiFailure(err: unknown): CorrectionUploadOutcome {
  if (isConquerCanceled(err)) return failure('cancelled', CANCELLED_TEXT)
  if (!(err instanceof ConquerApiError)) return failure('api', API_FAILED_TEXT)
  if (err.status === null) return failure('offline', OFFLINE_TEXT)
  if (err.status === 409 && err.code === TOPE_CODE) return failure('tope', err.message)
  // 503: el API trae el copy en español del bucket sin configurar
  if (err.status === 503) return failure('storage', err.message)
  return failure('api', err.message)
}

export function useCorrectionUpload() {
  const log = createLogger('useCorrectionUpload')
  const api = useConquerApi()
  const phase = ref<CorrectionUploadPhase>('idle')
  let putController: AbortController | null = null
  let cancelledByCleanup = false

  /** PUT del video a la URL firmada. `null` = subió; si no, la causa. */
  async function putToStorage(
    target: string,
    file: File,
    mime: VideoMime,
  ): Promise<CorrectionUploadOutcome | null> {
    const controller = new AbortController()
    putController = controller
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, PUT_TIMEOUT_MS)
    try {
      const res = await uploadWebFetch()(target, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: file,
        signal: controller.signal,
      })
      if (!res.ok) {
        // Sin la dirección ni el cuerpo de la respuesta: solo el status (T-201-159)
        log.warn('correction put rejected', { status: res.status })
        return failure('storage', PUT_FAILED_TEXT)
      }
      return null
    } catch {
      if (cancelledByCleanup) return failure('cancelled', CANCELLED_TEXT)
      log.warn('correction put failed', { cause: timedOut ? 'timeout' : 'network' })
      return failure('storage', PUT_FAILED_TEXT)
    } finally {
      clearTimeout(timer)
      if (putController === controller) putController = null
    }
  }

  /** Valida, sube y da de alta la corrección. Nunca tira: devuelve el resultado. */
  async function send(input: CorrectionSendInput): Promise<CorrectionUploadOutcome> {
    cancelledByCleanup = false
    phase.value = 'checking'
    try {
      const mime = videoMimeOf(input.file)
      const check = checkVideo({
        mime,
        size: input.file.size,
        durationSec: input.durationSec,
      })
      if (!check.ok || mime === null) {
        return failure(
          'invalid',
          check.ok ? 'Solo se pueden mandar videos MP4 o MOV.' : check.message,
        )
      }
      if (isOffline()) return failure('offline', OFFLINE_TEXT)

      let signed: Awaited<ReturnType<typeof api.requestCorrectionUpload>>
      try {
        signed = await api.requestCorrectionUpload(mime)
      } catch (err: unknown) {
        return apiFailure(err)
      }

      phase.value = 'uploading'
      const put = await putToStorage(signed.uploadUrl, input.file, mime)
      if (put !== null) return put

      phase.value = 'saving'
      try {
        const correction = await api.createCorrection(
          buildBody(input.target, input.comment, signed.key, check.seconds),
        )
        return { ok: true, correction }
      } catch (err: unknown) {
        if (err instanceof ConquerApiError && !err.isExpected) {
          log.warn('correction create failed', { status: err.status })
        }
        return apiFailure(err)
      }
    } finally {
      phase.value = 'idle'
    }
  }

  /** Corta el PUT en vuelo y las llamadas pendientes. */
  function cleanup(): void {
    cancelledByCleanup = true
    putController?.abort()
    putController = null
    api.cleanup()
  }

  return { phase, send, cleanup }
}
