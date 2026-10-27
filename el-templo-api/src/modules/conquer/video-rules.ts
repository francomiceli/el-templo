/**
 * Fase 202: reglas de video y texto de las correcciones y los tutoriales
 * de Conquer (puro).
 *
 * Cita: D-26 (correcciones con video), D-27 (storage privado), D-29 (avisos) y
 * DA-39 (tipos y tamaños), DA-40 (duración), DA-42 (tope de 3 sin responder),
 * DA-43 (largos de texto). Es el ÚNICO lugar con estos topes: las rutas de
 * correcciones (202-03..06) y de tutoriales (202-07) los importan.
 *
 * CERO imports: corre con node por type-stripping (sin construcciones que
 * generen codigo en runtime: nada de enumerados, espacios de nombres ni
 * clases con propiedades en el constructor).
 */

// Fase 202 DA-40: la duración máxima de un video de corrección (alumno y coach).
export const CORRECTION_VIDEO_MAX_SECONDS = 30;

// Fase 202 DA-39: 100 MB para videos de corrección (alumno y coach).
export const CORRECTION_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

// Fase 202 DA-42: correcciones sin responder que puede tener un alumno a la vez.
export const CORRECTION_PENDING_MAX = 3;

// Fase 202 DA-43: comentario del alumno.
export const CORRECTION_COMMENT_MAX = 500;

// Fase 202 DA-43: respuesta de texto del coach.
export const CORRECTION_REPLY_MAX = 1000;

// Fase 202 DA-39: 200 MB para tutoriales, sin tope de duración.
export const TUTORIAL_VIDEO_MAX_BYTES = 200 * 1024 * 1024;

// Fase 202 DA-39: los tutoriales son solo mp4 (el admin convierte los .mov).
export const TUTORIAL_CONTENT_TYPE = "video/mp4";

// Fase 202 DA-39: tipos aceptados en correcciones y la extensión de la clave.
export const VIDEO_EXTENSION_BY_CONTENT_TYPE = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
} as const;
export type VideoContentType = keyof typeof VIDEO_EXTENSION_BY_CONTENT_TYPE;
export const VIDEO_CONTENT_TYPES = Object.keys(
  VIDEO_EXTENSION_BY_CONTENT_TYPE,
) as VideoContentType[];

export function isVideoContentType(value: string): value is VideoContentType {
  return Object.prototype.hasOwnProperty.call(
    VIDEO_EXTENSION_BY_CONTENT_TYPE,
    value,
  );
}

export type UploadedVideoCheck = "ok" | "vacio" | "pesado" | "tipo";

/**
 * Fase 202 DA-39: el servidor hace cumplir tamaño y tipo con el HEAD del
 * objeto subido (no se firma Content-Length). Orden: vacío, pesado, tipo.
 */
export function checkUploadedVideo(
  head: { contentLength: number; contentType: string },
  maxBytes: number,
  allowed: readonly string[],
): UploadedVideoCheck {
  if (head.contentLength <= 0) return "vacio";
  if (head.contentLength > maxBytes) return "pesado";
  if (!allowed.includes(head.contentType)) return "tipo";
  return "ok";
}

/** Fase 202 DA-40: `durationSec` entero entre 1 y 30. */
export function isValidVideoSeconds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= CORRECTION_VIDEO_MAX_SECONDS
  );
}

export type NormalizedText = { ok: true; value: string | null } | { ok: false };

/**
 * Fase 202 DA-43: texto opcional. `null`/`undefined` y el vacío tras recortar
 * dan `null`; un largo mayor a `max` (medido tras recortar) o cualquier otro
 * tipo es inválido.
 */
export function normalizeText(value: unknown, max: number): NormalizedText {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const text = value.trim();
  if (text === "") return { ok: true, value: null };
  if (text.length > max) return { ok: false };
  return { ok: true, value: text };
}

// Mismo texto que `CqStepRow.vue` del app: el API arma las etiquetas de objetivo.
export const STEP_LABELS = {
  e1: "Escalón 1",
  e2: "Escalón 2",
  e3: "Escalón 3",
  hold: "Hold final",
} as const;
