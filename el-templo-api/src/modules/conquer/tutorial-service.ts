// Módulo: conquer — tutoriales en video por ejercicio y por combo (Fase 202 D-25)
//
// El coach (owner/admin) sube UN video por ejercicio del catálogo y UNO por combo
// al bucket PÚBLICO con la subida directa de Ejercicios (URL firmada + confirmación
// con HEAD, DA-39). Reemplazar deja un solo objeto (el anterior se borra,
// DA-48). El alumno lee todos con UNA ruta (DA-49), sin datos personales.
//
// Las claves de storage no se loguean: se registra `{ target, ref }` y el
// NOMBRE del error del SDK (T-201-141).
import { and, asc, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyInstance } from "fastify";
import * as schema from "../../db/schema";
import { AppError } from "../shared/errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { assembleVideoUrl } from "../shared/video-url";
import { COMBO_KEYS, COMBOS, isComboKey, type ComboKey } from "./combos";
import {
  isTutorialKey,
  TUTORIAL_PUT_EXPIRES_SEC,
  tutorialKey,
  tutorialMediaResolver,
  TutorialStorageUnavailableError,
  type TutorialMediaStore,
  type TutorialTarget,
} from "./tutorial-media";
import {
  checkUploadedVideo,
  TUTORIAL_CONTENT_TYPE,
  TUTORIAL_VIDEO_MAX_BYTES,
} from "./video-rules";

type DbInstance = MySql2Database<typeof schema>;

// ── Contratos ───────────────────────────────────────────────────────

/** Objetivo crudo tal como llega del body: lo valida `parseTutorialTarget`. */
export interface TutorialTargetInput {
  target: string;
  exerciseId?: number | null;
  comboKey?: string | null;
}

export interface UploadTutorialBody extends TutorialTargetInput {
  contentType: string;
}

export interface ConfirmTutorialBody extends TutorialTargetInput {
  key: string;
}

/** Objetivo ya validado. */
type ParsedTarget =
  | { target: "ejercicio"; exerciseId: number }
  | { target: "combo"; comboKey: ComboKey };

export interface MemberTutorialsView {
  exercises: { exerciseId: number; url: string }[];
  combos: { comboKey: string; url: string }[];
}

export interface AdminTutorialsView {
  storageReady: boolean;
  exercises: { exerciseId: number; url: string | null }[];
  combos: { comboKey: string; label: string; url: string | null }[];
}

export interface TutorialUploadUrl {
  uploadUrl: string;
  key: string;
  contentType: string;
  expiresIn: number;
  maxBytes: number;
}

// ── Objetivo ────────────────────────────────────────────────────────

/** Qué se loguea de una llamada al storage: el objetivo, nunca la clave. */
interface TutorialStoreInfo {
  target: TutorialTarget;
  ref: number | string;
}

function badTarget(): AppError {
  return new AppError(
    "Elegí un ejercicio o un combo para el tutorial",
    400,
    "CONQUER_TUTORIAL_OBJETIVO_INVALIDO",
  );
}

/** `ejercicio` pide `exerciseId` entero; `combo` pide un `comboKey` de `COMBO_KEYS`. */
function parseTutorialTarget(input: TutorialTargetInput): ParsedTarget {
  if (input.target === "ejercicio") {
    const id = input.exerciseId;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
      throw badTarget();
    }
    return { target: "ejercicio", exerciseId: id };
  }
  if (input.target === "combo") {
    if (!isComboKey(input.comboKey)) throw badTarget();
    return { target: "combo", comboKey: input.comboKey };
  }
  throw badTarget();
}

function targetInfo(parsed: ParsedTarget): TutorialStoreInfo {
  return parsed.target === "ejercicio"
    ? { target: "ejercicio", ref: parsed.exerciseId }
    : { target: "combo", ref: parsed.comboKey };
}

/** El ejercicio tiene que ser del catálogo de ESTE gimnasio (otro → 404). */
async function requireCatalogExercise(
  db: DbInstance,
  ctx: TenantContext,
  exerciseId: number,
): Promise<void> {
  const [row] = await db
    .select({ id: schema.conquerExercises.id })
    .from(schema.conquerExercises)
    .where(
      and(
        tenantWhere(schema.conquerExercises, ctx),
        eq(schema.conquerExercises.id, exerciseId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new AppError(
      "Ejercicio no encontrado",
      404,
      "CONQUER_EJERCICIO_NO_ENCONTRADO",
    );
  }
}

async function validateTarget(
  db: DbInstance,
  ctx: TenantContext,
  input: TutorialTargetInput,
): Promise<ParsedTarget> {
  const parsed = parseTutorialTarget(input);
  if (parsed.target === "ejercicio") {
    await requireCatalogExercise(db, ctx, parsed.exerciseId);
  }
  return parsed;
}

// ── Storage ─────────────────────────────────────────────────────────

/**
 * Llama al storage sin dejar escapar su error: el del SDK puede nombrar el
 * bucket o la clave. Se loguea `{ target, ref, errName }` y se responde el 503
 * genérico de tutoriales.
 */
async function callTutorialStore<T>(
  fastify: FastifyInstance,
  info: TutorialStoreInfo,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (err: unknown) {
    fastify.log.warn(
      { ...info, errName: err instanceof Error ? err.name : "unknown" },
      "conquer tutorial storage call failed",
    );
    throw new TutorialStorageUnavailableError();
  }
}

/**
 * Borra un objeto que ya no se usa. Best-effort: si falla queda huérfano en el
 * bucket (sin la clave en el log) y la respuesta no cambia.
 */
async function removeQuietly(
  fastify: FastifyInstance,
  store: TutorialMediaStore,
  info: TutorialStoreInfo,
  key: string,
): Promise<void> {
  try {
    await store.remove(key);
  } catch (err: unknown) {
    fastify.log.warn(
      { ...info, errName: err instanceof Error ? err.name : "unknown" },
      "conquer tutorial orphan video not removed",
    );
  }
}

// ── Lectura ─────────────────────────────────────────────────────────

interface TutorialRow {
  exerciseId: number | null;
  comboKey: string | null;
  videoKey: string;
}

async function loadTutorialRows(
  db: DbInstance,
  ctx: TenantContext,
): Promise<TutorialRow[]> {
  return db
    .select({
      exerciseId: schema.conquerTutorials.exerciseId,
      comboKey: schema.conquerTutorials.comboKey,
      videoKey: schema.conquerTutorials.videoKey,
    })
    .from(schema.conquerTutorials)
    .where(tenantWhere(schema.conquerTutorials, ctx))
    .orderBy(asc(schema.conquerTutorials.exerciseId));
}

/**
 * Fase 202 DA-49: los tutoriales del gimnasio para el alumno. Solo entran los
 * que tienen URL (sin video o sin `R2_PUBLIC_URL` no hay botón). El alumno no
 * necesita Conquer activo: es contenido del gimnasio, sin datos personales.
 */
export async function getMemberTutorials(
  db: DbInstance,
  ctx: TenantContext,
): Promise<MemberTutorialsView> {
  const rows = await loadTutorialRows(db, ctx);
  const exercises: MemberTutorialsView["exercises"] = [];
  const byCombo = new Map<string, string>();
  for (const row of rows) {
    const url = assembleVideoUrl(row.videoKey);
    if (url === null) continue;
    if (row.exerciseId !== null) {
      exercises.push({ exerciseId: row.exerciseId, url });
    } else if (row.comboKey !== null) {
      byCombo.set(row.comboKey, url);
    }
  }
  const combos: MemberTutorialsView["combos"] = [];
  for (const comboKey of COMBO_KEYS) {
    const url = byCombo.get(comboKey);
    if (url !== undefined) combos.push({ comboKey, url });
  }
  return { exercises, combos };
}

/**
 * Vista del coach: `storageReady` dice si se puede subir/mostrar, los
 * ejercicios con tutorial y SIEMPRE los 6 combos en el orden de `COMBO_KEYS`
 * (`url: null` = todavía sin video).
 */
export async function getAdminTutorials(
  fastify: FastifyInstance,
  ctx: TenantContext,
): Promise<AdminTutorialsView> {
  const rows = await loadTutorialRows(fastify.db, ctx);
  const exercises: AdminTutorialsView["exercises"] = [];
  const byCombo = new Map<string, string | null>();
  for (const row of rows) {
    const url = assembleVideoUrl(row.videoKey);
    if (row.exerciseId !== null) {
      exercises.push({ exerciseId: row.exerciseId, url });
    } else if (row.comboKey !== null) {
      byCombo.set(row.comboKey, url);
    }
  }
  return {
    storageReady: tutorialMediaResolver.ready(fastify),
    exercises,
    combos: COMBO_KEYS.map((comboKey) => ({
      comboKey,
      label: COMBOS[comboKey].label,
      url: byCombo.get(comboKey) ?? null,
    })),
  };
}

// ── Subida ──────────────────────────────────────────────────────────

/**
 * URL firmada de subida al bucket público (DA-39). Orden: objetivo (400) ->
 * ejercicio del gimnasio (404) -> storage (503) -> tipo (400). Solo MP4: el
 * admin convierte los .mov antes de subir.
 */
export async function requestTutorialUpload(
  fastify: FastifyInstance,
  ctx: TenantContext,
  body: UploadTutorialBody,
): Promise<TutorialUploadUrl> {
  const parsed = await validateTarget(fastify.db, ctx, body);
  const store = tutorialMediaResolver.resolve(fastify);
  if (body.contentType !== TUTORIAL_CONTENT_TYPE) {
    throw new AppError(
      "Subí el tutorial en MP4",
      400,
      "CONQUER_TUTORIAL_TIPO_INVALIDO",
    );
  }
  const key = tutorialKey({ tenantId: ctx.tenantId, ...parsed });
  const uploadUrl = await callTutorialStore(fastify, targetInfo(parsed), () =>
    store.presignPut(key, TUTORIAL_CONTENT_TYPE, TUTORIAL_PUT_EXPIRES_SEC),
  );
  return {
    uploadUrl,
    key,
    contentType: TUTORIAL_CONTENT_TYPE,
    expiresIn: TUTORIAL_PUT_EXPIRES_SEC,
    maxBytes: TUTORIAL_VIDEO_MAX_BYTES,
  };
}

/** La clave tiene que ser de ESTE gimnasio y de ESTE objetivo (T-201-141). */
function assertOwnKey(
  ctx: TenantContext,
  parsed: ParsedTarget,
  key: string,
): void {
  const ref =
    parsed.target === "ejercicio" ? parsed.exerciseId : parsed.comboKey;
  if (!isTutorialKey(key, ctx.tenantId, parsed.target, ref)) {
    throw new AppError(
      "El video no corresponde a este tutorial",
      400,
      "CONQUER_VIDEO_CLAVE_INVALIDA",
    );
  }
}

/**
 * HEAD del objeto subido (DA-39): no existe -> 409. Pesado o de otro tipo ->
 * se borra el objeto y 400 (T-201-143).
 */
async function confirmUploadedTutorial(
  fastify: FastifyInstance,
  store: TutorialMediaStore,
  info: TutorialStoreInfo,
  key: string,
): Promise<void> {
  const head = await callTutorialStore(fastify, info, () => store.head(key));
  if (head === null) {
    throw new AppError(
      "Todavía no se subió el video",
      409,
      "CONQUER_VIDEO_NO_SUBIDO",
    );
  }
  if (
    checkUploadedVideo(head, TUTORIAL_VIDEO_MAX_BYTES, [
      TUTORIAL_CONTENT_TYPE,
    ]) !== "ok"
  ) {
    await removeQuietly(fastify, store, info, key);
    throw new AppError(
      "El video pesa más de 200 MB o no es MP4",
      400,
      "CONQUER_VIDEO_INVALIDO",
    );
  }
}

/** Clave guardada hoy para el objetivo, o `null` si todavía no tiene tutorial. */
async function findTutorialKey(
  db: DbInstance,
  ctx: TenantContext,
  parsed: ParsedTarget,
): Promise<string | null> {
  const [row] = await db
    .select({ videoKey: schema.conquerTutorials.videoKey })
    .from(schema.conquerTutorials)
    .where(
      and(
        tenantWhere(schema.conquerTutorials, ctx),
        parsed.target === "ejercicio"
          ? eq(schema.conquerTutorials.exerciseId, parsed.exerciseId)
          : eq(schema.conquerTutorials.comboKey, parsed.comboKey),
      ),
    )
    .limit(1);
  return row?.videoKey ?? null;
}

/**
 * Guarda la clave nueva. UNIQUE (tenant, ejercicio) y (tenant, combo): reemplazar
 * es un upsert, nunca quedan dos filas (DA-48).
 */
async function upsertTutorial(
  db: DbInstance,
  ctx: TenantContext,
  actorUserId: number,
  parsed: ParsedTarget,
  key: string,
): Promise<void> {
  await db
    .insert(schema.conquerTutorials)
    .values(
      tenantValues(ctx, {
        exerciseId: parsed.target === "ejercicio" ? parsed.exerciseId : null,
        comboKey: parsed.target === "combo" ? parsed.comboKey : null,
        videoKey: key,
        uploadedBy: actorUserId,
      }),
    )
    .onDuplicateKeyUpdate({
      set: { videoKey: key, uploadedBy: actorUserId },
    });
}

/**
 * Confirma el video subido y lo deja como el tutorial del objetivo. Orden:
 * objetivo -> ejercicio (404) -> storage (503) -> clave (400) -> HEAD (409 /
 * 400) -> upsert -> borrado best-effort del objeto anterior. Devuelve la vista
 * del coach completa.
 */
export async function confirmTutorial(
  fastify: FastifyInstance,
  ctx: TenantContext,
  actorUserId: number,
  body: ConfirmTutorialBody,
): Promise<AdminTutorialsView> {
  const parsed = await validateTarget(fastify.db, ctx, body);
  const store = tutorialMediaResolver.resolve(fastify);
  assertOwnKey(ctx, parsed, body.key);
  const info = targetInfo(parsed);
  await confirmUploadedTutorial(fastify, store, info, body.key);

  const previousKey = await findTutorialKey(fastify.db, ctx, parsed);
  await upsertTutorial(fastify.db, ctx, actorUserId, parsed, body.key);
  if (previousKey !== null && previousKey !== body.key) {
    await removeQuietly(fastify, store, info, previousKey);
  }
  return getAdminTutorials(fastify, ctx);
}

// ── Borrado ─────────────────────────────────────────────────────────

/**
 * Borra el tutorial de un objetivo (DA-48). Sin fila: 200 con la vista, sin
 * tocar el storage (idempotente). Con fila: primero el objeto (si falla -> 503
 * y la fila queda, para poder reintentar) y después la fila.
 */
export async function deleteTutorial(
  fastify: FastifyInstance,
  ctx: TenantContext,
  target: string,
  ref: number | string,
): Promise<AdminTutorialsView> {
  const parsed = await validateTarget(fastify.db, ctx, {
    target,
    exerciseId: typeof ref === "number" ? ref : null,
    comboKey: typeof ref === "string" ? ref : null,
  });
  const key = await findTutorialKey(fastify.db, ctx, parsed);
  if (key === null) return getAdminTutorials(fastify, ctx);

  const store = tutorialMediaResolver.resolve(fastify);
  await callTutorialStore(fastify, targetInfo(parsed), () => store.remove(key));
  await fastify.db
    .delete(schema.conquerTutorials)
    .where(
      and(
        tenantWhere(schema.conquerTutorials, ctx),
        parsed.target === "ejercicio"
          ? eq(schema.conquerTutorials.exerciseId, parsed.exerciseId)
          : eq(schema.conquerTutorials.comboKey, parsed.comboKey),
      ),
    );
  return getAdminTutorials(fastify, ctx);
}
