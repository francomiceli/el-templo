/**
 * Fábricas de la fase 201 (Conquer v2). Cada plan las amplía: NO duplicar en
 * los archivos de test (201-07 suma `insertConquerSession`).
 *
 * Reglas (EXECUTOR-RULES): usuarios SIEMPRE con fábricas, nunca ids fijos de
 * `users`; INSERT directos con `tenantValues(TEMPLO_CTX, ...)` y lecturas
 * directas con `tenantWhere(tabla, TEMPLO_CTX)`.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, like, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { vi } from "vitest";
import * as schema from "../../src/db/schema";
import type { ConquerMode } from "../../src/db/schema/conquer";
import { addDaysIso, mondayOfIso } from "../../src/modules/conquer/calendar";
import type { StepKey } from "../../src/modules/conquer/engine";
import {
  privateMediaResolver,
  type PrivateMediaStore,
} from "../../src/modules/conquer/private-media";
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
  /** Código de la escalera del peldaño (201-25: cada ejercicio y cada hold tiene la suya). */
  ladderCode: string;
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
      ladderCode: schema.conquerLadders.code,
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
    .innerJoin(
      schema.conquerLadders,
      eq(schema.conquerLadders.id, schema.conquerRungs.ladderId),
    )
    .where(
      and(
        tenantWhere(schema.conquerSteps, TEMPLO_CTX),
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        tenantWhere(schema.conquerExercises, TEMPLO_CTX),
        tenantWhere(schema.conquerRungs, TEMPLO_CTX),
        tenantWhere(schema.conquerLadders, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
  return new Map(
    rows.map((r) => [
      `${r.exerciseCode}:${r.step}`,
      {
        rungId: r.rungId,
        rungCode: r.rungCode,
        ladderCode: r.ladderCode,
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

/** Combo de una sesión insertada (201-10): peldaño de Palanca por código, series y objetivo. */
export interface ConquerComboInput {
  rungCode: string;
  series: number;
  target: number;
}

/**
 * Inserta DIRECTO una sesión del historial (días pasados) con sus marcas
 * (201-07). Resuelve ids por `code`; `rung_id`/`mode` salen del escalón actual
 * del alumno salvo que se pase `rungCode`. `combo` (apertura), `push` y `pull`
 * (sábado) llenan las columnas de combo (201-10). Devuelve el id de la sesión.
 */
export async function insertConquerSession(
  app: FastifyInstance,
  input: {
    userId: number;
    date: string;
    dayKey: string;
    pain?: number;
    steps: ConquerSessionStepInput[];
    combo?: ConquerComboInput;
    push?: ConquerComboInput;
    pull?: ConquerComboInput;
  },
): Promise<number> {
  const comboColumns = await comboInsertColumns(app, input);
  const exercises = await app.db
    .select({
      id: schema.conquerExercises.id,
      code: schema.conquerExercises.code,
      ladderId: schema.conquerExercises.ladderId,
      holdLadderId: schema.conquerExercises.holdLadderId,
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
        ...comboColumns,
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
            // 201-25 DA-3: el hold tiene su propia escalera.
            eq(
              schema.conquerRungs.ladderId,
              step.step === "hold"
                ? (exercise.holdLadderId ?? exercise.ladderId)
                : exercise.ladderId,
            ),
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

/** Columnas `combo_*`/`push_*`/`pull_*` de una sesión insertada, con los ids de Palanca resueltos por código. */
async function comboInsertColumns(
  app: FastifyInstance,
  input: {
    combo?: ConquerComboInput;
    push?: ConquerComboInput;
    pull?: ConquerComboInput;
  },
) {
  const resolve = async (c: ConquerComboInput | undefined) =>
    c === undefined
      ? null
      : {
          rungId: await conquerRungId(app, "palanca", c.rungCode),
          series: c.series,
          target: c.target,
        };
  const [combo, push, pull] = await Promise.all([
    resolve(input.combo),
    resolve(input.push),
    resolve(input.pull),
  ]);
  return {
    comboRungId: combo?.rungId ?? null,
    comboSeries: combo?.series ?? null,
    comboTarget: combo?.target ?? null,
    pushRungId: push?.rungId ?? null,
    pushSeries: push?.series ?? null,
    pushTarget: push?.target ?? null,
    pullRungId: pull?.rungId ?? null,
    pullSeries: pull?.series ?? null,
    pullTarget: pull?.target ?? null,
  };
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
  /** 201-26 DA-10: modos que ofrece el desplegable (anexo §1). */
  modes: string[];
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
    unilateral: boolean;
  }[];
  /** 201-25 DA-3: opciones de peldaño del hold final (su escalera, o la de E1-E3). */
  holdRungs: {
    id: number;
    code: string;
    name: string;
    position: number;
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
  opening: ComboBody | null;
  saturday: { warmup: string; push: ComboBody; pull: ComboBody } | null;
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

// ── Progreso, Subir y calibración (201-08) ──────────────────────────

export const CONQUER_PROGRESS_URL = "/api/members/conquer/progress";

export function conquerSubirUrl(exerciseId: number, step: string): string {
  return `/api/members/conquer/steps/${exerciseId}/${step}/subir`;
}

export function conquerCalibrationUrl(exerciseId: number): string {
  return `/api/members/conquer/calibration/${exerciseId}`;
}

export interface CalibrationBody {
  exerciseId: number;
  exerciseName: string;
  proposal: "subir" | "quedarse" | "bajar";
  fromRungName: string;
  toRungName: string | null;
}

export interface ProgressStepBody {
  step: StepKey;
  rungId: number;
  rungName: string;
  unilateral: boolean;
  mode: string;
  last: number | null;
  target: number | null;
  estado: string | null;
}

export interface ProgressExerciseBody {
  exerciseId: number;
  name: string;
  unit: "reps" | "s";
  e1Curve: number[];
  steps: ProgressStepBody[];
}

export interface ProgressBody {
  sessionsCount: number;
  accuracy: {
    n: number;
    hits: number;
    pct: number | null;
    delta: number | null;
  };
  weekLighting: { primary: string[]; secondary: string[] };
  subir: {
    exerciseId: number;
    exerciseName: string;
    step: "e1" | "e2" | "e3";
    fromRungName: string;
    toRungName: string | null;
  }[];
  comboSubir: {
    comboKey: string;
    label: string;
    fromRungName: string;
    toRungName: string | null;
  }[];
  calibrations: CalibrationBody[];
  days: {
    dayKey: string;
    label: string;
    sessionsCount: number;
    exercises: ProgressExerciseBody[];
  }[];
}

export interface ConquerErrorBody {
  error: string;
  code?: string;
}

export interface SavedSessionBody {
  sessionId: number;
  date: string;
  dayKey: string;
  lighting: { primary: string[]; secondary: string[] };
  calibration: CalibrationBody[];
  /** 201-26 DA-14: escalones E1-E3 que llegaron al techo por primera vez. */
  techo: { exerciseName: string; step: "e1" | "e2" | "e3" }[];
}

/** "2026-10-21" -> "21/10" (la misma forma `d/m` de las frases de las alertas, 201-26). */
export function shortDateText(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(day)}/${Number(month)}`;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** `GET /today` que tiene que responder 200; devuelve el body tipado. */
export async function fetchToday(
  app: FastifyInstance,
  token: string,
  day?: string,
): Promise<TodayBody> {
  const res = await app.inject({
    method: "GET",
    url:
      day === undefined ? CONQUER_TODAY_URL : `${CONQUER_TODAY_URL}?day=${day}`,
    headers: bearer(token),
  });
  if (res.statusCode !== 200) {
    throw new Error(`fetchToday: ${res.statusCode} ${res.body}`);
  }
  return res.json<TodayBody>();
}

/** `PUT /sessions` crudo: el test decide qué afirmar. */
export async function putSessionRaw(
  app: FastifyInstance,
  token: string,
  payload: unknown,
) {
  return app.inject({
    method: "PUT",
    url: CONQUER_SESSIONS_URL,
    headers: bearer(token),
    payload: payload as Record<string, unknown>,
  });
}

/**
 * Guarda la sesión de HOY del día `day` (por defecto el que toca) con los
 * contadores precargados más `edits`. Falla fuerte si no responde 200.
 */
export async function saveTodaySession(
  app: FastifyInstance,
  token: string,
  opts: {
    day?: string;
    edits?: Parameters<typeof sessionBodyFromToday>[1];
    pain?: number;
  } = {},
): Promise<SavedSessionBody> {
  const vista = await fetchToday(app, token, opts.day);
  const res = await putSessionRaw(
    app,
    token,
    sessionBodyFromToday(vista, opts.edits ?? {}, opts.pain ?? 0),
  );
  if (res.statusCode !== 200) {
    throw new Error(`saveTodaySession: ${res.statusCode} ${res.body}`);
  }
  return res.json<SavedSessionBody>();
}

export async function getProgressRaw(app: FastifyInstance, token: string) {
  return app.inject({
    method: "GET",
    url: CONQUER_PROGRESS_URL,
    headers: bearer(token),
  });
}

/** `GET /progress` que tiene que responder 200. */
export async function fetchProgress(
  app: FastifyInstance,
  token: string,
): Promise<ProgressBody> {
  const res = await getProgressRaw(app, token);
  if (res.statusCode !== 200) {
    throw new Error(`fetchProgress: ${res.statusCode} ${res.body}`);
  }
  return res.json<ProgressBody>();
}

export async function postSubir(
  app: FastifyInstance,
  token: string,
  exerciseId: number,
  step: string,
) {
  return app.inject({
    method: "POST",
    url: conquerSubirUrl(exerciseId, step),
    headers: bearer(token),
  });
}

export async function postCalibration(
  app: FastifyInstance,
  token: string,
  exerciseId: number,
  payload: unknown,
) {
  return app.inject({
    method: "POST",
    url: conquerCalibrationUrl(exerciseId),
    headers: bearer(token),
    payload: payload as Record<string, unknown>,
  });
}

/** Lunes de la semana de `hoy` corrido `n` semanas atrás (siempre anterior a hoy si n >= 1). */
export function weeksAgo(hoy: string, n: number): string {
  return addDaysIso(mondayOfIso(hoy), -7 * n);
}

/** Alertas del alumno en `conquer_alerts` (todas las filas). */
export async function readConquerAlerts(app: FastifyInstance, userId: number) {
  return app.db
    .select()
    .from(schema.conquerAlerts)
    .where(
      and(
        tenantWhere(schema.conquerAlerts, TEMPLO_CTX),
        eq(schema.conquerAlerts.userId, userId),
      ),
    );
}

// ── Alertas, controles físicos y tablero (201-09) ───────────────────

export const CONQUER_BOARD_URL = "/api/admin/conquer/members";

export function conquerAlertUrl(alertId: number | string): string {
  return `/api/admin/conquer/alerts/${alertId}`;
}

export interface BoardAlertBody {
  id: number | null;
  kind: string;
  severity: "rojo" | "amarillo" | "verde";
  label: string;
  /** 201-26 DA-13: la frase de la alerta del anexo §8 con sus datos. */
  text: string;
  status: "abierta" | "vista" | "resuelta" | null;
  createdAt: string | null;
  detail: Record<string, unknown>;
  proposal:
    | { kind: "etapa"; stage: number; label: string }
    | { kind: "bajar_escalon"; label: string }
    | null;
}

export interface BoardMemberBody {
  userId: number;
  firstName: string;
  lastName: string;
  level: string;
  daysCount: number;
  cutStage: number;
  lastSessionDate: string | null;
  light: "rojo" | "amarillo" | "verde" | "ok";
  alerts: BoardAlertBody[];
}

export interface BoardBody {
  counts: {
    rojo: number;
    amarillo: number;
    verde: number;
    ok: number;
    total: number;
  };
  members: BoardMemberBody[];
}

/** `GET /members` crudo: el test decide qué afirmar (200 / 401 / 403). */
export async function getBoardRaw(app: FastifyInstance, token?: string) {
  return app.inject({
    method: "GET",
    url: CONQUER_BOARD_URL,
    headers: token === undefined ? {} : bearer(token),
  });
}

/** `GET /members` que tiene que responder 200. */
export async function fetchBoard(
  app: FastifyInstance,
  token: string,
): Promise<BoardBody> {
  const res = await getBoardRaw(app, token);
  if (res.statusCode !== 200) {
    throw new Error(`fetchBoard: ${res.statusCode} ${res.body}`);
  }
  return res.json<BoardBody>();
}

/** El alumno `userId` dentro del tablero; falla fuerte si no está. */
export function boardMember(board: BoardBody, userId: number): BoardMemberBody {
  const found = board.members.find((m) => m.userId === userId);
  if (!found) throw new Error(`boardMember: ${userId} no está en el tablero`);
  return found;
}

/** `PATCH /alerts/:id` crudo. */
export async function patchAlert(
  app: FastifyInstance,
  token: string | undefined,
  alertId: number | string,
  payload: unknown,
) {
  return app.inject({
    method: "PATCH",
    url: conquerAlertUrl(alertId),
    headers: token === undefined ? {} : bearer(token),
    payload: payload as Record<string, unknown>,
  });
}

/**
 * Inserta DIRECTO una alerta de `conquer_alerts` (gimnasio 1 salvo que se pase
 * `tenantId`). Devuelve el id.
 */
export async function insertConquerAlert(
  app: FastifyInstance,
  input: {
    userId: number;
    type: "molestia" | "caida" | "tope_escalera" | "paso_nivel";
    dedupeKey: string;
    detail?: Record<string, unknown>;
    status?: "abierta" | "vista" | "resuelta";
    resolvedBy?: number | null;
    tenantId?: number;
  },
): Promise<number> {
  const [row] = await app.db
    .insert(schema.conquerAlerts)
    .values(
      tenantValues(
        { tenantId: input.tenantId ?? TEMPLO_CTX.tenantId },
        {
          userId: input.userId,
          type: input.type,
          dedupeKey: input.dedupeKey,
          detail: input.detail ?? {},
          status: input.status ?? ("abierta" as const),
          resolvedBy: input.resolvedBy ?? null,
        },
      ),
    )
    .$returningId();
  return row.id;
}

/**
 * Inserta DIRECTO un control físico. Por defecto con `arm_cm = 30` para que
 * tenga contenido; `empty: true` lo deja sin fotos ni medidas (fila creada pero
 * sin nada confirmado: no cuenta como control, 201-09).
 */
export async function insertBodyCheckRow(
  app: FastifyInstance,
  input: {
    userId: number;
    checkDate: string;
    kind: "dia0" | "periodico";
    empty?: boolean;
  },
): Promise<number> {
  const [row] = await app.db
    .insert(schema.conquerBodyChecks)
    .values(
      tenantValues(TEMPLO_CTX, {
        userId: input.userId,
        checkDate: input.checkDate,
        kind: input.kind,
        armCm: input.empty === true ? null : "30.0",
      }),
    )
    .$returningId();
  return row.id;
}

// ── Combos de Toro (201-10) ─────────────────────────────────────────

export interface ComboBody {
  comboKey: string;
  label: string;
  press: string;
  push: string;
  hold: string;
  rungs: { id: number; code: string; name: string; position: number }[];
  rungId: number;
  rungName: string;
  target: number;
  value: number;
  maxSeries: number | null;
  drops: number | null;
  subir: { ready: boolean; toRungName: string | null };
}

export function conquerComboSubirUrl(comboKey: string): string {
  return `/api/members/conquer/combos/${comboKey}/subir`;
}

/** `POST /combos/:comboKey/subir` crudo. */
export async function postComboSubir(
  app: FastifyInstance,
  token: string,
  comboKey: string,
) {
  return app.inject({
    method: "POST",
    url: conquerComboSubirUrl(comboKey),
    headers: bearer(token),
  });
}

/** Parche directo a la fila `conquer_members` del alumno (recorte, activación, combo_state...). */
export async function patchConquerMember(
  app: FastifyInstance,
  userId: number,
  patch: Partial<typeof schema.conquerMembers.$inferInsert>,
): Promise<void> {
  await app.db
    .update(schema.conquerMembers)
    .set(patch)
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
}

/**
 * Fija `combo_state` del alumno a partir de códigos de peldaño de Palanca:
 * `{ plancha: { rungCode: "half_lay", since } }`.
 */
export async function setComboState(
  app: FastifyInstance,
  userId: number,
  state: Record<string, { rungCode: string; since: string }>,
): Promise<void> {
  const resolved: Record<string, { rungId: number; since: string }> = {};
  for (const [comboKey, entry] of Object.entries(state)) {
    resolved[comboKey] = {
      rungId: await conquerRungId(app, "palanca", entry.rungCode),
      since: entry.since,
    };
  }
  await patchConquerMember(app, userId, { comboState: resolved });
}

/** `combo_state` crudo del alumno (o `null`). */
export async function readComboState(
  app: FastifyInstance,
  userId: number,
): Promise<Record<string, { rungId: number; since: string }> | null> {
  const [row] = await app.db
    .select({ comboState: schema.conquerMembers.comboState })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
  return row?.comboState ?? null;
}

/** Body de `PUT /sessions` del sábado de Toro (sin ejercicios, 201-10). */
export function saturdayBody(opts: {
  push: { rungId: number; series: number };
  pull: { rungId: number; series: number };
  pain?: number;
}) {
  return {
    dayKey: "sabado",
    pain: opts.pain ?? 0,
    push: opts.push,
    pull: opts.pull,
  };
}

// ── Ficha, recortes y paso de nivel (201-11) ────────────────────────

export function conquerFichaUrl(userId: number | string): string {
  return `/api/admin/conquer/members/${userId}`;
}

export interface CutProposalBody {
  kind: "etapa" | "bajar_escalon";
  stage?: number;
  label: string;
}

export interface FichaBody {
  member: {
    userId: number;
    status: "pedido" | "activo";
    level: string | null;
    daysCount: number | null;
    incReps: number;
    incS: number;
    coachUserId: number | null;
    activatedAt: string | null;
    activationDate: string | null;
    levelSince: string | null;
    cutStage: number;
    firstName: string;
    lastName: string;
    email: string | null;
    publishEnabled: boolean;
    publishNoFace: boolean;
  };
  progress: ProgressBody;
  alerts: BoardAlertBody[];
  /** 201-26 DA-12: `null` = Toro después de la etapa 5. */
  cutProposal: CutProposalBody | null;
  levelUp: { to: string | null; validDays: number[] };
}

/** `GET /members/:userId` crudo (la ficha). */
export async function getFichaRaw(
  app: FastifyInstance,
  token: string | undefined,
  userId: number | string,
) {
  return app.inject({
    method: "GET",
    url: conquerFichaUrl(userId),
    headers: token === undefined ? {} : bearer(token),
  });
}

/** La ficha, que tiene que responder 200. */
export async function fetchFicha(
  app: FastifyInstance,
  token: string,
  userId: number,
): Promise<FichaBody> {
  const res = await getFichaRaw(app, token, userId);
  if (res.statusCode !== 200) {
    throw new Error(`fetchFicha: ${res.statusCode} ${res.body}`);
  }
  return res.json<FichaBody>();
}

/** `POST /members/:userId/recortes` crudo. */
export async function postCutRaw(
  app: FastifyInstance,
  token: string | undefined,
  userId: number | string,
  payload: unknown,
) {
  return app.inject({
    method: "POST",
    url: `${conquerFichaUrl(userId)}/recortes`,
    headers: token === undefined ? {} : bearer(token),
    payload: payload as Record<string, unknown>,
  });
}

/** `POST /members/:userId/level-up` crudo. */
export async function postLevelUpRaw(
  app: FastifyInstance,
  token: string | undefined,
  userId: number | string,
  payload: unknown,
) {
  return app.inject({
    method: "POST",
    url: `${conquerFichaUrl(userId)}/level-up`,
    headers: token === undefined ? {} : bearer(token),
    payload: payload as Record<string, unknown>,
  });
}

/** `PUT /members/:userId/steps/:exerciseId/:step` crudo (corrección del coach). */
export async function putFichaStepRaw(
  app: FastifyInstance,
  token: string | undefined,
  userId: number | string,
  exerciseId: number | string,
  step: string,
  payload: unknown,
) {
  return app.inject({
    method: "PUT",
    url: `${conquerFichaUrl(userId)}/steps/${exerciseId}/${step}`,
    headers: token === undefined ? {} : bearer(token),
    payload: payload as Record<string, unknown>,
  });
}

/**
 * Pisa DIRECTO un escalón del alumno (peldaño por código dentro de la escalera
 * del escalón, la del hold para `hold`, calibración y `since_date`). Solo para armar el escenario.
 */
export async function patchConquerStep(
  app: FastifyInstance,
  userId: number,
  exerciseCode: string,
  step: StepKey,
  patch: {
    rungCode?: string;
    /** 201-26: modo viejo fuera de la regla del anexo §1 (dato legado). */
    mode?: "completa" | "negativa" | "hold";
    calibration?: "pendiente" | "resuelta";
    sinceDate?: string | null;
  },
): Promise<void> {
  const [exercise] = await app.db
    .select({
      id: schema.conquerExercises.id,
      ladderId: schema.conquerExercises.ladderId,
      holdLadderId: schema.conquerExercises.holdLadderId,
    })
    .from(schema.conquerExercises)
    .where(
      and(
        tenantWhere(schema.conquerExercises, TEMPLO_CTX),
        eq(schema.conquerExercises.code, exerciseCode),
      ),
    );
  const [member] = await app.db
    .select({ id: schema.conquerMembers.id })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
  if (!exercise || !member) {
    throw new Error(`patchConquerStep: ${exerciseCode} / alumno ${userId}`);
  }
  const set: Partial<typeof schema.conquerSteps.$inferInsert> = {};
  if (patch.rungCode !== undefined) {
    const [rung] = await app.db
      .select({ id: schema.conquerRungs.id })
      .from(schema.conquerRungs)
      .where(
        and(
          tenantWhere(schema.conquerRungs, TEMPLO_CTX),
          // 201-25 DA-3: el hold tiene su propia escalera.
          eq(
            schema.conquerRungs.ladderId,
            step === "hold"
              ? (exercise.holdLadderId ?? exercise.ladderId)
              : exercise.ladderId,
          ),
          eq(schema.conquerRungs.code, patch.rungCode),
        ),
      );
    if (!rung) throw new Error(`patchConquerStep: peldaño ${patch.rungCode}`);
    set.rungId = rung.id;
  }
  if (patch.mode !== undefined) set.mode = patch.mode;
  if (patch.calibration !== undefined) set.calibration = patch.calibration;
  if (patch.sinceDate !== undefined) set.sinceDate = patch.sinceDate;
  await app.db
    .update(schema.conquerSteps)
    .set(set)
    .where(
      and(
        tenantWhere(schema.conquerSteps, TEMPLO_CTX),
        eq(schema.conquerSteps.memberId, member.id),
        eq(schema.conquerSteps.exerciseId, exercise.id),
        eq(schema.conquerSteps.step, step),
      ),
    );
}

// ── Control físico (201-12) ─────────────────────────────────────────

/**
 * Reemplaza la tienda privada (fotos y videos) por un doble: `presignPut` y
 * `presignGet` devuelven `https://r2.test/...`, `head` por defecto es una foto
 * JPG de 1 KB y `remove` no hace nada (Fase 202: pasarle un `vi.fn()` en
 * `overrides` para afirmar el borrado).
 * Cualquier operación se pisa con `overrides`. Devuelve el spy del resolver
 * (`mockRestore()` o `vi.restoreAllMocks()` en `afterEach`).
 */
export function mockPrivateMedia(overrides: Partial<PrivateMediaStore> = {}) {
  const fakeStore: PrivateMediaStore = {
    presignPut: async (key) => `https://r2.test/put/${key}`,
    presignGet: async (key) => `https://r2.test/get/${key}`,
    head: async () => ({ contentLength: 1024, contentType: "image/jpeg" }),
    remove: async () => undefined,
    ...overrides,
  };
  return vi.spyOn(privateMediaResolver, "resolve").mockReturnValue(fakeStore);
}

export interface VideoStoreSpies {
  head: ReturnType<typeof vi.fn<PrivateMediaStore["head"]>>;
  presignGet: ReturnType<typeof vi.fn<PrivateMediaStore["presignGet"]>>;
  presignPut: ReturnType<typeof vi.fn<PrivateMediaStore["presignPut"]>>;
  remove: ReturnType<typeof vi.fn<PrivateMediaStore["remove"]>>;
}

/**
 * Tienda de videos de mentira con espías (Fase 202, antes local a
 * `corrections-admin.test.ts`): por defecto el objeto existe (MP4 de 5 MB), las
 * URLs firmadas son `https://r2.test/get|put/{clave}` y `remove` no falla.
 * `overrides` pisa `head`, `remove` y `presignPut` (p. ej. `head: async () => null`).
 */
export function mockVideoStore(
  overrides: {
    head?: PrivateMediaStore["head"];
    remove?: PrivateMediaStore["remove"];
    presignPut?: PrivateMediaStore["presignPut"];
  } = {},
): VideoStoreSpies {
  const head = vi.fn<PrivateMediaStore["head"]>(
    overrides.head ??
      (async () => ({
        contentLength: 5 * 1024 * 1024,
        contentType: "video/mp4",
      })),
  );
  const presignGet = vi.fn<PrivateMediaStore["presignGet"]>(
    async (key) => `https://r2.test/get/${key}`,
  );
  const presignPut = vi.fn<PrivateMediaStore["presignPut"]>(
    overrides.presignPut ?? (async (key) => `https://r2.test/put/${key}`),
  );
  const remove = vi.fn<PrivateMediaStore["remove"]>(
    overrides.remove ?? (async () => undefined),
  );
  mockPrivateMedia({ head, presignGet, presignPut, remove });
  return { head, presignGet, presignPut, remove };
}

// ── Correcciones con video (202-03) ─────────────────────────────────

export const CONQUER_CORRECTIONS_URL = "/api/members/conquer/corrections";

type CorrectionOverrides = Partial<
  Omit<
    typeof schema.conquerCorrections.$inferInsert,
    "id" | "tenantId" | "userId"
  >
>;

/**
 * Inserta DIRECTO una corrección del alumno. Por defecto: un escalón E1 del
 * plan (el primer escalón que tiene el alumno, con su peldaño actual),
 * `video_seconds` 20, clave propia `alumno-{uuid}.mp4` y `status` pendiente.
 * Los overrides pisan cualquier columna (`status`, `replyText`, `replySeenAt`,
 * `videoKey: null`, `exerciseId` + `step`, `comboKey`...). Si el override trae
 * `comboKey`, la corrección va sin escalón ni peldaño.
 */
export async function insertConquerCorrection(
  app: FastifyInstance,
  userId: number,
  overrides: CorrectionOverrides = {},
): Promise<number> {
  const objetivo =
    overrides.comboKey !== undefined && overrides.comboKey !== null
      ? { exerciseId: null, step: null, rungId: null }
      : await primerEscalonDelAlumno(app, userId);
  const [row] = await app.db
    .insert(schema.conquerCorrections)
    .values(
      tenantValues(TEMPLO_CTX, {
        ...objetivo,
        videoSeconds: 20,
        videoKey: `private/conquer-corrections/${TEMPLO_CTX.tenantId}/${userId}/alumno-${randomUUID()}.mp4`,
        status: "pendiente" as const,
        ...overrides,
        userId,
      }),
    )
    .$returningId();
  return row.id;
}

async function primerEscalonDelAlumno(
  app: FastifyInstance,
  userId: number,
): Promise<{ exerciseId: number; step: StepKey; rungId: number }> {
  const [row] = await app.db
    .select({
      exerciseId: schema.conquerSteps.exerciseId,
      step: schema.conquerSteps.step,
      rungId: schema.conquerSteps.rungId,
    })
    .from(schema.conquerSteps)
    .innerJoin(
      schema.conquerMembers,
      eq(schema.conquerMembers.id, schema.conquerSteps.memberId),
    )
    .where(
      and(
        tenantWhere(schema.conquerSteps, TEMPLO_CTX),
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
        eq(schema.conquerSteps.step, "e1"),
      ),
    )
    .orderBy(asc(schema.conquerSteps.id))
    .limit(1);
  if (!row)
    throw new Error(
      `insertConquerCorrection: el alumno ${userId} no tiene escalones`,
    );
  return row;
}

/** `POST /corrections` crudo: el test decide qué afirmar (201 / 4xx). */
export async function postCorrectionRaw(
  app: FastifyInstance,
  token: string,
  body: unknown,
) {
  return app.inject({
    method: "POST",
    url: CONQUER_CORRECTIONS_URL,
    headers: { authorization: `Bearer ${token}` },
    payload: body as Record<string, unknown>,
  });
}
