// Módulo: conquer — tienda PÚBLICA de los videos tutoriales (Fase 202 D-25, DA-48)
//
// Los tutoriales son contenido del gimnasio (cómo se hace un ejercicio o un
// combo), no datos de alumnos: van al bucket PÚBLICO de videos
// (`fastify.r2Bucket`) con la misma subida directa que usa Ejercicios
// (`VideoService`). NUNCA se usa este bucket para videos de correcciones
// (DA-38): esos viven en el bucket privado (`private-media.ts`).
//
// El resolver es un OBJETO (no una función suelta) para que los tests lo
// reemplacen con `vi.spyOn(tutorialMediaResolver, "resolve" | "ready")`.
//
// Las claves y las URLs no se loguean: quien llama registra a lo sumo
// `{ target, ref }`.
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { VideoService } from "../admin/video-service";
import { AppError } from "../shared/errors";
import { getR2PublicBase } from "../shared/video-url";
import { isComboKey, type ComboKey } from "./combos";

/** Prefijo de las claves de tutoriales dentro del bucket público. */
export const TUTORIAL_KEY_PREFIX = "conquer/tutorials";

/** Expiración de la URL de subida: la de `VideoService` (15 minutos). */
export const TUTORIAL_PUT_EXPIRES_SEC = 900;

/** Qué tiene un tutorial: un ejercicio del catálogo o uno de los 6 combos. */
export type TutorialTarget = "ejercicio" | "combo";

/**
 * 503 limpio cuando el bucket público no está disponible. Mensaje genérico a
 * propósito: nunca lleva claves, URLs ni el error del SDK.
 */
export class TutorialStorageUnavailableError extends AppError {
  constructor(
    message = "Los videos tutoriales no están disponibles por ahora",
  ) {
    super(message, 503, "CONQUER_TUTORIALES_NO_DISPONIBLES");
  }
}

export interface TutorialMediaHead {
  contentLength: number;
  contentType: string;
}

export interface TutorialMediaStore {
  presignPut(
    key: string,
    contentType: string,
    expiresSec: number,
  ): Promise<string>;
  /** Tamaño y tipo del objeto, o null si no existe. */
  head(key: string): Promise<TutorialMediaHead | null>;
  /** Borra el objeto. Un "no existe" no es error. */
  remove(key: string): Promise<void>;
}

/**
 * `conquer/tutorials/{tenant}/ejercicio-{id}-{uuid}.mp4` o
 * `conquer/tutorials/{tenant}/combo-{comboKey}-{uuid}.mp4`. El UUID hace que
 * cada subida tenga clave propia (el reemplazo no pisa el objeto anterior).
 */
export function tutorialKey(
  input:
    | { tenantId: number; target: "ejercicio"; exerciseId: number }
    | { tenantId: number; target: "combo"; comboKey: ComboKey },
): string {
  const ref = input.target === "ejercicio" ? input.exerciseId : input.comboKey;
  return `${TUTORIAL_KEY_PREFIX}/${input.tenantId}/${input.target}-${ref}-${randomUUID()}.mp4`;
}

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * ¿`key` tiene la forma exacta de `tutorialKey` para ESTE gimnasio y ESTE
 * objetivo? `ref` es el id del ejercicio (número) o el `comboKey` (validado
 * contra `COMBO_KEYS`). Regex anclada: sin `..`, sin otro prefijo (T-201-141).
 */
export function isTutorialKey(
  key: string,
  tenantId: number,
  target: TutorialTarget,
  ref: number | string,
): boolean {
  if (!Number.isInteger(tenantId)) return false;
  if (target === "ejercicio") {
    if (typeof ref !== "number" || !Number.isInteger(ref)) return false;
  } else if (!isComboKey(ref)) {
    return false;
  }
  return new RegExp(
    `^${TUTORIAL_KEY_PREFIX}/${tenantId}/${target}-${ref}-${UUID_PATTERN}\\.mp4$`,
  ).test(key);
}

export const tutorialMediaResolver = {
  /**
   * ¿Se puede ofrecer el alta de tutoriales y mostrarlos? Hace falta el cliente
   * R2 Y la base pública (`R2_PUBLIC_URL`): sin ella ninguna URL se puede armar.
   */
  ready(fastify: FastifyInstance): boolean {
    return Boolean(fastify.r2) && getR2PublicBase() !== "";
  },

  /** La tienda pública. TIRA `TutorialStorageUnavailableError` (503) sin R2. */
  resolve(fastify: FastifyInstance): TutorialMediaStore {
    if (!fastify.r2) throw new TutorialStorageUnavailableError();
    // Fase 202 D-25: se reusa la subida de Ejercicios (mismo bucket público).
    const service = new VideoService(fastify.r2, fastify.r2Bucket, fastify.log);
    return {
      presignPut: (key, contentType, expiresSec) =>
        service.presignPutForKey(key, contentType, expiresSec),
      head: (key) => service.headObject(key),
      remove: (key) => service.deleteObject(key),
    };
  },
};
