/**
 * Fábricas de la foto de perfil para los tests del staff (fase 214, plan 15) y
 * de ISO-03 de members. Usuarios SIEMPRE con fábricas (ids nunca fijos).
 */
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  fichaMirrorKey,
  privateAvatarKey,
} from "../../src/modules/conquer/private-media";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";

export const FOTO_CTX: TenantContext = { tenantId: 1 };
export const FOTO_PUBLIC_URL = "https://pub-test.r2.dev";

export type SeedPhotoStatus =
  (typeof schema.memberPhotos.status.enumValues)[number];

export interface SeedPhotoOptions {
  origin?: "alumno" | "ficha";
  status?: SeedPhotoStatus;
  storageKey?: string;
  sourceUrl?: string | null;
  reportCount?: number;
  reporterIds?: number[] | null;
  ctx?: TenantContext;
}

/** Siembra una fila de `member_photos` directo (no pasa por la API). */
export async function seedMemberPhoto(
  app: FastifyInstance,
  userId: number,
  opts: SeedPhotoOptions = {},
): Promise<{ id: number; storageKey: string }> {
  const ctx = opts.ctx ?? FOTO_CTX;
  const origin = opts.origin ?? "alumno";
  const sourceUrl =
    opts.sourceUrl ??
    (origin === "ficha" ? `${FOTO_PUBLIC_URL}/x-${userId}.jpg` : null);
  const storageKey =
    opts.storageKey ??
    (origin === "alumno"
      ? privateAvatarKey({ tenantId: ctx.tenantId, userId })
      : fichaMirrorKey({
          tenantId: ctx.tenantId,
          userId,
          sourceUrl: sourceUrl ?? `${FOTO_PUBLIC_URL}/x-${userId}.jpg`,
        }));
  const [inserted] = await app.db
    .insert(schema.memberPhotos)
    .values(
      tenantValues(ctx, {
        userId,
        storageKey,
        origin,
        status: opts.status ?? "pendiente",
        sourceUrl,
        reportCount: opts.reportCount ?? 0,
        reporterIds: opts.reporterIds ?? null,
      }),
    )
    .$returningId();
  if (!inserted) throw new Error("no se pudo sembrar la foto");
  return { id: inserted.id, storageKey };
}

export async function photoRowsOf(
  app: FastifyInstance,
  userId: number,
  ctx: TenantContext = FOTO_CTX,
) {
  return app.db
    .select()
    .from(schema.memberPhotos)
    .where(
      and(
        tenantWhere(schema.memberPhotos, ctx),
        eq(schema.memberPhotos.userId, userId),
      ),
    )
    .orderBy(schema.memberPhotos.id);
}

export async function photoRowById(
  app: FastifyInstance,
  photoId: number,
  ctx: TenantContext = FOTO_CTX,
) {
  const [row] = await app.db
    .select()
    .from(schema.memberPhotos)
    .where(
      and(
        tenantWhere(schema.memberPhotos, ctx),
        eq(schema.memberPhotos.id, photoId),
      ),
    );
  if (!row) throw new Error(`foto ${photoId} no encontrada`);
  return row;
}

/** Filas del ledger de Aura por la foto de perfil de un usuario. */
export async function profilePhotoAuraRows(
  app: FastifyInstance,
  userId: number,
  ctx: TenantContext = FOTO_CTX,
) {
  return app.db
    .select()
    .from(schema.auraTransactions)
    .where(
      and(
        tenantWhere(schema.auraTransactions, ctx),
        eq(schema.auraTransactions.userId, userId),
        eq(schema.auraTransactions.sourceType, "profile_photo"),
      ),
    );
}

export async function setUserPhotoUrl(
  app: FastifyInstance,
  userId: number,
  photoUrl: string | null,
  ctx: TenantContext = FOTO_CTX,
) {
  await app.db
    .update(schema.users)
    .set({ photoUrl })
    .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)));
}

export async function readUserPhotoUrl(
  app: FastifyInstance,
  userId: number,
  ctx: TenantContext = FOTO_CTX,
): Promise<string | null> {
  const [row] = await app.db
    .select({ photoUrl: schema.users.photoUrl })
    .from(schema.users)
    .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)));
  return row?.photoUrl ?? null;
}

/**
 * El alumno sube y confirma por la API real (requiere `mockPrivateMedia`).
 * Devuelve la clave y el id de la fila `pendiente`.
 */
export async function uploadAndConfirmAsMember(
  app: FastifyInstance,
  token: string,
): Promise<{ key: string; photoId: number }> {
  const headers = { authorization: `Bearer ${token}` };
  const up = await app.inject({
    method: "POST",
    url: "/api/members/profile-photo/upload-url",
    headers,
    payload: { contentType: "image/jpeg", acceptedRules: true },
  });
  if (up.statusCode !== 200) {
    throw new Error(`upload-url respondió ${up.statusCode}: ${up.body}`);
  }
  const { key } = up.json<{ key: string }>();
  const confirm = await app.inject({
    method: "POST",
    url: "/api/members/profile-photo/confirm",
    headers,
    payload: { key },
  });
  if (confirm.statusCode !== 201) {
    throw new Error(`confirm respondió ${confirm.statusCode}: ${confirm.body}`);
  }
  return { key, photoId: confirm.json<{ photoId: number }>().photoId };
}
