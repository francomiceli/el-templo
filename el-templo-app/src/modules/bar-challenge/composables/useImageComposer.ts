import { createLogger } from 'src/utils/logger'

const logger = createLogger('image-composer')

export interface ComposeOptions {
  /** Segundos aguantados. Si >= 90 el título cambia a "DESAFÍO AURA: Xs!". */
  secondsHeld: number
  /** Flag de completado (true si secondsHeld >= 90). */
  completed: boolean
}

/**
 * Canvas-based composer para la foto compartida del Desafío AURA.
 *
 * Renderiza sobre un canvas 1080x1920 (IG-stories vertical):
 *  1. Foto del usuario en `object-fit: cover` (center-cropped).
 *  2. Gradientes oscuros arriba y abajo para legibilidad del overlay.
 *  3. Título dinámico arriba:
 *     - "DESAFÍO AURA"        (no completó)
 *     - "DESAFÍO AURA: X segundos!" (completó, X = segundos aguantados)
 *  4. Tres logos abajo alineados horizontalmente: El Templo, Calamar Loco, AURA Club.
 *
 * Exporta JPEG @ 0.85 quality.
 */
export function useImageComposer() {
  const TARGET_WIDTH = 1080
  const TARGET_HEIGHT = 1920
  const EXPORT_MIME = 'image/jpeg'
  const EXPORT_QUALITY = 0.85

  // Assets servidos desde `public/desafio-aura/` (paths runtime).
  const LOGO_TEMPLO = '/desafio-aura/el-templo.png'
  const LOGO_CALAMAR = '/desafio-aura/calamar-loco-blanco.png'
  const LOGO_AURA = '/desafio-aura/aura-club-blanco.png'

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${src.slice(0, 64)}`))
      img.crossOrigin = 'anonymous'
      img.src = src
    })
  }

  function normalizeBase64(input: string): string {
    if (input.startsWith('data:')) return input
    return `data:image/jpeg;base64,${input}`
  }

  async function composeWithFrame(photoBase64: string, options: ComposeOptions): Promise<Blob> {
    try {
      const canvas: HTMLCanvasElement = document.createElement('canvas')
      canvas.width = TARGET_WIDTH
      canvas.height = TARGET_HEIGHT

      const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D no disponible')

      // 1. Foto (cover-centered)
      const photoSrc = normalizeBase64(photoBase64)
      const photo: HTMLImageElement = await loadImage(photoSrc)
      const scale = Math.max(TARGET_WIDTH / photo.width, TARGET_HEIGHT / photo.height)
      const drawWidth = photo.width * scale
      const drawHeight = photo.height * scale
      const dx = (TARGET_WIDTH - drawWidth) / 2
      const dy = (TARGET_HEIGHT - drawHeight) / 2
      ctx.drawImage(photo, dx, dy, drawWidth, drawHeight)

      // 2. Gradientes para legibilidad (más cortos que la versión anterior)
      const TOP_GRADIENT_H = 240
      const topGradient = ctx.createLinearGradient(0, 0, 0, TOP_GRADIENT_H)
      topGradient.addColorStop(0, 'rgba(0, 0, 0, 0.70)')
      topGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = topGradient
      ctx.fillRect(0, 0, TARGET_WIDTH, TOP_GRADIENT_H)

      // Reserva inferior para el input de respuesta de IG Stories — la zona
      // inferior de la imagen queda tapada por la UI del receptor al ver la
      // historia. Por eso los logos y el gradiente se ubican por encima de
      // esta franja.
      const BOTTOM_SAFE_AREA = 240
      const BOTTOM_GRADIENT_H = 280
      const bottomGradientEnd = TARGET_HEIGHT - BOTTOM_SAFE_AREA + 40 // pequeño solapamiento sobre el safe area
      const bottomGradient = ctx.createLinearGradient(
        0,
        bottomGradientEnd - BOTTOM_GRADIENT_H,
        0,
        bottomGradientEnd,
      )
      bottomGradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
      bottomGradient.addColorStop(1, 'rgba(0, 0, 0, 0.75)')
      ctx.fillStyle = bottomGradient
      ctx.fillRect(0, bottomGradientEnd - BOTTOM_GRADIENT_H, TARGET_WIDTH, BOTTOM_GRADIENT_H)

      // 3. Título arriba — 2 líneas cuando completó, 1 línea si no
      // Esperar a que la fuente esté disponible — sin esto el canvas usa el
      // fallback genérico del SO (Times en muchos browsers) y queda feo.
      try {
        await document.fonts.load('700 72px Montserrat')
      } catch {
        // Si la API de fonts no está disponible o falla, seguimos con el
        // fallback definido en font-family.
      }

      ctx.fillStyle = '#f0e6d6'
      ctx.font = '700 72px Montserrat, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      if (options.completed) {
        const LINE_HEIGHT = 84
        ctx.fillText('DESAFÍO AURA:', TARGET_WIDTH / 2, 100, TARGET_WIDTH - 80)
        ctx.fillText(
          `${options.secondsHeld} segundos!`,
          TARGET_WIDTH / 2,
          100 + LINE_HEIGHT,
          TARGET_WIDTH - 80,
        )
      } else {
        ctx.fillText('DESAFÍO AURA', TARGET_WIDTH / 2, 140, TARGET_WIDTH - 80)
      }

      // 4. Tres logos abajo, homogeneizados con caps duales (max width + max
      // height) — necesario porque El Templo es un wordmark con aspect ~4.4
      // que dominaría visualmente si normalizamos sólo por altura. Cada logo
      // se centra verticalmente sobre una misma línea horizontal, por lo que
      // los más bajos (Templo) y los más altos (Calamar/Aura) comparten su
      // centro óptico.
      const [templo, calamar, aura] = await Promise.all([
        loadImage(LOGO_TEMPLO),
        loadImage(LOGO_CALAMAR),
        loadImage(LOGO_AURA),
      ])

      const MAX_LOGO_W = 240
      const MAX_LOGO_H = 130
      const logos = [templo, calamar, aura]
      // Ajuste fino: AURA Club queda visualmente más "macizo" que los otros
      // (logo más cuadrado y lleno), así que lo escalamos a 85% para
      // equilibrarlo con Calamar/Templo.
      const sizeFactors = [1, 1, 0.85]
      const dims = logos.map((img, i) => {
        const factor = sizeFactors[i] as number
        const scale = Math.min(
          (MAX_LOGO_W * factor) / img.width,
          (MAX_LOGO_H * factor) / img.height,
        )
        return { w: img.width * scale, h: img.height * scale }
      })
      const totalLogoWidth = dims.reduce((sum, d) => sum + d.w, 0)
      // 4 espacios iguales: 1 a cada lado + 2 entre logos.
      const gap = (TARGET_WIDTH - totalLogoWidth) / (logos.length + 1)
      // Centro vertical compartido — los logos quedan alineados ópticamente.
      // Se ubican por encima del BOTTOM_SAFE_AREA para no quedar tapados por
      // el input de respuesta de IG Stories.
      const LOGO_ROW_CENTER_Y = TARGET_HEIGHT - BOTTOM_SAFE_AREA - MAX_LOGO_H / 2 - 30

      let x = gap
      for (let i = 0; i < logos.length; i++) {
        const img = logos[i] as HTMLImageElement
        const d = dims[i] as { w: number; h: number }
        const y = LOGO_ROW_CENTER_Y - d.h / 2
        ctx.drawImage(img, x, y, d.w, d.h)
        x += d.w + gap
      }

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('canvas.toBlob devolvió null'))
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
