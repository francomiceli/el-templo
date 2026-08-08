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
 *
 * Tenancy (fase 169, CON-04): este webhook es el único camino de ESCRITURA que
 * entra sin sesión, así que el gimnasio dueño de lo que se crea se deriva
 * SERVER-SIDE y nunca del payload:
 *
 *   event_data.gym.id → branches.wellhub_gym_id → branches.tenant_id → tenants.status
 *
 * Wellhub no manda un gimnasio nuestro: manda SU gym.id, y el mapeo vive en
 * nuestra DB. Si un día el payload trajera un `tenant_id`, se ignora (T-169-21).
 * El corte por estado comercial (D-05) se aplica ANTES de crear un usuario o una
 * asistencia; el contrato de 200 `skipped` para el gym sin mapear NO cambia
 * (D-04) — ver `resolverTenant` más abajo.
 */

import argon2 from "argon2";
import { randomBytes } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { todayInTz } from "../shared/date-utils";
import { emitOccupancyChange } from "../shared/occupancy-events";
import { tenantValues, tenantWhere, type TenantContext } from "../shared/tenant";
import { assertBranchDelGimnasio } from "../shared/branch-consistency";
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
  /**
   * Fase 169 (CON-04): gimnasio dueño del evento, DERIVADO server-side del
   * `gym.id` del payload. Lo devuelve TODO camino que llegó a derivarlo — incluido
   * el que corta por gimnasio no activo, que igual sabe de quién era el evento.
   *
   * Queda `undefined` en los caminos que cortan ANTES de poder derivarlo (payload
   * incompleto, gym sin sede mapeada, tipo de evento desconocido, slot que no
   * publicamos nosotros): ahí la fila de `wellhub_events` no se estampa y conserva
   * su DEFAULT en vez de mentir con un tenant inventado.
   */
  tenantId?: number;
}

/**
 * Fase 169 (CON-04/D-05): resultado de la derivación del tenant del webhook.
 *
 * O sale el {@link TenantContext} con el que sigue el procesamiento, o sale el
 * `WebhookHandleResult` de corte ya armado (siempre 200 `skipped`, ver
 * {@link WellhubService.resolverTenant}). Unión discriminada a propósito: no hay
 * forma de seguir procesando "olvidándose" de mirar el corte.
 */
type TenantGate =
  | { ok: true; ctx: TenantContext }
  | { ok: false; corte: WebhookHandleResult };

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
        // La fila del evento NACE ANTES de saber de qué gimnasio es: la
        // idempotencia se resuelve por `event_id`, que es una unique GLOBAL
        // (motivo M8 registrado en `src/db/tenant-tables.ts:239-240`), y
        // componerla por tenant sería circular — el tenant se deriva del
        // `gym.id`, que recién se lee en el dispatch de más abajo. Por eso este
        // INSERT no pasa por `tenantValues`: el `UPDATE` de cierre estampa el
        // tenant DERIVADO cuando el dispatch lo devuelve.
        /* tenant-safe: idempotencia global previa a la derivacion del tenant (M8) */
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
          // Estampado del tenant DERIVADO (T-169-25): sólo si el dispatch llegó
          // a resolverlo. Si no vino, la columna no se toca y la fila queda con
          // su DEFAULT 1 — preferible a escribir un dueño que no sabemos.
          ...(result.tenantId !== undefined
            ? { tenantId: result.tenantId }
            : {}),
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

  // ─── Derivación del tenant (CON-04) ────────────────────────────────────────

  /**
   * Evalúa el gimnasio ya derivado de la sede y decide si el evento se procesa.
   *
   * Única implementación de la tabla de corte de la fase 169 — la usan los DOS
   * caminos que crean datos (`handleCheckin` y `handleBookingRequested`), así que
   * la política no puede desincronizarse entre ellos:
   *
   * | Caso                        | HTTP | outcome | detail                |
   * | --------------------------- | ---- | ------- | --------------------- |
   * | `tenantStatus == null`      | 200  | skipped | `tenant_no_resoluble` |
   * | `tenantStatus !== "active"` | 200  | skipped | `tenant_no_activo`    |
   *
   * (El tercer caso de la tabla, el gym sin sede mapeada, corta ANTES de llegar
   * acá: no hay fila de `branches` de la que derivar nada. D-04 conserva ese
   * camino literalmente como estaba.)
   *
   * Los dos cortes son 200 y no 4xx a propósito (D-04): un 4xx haría que Wellhub
   * reintente eternamente un evento que jamás va a poder procesarse. El
   * fail-closed es LÓGICO — no se crea ni un usuario ni una asistencia — no de
   * transporte.
   *
   * La comparación es POSITIVA contra `"active"` y no una exclusión de la lista
   * de estados malos: un estado que se agregue al enum de `tenants.status` en el
   * futuro queda denegado por default en vez de colarse. Mismo criterio que
   * `country-scope.ts:180-184` y que `listActiveTenants` (`shared/tenant.ts`).
   *
   * @param tenantStatus el `status` del gimnasio; `null` significa que el
   *   `leftJoin` a `tenants` no matcheó, o sea corrupción de datos (la FK lo
   *   vuelve imposible en la práctica) — se loguea `error` y se deniega, mismo
   *   criterio fail-closed que `country-scope.ts:169-179`.
   */
  private resolverTenant(input: {
    gymId: number;
    branchId: number;
    tenantId: number;
    tenantStatus: string | null;
  }): TenantGate {
    const { gymId, branchId, tenantId, tenantStatus } = input;

    if (tenantStatus == null) {
      this.log.error(
        { gymId, branchId },
        "Webhook Wellhub sobre una sede con gimnasio no resoluble (corrupción de datos)",
      );
      return {
        ok: false,
        // Sin `tenantId`: el gimnasio de la sede apunta a una fila que no
        // existe, así que estampar ese id en `wellhub_events` sería registrar un
        // dueño falso (y chocaría con la FK de la columna).
        corte: {
          httpStatus: 200,
          outcome: "skipped",
          detail: "tenant_no_resoluble",
        },
      };
    }

    if (tenantStatus !== "active") {
      this.log.warn(
        { gymId, branchId, tenantId, tenantStatus },
        "Webhook Wellhub para un gimnasio no activo, ignorado",
      );
      return {
        ok: false,
        corte: {
          httpStatus: 200,
          outcome: "skipped",
          detail: "tenant_no_activo",
          tenantId,
        },
      };
    }

    return { ok: true, ctx: { tenantId } };
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

    // Fase 169 (D-05): el corte por estado comercial va ANTES de tocar `users`.
    // Un gimnasio suspendido o archivado no puede dar de alta un visitante ni
    // registrar una asistencia (T-169-22) — por eso esto precede a
    // `findOrCreateVisitor` y a la llamada facturable a Wellhub.
    const gate = this.resolverTenant({
      gymId,
      branchId: branch.id,
      tenantId: branch.tenantId,
      tenantStatus: branch.tenantStatus,
    });
    if (!gate.ok) return gate.corte;
    const ctx = gate.ctx;

    const userId = await this.findOrCreateVisitor(ctx, data.user, branch.id);
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
      return {
        httpStatus: 200,
        outcome: "already_checked_in",
        tenantId: ctx.tenantId,
      };
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
          tenantId: ctx.tenantId,
        };
      }
      throw err;
    }

    // Reserva del día en esta sede (flujo checkin-booking-occurred, o un
    // checkin suelto de alguien que había reservado): se confirma con la
    // asistencia para que el cron de no-shows no la marque como ausente.
    const [todayBooking] = await this.db
      .select({
        id: schema.bookings.id,
        scheduleId: schema.bookings.scheduleId,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .where(
        and(
          eq(schema.bookings.memberId, userId),
          eq(schema.bookings.bookingDate, todayStr),
          eq(schema.schedules.branchId, branch.id),
          inArray(schema.bookings.status, ["reservado", "qr_escaneado"]),
        ),
      )
      .limit(1);

    // Visita Wellhub: la fila de attendance (ligada a la reserva si existe) y
    // la confirmación de esa reserva. Nada de classesRemaining / AURA /
    // completed_sessions (no es socio).
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
        scheduleId: todayBooking?.scheduleId ?? null,
        sessionDate: todayStr,
        status: "confirmado",
        source: "wellhub",
        checkedInAt: now,
      });

      if (todayBooking) {
        await tx
          .update(schema.bookings)
          .set({ status: "confirmado" })
          .where(eq(schema.bookings.id, todayBooking.id));
      }
    });

    this.log.info(
      {
        userId,
        branchId: branch.id,
        gymId,
        tenantId: ctx.tenantId,
        sessionDate: todayStr,
      },
      "Visita Wellhub registrada",
    );
    return { httpStatus: 200, outcome: "processed", tenantId: ctx.tenantId };
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

    // Fase 169 (D-05): mismo corte que el check-in, con la misma implementación,
    // ANTES de `findOrCreateVisitor` y de cualquier `validateBooking` de este
    // camino. Un gimnasio no activo no da de alta un visitante ni ocupa un cupo.
    //
    // No se le manda el PATCH de rechazo a Wellhub a propósito: la ventana dura
    // de 15 minutos auto-rechaza la solicitud, que es exactamente el resultado
    // correcto para un gimnasio suspendido — y un PATCH desde un gimnasio cortado
    // sería operar en su nombre.
    const gate = this.resolverTenant({
      gymId: slot.gymId,
      branchId: slot.branchId,
      tenantId: slot.tenantId,
      tenantStatus: slot.tenantStatus,
    });
    if (!gate.ok) return gate.corte;
    const ctx = gate.ctx;

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
        return { httpStatus: 200, outcome: "duplicate", tenantId: ctx.tenantId };
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
        tenantId: ctx.tenantId,
      };
    }

    const visitorId = await this.findOrCreateVisitor(
      ctx,
      data.user,
      slot.branchId,
    );

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
        {
          bookingNumber,
          bookingId,
          visitorId,
          tenantId: ctx.tenantId,
          scheduleId: slot.scheduleId,
        },
        "Reserva Wellhub confirmada",
      );
      return { httpStatus: 200, outcome: "processed", tenantId: ctx.tenantId };
    }

    this.log.info(
      { bookingNumber, visitorId, tenantId: ctx.tenantId, rejectionCategory },
      "Reserva Wellhub rechazada",
    );
    return {
      httpStatus: 200,
      outcome: "processed",
      detail: `rechazada_${rejectionCategory ?? "otro"}`,
      tenantId: ctx.tenantId,
    };
  }

  /**
   * Cancelación (normal o tardía) originada en Wellhub.
   *
   * Fase 169 (T-169-26) — este camino NO se corta por estado del gimnasio, a
   * diferencia del check-in y del `booking-requested`, y es deliberado: una
   * cancelación LIBERA el cupo de una reserva que YA existe. Bloquearla porque el
   * gimnasio quedó suspendido dejaría cupo fantasma en nuestra grilla (una
   * reserva viva de alguien que ya se fue) y la lista de espera nunca correría.
   * La fila de `wellhub_bookings` además ya nació con su tenant cuando se creó.
   *
   * El criterio general de la fase: el corte comercial aplica a lo que CREA
   * datos, no a lo que los libera. Por eso acá tampoco se deriva un
   * `TenantContext` — no hay nada que estampar que no esté ya estampado.
   */
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

  /**
   * Slot publicado por nosotros, con todo lo necesario para operar la API.
   *
   * Fase 169 (CON-04): trae además el gimnasio dueño de la sede del slot
   * (`tenantId`) y su estado comercial (`tenantStatus`), para que
   * {@link WellhubService.resolverTenant} pueda cortar sin una segunda query.
   *
   * El join a `tenants` es LEFT a propósito, mismo criterio que
   * `country-scope.ts:143-149`: con un join estricto, una sede cuyo gimnasio no
   * resuelva haría desaparecer la fila entera y el slot se trataría como "no
   * publicado" — un camino que ADEMÁS le manda un PATCH de rechazo a Wellhub. Con
   * LEFT, el slot se encuentra igual y el problema de datos cae al camino
   * fail-closed explícito (`tenant_no_resoluble`), que es visible en los logs.
   */
  private async findPublishedSlot(wellhubSlotId: number): Promise<{
    rowId: number;
    scheduleId: number;
    sessionDate: string;
    totalCapacity: number;
    wellhubClassId: number;
    branchId: number;
    gymId: number;
    tenantId: number;
    tenantStatus: string | null;
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
        tenantId: schema.branches.tenantId,
        tenantStatus: schema.tenants.status,
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
      .leftJoin(schema.tenants, eq(schema.branches.tenantId, schema.tenants.id))
      .where(eq(schema.wellhubSlots.wellhubSlotId, wellhubSlotId))
      .limit(1);

    if (!slot || slot.gymId === null) return null;
    return { ...slot, gymId: slot.gymId };
  }

  // ─── Visitantes ────────────────────────────────────────────────────────────

  /**
   * Sede mapeada a un gimnasio del catálogo de Wellhub.
   *
   * Fase 169 (CON-04): este lookup es el ESLABÓN de la derivación del tenant
   * (`gym.id` → `branches.wellhub_gym_id` → `branches.tenant_id`), así que
   * devuelve también el gimnasio dueño y su estado comercial.
   *
   * El join a `tenants` es LEFT a propósito, mismo criterio que
   * `country-scope.ts:143-149`: con un join estricto, una sede cuyo gimnasio no
   * resuelva haría desaparecer la fila entera y el evento caería en el camino
   * `gym_sin_sede` — un mensaje FALSO (la sede existe) que además esconde una
   * corrupción de datos detrás de un log rutinario. Con LEFT, la sede se
   * encuentra igual y el problema cae al camino fail-closed explícito
   * (`tenant_no_resoluble`, con `log.error`).
   */
  private async findBranchByGymId(gymId: number): Promise<{
    id: number;
    timezone: string;
    tenantId: number;
    tenantStatus: string | null;
  } | null> {
    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        timezone: schema.branches.timezone,
        tenantId: schema.branches.tenantId,
        tenantStatus: schema.tenants.status,
      })
      .from(schema.branches)
      .leftJoin(schema.tenants, eq(schema.branches.tenantId, schema.tenants.id))
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
   *
   * Fase 173 (ADO-07 / T-173-15-04): `ctx` llega de `resolverTenant` en los DOS
   * call sites (`handleCheckin`, `handleBookingRequested`) — el gimnasio del
   * webhook ya está resuelto y activo antes de tocar `users`.
   */
  async findOrCreateVisitor(
    ctx: TenantContext,
    user: WellhubWebhookUser,
    branchId: number,
  ): Promise<number> {
    // M8 (`TENANT_GLOBAL_UNIQUES`, doc 06 §8-Q4): `gympass_id` es un id de
    // plataforma EXTERNA, único a nivel de TODO el sistema a propósito — es lo
    // que impide que dos gimnasios reclamen al mismo visitante de Wellhub. Esta
    // lectura busca a propósito en todos los gimnasios; no es un olvido.
    /* tenant-safe: M8 (TENANT_GLOBAL_UNIQUES) — gympass_id es global por diseño, no por gimnasio */
    const [byGympassId] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.gympassId, user.unique_token))
      .limit(1);
    if (byGympassId) return byGympassId.id;

    const email = user.email?.trim().toLowerCase();
    if (email) {
      // T-173-15-04: a diferencia de `gympass_id`, el email es único POR
      // GIMNASIO desde la fase 168 (CON-01) — sin este filtro, un email
      // coincidente de OTRO gimnasio quedaría vinculado al gympass_id de este
      // webhook, mezclando la identidad de un socio ajeno con una visita de
      // ESTE gimnasio (fuga entre gimnasios, no solo un ancla desalineada).
      const [byEmail] = await this.db
        .select({ id: schema.users.id, gympassId: schema.users.gympassId })
        .from(schema.users)
        .where(
          and(
            tenantWhere(schema.users, ctx),
            eq(schema.users.email, email),
            isNull(schema.users.deletedAt),
          ),
        )
        .limit(1);
      if (byEmail) {
        if (!byEmail.gympassId) {
          await this.db
            .update(schema.users)
            .set({ gympassId: user.unique_token })
            .where(
              and(
                tenantWhere(schema.users, ctx),
                eq(schema.users.id, byEmail.id),
              ),
            );
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
        // Sitio de ancla #11 (D-05/ADO-07): `branchId` viene del mapeo
        // gym-de-Wellhub → sede que ya resolvió `resolverTenant`, pero se
        // revalida acá con el mismo resolvedor único que consumen los otros
        // 12 sitios (plan 173-11) en vez de confiar en que el llamador lo hizo
        // bien — y se escribe el `id` de la FILA RESUELTA, no el parámetro.
        const branch = await assertBranchDelGimnasio(ctx, branchId, tx);

        const result = await tx.insert(schema.users).values(
          tenantValues(ctx, {
            passwordHash,
            firstName,
            lastName,
            email: email ?? null,
            phone: user.phone_number?.trim() || null,
            branchId: branch.id,
            branchUpdatedAt: new Date(),
            branchSource: "auto" as const,
            role: "member",
            status: "wellhub" as const,
            gympassId: user.unique_token,
          }),
        );
        const newUserId = Number(result[0].insertId);

        await tx.insert(schema.userStatusHistory).values(
          tenantValues(ctx, {
            userId: newUserId,
            fromStatus: null,
            toStatus: "wellhub",
            source: "wellhub",
          }),
        );

        return newUserId;
      });

      this.log.info({ userId, branchId }, "Visitante Wellhub creado");
      return userId;
    } catch (err: unknown) {
      // Carrera entre dos webhooks del mismo usuario nuevo: la unique key de
      // gympass_id tumba el segundo INSERT — re-resolvemos por lookup.
      // Mismo motivo que `byGympassId` arriba: M8, global por diseño.
      /* tenant-safe: M8 (TENANT_GLOBAL_UNIQUES) — gympass_id es global por diseño, no por gimnasio */
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
