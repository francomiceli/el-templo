// Módulo: members (fase 214, D-34, D-43, D-63)
//
// Espejo privado de la foto de ficha. La `users.photo_url` que carga el staff es
// una URL PÚBLICA que lleva el id del usuario y nunca se revoca. Para mostrarla
// en la comunidad se copia al bucket privado, una sola vez por `photo_url`, y se
// firma como las demás fotos. Este paso corre aparte (job cada 15 minutos): ni
// `GET /attendees` ni `GET /me` copian ni escriben (un GET no escribe, y una
// `photo_url` rota no se reintenta en cada pedido).
//
// Una `photo_url` se intenta una sola vez: sale -> fila `ficha` `aprobada`; falla
// -> fila `ficha` `fallida` (esa URL no se reintenta). Si el staff cambia la
// `photo_url`, hay URL nueva y se vuelve a intentar.
//
// `users.photo_url` se guarda al GENERAR la URL de subida, antes de que el
// archivo exista: se ignoran las URLs de menos de 15 minutos (el timestamp va en
// el nombre del archivo) para no marcar como fallida una foto que todavía se
// está subiendo. Se reintentan en una corrida posterior.
//
// Logs sin URLs ni claves (dato sensible): solo conteos y el nombre del error.
import { and, eq, isNotNull, isNull, notExists } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import {
  PhotoStorageUnavailableError,
  fichaMirrorKey,
  privateMediaResolver,
  publicKeyFromFichaUrl,
  type PrivateMediaStore,
} from "../conquer/private-media";

/** Edad mínima de una `photo_url` para intentar copiarla (15 minutos). */
export const FICHA_PHOTO_MIN_AGE_MS = 15 * 60 * 1000;
/** Tope de usuarios por gimnasio y corrida. */
const DEFAULT_LIMIT = 50;

export interface FichaMirrorResult {
  mirrored: number;
  failed: number;
  skipped: number;
}

/**
 * ¿La `photo_url` es demasiado nueva para copiarla? El timestamp (ms) va al
 * final del nombre: `.../{userId}-{ts}.{ext}`. Una URL sin timestamp legible no
 * es "nueva": se procesa y, si no tiene la forma esperada, queda `fallida`.
 */
export function isFichaUrlTooFresh(url: string, now: Date): boolean {
  const ts = /-(\d+)\.[A-Za-z0-9]+$/.exec(url)?.[1];
  if (ts === undefined) return false;
  return now.getTime() - Number(ts) < FICHA_PHOTO_MIN_AGE_MS;
}

export async function mirrorFichaPhotos(
  fastify: FastifyInstance,
  ctx: TenantContext,
  opts: { limit?: number; now?: Date } = {},
): Promise<FichaMirrorResult> {
  const db = fastify.db;
  const now = opts.now ?? new Date();
  const result: FichaMirrorResult = { mirrored: 0, failed: 0, skipped: 0 };

  // Usuarios con `photo_url` que NO tienen espejo `ficha` de esa misma URL (en
  // cualquier estado, incluido `fallida`).
  const candidates = await db
    .select({ id: schema.users.id, photoUrl: schema.users.photoUrl })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, ctx),
        isNull(schema.users.deletedAt),
        isNotNull(schema.users.photoUrl),
        notExists(
          db
            .select({ id: schema.memberPhotos.id })
            .from(schema.memberPhotos)
            .where(
              and(
                tenantWhere(schema.memberPhotos, ctx),
                eq(schema.memberPhotos.userId, schema.users.id),
                eq(schema.memberPhotos.origin, "ficha"),
                eq(schema.memberPhotos.sourceUrl, schema.users.photoUrl),
              ),
            ),
        ),
      ),
    )
    .orderBy(schema.users.id)
    .limit(opts.limit ?? DEFAULT_LIMIT);

  if (candidates.length === 0) return result;

  let store: PrivateMediaStore;
  try {
    store = privateMediaResolver.resolve(fastify);
  } catch (err: unknown) {
    if (err instanceof PhotoStorageUnavailableError) {
      result.skipped = candidates.length;
      return result;
    }
    throw err;
  }

  for (const candidate of candidates) {
    const photoUrl = candidate.photoUrl;
    if (photoUrl === null) continue;
    if (isFichaUrlTooFresh(photoUrl, now)) {
      result.skipped += 1;
      continue;
    }

    const storageKey = fichaMirrorKey({
      tenantId: ctx.tenantId,
      userId: candidate.id,
      sourceUrl: photoUrl,
    });

    // `publicKey` null = URL con otro formato: nunca se toca el bucket público.
    const publicKey = publicKeyFromFichaUrl(photoUrl, candidate.id);
    let copied = false;
    if (publicKey !== null) {
      try {
        copied = await store.copyFromPublic(publicKey, storageKey);
      } catch (err: unknown) {
        fastify.log.warn(
          { errName: err instanceof Error ? err.name : "unknown" },
          "Espejo de foto de ficha: falló la copia",
        );
      }
    }

    if (!copied) {
      await db.insert(schema.memberPhotos).values(
        tenantValues(ctx, {
          userId: candidate.id,
          storageKey,
          origin: "ficha" as const,
          status: "fallida" as const,
          sourceUrl: photoUrl,
        }),
      );
      result.failed += 1;
      continue;
    }

    const replacedKeys = await db.transaction(async (tx) => {
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
            eq(schema.memberPhotos.userId, candidate.id),
            eq(schema.memberPhotos.origin, "ficha"),
          ),
        )
        .for("update");

      const stale: string[] = [];
      for (const row of rows) {
        if (row.status !== "aprobada" || row.storageKey === storageKey) {
          continue;
        }
        await tx
          .update(schema.memberPhotos)
          .set({ status: "reemplazada" })
          .where(
            and(
              tenantWhere(schema.memberPhotos, ctx),
              eq(schema.memberPhotos.id, row.id),
            ),
          );
        stale.push(row.storageKey);
      }

      // Otra corrida pudo insertar esta misma clave: no se duplica.
      if (!rows.some((row) => row.storageKey === storageKey)) {
        await tx.insert(schema.memberPhotos).values(
          tenantValues(ctx, {
            userId: candidate.id,
            storageKey,
            origin: "ficha" as const,
            status: "aprobada" as const,
            sourceUrl: photoUrl,
          }),
        );
      }
      return stale;
    });

    // Best-effort: el objeto privado del espejo reemplazado ya no sirve.
    for (const key of replacedKeys) {
      try {
        await store.remove(key);
      } catch (err: unknown) {
        fastify.log.warn(
          { errName: err instanceof Error ? err.name : "unknown" },
          "Espejo de foto de ficha: no se pudo borrar el espejo anterior",
        );
      }
    }
    result.mirrored += 1;
  }

  return result;
}
