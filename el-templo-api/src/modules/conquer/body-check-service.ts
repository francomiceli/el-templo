// Módulo: conquer — control físico del alumno (Fase 201 §6, §13.7, D-15)
//
// Control del día 0 y periódico: 3 fotos privadas (R2, URL firmada) y 4
// perímetros más el peso, todo opcional. Copiado y adaptado de la 196 (D-04).
//
// Orden de errores SIEMPRE: existencia/propiedad (404) -> storage (503) ->
// estado (409/400). Un control de otro alumno o de otro gimnasio es 404, jamás
// 200 ni 503 (IDOR, T-201-40).
//
// Regla de contenido (decisión del orquestador, `body-check-content.ts`): un
// control cuenta SOLO si tiene al menos una foto confirmada o una medida. Un
// control vacío no es día 0, no resetea el vencido y se puede saltear.
//
// T-201-43: las claves de storage, las URLs firmadas, los perímetros y el peso
// NUNCA van a logs, a mensajes de error ni a las vistas. Los logs llevan
// `{ checkId, pose }` (más el NOMBRE del error de storage, sin mensaje).
import { and, asc, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyInstance } from "fastify";
import * as schema from "../../db/schema";
import { todayInTz } from "../shared/date-utils";
import { AppError } from "../shared/errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { isDuplicateKeyError } from "../referrals/duplicate-key";
import {
  checkDue,
  compareChecks,
  defaultComparePair,
  type CheckComparison,
  type CheckDueResult,
  type ComparableCheck,
} from "./body-check-rules";
import { checkHasContent } from "./body-check-content";
import {
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES,
  POSE_COLUMN,
  PRIVATE_GET_EXPIRES_SEC,
  PRIVATE_PUT_EXPIRES_SEC,
  PhotoStorageUnavailableError,
  isOwnPhotoKey,
  privateCheckPhotoKey,
  privateMediaResolver,
  type ConquerPose,
  type PhotoContentType,
} from "./private-media";
import { canViewConquerPhotos } from "./permissions";
import { resolveMemberTimezone } from "./timezone";

type DbInstance = MySql2Database<typeof schema>;
type CheckRow = typeof schema.conquerBodyChecks.$inferSelect;

// ── Vistas ──────────────────────────────────────────────────────────

/** Vista de un control. NUNCA incluye claves de storage ni URLs. */
export interface BodyCheckView {
  id: number;
  checkDate: string;
  kind: "dia0" | "periodico";
  photos: { frente: boolean; perfil: boolean; espalda: boolean };
  armCm: number | null;
  chestCm: number | null;
  shouldersCm: number | null;
  waistCm: number | null;
  weightKg: number | null;
}

/** `ConquerStateResponse.member.bodyCheck` (D-15). */
export interface BodyCheckSummary {
  hasDay0: boolean;
  day0Skipped: boolean;
  mustPromptDay0: boolean;
  day0Pending: boolean;
  lastCheckDate: string | null;
  nextDueDate: string | null;
  due: boolean;
  overdue: boolean;
}

export interface BodyChecksList {
  /** Más nuevo primero. */
  checks: BodyCheckView[];
  compare: CheckComparison | null;
  due: CheckDueResult;
}

export interface UpsertCheckBody {
  armCm?: number;
  chestCm?: number;
  shouldersCm?: number;
  waistCm?: number;
  weightKg?: number;
}

export interface PhotoUploadResult {
  uploadUrl: string;
  key: string;
  contentType: PhotoContentType;
  expiresIn: number;
}

function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/** Redondea a 1 decimal (las columnas son decimal(5,1)). */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function toView(row: CheckRow): BodyCheckView {
  return {
    id: row.id,
    checkDate: row.checkDate,
    kind: row.kind,
    photos: {
      frente: row.photoFrontKey !== null,
      perfil: row.photoSideKey !== null,
      espalda: row.photoBackKey !== null,
    },
    armCm: toNumber(row.armCm),
    chestCm: toNumber(row.chestCm),
    shouldersCm: toNumber(row.shouldersCm),
    waistCm: toNumber(row.waistCm),
    weightKg: toNumber(row.weightKg),
  };
}

export function toComparable(view: BodyCheckView): ComparableCheck {
  return {
    id: view.id,
    checkDate: view.checkDate,
    armCm: view.armCm,
    chestCm: view.chestCm,
    shouldersCm: view.shouldersCm,
    waistCm: view.waistCm,
    weightKg: view.weightKg,
  };
}

// ── Lecturas ────────────────────────────────────────────────────────

/** Todos los controles del alumno (una query), de más viejo a más nuevo. */
async function loadCheckRows(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<CheckRow[]> {
  return db
    .select()
    .from(schema.conquerBodyChecks)
    .where(
      and(
        tenantWhere(schema.conquerBodyChecks, ctx),
        eq(schema.conquerBodyChecks.userId, userId),
      ),
    )
    .orderBy(
      asc(schema.conquerBodyChecks.checkDate),
      asc(schema.conquerBodyChecks.id),
    );
}

/** El control de ESTE alumno, o 404 (ajeno, de otro gimnasio e inexistente son lo mismo). */
async function findOwnCheck(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  checkId: number,
): Promise<CheckRow> {
  const [row] = await db
    .select()
    .from(schema.conquerBodyChecks)
    .where(
      and(
        tenantWhere(schema.conquerBodyChecks, ctx),
        eq(schema.conquerBodyChecks.id, checkId),
        eq(schema.conquerBodyChecks.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new AppError("Control no encontrado", 404);
  return row;
}

/** Fila de `conquer_members` del alumno si está ACTIVO; si no, 409 `CONQUER_NO_ACTIVO`. */
export async function requireOwnActiveMember(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<{ day0SkippedAt: Date | null }> {
  const [row] = await db
    .select({
      status: schema.conquerMembers.status,
      day0SkippedAt: schema.conquerMembers.day0SkippedAt,
    })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!row || row.status !== "activo") {
    throw new AppError(
      "Todavía no tenés Conquer activo",
      409,
      "CONQUER_NO_ACTIVO",
    );
  }
  return { day0SkippedAt: row.day0SkippedAt };
}

/** Resumen sobre controles CON contenido (el día 0 y el vencimiento). */
function summarize(
  contentRows: readonly CheckRow[],
  day0SkippedAt: Date | null,
  today: string,
): BodyCheckSummary {
  const hasDay0 = contentRows.some((r) => r.kind === "dia0");
  const day0Skipped = day0SkippedAt !== null;
  const lastCheckDate = contentRows.reduce<string | null>(
    (last, r) => (last === null || r.checkDate > last ? r.checkDate : last),
    null,
  );
  const { nextDueDate, due, overdue } = checkDue({ lastCheckDate, today });
  return {
    hasDay0,
    day0Skipped,
    // D-15: se pide el día 0 hasta que lo haga o diga "Lo hago después".
    mustPromptDay0: !hasDay0 && !day0Skipped,
    day0Pending: !hasDay0 && day0Skipped,
    lastCheckDate,
    nextDueDate,
    due,
    overdue,
  };
}

/**
 * Banderas del control para `GET /state` (UNA query). `today` y `day0SkippedAt`
 * los trae quien llama (ya tiene el contexto del alumno y su fila).
 */
export async function bodyCheckSummary(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  today: string,
  day0SkippedAt: Date | null,
): Promise<BodyCheckSummary> {
  const rows = await loadCheckRows(db, ctx, userId);
  return summarize(rows.filter(checkHasContent), day0SkippedAt, today);
}

/**
 * Controles del alumno (más nuevo primero), comparador día 0 vs el último y
 * vencimiento. La lista trae los controles con contenido y, además, el de hoy
 * aunque esté vacío (para poder continuarlo).
 */
export async function listChecks(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<BodyChecksList> {
  const today = todayInTz(await resolveMemberTimezone(db, ctx, userId));
  const rows = await loadCheckRows(db, ctx, userId);
  const content = rows.filter(checkHasContent);
  const visible = rows.filter(
    (r) => checkHasContent(r) || r.checkDate === today,
  );

  const pair = defaultComparePair(content.map(toView));
  const compare = pair
    ? compareChecks(toComparable(pair[0]), toComparable(pair[1]))
    : null;
  const lastCheckDate = summarize(content, null, today).lastCheckDate;
  return {
    checks: [...visible].reverse().map(toView),
    compare,
    due: checkDue({ lastCheckDate, today }),
  };
}

// ── Alta / edición del control de hoy ───────────────────────────────

/** Columnas de medidas a escribir (solo lo que vino en el body, 1 decimal). */
function measuresSet(body: UpsertCheckBody) {
  const set: Partial<
    Pick<
      typeof schema.conquerBodyChecks.$inferInsert,
      "armCm" | "chestCm" | "shouldersCm" | "waistCm" | "weightKg"
    >
  > = {};
  if (body.armCm !== undefined) set.armCm = String(round1(body.armCm));
  if (body.chestCm !== undefined) set.chestCm = String(round1(body.chestCm));
  if (body.shouldersCm !== undefined) {
    set.shouldersCm = String(round1(body.shouldersCm));
  }
  if (body.waistCm !== undefined) set.waistCm = String(round1(body.waistCm));
  if (body.weightKg !== undefined) {
    set.weightKg = String(round1(body.weightKg));
  }
  return set;
}

async function updateCheckMeasures(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  checkId: number,
  body: UpsertCheckBody,
): Promise<void> {
  const set = measuresSet(body);
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.conquerBodyChecks)
    .set(set)
    .where(
      and(
        tenantWhere(schema.conquerBodyChecks, ctx),
        eq(schema.conquerBodyChecks.id, checkId),
        eq(schema.conquerBodyChecks.userId, userId),
      ),
    );
}

/**
 * Crea (o continúa) el control de HOY en la zona de la sede. Idempotente por
 * (alumno, día). `kind`: `dia0` si no hay ningún control CON contenido en otra
 * fecha, si no `periodico`; el del mismo día conserva su `kind`. Body vacío
 * permitido: crea la fila para poder subir fotos.
 */
export async function upsertTodayCheck(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  body: UpsertCheckBody,
): Promise<BodyCheckView> {
  await requireOwnActiveMember(db, ctx, userId);
  const today = todayInTz(await resolveMemberTimezone(db, ctx, userId));
  const rows = await loadCheckRows(db, ctx, userId);

  let checkId: number | null =
    rows.find((r) => r.checkDate === today)?.id ?? null;
  if (checkId === null) {
    const hasOtherContent = rows.some(
      (r) => r.checkDate !== today && checkHasContent(r),
    );
    try {
      const [created] = await db
        .insert(schema.conquerBodyChecks)
        .values(
          tenantValues(ctx, {
            userId,
            checkDate: today,
            kind: hasOtherContent ? ("periodico" as const) : ("dia0" as const),
          }),
        )
        .$returningId();
      checkId = created.id;
    } catch (err: unknown) {
      // Dos pedidos a la vez: el segundo pierde la carrera y continúa el del primero.
      if (!isDuplicateKeyError(err)) throw err;
      const winner = (await loadCheckRows(db, ctx, userId)).find(
        (r) => r.checkDate === today,
      );
      if (!winner) throw err;
      checkId = winner.id;
    }
  }

  await updateCheckMeasures(db, ctx, userId, checkId, body);
  return toView(await findOwnCheck(db, ctx, userId, checkId));
}

// ── Fotos ───────────────────────────────────────────────────────────

/**
 * Llama al storage sin dejar escapar su error: el del SDK puede nombrar el
 * bucket o la clave. Se loguea `{ checkId, pose }` y el NOMBRE del error; se
 * responde 503 genérico.
 */
async function callStore<T>(
  fastify: FastifyInstance,
  info: { checkId: number; pose: ConquerPose },
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (err: unknown) {
    fastify.log.warn(
      { ...info, errName: err instanceof Error ? err.name : "unknown" },
      "conquer photo storage call failed",
    );
    throw new PhotoStorageUnavailableError();
  }
}

function isPhotoContentType(value: string): value is PhotoContentType {
  return PHOTO_CONTENT_TYPES.some((t) => t === value);
}

/**
 * URL firmada para SUBIR la foto de una pose (el teléfono sube directo al
 * bucket privado). Orden: control propio (404) -> storage (503) -> tipo (400).
 */
export async function requestPhotoUpload(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userId: number,
  checkId: number,
  pose: ConquerPose,
  contentType: string,
): Promise<PhotoUploadResult> {
  const check = await findOwnCheck(fastify.db, ctx, userId, checkId);
  const store = privateMediaResolver.resolve(fastify);
  if (!isPhotoContentType(contentType)) {
    throw new AppError(
      "Solo se aceptan fotos JPG, PNG o WebP",
      400,
      "CONQUER_FOTO_TIPO_INVALIDO",
    );
  }
  const key = privateCheckPhotoKey({
    tenantId: ctx.tenantId,
    userId,
    checkId: check.id,
    pose,
    contentType,
  });
  const uploadUrl = await callStore(fastify, { checkId: check.id, pose }, () =>
    store.presignPut(key, contentType, PRIVATE_PUT_EXPIRES_SEC),
  );
  return { uploadUrl, key, contentType, expiresIn: PRIVATE_PUT_EXPIRES_SEC };
}

/**
 * El alumno confirma que subió la foto: la clave tiene que ser SUYA (tenant,
 * alumno, control y pose) y el objeto tiene que existir con tamaño y tipo
 * válidos (HEAD). Orden: 404 -> 503 -> clave (400) -> HEAD (409/400).
 */
export async function confirmPhoto(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userId: number,
  checkId: number,
  pose: ConquerPose,
  key: string,
): Promise<BodyCheckView> {
  const check = await findOwnCheck(fastify.db, ctx, userId, checkId);
  const store = privateMediaResolver.resolve(fastify);
  if (!isOwnPhotoKey(key, ctx.tenantId, userId, check.id, pose)) {
    throw new AppError(
      "La foto no es válida",
      400,
      "CONQUER_FOTO_CLAVE_INVALIDA",
    );
  }
  const head = await callStore(fastify, { checkId: check.id, pose }, () =>
    store.head(key),
  );
  if (head === null) {
    throw new AppError(
      "Todavía no se subió esa foto",
      409,
      "CONQUER_FOTO_NO_SUBIDA",
    );
  }
  if (
    head.contentLength <= 0 ||
    head.contentLength > PHOTO_MAX_BYTES ||
    !isPhotoContentType(head.contentType)
  ) {
    throw new AppError(
      "La foto es muy pesada o no es JPG, PNG o WebP",
      400,
      "CONQUER_FOTO_INVALIDA",
    );
  }
  await saveStoredKey(fastify.db, ctx, userId, check.id, pose, key);
  return toView(await findOwnCheck(fastify.db, ctx, userId, check.id));
}

async function saveStoredKey(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  checkId: number,
  pose: ConquerPose,
  key: string,
): Promise<void> {
  await db
    .update(schema.conquerBodyChecks)
    .set({ [POSE_COLUMN[pose]]: key })
    .where(
      and(
        tenantWhere(schema.conquerBodyChecks, ctx),
        eq(schema.conquerBodyChecks.id, checkId),
        eq(schema.conquerBodyChecks.userId, userId),
      ),
    );
}

/** La clave guardada de una pose, o null. */
function storedKey(row: CheckRow, pose: ConquerPose): string | null {
  return row[POSE_COLUMN[pose]];
}

/**
 * URL firmada de 5 minutos (sin caché) para VER una foto propia.
 * Orden: control (404) -> storage (503) -> foto (404).
 */
export async function getPhotoUrl(
  fastify: FastifyInstance,
  ctx: TenantContext,
  userId: number,
  checkId: number,
  pose: ConquerPose,
): Promise<{ url: string; expiresIn: number }> {
  const check = await findOwnCheck(fastify.db, ctx, userId, checkId);
  const store = privateMediaResolver.resolve(fastify);
  const key = storedKey(check, pose);
  if (key === null) throw new AppError("Foto no encontrada", 404);
  const url = await callStore(fastify, { checkId: check.id, pose }, () =>
    store.presignGet(key, PRIVATE_GET_EXPIRES_SEC),
  );
  return { url, expiresIn: PRIVATE_GET_EXPIRES_SEC };
}

// ── "Lo hago después" ───────────────────────────────────────────────

/**
 * D-15: deja el día 0 pendiente (`day0_skipped_at = NOW()`). Un día 0 vacío se
 * puede saltear; si ya hay uno CON contenido, 409 `CONQUER_DIA0_HECHO`.
 * Devuelve las banderas actualizadas.
 */
export async function skipDay0(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<BodyCheckSummary> {
  const member = await requireOwnActiveMember(db, ctx, userId);
  const today = todayInTz(await resolveMemberTimezone(db, ctx, userId));
  const content = (await loadCheckRows(db, ctx, userId)).filter(
    checkHasContent,
  );
  if (content.some((r) => r.kind === "dia0")) {
    throw new AppError(
      "Ya hiciste el control del día 0",
      409,
      "CONQUER_DIA0_HECHO",
    );
  }
  if (member.day0SkippedAt === null) {
    await db
      .update(schema.conquerMembers)
      .set({ day0SkippedAt: sql`NOW()` })
      .where(
        and(
          tenantWhere(schema.conquerMembers, ctx),
          eq(schema.conquerMembers.userId, userId),
        ),
      );
  }
  const [row] = await db
    .select({ day0SkippedAt: schema.conquerMembers.day0SkippedAt })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.userId, userId),
      ),
    )
    .limit(1);
  return summarize(content, row?.day0SkippedAt ?? null, today);
}

// ── Variantes del admin (§7.2 Evolución, D-08, A19) ─────────────────

/** Quien pide: viene SIEMPRE del token, nunca del body. */
export interface PhotoActor {
  role: string;
  userId: number;
}

/**
 * Fase 201 D-08/A19: ver controles y fotos de un alumno es control de acceso
 * por rol (alumno dueño, owner y admin), NO el flag de publicación. Hoy
 * coincide con `canManageConquer`; se separan cuando se abra a coach.
 */
export function assertCanViewPhotos(actor: PhotoActor): void {
  if (!canViewConquerPhotos(actor)) {
    throw new AppError("No tenés permiso para ver los controles", 403);
  }
}

/**
 * Controles de un alumno para el admin: mismo shape que `listChecks`.
 * Orden: rol (403) -> alumno del gimnasio (404). Sin fila en `conquer_members`
 * del gimnasio (incluye alumnos de otro gimnasio) es 404.
 */
export async function listChecksForAdmin(
  db: DbInstance,
  ctx: TenantContext,
  actor: PhotoActor,
  userId: number,
): Promise<BodyChecksList> {
  assertCanViewPhotos(actor);
  const [member] = await db
    .select({ id: schema.conquerMembers.id })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!member) throw new AppError("Alumno no encontrado", 404);
  return listChecks(db, ctx, userId);
}

/**
 * URL firmada de 5 minutos para que el admin VEA una foto de un alumno.
 * Orden: rol (403) -> control DE ESE alumno y del gimnasio (404, cross-ID,
 * T-201-46) -> storage (503) -> foto (404). Reusa `getPhotoUrl`, que busca el
 * control por (checkId, userId, tenant).
 */
export async function getPhotoUrlForAdmin(
  fastify: FastifyInstance,
  ctx: TenantContext,
  actor: PhotoActor,
  userId: number,
  checkId: number,
  pose: ConquerPose,
): Promise<{ url: string; expiresIn: number }> {
  assertCanViewPhotos(actor);
  return getPhotoUrl(fastify, ctx, userId, checkId, pose);
}
