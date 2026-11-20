// Module: members (fase 215, ajuste de la revisión: decisión 5 / 214 ME-04)
//
// Re-codificación de la foto de perfil en el servidor. La app ya reduce la foto
// por canvas antes de subirla, pero el servidor no puede confiar en eso: quien
// llame al PUT firmado directo sube lo que quiera. Al confirmar, el servidor
// descarga el objeto y lo vuelve a escribir como JPEG nuevo:
//
// - verifica la firma de bytes (JPEG `FF D8 FF`): un archivo que no es una imagen
//   se rechaza aunque el `Content-Type` diga `image/jpeg`;
// - aplica la orientación EXIF (`.rotate()`) ANTES de perder los metadatos, así
//   la foto no queda de costado;
// - limita el tamaño a 1024 px de lado (sin agrandar chicas);
// - re-codifica a JPEG sin metadatos: `sharp` los descarta por defecto y acá NO
//   se llama `withMetadata`, por eso no sobreviven ni EXIF, ni GPS, ni perfiles.
//
// Es una función pura (bytes entran, bytes salen): se prueba sin storage ni base.

import sharp from "sharp";

/** Lado máximo de la foto re-codificada. */
export const PHOTO_MAX_SIDE_PX = 1024;

/** Calidad del JPEG re-codificado. */
export const PHOTO_JPEG_QUALITY = 85;

/**
 * Tope de píxeles que `sharp` acepta decodificar (≈ 50 MP). Un JPEG de pocos MB
 * puede declarar dimensiones enormes (bomba de descompresión): se corta antes.
 */
const MAX_INPUT_PIXELS = 50_000_000;

/** La foto no es una imagen válida o no se pudo procesar. */
export class InvalidPhotoError extends Error {
  constructor(message = "La foto no es una imagen válida") {
    super(message);
    this.name = "InvalidPhotoError";
  }
}

/** Firma de un JPEG: `FF D8 FF`. */
export function hasJpegSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

/**
 * Devuelve la foto como JPEG nuevo, orientada, de hasta `PHOTO_MAX_SIDE_PX` por
 * lado y sin metadatos. Lanza `InvalidPhotoError` si la firma no es de JPEG o si
 * `sharp` no puede decodificarla.
 */
export async function reencodeProfilePhoto(input: Buffer): Promise<Buffer> {
  if (!hasJpegSignature(input)) throw new InvalidPhotoError();
  try {
    return await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    })
      .rotate()
      .resize({
        width: PHOTO_MAX_SIDE_PX,
        height: PHOTO_MAX_SIDE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: PHOTO_JPEG_QUALITY })
      .toBuffer();
  } catch {
    // El error de `sharp` puede traer rutas o detalles internos: no se propaga.
    throw new InvalidPhotoError();
  }
}
