import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { api } from 'src/boot/axios'
import { useUserStore } from 'src/stores/useUserStore'
import { toAvatarJpeg } from 'src/utils/avatar-image'
import { photoErrorMessage } from 'src/utils/photo-messages'
import { createLogger } from 'src/utils/logger'

// Fase 214 (plan 20): lógica de la foto de perfil propia. Sin pantallas (las dibuja la hoja del
// plan 21).
//
// Reglas que este archivo cumple (amenazas T-214-20-01..04):
//  - Lo que se sube es SIEMPRE el blob de `toAvatarJpeg` (canvas: 480 px, JPEG 0,82, sin EXIF ni
//    ubicación). El `File` o el base64 originales nunca llegan al `body` del PUT.
//  - El PUT va con `fetch` pelado: nunca con `api` (axios), que agregaría el token de la app y no
//    puede viajar al host del almacenamiento.
//  - Los logs no llevan `uploadUrl` ni `key`: solo el status HTTP y una causa corta.

/** Si el envío de la foto no termina en este tiempo, se corta. */
const PUT_TIMEOUT_MS = 90_000

type CameraModule = typeof import('@capacitor/camera')

interface UploadUrlResponse {
  uploadUrl: string
  key: string
  contentType: string
  expiresIn: number
}

/** Base64 (sin prefijo data:) a Blob. */
function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function mimeFromFormat(format: string): string {
  return format.toLowerCase() === 'jpg' ? 'image/jpeg' : `image/${format.toLowerCase()}`
}

export function useProfilePhoto() {
  const log = createLogger('useProfilePhoto')
  const userStore = useUserStore()

  const previewUrl = ref<string | null>(null)
  const uploading = ref(false)
  const error = ref<string | null>(null)
  const isNative = Capacitor.isNativePlatform()

  /** Resultado de `toAvatarJpeg`: lo único que se sube. */
  let preparedBlob: Blob | null = null
  let putController: AbortController | null = null
  let cancelledByCleanup = false

  function revokePreview(): void {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
  }

  /** Recorta y re-codifica; deja el blob listo y la vista previa armada. */
  async function prepare(source: Blob): Promise<boolean> {
    error.value = null
    try {
      const blob = await toAvatarJpeg(source)
      revokePreview()
      preparedBlob = blob
      previewUrl.value = URL.createObjectURL(blob)
      return true
    } catch (err: unknown) {
      preparedBlob = null
      revokePreview()
      const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : null
      log.warn('avatar prepare failed', {
        cause: code === 'DECODE' ? 'decode' : err instanceof Error ? err.name : 'unknown',
      })
      // Una falla del canvas que no es de formato se trata como "no se pudo procesar".
      error.value = photoErrorMessage(code === 'DECODE' ? err : { response: { status: 400 } })
      return false
    }
  }

  /** Permiso de cámara (solo nativo). `false` si quedó denegado. */
  async function ensureCameraPermission(Camera: CameraModule['Camera']): Promise<boolean> {
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

  /**
   * Cámara o galería del sistema (solo nativo). `true` si quedó una foto preparada; `false` si la
   * persona canceló (sin error) o si algo falló (con `error`). Nunca el selector "Prompt": su
   * hoja viene en inglés.
   */
  async function pickNative(which: 'camera' | 'photos'): Promise<boolean> {
    error.value = null
    if (!isNative) return false
    let cam: CameraModule
    try {
      cam = await import('@capacitor/camera')
    } catch (err: unknown) {
      log.warn('camera plugin unavailable', { error: err instanceof Error ? err.name : 'unknown' })
      error.value = photoErrorMessage({ response: { status: 400 } })
      return false
    }
    const { Camera, CameraResultType, CameraSource } = cam

    if (which === 'camera' && !(await ensureCameraPermission(Camera))) {
      error.value = photoErrorMessage({ code: 'PERMISSION' })
      return false
    }

    try {
      const photo = await Camera.getPhoto({
        source: which === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        resultType: CameraResultType.Base64,
        quality: 80,
        width: 1080,
        correctOrientation: true,
        saveToGallery: false,
      })
      if (!photo.base64String) {
        error.value = photoErrorMessage({ response: { status: 400 } })
        return false
      }
      return await prepare(base64ToBlob(photo.base64String, mimeFromFormat(photo.format)))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      // Cancelar la cámara o la galería no es un error.
      if (/cancel/i.test(message)) return false
      if (/denied|permission/i.test(message)) {
        error.value = photoErrorMessage({ code: 'PERMISSION' })
        return false
      }
      log.warn('getPhoto failed', { error: err instanceof Error ? err.name : 'unknown' })
      error.value = photoErrorMessage({ response: { status: 400 } })
      return false
    }
  }

  function pickFromCamera(): Promise<boolean> {
    return pickNative('camera')
  }

  function pickFromGallery(): Promise<boolean> {
    return pickNative('photos')
  }

  /** Web: archivo elegido en un `<input type="file">`. */
  function pickFromFile(file: File): Promise<boolean> {
    return prepare(file)
  }

  /** PUT directo a la URL firmada, sin el token de la app. Tira `{ code: 'PUT' }` si falla. */
  async function putToStorage(uploadUrl: string, blob: Blob): Promise<void> {
    const controller = new AbortController()
    putController = controller
    const timer = setTimeout(() => controller.abort(), PUT_TIMEOUT_MS)
    try {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
        signal: controller.signal,
      })
      if (!res.ok) {
        // Sin la dirección ni el cuerpo de la respuesta: solo el status.
        log.warn('avatar put rejected', { status: res.status })
        throw Object.assign(new Error('PUT rechazado'), { code: 'PUT' })
      }
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'PUT') throw err
      if (!cancelledByCleanup) log.warn('avatar put failed', { cause: 'network' })
      throw Object.assign(new Error('PUT fallido'), { code: 'PUT' })
    } finally {
      clearTimeout(timer)
      if (putController === controller) putController = null
    }
  }

  /**
   * Sube la foto preparada: pide la URL firmada (con `acceptedRules: true`, D-50), hace el PUT,
   * confirma y refresca el estado de la foto en el store. `true` si quedó en revisión.
   */
  async function upload(): Promise<boolean> {
    const blob = preparedBlob
    if (!blob || uploading.value) return false
    cancelledByCleanup = false
    uploading.value = true
    error.value = null
    try {
      const { data: signed } = await api.post<UploadUrlResponse>(
        '/members/profile-photo/upload-url',
        { contentType: 'image/jpeg', acceptedRules: true },
      )
      await putToStorage(signed.uploadUrl, blob)
      await api.post('/members/profile-photo/confirm', { key: signed.key })

      // Estado provisional por si la recarga falla; `refreshProfile` lo pisa con el del servidor.
      const current = userStore.profile?.photo
      userStore.setPhotoState({
        url: current?.url ?? null,
        status: 'pendiente',
        pendingUrl: current?.pendingUrl ?? null,
        rejectionReason: null,
      })
      await userStore.refreshProfile()
      discard()
      return true
    } catch (err: unknown) {
      if (cancelledByCleanup) return false
      const status =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined
      log.warn('avatar upload failed', {
        status: status ?? null,
        error: err instanceof Error ? err.name : 'unknown',
      })
      error.value = photoErrorMessage(err)
      return false
    } finally {
      uploading.value = false
    }
  }

  /** Quita la foto propia (D-30, D-63). */
  async function removePhoto(): Promise<boolean> {
    error.value = null
    try {
      await api.delete('/members/profile-photo')
      userStore.setPhotoState({
        url: null,
        status: 'none',
        pendingUrl: null,
        rejectionReason: null,
      })
      return true
    } catch (err: unknown) {
      log.warn('avatar remove failed', { error: err instanceof Error ? err.name : 'unknown' })
      error.value = photoErrorMessage(err)
      return false
    }
  }

  /** Descarta la foto preparada y su vista previa. */
  function discard(): void {
    preparedBlob = null
    revokePreview()
  }

  function cleanup(): void {
    cancelledByCleanup = true
    putController?.abort()
    putController = null
    discard()
  }

  return {
    isNative,
    previewUrl,
    uploading,
    error,
    pickFromCamera,
    pickFromGallery,
    pickFromFile,
    upload,
    removePhoto,
    discard,
    cleanup,
  }
}
