// Módulo: conquer — bandeja de correcciones del coach (Fase 202)
//
// D-26: owner/admin ven las correcciones de SU gimnasio, miran el video del
// alumno (y el propio) y, D-28, pueden borrar el video del alumno cuando ya
// corrigieron. DA-44: un video ausente es `available: false`, no un error.
// DA-45: el borrado va primero a R2 y recién después a la fila. DA-46: el
// contador de pendientes alimenta el badge del menú. D-26/DA-43: el coach
// responde UNA vez, con texto, con un video propio de hasta 30 s o con los dos.
//
// Todo se arma sobre los helpers de `correction-service.ts` (que nunca importa
// de acá: evita el ciclo). No se loguean claves de video ni URLs firmadas.
import { and, count, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyInstance } from "fastify";
import * as schema from "../../db/schema";
import { AppError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  callVideoStore,
  confirmCorrectionVideo,
  loadCorrectionRows,
  resolveCorrectionVideo,
  toCorrectionView,
  type CorrectionRow,
  type CorrectionUploadResult,
  type CorrectionVideoUrl,
  type CorrectionView,
} from "./correction-service";
import {
  isCorrectionReplyKey,
  privateCorrectionReplyKey,
  privateMediaResolver,
  PRIVATE_PUT_EXPIRES_SEC,
} from "./private-media";
import type { Level } from "./rules";
import {
  CORRECTION_REPLY_MAX,
  CORRECTION_VIDEO_MAX_BYTES,
  CORRECTION_VIDEO_MAX_SECONDS,
  isValidVideoSeconds,
  isVideoContentType,
  normalizeText,
} from "./video-rules";

type DbInstance = MySql2Database<typeof schema>;
type Tx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

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
    .where(and(tenantWhere(c, ctx), eq(c.id, correctionId)));
  return toAdminCorrectionView(
    await loadAdminCorrection(fastify.db, ctx, correctionId),
  );
}

// ── Responder (D-26, DA-43) ─────────────────────────────────────────

/** Cuerpo de `POST /corrections/:id/reply`; los valores los valida el servicio. */
export interface ReplyCorrectionBody {
  text?: string | null;
  key?: string | null;
  durationSec?: number | null;
}

function alreadyRepliedError(): AppError {
  return new AppError(
    "Esta corrección ya tiene respuesta",
    409,
    "CONQUER_CORRECCION_RESPONDIDA",
  );
}

/**
 * `POST /corrections/:id/reply-upload-url`. Orden (DA-43): corrección del
 * gimnasio (404) -> ya respondida (409) -> storage (503) -> tipo (400). La clave
 * queda atada al gimnasio, al ALUMNO y a la corrección (T-201-136).
 */
export async function requestReplyUpload(
  fastify: FastifyInstance,
  ctx: TenantContext,
  correctionId: number,
  contentType: string,
): Promise<CorrectionUploadResult> {
  const row = await loadAdminCorrection(fastify.db, ctx, correctionId);
  if (row.status !== "pendiente") throw alreadyRepliedError();
  const store = privateMediaResolver.resolve(fastify, "videos");
  if (!isVideoContentType(contentType)) {
    throw new AppError(
      "Solo se aceptan videos MP4 o MOV",
      400,
      "CONQUER_VIDEO_TIPO_INVALIDO",
    );
  }
  const key = privateCorrectionReplyKey({
    tenantId: ctx.tenantId,
    userId: row.userId,
    correctionId,
    contentType,
  });
  const uploadUrl = await callVideoStore(fastify, { correctionId }, () =>
    store.presignPut(key, contentType, PRIVATE_PUT_EXPIRES_SEC),
  );
  return {
    uploadUrl,
    key,
    contentType,
    expiresIn: PRIVATE_PUT_EXPIRES_SEC,
    maxBytes: CORRECTION_VIDEO_MAX_BYTES,
  };
}

/** Respuesta ya normalizada: al menos texto o video (DA-43). */
interface ValidReply {
  text: string | null;
  key: string | null;
  durationSec: number | null;
}

/**
 * Valida el cuerpo (DA-43, DA-40): texto recortado y de hasta 1000, texto o
 * video, y duración 1..30 solo si hay video. Sin `key`, `durationSec` se ignora.
 */
function validateReplyBody(body: ReplyCorrectionBody): ValidReply {
  const text = normalizeText(body.text, CORRECTION_REPLY_MAX);
  if (!text.ok) {
    throw new AppError(
      `La respuesta puede tener hasta ${CORRECTION_REPLY_MAX} caracteres`,
      400,
      "CONQUER_RESPUESTA_LARGA",
    );
  }
  const key = typeof body.key === "string" && body.key !== "" ? body.key : null;
  if (text.value === null && key === null) {
    throw new AppError(
      "Escribí una respuesta o subí un video",
      400,
      "CONQUER_RESPUESTA_VACIA",
    );
  }
  if (key === null) return { text: text.value, key: null, durationSec: null };
  if (!isValidVideoSeconds(body.durationSec)) {
    throw new AppError(
      `El video tiene que durar ${CORRECTION_VIDEO_MAX_SECONDS} segundos o menos`,
      400,
      "CONQUER_VIDEO_DURACION",
    );
  }
  return { text: text.value, key, durationSec: body.durationSec };
}

/**
 * Primer statement de la tx (T-201-137): bloquea la corrección (`FOR UPDATE`) y
 * exige que siga `pendiente`. El segundo coach que llega espera el lock, ve
 * `respondida` y recibe el 409.
 */
async function lockPendingCorrection(
  tx: Tx,
  ctx: TenantContext,
  correctionId: number,
): Promise<void> {
  const [row] = await tx
    .select({ status: schema.conquerCorrections.status })
    .from(schema.conquerCorrections)
    .where(
      and(
        tenantWhere(schema.conquerCorrections, ctx),
        eq(schema.conquerCorrections.id, correctionId),
      ),
    )
    .limit(1)
    .for("update");
  if (!row) throw new AppError("Corrección no encontrada", 404);
  if (row.status !== "pendiente") throw alreadyRepliedError();
}

/** Tx de la respuesta: lock, estado y UNA update (la respuesta es final, DA-43). */
async function writeReply(
  db: DbInstance,
  ctx: TenantContext,
  actorUserId: number,
  correctionId: number,
  reply: ValidReply,
): Promise<void> {
  const c = schema.conquerCorrections;
  await db.transaction(async (tx) => {
    await lockPendingCorrection(tx, ctx, correctionId);
    await tx
      .update(c)
      .set({
        status: "respondida",
        replyText: reply.text,
        replyVideoKey: reply.key,
        replyVideoSeconds: reply.durationSec,
        repliedBy: actorUserId,
        repliedAt: sql`NOW()`,
        // Fase 202 DA-46: la respuesta nueva cuenta como no vista.
        replySeenAt: null,
      })
      .where(
        and(
          tenantWhere(c, ctx),
          eq(c.id, correctionId),
          eq(c.status, "pendiente"),
        ),
      );
  });
}

/**
 * `POST /corrections/:id/reply`. Orden (DA-43): corrección del gimnasio (404) ->
 * ya respondida (409) -> texto largo (400) -> vacía (400) -> duración (400) ->
 * storage (503) -> clave (400) -> HEAD (409/400) -> tx con la corrección
 * bloqueada. Responder NO toca el video del alumno (D-28: se borra aparte).
 * Si pierde la carrera, el objeto subido no se borra: la clave es de esa
 * corrección y el que ganó pudo haber usado la misma; lo vence la regla de 60 días.
 */
export async function replyCorrection(
  fastify: FastifyInstance,
  ctx: TenantContext,
  actorUserId: number,
  correctionId: number,
  body: ReplyCorrectionBody,
): Promise<AdminCorrectionView> {
  const row = await loadAdminCorrection(fastify.db, ctx, correctionId);
  if (row.status !== "pendiente") throw alreadyRepliedError();
  const reply = validateReplyBody(body);
  if (reply.key !== null) {
    const store = privateMediaResolver.resolve(fastify, "videos");
    if (!isCorrectionReplyKey(reply.key, ctx.tenantId, row.userId, row.id)) {
      throw new AppError(
        "El video no es válido",
        400,
        "CONQUER_VIDEO_CLAVE_INVALIDA",
      );
    }
    await confirmCorrectionVideo(fastify, store, reply.key, { correctionId });
  }
  await writeReply(fastify.db, ctx, actorUserId, correctionId, reply);
  return toAdminCorrectionView(
    await loadAdminCorrection(fastify.db, ctx, correctionId),
  );
}
