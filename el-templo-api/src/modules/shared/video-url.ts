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
