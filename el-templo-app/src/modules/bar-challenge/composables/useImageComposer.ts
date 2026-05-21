import { createLogger } from 'src/utils/logger'

const logger = createLogger('image-composer')

/**
 * Canvas-based photo + frame composer for the "Desafío de la Barra" event.
 *
 * Composes the user-taken photo with a transparent PNG frame on an offscreen
 * canvas (1080x1920, IG-stories vertical ratio). The photo is drawn in
 * `object-fit: cover` style (center-cropped, zero letterbox) and the frame is
 * overlaid at full canvas size. Exports as JPEG with quality 0.85.
 *
 * Locked decisions:
 * - D-16: Canvas 1080x1920, photo cover-centered.
 * - D-19: Returns a `Promise<Blob>` of `image/jpeg` @ 0.85 quality.
 *
 * Pure composable — no subscriptions, no `cleanup()` needed.
 */
export function useImageComposer() {
  const TARGET_WIDTH = 1080
  const TARGET_HEIGHT = 1920
  const EXPORT_MIME = 'image/jpeg'
  const EXPORT_QUALITY = 0.85

  /**
   * Loads an image from a URL or data URL into an HTMLImageElement.
   * Wraps the imperative onload/onerror API in a Promise.
   */
  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${src.slice(0, 64)}`))
      // crossOrigin is safe to set even for same-origin assets; allows future
      // CDN-hosted frames if the no-CDN policy is ever relaxed.
      img.crossOrigin = 'anonymous'
      img.src = src
    })
  }

  /**
   * Ensures a base64 string has a data URL prefix. If it already has one
   * (`data:image/...;base64,...`), returns it unchanged; otherwise prepends
   * `data:image/jpeg;base64,`.
   */
  function normalizeBase64(input: string): string {
    if (input.startsWith('data:')) {
      return input
    }
    return `data:image/jpeg;base64,${input}`
  }

  /**
   * Composes the user photo with a transparent frame and returns a JPEG Blob.
   *
   * Algorithm:
   * 1. Create offscreen canvas at 1080x1920.
   * 2. Load photo from base64 (raw or data URL).
   * 3. Draw photo `cover`-centered: scale by `max(targetW/srcW, targetH/srcH)`,
   *    center the result inside the canvas. Crop happens implicitly via canvas
   *    bounds.
   * 4. Load frame PNG from `framePath` and draw at full canvas size on top.
   * 5. Export the canvas via `toBlob` as `image/jpeg` quality 0.85.
   *
   * @param photoBase64 - Base64 data URL (`data:image/...;base64,...`) or raw
   *                      base64 string (e.g. from `@capacitor/camera`).
   * @param framePath   - Public-relative path to the frame PNG
   *                      (e.g. `/desafio-barra/marco-placeholder.png`).
   * @returns Promise resolving to a JPEG Blob ready for sharing or download.
   * @throws Error if Canvas 2D is unavailable, image loading fails, or
   *         `toBlob` returns null.
   */
  async function composeWithFrame(photoBase64: string, framePath: string): Promise<Blob> {
    try {
      const canvas: HTMLCanvasElement = document.createElement('canvas')
      canvas.width = TARGET_WIDTH
      canvas.height = TARGET_HEIGHT

      const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Canvas 2D no disponible')
      }

      const photoSrc = normalizeBase64(photoBase64)
      const photo: HTMLImageElement = await loadImage(photoSrc)

      // Cover-centered draw: scale to the max ratio so the canvas is fully
      // covered; center horizontally and vertically; overflow is cropped.
      const scale = Math.max(TARGET_WIDTH / photo.width, TARGET_HEIGHT / photo.height)
      const drawWidth = photo.width * scale
      const drawHeight = photo.height * scale
      const dx = (TARGET_WIDTH - drawWidth) / 2
      const dy = (TARGET_HEIGHT - drawHeight) / 2
      ctx.drawImage(photo, dx, dy, drawWidth, drawHeight)

      const frame: HTMLImageElement = await loadImage(framePath)
      ctx.drawImage(frame, 0, 0, TARGET_WIDTH, TARGET_HEIGHT)

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('canvas.toBlob devolvió null'))
            }
          },
          EXPORT_MIME,
          EXPORT_QUALITY,
        )
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('compose failed', { error: message })
      throw err
    }
  }

  return { composeWithFrame }
}
