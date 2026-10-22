/**
 * Fábricas de la fase 201 (Conquer v2). Cada plan las amplía: NO duplicar en
 * los archivos de test (201-07 suma `insertConquerSession`).
 *
 * Reglas (EXECUTOR-RULES): usuarios SIEMPRE con fábricas, nunca ids fijos de
 * `users`; INSERT directos con `tenantValues(TEMPLO_CTX, ...)` y lecturas
 * directas con `tenantWhere(tabla, TEMPLO_CTX)`.
 */
import { and, eq, like, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import type { ConquerMode } from "../../src/db/schema/conquer";
import type { StepKey } from "../../src/modules/conquer/engine";
import { resolveMemberTimezone } from "../../src/modules/conquer/member-service";
import type { Level } from "../../src/modules/conquer/rules";
import { todayInTz } from "../../src/modules/shared/date-utils";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { createStaffUser, createTestMember, getAuthToken } from "../helpers";

/** Contexto de El Templo (tenant 1): el único con Conquer en la fase 201. */
export const TEMPLO_CTX: TenantContext = { tenantId: 1 };

/** Contraseña de los usuarios de staff creados por estas fábricas. */
const STAFF_PASSWORD = "conquer-staff-123";

/**
 * Usuario de staff de El Templo (sede 1) con el rol pedido, ya autenticado.
 * El email es único por llamada.
 */
export async function createConquerStaff(
  app: FastifyInstance,
  role: string,
): Promise<{ id: number; token: string }> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `conquer-${role}-${suffix}@test.com`;
  const id = await createStaffUser(app, {
    email,
    password: STAFF_PASSWORD,
    firstName: "Staff",
    lastName: `Conquer ${role}`,
    role,
    branchId: 1,
  });
  const token = await getAuthToken(app, email, STAFF_PASSWORD);
  return { id, token };
}

type ConquerMemberOverrides = Partial<
  Omit<typeof schema.conquerMembers.$inferInsert, "id" | "tenantId" | "userId">
>;

/**
 * Fila directa de `conquer_members` para `userId`. Por defecto `status:
 * 'pedido'`; para un alumno activo pasar `status: "activo"` más `level`,
 * `daysCount` y `activationDate`.
 */
export async function insertConquerMember(
  app: FastifyInstance,
  userId: number,
  overrides: ConquerMemberOverrides = {},
): Promise<number> {
  const [row] = await app.db
    .insert(schema.conquerMembers)
    .values(
      tenantValues(TEMPLO_CTX, {
        status: "pedido" as const,
        ...overrides,
        userId,
      }),
    )
    .$returningId();
  return row.id;
}

/** Borra los parámetros `conquer.%` de `tenant_settings` del gimnasio 1. */
export async function clearConquerSettings(
  app: FastifyInstance,
): Promise<void> {
  await app.db
    .delete(schema.tenantSettings)
    .where(
      and(
        tenantWhere(schema.tenantSettings, TEMPLO_CTX),
        like(schema.tenantSettings.settingKey, "conquer.%"),
      ),
    );
}

/** Ruta de alta del admin (201-06). */
export const CONQUER_MEMBERS_URL = "/api/admin/conquer/members";

/**
 * Activa a un alumno por la API (201-06). Devuelve la respuesta cruda para que
 * el test decida qué afirmar (201 / 4xx).
 */
export async function activateViaApi(
  app: FastifyInstance,
  adminToken: string,
  userId: number,
  level: Level,
  daysCount: number,
  extra: { coachUserId?: number | null } = {},
) {
  return app.inject({
    method: "POST",
    url: CONQUER_MEMBERS_URL,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { userId, level, daysCount, ...extra },
  });
}

/**
 * Alumno de El Templo (sin plan, D-17) ya ACTIVO en Conquer, más el token de
 * un admin. Falla fuerte si el alta no responde 201.
 */
export async function createActiveConquerMember(
  app: FastifyInstance,
  opts: { level: Level; daysCount: number },
): Promise<{ userId: number; token: string; adminToken: string }> {
  const member = await createTestMember(app);
  const admin = await createConquerStaff(app, "admin");
  const res = await activateViaApi(
    app,
    admin.token,
    member.id,
    opts.level,
    opts.daysCount,
  );
  if (res.statusCode !== 201) {
    throw new Error(`createActiveConquerMember: ${res.statusCode} ${res.body}`);
  }
  return { userId: member.id, token: member.token, adminToken: admin.token };
}

/** Un escalón del alumno resuelto a códigos legibles. */
export interface StepSnapshot {
  rungId: number;
  rungCode: string;
  mode: string;
  sinceDate: string | null;
  calibration: string;
}

/**
 * Escalones del alumno `userId` indexados por `"<ejercicio>:<e1|e2|e3|hold>"`
 * (código del ejercicio y del peldaño, no ids).
 */
export async function readConquerSteps(
  app: FastifyInstance,
  userId: number,
): Promise<Map<string, StepSnapshot>> {
  const rows = await app.db
    .select({
      exerciseCode: schema.conquerExercises.code,
      step: schema.conquerSteps.step,
      rungId: schema.conquerSteps.rungId,
      rungCode: schema.conquerRungs.code,
      mode: schema.conquerSteps.mode,
      sinceDate: schema.conquerSteps.sinceDate,
      calibration: schema.conquerSteps.calibration,
    })
    .from(schema.conquerSteps)
    .innerJoin(
      schema.conquerMembers,
      eq(schema.conquerMembers.id, schema.conquerSteps.memberId),
    )
    .innerJoin(
      schema.conquerExercises,
      eq(schema.conquerExercises.id, schema.conquerSteps.exerciseId),
    )
    .innerJoin(
      schema.conquerRungs,
      eq(schema.conquerRungs.id, schema.conquerSteps.rungId),
    )
    .where(
      and(
        tenantWhere(schema.conquerSteps, TEMPLO_CTX),
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        tenantWhere(schema.conquerExercises, TEMPLO_CTX),
        tenantWhere(schema.conquerRungs, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
  return new Map(
    rows.map((r) => [
      `${r.exerciseCode}:${r.step}`,
      {
        rungId: r.rungId,
        rungCode: r.rungCode,
        mode: r.mode,
        sinceDate: r.sinceDate,
        calibration: r.calibration,
      },
    ]),
  );
}

/** Una marca de `insertConquerSession`: ejercicio y escalón por código, no por id. */
export interface ConquerSessionStepInput {
  exerciseCode: string;
  step: StepKey;
  value: number;
  prevTarget?: number | null;
  /** Código del peldaño de la marca. Por defecto, el peldaño actual del escalón. */
  rungCode?: string;
}

/**
 * Inserta DIRECTO una sesión del historial (días pasados) con sus marcas
 * (201-07). Resuelve ids por `code`; `rung_id`/`mode` salen del escalón actual
 * del alumno salvo que se pase `rungCode`. Devuelve el id de la sesión.
 */
export async function insertConquerSession(
  app: FastifyInstance,
  input: {
    userId: number;
    date: string;
    dayKey: string;
    pain?: number;
    steps: ConquerSessionStepInput[];
  },
): Promise<number> {
  const exercises = await app.db
    .select({
      id: schema.conquerExercises.id,
      code: schema.conquerExercises.code,
      ladderId: schema.conquerExercises.ladderId,
    })
    .from(schema.conquerExercises)
    .where(tenantWhere(schema.conquerExercises, TEMPLO_CTX));
  const byCode = new Map(exercises.map((e) => [e.code, e]));
  const current = await readConquerSteps(app, input.userId);

  const [session] = await app.db
    .insert(schema.conquerSessions)
    .values(
      tenantValues(TEMPLO_CTX, {
        userId: input.userId,
        sessionDate: input.date,
        dayKey: input.dayKey,
        pain: input.pain ?? 0,
        savedAt: sql`NOW()`,
      }),
    )
    .$returningId();

  for (const step of input.steps) {
    const exercise = byCode.get(step.exerciseCode);
    const own = current.get(`${step.exerciseCode}:${step.step}`);
    if (!exercise || !own) {
      throw new Error(
        `insertConquerSession: el alumno no tiene ${step.exerciseCode}:${step.step}`,
      );
    }
    let rungId = own.rungId;
    if (step.rungCode !== undefined) {
      const [rung] = await app.db
        .select({ id: schema.conquerRungs.id })
        .from(schema.conquerRungs)
        .where(
          and(
            tenantWhere(schema.conquerRungs, TEMPLO_CTX),
            eq(schema.conquerRungs.ladderId, exercise.ladderId),
            eq(schema.conquerRungs.code, step.rungCode),
          ),
        );
      if (!rung) {
        throw new Error(`insertConquerSession: peldaño ${step.rungCode}`);
      }
      rungId = rung.id;
    }
    await app.db.insert(schema.conquerSessionSteps).values(
      tenantValues(TEMPLO_CTX, {
        sessionId: session.id,
        exerciseId: exercise.id,
        step: step.step,
        value: step.value,
        prevTarget: step.prevTarget ?? null,
        rungId,
        mode: own.mode as ConquerMode,
      }),
    );
  }
  return session.id;
}

// ── Hoy, guardado y cambio de escalón (201-07) ──────────────────────

export const CONQUER_TODAY_URL = "/api/members/conquer/today";
export const CONQUER_SESSIONS_URL = "/api/members/conquer/sessions";
export const CONQUER_STATE_URL = "/api/members/conquer/state";

export function conquerStepUrl(exerciseId: number, step: string): string {
  return `/api/members/conquer/steps/${exerciseId}/${step}`;
}

export interface TodayStepBody {
  step: StepKey;
  rungId: number;
  rungName: string;
  mode: string;
  target: number | null;
  estado: string | null;
  value: number;
  brazosRectos: boolean;
  unilateral: boolean;
}

export interface TodayExerciseBody {
  exerciseId: number;
  code: string;
  name: string;
  unit: "reps" | "s";
  rungs: {
    id: number;
    code: string;
    name: string;
    position: number;
    brazosRectos: boolean;
    unilateral: boolean;
  }[];
  steps: TodayStepBody[];
}

export interface TodayBody {
  weekMonday: string;
  plan: { dayKey: string; label: string; done: boolean }[];
  nextDayKey: string | null;
  weekComplete: boolean;
  date: string;
  dayKey: string;
  label: string;
  alreadySaved: boolean;
  pain: number;
  finisher: string;
  level: string;
  exercises: TodayExerciseBody[];
}

/** "Hoy" del alumno: el de su sede, igual que lo calcula el servidor (A16). */
export async function memberToday(
  app: FastifyInstance,
  userId: number,
): Promise<string> {
  return todayInTz(await resolveMemberTimezone(app.db, TEMPLO_CTX, userId));
}

/** Ids de los ejercicios del catálogo por código. */
export async function conquerExerciseIds(
  app: FastifyInstance,
): Promise<Map<string, number>> {
  const rows = await app.db
    .select({
      id: schema.conquerExercises.id,
      code: schema.conquerExercises.code,
    })
    .from(schema.conquerExercises)
    .where(tenantWhere(schema.conquerExercises, TEMPLO_CTX));
  return new Map(rows.map((r) => [r.code, r.id]));
}

/** Id de un peldaño por código de escalera y de peldaño. */
export async function conquerRungId(
  app: FastifyInstance,
  ladderCode: string,
  rungCode: string,
): Promise<number> {
  const [row] = await app.db
    .select({ id: schema.conquerRungs.id })
    .from(schema.conquerRungs)
    .innerJoin(
      schema.conquerLadders,
      eq(schema.conquerLadders.id, schema.conquerRungs.ladderId),
    )
    .where(
      and(
        tenantWhere(schema.conquerRungs, TEMPLO_CTX),
        tenantWhere(schema.conquerLadders, TEMPLO_CTX),
        eq(schema.conquerLadders.code, ladderCode),
        eq(schema.conquerRungs.code, rungCode),
      ),
    );
  if (!row) throw new Error(`conquerRungId: ${ladderCode}/${rungCode}`);
  return row.id;
}

export interface SavedStep {
  value: number;
  prevTarget: number | null;
  rungCode: string;
  mode: string;
}

/** Marcas guardadas de una sesión, por `"<ejercicio>:<e1|e2|e3|hold>"`. */
export async function readSessionSteps(
  app: FastifyInstance,
  sessionId: number,
): Promise<Map<string, SavedStep>> {
  const rows = await app.db
    .select({
      exerciseCode: schema.conquerExercises.code,
      step: schema.conquerSessionSteps.step,
      value: schema.conquerSessionSteps.value,
      prevTarget: schema.conquerSessionSteps.prevTarget,
      rungCode: schema.conquerRungs.code,
      mode: schema.conquerSessionSteps.mode,
    })
    .from(schema.conquerSessionSteps)
    .innerJoin(
      schema.conquerExercises,
      eq(schema.conquerExercises.id, schema.conquerSessionSteps.exerciseId),
    )
    .innerJoin(
      schema.conquerRungs,
      eq(schema.conquerRungs.id, schema.conquerSessionSteps.rungId),
    )
    .where(
      and(
        tenantWhere(schema.conquerSessionSteps, TEMPLO_CTX),
        tenantWhere(schema.conquerExercises, TEMPLO_CTX),
        tenantWhere(schema.conquerRungs, TEMPLO_CTX),
        eq(schema.conquerSessionSteps.sessionId, sessionId),
      ),
    );
  return new Map(
    rows.map((r) => [
      `${r.exerciseCode}:${r.step}`,
      {
        value: r.value,
        prevTarget: r.prevTarget,
        rungCode: r.rungCode,
        mode: r.mode,
      },
    ]),
  );
}

/** Sesiones del alumno en `conquer_sessions` (todas las fechas). */
export async function readConquerSessions(
  app: FastifyInstance,
  userId: number,
) {
  return app.db
    .select()
    .from(schema.conquerSessions)
    .where(
      and(
        tenantWhere(schema.conquerSessions, TEMPLO_CTX),
        eq(schema.conquerSessions.userId, userId),
      ),
    );
}

/**
 * Body de `PUT /sessions` armado desde la respuesta de `GET /today` con los
 * contadores precargados (D-18). `edits` pisa valores por código de ejercicio.
 */
export function sessionBodyFromToday(
  today: TodayBody,
  edits: Record<
    string,
    Partial<Record<"e1" | "e2" | "e3" | "hold", number>>
  > = {},
  pain = 0,
) {
  return {
    dayKey: today.dayKey,
    pain,
    exercises: today.exercises.map((exercise) => {
      const value = (step: StepKey): number =>
        edits[exercise.code]?.[step] ??
        exercise.steps.find((s) => s.step === step)?.value ??
        0;
      return {
        exerciseId: exercise.exerciseId,
        e1: value("e1"),
        e2: value("e2"),
        e3: value("e3"),
        hold: value("hold"),
      };
    }),
  };
}
