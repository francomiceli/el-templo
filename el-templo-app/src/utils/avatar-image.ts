/**
 * Fase 214 (plan 20): preparación de la foto de perfil antes de subirla.
 *
 * Re-codificar por canvas descarta EXIF y ubicación GPS (el servidor no recodifica, D-39) y reduce
 * el peso de la foto, por eso nunca se rechaza por pesada (D-33). Lo que se sube es SIEMPRE el
 * `Blob` de `toAvatarJpeg`; el archivo original no sale del teléfono.
 */

export const AVATAR_SIDE = 480
export const AVATAR_QUALITY = 0.82

export interface SquareCrop {
  /** Origen del recorte en la imagen original. */
  sx: number
  sy: number
  /** Lado del cuadrado recortado, en píxeles de la imagen original. */
  sSide: number
  /** Lado de la salida: nunca más grande que el recorte (no agranda). */
  out: number
}

/** Cuadrado centrado de la imagen, reducido a `side` como máximo. Puro. */
export function centerSquareCrop(width: number, height: number, side: number): SquareCrop {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('La imagen no tiene medidas válidas')
  }
  const sSide = Math.min(width, height)
  return {
    sx: (width - sSide) / 2,
    sy: (height - sSide) / 2,
    sSide,
    out: Math.min(side, sSide),
  }
}

/** Error de decodificación: formato que el navegador no abre (por ejemplo HEIC en escritorio). */
function decodeError(): Error {
  return Object.assign(new Error('No se pudo decodificar la imagen'), { code: 'DECODE' })
}

/** Recorta al centro, reduce a 480 px y re-codifica a JPEG 0,82. Devuelve un blob sin metadatos. */
export async function toAvatarJpeg(src: Blob): Promise<Blob> {
  const url = URL.createObjectURL(src)
  try {
    const img = new Image()
    img.src = url
    try {
      await img.decode()
    } catch {
      throw decodeError()
    }
    const { sx, sy, sSide, out } = centerSquareCrop(
      img.naturalWidth,
      img.naturalHeight,
      AVATAR_SIDE,
    )
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('El canvas no tiene contexto 2d')
    ctx.drawImage(img, sx, sy, sSide, sSide, 0, 0, out, out)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob devolvió null'))),
        'image/jpeg',
        AVATAR_QUALITY,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
