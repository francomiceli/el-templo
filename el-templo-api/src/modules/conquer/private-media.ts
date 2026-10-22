// Módulo: conquer — tienda PRIVADA de las fotos del control físico (Fase 201 §6, D-04, S12-8)
//
// Copiado y adaptado de la 196. Las fotos de los alumnos van a un bucket R2
// aparte (`R2_PRIVATE_BUCKET_NAME`, sin dominio público). Se suben y se ven SOLO
// con URL firmada de pocos minutos; nunca hay URL pública.
//
// Fase 201: fail-closed. Sin `fastify.r2` o sin `R2_PRIVATE_BUCKET_NAME` el
// resolver TIRA `PhotoStorageUnavailableError` (503). NUNCA se cae al bucket
// público de videos: una foto de un alumno en ese bucket sería pública.
//
// El resolver es un OBJETO (no una función suelta) para que los tests lo
// reemplacen con `vi.spyOn(privateMediaResolver, "resolve")`.
//
// Las claves de storage y las URLs firmadas son dato sensible: este módulo no
// loguea nada; quien lo llama loguea a lo sumo `{ checkId, pose }`.
import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FastifyInstance } from "fastify";
import { AppError } from "../shared/errors";

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

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

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

export const privateMediaResolver = {
  /**
   * La tienda privada. TIRA `PhotoStorageUnavailableError` (503) si R2 no está
   * configurado o si falta `R2_PRIVATE_BUCKET_NAME`.
   */
  resolve(fastify: FastifyInstance): PrivateMediaStore {
    const bucket = process.env.R2_PRIVATE_BUCKET_NAME;
    if (!fastify.r2 || !bucket) throw new PhotoStorageUnavailableError();
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
    };
  },
};
