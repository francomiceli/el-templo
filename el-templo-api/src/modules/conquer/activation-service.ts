// Módulo: conquer — alta y edición del alumno por owner/admin (Fase 201 §7.2)
//
// S12-1: el owner o admin activa a un alumno eligiendo nivel y días; la
// plantilla y las progresiones iniciales salen solas. Los escalones iniciales
// son la tabla EXPLÍCITA del anexo de Nacho para el nivel (§3), guardada como
// dato por ejercicio (Fase 201 DA-5, 0293). Ya no hay offset de peldaños.
// D-17: no se exige plan ni inscripción del Templo para activar.
// D-08: el alumno guarda su `coach_user_id` (por defecto quien lo activó) aunque
// hoy solo owner/admin manejan Conquer.
import type { FastifyBaseLogger } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type { ConquerMemberRow } from "../../db/schema/conquer";
import { todayInTz } from "../shared/date-utils";
import { AppError } from "../shared/errors";
import { isDuplicateKeyError } from "../shared/sql-errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import {
  loadCatalog,
  planDays,
  startStepsFor,
  stepLadderId,
  type ConquerCatalog,
  type ExerciseView,
  type RungView,
} from "./catalog-service";
import { resolveMemberTimezone } from "./timezone";
import { isValidLevelDays, type Level } from "./rules";

type DbInstance = MySql2Database<typeof schema>;
type Tx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

/**
 * §4.2: incremento editable por alumno. Rangos inclusivos; los usan el
 * JSON-schema de la ruta y la validación del servicio (una sola fuente).
 */
export const CONQUER_INC_RANGES = {
  incReps: { min: 1, max: 3 },
  incS: { min: 1, max: 6 },
} as const;

/** Roles de staff que pueden figurar como coach de un alumno (D-08). */
const COACH_ASSIGNABLE_ROLES = [
  "owner",
  "admin",
  "coach",
  "gestion",
  "admin_sede",
  "coach_actividad",
] as const;

export interface AdminMemberView {
  userId: number;
  status: "pedido" | "activo";
  level: Level | null;
  daysCount: number | null;
  incReps: number;
  incS: number;
  coachUserId: number | null;
  activatedAt: string | null;
  activationDate: string | null;
  levelSince: string | null;
  cutStage: number;
}

export interface ConquerActor {
  userId: number;
  role: string;
}

export interface ActivateMemberInput {
  userId: number;
  level: Level;
  daysCount: number;
  /** `undefined` = el que activa; `null` = sin coach. */
  coachUserId?: number | null;
}

export interface UpdateMemberPatch {
  level?: Level;
  daysCount?: number;
  incReps?: number;
  incS?: number;
  /** `undefined` = no cambia; `null` = sin coach. */
  coachUserId?: number | null;
}

/** Fila de `conquer_members` a la vista JSON del admin. */
export function toAdminMemberView(row: ConquerMemberRow): AdminMemberView {
  return {
    userId: row.userId,
    status: row.status,
    level: row.level,
    daysCount: row.daysCount,
    incReps: row.incReps,
    incS: row.incS,
    coachUserId: row.coachUserId,
    activatedAt: row.activatedAt ? row.activatedAt.toISOString() : null,
    activationDate: row.activationDate,
    levelSince: row.levelSince,
    cutStage: row.cutStage,
  };
}

// ── Escalones iniciales (anexo §3, DA-5) ────────────────────────────

/**
 * Peldaño de arranque de un escalón: el de la tabla del nivel (por `code`). Si
 * el code no existe o está inactivo se parte del activo más cercano hacia lo
 * fácil (o, si no hay, hacia lo difícil). Devuelve `null` solo si la escalera no
 * tiene ningún peldaño activo.
 */
function resolveStartRung(
  rungs: readonly RungView[],
  startCode: string,
): { rung: RungView; fallback: boolean } | null {
  const active = rungs.filter((r) => r.isActive);
  if (active.length === 0) return null;

  const wanted = rungs.find((r) => r.code === startCode);
  if (wanted && wanted.isActive) return { rung: wanted, fallback: false };
  if (!wanted) {
    // Code desconocido: sin posición de referencia, el activo más fácil.
    const easiest = active.reduce((a, b) => (b.position > a.position ? b : a));
    return { rung: easiest, fallback: true };
  }
  const easier = active
    .filter((r) => r.position > wanted.position)
    .sort((a, b) => a.position - b.position)[0];
  const harder = active
    .filter((r) => r.position < wanted.position)
    .sort((a, b) => b.position - a.position)[0];
  return { rung: easier ?? harder, fallback: true };
}

/** Ejercicios únicos de la plantilla de `daysCount` días, en orden de plantilla. */
function planExercises(
  catalog: ConquerCatalog,
  daysCount: number,
): ExerciseView[] {
  const seen = new Set<string>();
  const out: ExerciseView[] = [];
  for (const day of planDays(catalog, daysCount)) {
    for (const code of day.exerciseCodes) {
      const exercise = catalog.exerciseByCode.get(code);
      if (!exercise || seen.has(code)) continue;
      seen.add(code);
      out.push(exercise);
    }
  }
  return out;
}

/**
 * Crea los escalones (e1, e2, e3, hold) de cada ejercicio del plan que todavía
 * no existan para el alumno. NUNCA toca filas existentes: el progreso sobrevive
 * a un cambio de días (§7.2). Devuelve cuántas filas creó.
 *
 * Es también la creación perezosa cuando cambian los días o la plantilla.
 */
export async function ensureStepsForPlan(
  tx: Tx,
  ctx: TenantContext,
  catalog: ConquerCatalog,
  member: { id: number; level: Level; daysCount: number },
  log?: FastifyBaseLogger,
): Promise<number> {
  const exercises = planExercises(catalog, member.daysCount);
  if (exercises.length === 0) return 0;

  const existing = await tx
    .select({
      exerciseId: schema.conquerSteps.exerciseId,
      step: schema.conquerSteps.step,
    })
    .from(schema.conquerSteps)
    .where(
      and(
        tenantWhere(schema.conquerSteps, ctx),
        eq(schema.conquerSteps.memberId, member.id),
      ),
    );
  const have = new Set(existing.map((s) => `${s.exerciseId}:${s.step}`));

  const rows: Omit<typeof schema.conquerSteps.$inferInsert, "tenantId">[] = [];
  for (const exercise of exercises) {
    const table = startStepsFor(exercise, member.level);
    if (table.fallback) {
      // DA-5: sin tabla para el nivel (catálogo de otro gimnasio) usa la de Toro.
      log?.warn(
        { exerciseCode: exercise.code, level: member.level },
        "Conquer: el ejercicio no tiene tabla de arranque para el nivel, se usa la de Toro",
      );
    }
    for (const start of table.steps) {
      if (have.has(`${exercise.id}:${start.step}`)) continue;
      // DA-3: el hold final puede tener su propia escalera.
      const ladder = catalog.ladders.get(stepLadderId(exercise, start.step));
      const resolved = ladder
        ? resolveStartRung(ladder.rungs, start.rung)
        : null;
      if (!resolved) {
        log?.warn(
          { exerciseCode: exercise.code, rung: start.rung },
          "Conquer: sin peldaño activo para el escalón inicial, se omite",
        );
        continue;
      }
      if (resolved.fallback) {
        log?.warn(
          { exerciseCode: exercise.code, rung: start.rung },
          "Conquer: peldaño de arranque inexistente o inactivo, se usa el activo más cercano",
        );
      }
      rows.push({
        memberId: member.id,
        exerciseId: exercise.id,
        step: start.step,
        rungId: resolved.rung.id,
        mode: start.mode,
        sinceDate: null,
        calibration: "pendiente" as const,
      });
    }
  }
  if (rows.length === 0) return 0;

  // INSERT IGNORE sobre el UNIQUE (tenant, member, exercise, step): una carrera
  // con otra request nunca pisa un escalón existente.
  const [header] = await tx
    .insert(schema.conquerSteps)
    .ignore()
    .values(rows.map((row) => tenantValues(ctx, row)));
  return Number(header.affectedRows);
}

// ── Validaciones ────────────────────────────────────────────────────

function assertValidLevelDays(level: Level, daysCount: number): void {
  if (!isValidLevelDays(level, daysCount)) {
    // A14: Ternero 2 o 3, Novillo 3 o 4, Toro 4.
    throw new AppError(
      "Esa combinación de nivel y días por semana no es válida",
      400,
      "CONQUER_DIAS_INVALIDOS",
    );
  }
}

function assertIncrementRanges(patch: UpdateMemberPatch): void {
  const { incReps, incS } = patch;
  const ranges = CONQUER_INC_RANGES;
  if (
    incReps !== undefined &&
    (!Number.isInteger(incReps) ||
      incReps < ranges.incReps.min ||
      incReps > ranges.incReps.max)
  ) {
    throw new AppError(
      `El incremento de repeticiones va de ${ranges.incReps.min} a ${ranges.incReps.max}`,
      400,
      "CONQUER_INCREMENTO_INVALIDO",
    );
  }
  if (
    incS !== undefined &&
    (!Number.isInteger(incS) ||
      incS < ranges.incS.min ||
      incS > ranges.incS.max)
  ) {
    throw new AppError(
      `El incremento de segundos va de ${ranges.incS.min} a ${ranges.incS.max}`,
      400,
      "CONQUER_INCREMENTO_INVALIDO",
    );
  }
}

/** T-201-18: el destino es un socio (`member`) del gimnasio del request. */
async function assertTargetIsMember(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<void> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, userId),
        eq(schema.users.role, "member"),
      ),
    )
    .limit(1);
  if (!row) {
    throw new AppError(
      "No encontramos a ese socio",
      404,
      "CONQUER_SOCIO_NO_ENCONTRADO",
    );
  }
}

/** T-201-18: el coach es staff del gimnasio del request. */
async function assertCoachIsStaff(
  db: DbInstance,
  ctx: TenantContext,
  coachUserId: number,
): Promise<void> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, coachUserId),
        inArray(schema.users.role, [...COACH_ASSIGNABLE_ROLES]),
      ),
    )
    .limit(1);
  if (!row) {
    throw new AppError(
      "El coach elegido no es del equipo del gimnasio",
      400,
      "CONQUER_COACH_INVALIDO",
    );
  }
}

/** T-201-19: duplicado o deadlock por dos altas simultáneas = ya activo. */
function isConcurrentActivation(err: unknown): boolean {
  if (isDuplicateKeyError(err).isDuplicate) return true;
  if (!(err instanceof Error)) return false;
  const cause = err.cause as Record<string, unknown> | undefined;
  return cause?.code === "ER_LOCK_DEADLOCK";
}

function alreadyActiveError(): AppError {
  return new AppError(
    "Ese alumno ya tiene Conquer activo",
    409,
    "CONQUER_YA_ACTIVO",
  );
}

// ── Alta ────────────────────────────────────────────────────────────

async function selectMemberForUpdate(
  tx: Tx,
  ctx: TenantContext,
  userId: number,
): Promise<ConquerMemberRow | undefined> {
  // FOR UPDATE primero en la tx (T-201-19).
  const [row] = await tx
    .select()
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.userId, userId),
      ),
    )
    .limit(1)
    .for("update");
  return row;
}

/** Fila de `conquer_members` de un alumno ACTIVO (con nivel y días ya garantizados). */
export type ActiveMemberRow = ConquerMemberRow & {
  level: Level;
  daysCount: number;
};

function notActiveError(): AppError {
  return new AppError(
    "Ese alumno todavía no tiene Conquer activo",
    409,
    "CONQUER_NO_ACTIVO",
  );
}

function asActiveMember(row: ConquerMemberRow | undefined): ActiveMemberRow {
  if (!row) throw new AppError("Alumno de Conquer no encontrado", 404);
  if (row.status !== "activo" || !row.level || !row.daysCount) {
    throw notActiveError();
  }
  return { ...row, level: row.level, daysCount: row.daysCount };
}

/**
 * Primer statement de las acciones del coach (Fase 201 §7.2): bloquea la fila del
 * alumno (`FOR UPDATE`). 404 si no hay fila en el gimnasio, 409
 * `CONQUER_NO_ACTIVO` si todavía es un pedido.
 */
export async function lockActiveMember(
  tx: Tx,
  ctx: TenantContext,
  userId: number,
): Promise<ActiveMemberRow> {
  return asActiveMember(await selectMemberForUpdate(tx, ctx, userId));
}

/**
 * Lo mismo sin bloquear, para validar antes de leer (ficha, corrección de
 * progresiones): 404 si el alumno no es de este gimnasio (T-201-37).
 */
export async function requireActiveMember(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<ActiveMemberRow> {
  const [row] = await db
    .select()
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.userId, userId),
      ),
    )
    .limit(1);
  return asActiveMember(row);
}

async function readMemberRow(
  tx: Tx,
  ctx: TenantContext,
  id: number,
): Promise<ConquerMemberRow> {
  const [row] = await tx
    .select()
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.id, id),
      ),
    )
    .limit(1);
  if (!row) throw new AppError("Alumno de Conquer no encontrado", 404);
  return row;
}

/**
 * §7.2: owner/admin activa Conquer eligiendo nivel y días. Si el alumno tenía
 * un pedido (D-12) lo pasa a `activo`; si no tenía fila la crea (D-17: sin
 * exigir plan). Crea los escalones iniciales desde la plantilla y la tabla del nivel (anexo §3, DA-5).
 */
export async function activateMember(
  db: DbInstance,
  ctx: TenantContext,
  actor: ConquerActor,
  input: ActivateMemberInput,
  log?: FastifyBaseLogger,
): Promise<AdminMemberView> {
  assertValidLevelDays(input.level, input.daysCount);
  await assertTargetIsMember(db, ctx, input.userId);
  if (input.coachUserId !== undefined && input.coachUserId !== null) {
    await assertCoachIsStaff(db, ctx, input.coachUserId);
  }
  // D-08: por defecto el coach es quien lo activó.
  const coachUserId =
    input.coachUserId === undefined ? actor.userId : input.coachUserId;

  const [catalog, tz] = await Promise.all([
    loadCatalog(db, ctx),
    resolveMemberTimezone(db, ctx, input.userId),
  ]);
  // "Hoy" del alumno es el de su sede, nunca UTC (§4.4).
  const today = todayInTz(tz);

  try {
    return await db.transaction(async (tx) => {
      const existing = await selectMemberForUpdate(tx, ctx, input.userId);
      if (existing && existing.status === "activo") throw alreadyActiveError();

      const activation = {
        status: "activo" as const,
        level: input.level,
        daysCount: input.daysCount,
        coachUserId,
        activatedAt: sql`NOW()`,
        activatedBy: actor.userId,
        activationDate: today,
        levelSince: today,
        cutStage: 0,
      };

      let memberId = null as number | null;
      if (existing) {
        await tx
          .update(schema.conquerMembers)
          .set(activation)
          .where(
            and(
              tenantWhere(schema.conquerMembers, ctx),
              eq(schema.conquerMembers.id, existing.id),
            ),
          );
        memberId = existing.id;
      } else {
        const [created] = await tx
          .insert(schema.conquerMembers)
          .values(tenantValues(ctx, { ...activation, userId: input.userId }))
          .$returningId();
        memberId = created.id;
      }

      await ensureStepsForPlan(
        tx,
        ctx,
        catalog,
        { id: memberId, level: input.level, daysCount: input.daysCount },
        log,
      );
      return toAdminMemberView(await readMemberRow(tx, ctx, memberId));
    });
  } catch (err: unknown) {
    if (isConcurrentActivation(err)) throw alreadyActiveError();
    throw err;
  }
}

// ── Edición ─────────────────────────────────────────────────────────

/** Campos de `conquer_members` que cambia el patch (solo los presentes). */
function buildMemberSet(
  patch: UpdateMemberPatch,
  levelChanged: boolean,
  today: string | null,
): Partial<typeof schema.conquerMembers.$inferInsert> {
  const set: Partial<typeof schema.conquerMembers.$inferInsert> = {};
  if (patch.level !== undefined) set.level = patch.level;
  if (patch.daysCount !== undefined) set.daysCount = patch.daysCount;
  if (patch.incReps !== undefined) set.incReps = patch.incReps;
  if (patch.incS !== undefined) set.incS = patch.incS;
  if (patch.coachUserId !== undefined) set.coachUserId = patch.coachUserId;
  // §2.2: el reloj del paso de nivel se reinicia al cambiar de nivel.
  if (levelChanged && today) set.levelSince = today;
  return set;
}

/**
 * Edita nivel, días, incrementos (§4.2) y coach de un alumno ACTIVO. Si cambian
 * los días se crean los escalones de los ejercicios nuevos (sin tocar los que
 * ya existen).
 */
export async function updateMember(
  db: DbInstance,
  ctx: TenantContext,
  _actor: ConquerActor,
  userId: number,
  patch: UpdateMemberPatch,
  log?: FastifyBaseLogger,
): Promise<AdminMemberView> {
  assertIncrementRanges(patch);
  if (patch.coachUserId !== undefined && patch.coachUserId !== null) {
    await assertCoachIsStaff(db, ctx, patch.coachUserId);
  }
  const tz = await resolveMemberTimezone(db, ctx, userId);
  const today = todayInTz(tz);

  return db.transaction(async (tx) => {
    const row = await lockActiveMember(tx, ctx, userId);

    const level = patch.level ?? row.level;
    const daysCount = patch.daysCount ?? row.daysCount;
    assertValidLevelDays(level, daysCount);

    const levelChanged = patch.level !== undefined && patch.level !== row.level;
    const set = buildMemberSet(patch, levelChanged, today);
    if (Object.keys(set).length > 0) {
      await tx
        .update(schema.conquerMembers)
        .set(set)
        .where(
          and(
            tenantWhere(schema.conquerMembers, ctx),
            eq(schema.conquerMembers.id, row.id),
          ),
        );
    }

    if (daysCount !== row.daysCount) {
      const catalog = await loadCatalog(db, ctx);
      await ensureStepsForPlan(
        tx,
        ctx,
        catalog,
        { id: row.id, level, daysCount },
        log,
      );
    }
    return toAdminMemberView(await readMemberRow(tx, ctx, row.id));
  });
}
