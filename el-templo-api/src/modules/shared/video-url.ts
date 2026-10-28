/**
 * Base pública del R2 (`R2_PUBLIC_URL`) SIN barras finales ("" si no está
 * configurada). Lugar único donde se normaliza: quien arma una URL pública
 * (`BlogImageService.generateUploadUrl`) y quien la valida
 * (`SponsorService.assertOwnLogoUrl`) tienen que usar la misma base, o una
 * variable cargada con barra final produce `//` y el validador rechaza el logo.
 * Se lee en cada llamada (los tests la setean por describe).
 */
export function getR2PublicBase(): string {
  return (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
}

/**
 * Assemble a full video URL from an R2 key.
 * Stores only the key in DB (e.g., "exercises/42.mp4"),
 * prepends R2_PUBLIC_URL at read time.
 */
export function assembleVideoUrl(
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  const baseUrl = process.env.R2_PUBLIC_URL;
  if (!baseUrl) return null;
  return `${baseUrl}/${key}`;
}

/**
 * Assemble a thumbnail URL from an exercise ID.
 */
export function assembleThumbnailUrl(exerciseId: number): string | null {
  const baseUrl = process.env.R2_PUBLIC_URL;
  if (!baseUrl) return null;
  return `${baseUrl}/thumbnails/${exerciseId}.jpg`;
}
