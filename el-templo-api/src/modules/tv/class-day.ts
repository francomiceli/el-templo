/**
 * "Que clase es la de hoy" para una sede (fase 164).
 *
 * El televisor NO calcula nada de esto: no puede confiar en su reloj de pared,
 * su Chromium puede venir con ICU reducida (sin `Intl` por timezone) y no tiene
 * test runner. La fecha, la semana SPOM, el modo del dia y los niveles con
 * sesion aprobada se resuelven aca, contra la TZ de la SEDE (D-14) — Barcelona
 * y Mar del Plata cambian de dia en instantes distintos.
 *
 * D-09 (regla dura): la ausencia de sesion aprobada NO es un error. Es un
 * estado normal que se devuelve como `approved: false`; la funcion nunca lanza
 * por eso. El TV cuelga de una pared publica: los socios jamas ven la cocina
 * interna del gimnasio.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type { FormatParams } from "../admin/format-params";
import { todayInTz } from "../shared/date-utils";
import { DAY_NAME_TO_NUMBER, parseDayId } from "../shared/training-constants";
import { dateToDayName, dateToWeekNumber } from "../shared/week-dates";
import type { TvClassMode } from "./types";

/**
 * Niveles de un dia habil, en orden canonico (kairos-first, fase 129).
 * `omega`/`spartan` no se planifican por dia, asi que no entran al selector.
 */
export const REGULAR_LEVEL_ORDER = ["kairos", "alfa", "delta", "sigma"];

/**
 * Niveles de un dia ROM (D-23): solo dos tiers, que el TV rotula BASICO
 * (alfa) y AVANZADO (delta). El selector alfa/delta/sigma/kairos no aplica.
 */
export const ROM_LEVEL_ORDER = ["alfa", "delta"];

/** Una prescripcion (ejercicio pautado) dentro de un bloque. */
export interface ClassDayPrescription {
  id: number;
  exerciseName: string;
  contraction: string;
  reps: number;
  repsMax: number | null;
  seconds: number;
  secondsMax: number | null;
  increment: number | null;
  notes: string | null;
  exerciseType: string;
  weighted: boolean;
  sortOrder: number;
  /** Key de R2 tal cual sale de la DB — `assembleVideoUrl` la prefija al servir. */
  videoKey: string | null;
}

/** Un bloque de la sesion, con sus prescripciones ya agrupadas. */
export interface ClassDayBlock {
  id: number;
  role: string;
  route: string;
  intensity: number;
  formatName: string;
  formatParams: FormatParams | null;
  customTitle: string | null;
  sortOrder: number;
  prescriptions: ClassDayPrescription[];
}

/** Una sesion (un nivel) del dia. */
export interface ClassDaySession {
  id: number;
  dayId: string;
  memberLevel: string;
  blocks: ClassDayBlock[];
}

/** Resultado de `resolveClassDay`. */
export interface ClassDay {
  /** "YYYY-MM-DD" en la TZ de la sede. */
  date: string;
  week: number;
  /** "lunes".."sabado" (o "domingo", que nunca tiene sesiones). */
  dayName: string;
  mode: TvClassMode;
  /** false => reposo silencioso (D-09), nunca un error visible. */
  approved: boolean;
  /** Niveles con sesion aprobada, en orden canonico. */
  levels: string[];
  sessions: ClassDaySession[];
}

export interface ClassDayBranch {
  id: number;
  timezone: string;
}

function emptyDay(
  date: string,
  week: number,
  dayName: string,
  mode: TvClassMode,
): ClassDay {
  return {
    date,
    week,
    dayName,
    mode,
    approved: false,
    levels: [],
    sessions: [],
  };
}

/**
 * Resolver la sesion del dia para una sede.
 *
 * `now` es inyectable para poder testear los bordes de dia entre TZs sin
 * depender del reloj de la maquina que corre los tests.
 */
export async function resolveClassDay(
  db: MySql2Database<typeof schema>,
  branch: ClassDayBranch,
  now?: Date,
): Promise<ClassDay> {
  const date = todayInTz(branch.timezone, now);
  const dayName = dateToDayName(date);
  const week = dateToWeekNumber(date);

  // Domingo no es dia de entrenamiento: no hay nada que buscar en la DB.
  if (dayName === "domingo") {
    return emptyDay(date, week, dayName, "regular");
  }

  // 1. Modo del dia. El sabado viene seedeado como ROM desde la migracion 0080
  //    (D-23), pero se lee de `day_modes` y no se asume por el nombre del dia.
  const dayNumber = DAY_NAME_TO_NUMBER[dayName];
  let mode: TvClassMode = "regular";
  if (dayNumber) {
    const [dayModeRow] = await db
      .select({ sessionMode: schema.dayModes.sessionMode })
      .from(schema.dayModes)
      .where(eq(schema.dayModes.dayOfWeek, dayNumber));
    if (dayModeRow?.sessionMode === "rom") mode = "rom";
  }

  // 2. Sesiones aprobadas de la plani REGULAR (D-14): `goal_plan_type IS NULL`.
  //    Los goal plans son curados por socio, no son "la clase de la sede".
  const sessionRows = await db
    .select({
      id: schema.sessions.id,
      dayId: schema.sessions.dayId,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.week, week),
        eq(schema.sessions.day, dayName),
        eq(schema.sessions.status, "approved"),
        isNull(schema.sessions.goalPlanType),
      ),
    );

  if (sessionRows.length === 0) {
    return emptyDay(date, week, dayName, mode);
  }

  // 3. Bloques de TODAS las sesiones en una query (sin N+1).
  const sessionIds = sessionRows.map((s) => s.id);
  const blockRows = await db
    .select({
      id: schema.sessionBlocks.id,
      sessionId: schema.sessionBlocks.sessionId,
      role: schema.sessionBlocks.role,
      route: schema.sessionBlocks.route,
      intensity: schema.sessionBlocks.intensity,
      formatName: schema.sessionBlocks.formatName,
      formatParams: schema.sessionBlocks.formatParams,
      customTitle: schema.sessionBlocks.customTitle,
      sortOrder: schema.sessionBlocks.sortOrder,
    })
    .from(schema.sessionBlocks)
    .where(inArray(schema.sessionBlocks.sessionId, sessionIds))
    .orderBy(asc(schema.sessionBlocks.sortOrder));

  // 4. Prescripciones de TODOS los bloques en una query, con el video del
  //    ejercicio. TODAS las columnas del select van calificadas
  //    (`schema.tabla.columna`): sin calificar, drizzle rompe el join.
  const blockIds = blockRows.map((b) => b.id);
  const prescriptionRows =
    blockIds.length > 0
      ? await db
          .select({
            id: schema.sessionPrescriptions.id,
            blockId: schema.sessionPrescriptions.blockId,
            exerciseName: schema.sessionPrescriptions.exerciseName,
            contraction: schema.sessionPrescriptions.contraction,
            reps: schema.sessionPrescriptions.reps,
            repsMax: schema.sessionPrescriptions.repsMax,
            seconds: schema.sessionPrescriptions.seconds,
            secondsMax: schema.sessionPrescriptions.secondsMax,
            increment: schema.sessionPrescriptions.increment,
            notes: schema.sessionPrescriptions.notes,
            exerciseType: schema.sessionPrescriptions.exerciseType,
            weighted: schema.sessionPrescriptions.weighted,
            sortOrder: schema.sessionPrescriptions.sortOrder,
            videoKey: schema.exercises.videoUrl,
          })
          .from(schema.sessionPrescriptions)
          .leftJoin(
            schema.exercises,
            eq(schema.sessionPrescriptions.exerciseId, schema.exercises.id),
          )
          .where(inArray(schema.sessionPrescriptions.blockId, blockIds))
          .orderBy(asc(schema.sessionPrescriptions.sortOrder))
      : [];

  // 5. Agrupar en Maps (una pasada por tabla).
  const prescriptionsByBlock = new Map<number, ClassDayPrescription[]>();
  for (const p of prescriptionRows) {
    const list = prescriptionsByBlock.get(p.blockId) ?? [];
    list.push({
      id: p.id,
      exerciseName: p.exerciseName,
      contraction: p.contraction,
      reps: p.reps,
      repsMax: p.repsMax,
      seconds: p.seconds,
      secondsMax: p.secondsMax,
      increment: p.increment,
      notes: p.notes,
      exerciseType: p.exerciseType,
      weighted: p.weighted,
      sortOrder: p.sortOrder,
      videoKey: p.videoKey,
    });
    prescriptionsByBlock.set(p.blockId, list);
  }

  const blocksBySession = new Map<number, ClassDayBlock[]>();
  for (const b of blockRows) {
    const list = blocksBySession.get(b.sessionId) ?? [];
    list.push({
      id: b.id,
      role: b.role,
      route: b.route,
      intensity: b.intensity,
      formatName: b.formatName,
      // `format_params` es una columna JSON escrita por el generador/staff:
      // `toTimerSpec` la sanea, no se valida de nuevo aca.
      formatParams: (b.formatParams as FormatParams | null) ?? null,
      customTitle: b.customTitle,
      sortOrder: b.sortOrder,
      prescriptions: prescriptionsByBlock.get(b.id) ?? [],
    });
    blocksBySession.set(b.sessionId, list);
  }

  const sessions: ClassDaySession[] = sessionRows.map((s) => ({
    id: s.id,
    dayId: s.dayId,
    // El nivel no es una columna: sale del dayId (W{n}-{dia}-{nivel}).
    memberLevel: parseDayId(s.dayId).level,
    blocks: blocksBySession.get(s.id) ?? [],
  }));

  // 6. Niveles disponibles, en orden canonico. En ROM solo existen dos tiers.
  //    Cualquier nivel presente FUERA del orden canonico (dato viejo, o un
  //    omega colado en un sabado) se agrega al final en vez de descartarse:
  //    `levels` no puede quedar vacio mientras `approved` sea true, o el clamp
  //    del servicio se quedaria sin nivel al que caer y el TV mostraria una
  //    lista en blanco con una sesion aprobada disponible.
  const order = mode === "rom" ? ROM_LEVEL_ORDER : REGULAR_LEVEL_ORDER;
  const present = new Set(sessions.map((s) => s.memberLevel));
  const levels = [
    ...order.filter((lvl) => present.has(lvl)),
    ...[...present].filter((lvl) => !order.includes(lvl)),
  ];

  return {
    date,
    week,
    dayName,
    mode,
    // Si hubo filas aprobadas hay clase, aunque el nivel quede fuera del orden
    // canonico (dato viejo): el roster se arma igual.
    approved: sessions.length > 0,
    levels,
    sessions,
  };
}
