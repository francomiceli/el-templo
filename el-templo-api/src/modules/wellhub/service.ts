/**
 * Wellhub — servicio de webhooks entrantes.
 *
 * Flujo de check-in (Access Control API, modo Automated Trigger — sin
 * barrera física):
 *   1. El usuario hace check-in en la app de Wellhub → webhook `checkin`.
 *   2. Resolvemos la sede por event_data.gym.id → branches.wellhub_gym_id.
 *   3. Buscamos/creamos el usuario visitante (users.gympass_id, status
 *      'wellhub', fuera del pipeline de leads).
 *   4. Preguntamos a Wellhub si el ticket es válido (POST /access/v1/validate
 *      — esto genera la transacción facturable).
 *   5. Registramos la visita en attendance con source='wellhub', SIN efectos
 *      colaterales de socio: no descuenta classesRemaining, no otorga AURA,
 *      no registra completed_sessions (plantilla: coachSelfScan).
 *
 * Idempotencia: cada evento se registra en wellhub_events con un event_id
 * único (sintetizado para checkin, que no trae uno). Reintentos de eventos ya
 * procesados se responden 200 sin reprocesar; eventos en estado 'error' se
 * reprocesan en el reintento.
 */

import argon2 from "argon2";
import { randomBytes } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { todayInTz } from "../shared/date-utils";
import { emitOccupancyChange } from "../shared/occupancy-events";
import type { BookingService } from "../scheduling/booking-service";
import type { WellhubClient } from "./client";
import { WellhubApiError } from "./client";
import type {
  WellhubBookingEventData,
  WellhubCheckinEventData,
  WellhubWebhookEvent,
  WellhubWebhookUser,
} from "./types";

export interface WebhookHandleResult {
  /** 200 = procesado/ignorado (no reintentar), 500 = falla transitoria (reintentar). */
  httpStatus: 200 | 500;
  outcome:
    | "processed"
    | "duplicate"
    | "skipped"
    | "already_checked_in"
    | "error";
  detail?: string;
}

export class WellhubService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private client: WellhubClient,
    private bookingService: BookingService,
  ) {}

  // ─── Entrada única de webhooks ─────────────────────────────────────────────

  async handleEvent(
    event: WellhubWebhookEvent,
    rawPayload: string,
  ): Promise<WebhookHandleResult> {
    const eventId = this.eventIdFor(event);

    // Idempotencia: si ya lo procesamos, respondemos 200 sin reprocesar.
    // Estado 'error' sí se reprocesa (el reintento de Wellhub es la vía de
    // recuperación ante fallas transitorias nuestras).
    const [existing] = await this.db
      .select({
        id: schema.wellhubEvents.id,
        status: schema.wellhubEvents.status,
      })
      .from(schema.wellhubEvents)
      .where(eq(schema.wellhubEvents.eventId, eventId))
      .limit(1);

    let eventRowId: number;
    if (existing) {
      if (existing.status !== "error") {
        this.log.info(
          { eventId, status: existing.status },
          "Wellhub webhook duplicado, ignorado",
        );
        return { httpStatus: 200, outcome: "duplicate" };
      }
      eventRowId = existing.id;
    } else {
      try {
        const inserted = await this.db.insert(schema.wellhubEvents).values({
          eventId,
          eventType: event.event_type,
          payload: rawPayload,
          status: "received",
        });
        eventRowId = Number(inserted[0].insertId);
      } catch {
        // Carrera entre dos entregas simultáneas del mismo evento: la segunda
        // pierde el INSERT por la unique key y se trata como duplicado.
        this.log.info({ eventId }, "Wellhub webhook duplicado (carrera)");
        return { httpStatus: 200, outcome: "duplicate" };
      }
    }

    try {
      const result = await this.dispatch(event);
      await this.db
        .update(schema.wellhubEvents)
        .set({
          status: result.outcome === "skipped" ? "skipped" : "processed",
          error: null,
        })
        .where(eq(schema.wellhubEvents.id, eventRowId));
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(
        { eventId, eventType: event.event_type, err },
        "Error procesando webhook de Wellhub",
      );
      await this.db
        .update(schema.wellhubEvents)
        .set({ status: "error", error: message })
        .where(eq(schema.wellhubEvents.id, eventRowId));
      return { httpStatus: 500, outcome: "error", detail: message };
    }
  }

  private async dispatch(
    event: WellhubWebhookEvent,
  ): Promise<WebhookHandleResult> {
    switch (event.event_type) {
      case "checkin":
      case "checkin-booking-occurred":
        return this.handleCheckin(event.event_data as WellhubCheckinEventData);
      case "booking-requested":
      case "booking-canceled":
      case "booking-late-canceled":
        return this.handleBookingEvent(
          event.event_type,
          event.event_data as WellhubBookingEventData,
        );
      default:
        this.log.warn(
          { eventType: event.event_type },
          "Wellhub webhook de tipo desconocido, ignorado",
        );
        return { httpStatus: 200, outcome: "skipped", detail: "unknown_type" };
    }
  }

  /**
   * event_id único por evento. checkin no trae event_id — se sintetiza
   * determinístico con unique_token + timestamp para deduplicar reintentos.
   */
  private eventIdFor(event: WellhubWebhookEvent): string {
    const data = event.event_data as { event_id?: string; timestamp?: number };
    if (data.event_id) return data.event_id;
    const user = (event.event_data as WellhubCheckinEventData).user;
    return `${event.event_type}:${user?.unique_token ?? "unknown"}:${data.timestamp ?? 0}`;
  }

  // ─── Check-in ──────────────────────────────────────────────────────────────

  private async handleCheckin(
    data: WellhubCheckinEventData,
  ): Promise<WebhookHandleResult> {
    const gymId = data.gym?.id;
    const uniqueToken = data.user?.unique_token;
    if (!gymId || !uniqueToken) {
      return {
        httpStatus: 200,
        outcome: "skipped",
        detail: "payload_incompleto",
      };
    }

    const branch = await this.findBranchByGymId(gymId);
    if (!branch) {
      this.log.warn(
        { gymId },
        "Webhook checkin de Wellhub para un gym_id sin sede mapeada",
      );
      return { httpStatus: 200, outcome: "skipped", detail: "gym_sin_sede" };
    }

    const userId = await this.findOrCreateVisitor(data.user, branch.id);
    const todayStr = todayInTz(branch.timezone);

    // Guard uno-por-día ANTES de validar: si ya hay asistencia de hoy (por
    // ejemplo un socio vinculado que ya escaneó nuestro QR), no generamos la
    // transacción facturable a Wellhub por una visita que no vamos a registrar.
    const [existingToday] = await this.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, userId),
          eq(schema.attendance.sessionDate, todayStr),
        ),
      )
      .limit(1);

    if (existingToday) {
      this.log.info(
        { userId, gymId, sessionDate: todayStr },
        "Checkin Wellhub ignorado: ya hay asistencia registrada hoy",
      );
      return { httpStatus: 200, outcome: "already_checked_in" };
    }

    // Punto final de validación: confirma el ticket del día y genera la
    // transacción por la que Wellhub nos paga. Si falla con 4xx el ticket no
    // es válido (skipped, no reintentar); 5xx/red se propaga como error 500
    // para que Wellhub reintente.
    try {
      await this.client.validateCheckin(gymId, uniqueToken);
    } catch (err: unknown) {
      if (
        err instanceof WellhubApiError &&
        err.status >= 400 &&
        err.status < 500
      ) {
        this.log.warn(
          { gymId, uniqueToken, status: err.status, body: err.responseBody },
          "Wellhub rechazó la validación del check-in (ticket inválido)",
        );
        return {
          httpStatus: 200,
          outcome: "skipped",
          detail: "ticket_invalido",
        };
      }
      throw err;
    }

    // Visita Wellhub: solo la fila de attendance. Nada de classesRemaining /
    // AURA / completed_sessions / bookings (no es socio).
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const [recheck] = await tx
        .select({ id: schema.attendance.id })
        .from(schema.attendance)
        .where(
          and(
            eq(schema.attendance.memberId, userId),
            eq(schema.attendance.sessionDate, todayStr),
          ),
        )
        .limit(1);
      if (recheck) return;

      await tx.insert(schema.attendance).values({
        memberId: userId,
        branchId: branch.id,
        sessionDate: todayStr,
        status: "confirmado",
        source: "wellhub",
        checkedInAt: now,
      });
    });

    this.log.info(
      { userId, branchId: branch.id, gymId, sessionDate: todayStr },
      "Visita Wellhub registrada",
    );
    return { httpStatus: 200, outcome: "processed" };
  }

  // ─── Reservas (Booking API) ────────────────────────────────────────────────

  private async handleBookingEvent(
    eventType: string,
    data: WellhubBookingEventData,
  ): Promise<WebhookHandleResult> {
    if (eventType === "booking-requested") {
      return this.handleBookingRequested(data);
    }
    return this.handleBookingCanceled(eventType, data);
  }

  /**
   * Solicitud de reserva de un usuario Wellhub sobre un slot publicado.
   * Nosotros somos la fuente de verdad del cupo (pool compartido): el cupo se
   * revalida en transacción y se responde RESERVED o REJECTED vía PATCH
   * (ventana dura de 15 minutos — pasada, Wellhub auto-rechaza).
   */
  private async handleBookingRequested(
    data: WellhubBookingEventData,
  ): Promise<WebhookHandleResult> {
    const bookingNumber = data.slot?.booking_number;
    const wellhubSlotId = data.slot?.id;
    if (!bookingNumber || !wellhubSlotId || !data.user?.unique_token) {
      return {
        httpStatus: 200,
        outcome: "skipped",
        detail: "payload_incompleto",
      };
    }

    const slot = await this.findPublishedSlot(wellhubSlotId);
    if (!slot) {
      // Slot que no publicamos nosotros: rechazamos para no dejar la
      // solicitud colgada hasta el auto-rechazo de los 15 minutos.
      this.log.warn(
        { wellhubSlotId, bookingNumber },
        "booking-requested sobre un slot no publicado",
      );
      await this.client.validateBooking({
        gymId: data.slot.gym_id,
        bookingNumber,
        classId: data.slot.class_id,
        decision: "REJECTED",
        reason: "Clase no encontrada",
        reasonCategory: "CLASS_NOT_FOUND",
      });
      return {
        httpStatus: 200,
        outcome: "skipped",
        detail: "slot_desconocido",
      };
    }

    // Reintento de una solicitud ya vista (por otro event_id): si quedó
    // 'pending' la confirmación no llegó a Wellhub — se reintenta el PATCH;
    // cualquier otro estado es un duplicado ya resuelto.
    const [existing] = await this.db
      .select({
        id: schema.wellhubBookings.id,
        status: schema.wellhubBookings.status,
      })
      .from(schema.wellhubBookings)
      .where(eq(schema.wellhubBookings.bookingNumber, bookingNumber))
      .limit(1);

    if (existing) {
      if (existing.status !== "pending") {
        return { httpStatus: 200, outcome: "duplicate" };
      }
      await this.client.validateBooking({
        gymId: slot.gymId,
        bookingNumber,
        classId: slot.wellhubClassId,
        decision: "RESERVED",
      });
      await this.db
        .update(schema.wellhubBookings)
        .set({ status: "confirmed" })
        .where(eq(schema.wellhubBookings.id, existing.id));
      return {
        httpStatus: 200,
        outcome: "processed",
        detail: "confirm_reintentado",
      };
    }

    const visitorId = await this.findOrCreateVisitor(data.user, slot.branchId);

    // Cupo + duplicados en transacción (mismas reglas que reserve() de
    // socios; los bookings Wellhub son filas normales así que el conteo los
    // incluye solo).
    interface RequestOutcome {
      decision: "RESERVED" | "REJECTED";
      rejectionCategory: "CLASS_IS_FULL" | "USER_ALREADY_BOOKED" | null;
      bookingId: number | null;
    }

    const outcome: RequestOutcome = await this.db.transaction(
      async (tx): Promise<RequestOutcome> => {
        const [duplicate] = await tx
          .select({ id: schema.bookings.id, status: schema.bookings.status })
          .from(schema.bookings)
          .where(
            and(
              eq(schema.bookings.memberId, visitorId),
              eq(schema.bookings.scheduleId, slot.scheduleId),
              eq(schema.bookings.bookingDate, slot.sessionDate),
            ),
          )
          .limit(1);

        if (
          duplicate &&
          ["reservado", "qr_escaneado", "confirmado", "lista_espera"].includes(
            duplicate.status,
          )
        ) {
          return {
            decision: "REJECTED",
            rejectionCategory: "USER_ALREADY_BOOKED",
            bookingId: null,
          };
        }

        const activeCount = await this.bookingService.countActiveBookings(
          slot.scheduleId,
          slot.sessionDate,
          tx,
        );
        if (activeCount >= slot.totalCapacity) {
          return {
            decision: "REJECTED",
            rejectionCategory: "CLASS_IS_FULL",
            bookingId: null,
          };
        }

        // Igual que reserve(): una reserva cancelada/no_show previa se borra
        // para no chocar con el unique (member, schedule, fecha).
        if (duplicate && ["cancelado", "no_show"].includes(duplicate.status)) {
          await tx
            .delete(schema.bookings)
            .where(eq(schema.bookings.id, duplicate.id));
        }

        const inserted = await tx.insert(schema.bookings).values({
          memberId: visitorId,
          scheduleId: slot.scheduleId,
          bookingDate: slot.sessionDate,
          status: "reservado",
          source: "wellhub",
        });
        return {
          decision: "RESERVED",
          rejectionCategory: null,
          bookingId: Number(inserted[0].insertId),
        };
      },
    );
    const { decision, rejectionCategory, bookingId } = outcome;

    await this.db.insert(schema.wellhubBookings).values({
      bookingNumber,
      bookingId,
      userId: visitorId,
      wellhubSlotRowId: slot.rowId,
      // 'pending' hasta que el PATCH de confirmación salga bien; el rechazo
      // se registra final (si el PATCH de rechazo falla, Wellhub auto-rechaza
      // a los 15 minutos igual).
      status: decision === "RESERVED" ? "pending" : "rejected",
    });

    await this.client.validateBooking({
      gymId: slot.gymId,
      bookingNumber,
      classId: slot.wellhubClassId,
      decision,
      ...(decision === "REJECTED" && rejectionCategory === "CLASS_IS_FULL"
        ? { reason: "Clase completa", reasonCategory: rejectionCategory }
        : {}),
      ...(decision === "REJECTED" && rejectionCategory === "USER_ALREADY_BOOKED"
        ? {
            reason: "Ya tenés una reserva en esta clase",
            reasonCategory: rejectionCategory,
          }
        : {}),
    });

    if (decision === "RESERVED") {
      await this.db
        .update(schema.wellhubBookings)
        .set({ status: "confirmed" })
        .where(eq(schema.wellhubBookings.bookingNumber, bookingNumber));
      emitOccupancyChange({
        scheduleId: slot.scheduleId,
        date: slot.sessionDate,
      });
      this.log.info(
        { bookingNumber, bookingId, visitorId, scheduleId: slot.scheduleId },
        "Reserva Wellhub confirmada",
      );
      return { httpStatus: 200, outcome: "processed" };
    }

    this.log.info(
      { bookingNumber, visitorId, rejectionCategory },
      "Reserva Wellhub rechazada",
    );
    return {
      httpStatus: 200,
      outcome: "processed",
      detail: `rechazada_${rejectionCategory ?? "otro"}`,
    };
  }

  /** Cancelación (normal o tardía) originada en Wellhub. */
  private async handleBookingCanceled(
    eventType: string,
    data: WellhubBookingEventData,
  ): Promise<WebhookHandleResult> {
    const bookingNumber = data.slot?.booking_number;
    if (!bookingNumber) {
      return {
        httpStatus: 200,
        outcome: "skipped",
        detail: "payload_incompleto",
      };
    }

    const newStatus =
      eventType === "booking-late-canceled" ? "late_canceled" : "canceled";

    const [wb] = await this.db
      .select({
        id: schema.wellhubBookings.id,
        status: schema.wellhubBookings.status,
        bookingId: schema.wellhubBookings.bookingId,
      })
      .from(schema.wellhubBookings)
      .where(eq(schema.wellhubBookings.bookingNumber, bookingNumber))
      .limit(1);

    if (!wb) {
      this.log.warn(
        { bookingNumber, eventType },
        "Cancelación Wellhub de una reserva desconocida",
      );
      return {
        httpStatus: 200,
        outcome: "skipped",
        detail: "reserva_desconocida",
      };
    }

    if (wb.status === newStatus) {
      return { httpStatus: 200, outcome: "duplicate" };
    }

    if (wb.bookingId !== null) {
      const [booking] = await this.db
        .select({
          id: schema.bookings.id,
          status: schema.bookings.status,
          scheduleId: schema.bookings.scheduleId,
          bookingDate: schema.bookings.bookingDate,
        })
        .from(schema.bookings)
        .where(eq(schema.bookings.id, wb.bookingId))
        .limit(1);

      if (booking && booking.status !== "cancelado") {
        await this.db
          .update(schema.bookings)
          .set({ status: "cancelado", cancelledAt: new Date() })
          .where(eq(schema.bookings.id, booking.id));
        await this.bookingService.promoteWaitlist(
          booking.scheduleId,
          booking.bookingDate,
        );
        emitOccupancyChange({
          scheduleId: booking.scheduleId,
          date: booking.bookingDate,
        });
      }
    }

    await this.db
      .update(schema.wellhubBookings)
      .set({ status: newStatus })
      .where(eq(schema.wellhubBookings.id, wb.id));

    this.log.info(
      { bookingNumber, eventType },
      "Cancelación Wellhub procesada",
    );
    return { httpStatus: 200, outcome: "processed" };
  }

  /** Slot publicado por nosotros, con todo lo necesario para operar la API. */
  private async findPublishedSlot(wellhubSlotId: number): Promise<{
    rowId: number;
    scheduleId: number;
    sessionDate: string;
    totalCapacity: number;
    wellhubClassId: number;
    branchId: number;
    gymId: number;
  } | null> {
    const [slot] = await this.db
      .select({
        rowId: schema.wellhubSlots.id,
        scheduleId: schema.wellhubSlots.scheduleId,
        sessionDate: schema.wellhubSlots.sessionDate,
        totalCapacity: schema.wellhubSlots.totalCapacity,
        wellhubClassId: schema.wellhubClasses.wellhubClassId,
        branchId: schema.wellhubClasses.branchId,
        gymId: schema.branches.wellhubGymId,
      })
      .from(schema.wellhubSlots)
      .innerJoin(
        schema.wellhubClasses,
        eq(schema.wellhubSlots.wellhubClassRowId, schema.wellhubClasses.id),
      )
      .innerJoin(
        schema.branches,
        eq(schema.wellhubClasses.branchId, schema.branches.id),
      )
      .where(eq(schema.wellhubSlots.wellhubSlotId, wellhubSlotId))
      .limit(1);

    if (!slot || slot.gymId === null) return null;
    return { ...slot, gymId: slot.gymId };
  }

  // ─── Visitantes ────────────────────────────────────────────────────────────

  private async findBranchByGymId(
    gymId: number,
  ): Promise<{ id: number; timezone: string } | null> {
    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        timezone: schema.branches.timezone,
      })
      .from(schema.branches)
      .where(eq(schema.branches.wellhubGymId, gymId))
      .limit(1);
    return branch ?? null;
  }

  /**
   * Resuelve el users.id del visitante Wellhub:
   *   1. Por gympass_id (visitante ya conocido).
   *   2. Por email (socio/usuario existente → se le vincula el gympass_id;
   *      la visita queda en su cuenta pero sin efectos de membresía).
   *   3. Alta nueva con status='wellhub', fuera del pipeline de leads
   *      (lead_status NULL) y con password aleatoria (no puede loguearse).
   */
  async findOrCreateVisitor(
    user: WellhubWebhookUser,
    branchId: number,
  ): Promise<number> {
    const [byGympassId] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.gympassId, user.unique_token))
      .limit(1);
    if (byGympassId) return byGympassId.id;

    const email = user.email?.trim().toLowerCase();
    if (email) {
      const [byEmail] = await this.db
        .select({ id: schema.users.id, gympassId: schema.users.gympassId })
        .from(schema.users)
        .where(
          and(eq(schema.users.email, email), isNull(schema.users.deletedAt)),
        )
        .limit(1);
      if (byEmail) {
        if (!byEmail.gympassId) {
          await this.db
            .update(schema.users)
            .set({ gympassId: user.unique_token })
            .where(eq(schema.users.id, byEmail.id));
          this.log.info(
            { userId: byEmail.id },
            "Usuario existente vinculado a Wellhub por email",
          );
        }
        return byEmail.id;
      }
    }

    // Nombre: checkin manda first/last, booking-requested manda "name" junto.
    let firstName = user.first_name?.trim() ?? null;
    let lastName = user.last_name?.trim() ?? null;
    if (!firstName && user.name) {
      const parts = user.name.trim().split(/\s+/);
      firstName = parts[0] ?? null;
      lastName = parts.slice(1).join(" ") || null;
    }

    const passwordHash = await argon2.hash(randomBytes(32).toString("hex"));

    try {
      const userId = await this.db.transaction(async (tx) => {
        const result = await tx.insert(schema.users).values({
          passwordHash,
          firstName,
          lastName,
          email: email ?? null,
          phone: user.phone_number?.trim() || null,
          branchId,
          branchUpdatedAt: new Date(),
          branchSource: "auto" as const,
          role: "member",
          status: "wellhub" as const,
          gympassId: user.unique_token,
        });
        const newUserId = Number(result[0].insertId);

        await tx.insert(schema.userStatusHistory).values({
          userId: newUserId,
          fromStatus: null,
          toStatus: "wellhub",
          source: "wellhub",
        });

        return newUserId;
      });

      this.log.info({ userId, branchId }, "Visitante Wellhub creado");
      return userId;
    } catch (err: unknown) {
      // Carrera entre dos webhooks del mismo usuario nuevo: la unique key de
      // gympass_id tumba el segundo INSERT — re-resolvemos por lookup.
      const [retry] = await this.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.gympassId, user.unique_token))
        .limit(1);
      if (retry) return retry.id;
      throw err;
    }
  }
}
