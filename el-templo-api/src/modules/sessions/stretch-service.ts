/**
 * Servicio de la oferta de estiramiento post-clase (fase 213).
 *
 * Decide si un socio tiene hoy una rutina de estiramiento para ofrecer, la arma
 * con la regla pura (`stretch-selection.ts`) y la congela en `stretch_offers`.
 *
 * Decisiones que implementa:
 * - D-01: la rutina sale de la lista curada (`stretch_catalog`) y la regla; el
 *   video es opcional (se resuelve por nombre, sin exigirlo).
 * - D-05: elegibilidad por asistencia registrada (check-in) a una clase General
 *   no especial con horario, y la clase ya terminada en la hora de la sede.
 * - D-06: solo ofrecen los dias `regular`, `combos` y `tecnica` (ROM no).
 * - D-09: dos clases el mismo dia = una sola oferta (se toma la de fin mas
 *   temprano).
 * - D-13: el servicio vive en el plugin de sesiones (modulo `templo-training`).
 * - D-15: la fila de `stretch_offers` ES la oferta; "el primero que llegue" (la
 *   card o el job del push) la crea y la otra parte la lee. El INSERT es un
 *   upsert no-op sobre `uq_stretch_offers_tenant_user_date`.
 * - D-16: el grupo del experimento (`arm`) se fija al crear la fila.
 *
 * Solo LEE `completed_sessions` (el espejo presencial) para el nivel del
 * socio. Toda consulta lleva `tenantWhere`; el reloj entra por parametro `now`.
 */
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type {
  StretchFamily,
  StretchOfferExercise,
  StretchOfferRow,
} from "../../db/schema/stretch";
import { isGenericClassActivity } from "../scheduling/derived-label";
import { resolveBranchTimezone } from "../aura/daily-award";
import { buildClassDateTime, todayInTz } from "../shared/date-utils";
import { buildVideoResolver } from "../shared/exercise-video-fallback";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { DAY_NAME_TO_NUMBER } from "../shared/training-constants";
import { dateToDayName, dateToWeekNumber } from "../shared/week-dates";
import { buildDayIdCandidates, effectiveLevelForDay } from "./session-view";
import {
  DIAS_SEMANA,
  STRETCH_SECONDS_PER_SIDE,
  STRETCH_TRANSITION_SECONDS,
  modoOfreceEstiramiento,
  seleccionarEstiramientos,
  type DiaSemana,
  type EntradaCatalogo,
  type PrescritoMovilidad,
} from "./stretch-selection";
import { stretchArm } from "./stretch-timing";
import type { ExerciseLevel } from "./types";

type Db = MySql2Database<typeof schema>;

/** Asistencia que habilita la oferta del dia. */
export interface EligibleAttendance {
  attendanceId: number;
  userId: number;
  branchId: number;
  /** Zona IANA de la sede de la clase. */
  timezone: string;
  /** Dia local de la clase (YYYY-MM-DD). */
  sessionDate: string;
  /** Instante UTC del fin de la clase. */
  classEndAt: Date;
}

export interface StretchTodayExercise {
  exerciseId: number;
  name: string;
  family: StretchFamily;
  sides: number;
  secondsPerSide: number;
  transitionSeconds: number;
  videoUrl: string | null;
}

export interface StretchTodayView {
  status: "none" | "available" | "done";
  localDate: string;
  offerId: number | null;
  minutes: number | null;
  plannedSeconds: number | null;
  exercises: StretchTodayExercise[];
  completedAt: string | null;
  auraAwarded: boolean;
}

interface BuiltRoutine {
  sourceDayId: string;
  exercises: StretchOfferExercise[];
  plannedSeconds: number;
}

function esDiaSemana(dayName: string): dayName is DiaSemana {
  return (DIAS_SEMANA as readonly string[]).includes(dayName);
}

export class StretchService {
  constructor(
    private readonly db: Db,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** Zona y dia local de hoy del socio (por su sede), o null si no existe. */
  async resolveToday(
    ctx: TenantContext,
    userId: number,
    now: Date,
  ): Promise<{ timezone: string; localDate: string } | null> {
    const [user] = await this.db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
      .limit(1);
    if (!user) return null;
    const timezone = await resolveBranchTimezone(this.db, ctx, user.branchId);
    return { timezone, localDate: todayInTz(timezone, now) };
  }

  /**
   * Asistencia de hoy a una clase General no especial ya terminada. Con mas de
   * una devuelve la de fin mas temprano (D-09). Wellhub sin horario queda
   * afuera por `schedule_id` (SPEC 2.2).
   */
  async findEligibleAttendance(
    ctx: TenantContext,
    userId: number,
    localDate: string,
    now: Date,
  ): Promise<EligibleAttendance | null> {
    const rows = await this.db
      .select({
        attendanceId: schema.attendance.id,
        branchId: schema.attendance.branchId,
        sessionDate: schema.attendance.sessionDate,
        endTime: schema.schedules.endTime,
        activityName: schema.activities.name,
        isSpecial: schema.activities.isSpecial,
        timezone: schema.branches.timezone,
      })
      .from(schema.attendance)
      .innerJoin(
        schema.schedules,
        and(
          eq(schema.attendance.scheduleId, schema.schedules.id),
          tenantWhere(schema.schedules, ctx),
        ),
      )
      .innerJoin(
        schema.activities,
        and(
          eq(schema.schedules.activityId, schema.activities.id),
          tenantWhere(schema.activities, ctx),
        ),
      )
      .innerJoin(
        schema.branches,
        and(
          eq(schema.attendance.branchId, schema.branches.id),
          tenantWhere(schema.branches, ctx),
        ),
      )
      .where(
        and(
          tenantWhere(schema.attendance, ctx),
          eq(schema.attendance.memberId, userId),
          eq(schema.attendance.sessionDate, localDate),
          isNotNull(schema.attendance.scheduleId),
        ),
      );

    let best: EligibleAttendance | null = null;
    for (const row of rows) {
      if (!isGenericClassActivity(row.activityName, row.isSpecial)) continue;
      const classEndAt = buildClassDateTime(
        row.sessionDate,
        row.endTime,
        row.timezone,
      );
      if (classEndAt.getTime() > now.getTime()) continue;
      if (best === null || classEndAt.getTime() < best.classEndAt.getTime()) {
        best = {
          attendanceId: row.attendanceId,
          userId,
          branchId: row.branchId,
          timezone: row.timezone,
          sessionDate: row.sessionDate,
          classEndAt,
        };
      }
    }
    return best;
  }

  /**
   * Arma la rutina del dia de la asistencia, o null si no hay oferta (domingo,
   * sin sesion aprobada, dia ROM, catalogo vacio).
   *
   * La resolucion de la sesion replica los pasos 4-8 de `GET /sessions/daily`
   * (`routes.ts`) con la vista templo. Es una copia deliberada de ~15 lineas:
   * refactorizar `/daily` queda fuera de alcance de la fase 213.
   */
  async buildRoutine(
    ctx: TenantContext,
    userId: number,
    att: EligibleAttendance,
  ): Promise<BuiltRoutine | null> {
    const [user] = await this.db
      .select({ level: schema.users.level })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
      .limit(1);
    if (!user) return null;

    // Nivel con el que entreno ese dia: el del espejo presencial si existe
    // (SPEC 2.3, nivel cambiado despues de la clase), si no el actual.
    const [mirror] = await this.db
      .select({ sessionLevel: schema.completedSessions.sessionLevel })
      .from(schema.completedSessions)
      .where(
        and(
          tenantWhere(schema.completedSessions, ctx),
          eq(schema.completedSessions.userId, userId),
          eq(schema.completedSessions.dayId, `presencial-${att.sessionDate}`),
        ),
      )
      .limit(1);
    const memberLevel = (mirror?.sessionLevel ?? user.level) as ExerciseLevel;

    const week = dateToWeekNumber(att.sessionDate);
    const dayName = dateToDayName(att.sessionDate);
    if (dayName === "domingo" || !esDiaSemana(dayName)) return null;

    let effectiveLevel: string = memberLevel;
    const [dayModeRow] = await this.db
      .select({ sessionMode: schema.dayModes.sessionMode })
      .from(schema.dayModes)
      .where(
        and(
          tenantWhere(schema.dayModes, ctx),
          eq(schema.dayModes.dayOfWeek, DAY_NAME_TO_NUMBER[dayName]),
        ),
      )
      .limit(1);
    if (dayModeRow?.sessionMode === "rom") {
      effectiveLevel = effectiveLevelForDay(memberLevel, true);
    }

    const candidates = buildDayIdCandidates(
      true,
      null,
      week,
      dayName,
      effectiveLevel,
    );
    const found = await this.db
      .select({
        id: schema.sessions.id,
        dayId: schema.sessions.dayId,
        sessionMode: schema.sessions.sessionMode,
      })
      .from(schema.sessions)
      .where(
        and(
          tenantWhere(schema.sessions, ctx),
          inArray(schema.sessions.dayId, candidates),
          eq(schema.sessions.status, "approved"),
          isNull(schema.sessions.goalPlanType),
        ),
      );
    const session = candidates
      .map((id) => found.find((s) => s.dayId === id))
      .find((s) => s !== undefined);
    if (!session) return null;

    // D-06: los dias ROM no ofrecen estiramiento.
    if (!modoOfreceEstiramiento(session.sessionMode)) return null;

    const blocks = await this.db
      .select({
        id: schema.sessionBlocks.id,
        role: schema.sessionBlocks.role,
        route: schema.sessionBlocks.route,
      })
      .from(schema.sessionBlocks)
      .where(
        and(
          tenantWhere(schema.sessionBlocks, ctx),
          eq(schema.sessionBlocks.sessionId, session.id),
        ),
      )
      .orderBy(asc(schema.sessionBlocks.sortOrder));

    const rutas = blocks
      .filter((b) => b.role !== "INITIUM")
      .map((b) => b.route);

    const prescritos: PrescritoMovilidad[] = [];
    if (blocks.length > 0) {
      const rows = await this.db
        .select({
          blockId: schema.sessionPrescriptions.blockId,
          exerciseName: schema.sessionPrescriptions.exerciseName,
          exerciseType: schema.sessionPrescriptions.exerciseType,
          mobilityRelated: schema.exercises.mobilityRelated,
        })
        .from(schema.sessionPrescriptions)
        .leftJoin(
          schema.exercises,
          and(
            eq(schema.sessionPrescriptions.exerciseId, schema.exercises.id),
            tenantWhere(schema.exercises, ctx),
          ),
        )
        .where(
          and(
            tenantWhere(schema.sessionPrescriptions, ctx),
            inArray(
              schema.sessionPrescriptions.blockId,
              blocks.map((b) => b.id),
            ),
          ),
        )
        .orderBy(asc(schema.sessionPrescriptions.sortOrder));

      // Orden de bloque, luego sort_order dentro del bloque (el ORDER BY ya
      // viene por sort_order; el recorrido por bloque lo agrupa).
      for (const block of blocks) {
        const esStretching = block.role === "STRETCHING";
        for (const row of rows) {
          if (row.blockId !== block.id) continue;
          // En un bloque STRETCHING la movilidad viene como `main` (SPEC P-3).
          if (row.exerciseType === "mobility" || esStretching) {
            prescritos.push({
              nombre: row.exerciseName,
              familiaBase: row.mobilityRelated,
            });
          }
        }
      }
    }

    const catalogRows = await this.db
      .select({
        exerciseId: schema.stretchCatalog.exerciseId,
        exerciseName: schema.stretchCatalog.exerciseName,
        family: schema.stretchCatalog.family,
        sortOrder: schema.stretchCatalog.sortOrder,
        sides: schema.stretchCatalog.sides,
        baseOrder: schema.stretchCatalog.baseOrder,
      })
      .from(schema.stretchCatalog)
      .where(
        and(
          tenantWhere(schema.stretchCatalog, ctx),
          eq(schema.stretchCatalog.isActive, true),
        ),
      )
      .orderBy(
        asc(schema.stretchCatalog.family),
        asc(schema.stretchCatalog.sortOrder),
      );
    if (catalogRows.length === 0) {
      this.log.warn(
        { tenantId: ctx.tenantId },
        "stretch: catalogo activo vacio, sin oferta",
      );
      return null;
    }
    const catalogo: EntradaCatalogo[] = catalogRows.map((c) => ({
      exerciseId: c.exerciseId,
      nombre: c.exerciseName,
      familia: c.family,
      orden: c.sortOrder,
      lados: c.sides === 1 ? 1 : 2,
      ordenBase: c.baseOrder,
    }));

    const resultado = seleccionarEstiramientos({
      prescritos,
      rutas,
      catalogo,
      semana: week,
      dia: dayName,
    });
    if (resultado.estiramientos.length === 0) return null;

    return {
      sourceDayId: session.dayId,
      exercises: resultado.estiramientos.map((e) => ({
        exerciseId: e.exerciseId,
        name: e.nombre,
        family: e.familia,
        sides: e.lados,
      })),
      plannedSeconds: resultado.duracionSegundos,
    };
  }

  /** Fila de la oferta del socio para un dia local, si existe. */
  private async readOffer(
    ctx: TenantContext,
    userId: number,
    localDate: string,
  ): Promise<StretchOfferRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.stretchOffers)
      .where(
        and(
          tenantWhere(schema.stretchOffers, ctx),
          eq(schema.stretchOffers.userId, userId),
          eq(schema.stretchOffers.localDate, localDate),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Devuelve la oferta del dia de la asistencia, creandola si no existe (D-15).
   * Si ya existe la devuelve tal cual: la rutina queda congelada. Sin rutina
   * posible devuelve null y no crea fila.
   */
  async ensureOffer(
    ctx: TenantContext,
    att: EligibleAttendance,
    _now: Date,
  ): Promise<StretchOfferRow | null> {
    const existing = await this.readOffer(ctx, att.userId, att.sessionDate);
    if (existing) return existing;

    const routine = await this.buildRoutine(ctx, att.userId, att);
    if (!routine) return null;

    const arm = stretchArm(att.userId);
    await this.db
      .insert(schema.stretchOffers)
      .values(
        tenantValues(ctx, {
          userId: att.userId,
          localDate: att.sessionDate,
          attendanceId: att.attendanceId,
          branchId: att.branchId,
          sourceDayId: routine.sourceDayId,
          classEndAt: att.classEndAt,
          exercises: routine.exercises,
          plannedSeconds: routine.plannedSeconds,
          arm,
          pushDecision: arm === "control" ? "control" : null,
        }),
      )
      // No-op: si el job y la card llegan a la vez gana el primero y la fila
      // es identica (D-15).
      .onDuplicateKeyUpdate({ set: { id: sql`id` } });

    return this.readOffer(ctx, att.userId, att.sessionDate);
  }

  /** Vista de hoy para la card y el player. */
  async getToday(
    ctx: TenantContext,
    userId: number,
    now: Date,
  ): Promise<StretchTodayView> {
    const today = await this.resolveToday(ctx, userId, now);
    if (!today) return this.noneView("");

    // Una oferta de otro dia nunca se devuelve (D-12): se busca por el dia
    // local de hoy.
    let offer = await this.readOffer(ctx, userId, today.localDate);
    if (!offer) {
      const att = await this.findEligibleAttendance(
        ctx,
        userId,
        today.localDate,
        now,
      );
      if (att) offer = await this.ensureOffer(ctx, att, now);
    }
    if (!offer) return this.noneView(today.localDate);

    return this.toView(ctx, offer);
  }

  private noneView(localDate: string): StretchTodayView {
    return {
      status: "none",
      localDate,
      offerId: null,
      minutes: null,
      plannedSeconds: null,
      exercises: [],
      completedAt: null,
      auraAwarded: false,
    };
  }

  private async toView(
    ctx: TenantContext,
    offer: StretchOfferRow,
  ): Promise<StretchTodayView> {
    const ids = offer.exercises.map((e) => e.exerciseId);
    const videoRows =
      ids.length > 0
        ? await this.db
            .select({
              exerciseId: schema.exercises.id,
              videoUrl: schema.exercises.videoUrl,
            })
            .from(schema.exercises)
            .where(
              and(
                tenantWhere(schema.exercises, ctx),
                inArray(schema.exercises.id, ids),
              ),
            )
        : [];
    const resolveVideo = await buildVideoResolver(this.db, videoRows);
    const ownVideo = new Map(videoRows.map((r) => [r.exerciseId, r.videoUrl]));

    return {
      status: offer.completedAt ? "done" : "available",
      localDate: offer.localDate,
      offerId: offer.id,
      minutes: Math.round(offer.plannedSeconds / 60),
      plannedSeconds: offer.plannedSeconds,
      exercises: offer.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        name: e.name,
        family: e.family,
        sides: e.sides,
        secondsPerSide: STRETCH_SECONDS_PER_SIDE,
        transitionSeconds: STRETCH_TRANSITION_SECONDS,
        videoUrl: resolveVideo(
          e.exerciseId,
          ownVideo.get(e.exerciseId) ?? null,
        ),
      })),
      completedAt: offer.completedAt ? offer.completedAt.toISOString() : null,
      auraAwarded: offer.auraAwarded,
    };
  }
}
