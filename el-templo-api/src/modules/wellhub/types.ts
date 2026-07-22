/**
 * Wellhub (ex Gympass) — tipos de la integración.
 *
 * Payloads de webhooks entrantes y respuestas de la API de partners, según
 * las colecciones Postman oficiales del sandbox (apitesting.partners.
 * gympass.com) descargadas 2026-07-21. El usuario Wellhub llega SIEMPRE como
 * `unique_token` (gympass_id de 13 dígitos); nombre/email/teléfono solo
 * vienen en checkin y booking-requested.
 */

// =============================================================================
// Webhooks entrantes
// =============================================================================

export interface WellhubWebhookUser {
  unique_token: string;
  first_name?: string;
  last_name?: string;
  /** booking-requested manda "name" (nombre completo) en vez de first/last. */
  name?: string;
  email?: string;
  phone_number?: string;
}

export interface WellhubCheckinEventData {
  user: WellhubWebhookUser;
  gym: {
    id: number;
    title?: string;
    product?: { id: number; description?: string };
  };
  /** Presente solo en checkin-booking-occurred. */
  booking?: { booking_number: string };
  location?: { lat: number; lon: number };
  timestamp: number;
  expires_at?: number;
}

export interface WellhubBookingEventData {
  user: WellhubWebhookUser;
  slot: {
    id: number;
    gym_id: number;
    class_id: number;
    booking_number: string;
  };
  timestamp: number;
  event_id?: string;
}

export type WellhubEventType =
  | "checkin"
  | "checkin-booking-occurred"
  | "booking-requested"
  | "booking-canceled"
  | "booking-late-canceled";

export interface WellhubWebhookEvent {
  event_type: WellhubEventType;
  event_data: WellhubCheckinEventData | WellhubBookingEventData;
}

// =============================================================================
// API de partners (salientes)
// =============================================================================

export interface WellhubProduct {
  product_id: number;
  name: string;
  updated_at?: string;
}

export interface WellhubClassPayload {
  name: string;
  description: string;
  notes?: string;
  bookable: boolean;
  visible: boolean;
  product_id: number;
  /** Campo libre del partner para linkear con nuestro sistema. */
  reference?: string;
  is_virtual?: boolean;
  categories?: number[];
}

export interface WellhubClass {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  bookable?: boolean;
  visible?: boolean;
  product_id?: number;
  gym_id?: number;
  reference?: string;
}

export interface WellhubSlotPayload {
  /** ISO con offset de la sede, ej. 2026-07-22T18:00:00-03:00. */
  occur_date: string;
  /** 1 = activo, 0 = inactivo. */
  status?: 0 | 1;
  room?: string;
  length_in_minutes: number;
  total_capacity: number;
  total_booked: number;
  product_id: number;
  booking_window?: { opens_at: string; closes_at: string };
  cancellable_until?: string;
  instructors?: Array<{ name: string; substitute: boolean }>;
}

export interface WellhubSlot {
  id: number;
  class_id: number;
  occur_date: string;
  status?: number;
  total_capacity: number;
  total_booked: number;
}

/** Estados de PATCH booking v1: 2 = reservado, 3 = rechazado, 5 = cancelado por el gym. */
export const WELLHUB_BOOKING_STATUS_V1 = {
  reserved: 2,
  rejected: 3,
  canceledByGym: 5,
} as const;

export type WellhubBookingDecision = "RESERVED" | "REJECTED";

export type WellhubRejectionCategory =
  | "CLASS_IS_FULL"
  | "USER_ALREADY_BOOKED"
  | "CLASS_NOT_FOUND"
  | "OTHER";
