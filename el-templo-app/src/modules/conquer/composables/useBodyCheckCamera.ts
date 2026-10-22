import { Capacitor } from '@capacitor/core'
import { createLogger } from 'src/utils/logger'
import type { PhotoMime, Pose } from '../types'
import {
  mimeFromCameraFormat,
  toUploadFile,
  uploadFailureText,
  type UploadFailureKind,
} from '../utils/bodyCheck'
import { ConquerApiError, isConquerCanceled, useConquerApi } from './useConquerApi'

// Fase 201 §6, S12-8 (copiado de la 196, D-04): cámara del sistema + subida privada de las fotos del
// control físico.
//
// Reglas que este archivo cumple (amenazas T-201-64..66):
//  - La foto NUNCA toca la galería (`saveToGallery: false`) ni ningún almacenamiento del teléfono o
//    del navegador. Vive como base64 en memoria del que llama hasta que la subida termina.
//  - Ni la foto, ni el base64, ni las URLs firmadas se loguean. Los logs llevan la pose, el status
//    HTTP y una causa en una palabra.
//  - El PUT va con `fetch` pelado, NUNCA con el cliente `api` (axios): ese agrega el token del
//    alumno y no puede viajar al host del almacenamiento.
//  - El Content-Type del PUT es el mismo que se pidió al firmar la URL (la firma lo incluye).

/** Foto ya sacada, todavía en memoria. */
export interface CapturedPhoto {
  base64: string
  mime: PhotoMime
}

export type CaptureFailure =
  /** El alumno cerró la cámara sin sacar nada. */
  | 'cancelled'
  /** Permiso denegado: hay que mandarlo a Ajustes. */
  | 'permission'
  /** La cámara devolvió un formato que el API no acepta. */
  | 'format'
  | 'error'

export type CaptureOutcome =
  | { ok: true; photo: CapturedPhoto }
  | { ok: false; reason: CaptureFailure; message: string }

export type UploadOutcome = { ok: true } | { ok: false; kind: UploadFailureKind; message: string }

/** Lado más largo de la foto: alcanza para comparar y no manda 10 MB por datos móviles. */
export const PHOTO_MAX_WIDTH = 1280
export const PHOTO_QUALITY = 80
/** Si el envío de la foto no termina en este tiempo, se corta y queda para reintentar. */
export const PUT_TIMEOUT_MS = 90_000

type CameraModule = typeof import('@capacitor/camera')

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function failedUpload(kind: UploadFailureKind, serverMessage?: string): UploadOutcome {
  return { ok: false, kind, message: uploadFailureText(kind, serverMessage) }
}

/**
 * Traduce un fallo del API (pedir la URL firmada o confirmar) a la causa que ve el alumno.
 * `confirming`: en la confirmación un 409 significa "el objeto no llegó" y se reintenta todo.
 */
function apiFailure(err: unknown, confirming: boolean): UploadOutcome {
  if (isConquerCanceled(err)) return failedUpload('cancelled')
  if (!(err instanceof ConquerApiError)) return failedUpload('storage')
  if (err.status === null) return failedUpload('offline')
  if (err.status === 503) return failedUpload('unavailable')
  if (err.status >= 500) return failedUpload('storage')
  if (confirming && err.status === 409) return failedUpload('storage')
  return failedUpload('rejected', err.message)
}

export function useBodyCheckCamera() {
  const log = createLogger('useBodyCheckCamera')
  const api = useConquerApi()
  let putController: AbortController | null = null
  let cancelledByCleanup = false

  /**
   * Permiso de cámara. Web: lo resuelve el navegador al abrir el selector. Nativo: `checkPermissions`
   * -> `requestPermissions` si falta; si quedó denegado (iOS no vuelve a preguntar) devuelve `false`
   * y la pantalla manda al alumno a Ajustes.
   */
  async function ensurePermission(Camera: CameraModule['Camera']): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return true
    try {
      const state = await Camera.checkPermissions()
      if (state.camera === 'granted') return true
      if (state.camera === 'prompt' || state.camera === 'prompt-with-rationale') {
        const requested = await Camera.requestPermissions({ permissions: ['camera'] })
        return requested.camera === 'granted'
      }
      return false
    } catch (err: unknown) {
      // Best-effort: que getPhoto lo intente y maneje el error.
      log.warn('camera permission check failed', {
        error: err instanceof Error ? err.name : 'unknown',
      })
      return true
    }
  }

  /** Abre la cámara del sistema (en web, el selector de archivos) y devuelve la foto en memoria. */
  async function capture(pose: Pose): Promise<CaptureOutcome> {
    let cam: CameraModule
    try {
      cam = await import('@capacitor/camera')
    } catch (err: unknown) {
      // El plugin está en package.json: si no carga, falta `cap sync` en el proyecto nativo.
      log.warn('camera plugin unavailable', {
        pose,
        error: err instanceof Error ? err.name : 'unknown',
      })
      return {
        ok: false,
        reason: 'error',
        message: 'No pudimos abrir la cámara. Actualizá la app e intentá de nuevo.',
      }
    }
    const { Camera, CameraResultType, CameraSource } = cam

    if (!(await ensurePermission(Camera))) {
      return {
        ok: false,
        reason: 'permission',
        message: 'Para sacar las fotos necesitamos permiso de cámara.',
      }
    }

    try {
      const photo = await Camera.getPhoto({
        quality: PHOTO_QUALITY,
        width: PHOTO_MAX_WIDTH,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        // T-201-64: la foto no se guarda en la galería del teléfono.
        saveToGallery: false,
        correctOrientation: true,
        // Web: selector de archivos (no hace falta el módulo de elementos de cámara).
        webUseInput: !Capacitor.isNativePlatform(),
      })
      if (!photo.base64String) {
        return { ok: false, reason: 'error', message: 'No pudimos leer la foto. Probá de nuevo.' }
      }
      const mime = mimeFromCameraFormat(photo.format)
      if (mime === null) {
        return {
          ok: false,
          reason: 'format',
          message:
            'Ese formato de foto no se puede subir. Sacala con la cámara o elegí una JPG, PNG o WebP.',
        }
      }
      return { ok: true, photo: { base64: photo.base64String, mime } }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (/cancel/i.test(message)) {
        return { ok: false, reason: 'cancelled', message: 'Cancelaste la foto.' }
      }
      // Solo la causa corta: el mensaje del plugin no lleva la foto, pero tampoco hace falta.
      log.warn('camera failed', { pose, error: err instanceof Error ? err.name : 'unknown' })
      return {
        ok: false,
        reason: 'error',
        message: 'No pudimos abrir la cámara. Podés intentar de nuevo.',
      }
    }
  }

  /** PUT de los bytes a la URL firmada (T-201-65: sin token). `null` = subió; si no, la causa. */
  async function putToStorage(
    target: string,
    file: File,
    mime: PhotoMime,
    pose: Pose,
  ): Promise<UploadOutcome | null> {
    const controller = new AbortController()
    putController = controller
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, PUT_TIMEOUT_MS)
    try {
      const res = await fetch(target, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: file,
        signal: controller.signal,
      })
      if (!res.ok) {
        // Sin la dirección ni el cuerpo de la respuesta: solo el status (T-201-66).
        log.warn('photo put rejected', { pose, status: res.status })
        return failedUpload('storage')
      }
      return null
    } catch {
      if (cancelledByCleanup) return failedUpload('cancelled')
      log.warn('photo put failed', { pose, cause: timedOut ? 'timeout' : 'network' })
      return failedUpload('storage')
    } finally {
      clearTimeout(timer)
      if (putController === controller) putController = null
    }
  }

  /**
   * Sube una foto: pide la URL firmada, la manda directo al almacenamiento privado y confirma. Una
   * foto que no sale NO se pierde: el que llama conserva el base64 (en memoria) y puede reintentar
   * el flujo completo (cada intento pide una clave nueva).
   */
  async function upload(checkId: number, pose: Pose, photo: CapturedPhoto): Promise<UploadOutcome> {
    cancelledByCleanup = false
    if (isOffline()) return failedUpload('offline')

    let file: File
    try {
      file = toUploadFile(photo.base64, photo.mime, pose)
    } catch {
      return { ok: false, kind: 'rejected', message: 'No pudimos leer la foto. Sacala de nuevo.' }
    }

    let signed: Awaited<ReturnType<typeof api.requestPhotoUpload>>
    try {
      signed = await api.requestPhotoUpload(checkId, pose, photo.mime)
    } catch (err: unknown) {
      return apiFailure(err, false)
    }

    const put = await putToStorage(signed.uploadUrl, file, photo.mime, pose)
    if (put !== null) return put

    try {
      await api.confirmPhoto(checkId, pose, signed.key)
    } catch (err: unknown) {
      return apiFailure(err, true)
    }
    return { ok: true }
  }

  /** Corta el envío de la foto en vuelo y las llamadas pendientes. */
  function cleanup(): void {
    cancelledByCleanup = true
    putController?.abort()
    putController = null
    api.cleanup()
  }

  return { capture, upload, cleanup }
}
