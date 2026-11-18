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
import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  CopyObjectCommand,
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
  /**
   * Sin `opts` (Conquer): `no-store` y fecha de firma real. Con
   * `opts.stableHourly` (avatares, fase 214): la fecha de firma se redondea a la
   * hora, así la misma clave da la misma URL durante una hora y el navegador
   * puede cachear la imagen.
   */
  presignGet(
    key: string,
    expiresSec: number,
    opts?: { stableHourly?: boolean },
  ): Promise<string>;
  /** Tamaño y tipo del objeto, o null si no existe. */
  head(key: string): Promise<PrivateMediaHead | null>;
  /** Fase 202 DA-45: borra el objeto. Un "no existe" no es error. */
  remove(key: string): Promise<void>;
  /**
   * Fase 215 (decisión 5), SOLO para la foto de perfil: descarga el objeto. El
   * llamador ya verificó el tamaño con `head`. Falla si el objeto no existe.
   */
  getObject(key: string): Promise<Buffer>;
  /**
   * Fase 215 (decisión 5), SOLO para la foto de perfil: sobrescribe el objeto con
   * los bytes ya re-codificados.
   */
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  /**
   * Fase 214 D-43/D-63, SOLO para la foto de ficha: copia un objeto del bucket
   * PÚBLICO al privado. Devuelve false si el origen no existe; cualquier otro
   * error se propaga. `publicKey` llega siempre validado por
   * `publicKeyFromFichaUrl`.
   */
  copyFromPublic(publicKey: string, privateKey: string): Promise<boolean>;
  /**
   * Fase 214 D-63, SOLO para la foto de ficha: borra el objeto del bucket
   * PÚBLICO (revoca la URL pública). Un "no existe" no es error. Ninguna otra
   * cosa usa el bucket público desde este módulo; `publicKey` llega validado
   * por `publicKeyFromFichaUrl`.
   */
  removePublic(publicKey: string): Promise<void>;
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

/**
 * Fase 214 D-34: prefijo de las fotos de perfil de la comunidad. Distinto de
 * `private/conquer/` y de `private/conquer-corrections/`: la regla de 60 días
 * de R2 va sobre el segundo y no debe vencer los avatares.
 */
export const AVATAR_KEY_PREFIX = "private/avatars";
/** Expiración de la URL firmada de un avatar en una lista (2 horas). */
export const AVATAR_LIST_GET_EXPIRES_SEC = 2 * 3600;
/** Expiración de la URL firmada del avatar propio en `GET /auth/me` (24 horas). */
export const AVATAR_ME_GET_EXPIRES_SEC = 24 * 3600;

/**
 * Segmento que identifica al dueño en la clave SIN revelar su id: HMAC-SHA256
 * de `avatar:{tenant}:{user}` con `JWT_SECRET`, 24 caracteres hex. Solo el
 * servidor puede calcularlo. Sin secreto no se firma con uno vacío.
 */
export function avatarOwnerSegment(tenantId: number, userId: number): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET no está configurada: no se puede calcular el segmento del avatar",
    );
  }
  return createHmac("sha256", secret)
    .update(`avatar:${tenantId}:${userId}`)
    .digest("hex")
    .slice(0, 24);
}

/** `private/avatars/{tenant}/{segmento}/{uuid}.jpg` (el id del usuario no aparece). */
export function privateAvatarKey(input: {
  tenantId: number;
  userId: number;
}): string {
  return `${AVATAR_KEY_PREFIX}/${input.tenantId}/${avatarOwnerSegment(input.tenantId, input.userId)}/${randomUUID()}.jpg`;
}

/**
 * ¿`key` tiene la forma exacta de `privateAvatarKey` para ESTE gimnasio y
 * alumno? El segmento se calcula, nunca se lee de la clave. Regex anclada:
 * sin `..`, sin otro prefijo, sin las claves `ficha-...` (T-214-13-02).
 */
export function isOwnAvatarKey(
  key: string,
  tenantId: number,
  userId: number,
): boolean {
  if (![tenantId, userId].every((n) => Number.isInteger(n))) return false;
  return new RegExp(
    `^${AVATAR_KEY_PREFIX}/${tenantId}/${avatarOwnerSegment(tenantId, userId)}/${UUID_PATTERN}\\.jpg$`,
  ).test(key);
}

const FICHA_EXT_PATTERN = /\.(jpg|jpeg|png|webp)$/;

/**
 * Clave determinística del espejo privado de la foto de ficha:
 * `private/avatars/{tenant}/{segmento}/ficha-{sha256(sourceUrl) 16 hex}.{ext}`.
 * Copiar dos veces la misma foto escribe la misma clave (idempotente).
 */
export function fichaMirrorKey(input: {
  tenantId: number;
  userId: number;
  sourceUrl: string;
}): string {
  const hash = createHash("sha256").update(input.sourceUrl).digest("hex");
  const ext = FICHA_EXT_PATTERN.exec(input.sourceUrl)?.[1] ?? "jpg";
  return `${AVATAR_KEY_PREFIX}/${input.tenantId}/${avatarOwnerSegment(input.tenantId, input.userId)}/ficha-${hash.slice(0, 16)}.${ext}`;
}

/**
 * Clave del bucket PÚBLICO que corresponde a la `photo_url` de ficha del
 * usuario, o null si la URL no tiene exactamente la forma que genera
 * `POST /members/:userId/photo-url` (`members/photos/{userId}-{ts}.{ext}`)
 * para ESE usuario (T-214-13-03). Es la única fuente de `publicKey` de las
 * operaciones sobre el bucket público.
 */
export function publicKeyFromFichaUrl(
  url: string,
  userId: number,
): string | null {
  if (!Number.isInteger(userId)) return null;
  const base = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  const prefix = `${base}/`;
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  return new RegExp(
    `^members/photos/${userId}-\\d+\\.(jpg|jpeg|png|webp)$`,
  ).test(key)
    ? key
    : null;
}

/** Fecha de firma redondeada hacia abajo a la hora: misma URL durante una hora. */
export function stableHourlySigningDate(now: Date = new Date()): Date {
  const hour = 3600 * 1000;
  return new Date(Math.floor(now.getTime() / hour) * hour);
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
    // Fase 214: único uso del bucket público desde este módulo (foto de ficha).
    const publicBucket = fastify.r2Bucket;
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
      // Fase 214 (T-214-13-05): los avatares piden `stableHourly` y se cachean
      // solo en el navegador de quien los pide (`private`).
      presignGet: (key, expiresSec, opts) =>
        opts?.stableHourly
          ? getSignedUrl(
              client,
              new GetObjectCommand({
                Bucket: bucket,
                Key: key,
                ResponseCacheControl: "private, max-age=3600",
              }),
              { expiresIn: expiresSec, signingDate: stableHourlySigningDate() },
            )
          : getSignedUrl(
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
      getObject: async (key) => {
        const res = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (!res.Body) throw new Error("Objeto sin cuerpo");
        return Buffer.from(await res.Body.transformToByteArray());
      },
      putObject: async (key, body, contentType) => {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            ContentLength: body.length,
          }),
        );
      },
      copyFromPublic: async (publicKey, privateKey) => {
        try {
          await client.send(
            new CopyObjectCommand({
              Bucket: bucket,
              Key: privateKey,
              CopySource: `${publicBucket}/${publicKey}`,
            }),
          );
          return true;
        } catch (err: unknown) {
          if (isObjectMissing(err)) return false;
          throw err;
        }
      },
      removePublic: async (publicKey) => {
        try {
          await client.send(
            new DeleteObjectCommand({ Bucket: publicBucket, Key: publicKey }),
          );
        } catch (err: unknown) {
          if (isObjectMissing(err)) return;
          throw err;
        }
      },
    };
  },
};
