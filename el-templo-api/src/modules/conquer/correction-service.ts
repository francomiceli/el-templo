// Módulo: conquer — correcciones con video, lado del alumno (Fase 202)
//
// D-26: el alumno manda un video de hasta 30 s de un escalón de su plan (o de un
// combo si es Espartano) y el coach le responde. D-27: el video va al bucket R2
// PRIVADO y el servidor hace cumplir tipo y tamaño con HEAD. D-29: sin push.
//
// Decisiones: DA-39 (tipos y tamaños: lo hace cumplir el HEAD y borra lo que se
// pasa), DA-40 (duración 1..30 validada), DA-41 (objetivo: escalón del plan o
// combo; `targets` y `targetLabel` los arma el API), DA-42 (tope de 3 sin
// responder, mirado al pedir la URL y otra vez al crear, dentro de la tx con
// `lockActiveMember`), DA-43 (largo del comentario) y DA-47 (las 50 más nuevas).
//
// Este archivo también exporta los helpers que reusan el coach (202-05) y los
// planes 202-04/06: `loadCorrectionRows`, `toCorrectionView` y `callVideoStore`.
//
// Las claves de storage y las URLs firmadas son dato sensible: acá se loguea a
// lo sumo `{ correctionId }` o `{ userId }` y el NOMBRE del error del SDK.
import { alias } from "drizzle-orm/mysql-core";
import { and, asc, count, desc, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyInstance } from "fastify";
import * as schema from "../../db/schema";
import { AppError } from "../shared/errors";
import { isDuplicateKeyError } from "../shared/sql-errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { lockActiveMember } from "./activation-service";
import { planDays } from "./catalog-service";
import { COMBO_KEYS, COMBOS, isComboKey, type ComboKey } from "./combos";
import type { StepKey } from "./engine";
import {
  loadMemberContext,
  markKey,
  type MemberContext,
} from "./history-loader";
import {
  isOwnCorrectionVideoKey,
  privateCorrectionVideoKey,
  privateMediaResolver,
  PRIVATE_PUT_EXPIRES_SEC,
  VideoStorageUnavailableError,
  type PrivateMediaStore,
} from "./private-media";
import type { Level } from "./rules";
import {
  CORRECTION_COMMENT_MAX,
  CORRECTION_PENDING_MAX,
  CORRECTION_VIDEO_MAX_BYTES,
  CORRECTION_VIDEO_MAX_SECONDS,
  checkUploadedVideo,
  isValidVideoSeconds,
  isVideoContentType,
  normalizeText,
  STEP_LABELS,
  VIDEO_CONTENT_TYPES,
} from "./video-rules";

type DbInstance = MySql2Database<typeof schema>;

/** Las correcciones que ve el alumno en su pantalla (DA-47). */
export const MEMBER_CORRECTIONS_LIMIT = 50;

const STEP_ORDER: readonly StepKey[] = ["e1", "e2", "e3", "hold"];

// ── Contratos ───────────────────────────────────────────────────────

export type CorrectionKind = "escalon" | "combo";

export interface CorrectionTarget {
  /** `"escalon:{exerciseId}:{step}"` o `"combo:{comboKey}"`. */
  key: string;
  kind: CorrectionKind;
  exerciseId: number | null;
  step: StepKey | null;
  comboKey: ComboKey | null;
  /** Nombre del ejercicio o `"Combos"`. */
  group: string;
  label: string;
}

export interface CorrectionReplyView {
  text: string | null;
  hasVideo: boolean;
  videoSeconds: number | null;
  repliedAt: string;
}

export interface CorrectionView {
  id: number;
  kind: CorrectionKind;
  targetLabel: string;
  comment: string | null;
  durationSec: number;
  createdAt: string;
  status: "pendiente" | "respondida";
  videoDeleted: boolean;
  reply: CorrectionReplyView | null;
  replyUnseen: boolean;
}

export interface CorrectionLimits {
  pending: number;
  pendingMax: number;
  maxSeconds: number;
  maxBytes: number;
  commentMax: number;
}

export interface CorrectionsResponse {
  items: CorrectionView[];
  targets: CorrectionTarget[];
  limits: CorrectionLimits;
}

export interface CorrectionUploadResult {
  uploadUrl: string;
  key: string;
  contentType: string;
  expiresIn: number;
  maxBytes: number;
}

export interface CreateCorrectionBody {
  exerciseId?: number | null;
  step?: string | null;
  comboKey?: string | null;
  comment?: string | null;
  key: string;
  durationSec: number;
}

// ── Storage ─────────────────────────────────────────────────────────

/**
 * Llama al storage sin dejar escapar su error: el del SDK puede nombrar el
 * bucket o la clave. Se loguea `{ correctionId | userId }` y el NOMBRE del
 * error; se responde 503 genérico de videos (D-27).
 */
export async function callVideoStore<T>(
  fastify: FastifyInstance,
  info: { correctionId?: number; userId?: number },
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (err: unknown) {
    fastify.log.warn(
      { ...info, errName: err instanceof Error ? err.name : "unknown" },
      "conquer video storage call failed",
    );
    throw new VideoStorageUnavailableError();
  }
}

/**
 * Borra un objeto que no se va a usar. Best-effort: si falla ya se está
 * respondiendo otro error y el objeto lo vence la regla de 60 días (DA-38).
 */
async function removeQuietly(
  fastify: FastifyInstance,
  store: PrivateMediaStore,
  userId: number,
  key: string,
): Promise<void> {
  try {
    await store.remove(key);
  } catch (err: unknown) {
    fastify.log.warn(
      { userId, errName: err instanceof Error ? err.name : "unknown" },
      "conquer correction orphan video not removed",
    );
  }
}

// ── Objetivos (DA-41) ───────────────────────────────────────────────

function escalonTarget(
  ctx: MemberContext,
  exerciseId: number,
  exerciseName: string,
  step: StepKey,
): CorrectionTarget {
  const rungId = ctx.steps.get(markKey(exerciseId, step))?.rungId;
  const rung =
    rungId === undefined ? undefined : ctx.catalog.rungById.get(rungId);
  return {
    key: `escalon:${exerciseId}:${step}`,
    kind: "escalon",
    exerciseId,
    step,
    comboKey: null,
    group: exerciseName,
    label: rung ? `${STEP_LABELS[step]} · ${rung.name}` : STEP_LABELS[step],
  };
}

function comboTarget(comboKey: ComboKey): CorrectionTarget {
  return {
    key: `combo:${comboKey}`,
    kind: "combo",
    exerciseId: null,
    step: null,
    comboKey,
    group: "Combos",
    label: `Combo ${COMBOS[comboKey].label}`,
  };
}

/**
 * Fase 202 DA-41: lo que el alumno puede corregir. Los cuatro escalones de cada
 * ejercicio de los días de su plan (sin repetir si un ejercicio aparece en dos
 * días) y, solo si es Espartano (`toro`), los seis combos.
 */
export function listCorrectionTargets(ctx: MemberContext): CorrectionTarget[] {
  const targets: CorrectionTarget[] = [];
  const seen = new Set<number>();
  for (const day of planDays(ctx.catalog, ctx.daysCount)) {
    for (const code of day.exerciseCodes) {
      const exercise = ctx.catalog.exerciseByCode.get(code);
      if (!exercise || seen.has(exercise.id)) continue;
      seen.add(exercise.id);
      for (const step of STEP_ORDER) {
        targets.push(escalonTarget(ctx, exercise.id, exercise.name, step));
      }
    }
  }
  if (ctx.level === "toro") {
    for (const comboKey of COMBO_KEYS) targets.push(comboTarget(comboKey));
  }
  return targets;
}

function invalidTargetError(): AppError {
  return new AppError(
    "Elegí un escalón de tu plan",
    400,
    "CONQUER_CORRECCION_OBJETIVO_INVALIDO",
  );
}

/**
 * Objetivo del body: exactamente uno entre `exerciseId` + `step` y `comboKey`, y
 * tiene que estar en la lista de `listCorrectionTargets` (escalón de SU plan;
 * combo solo para Espartano).
 */
function validateTarget(
  ctx: MemberContext,
  body: CreateCorrectionBody,
): CorrectionTarget {
  const hasEscalon =
    (body.exerciseId !== undefined && body.exerciseId !== null) ||
    (body.step !== undefined && body.step !== null);
  const hasCombo = body.comboKey !== undefined && body.comboKey !== null;
  if (hasEscalon === hasCombo) throw invalidTargetError();

  let key: string;
  if (hasCombo) {
    if (!isComboKey(body.comboKey)) throw invalidTargetError();
    key = `combo:${body.comboKey}`;
  } else {
    if (
      typeof body.exerciseId !== "number" ||
      typeof body.step !== "string" ||
      !STEP_ORDER.some((s) => s === body.step)
    ) {
      throw invalidTargetError();
    }
    key = `escalon:${body.exerciseId}:${body.step}`;
  }
  const target = listCorrectionTargets(ctx).find((t) => t.key === key);
  if (!target) throw invalidTargetError();
  return target;
}

// ── Lectura ─────────────────────────────────────────────────────────

/** Fila de una corrección con todo lo que necesitan el alumno y el coach (una sola query). */
export interface CorrectionRow {
  id: number;
  userId: number;
  /** `users.first_name`/`last_name` admiten NULL. */
  firstName: string | null;
  lastName: string | null;
  level: Level | null;
  exerciseName: string | null;
  exerciseId: number | null;
  step: StepKey | null;
  comboKey: string | null;
  rungName: string | null;
  comment: string | null;
  videoKey: string | null;
  videoSeconds: number;
  videoDeletedAt: Date | null;
  status: "pendiente" | "respondida";
  replyText: string | null;
  replyVideoKey: string | null;
  replyVideoSeconds: number | null;
  repliedAt: Date | null;
  repliedByFirstName: string | null;
  replySeenAt: Date | null;
  createdAt: Date;
}

export interface CorrectionRowsWhere {
  userId?: number;
  id?: number;
  status?: "pendiente" | "respondida";
  limit: number;
  order: "asc" | "desc";
}

/**
 * Correcciones del gimnasio con join a `users` (alumno), `conquer_exercises`,
 * `conquer_rungs`, `conquer_members` (nivel) y `users` del coach que respondió.
 * Todas las tablas gym-owned filtran por tenant (también en los joins).
 */
export async function loadCorrectionRows(
  db: DbInstance,
  ctx: TenantContext,
  where: CorrectionRowsWhere,
): Promise<CorrectionRow[]> {
  const replier = alias(schema.users, "correction_replier");
  const c = schema.conquerCorrections;
  const order =
    where.order === "desc"
      ? [desc(c.createdAt), desc(c.id)]
      : [asc(c.createdAt), asc(c.id)];
  return db
    .select({
      id: c.id,
      userId: c.userId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      level: schema.conquerMembers.level,
      exerciseName: schema.conquerExercises.name,
      exerciseId: c.exerciseId,
      step: c.step,
      comboKey: c.comboKey,
      rungName: schema.conquerRungs.name,
      comment: c.comment,
      videoKey: c.videoKey,
      videoSeconds: c.videoSeconds,
      videoDeletedAt: c.videoDeletedAt,
      status: c.status,
      replyText: c.replyText,
      replyVideoKey: c.replyVideoKey,
      replyVideoSeconds: c.replyVideoSeconds,
      repliedAt: c.repliedAt,
      repliedByFirstName: replier.firstName,
      replySeenAt: c.replySeenAt,
      createdAt: c.createdAt,
    })
    .from(c)
    .innerJoin(
      schema.users,
      and(eq(schema.users.id, c.userId), tenantWhere(schema.users, ctx)),
    )
    .leftJoin(
      schema.conquerMembers,
      and(
        eq(schema.conquerMembers.userId, c.userId),
        tenantWhere(schema.conquerMembers, ctx),
      ),
    )
    .leftJoin(
      schema.conquerExercises,
      and(
        eq(schema.conquerExercises.id, c.exerciseId),
        tenantWhere(schema.conquerExercises, ctx),
      ),
    )
    .leftJoin(
      schema.conquerRungs,
      and(
        eq(schema.conquerRungs.id, c.rungId),
        tenantWhere(schema.conquerRungs, ctx),
      ),
    )
    .leftJoin(
      replier,
      and(eq(replier.id, c.repliedBy), tenantWhere(replier, ctx)),
    )
    .where(
      and(
        tenantWhere(c, ctx),
        where.userId === undefined ? undefined : eq(c.userId, where.userId),
        where.id === undefined ? undefined : eq(c.id, where.id),
        where.status === undefined ? undefined : eq(c.status, where.status),
      ),
    )
    .orderBy(...order)
    .limit(where.limit);
}

/** Fase 202 DA-41: se arma al LEER (join), no se guarda. */
function targetLabelOf(row: CorrectionRow): string {
  if (row.comboKey !== null) {
    return isComboKey(row.comboKey)
      ? `Combo ${COMBOS[row.comboKey].label}`
      : `Combo ${row.comboKey}`;
  }
  const base = `${row.exerciseName ?? "Ejercicio"} · ${
    row.step === null ? "" : STEP_LABELS[row.step]
  }`;
  return row.rungName === null ? base : `${base} · ${row.rungName}`;
}

/** Vista del alumno de una fila (la del coach la arma 202-05 sobre la misma fila). */
export function toCorrectionView(row: CorrectionRow): CorrectionView {
  const answered = row.status === "respondida";
  return {
    id: row.id,
    kind: row.comboKey === null ? "escalon" : "combo",
    targetLabel: targetLabelOf(row),
    comment: row.comment,
    durationSec: row.videoSeconds,
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    videoDeleted: row.videoDeletedAt !== null,
    reply: answered
      ? {
          text: row.replyText,
          hasVideo: row.replyVideoKey !== null,
          videoSeconds: row.replyVideoSeconds,
          repliedAt: (row.repliedAt ?? row.createdAt).toISOString(),
        }
      : null,
    replyUnseen: answered && row.replySeenAt === null,
  };
}

async function countPending(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.conquerCorrections)
    .where(
      and(
        tenantWhere(schema.conquerCorrections, ctx),
        eq(schema.conquerCorrections.userId, userId),
        eq(schema.conquerCorrections.status, "pendiente"),
      ),
    );
  return Number(row?.n ?? 0);
}

function topeError(): AppError {
  return new AppError(
    `Ya tenés ${CORRECTION_PENDING_MAX} videos esperando respuesta`,
    409,
    "CONQUER_CORRECCIONES_TOPE",
  );
}

/** 409 `CONQUER_NO_ACTIVO` si el socio no tiene Conquer activo (sin cargar el catálogo). */
async function assertActive(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<void> {
  const [member] = await db
    .select({ status: schema.conquerMembers.status })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.userId, userId),
      ),
    )
    .limit(1);
  if (member?.status !== "activo") {
    throw new AppError(
      "Todavía no tenés Conquer activo",
      409,
      "CONQUER_NO_ACTIVO",
    );
  }
}

/**
 * `GET /corrections`: las 50 más nuevas del alumno, lo que puede mandar y los
 * topes. No toca el storage: anda sin bucket (D-27).
 */
export async function getMemberCorrections(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<CorrectionsResponse> {
  const member = await loadMemberContext(db, ctx, userId);
  const [rows, pending] = await Promise.all([
    loadCorrectionRows(db, ctx, {
      userId,
      limit: MEMBER_CORRECTIONS_LIMIT,
      order: "desc",
    }),
    countPending(db, ctx, userId),
  ]);
  return {
    items: rows.map(toCorrectionView),
    targets: listCorrectionTargets(member),
    limits: {
      pending,
      pendingMax: CORRECTION_PENDING_MAX,
      maxSeconds: CORRECTION_VIDEO_MAX_SECONDS,
      maxBytes: CORRECTION_VIDEO_MAX_BYTES,
      commentMax: CORRECTION_COMMENT_MAX,
    },
  };
}

// ── URL de subida ───────────────────────────────────────────────────

/**
 * `POST /corrections/upload-url`. Orden (DA-42): no activo (409) -> tope (409)
 * -> storage (503) -> tipo (400).
 */
export async function requestCorrectionUpload(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userId: number,
  contentType: string,
): Promise<CorrectionUploadResult> {
  await assertActive(fastify.db, ctx, userId);
  if ((await countPending(fastify.db, ctx, userId)) >= CORRECTION_PENDING_MAX) {
    throw topeError();
  }
  const store = privateMediaResolver.resolve(fastify, "videos");
  if (!isVideoContentType(contentType)) {
    throw new AppError(
      "Solo se aceptan videos MP4 o MOV",
      400,
      "CONQUER_VIDEO_TIPO_INVALIDO",
    );
  }
  const key = privateCorrectionVideoKey({
    tenantId: ctx.tenantId,
    userId,
    contentType,
  });
  const uploadUrl = await callVideoStore(fastify, { userId }, () =>
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

// ── Alta ────────────────────────────────────────────────────────────

/** Valida comentario (DA-43) y duración (DA-40); el comentario vacío queda en `null`. */
function validateCommentAndDuration(body: CreateCorrectionBody): {
  comment: string | null;
  durationSec: number;
} {
  const comment = normalizeText(body.comment, CORRECTION_COMMENT_MAX);
  if (!comment.ok) {
    throw new AppError(
      `El comentario puede tener hasta ${CORRECTION_COMMENT_MAX} caracteres`,
      400,
      "CONQUER_CORRECCION_COMENTARIO_LARGO",
    );
  }
  if (!isValidVideoSeconds(body.durationSec)) {
    throw new AppError(
      `El video tiene que durar ${CORRECTION_VIDEO_MAX_SECONDS} segundos o menos`,
      400,
      "CONQUER_VIDEO_DURACION",
    );
  }
  return { comment: comment.value, durationSec: body.durationSec };
}

/** La clave tiene que ser del alumno y no estar usada por otra corrección (T-201-125). */
async function assertKeyAvailable(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  key: string,
): Promise<void> {
  if (!isOwnCorrectionVideoKey(key, ctx.tenantId, userId)) {
    throw new AppError(
      "El video no es válido",
      400,
      "CONQUER_VIDEO_CLAVE_INVALIDA",
    );
  }
  const [used] = await db
    .select({ id: schema.conquerCorrections.id })
    .from(schema.conquerCorrections)
    .where(
      and(
        tenantWhere(schema.conquerCorrections, ctx),
        eq(schema.conquerCorrections.videoKey, key),
      ),
    )
    .limit(1);
  if (used) throw videoYaUsadoError();
}

function videoYaUsadoError(): AppError {
  return new AppError(
    "Ese video ya se usó en otra corrección",
    409,
    "CONQUER_VIDEO_YA_USADO",
  );
}

/**
 * HEAD del objeto subido (DA-39): no existe -> 409. Vacío, pesado o de otro tipo
 * -> se borra el objeto y 400.
 */
async function confirmUploadedVideo(
  fastify: FastifyInstance,
  store: PrivateMediaStore,
  userId: number,
  key: string,
): Promise<void> {
  const head = await callVideoStore(fastify, { userId }, () => store.head(key));
  if (head === null) {
    throw new AppError(
      "Todavía no se subió el video",
      409,
      "CONQUER_VIDEO_NO_SUBIDO",
    );
  }
  if (
    checkUploadedVideo(
      head,
      CORRECTION_VIDEO_MAX_BYTES,
      VIDEO_CONTENT_TYPES,
    ) !== "ok"
  ) {
    await removeQuietly(fastify, store, userId, key);
    throw new AppError(
      "El video pesa más de 100 MB o no es MP4 o MOV",
      400,
      "CONQUER_VIDEO_INVALIDO",
    );
  }
}

interface NewCorrection {
  target: CorrectionTarget;
  rungId: number | null;
  comment: string | null;
  durationSec: number;
  key: string;
}

/**
 * Tx del alta (DA-42): `FOR UPDATE` del alumno primero, después el conteo de
 * pendientes (dos altas a la vez se serializan acá) y el INSERT.
 */
async function insertCorrection(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  input: NewCorrection,
): Promise<number> {
  let id = null as number | null;
  await db.transaction(async (tx) => {
    await lockActiveMember(tx, ctx, userId);
    const [pending] = await tx
      .select({ n: count() })
      .from(schema.conquerCorrections)
      .where(
        and(
          tenantWhere(schema.conquerCorrections, ctx),
          eq(schema.conquerCorrections.userId, userId),
          eq(schema.conquerCorrections.status, "pendiente"),
        ),
      );
    if (Number(pending?.n ?? 0) >= CORRECTION_PENDING_MAX) throw topeError();
    const [created] = await tx
      .insert(schema.conquerCorrections)
      .values(
        tenantValues(ctx, {
          userId,
          exerciseId: input.target.exerciseId,
          step: input.target.step,
          comboKey: input.target.comboKey,
          rungId: input.rungId,
          comment: input.comment,
          videoKey: input.key,
          videoSeconds: input.durationSec,
          status: "pendiente" as const,
        }),
      )
      .$returningId();
    id = created.id;
  });
  if (id === null) throw new AppError("No se pudo guardar el video", 500);
  return id;
}

/**
 * Inserta y, si pierde por el tope, borra el objeto que ya no se va a usar. Una
 * clave repetida (dos altas con la misma clave) es 409 y NO borra: el objeto
 * pertenece a la otra corrección.
 */
async function insertOrCleanUp(
  fastify: FastifyInstance,
  store: PrivateMediaStore,
  ctx: TenantContext,
  userId: number,
  input: NewCorrection,
): Promise<number> {
  try {
    return await insertCorrection(fastify.db, ctx, userId, input);
  } catch (err: unknown) {
    if (isDuplicateKeyError(err).isDuplicate) throw videoYaUsadoError();
    if (err instanceof AppError && err.code === "CONQUER_CORRECCIONES_TOPE") {
      await removeQuietly(fastify, store, userId, input.key);
    }
    throw err;
  }
}

/**
 * `POST /corrections`. Orden: no activo (409) -> objetivo (400) -> comentario
 * (400) -> duración (400) -> storage (503) -> clave (400/409) -> HEAD (409/400)
 * -> tope dentro de la tx (409) -> INSERT -> 201 con la vista.
 */
export async function createCorrection(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userId: number,
  body: CreateCorrectionBody,
): Promise<CorrectionView> {
  const member = await loadMemberContext(fastify.db, ctx, userId, fastify.log);
  const target = validateTarget(member, body);
  const { comment, durationSec } = validateCommentAndDuration(body);
  const store = privateMediaResolver.resolve(fastify, "videos");
  await assertKeyAvailable(fastify.db, ctx, userId, body.key);
  await confirmUploadedVideo(fastify, store, userId, body.key);

  // Combos van sin peldaño (DA-41); el escalón guarda el del momento.
  const rungId =
    target.exerciseId !== null && target.step !== null
      ? (member.steps.get(markKey(target.exerciseId, target.step))?.rungId ??
        null)
      : null;
  const id = await insertOrCleanUp(fastify, store, ctx, userId, {
    target,
    rungId,
    comment,
    durationSec,
    key: body.key,
  });
  const [row] = await loadCorrectionRows(fastify.db, ctx, {
    id,
    userId,
    limit: 1,
    order: "desc",
  });
  if (!row) throw new AppError("No se pudo guardar el video", 500);
  return toCorrectionView(row);
}
