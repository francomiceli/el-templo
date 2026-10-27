// Módulo: wellhub — datos de la card "Wellhub" de la ficha y acceso a la app
// (Fase 204: D-02, D-17, D-20, D-26).
//
// - `getCard`: agregados al vuelo sobre `attendance` / `bookings` /
//   `wellhub_bookings` (sin columnas cacheadas: lo simple primero, D-20 deja
//   "última visita / sedes visitadas" a criterio del planner).
// - `sendAppAccess`: resetea la contraseña a la temporal (`MEMBER_TEMP_PASSWORD`)
//   reusando `MemberService.resetMemberPassword`. El mail lo manda la ruta,
//   best-effort (las invitaciones de la 194 son del pipeline de leads y no
//   encajan, D-26).
// - `isPureWellhub`: regla única de "ficha Wellhub pura" (estado `wellhub`, sin
//   suscripciones ni pagos). La usa `canMerge` de la card y, del lado servidor,
//   la unión de fichas del plan 10.
//
// AISLAMIENTO: toda query lleva el gimnasio (`tenantWhere`, también en cada
// tabla unida).
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type { TxHandle } from "../finance/balance-service";
import { auditLog } from "../shared/audit-log";
import { todayInTz } from "../shared/date-utils";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  isWellhubAttendanceSql,
  isWellhubBookingSql,
} from "../shared/wellhub-sources";
import {
  MemberService,
  softDeleteMemberTx,
  wellhubLabelVisibleSql,
} from "../members/service";

type DbInstance = MySql2Database<typeof schema>;
/** Pool o handle de transacción (mismo patrón que `referrals/invitation-rules`). */
type Executor = DbInstance | TxHandle;

/** Estados de una reserva que ocupan lugar: la unión no las pisa. */
const LIVE_BOOKING_STATUSES = [
  "reservado",
  "qr_escaneado",
  "confirmado",
  "lista_espera",
] as const;

/** Cuántas reservas Wellhub recientes trae la card (D-20). */
const RECENT_BOOKINGS_LIMIT = 10;

export interface WellhubBookingSummary {
  bookingId: number;
  date: string;
  startTime: string;
  activityName: string;
  branchName: string;
}

export interface WellhubRecentBooking extends WellhubBookingSummary {
  status: string;
}

export interface WellhubCard {
  gympassId: string;
  /** ISO timestamp de la traza Wellhub más vieja (reserva o visita), o null. */
  linkedSince: string | null;
  /** YYYY-MM-DD de la última visita Wellhub (validada o a mano), o null. */
  lastVisitDate: string | null;
  visitsThisMonth: number;
  visitsTotal: number;
  manualVisitsTotal: number;
  branchesVisited: string[];
  nextWellhubBooking: WellhubBookingSummary | null;
  recentWellhubBookings: WellhubRecentBooking[];
  showLabel: boolean;
  canConvert: boolean;
  canMerge: boolean;
  hasLoggedIn: boolean;
}

export type SendAppAccessResult =
  | { ok: true; email: string; firstName: string; hadLoggedIn: boolean }
  | {
      ok: false;
      reason:
        | "not_found"
        | "not_member"
        | "deleted"
        | "not_wellhub"
        | "no_email";
    };

export interface WellhubMergeMoved {
  bookings: number;
  attendance: number;
  wellhubBookings: number;
  notes: number;
}

export type WellhubMergeResult =
  | { ok: true; moved: WellhubMergeMoved }
  | { ok: false; status: 400 | 404 | 409; message: string };

/**
 * Rechazo de negocio de la unión. Se tira DENTRO de la transacción para que
 * haga rollback y se atrapa afuera para devolver `{ ok: false }`.
 */
class WellhubMergeError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "WellhubMergeError";
  }
}

/** Filas afectadas de un UPDATE/DELETE de drizzle-mysql2 (`[ResultSetHeader, ...]`). */
function affectedRows(result: unknown): number {
  if (Array.isArray(result) && result.length > 0) {
    const header: unknown = result[0];
    if (typeof header === "object" && header !== null && "affectedRows" in header) {
      return Number((header as { affectedRows: unknown }).affectedRows);
    }
  }
  return 0;
}

/** Timestamp de MySQL (Date o string) a ISO; null si no hay valor parseable. */
function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * ¿Es una ficha Wellhub "pura"? Estado `wellhub`, sin suscripciones, sin
 * movimientos financieros y sin saldos. Nunca se fusionan dos fichas con
 * historia propia (D-21). `executor` es el db o la tx del llamador.
 */
export async function isPureWellhub(
  ctx: TenantContext,
  userId: number,
  executor: Executor,
): Promise<boolean> {
  const [user] = await executor
    .select({ status: schema.users.status })
    .from(schema.users)
    .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
    .limit(1);
  if (!user || user.status !== "wellhub") return false;

  const [subscription] = await executor
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(
      and(
        tenantWhere(schema.subscriptions, ctx),
        eq(schema.subscriptions.userId, userId),
      ),
    )
    .limit(1);
  if (subscription) return false;

  const [transaction] = await executor
    .select({ id: schema.financialTransactions.id })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, ctx),
        eq(schema.financialTransactions.memberId, userId),
      ),
    )
    .limit(1);
  if (transaction) return false;

  const [balance] = await executor
    .select({ id: schema.balances.id })
    .from(schema.balances)
    .where(
      and(
        tenantWhere(schema.balances, ctx),
        eq(schema.balances.memberId, userId),
      ),
    )
    .limit(1);
  return !balance;
}

export class MemberWellhubService {
  private memberService: MemberService;

  constructor(
    private db: DbInstance,
    private log: FastifyBaseLogger,
  ) {
    this.memberService = new MemberService(db, log);
  }

  /** ¿Alguna vez abrió la app? (`member_logins` registra cada /auth/me). */
  private async hasLoggedIn(
    ctx: TenantContext,
    userId: number,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.memberLogins.id })
      .from(schema.memberLogins)
      .where(
        and(
          tenantWhere(schema.memberLogins, ctx),
          eq(schema.memberLogins.userId, userId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /**
   * Reservas Wellhub del socio con clase, actividad y sede. Con `upcomingFrom`
   * trae la próxima reservada (estado `reservado`, desde esa fecha); con
   * `limit`, las más recientes por fecha, de cualquier estado.
   */
  private async listWellhubBookings(
    ctx: TenantContext,
    userId: number,
    opts: { upcomingFrom: string } | { limit: number },
  ): Promise<WellhubRecentBooking[]> {
    const conditions = [
      tenantWhere(schema.bookings, ctx),
      eq(schema.bookings.memberId, userId),
      isWellhubBookingSql(),
    ];
    if ("upcomingFrom" in opts) {
      conditions.push(
        eq(schema.bookings.status, "reservado"),
        gte(schema.bookings.bookingDate, opts.upcomingFrom),
      );
    }

    const base = this.db
      .select({
        bookingId: schema.bookings.id,
        date: schema.bookings.bookingDate,
        startTime: schema.schedules.startTime,
        activityName: schema.activities.name,
        branchName: schema.branches.name,
        status: schema.bookings.status,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        and(
          tenantWhere(schema.schedules, ctx),
          eq(schema.schedules.id, schema.bookings.scheduleId),
        ),
      )
      .innerJoin(
        schema.activities,
        and(
          tenantWhere(schema.activities, ctx),
          eq(schema.activities.id, schema.schedules.activityId),
        ),
      )
      .innerJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.schedules.branchId),
        ),
      )
      .where(and(...conditions));

    const rows =
      "upcomingFrom" in opts
        ? await base
            .orderBy(
              asc(schema.bookings.bookingDate),
              asc(schema.schedules.startTime),
            )
            .limit(1)
        : await base
            .orderBy(
              desc(schema.bookings.bookingDate),
              desc(schema.schedules.startTime),
            )
            .limit(opts.limit);

    return rows.map((r) => ({
      bookingId: r.bookingId,
      date: r.date,
      startTime: r.startTime,
      activityName: r.activityName,
      branchName: r.branchName,
      status: r.status,
    }));
  }

  /**
   * Datos de la card Wellhub de la ficha. `null` si la persona no tiene
   * `gympass_id` (o no existe en el gimnasio).
   */
  async getCard(
    ctx: TenantContext,
    userId: number,
  ): Promise<WellhubCard | null> {
    const [user] = await this.db
      .select({
        gympassId: schema.users.gympassId,
        timezone: schema.branches.timezone,
        showLabel: wellhubLabelVisibleSql(ctx),
      })
      .from(schema.users)
      .innerJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.users.branchId),
        ),
      )
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
      .limit(1);

    if (!user || user.gympassId === null) return null;

    // "Hoy" y el mes en curso, en la tz de la sede de la persona.
    const today = todayInTz(user.timezone);
    const monthStart = `${today.slice(0, 7)}-01`;

    // Visitas Wellhub (validadas y a mano) en una sola pasada. Las fechas salen
    // formateadas desde SQL: mysql2 devuelve Date para DATE/TIMESTAMP.
    const [visits] = await this.db
      .select({
        total: sql<number>`COUNT(*)`,
        manual: sql<number>`COALESCE(SUM(CASE WHEN ${schema.attendance.source} = 'wellhub_manual' THEN 1 ELSE 0 END), 0)`,
        thisMonth: sql<number>`COALESCE(SUM(CASE WHEN ${schema.attendance.sessionDate} >= ${monthStart} THEN 1 ELSE 0 END), 0)`,
        lastVisitDate: sql<
          string | null
        >`DATE_FORMAT(MAX(${schema.attendance.sessionDate}), '%Y-%m-%d')`,
        firstVisitAt: sql<Date | string | null>`MIN(${schema.attendance.checkedInAt})`,
      })
      .from(schema.attendance)
      .where(
        and(
          tenantWhere(schema.attendance, ctx),
          eq(schema.attendance.memberId, userId),
          isWellhubAttendanceSql(),
        ),
      );

    const branchRows = await this.db
      .selectDistinct({ name: schema.branches.name })
      .from(schema.attendance)
      .innerJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.attendance.branchId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.attendance, ctx),
          eq(schema.attendance.memberId, userId),
          isWellhubAttendanceSql(),
        ),
      )
      .orderBy(asc(schema.branches.name));

    const [firstRequest] = await this.db
      .select({
        firstRequestAt: sql<Date | string | null>`MIN(${schema.wellhubBookings.createdAt})`,
      })
      .from(schema.wellhubBookings)
      .where(
        and(
          tenantWhere(schema.wellhubBookings, ctx),
          eq(schema.wellhubBookings.userId, userId),
        ),
      );

    const [next] = await this.listWellhubBookings(ctx, userId, {
      upcomingFrom: today,
    });
    const recent = await this.listWellhubBookings(ctx, userId, {
      limit: RECENT_BOOKINGS_LIMIT,
    });

    // "Vinculado desde": la traza Wellhub más vieja (reserva o visita).
    const candidates = [
      toIso(firstRequest?.firstRequestAt),
      toIso(visits?.firstVisitAt),
    ].filter((v): v is string => v !== null);
    const linkedSince =
      candidates.length > 0
        ? candidates.reduce((min, v) => (v < min ? v : min))
        : null;

    const showLabel = Boolean(Number(user.showLabel));

    return {
      gympassId: user.gympassId,
      linkedSince,
      lastVisitDate: visits?.lastVisitDate ?? null,
      visitsThisMonth: Number(visits?.thisMonth ?? 0),
      visitsTotal: Number(visits?.total ?? 0),
      manualVisitsTotal: Number(visits?.manual ?? 0),
      branchesVisited: branchRows.map((r) => r.name),
      nextWellhubBooking: next
        ? {
            bookingId: next.bookingId,
            date: next.date,
            startTime: next.startTime,
            activityName: next.activityName,
            branchName: next.branchName,
          }
        : null,
      recentWellhubBookings: recent,
      showLabel,
      canConvert: showLabel,
      canMerge: await isPureWellhub(ctx, userId, this.db),
      hasLoggedIn: await this.hasLoggedIn(ctx, userId),
    };
  }

  /**
   * Acción explícita "Enviar acceso a la app" (D-17/D-26): resetea la
   * contraseña a la temporal. Valida gympass_id y email ANTES de resetear.
   * `hadLoggedIn` solo sirve para el log del llamador: la acción es la misma
   * (la UI advierte más fuerte si ya tenía cuenta).
   */
  async sendAppAccess(
    ctx: TenantContext,
    userId: number,
  ): Promise<SendAppAccessResult> {
    const [user] = await this.db
      .select({
        role: schema.users.role,
        deletedAt: schema.users.deletedAt,
        gympassId: schema.users.gympassId,
        email: schema.users.email,
        firstName: schema.users.firstName,
      })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
      .limit(1);

    if (!user) return { ok: false, reason: "not_found" };
    if (user.deletedAt) return { ok: false, reason: "deleted" };
    if (user.role !== "member") return { ok: false, reason: "not_member" };
    if (user.gympassId === null) return { ok: false, reason: "not_wellhub" };
    const email = user.email?.trim();
    if (!email) return { ok: false, reason: "no_email" };

    const hadLoggedIn = await this.hasLoggedIn(ctx, userId);

    const reset = await this.memberService.resetMemberPassword(ctx, userId);
    if (!reset.ok) {
      this.log.warn(
        { userId, reason: reset.reason },
        "Acceso a la app: el reset de contraseña fue rechazado",
      );
      return { ok: false, reason: reset.reason };
    }

    return {
      ok: true,
      email,
      firstName: user.firstName ?? "",
      hadLoggedIn,
    };
  }

  /**
   * D-05/D-21: "Unir con alumno existente". Absorbe un duplicado Wellhub puro
   * (`sourceUserId`) en un alumno existente (`targetUserId`): el ID de Wellhub,
   * las reservas, las visitas, las solicitudes `wellhub_bookings` y las notas
   * pasan al destino; el duplicado se da de baja (baja lógica) y se audita.
   * Todo en UNA transacción. Las reservas vivas se MUEVEN, nunca se cancelan.
   * Sin deshacer en la UI (D-21).
   */
  async mergeInto(
    ctx: TenantContext,
    input: { sourceUserId: number; targetUserId: number; actorId: number },
  ): Promise<WellhubMergeResult> {
    const { sourceUserId, targetUserId, actorId } = input;

    if (sourceUserId === targetUserId) {
      return {
        ok: false,
        status: 400,
        message: "No se puede unir una ficha consigo misma",
      };
    }

    try {
      const moved = await this.db.transaction(async (tx) => {
        const loadUser = async (id: number) => {
          const [row] = await tx
            .select({
              role: schema.users.role,
              deletedAt: schema.users.deletedAt,
              gympassId: schema.users.gympassId,
              email: schema.users.email,
            })
            .from(schema.users)
            .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, id)))
            .limit(1);
          if (!row || row.deletedAt || row.role !== "member") {
            throw new WellhubMergeError(404, "Miembro no encontrado");
          }
          return row;
        };

        const source = await loadUser(sourceUserId);
        const target = await loadUser(targetUserId);

        if (
          source.gympassId === null ||
          !(await isPureWellhub(ctx, sourceUserId, tx))
        ) {
          throw new WellhubMergeError(
            409,
            "Solo se puede unir una ficha Wellhub sin planes ni pagos",
          );
        }
        if (target.gympassId !== null) {
          throw new WellhubMergeError(
            409,
            "Ese alumno ya tiene otro ID de Wellhub",
          );
        }
        const gympassId = source.gympassId;

        // Choques con el unique (member_id, schedule_id, booking_date): si las
        // dos fichas tienen reserva viva para la misma clase y día, se rechaza.
        // Si una de las dos está muerta (cancelada / no_show) se borra esa para
        // que la reserva viva (o la del duplicado) pueda pasar al destino.
        const bookingColumns = {
          id: schema.bookings.id,
          scheduleId: schema.bookings.scheduleId,
          bookingDate: schema.bookings.bookingDate,
          status: schema.bookings.status,
        };
        const sourceBookings = await tx
          .select(bookingColumns)
          .from(schema.bookings)
          .where(
            and(
              tenantWhere(schema.bookings, ctx),
              eq(schema.bookings.memberId, sourceUserId),
            ),
          );
        const targetBookings = await tx
          .select(bookingColumns)
          .from(schema.bookings)
          .where(
            and(
              tenantWhere(schema.bookings, ctx),
              eq(schema.bookings.memberId, targetUserId),
            ),
          );

        const isLive = (status: string) =>
          (LIVE_BOOKING_STATUSES as readonly string[]).includes(status);
        const keyOf = (b: { scheduleId: number; bookingDate: string }) =>
          `${b.scheduleId}|${b.bookingDate}`;
        const targetByKey = new Map(targetBookings.map((b) => [keyOf(b), b] as const));
        const deadToDelete: number[] = [];
        for (const sb of sourceBookings) {
          const tb = targetByKey.get(keyOf(sb));
          if (!tb) continue;
          if (isLive(sb.status) && isLive(tb.status)) {
            throw new WellhubMergeError(
              409,
              "Las dos fichas tienen reserva para la misma clase el mismo día",
            );
          }
          // Se borra la muerta; si las dos están muertas, la del duplicado.
          deadToDelete.push(isLive(sb.status) ? tb.id : sb.id);
        }
        if (deadToDelete.length > 0) {
          await tx
            .delete(schema.bookings)
            .where(
              and(
                tenantWhere(schema.bookings, ctx),
                inArray(schema.bookings.id, deadToDelete),
              ),
            );
        }

        // `users.gympass_id` es UNIQUE global: primero se libera en el
        // duplicado y recién después se asigna al destino.
        await tx
          .update(schema.users)
          .set({ gympassId: null })
          .where(
            and(
              tenantWhere(schema.users, ctx),
              eq(schema.users.id, sourceUserId),
            ),
          );
        await tx
          .update(schema.users)
          .set({ gympassId })
          .where(
            and(
              tenantWhere(schema.users, ctx),
              eq(schema.users.id, targetUserId),
            ),
          );

        const bookings = affectedRows(
          await tx
            .update(schema.bookings)
            .set({ memberId: targetUserId })
            .where(
              and(
                tenantWhere(schema.bookings, ctx),
                eq(schema.bookings.memberId, sourceUserId),
              ),
            ),
        );
        const attendance = affectedRows(
          await tx
            .update(schema.attendance)
            .set({ memberId: targetUserId })
            .where(
              and(
                tenantWhere(schema.attendance, ctx),
                eq(schema.attendance.memberId, sourceUserId),
              ),
            ),
        );
        const wellhubBookings = affectedRows(
          await tx
            .update(schema.wellhubBookings)
            .set({ userId: targetUserId })
            .where(
              and(
                tenantWhere(schema.wellhubBookings, ctx),
                eq(schema.wellhubBookings.userId, sourceUserId),
              ),
            ),
        );
        const notes = affectedRows(
          await tx
            .update(schema.memberNotes)
            .set({ userId: targetUserId })
            .where(
              and(
                tenantWhere(schema.memberNotes, ctx),
                eq(schema.memberNotes.userId, sourceUserId),
              ),
            ),
        );

        await softDeleteMemberTx(tx, ctx, sourceUserId);

        const movedCounts: WellhubMergeMoved = {
          bookings,
          attendance,
          wellhubBookings,
          notes,
        };
        await auditLog.write(ctx, tx, {
          actorId,
          action: "wellhub_member_merged",
          targetKind: "member",
          targetId: targetUserId,
          payload: {
            absorbedUserId: sourceUserId,
            gympassId,
            absorbedEmail: source.email,
            moved: movedCounts,
          },
        });
        return movedCounts;
      });

      this.log.info(
        { sourceUserId, targetUserId, moved },
        "Fichas unidas: duplicado Wellhub absorbido",
      );
      return { ok: true, moved };
    } catch (err: unknown) {
      if (err instanceof WellhubMergeError) {
        return { ok: false, status: err.status, message: err.message };
      }
      throw err;
    }
  }
}
