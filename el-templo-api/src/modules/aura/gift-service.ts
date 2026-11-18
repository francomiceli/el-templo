// Module: aura — servicio del regalo del alumno (fase 215)
//
// Flujo (research §1, §2 y diagrama):
//
//   card de hoy ──> listPending ──> clases de hoy y ayer ya terminadas, sin
//                                   regalo dado y con a quién darle
//   hoja ─────────> listCandidates ─> compañeros de esa clase, en orden de
//                                     reserva, con el tope semanal marcado
//   elegir cara ──> giveMemberGift ─> transacción:
//                                     1. FOR UPDATE sobre la fila del dador
//                                     2. revalida TODO en el servidor
//                                     3. INSERT en `aura_gifts`
//                                     4. `awardInTransaction` al receptor
//
// La app no decide ninguna regla: todo lo que manda el cliente se vuelve a
// validar acá.
//
// - D-02: un regalo de alumno por asistencia propia del dador.
// - D-04: reciben quienes fueron a la misma clase y son visibles
//   (`listEligibleClassmates`).
// - D-05: tope de 2 por persona por semana (`GIFT_WEEKLY_CAP`).
// - D-07: quien no puede ver la lista de anotados (oculto, sin plan) o es staff
//   no regala y no se le explica por qué: `REGALO_NO_DISPONIBLE`.
// - D-09: quien regala NO pierde Aura: ninguna fila del ledger toca al dador y
//   nunca se usa `spend`.
// - D-12: ventana del día de la clase y el siguiente.
// - D-14: la oferta existe desde la hora de fin del horario.
// - D-16: motivo entre los cuatro fijos.
//
// Regalo del profe (plan 07, D-03 / D-11 / D-15):
// - `giveCoachGift`: un profe (rol tipo profe) con la sede de la asistencia
//   asignada da Aura a cada alumno que asistió ese día (hoy o ayer), una vez por
//   persona y por día, sin tope de cantidad. Acredita el valor vigente por
//   gimnasio (`getCoachGiftAmount`) y lo guarda en la fila.
// - `coachGiftStatesForSlot`: estado de regalo de cada fila del panel de
//   asistencia, con un número fijo de consultas.
//
// Decisiones del plan 05 (anotadas en 215-DECISIONES-AUTONOMAS.md):
// - `givenToday` son los regalos de alumno vigentes del usuario cuya fecha de
//   creación cae en el día local de la sede del regalo.
// - Una clase de fecha futura responde `REGALO_NO_DISPONIBLE` (no es "vencida").
// - La asistencia de otra persona o inexistente responde 404 sin revelar nada.
// - Si la firma de fotos falla, la lista sale igual, con iniciales.
//
// Todas las lecturas y escrituras llevan `tenantWhere` / `tenantValues` literales.

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyInstance } from "fastify";
import * as schema from "../../db/schema";
import { resolveCommunityPhotos } from "../members/profile-photo-service";
import { DEFAULT_TENANT_TIMEZONE, todayInTz } from "../shared/date-utils";
import { isModuleEnabled } from "../shared/module-flags";
import { isCoachLikeRole } from "../shared/permissions";
import { isDuplicateKeyError } from "../shared/sql-errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { NotificationService } from "../notifications/service";
import { GiftError } from "./gift-errors";
import { queueGiftNotification } from "./gift-push";
import { getCoachGiftAmount } from "./gift-settings";
import {
  classHasEnded,
  giverAccess,
  listEligibleClassmates,
  listRecentClassAttendances,
  loadClassAttendance,
  weeklyGiftCountsByReceiver,
  type ClassAttendance,
  type Classmate,
} from "./gift-eligibility";
import {
  GIFT_REFERENCE,
  GIFT_WEEKLY_CAP,
  giftExpiresOn,
  giftWeekRange,
  isGiftReason,
  isWithinGiftWindow,
  type GiftReason,
} from "./gift-rules";
import { AURA_AMOUNTS } from "./amounts";
import { AuraService, type AuraTx } from "./service";

type DbInstance = MySql2Database<typeof schema>;
type DbOrTx = DbInstance | AuraTx;

/** Una clase con regalo pendiente (la card de hoy). */
export interface PendingGift {
  attendanceId: number;
  sessionDate: string;
  startTime: string;
  activityName: string;
  /** Último día en que se puede dar (D-12). */
  expiresOn: string;
}

/** Quien recibió: solo nombre de pila, inicial y foto firmada (D-08). */
export interface GiftReceiverView {
  firstName: string;
  lastInitial: string | null;
  photoUrl: string | null;
}

/** Un regalo vigente que el usuario dio hoy. */
export interface GivenTodayGift {
  attendanceId: number;
  receiver: GiftReceiverView;
  reason: GiftReason;
}

export interface PendingGiftsResult {
  pending: PendingGift[];
  givenToday: GivenTodayGift[];
}

export interface GiftCandidate {
  receiverAttendanceId: number;
  firstName: string;
  lastInitial: string | null;
  photoUrl: string | null;
  blockedReason: "tope_semanal" | null;
}

export interface GiftCandidatesResult {
  class: { sessionDate: string; startTime: string; activityName: string };
  candidates: GiftCandidate[];
}

export interface GiveMemberGiftInput {
  attendanceId: number;
  receiverAttendanceId: number;
  reason: string;
}

export interface GiveMemberGiftResult {
  giftId: number;
  receiverUserId: number;
  receiverFirstName: string;
  reason: GiftReason;
  amount: number;
}

/** Quien regala como profe: rol y sedes salen del scope del servidor. */
export interface CoachGiftViewer {
  userId: number;
  role: string;
  branchIds: readonly number[];
}

export interface GiveCoachGiftInput {
  attendanceId: number;
  reason: string;
}

export interface GiveCoachGiftResult {
  giftId: number;
  receiverUserId: number;
  amount: number;
  reason: GiftReason;
}

/** Estado del regalo del profe en una fila del panel de asistencia. */
export type CoachGiftRowState = "disponible" | "dado" | "no_participa";

export interface CoachGiftRowView {
  state: CoachGiftRowState;
  amount: number;
  reason: GiftReason | null;
}

export interface CoachGiftSlotInput {
  scheduleId: number;
  /** Fecha local de la clase (`YYYY-MM-DD`). */
  date: string;
  branchId: number;
  /** Zona de la sede, para decidir "hoy" y la ventana. */
  timezone: string;
  members: Array<{ memberId: number; attendanceId: number | null }>;
}

export interface CoachGiftSlotResult {
  /** Valor vigente, o null si el viewer no regala como profe en esta clase. */
  coachGiftAmount: number | null;
  /** Por `memberId`; null = sin estado (sin asistencia o sin permiso). */
  byMember: Map<number, CoachGiftRowView | null>;
}

export class AuraGiftService {
  private readonly db: DbInstance;
  private readonly aura: AuraService;
  private readonly notifications: NotificationService;

  constructor(private readonly fastify: FastifyInstance) {
    this.db = fastify.db;
    this.aura = new AuraService(fastify.db);
    this.notifications = new NotificationService(fastify.db, fastify.log);
  }

  /**
   * Regalos pendientes de la card y regalos vigentes que dio hoy. Quien no
   * puede dar recibe listas vacías, sin explicación (D-07).
   */
  async listPending(
    ctx: TenantContext,
    userId: number,
    now: Date = new Date(),
  ): Promise<PendingGiftsResult> {
    const { canGive } = await giverAccess(this.db, ctx, userId);
    if (!canGive) return { pending: [], givenToday: [] };

    const recent = await listRecentClassAttendances(this.db, ctx, userId, now);

    const attendanceIds = recent.map((cls) => cls.attendanceId);
    const alreadyGiven = await this.givenAttendanceIds(
      this.db,
      ctx,
      attendanceIds,
    );

    // El tope semanal depende de la semana de cada clase: se consulta una vez
    // por semana distinta.
    const weeklyByWeek = new Map<string, Map<number, number>>();

    const pending: PendingGift[] = [];
    for (const cls of recent) {
      if (!classHasEnded(cls, now)) continue;
      if (alreadyGiven.has(cls.attendanceId)) continue;

      const classmates = await listEligibleClassmates(this.db, ctx, {
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
        excludeUserId: userId,
        todayLocal: todayInTz(cls.timezone, now),
      });
      if (classmates.length === 0) continue;

      const weekKey = giftWeekRange(cls.sessionDate).start;
      let weekly = weeklyByWeek.get(weekKey);
      if (!weekly) {
        weekly = await weeklyGiftCountsByReceiver(
          this.db,
          ctx,
          userId,
          cls.sessionDate,
        );
        weeklyByWeek.set(weekKey, weekly);
      }
      const hasSomeoneToGive = classmates.some(
        (mate) => (weekly.get(mate.userId) ?? 0) < GIFT_WEEKLY_CAP,
      );
      if (!hasSomeoneToGive) continue;

      pending.push({
        attendanceId: cls.attendanceId,
        sessionDate: cls.sessionDate,
        startTime: cls.startTime,
        activityName: cls.activityName,
        expiresOn: giftExpiresOn(cls.sessionDate),
      });
    }

    // Vence antes primero; a igual vencimiento, la de hora más temprana.
    pending.sort(
      (a, b) =>
        a.expiresOn.localeCompare(b.expiresOn) ||
        a.startTime.localeCompare(b.startTime) ||
        a.attendanceId - b.attendanceId,
    );

    const givenToday = await this.listGivenToday(ctx, userId, now);
    return { pending, givenToday };
  }

  /**
   * Compañeros de una clase a los que se les puede regalar, en orden de
   * reserva. La lista vacía es una respuesta válida.
   */
  async listCandidates(
    ctx: TenantContext,
    userId: number,
    attendanceId: number,
    now: Date = new Date(),
  ): Promise<GiftCandidatesResult> {
    const { canGive } = await giverAccess(this.db, ctx, userId);
    const cls = await this.assertGiveable(
      this.db,
      ctx,
      userId,
      attendanceId,
      canGive,
      now,
    );

    const classmates = await listEligibleClassmates(this.db, ctx, {
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
      excludeUserId: userId,
      todayLocal: todayInTz(cls.timezone, now),
    });
    const weekly = await weeklyGiftCountsByReceiver(
      this.db,
      ctx,
      userId,
      cls.sessionDate,
    );
    const photos = await this.safePhotos(
      ctx,
      classmates.map((mate) => mate.userId),
    );

    return {
      class: {
        sessionDate: cls.sessionDate,
        startTime: cls.startTime,
        activityName: cls.activityName,
      },
      candidates: classmates.map((mate) => ({
        receiverAttendanceId: mate.attendanceId,
        firstName: mate.firstName,
        lastInitial: mate.lastInitial,
        photoUrl: photos.get(mate.userId) ?? null,
        blockedReason:
          (weekly.get(mate.userId) ?? 0) >= GIFT_WEEKLY_CAP
            ? "tope_semanal"
            : null,
      })),
    };
  }

  /**
   * Da el regalo: valida todo de nuevo con la fila del dador bloqueada, inserta
   * el regalo y acredita la Aura al receptor en la misma transacción.
   */
  async giveMemberGift(
    ctx: TenantContext,
    userId: number,
    input: GiveMemberGiftInput,
    now: Date = new Date(),
  ): Promise<GiveMemberGiftResult> {
    const { reason } = input;
    if (!isGiftReason(reason)) throw new GiftError("REGALO_NO_DISPONIBLE");

    // `giverAccess` lee con la conexión del pool: se resuelve antes de abrir la
    // transacción. No cambia el orden de los rechazos (lo recibe `assertGiveable`).
    const { canGive } = await giverAccess(this.db, ctx, userId);

    const result = await this.db.transaction(async (tx) => {
      // (a) Serializa los regalos del mismo dador: dos pedidos en paralelo no
      // pueden pasar los dos el tope semanal ni la regla de un regalo por clase.
      await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
        .for("update");

      // (b) Las mismas validaciones que la hoja, ahora dentro de la transacción.
      const cls = await this.assertGiveable(
        tx,
        ctx,
        userId,
        input.attendanceId,
        canGive,
        now,
      );

      // (c) El receptor se busca de nuevo: tiene que ser una de las caras.
      const classmates = await listEligibleClassmates(tx, ctx, {
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
        excludeUserId: userId,
        todayLocal: todayInTz(cls.timezone, now),
      });
      const receiver = classmates.find(
        (mate) => mate.attendanceId === input.receiverAttendanceId,
      );
      if (!receiver) throw new GiftError("REGALO_NO_DISPONIBLE");

      // (d) Tope semanal del receptor.
      const weekly = await weeklyGiftCountsByReceiver(
        tx,
        ctx,
        userId,
        cls.sessionDate,
      );
      if ((weekly.get(receiver.userId) ?? 0) >= GIFT_WEEKLY_CAP) {
        throw new GiftError("REGALO_TOPE_SEMANAL");
      }

      // (e) El regalo. El UNIQUE por asistencia del dador es la última barrera.
      const giftId = await this.insertGift(tx, ctx, {
        userId,
        receiver,
        cls,
        reason,
      });

      // (f) La Aura del receptor, con el regalo como referencia. El dador no
      // recibe ninguna fila (D-09).
      await this.aura.awardInTransaction(tx, ctx, {
        userId: receiver.userId,
        sourceType: "social",
        referenceType: GIFT_REFERENCE.gift,
        referenceId: giftId,
        amount: AURA_AMOUNTS.giftMember,
        description: "Regalo de Aura #" + giftId,
      });

      // Nombre de quien regala, para el texto de la push (plan 15).
      const giver = await this.readGiverName(tx, ctx, userId);

      return {
        giftId,
        receiverUserId: receiver.userId,
        receiverFirstName: receiver.firstName,
        reason,
        amount: AURA_AMOUNTS.giftMember,
        giver,
      };
    });
    const { giver: memberGiver, ...memberResult } = result;

    this.fastify.log.info(
      {
        giftId: result.giftId,
        giverUserId: userId,
        receiverUserId: result.receiverUserId,
        attendanceId: input.attendanceId,
      },
      "Regalo de Aura dado",
    );

    // Push al receptor DESPUÉS del commit: su error solo se loguea.
    await queueGiftNotification(
      this.notifications,
      ctx,
      {
        giftId: memberResult.giftId,
        receiverUserId: memberResult.receiverUserId,
        giverKind: "alumno",
        giverFirstName: memberGiver.firstName,
        giverLastInitial: memberGiver.lastInitial,
        reason: memberResult.reason,
      },
      this.fastify.log,
    );
    return memberResult;
  }

  /**
   * Regalo del profe (D-03, D-11, D-15). Una vez por persona y por día de
   * clase, sin tope de cantidad; acredita el valor vigente del gimnasio y lo
   * guarda en la fila para que anular revierta exactamente eso.
   */
  async giveCoachGift(
    ctx: TenantContext,
    coach: CoachGiftViewer,
    input: GiveCoachGiftInput,
    now: Date = new Date(),
  ): Promise<GiveCoachGiftResult> {
    if (!isCoachLikeRole(coach.role)) throw new GiftError("REGALO_SIN_PERMISO");
    const { reason } = input;
    if (!isGiftReason(reason)) throw new GiftError("REGALO_NO_DISPONIBLE");

    const result = await this.db.transaction(async (tx) => {
      const cls = await loadClassAttendance(tx, ctx, input.attendanceId);
      // Inexistente o sin horario (no es una clase): 404 sin más detalle.
      if (!cls) throw new GiftError("REGALO_NO_ENCONTRADO");
      if (!coach.branchIds.includes(cls.branchId)) {
        throw new GiftError("REGALO_SIN_PERMISO");
      }

      const today = todayInTz(cls.timezone, now);
      if (cls.sessionDate > today) throw new GiftError("REGALO_NO_DISPONIBLE");
      if (!isWithinGiftWindow(cls.sessionDate, today)) {
        throw new GiftError("REGALO_VENCIDO");
      }

      // El receptor es una de las caras de la clase (visible, no staff, no
      // prueba: D-04 / D-07). El profe no entra: es staff.
      const classmates = await listEligibleClassmates(tx, ctx, {
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
        excludeUserId: coach.userId,
        todayLocal: today,
      });
      const receiver = classmates.find((mate) => mate.userId === cls.memberId);
      if (!receiver) throw new GiftError("REGALO_NO_DISPONIBLE");

      // Una vez por día a cada persona, en cualquier estado (un anulado sigue
      // ocupando el lugar).
      const [already] = await tx
        .select({ id: schema.auraGifts.id })
        .from(schema.auraGifts)
        .where(
          and(
            tenantWhere(schema.auraGifts, ctx),
            eq(schema.auraGifts.giverUserId, coach.userId),
            eq(schema.auraGifts.giverKind, "profe"),
            eq(schema.auraGifts.receiverUserId, receiver.userId),
            eq(schema.auraGifts.coachGiftDate, cls.sessionDate),
          ),
        )
        .limit(1);
      if (already) throw new GiftError("REGALO_YA_DADO");

      const amount = await getCoachGiftAmount(tx, ctx, this.fastify.log);

      let giftId: number;
      try {
        const inserted = await tx.insert(schema.auraGifts).values(
          tenantValues(ctx, {
            giverUserId: coach.userId,
            receiverUserId: receiver.userId,
            giverKind: "profe" as const,
            branchId: cls.branchId,
            scheduleId: cls.scheduleId,
            sessionDate: cls.sessionDate,
            giverAttendanceId: null,
            receiverAttendanceId: cls.attendanceId,
            coachGiftDate: cls.sessionDate,
            reason,
            amount,
            status: "vigente" as const,
          }),
        );
        giftId = Number(inserted[0].insertId);
      } catch (err: unknown) {
        // Dos clics simultáneos: acá no hay FOR UPDATE, el UNIQUE
        // `(tenant, profe, receptor, día)` es la última barrera y tiene que
        // salir 409, no 500. Drizzle pone el código real en `err.cause`.
        if (isDuplicateKeyError(err).isDuplicate) {
          throw new GiftError("REGALO_YA_DADO");
        }
        throw err;
      }

      await this.aura.awardInTransaction(tx, ctx, {
        userId: receiver.userId,
        sourceType: "social",
        referenceType: GIFT_REFERENCE.gift,
        referenceId: giftId,
        amount,
        description: "Regalo de Aura del profe #" + giftId,
      });

      // Nombre de pila del profe, para el texto de la push (plan 15).
      const giver = await this.readGiverName(tx, ctx, coach.userId);

      return {
        giftId,
        receiverUserId: receiver.userId,
        amount,
        reason,
        giver,
      };
    });
    const { giver: coachGiver, ...coachResult } = result;

    this.fastify.log.info(
      {
        giftId: result.giftId,
        giverUserId: coach.userId,
        receiverUserId: coachResult.receiverUserId,
        attendanceId: input.attendanceId,
        amount: coachResult.amount,
      },
      "Regalo de Aura del profe dado",
    );

    // Push al receptor DESPUÉS del commit: su error solo se loguea.
    await queueGiftNotification(
      this.notifications,
      ctx,
      {
        giftId: coachResult.giftId,
        receiverUserId: coachResult.receiverUserId,
        giverKind: "profe",
        giverFirstName: coachGiver.firstName,
        giverLastInitial: null,
        reason: coachResult.reason,
      },
      this.fastify.log,
    );
    return coachResult;
  }

  /**
   * Estado del regalo del profe en cada fila del panel de asistencia de una
   * clase. Quien no regala como profe (otro rol, otra sede, módulo apagado)
   * recibe todo en null y sin valor: el panel no muestra nada (UI-SPEC).
   */
  async coachGiftStatesForSlot(
    ctx: TenantContext,
    viewer: CoachGiftViewer,
    input: CoachGiftSlotInput,
    now: Date = new Date(),
  ): Promise<CoachGiftSlotResult> {
    const byMember = new Map<number, CoachGiftRowView | null>();
    for (const member of input.members) byMember.set(member.memberId, null);

    const enabled =
      isCoachLikeRole(viewer.role) &&
      viewer.branchIds.includes(input.branchId) &&
      (await isModuleEnabled(ctx.tenantId, "templo-gamification", this.db));
    if (!enabled) return { coachGiftAmount: null, byMember };

    const coachGiftAmount = await getCoachGiftAmount(
      this.db,
      ctx,
      this.fastify.log,
    );
    const withAttendance = input.members.filter(
      (member) => member.attendanceId !== null,
    );
    if (withAttendance.length === 0) return { coachGiftAmount, byMember };

    const memberIds = withAttendance.map((member) => member.memberId);

    // UNA consulta de los regalos de este profe ese día a esas personas.
    const givenRows = await this.db
      .select({
        receiverUserId: schema.auraGifts.receiverUserId,
        amount: schema.auraGifts.amount,
        reason: schema.auraGifts.reason,
      })
      .from(schema.auraGifts)
      .where(
        and(
          tenantWhere(schema.auraGifts, ctx),
          eq(schema.auraGifts.giverUserId, viewer.userId),
          eq(schema.auraGifts.giverKind, "profe"),
          eq(schema.auraGifts.coachGiftDate, input.date),
          inArray(schema.auraGifts.receiverUserId, memberIds),
        ),
      );
    const given = new Map(givenRows.map((row) => [row.receiverUserId, row]));

    // UNA llamada de elegibilidad, y solo si la fecha está dentro de la ventana.
    const today = todayInTz(input.timezone, now);
    const inWindow = isWithinGiftWindow(input.date, today);
    const eligible = new Set<number>();
    if (inWindow) {
      const classmates = await listEligibleClassmates(this.db, ctx, {
        scheduleId: input.scheduleId,
        sessionDate: input.date,
        excludeUserId: viewer.userId,
        todayLocal: today,
      });
      for (const mate of classmates) eligible.add(mate.userId);
    }

    for (const member of withAttendance) {
      const gift = given.get(member.memberId);
      if (gift) {
        byMember.set(member.memberId, {
          state: "dado",
          amount: gift.amount,
          reason: gift.reason,
        });
      } else if (eligible.has(member.memberId)) {
        byMember.set(member.memberId, {
          state: "disponible",
          amount: coachGiftAmount,
          reason: null,
        });
      } else {
        byMember.set(member.memberId, {
          state: "no_participa",
          amount: coachGiftAmount,
          reason: null,
        });
      }
    }

    return { coachGiftAmount, byMember };
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  /**
   * Nombre de pila e inicial del apellido de quien regala, para redactar la
   * push (plan 15). Se lee dentro de la transacción con el scope del gimnasio.
   */
  private async readGiverName(
    tx: DbOrTx,
    ctx: TenantContext,
    giverUserId: number,
  ): Promise<{ firstName: string | null; lastInitial: string | null }> {
    const [row] = await tx
      .select({
        firstName: schema.users.firstName,
        lastInitial: sql<string | null>`LEFT(${schema.users.lastName}, 1)`,
      })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, ctx), eq(schema.users.id, giverUserId)),
      )
      .limit(1);
    return {
      firstName: row?.firstName ?? null,
      lastInitial: row?.lastInitial ?? null,
    };
  }

  /**
   * Validaciones comunes de la hoja y del alta, siempre en este orden:
   * asistencia propia, acceso del dador, plazo, regalo ya dado y clase
   * terminada. Devuelve la clase.
   */
  private async assertGiveable(
    db: DbOrTx,
    ctx: TenantContext,
    userId: number,
    attendanceId: number,
    canGive: boolean,
    now: Date,
  ): Promise<ClassAttendance> {
    const cls = await loadClassAttendance(db, ctx, attendanceId);
    // Ajena o inexistente: mismo 404, sin revelar que existe.
    if (!cls || cls.memberId !== userId) {
      throw new GiftError("REGALO_NO_ENCONTRADO");
    }
    if (!canGive) throw new GiftError("REGALO_NO_DISPONIBLE");

    const today = todayInTz(cls.timezone, now);
    if (cls.sessionDate > today) throw new GiftError("REGALO_NO_DISPONIBLE");
    if (!isWithinGiftWindow(cls.sessionDate, today)) {
      throw new GiftError("REGALO_VENCIDO");
    }

    const given = await this.givenAttendanceIds(db, ctx, [cls.attendanceId]);
    if (given.has(cls.attendanceId)) throw new GiftError("REGALO_YA_DADO");

    if (!classHasEnded(cls, now)) throw new GiftError("REGALO_NO_DISPONIBLE");
    return cls;
  }

  /**
   * Asistencias del dador que ya tienen un regalo, en cualquier estado: un
   * regalo anulado no devuelve el cupo (D-09).
   */
  private async givenAttendanceIds(
    db: DbOrTx,
    ctx: TenantContext,
    attendanceIds: number[],
  ): Promise<Set<number>> {
    if (attendanceIds.length === 0) return new Set();
    const rows = await db
      .select({ attendanceId: schema.auraGifts.giverAttendanceId })
      .from(schema.auraGifts)
      .where(
        and(
          tenantWhere(schema.auraGifts, ctx),
          eq(schema.auraGifts.giverKind, "alumno"),
          inArray(schema.auraGifts.giverAttendanceId, attendanceIds),
        ),
      );
    const ids = new Set<number>();
    for (const row of rows) {
      if (row.attendanceId !== null) ids.add(row.attendanceId);
    }
    return ids;
  }

  private async insertGift(
    tx: AuraTx,
    ctx: TenantContext,
    input: {
      userId: number;
      receiver: Classmate;
      cls: ClassAttendance;
      reason: GiftReason;
    },
  ): Promise<number> {
    const { userId, receiver, cls, reason } = input;
    try {
      const inserted = await tx.insert(schema.auraGifts).values(
        tenantValues(ctx, {
          giverUserId: userId,
          receiverUserId: receiver.userId,
          giverKind: "alumno" as const,
          branchId: cls.branchId,
          scheduleId: cls.scheduleId,
          sessionDate: cls.sessionDate,
          giverAttendanceId: cls.attendanceId,
          receiverAttendanceId: receiver.attendanceId,
          coachGiftDate: null,
          reason,
          amount: AURA_AMOUNTS.giftMember,
          status: "vigente" as const,
        }),
      );
      return Number(inserted[0].insertId);
    } catch (err: unknown) {
      // Drizzle envuelve el error de MySQL: el código real va en `err.cause`.
      if (isDuplicateKeyError(err).isDuplicate) {
        throw new GiftError("REGALO_YA_DADO");
      }
      throw err;
    }
  }

  /**
   * Regalos de alumno vigentes del usuario creados hoy en la zona de la sede de
   * cada regalo, el más reciente primero.
   */
  private async listGivenToday(
    ctx: TenantContext,
    userId: number,
    now: Date,
  ): Promise<GivenTodayGift[]> {
    // Cota gruesa en SQL; el día local de cada sede se aplica por fila.
    const since = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const rows = await this.db
      .select({
        giftId: schema.auraGifts.id,
        attendanceId: schema.auraGifts.giverAttendanceId,
        receiverUserId: schema.auraGifts.receiverUserId,
        reason: schema.auraGifts.reason,
        createdAt: schema.auraGifts.createdAt,
        timezone: schema.branches.timezone,
        firstName: schema.users.firstName,
        lastInitial: sql<string | null>`LEFT(${schema.users.lastName}, 1)`,
      })
      .from(schema.auraGifts)
      .innerJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.auraGifts.branchId),
        ),
      )
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.auraGifts.receiverUserId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.auraGifts, ctx),
          eq(schema.auraGifts.giverUserId, userId),
          eq(schema.auraGifts.giverKind, "alumno"),
          eq(schema.auraGifts.status, "vigente"),
          gte(schema.auraGifts.createdAt, since),
        ),
      )
      .orderBy(desc(schema.auraGifts.createdAt), desc(schema.auraGifts.id));

    const today = rows.filter((row) => {
      const tz = row.timezone ?? DEFAULT_TENANT_TIMEZONE;
      return (
        row.attendanceId !== null &&
        todayInTz(tz, row.createdAt) === todayInTz(tz, now)
      );
    });
    if (today.length === 0) return [];

    const photos = await this.safePhotos(
      ctx,
      today.map((row) => row.receiverUserId),
    );
    const result: GivenTodayGift[] = [];
    for (const row of today) {
      if (row.attendanceId === null) continue;
      result.push({
        attendanceId: row.attendanceId,
        receiver: {
          firstName: row.firstName ?? "",
          lastInitial: row.lastInitial || null,
          photoUrl: photos.get(row.receiverUserId) ?? null,
        },
        reason: row.reason,
      });
    }
    return result;
  }

  /**
   * Fotos firmadas por usuario. La foto es decoración: si el storage falla, la
   * lista sale igual, con iniciales.
   */
  private async safePhotos(
    ctx: TenantContext,
    userIds: number[],
  ): Promise<Map<number, string>> {
    const urls = new Map<number, string>();
    if (userIds.length === 0) return urls;
    try {
      const photos = await resolveCommunityPhotos(this.fastify, ctx, userIds);
      for (const [id, photo] of photos) urls.set(id, photo.url);
    } catch (err: unknown) {
      this.fastify.log.warn(
        { err: err instanceof Error ? err.message : "desconocido" },
        "Regalo de Aura: no se pudieron firmar las fotos",
      );
    }
    return urls;
  }
}
