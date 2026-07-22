/**
 * Wellhub — cliente HTTP de la API de partners.
 *
 * fetch nativo de Node (no hay ningún cliente HTTP en el proyecto; decisión
 * deliberada de no sumar dependencias). Auth: `Authorization: Bearer api_key`.
 * Base URL configurable (sandbox por default, ver config.ts).
 *
 * Endpoints según colecciones Postman oficiales del sandbox (2026-07-21):
 *   - POST /access/v1/validate                    (Access Control, X-Gym-Id)
 *   - GET  /setup/v1/gyms/{gym}/products          (product_id para classes)
 *   - CRUD /booking/v1/gyms/{gym}/classes[/slots] (publicación de clases)
 *   - PATCH /booking/v{1,2}/gyms/{gym}/bookings/{booking_number}
 *     v1 usa status numérico (2/3/5), v2 usa "RESERVED"/"REJECTED" +
 *     reason_category. Ambos existen en el sandbox; WELLHUB_BOOKING_API
 *     (default v2, la documentación vigente) decide cuál usamos.
 */

import type { FastifyBaseLogger } from "fastify";
import type { WellhubConfig } from "./config";
import type {
  WellhubBookingDecision,
  WellhubClass,
  WellhubClassPayload,
  WellhubProduct,
  WellhubRejectionCategory,
  WellhubSlot,
  WellhubSlotPayload,
} from "./types";
import { WELLHUB_BOOKING_STATUS_V1 } from "./types";

export class WellhubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = "WellhubApiError";
  }
}

interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
}

export class WellhubClient {
  constructor(
    private config: WellhubConfig,
    private log: FastifyBaseLogger,
  ) {}

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        Accept: "application/json",
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    if (!response.ok) {
      this.log.error(
        { method, path, status: response.status, body: text },
        "Wellhub API request failed",
      );
      throw new WellhubApiError(
        `Wellhub API ${method} ${path} -> ${response.status}`,
        response.status,
        text,
      );
    }

    if (text.length === 0) return undefined as T;
    return JSON.parse(text) as T;
  }

  // ─── Access Control API ────────────────────────────────────────────────────

  /**
   * Valida el ingreso de un usuario Wellhub (genera la transacción
   * facturable). Requiere check-in previo del usuario en la app de Wellhub.
   */
  async validateCheckin(
    gymId: number,
    gympassId: string,
  ): Promise<{ validatedAt: string | null }> {
    const result = await this.request<{
      results?: { validated_at?: string };
    }>("POST", "/access/v1/validate", {
      headers: { "X-Gym-Id": String(gymId) },
      body: { gympass_id: gympassId },
    });
    return { validatedAt: result?.results?.validated_at ?? null };
  }

  // ─── Partner Products ──────────────────────────────────────────────────────

  async listProducts(gymId: number): Promise<WellhubProduct[]> {
    const result = await this.request<{ products?: WellhubProduct[] }>(
      "GET",
      `/setup/v1/gyms/${gymId}/products`,
    );
    return result?.products ?? [];
  }

  // ─── Booking API: classes ──────────────────────────────────────────────────

  async listClasses(gymId: number): Promise<WellhubClass[]> {
    const result = await this.request<{ classes?: WellhubClass[] }>(
      "GET",
      `/booking/v1/gyms/${gymId}/classes`,
    );
    return result?.classes ?? [];
  }

  async createClasses(
    gymId: number,
    classes: WellhubClassPayload[],
  ): Promise<WellhubClass[]> {
    const result = await this.request<{ classes?: WellhubClass[] }>(
      "POST",
      `/booking/v1/gyms/${gymId}/classes`,
      { body: { classes } },
    );
    return result?.classes ?? [];
  }

  async updateClass(
    gymId: number,
    classId: number,
    payload: WellhubClassPayload,
  ): Promise<void> {
    await this.request<unknown>(
      "PUT",
      `/booking/v1/gyms/${gymId}/classes/${classId}/`,
      { body: payload },
    );
  }

  // ─── Booking API: slots ────────────────────────────────────────────────────

  /**
   * Slots publicados de una class (envelope {metadata, results}).
   * OJO (verificado 2026-07-22): sin from/to el API devuelve SOLO los slots
   * del día; para otros días el rango es obligatorio (datetime ISO completo).
   */
  async listSlots(
    gymId: number,
    classId: number,
    range?: { from: Date; to: Date },
  ): Promise<WellhubSlot[]> {
    const query = range
      ? `?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`
      : "";
    const result = await this.request<{ results?: WellhubSlot[] }>(
      "GET",
      `/booking/v1/gyms/${gymId}/classes/${classId}/slots${query}`,
    );
    return result?.results ?? [];
  }

  /**
   * El sandbox real envuelve el slot creado en {metadata, results: [slot]}
   * (verificado 2026-07-22); se tolera también el slot pelado por si otra
   * versión de la API responde plano.
   */
  async createSlot(
    gymId: number,
    classId: number,
    payload: WellhubSlotPayload,
  ): Promise<WellhubSlot> {
    const result = await this.request<
      { results?: WellhubSlot[] } | WellhubSlot
    >("POST", `/booking/v1/gyms/${gymId}/classes/${classId}/slots`, {
      body: payload,
    });
    if (result && "results" in result && Array.isArray(result.results)) {
      return result.results[0];
    }
    return result as WellhubSlot;
  }

  async patchSlot(
    gymId: number,
    classId: number,
    slotId: number,
    payload: { total_capacity?: number; total_booked?: number },
  ): Promise<void> {
    await this.request<unknown>(
      "PATCH",
      `/booking/v1/gyms/${gymId}/classes/${classId}/slots/${slotId}`,
      { body: payload },
    );
  }

  async deleteSlot(
    gymId: number,
    classId: number,
    slotId: number,
  ): Promise<void> {
    await this.request<unknown>(
      "DELETE",
      `/booking/v1/gyms/${gymId}/classes/${classId}/slots/${slotId}`,
    );
  }

  // ─── Booking API: confirmar/rechazar solicitudes ───────────────────────────

  /**
   * Responde una solicitud de reserva (webhook booking-requested). Ventana
   * dura de 15 minutos: pasada esa ventana Wellhub rechaza automáticamente.
   */
  async validateBooking(input: {
    gymId: number;
    bookingNumber: string;
    classId: number;
    decision: WellhubBookingDecision;
    reason?: string;
    reasonCategory?: WellhubRejectionCategory;
  }): Promise<void> {
    const version = process.env.WELLHUB_BOOKING_API === "v1" ? "v1" : "v2";
    if (version === "v1") {
      await this.request<unknown>(
        "PATCH",
        `/booking/v1/gyms/${input.gymId}/bookings/${input.bookingNumber}`,
        {
          body: {
            class_id: input.classId,
            status:
              input.decision === "RESERVED"
                ? WELLHUB_BOOKING_STATUS_V1.reserved
                : WELLHUB_BOOKING_STATUS_V1.rejected,
            ...(input.reason ? { reason: input.reason } : {}),
          },
        },
      );
      return;
    }

    await this.request<unknown>(
      "PATCH",
      `/booking/v2/gyms/${input.gymId}/bookings/${input.bookingNumber}`,
      {
        body: {
          status: input.decision,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.reasonCategory
            ? { reason_category: input.reasonCategory }
            : {}),
        },
      },
    );
  }

  /** Cancelación originada por el gym (v1 status 5), ej. clase cancelada. */
  async cancelBookingByGym(input: {
    gymId: number;
    bookingNumber: string;
    classId: number;
    reason?: string;
  }): Promise<void> {
    await this.request<unknown>(
      "PATCH",
      `/booking/v1/gyms/${input.gymId}/bookings/${input.bookingNumber}`,
      {
        body: {
          class_id: input.classId,
          status: WELLHUB_BOOKING_STATUS_V1.canceledByGym,
          ...(input.reason ? { reason: input.reason } : {}),
        },
      },
    );
  }
}
