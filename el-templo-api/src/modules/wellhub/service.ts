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
import { and, eq, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { todayInTz } from "../shared/date-utils";
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
    _data: WellhubBookingEventData,
  ): Promise<WebhookHandleResult> {
    // Se implementa con la publicación de slots (siguiente etapa de la
    // integración). Mientras tanto los eventos quedan logueados en
    // wellhub_events como 'skipped' — Wellhub auto-rechaza la solicitud a los
    // 15 minutos, que es el comportamiento seguro.
    this.log.warn(
      { eventType },
      "Webhook de reservas Wellhub recibido pero aún no soportado",
    );
    return {
      httpStatus: 200,
      outcome: "skipped",
      detail: "booking_no_soportado",
    };
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
