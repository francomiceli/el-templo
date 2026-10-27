// Módulo: conquer — bandeja de correcciones del coach (Fase 202)
//
// D-26: owner/admin ven las correcciones de SU gimnasio, miran el video del
// alumno (y el propio) y, D-28, pueden borrar el video del alumno cuando ya
// corrigieron. DA-44: un video ausente es `available: false`, no un error.
// DA-45: el borrado va primero a R2 y recién después a la fila. DA-46: el
// contador de pendientes alimenta el badge del menú.
//
// Todo se arma sobre los helpers de `correction-service.ts` (que nunca importa
// de acá: evita el ciclo). No se loguean claves de video ni URLs firmadas.
import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyInstance } from "fastify";
import * as schema from "../../db/schema";
import { AppError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  callVideoStore,
  loadCorrectionRows,
  resolveCorrectionVideo,
  toCorrectionView,
  type CorrectionRow,
  type CorrectionVideoUrl,
  type CorrectionView,
} from "./correction-service";
import { privateMediaResolver } from "./private-media";
import type { Level } from "./rules";

type DbInstance = MySql2Database<typeof schema>;

/** Respondidas que muestra la bandeja (las más nuevas por `replied_at`). */
export const ADMIN_ANSWERED_LIMIT = 50;

/**
 * Pendientes: "todas" (DA-46). Cada alumno tiene tope de 3, así que la lista
 * está acotada; el límite es solo una red de seguridad de la query.
 */
export const ADMIN_PENDING_LIMIT = 1000;

/** Vista del coach: la del alumno sin `replyUnseen` + quién es y qué se puede hacer. */
export interface AdminCorrectionView extends Omit<
  CorrectionView,
  "replyUnseen"
> {
  userId: number;
  memberName: string;
  level: Level | null;
  /** ISO de cuando el coach borró el video del alumno (D-28), o `null`. */
  videoDeletedAt: string | null;
  /** Nombre de pila del coach que respondió, o `null`. */
  repliedByName: string | null;
  /** `true` mientras la corrección esté pendiente (202-06 responde). */
  canReply: boolean;
}

/** Fase 202 DA-46: `GET /corrections` del coach. */
export interface AdminCorrectionsResponse {
  items: AdminCorrectionView[];
}

function invalidStatusError(): AppError {
  return new AppError(
    "El estado tiene que ser pendiente o respondida",
    400,
    "CONQUER_CORRECCION_ESTADO_INVALIDO",
  );
}

function invalidWhoError(): AppError {
  return new AppError(
    "Elegí si querés ver el video del alumno o el del coach",
    400,
    "CONQUER_VIDEO_QUIEN_INVALIDO",
  );
}

/** Misma fila que la vista del alumno (DRY): se le saca `replyUnseen` y se suma lo del coach. */
export function toAdminCorrectionView(row: CorrectionRow): AdminCorrectionView {
  const { replyUnseen: _replyUnseen, ...view } = toCorrectionView(row);
  return {
    ...view,
    userId: row.userId,
    memberName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim(),
    level: row.level,
    videoDeletedAt:
      row.videoDeletedAt === null ? null : row.videoDeletedAt.toISOString(),
    repliedByName: row.repliedByFirstName,
    canReply: row.status === "pendiente",
  };
}

/** Corrección del gimnasio o 404 (la de otro gimnasio es indistinguible de una inexistente). */
export async function loadAdminCorrection(
  db: DbInstance,
  ctx: TenantContext,
  correctionId: number,
): Promise<CorrectionRow> {
  const [row] = await loadCorrectionRows(db, ctx, {
    id: correctionId,
    limit: 1,
    order: "desc",
  });
  if (!row) throw new AppError("Corrección no encontrada", 404);
  return row;
}

/**
 * `GET /corrections?status=pendiente|respondida`. `status` se valida acá (400
 * con `code`); ausente = `pendiente`. Pendientes: la más vieja primero, como los
 * pedidos. Respondidas: las 50 más nuevas por `replied_at`.
 */
export async function listCorrectionsForAdmin(
  db: DbInstance,
  ctx: TenantContext,
  status: string | undefined,
): Promise<AdminCorrectionsResponse> {
  const wanted = status ?? "pendiente";
  if (wanted !== "pendiente" && wanted !== "respondida") {
    throw invalidStatusError();
  }
  const rows =
    wanted === "pendiente"
      ? await loadCorrectionRows(db, ctx, {
          status: "pendiente",
          limit: ADMIN_PENDING_LIMIT,
          order: "asc",
        })
      : await loadCorrectionRows(db, ctx, {
          status: "respondida",
          limit: ADMIN_ANSWERED_LIMIT,
          order: "desc",
          orderBy: "repliedAt",
        });
  return { items: rows.map(toAdminCorrectionView) };
}

/** Contador del badge de la pestaña Correcciones (DA-46): pendientes del gimnasio. */
export async function countPendingCorrections(
  db: DbInstance,
  ctx: TenantContext,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.conquerCorrections)
    .where(
      and(
        tenantWhere(schema.conquerCorrections, ctx),
        eq(schema.conquerCorrections.status, "pendiente"),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * `GET /corrections/:id/video-url?who=alumno|coach`. Orden (DA-44): corrección
 * del gimnasio (404) -> `who` (400) -> storage. El coach NO filtra por alumno.
 */
export async function getAdminCorrectionVideoUrl(
  fastify: FastifyInstance,
  ctx: TenantContext,
  correctionId: number,
  who: string,
): Promise<CorrectionVideoUrl> {
  const row = await loadAdminCorrection(fastify.db, ctx, correctionId);
  if (who !== "alumno" && who !== "coach") throw invalidWhoError();
  const key = who === "alumno" ? row.videoKey : row.replyVideoKey;
  return resolveCorrectionVideo(fastify, key, { correctionId: row.id });
}

/**
 * `DELETE /corrections/:id/video` (D-28, DA-45): borra SOLO el video del alumno.
 * Corrección del gimnasio (404) -> sin clave: ya estaba borrado, 200 sin tocar
 * el storage (idempotente) -> storage (503) -> `remove` del objeto (si falla,
 * 503 y la fila NO cambia) -> la fila guarda quién y cuándo. El comentario, el
 * estado y el video de la respuesta no se tocan.
 */
export async function deleteCorrectionVideo(
  fastify: FastifyInstance,
  ctx: TenantContext,
  actorUserId: number,
  correctionId: number,
): Promise<AdminCorrectionView> {
  const row = await loadAdminCorrection(fastify.db, ctx, correctionId);
  const key = row.videoKey;
  if (key === null) return toAdminCorrectionView(row);

  const store = privateMediaResolver.resolve(fastify, "videos");
  await callVideoStore(fastify, { correctionId }, () => store.remove(key));

  const c = schema.conquerCorrections;
  await fastify.db
    .update(c)
    .set({
      videoKey: null,
      videoDeletedAt: sql`NOW()`,
      videoDeletedBy: actorUserId,
    })
    .where(
      and(
        tenantWhere(c, ctx),
        eq(c.id, correctionId),
        // Dos borrados a la vez: el segundo no pisa quién y cuándo del primero.
        isNotNull(c.videoKey),
      ),
    );
  return toAdminCorrectionView(
    await loadAdminCorrection(fastify.db, ctx, correctionId),
  );
}
