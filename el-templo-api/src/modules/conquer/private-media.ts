// Módulo: conquer — tienda PRIVADA de las fotos del control físico y de los
// videos de las correcciones (Fase 201 §6, D-04, S12-8; Fase 202 D-27, DA-38)
//
// Copiado y adaptado de la 196. Las fotos y los videos de los alumnos van a un
// bucket R2 aparte (`R2_PRIVATE_BUCKET_NAME`, sin dominio público). Se suben y
// se ven SOLO con URL firmada de pocos minutos; nunca hay URL pública.
//
// Fase 201: fail-closed. Sin `fastify.r2` o sin `R2_PRIVATE_BUCKET_NAME` el
// resolver TIRA `PhotoStorageUnavailableError` (503, fotos) o
// `VideoStorageUnavailableError` (503, videos). NUNCA se cae al bucket
// público de videos: un archivo de un alumno en ese bucket sería público.
//
// Fase 202 DA-38: los videos de correcciones viven bajo un prefijo APARTE
// (`private/conquer-corrections/`), porque la regla de 60 días de R2 se
// configura sobre ese prefijo y no puede tocar las fotos (`private/conquer/`).
//
// El resolver es un OBJETO (no una función suelta) para que los tests lo
// reemplacen con `vi.spyOn(privateMediaResolver, "resolve")`.
//
// Las claves de storage y las URLs firmadas son dato sensible: este módulo no
// loguea nada; quien lo llama loguea a lo sumo `{ checkId, pose }`.
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FastifyInstance } from "fastify";
import { AppError } from "../shared/errors";
import {
  VIDEO_EXTENSION_BY_CONTENT_TYPE,
  type VideoContentType,
} from "./video-rules";

/** Las tres poses del control físico (§6) y la columna donde se guarda cada una. */
export const CONQUER_POSES = ["frente", "perfil", "espalda"] as const;
export type ConquerPose = (typeof CONQUER_POSES)[number];

/** Pose → columna de `conquer_body_checks` con la clave de la foto. */
export const POSE_COLUMN = {
  frente: "photoFrontKey",
  perfil: "photoSideKey",
  espalda: "photoBackKey",
} as const satisfies Record<
  ConquerPose,
  "photoFrontKey" | "photoSideKey" | "photoBackKey"
>;

/** Lista cerrada de tipos de imagen y la extensión que sale de cada uno (T-201-42). */
export const PHOTO_EXTENSION_BY_CONTENT_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type PhotoContentType = keyof typeof PHOTO_EXTENSION_BY_CONTENT_TYPE;
export const PHOTO_CONTENT_TYPES = Object.keys(
  PHOTO_EXTENSION_BY_CONTENT_TYPE,
) as PhotoContentType[];

/** Tope de tamaño de una foto (se verifica con HEAD al confirmar). */
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

/** Expiración de la URL de subida (el alumno saca la foto y la sube). */
export const PRIVATE_PUT_EXPIRES_SEC = 600;
/** Expiración de la URL de lectura: pocos minutos, se pide de nuevo cada vez. */
export const PRIVATE_GET_EXPIRES_SEC = 300;

/** Prefijo de las claves privadas. */
export const PRIVATE_KEY_PREFIX = "private/conquer";

/**
 * 503 limpio cuando el almacenamiento no está configurado o falla. El mensaje es
 * genérico a propósito: nunca lleva claves, URLs ni el error del SDK (T-201-43).
 */
export class PhotoStorageUnavailableError extends AppError {
  constructor(message = "Las fotos no están disponibles por ahora") {
    super(message, 503, "CONQUER_FOTOS_NO_DISPONIBLES");
  }
}

/**
 * Fase 202 D-27: lo mismo para los videos de las correcciones. Mensaje genérico
 * (nunca claves ni errores del SDK).
 */
export class VideoStorageUnavailableError extends AppError {
  constructor(message = "Los videos no están disponibles por ahora") {
    super(message, 503, "CONQUER_VIDEOS_NO_DISPONIBLES");
  }
}

export interface PrivateMediaHead {
  contentLength: number;
  contentType: string;
}

export interface PrivateMediaStore {
  presignPut(
    key: string,
    contentType: string,
    expiresSec: number,
  ): Promise<string>;
  presignGet(key: string, expiresSec: number): Promise<string>;
  /** Tamaño y tipo del objeto, o null si no existe. */
  head(key: string): Promise<PrivateMediaHead | null>;
  /** Fase 202 DA-45: borra el objeto. Un "no existe" no es error. */
  remove(key: string): Promise<void>;
}

/** `private/conquer/{tenant}/{user}/{control}/{pose}-{uuid}.{ext}` (el UUID no se adivina). */
export function privateCheckPhotoKey(input: {
  tenantId: number;
  userId: number;
  checkId: number;
  pose: ConquerPose;
  contentType: PhotoContentType;
}): string {
  const ext = PHOTO_EXTENSION_BY_CONTENT_TYPE[input.contentType];
  return `${PRIVATE_KEY_PREFIX}/${input.tenantId}/${input.userId}/${input.checkId}/${input.pose}-${randomUUID()}.${ext}`;
}

/**
 * Fase 202 DA-38: prefijo de los videos de las correcciones. Distinto de
 * `PRIVATE_KEY_PREFIX` (y que NO empieza con `private/conquer/`): la regla de
 * 60 días de R2 va sobre este prefijo y no debe vencer las fotos del control.
 */
export const CORRECTION_KEY_PREFIX = "private/conquer-corrections";

/** `private/conquer-corrections/{tenant}/{user}/alumno-{uuid}.{ext}` (video del alumno). */
export function privateCorrectionVideoKey(input: {
  tenantId: number;
  userId: number;
  contentType: VideoContentType;
}): string {
  const ext = VIDEO_EXTENSION_BY_CONTENT_TYPE[input.contentType];
  return `${CORRECTION_KEY_PREFIX}/${input.tenantId}/${input.userId}/alumno-${randomUUID()}.${ext}`;
}

/** `private/conquer-corrections/{tenant}/{user}/coach-{correctionId}-{uuid}.{ext}` (respuesta del coach). */
export function privateCorrectionReplyKey(input: {
  tenantId: number;
  userId: number;
  correctionId: number;
  contentType: VideoContentType;
}): string {
  const ext = VIDEO_EXTENSION_BY_CONTENT_TYPE[input.contentType];
  return `${CORRECTION_KEY_PREFIX}/${input.tenantId}/${input.userId}/coach-${input.correctionId}-${randomUUID()}.${ext}`;
}

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * ¿`key` tiene la forma exacta de `privateCorrectionVideoKey` para ESTE
 * gimnasio y alumno? Regex anclada: sin `..`, sin otro prefijo (T-201-121).
 */
export function isOwnCorrectionVideoKey(
  key: string,
  tenantId: number,
  userId: number,
): boolean {
  if (![tenantId, userId].every((n) => Number.isInteger(n))) return false;
  return new RegExp(
    `^${CORRECTION_KEY_PREFIX}/${tenantId}/${userId}/alumno-${UUID_PATTERN}\\.(mp4|mov)$`,
  ).test(key);
}

/**
 * ¿`key` tiene la forma exacta de `privateCorrectionReplyKey` para ESTE
 * gimnasio, alumno y corrección? Separada de la del alumno (T-201-121).
 */
export function isCorrectionReplyKey(
  key: string,
  tenantId: number,
  userId: number,
  correctionId: number,
): boolean {
  if (![tenantId, userId, correctionId].every((n) => Number.isInteger(n))) {
    return false;
  }
  return new RegExp(
    `^${CORRECTION_KEY_PREFIX}/${tenantId}/${userId}/coach-${correctionId}-${UUID_PATTERN}\\.(mp4|mov)$`,
  ).test(key);
}

/**
 * ¿`key` tiene la forma exacta de `privateCheckPhotoKey` para ESTE gimnasio,
 * alumno, control y pose? Regex anclada: sin `..`, sin otro prefijo (T-201-41).
 */
export function isOwnPhotoKey(
  key: string,
  tenantId: number,
  userId: number,
  checkId: number,
  pose: string,
): boolean {
  if (!CONQUER_POSES.some((p) => p === pose)) return false;
  if (![tenantId, userId, checkId].every((n) => Number.isInteger(n))) {
    return false;
  }
  return new RegExp(
    `^${PRIVATE_KEY_PREFIX}/${tenantId}/${userId}/${checkId}/${pose}-${UUID_PATTERN}\\.(jpg|png|webp)$`,
  ).test(key);
}

/** Narrowing del "no existe" de S3/R2 (`NotFound` en HEAD, `NoSuchKey`, o HTTP 404). */
function isObjectMissing(err: unknown): boolean {
  if (
    err instanceof Error &&
    (err.name === "NotFound" || err.name === "NoSuchKey")
  ) {
    return true;
  }
  if (typeof err === "object" && err !== null) {
    const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
    return meta?.httpStatusCode === 404;
  }
  return false;
}

/** Para qué se pide la tienda: decide qué 503 sale si no está configurada. */
export type PrivateMediaPurpose = "fotos" | "videos";

export const privateMediaResolver = {
  /**
   * La tienda privada. TIRA `PhotoStorageUnavailableError` (fotos, el default)
   * o `VideoStorageUnavailableError` (videos), ambos 503, si R2 no está
   * configurado o si falta `R2_PRIVATE_BUCKET_NAME`.
   */
  resolve(
    fastify: FastifyInstance,
    purpose: PrivateMediaPurpose = "fotos",
  ): PrivateMediaStore {
    const bucket = process.env.R2_PRIVATE_BUCKET_NAME;
    // Fase 201 D-27: NUNCA `fastify.r2Bucket` (el bucket público de videos del
    // gimnasio), tampoco para videos de alumnos: sería público.
    if (!fastify.r2 || !bucket) {
      throw purpose === "videos"
        ? new VideoStorageUnavailableError()
        : new PhotoStorageUnavailableError();
    }
    const client = fastify.r2;
    return {
      presignPut: (key, contentType, expiresSec) =>
        getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType,
          }),
          { expiresIn: expiresSec },
        ),
      // T-201-44: la URL de lectura no se cachea en el navegador ni en proxies.
      presignGet: (key, expiresSec) =>
        getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ResponseCacheControl: "no-store",
          }),
          { expiresIn: expiresSec },
        ),
      head: async (key) => {
        try {
          const res = await client.send(
            new HeadObjectCommand({ Bucket: bucket, Key: key }),
          );
          return {
            contentLength: res.ContentLength ?? 0,
            contentType: res.ContentType ?? "",
          };
        } catch (err: unknown) {
          if (isObjectMissing(err)) return null;
          throw err;
        }
      },
      // Fase 202 DA-45: borrar un objeto que ya no está no es un error. Cualquier
      // otro fallo se re-tira: quien llama lo convierte en 503 sin loguear la clave.
      remove: async (key) => {
        try {
          await client.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: key }),
          );
        } catch (err: unknown) {
          if (isObjectMissing(err)) return;
          throw err;
        }
      },
    };
  },
};
