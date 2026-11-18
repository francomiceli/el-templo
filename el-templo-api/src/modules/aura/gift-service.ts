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
import { isDuplicateKeyError } from "../shared/sql-errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { GiftError } from "./gift-errors";
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

export class AuraGiftService {
  private readonly db: DbInstance;
  private readonly aura: AuraService;

  constructor(private readonly fastify: FastifyInstance) {
    this.db = fastify.db;
    this.aura = new AuraService(fastify.db);
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

      return {
        giftId,
        receiverUserId: receiver.userId,
        receiverFirstName: receiver.firstName,
        reason,
        amount: AURA_AMOUNTS.giftMember,
      };
    });

    this.fastify.log.info(
      {
        giftId: result.giftId,
        giverUserId: userId,
        receiverUserId: result.receiverUserId,
        attendanceId: input.attendanceId,
      },
      "Regalo de Aura dado",
    );

    // plan 15: push al receptor después del commit
    return result;
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

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
