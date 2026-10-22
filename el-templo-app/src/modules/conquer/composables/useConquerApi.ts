import axios from 'axios'
import { api } from 'src/boot/axios'
import type {
  BodyCheckView,
  BodyChecksResponse,
  BodyCheckSummary,
  ChangeStepBody,
  ComboKey,
  ConquerStateResponse,
  CountedStep,
  GuideSeenResponse,
  PhotoUploadResponse,
  PhotoUrlResponse,
  Pose,
  ProgressResponse,
  PublishPermission,
  PublishPermissionBody,
  SaveSessionBody,
  SaveSessionResponse,
  StepKey,
  SubirComboResponse,
  TodayResponse,
  TodayStep,
  UpsertBodyCheckBody,
} from '../types'

/**
 * Error de una llamada a Conquer. `message` es siempre apto para mostrarle al socio (el `error` en
 * español del API o el texto fijo de la acción); el detalle técnico queda en `detail` para el log
 * (T-201-56). `code` es el `CONQUER_...` del API cuando el app necesita ramificar.
 */
export class ConquerApiError extends Error {
  readonly status: number | null
  readonly code: string | null
  readonly detail: string

  constructor(message: string, status: number | null, code: string | null, detail: string) {
    super(message)
    this.name = 'ConquerApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }

  /** 4xx con respuesta: el socio puede corregirlo, no es un error para Sentry. */
  get isExpected(): boolean {
    return this.status !== null && this.status >= 400 && this.status < 500
  }
}

/** La llamada se abortó con `cleanup()`: quien la pidió ya no está mirando. */
export function isConquerCanceled(err: unknown): boolean {
  return axios.isCancel(err)
}

function readString(data: unknown, key: string): string | null {
  if (typeof data !== 'object' || data === null) return null
  const value = (data as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Convierte un fallo de axios en `ConquerApiError`. Solo los errores de negocio del API (los que
 * traen `code` `CONQUER_...`, con el copy ya en español) le llegan al socio con su `error`: el
 * resto (400 de validación en inglés, 5xx, sin respuesta) va con el texto fijo de la acción.
 */
function toApiError(err: unknown, fallback: string): ConquerApiError {
  if (axios.isAxiosError(err)) {
    const code = readString(err.response?.data, 'code')
    const apiMessage = code?.startsWith('CONQUER_') ? readString(err.response?.data, 'error') : null
    return new ConquerApiError(
      apiMessage ?? fallback,
      err.response?.status ?? null,
      code,
      err.message,
    )
  }
  const detail = err instanceof Error ? err.message : String(err)
  return new ConquerApiError(fallback, null, null, detail)
}

/**
 * Cliente tipado de las rutas del alumno de Conquer (`/members/conquer/*`, la base de `api` ya trae
 * `/api`). Cada llamada tiene su `AbortController`; `cleanup()` aborta las que sigan en vuelo.
 * Los fallos se re-lanzan como `ConquerApiError` (el `message` va al Notify); un abort se re-lanza
 * tal cual y se reconoce con `isConquerCanceled`.
 */
export function useConquerApi() {
  const BASE = '/members/conquer'
  const controllers = new Set<AbortController>()

  async function call<T>(
    fallback: string,
    run: (signal: AbortSignal) => Promise<{ data: T }>,
  ): Promise<T> {
    const controller = new AbortController()
    controllers.add(controller)
    try {
      const response = await run(controller.signal)
      return response.data
    } catch (err: unknown) {
      if (axios.isCancel(err)) throw err
      throw toApiError(err, fallback)
    } finally {
      controllers.delete(controller)
    }
  }

  /** GET /state: bloqueado | pedido | activo (D-12). */
  function getState(): Promise<ConquerStateResponse> {
    return call('No pudimos cargar Conquer. Probá de nuevo.', (signal) =>
      api.get<ConquerStateResponse>(`${BASE}/state`, { signal }),
    )
  }

  /** POST /unlock-request: idempotente (D-12). */
  function requestUnlock(): Promise<ConquerStateResponse> {
    return call('No pudimos enviar tu pedido. Probá de nuevo.', (signal) =>
      api.post<ConquerStateResponse>(`${BASE}/unlock-request`, {}, { signal }),
    )
  }

  /** GET /today?day=<dayKey>: sin `day`, el que toca (D-16). */
  function getToday(day?: string): Promise<TodayResponse> {
    return call('No pudimos cargar la sesión de hoy. Probá de nuevo.', (signal) =>
      api.get<TodayResponse>(`${BASE}/today`, { params: day ? { day } : undefined, signal }),
    )
  }

  /** PUT /sessions: guarda la sesión del día (la fecha la pone el servidor). */
  function saveSession(body: SaveSessionBody): Promise<SaveSessionResponse> {
    return call('No pudimos guardar la sesión. Probá de nuevo.', (signal) =>
      api.put<SaveSessionResponse>(`${BASE}/sessions`, body, { signal }),
    )
  }

  /** PUT /steps/:exerciseId/:step: cambia el peldaño y el modo de un escalón. */
  function changeStep(exerciseId: number, step: StepKey, body: ChangeStepBody): Promise<TodayStep> {
    return call('No pudimos cambiar la progresión. Probá de nuevo.', (signal) =>
      api.put<TodayStep>(`${BASE}/steps/${exerciseId}/${step}`, body, { signal }),
    )
  }

  /** GET /progress. */
  function getProgress(): Promise<ProgressResponse> {
    return call('No pudimos cargar tu progreso. Probá de nuevo.', (signal) =>
      api.get<ProgressResponse>(`${BASE}/progress`, { signal }),
    )
  }

  /** POST /steps/:exerciseId/:step/subir: sube un peldaño (sin aprobación del coach, D-06). */
  function subirStep(exerciseId: number, step: CountedStep): Promise<ProgressResponse> {
    return call('No pudimos subir la progresión. Probá de nuevo.', (signal) =>
      api.post<ProgressResponse>(`${BASE}/steps/${exerciseId}/${step}/subir`, {}, { signal }),
    )
  }

  /** POST /calibration/:exerciseId: acepta o rechaza la propuesta de calibración. */
  function resolveCalibration(exerciseId: number, accept: boolean): Promise<ProgressResponse> {
    return call('No pudimos guardar tu respuesta. Probá de nuevo.', (signal) =>
      api.post<ProgressResponse>(`${BASE}/calibration/${exerciseId}`, { accept }, { signal }),
    )
  }

  /** POST /combos/:comboKey/subir: sube el peldaño de arranque del combo (D-14). */
  function subirCombo(comboKey: ComboKey): Promise<SubirComboResponse> {
    return call('No pudimos subir el combo. Probá de nuevo.', (signal) =>
      api.post<SubirComboResponse>(`${BASE}/combos/${comboKey}/subir`, {}, { signal }),
    )
  }

  /** POST /body-checks: crea o continúa el control de hoy con las medidas que vengan. */
  function upsertBodyCheck(body: UpsertBodyCheckBody): Promise<BodyCheckView> {
    return call('No pudimos guardar tu control. Probá de nuevo.', (signal) =>
      api.post<BodyCheckView>(`${BASE}/body-checks`, body, { signal }),
    )
  }

  /** GET /body-checks. */
  function listBodyChecks(): Promise<BodyChecksResponse> {
    return call('No pudimos cargar tus controles. Probá de nuevo.', (signal) =>
      api.get<BodyChecksResponse>(`${BASE}/body-checks`, { signal }),
    )
  }

  /** POST /body-checks/:checkId/photos/:pose/upload-url: URL firmada para subir la foto. */
  function requestPhotoUpload(
    checkId: number,
    pose: Pose,
    contentType: string,
  ): Promise<PhotoUploadResponse> {
    return call('No pudimos preparar la foto. Probá de nuevo.', (signal) =>
      api.post<PhotoUploadResponse>(
        `${BASE}/body-checks/${checkId}/photos/${pose}/upload-url`,
        { contentType },
        { signal },
      ),
    )
  }

  /** POST /body-checks/:checkId/photos/:pose/confirm: confirma la foto ya subida. */
  function confirmPhoto(checkId: number, pose: Pose, key: string): Promise<BodyCheckView> {
    return call('No pudimos guardar la foto. Probá de nuevo.', (signal) =>
      api.post<BodyCheckView>(
        `${BASE}/body-checks/${checkId}/photos/${pose}/confirm`,
        { key },
        { signal },
      ),
    )
  }

  /** GET /body-checks/:checkId/photos/:pose/url: URL firmada que dura 5 minutos. */
  function getPhotoUrl(checkId: number, pose: Pose): Promise<PhotoUrlResponse> {
    return call('No pudimos cargar la foto. Probá de nuevo.', (signal) =>
      api.get<PhotoUrlResponse>(`${BASE}/body-checks/${checkId}/photos/${pose}/url`, { signal }),
    )
  }

  /** POST /body-checks/skip-day0: "Lo hago después" (D-15). */
  function skipDay0(): Promise<BodyCheckSummary> {
    return call('No pudimos guardar tu respuesta. Probá de nuevo.', (signal) =>
      api.post<BodyCheckSummary>(`${BASE}/body-checks/skip-day0`, {}, { signal }),
    )
  }

  /** POST /guide-seen: la guía "¿Cómo funciona?" ya se vio (DA-21). */
  function markGuideSeen(): Promise<GuideSeenResponse> {
    return call('No pudimos guardar que viste la guía. Probá de nuevo.', (signal) =>
      api.post<GuideSeenResponse>(`${BASE}/guide-seen`, {}, { signal }),
    )
  }

  /** PUT /publish-permission: autorizar o retirar la publicación del antes y después. */
  function setPublishPermission(body: PublishPermissionBody): Promise<PublishPermission> {
    return call('No pudimos guardar tu autorización. Probá de nuevo.', (signal) =>
      api.put<PublishPermission>(`${BASE}/publish-permission`, body, { signal }),
    )
  }

  /** Aborta todas las llamadas en vuelo (lo llama la vista al desmontarse). */
  function cleanup(): void {
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
  }

  return {
    getState,
    requestUnlock,
    getToday,
    saveSession,
    changeStep,
    getProgress,
    subirStep,
    resolveCalibration,
    subirCombo,
    upsertBodyCheck,
    listBodyChecks,
    requestPhotoUpload,
    confirmPhoto,
    getPhotoUrl,
    skipDay0,
    markGuideSeen,
    setPublishPermission,
    cleanup,
  }
}
