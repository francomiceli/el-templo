// Module: members (fase 214, foto propia)
//
// Circuito de la foto de perfil del lado del alumno (D-30 a D-34, D-45, D-50,
// D-63) y la función que decide qué foto ven los demás (D-43).
//
// Estados de `member_photos` que toca este servicio:
// - el alumno sube y confirma: fila `alumno` `pendiente` (con `rules_accepted_at`).
//   Una segunda subida pasa la pendiente anterior a `reemplazada`.
// - quitar (D-63): las filas `pendiente` y `aprobada` de los dos orígenes pasan a
//   `quitada`, `users.photo_url` queda en NULL y se borran los objetos (privados
//   y el público de la ficha). Nunca toca el ledger de Aura: no se devuelve nada.
// - reportar (D-45): un reporte por persona y foto (`reporter_ids`). La foto
//   sigue visible hasta que el staff decida (plan 15).
//
// Invariante (la impone este servicio con `SELECT ... FOR UPDATE`, sin UNIQUE):
// como mucho una `pendiente` por persona y origen `alumno`. La foto que ven los
// demás es la `aprobada` propia y, si no hay, la espejada de la ficha. Mientras
// hay una pendiente, los demás siguen viendo la foto anterior o las iniciales.
//
// El servidor NO recodifica la imagen: que el JPEG no lleve EXIF ni GPS depende
// de que la app la pase por canvas antes de subirla (D-39). El tope de 8 MB es
// una red de seguridad: la app reduce a ~480 px antes de subir, y el mensaje
// nunca dice "es muy pesada" (D-33), es accionable.
//
// Del lado del staff (plan 15, D-30 a D-32, D-46, D-69): cola de revisión,
// aprobar (acredita la Aura una sola vez en la vida), rechazar con motivo y
// aviso, y el estado de la foto propia para `GET /auth/me`.
//
// Logs sin claves ni URLs (dato sensible): solo ids y el nombre del error.
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../db/schema";
import type { MemberPhotoOrigin, PhotoRejectionReason } from "../../db/schema";
import { AuraService } from "../aura/service";
import { AURA_AMOUNTS } from "../aura/amounts";
import { NotificationService } from "../notifications/service";
import { AppError, NotFoundError } from "../shared/errors";
import { isDuplicateKeyError } from "../shared/sql-errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import {
  AVATAR_LIST_GET_EXPIRES_SEC,
  AVATAR_ME_GET_EXPIRES_SEC,
  PHOTO_MAX_BYTES,
  PRIVATE_PUT_EXPIRES_SEC,
  PhotoStorageUnavailableError,
  isOwnAvatarKey,
  privateAvatarKey,
  privateMediaResolver,
  publicKeyFromFichaUrl,
  type PrivateMediaStore,
} from "../conquer/private-media";

const PHOTO_CONTENT_TYPE = "image/jpeg";

/** 503 propio del alumno: no expone un código "CONQUER" ni claves ni errores del SDK. */
export class ProfilePhotoStorageUnavailableError extends AppError {
  constructor(message = "Las fotos no están disponibles por ahora") {
    super(message, 503, "FOTO_PERFIL_NO_DISPONIBLE");
  }
}

export interface ProfilePhotoUploadResult {
  uploadUrl: string;
  key: string;
  contentType: string;
  expiresIn: number;
}

export interface ProfilePhotoConfirmResult {
  photoId: number;
  status: "pendiente";
}

export interface CommunityPhoto {
  url: string;
  photoId: number;
}

function resolveStore(fastify: FastifyInstance): PrivateMediaStore {
  try {
    return privateMediaResolver.resolve(fastify);
  } catch (err: unknown) {
    if (err instanceof PhotoStorageUnavailableError) {
      throw new ProfilePhotoStorageUnavailableError();
    }
    throw err;
  }
}

/**
 * Llama al storage sin dejar escapar su error: el del SDK puede nombrar el
 * bucket o la clave. Se loguea `{ userId }` y el NOMBRE del error; se responde
 * 503 genérico.
 */
async function callStore<T>(
  fastify: FastifyInstance,
  info: { userId: number },
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (err: unknown) {
    fastify.log.warn(
      { ...info, errName: err instanceof Error ? err.name : "unknown" },
      "profile photo storage call failed",
    );
    throw new ProfilePhotoStorageUnavailableError();
  }
}

/** Socio vivo del gimnasio o 404. */
async function assertLiveMember(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userId: number,
): Promise<void> {
  const [row] = await fastify.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, userId),
        isNull(schema.users.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("No encontrado");
}

/** El store privado, o `null` si no está configurado (nunca lanza por eso). */
function tryResolveStore(fastify: FastifyInstance): PrivateMediaStore | null {
  try {
    return privateMediaResolver.resolve(fastify);
  } catch (err: unknown) {
    if (err instanceof PhotoStorageUnavailableError) return null;
    throw err;
  }
}

/** Borra un objeto privado sin dejar que una falla rompa la operación ya hecha. */
async function removeBestEffort(
  fastify: FastifyInstance,
  store: PrivateMediaStore,
  key: string,
  what: string,
): Promise<void> {
  try {
    await store.remove(key);
  } catch (err: unknown) {
    fastify.log.warn(
      { errName: err instanceof Error ? err.name : "unknown" },
      `Foto de perfil: no se pudo borrar ${what}`,
    );
  }
}

/**
 * URL firmada para SUBIR la foto propia (el teléfono sube directo al bucket
 * privado). Orden: socio (404) -> storage (503) -> tipo (400).
 */
export async function requestProfilePhotoUpload(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userId: number,
  contentType: string,
): Promise<ProfilePhotoUploadResult> {
  await assertLiveMember(fastify, ctx, userId);
  const store = resolveStore(fastify);
  if (contentType !== PHOTO_CONTENT_TYPE) {
    throw new AppError(
      "La foto tiene que ser JPG",
      400,
      "FOTO_PERFIL_TIPO_INVALIDO",
    );
  }
  const key = privateAvatarKey({ tenantId: ctx.tenantId, userId });
  const uploadUrl = await callStore(fastify, { userId }, () =>
    store.presignPut(key, PHOTO_CONTENT_TYPE, PRIVATE_PUT_EXPIRES_SEC),
  );
  return {
    uploadUrl,
    key,
    contentType: PHOTO_CONTENT_TYPE,
    expiresIn: PRIVATE_PUT_EXPIRES_SEC,
  };
}

/**
 * El alumno confirma que subió la foto: la clave tiene que ser SUYA y el objeto
 * tiene que existir con tamaño y tipo válidos (HEAD). Orden: 404 -> 503 ->
 * clave (400) -> HEAD (409/400). La foto queda `pendiente` de aprobación.
 */
export async function confirmProfilePhoto(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userId: number,
  key: string,
): Promise<ProfilePhotoConfirmResult> {
  await assertLiveMember(fastify, ctx, userId);
  const store = resolveStore(fastify);
  if (!isOwnAvatarKey(key, ctx.tenantId, userId)) {
    throw new AppError(
      "La foto no es válida",
      400,
      "FOTO_PERFIL_CLAVE_INVALIDA",
    );
  }
  const head = await callStore(fastify, { userId }, () => store.head(key));
  if (head === null) {
    throw new AppError(
      "Todavía no se subió esa foto",
      409,
      "FOTO_PERFIL_NO_SUBIDA",
    );
  }
  // D-33: nunca se rechaza por "pesada". El tope es una red de seguridad (la app
  // reduce la foto antes de subirla) y el mensaje es accionable.
  if (
    head.contentLength <= 0 ||
    head.contentLength > PHOTO_MAX_BYTES ||
    head.contentType !== PHOTO_CONTENT_TYPE
  ) {
    throw new AppError(
      "No pudimos procesar la foto, probá de nuevo",
      400,
      "FOTO_PERFIL_INVALIDA",
    );
  }

  const outcome = await fastify.db.transaction(async (tx) => {
    // Bloquea las pendientes propias y la fila de esta misma clave (si existe).
    const rows = await tx
      .select({
        id: schema.memberPhotos.id,
        storageKey: schema.memberPhotos.storageKey,
        status: schema.memberPhotos.status,
      })
      .from(schema.memberPhotos)
      .where(
        and(
          tenantWhere(schema.memberPhotos, ctx),
          eq(schema.memberPhotos.userId, userId),
          eq(schema.memberPhotos.origin, "alumno"),
          or(
            eq(schema.memberPhotos.status, "pendiente"),
            eq(schema.memberPhotos.storageKey, key),
          ),
        ),
      )
      .for("update");

    // Idempotente: confirmar dos veces la misma clave no duplica filas.
    const same = rows.find((row) => row.storageKey === key);
    if (same) {
      if (same.status !== "pendiente") {
        throw new AppError(
          "Esa foto ya fue procesada",
          409,
          "FOTO_PERFIL_YA_PROCESADA",
        );
      }
      return { photoId: same.id, replacedKeys: [] as string[] };
    }

    const replacedKeys: string[] = [];
    for (const row of rows) {
      if (row.status !== "pendiente") continue;
      await tx
        .update(schema.memberPhotos)
        .set({ status: "reemplazada" })
        .where(
          and(
            tenantWhere(schema.memberPhotos, ctx),
            eq(schema.memberPhotos.id, row.id),
          ),
        );
      replacedKeys.push(row.storageKey);
    }

    const [inserted] = await tx
      .insert(schema.memberPhotos)
      .values(
        tenantValues(ctx, {
          userId,
          storageKey: key,
          origin: "alumno" as const,
          status: "pendiente" as const,
          rulesAcceptedAt: new Date(),
        }),
      )
      .$returningId();
    if (!inserted) {
      throw new AppError("No pudimos guardar la foto", 500);
    }
    return { photoId: inserted.id, replacedKeys };
  });

  // Best-effort, fuera de la transacción: el objeto de la pendiente anterior.
  for (const oldKey of outcome.replacedKeys) {
    await removeBestEffort(fastify, store, oldKey, "la foto reemplazada");
  }
  return { photoId: outcome.photoId, status: "pendiente" };
}

/**
 * D-63: quita la foto que se muestra en la comunidad (la propia y la de ficha).
 * El plan 15 la reusa para el staff (`removedBy` = id del staff) y para borrar la
 * cuenta (`removedBy` = null). Nunca toca `aura_transactions`.
 */
export async function removeCommunityPhoto(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userId: number,
  removedBy: number | null,
): Promise<void> {
  const { keys, fichaPublicKey } = await fastify.db.transaction(async (tx) => {
    const [user] = await tx
      .select({ photoUrl: schema.users.photoUrl })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
      .limit(1)
      .for("update");

    const rows = await tx
      .select({
        id: schema.memberPhotos.id,
        storageKey: schema.memberPhotos.storageKey,
      })
      .from(schema.memberPhotos)
      .where(
        and(
          tenantWhere(schema.memberPhotos, ctx),
          eq(schema.memberPhotos.userId, userId),
          inArray(schema.memberPhotos.status, ["pendiente", "aprobada"]),
        ),
      )
      .for("update");

    if (rows.length > 0) {
      await tx
        .update(schema.memberPhotos)
        .set(
          removedBy === null
            ? { status: "quitada" as const }
            : {
                status: "quitada" as const,
                reviewedBy: removedBy,
                reviewedAt: new Date(),
              },
        )
        .where(
          and(
            tenantWhere(schema.memberPhotos, ctx),
            inArray(
              schema.memberPhotos.id,
              rows.map((row) => row.id),
            ),
          ),
        );
    }

    if (user?.photoUrl != null) {
      await tx
        .update(schema.users)
        .set({ photoUrl: null })
        .where(
          and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)),
        );
    }

    return {
      keys: rows.map((row) => row.storageKey),
      fichaPublicKey:
        user?.photoUrl != null
          ? publicKeyFromFichaUrl(user.photoUrl, userId)
          : null,
    };
  });

  if (keys.length === 0 && fichaPublicKey === null) return;

  // Si el store no está configurado no se falla: las filas ya quedaron `quitada`.
  const store = tryResolveStore(fastify);
  if (store === null) {
    fastify.log.warn(
      { userId },
      "Foto de perfil quitada sin storage: quedan objetos por borrar",
    );
    return;
  }
  for (const key of keys) {
    await removeBestEffort(fastify, store, key, "un objeto privado");
  }
  if (fichaPublicKey !== null) {
    try {
      await store.removePublic(fichaPublicKey);
    } catch (err: unknown) {
      fastify.log.warn(
        { errName: err instanceof Error ? err.name : "unknown" },
        "Foto de perfil: no se pudo borrar el objeto público de la ficha",
      );
    }
  }
}

/**
 * D-45: un socio reporta una foto `aprobada` de su gimnasio (propia o de ficha).
 * Un reporte por persona y foto: el repetido no suma. La foto sigue visible.
 * 404 si no existe, no es `aprobada` o es de otro gimnasio.
 */
export async function reportProfilePhoto(
  fastify: FastifyInstance,
  ctx: TenantContext,
  reporterId: number,
  photoId: number,
): Promise<void> {
  await fastify.db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: schema.memberPhotos.id,
        reporterIds: schema.memberPhotos.reporterIds,
      })
      .from(schema.memberPhotos)
      .where(
        and(
          tenantWhere(schema.memberPhotos, ctx),
          eq(schema.memberPhotos.id, photoId),
          eq(schema.memberPhotos.status, "aprobada"),
        ),
      )
      .limit(1)
      .for("update");
    if (!row) throw new NotFoundError("No encontrado");

    const current = row.reporterIds ?? [];
    if (current.includes(reporterId)) return;

    const next = [...current, reporterId];
    await tx
      .update(schema.memberPhotos)
      .set({
        reporterIds: next,
        reportCount: next.length,
        lastReportedAt: new Date(),
      })
      .where(
        and(
          tenantWhere(schema.memberPhotos, ctx),
          eq(schema.memberPhotos.id, row.id),
        ),
      );
    fastify.log.info({ photoId, reporterId }, "Foto de perfil reportada");
  });
}

let warnedNoStorage = false;

/**
 * Qué foto se muestra a los demás por usuario (D-43): la propia aprobada y, si
 * no hay, el espejo privado de la ficha cuya `source_url` es la `photo_url`
 * actual. Siempre URL firmada (estable por hora, así el navegador cachea): NUNCA
 * `users.photo_url` ni nada con el id del usuario. SOLO LECTURA: la copia de la
 * ficha la hace el job del plan 13. Sin foto, el usuario no va en el Map.
 */
export async function resolveCommunityPhotos(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userIds: readonly number[],
  opts: { expiresSec?: number } = {},
): Promise<Map<number, CommunityPhoto>> {
  const result = new Map<number, CommunityPhoto>();
  if (userIds.length === 0) return result;
  const ids = [...new Set(userIds)];

  const [photos, users] = await Promise.all([
    fastify.db
      .select({
        id: schema.memberPhotos.id,
        userId: schema.memberPhotos.userId,
        storageKey: schema.memberPhotos.storageKey,
        origin: schema.memberPhotos.origin,
        sourceUrl: schema.memberPhotos.sourceUrl,
      })
      .from(schema.memberPhotos)
      .where(
        and(
          tenantWhere(schema.memberPhotos, ctx),
          inArray(schema.memberPhotos.userId, ids),
          eq(schema.memberPhotos.status, "aprobada"),
        ),
      )
      .orderBy(schema.memberPhotos.id),
    fastify.db
      .select({ id: schema.users.id, photoUrl: schema.users.photoUrl })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx),
          inArray(schema.users.id, ids),
          isNull(schema.users.deletedAt),
        ),
      ),
  ]);
  if (photos.length === 0) return result;

  let store: PrivateMediaStore;
  try {
    store = privateMediaResolver.resolve(fastify);
  } catch (err: unknown) {
    if (err instanceof PhotoStorageUnavailableError) {
      if (!warnedNoStorage) {
        warnedNoStorage = true;
        fastify.log.warn(
          "Fotos de la comunidad sin storage privado: se muestran iniciales",
        );
      }
      return result;
    }
    throw err;
  }

  const currentFichaUrl = new Map<number, string>();
  for (const user of users) {
    if (user.photoUrl !== null) currentFichaUrl.set(user.id, user.photoUrl);
  }

  // Por usuario: la propia aprobada gana a la de ficha; entre varias, la última.
  const chosen = new Map<number, { id: number; storageKey: string }>();
  const own = new Map<number, { id: number; storageKey: string }>();
  const ficha = new Map<number, { id: number; storageKey: string }>();
  for (const photo of photos) {
    if (photo.origin === "alumno") {
      own.set(photo.userId, { id: photo.id, storageKey: photo.storageKey });
    } else if (
      photo.sourceUrl !== null &&
      photo.sourceUrl === currentFichaUrl.get(photo.userId)
    ) {
      ficha.set(photo.userId, { id: photo.id, storageKey: photo.storageKey });
    }
  }
  for (const id of ids) {
    const pick = own.get(id) ?? ficha.get(id);
    if (pick) chosen.set(id, pick);
  }

  const expiresSec = opts.expiresSec ?? AVATAR_LIST_GET_EXPIRES_SEC;
  await Promise.all(
    [...chosen.entries()].map(async ([userId, pick]) => {
      const url = await callStore(fastify, { userId }, () =>
        store.presignGet(pick.storageKey, expiresSec, { stableHourly: true }),
      );
      result.set(userId, { url, photoId: pick.id });
    }),
  );
  return result;
}

// ---------------------------------------------------------------------------
// Staff: cola de revisión, aprobar, rechazar (plan 15)
// ---------------------------------------------------------------------------

/** Título fijo del aviso de rechazo (D-69, UI-SPEC Borrador 5). */
export const PHOTO_REJECTION_PUSH_TITLE = "Tu foto no fue aprobada";

/** Cuerpo del aviso de rechazo según el motivo elegido por el staff (D-69). */
export const PHOTO_REJECTION_PUSH_BODY: Record<PhotoRejectionReason, string> = {
  sin_cara:
    "Subí una foto donde se te vea la cara. Podés hacerlo desde tu perfil.",
  no_es_propia:
    "Tiene que ser una foto tuya. Podés subir otra desde tu perfil.",
  contenido: "La foto no cumple las normas. Podés subir otra desde tu perfil.",
  otro: "Podés subir otra desde tu perfil.",
};

const REVIEW_QUEUE_LIMIT = 100;

export interface PhotoReviewItem {
  photoId: number;
  userId: number;
  firstName: string | null;
  lastName: string | null;
  branchId: number | null;
  origin: MemberPhotoOrigin;
  status: "pendiente" | "aprobada";
  reportCount: number;
  lastReportedAt: string | null;
  uploadedAt: string;
  url: string;
}

export interface PhotoReviewQueue {
  items: PhotoReviewItem[];
  counts: { pending: number; reported: number };
}

/**
 * Cola del staff (D-31, D-32): las `pendiente` de origen `alumno` y las `aprobada`
 * con reportes (de cualquier origen). Reportadas primero, después las más viejas.
 * `branchIds` acota por sede (admin_sede); un arreglo vacío no ve nada.
 */
export async function listPhotoReviewQueue(
  fastify: FastifyInstance,
  ctx: TenantContext,
  branchIds: number[] | undefined,
): Promise<PhotoReviewQueue> {
  if (branchIds !== undefined && branchIds.length === 0) {
    return { items: [], counts: { pending: 0, reported: 0 } };
  }

  const pendingCond = and(
    eq(schema.memberPhotos.status, "pendiente"),
    eq(schema.memberPhotos.origin, "alumno"),
  );
  const reportedCond = and(
    eq(schema.memberPhotos.status, "aprobada"),
    gt(schema.memberPhotos.reportCount, 0),
  );
  const branchFilter =
    branchIds !== undefined
      ? inArray(schema.users.branchId, branchIds)
      : undefined;

  const rows = await fastify.db
    .select({
      photoId: schema.memberPhotos.id,
      userId: schema.memberPhotos.userId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      branchId: schema.users.branchId,
      origin: schema.memberPhotos.origin,
      status: schema.memberPhotos.status,
      reportCount: schema.memberPhotos.reportCount,
      lastReportedAt: schema.memberPhotos.lastReportedAt,
      uploadedAt: schema.memberPhotos.uploadedAt,
      storageKey: schema.memberPhotos.storageKey,
    })
    .from(schema.memberPhotos)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberPhotos.userId))
    .where(
      and(
        tenantWhere(schema.memberPhotos, ctx),
        tenantWhere(schema.users, ctx),
        isNull(schema.users.deletedAt),
        branchFilter,
        or(pendingCond, reportedCond),
      ),
    )
    .orderBy(
      desc(sql`${schema.memberPhotos.reportCount} > 0`),
      asc(schema.memberPhotos.uploadedAt),
      asc(schema.memberPhotos.id),
    )
    .limit(REVIEW_QUEUE_LIMIT);

  const countFor = async (cond: ReturnType<typeof and>): Promise<number> => {
    const [row] = await fastify.db
      .select({ total: count() })
      .from(schema.memberPhotos)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberPhotos.userId))
      .where(
        and(
          tenantWhere(schema.memberPhotos, ctx),
          tenantWhere(schema.users, ctx),
          isNull(schema.users.deletedAt),
          branchFilter,
          cond,
        ),
      );
    return Number(row?.total ?? 0);
  };
  const [pending, reported] = await Promise.all([
    countFor(pendingCond),
    countFor(reportedCond),
  ]);

  if (rows.length === 0) return { items: [], counts: { pending, reported } };

  const store = resolveStore(fastify);
  const items = await Promise.all(
    rows.map(async (row): Promise<PhotoReviewItem> => {
      const url = await callStore(fastify, { userId: row.userId }, () =>
        store.presignGet(row.storageKey, AVATAR_LIST_GET_EXPIRES_SEC, {
          stableHourly: true,
        }),
      );
      return {
        photoId: row.photoId,
        userId: row.userId,
        firstName: row.firstName,
        lastName: row.lastName,
        branchId: row.branchId,
        origin: row.origin,
        status: row.status === "pendiente" ? "pendiente" : "aprobada",
        reportCount: row.reportCount,
        lastReportedAt: row.lastReportedAt?.toISOString() ?? null,
        uploadedAt: row.uploadedAt.toISOString(),
        url,
      };
    }),
  );
  return { items, counts: { pending, reported } };
}

export interface ApproveProfilePhotoResult {
  status: "aprobada";
  auraAwarded: boolean;
}

/**
 * Aprueba la foto pendiente del alumno (D-31): reemplaza a la aprobada anterior
 * de origen `alumno` y acredita 5 Aura UNA sola vez en la vida (D-30): el unique
 * del ledger (`reference_id = userId`) es el candado, así que quitar y volver a
 * subir no vuelve a pagar. Sin pendiente pero con una aprobada reportada: "la
 * revisé y queda" (reportes en 0, sin Aura). Si no hay ninguna: 404.
 */
export async function approveProfilePhoto(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userId: number,
  reviewerId: number,
): Promise<ApproveProfilePhotoResult> {
  await assertLiveMember(fastify, ctx, userId);

  const outcome = await fastify.db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: schema.memberPhotos.id,
        storageKey: schema.memberPhotos.storageKey,
        origin: schema.memberPhotos.origin,
        status: schema.memberPhotos.status,
        reportCount: schema.memberPhotos.reportCount,
      })
      .from(schema.memberPhotos)
      .where(
        and(
          tenantWhere(schema.memberPhotos, ctx),
          eq(schema.memberPhotos.userId, userId),
          inArray(schema.memberPhotos.status, ["pendiente", "aprobada"]),
        ),
      )
      .orderBy(asc(schema.memberPhotos.id))
      .for("update");

    const pending = [...rows]
      .reverse()
      .find((row) => row.status === "pendiente" && row.origin === "alumno");

    if (pending) {
      const replacedKeys: string[] = [];
      for (const row of rows) {
        if (row.status !== "aprobada" || row.origin !== "alumno") continue;
        await tx
          .update(schema.memberPhotos)
          .set({ status: "reemplazada" })
          .where(
            and(
              tenantWhere(schema.memberPhotos, ctx),
              eq(schema.memberPhotos.id, row.id),
            ),
          );
        replacedKeys.push(row.storageKey);
      }
      await tx
        .update(schema.memberPhotos)
        .set({
          status: "aprobada",
          reviewedAt: new Date(),
          reviewedBy: reviewerId,
          reportCount: 0,
          reporterIds: null,
          lastReportedAt: null,
        })
        .where(
          and(
            tenantWhere(schema.memberPhotos, ctx),
            eq(schema.memberPhotos.id, pending.id),
          ),
        );
      return { kind: "approved" as const, replacedKeys };
    }

    const reported = rows.filter(
      (row) => row.status === "aprobada" && row.reportCount > 0,
    );
    if (reported.length === 0) {
      throw new NotFoundError("No hay foto para revisar");
    }
    await tx
      .update(schema.memberPhotos)
      .set({
        reportCount: 0,
        reporterIds: null,
        lastReportedAt: null,
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
      })
      .where(
        and(
          tenantWhere(schema.memberPhotos, ctx),
          inArray(
            schema.memberPhotos.id,
            reported.map((row) => row.id),
          ),
        ),
      );
    return { kind: "reviewed" as const, replacedKeys: [] as string[] };
  });

  if (outcome.replacedKeys.length > 0) {
    const store = tryResolveStore(fastify);
    if (store !== null) {
      for (const oldKey of outcome.replacedKeys) {
        await removeBestEffort(fastify, store, oldKey, "la foto reemplazada");
      }
    }
  }
  if (outcome.kind === "reviewed") {
    return { status: "aprobada", auraAwarded: false };
  }

  // El premio nunca rompe la aprobación (mismo patrón que aura/daily-award.ts).
  let auraAwarded = false;
  try {
    await new AuraService(fastify.db).award({
      userId,
      sourceType: "profile_photo",
      referenceType: "profile_photo",
      referenceId: userId,
      amount: AURA_AMOUNTS.profilePhoto,
      description: "Foto de perfil aprobada",
    });
    auraAwarded = true;
  } catch (err: unknown) {
    const { isDuplicate, detail } = isDuplicateKeyError(err);
    if (isDuplicate) {
      fastify.log.info({ userId }, "Aura de la foto ya cobrada");
    } else {
      fastify.log.warn(
        { userId, detail },
        "No se pudo acreditar la Aura de la foto",
      );
    }
  }
  return { status: "aprobada", auraAwarded };
}

/**
 * Rechaza la foto pendiente (D-31, D-69): guarda el motivo, borra el objeto y
 * avisa al alumno por push (best-effort, categoría `anuncios`). 404 si no hay
 * pendiente.
 */
export async function rejectProfilePhoto(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userId: number,
  reviewerId: number,
  reason: PhotoRejectionReason,
): Promise<{ status: "rechazada" }> {
  await assertLiveMember(fastify, ctx, userId);

  const storageKey = await fastify.db.transaction(async (tx) => {
    const [pending] = await tx
      .select({
        id: schema.memberPhotos.id,
        storageKey: schema.memberPhotos.storageKey,
      })
      .from(schema.memberPhotos)
      .where(
        and(
          tenantWhere(schema.memberPhotos, ctx),
          eq(schema.memberPhotos.userId, userId),
          eq(schema.memberPhotos.origin, "alumno"),
          eq(schema.memberPhotos.status, "pendiente"),
        ),
      )
      .orderBy(desc(schema.memberPhotos.id))
      .limit(1)
      .for("update");
    if (!pending) throw new NotFoundError("No hay foto para revisar");

    await tx
      .update(schema.memberPhotos)
      .set({
        status: "rechazada",
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
        rejectionReason: reason,
      })
      .where(
        and(
          tenantWhere(schema.memberPhotos, ctx),
          eq(schema.memberPhotos.id, pending.id),
        ),
      );
    return pending.storageKey;
  });

  const store = tryResolveStore(fastify);
  if (store !== null) {
    await removeBestEffort(fastify, store, storageKey, "la foto rechazada");
  }

  try {
    await new NotificationService(
      fastify.db,
      fastify.log,
    ).queueAdHocNotification(
      {
        userId,
        title: PHOTO_REJECTION_PUSH_TITLE,
        body: PHOTO_REJECTION_PUSH_BODY[reason],
        category: "anuncios",
      },
      ctx,
    );
  } catch (err: unknown) {
    fastify.log.warn(
      { userId, errName: err instanceof Error ? err.name : "unknown" },
      "Foto rechazada pero falló al encolar el aviso",
    );
  }
  return { status: "rechazada" };
}

// ---------------------------------------------------------------------------
// Alumno: estado de la foto propia para `GET /auth/me` (plan 15)
// ---------------------------------------------------------------------------

export interface OwnPhotoState {
  url: string | null;
  status: "none" | "pendiente" | "aprobada" | "rechazada";
  pendingUrl: string | null;
  rejectionReason: PhotoRejectionReason | null;
}

/**
 * Foto propia y su estado (D-32, D-43). `url` sigue la misma regla que la lista
 * de la comunidad (propia aprobada o espejo de la ficha, siempre firmada). Sin
 * storage las URLs quedan en null: nunca tira ni devuelve la URL pública.
 */
export async function getOwnPhotoState(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userId: number,
): Promise<OwnPhotoState> {
  const rows = await fastify.db
    .select({
      storageKey: schema.memberPhotos.storageKey,
      status: schema.memberPhotos.status,
      rejectionReason: schema.memberPhotos.rejectionReason,
    })
    .from(schema.memberPhotos)
    .where(
      and(
        tenantWhere(schema.memberPhotos, ctx),
        eq(schema.memberPhotos.userId, userId),
        eq(schema.memberPhotos.origin, "alumno"),
      ),
    )
    .orderBy(desc(schema.memberPhotos.id))
    .limit(50);

  let url: string | null = null;
  try {
    url =
      (
        await resolveCommunityPhotos(fastify, ctx, [userId], {
          expiresSec: AVATAR_ME_GET_EXPIRES_SEC,
        })
      ).get(userId)?.url ?? null;
  } catch (err: unknown) {
    if (!(err instanceof ProfilePhotoStorageUnavailableError)) throw err;
  }

  const pending = rows.find((row) => row.status === "pendiente");
  let pendingUrl: string | null = null;
  if (pending) {
    const store = tryResolveStore(fastify);
    if (store !== null) {
      try {
        pendingUrl = await callStore(fastify, { userId }, () =>
          store.presignGet(pending.storageKey, AVATAR_ME_GET_EXPIRES_SEC, {
            stableHourly: true,
          }),
        );
      } catch (err: unknown) {
        if (!(err instanceof ProfilePhotoStorageUnavailableError)) throw err;
      }
    }
  }

  const latest = rows[0];
  let status: OwnPhotoState["status"] = "none";
  if (pending) status = "pendiente";
  else if (latest?.status === "rechazada") status = "rechazada";
  else if (url !== null) status = "aprobada";

  return {
    url,
    status,
    pendingUrl,
    rejectionReason:
      status === "rechazada" ? (latest?.rejectionReason ?? null) : null,
  };
}
