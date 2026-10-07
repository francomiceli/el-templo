// Módulo: referrals — contrato de tipos de las reglas de Invitaciones (Fase 194).
// Lo consumen la activación (194-09), la app (194-10) y el canal asistido
// (194-12). Copy visible: siempre "invitación/invitar/invitado" (rebrand D-18).
import { ConflictError } from "../shared/errors";

/**
 * Código estable de por qué una invitación no se puede activar. Es el
 * discriminador que app y admin usan para mostrar lo mismo; el copy vive en
 * {@link INELIGIBLE_MESSAGES}.
 */
export type InvitationIneligibleReason =
  | "inviter_not_found"
  | "inviter_not_member"
  | "inviter_quota_exhausted"
  | "self_invite"
  | "invitee_is_member"
  | "invitee_recent_member"
  | "invitee_recent_invitation"
  | "phone_required"
  | "phone_taken"
  | "dni_taken";

/** Cupo mensual del invitador (D-10). `month` = 'YYYY-MM' en la tz de SU sede. */
export interface InviterQuota {
  limit: number;
  used: number;
  remaining: number;
  month: string;
}

/** Resultado de evaluar al invitado SIN lanzar (para `GET .../eligibility`). */
export interface EligibilityResult {
  eligible: boolean;
  reason: InvitationIneligibleReason | null;
  message: string | null;
}

/** Datos que el invitado/staff aporta y el servidor evalúa (nunca `tenantId`). */
export interface InviteeEligibilityInput {
  inviterId: number;
  invitedUserId: number;
  phone: string;
  dni?: string | null;
  /**
   * Sede elegida para entrenar: define la tz del "hoy" de las reglas de
   * historial. Si falta se usa la sede actual del invitado.
   */
  branchId?: number;
}

/** Entrada de la activación (194-09/10/12). */
export interface ActivateInvitationInput {
  inviterId?: number;
  code?: string;
  invitedUserId: number;
  branchId: number;
  phone: string;
  dni?: string | null;
  channel: "self_service" | "assisted";
  createdBy: number | null;
}

/** Entrada de la consulta previa de la app (194-10). `branchId` = sede destino elegida. */
export interface ActivationPreviewInput {
  code: string;
  invitedUserId: number;
  branchId?: number;
}

/** Sede física que la app ofrece en el selector de activación. */
export interface InvitationBranchOption {
  id: number;
  name: string;
  country: string;
}

/**
 * Lo que `GET .../invitations/eligibility` devuelve a la app (194-10). Solo el
 * nombre de pila del invitador: sin apellido ni id (T-194-35).
 */
export interface ActivationPreview extends EligibilityResult {
  inviterFirstName: string | null;
  branches: InvitationBranchOption[];
  /** `classes_per_week` del plan Invitación del país de referencia; null si no se puede saber todavía. */
  accessesBudget: number | null;
  accessBusinessDays: number;
}

/** Resultado de una activación exitosa (194-09). */
export interface ActivatedInvitation {
  invitationId: number;
  subscriptionId: number;
  /** Último día de los accesos ('YYYY-MM-DD'): día hábil N en la sede elegida. */
  accessExpiresOn: string;
  classesBudget: number | null;
  /** Sede física a la que quedó asignado el invitado. */
  branchId: number;
}

/** Entrada de la anulación por staff (D-04): rastro obligatorio, sin DELETE. */
export interface VoidInvitationInput {
  /** `users.id` del staff que anula. */
  voidedBy: number;
  /** Motivo libre (máx. 64 caracteres: columna `void_reason`). */
  reason: string;
}

/** `void_reason` que deja la compensación de una activación fallida (T-194-33). */
export const ACTIVATION_FAILED_REASON = "activation_failed";

/**
 * Mensajes en español (voseo). Genéricos por motivo: jamás nombre ni dato de
 * la otra cuenta que ya tiene el teléfono/DNI (T-194-28).
 */
export const INELIGIBLE_MESSAGES: Record<InvitationIneligibleReason, string> = {
  inviter_not_found: "No encontramos al socio que hace la invitación.",
  inviter_not_member:
    "Para invitar necesitás tener una membresía vigente. Renová la tuya y volvé a intentarlo.",
  inviter_quota_exhausted:
    "Ya usaste todas tus invitaciones de este mes. El mes que viene vas a tener nuevas.",
  self_invite: "No podés invitarte a vos mismo.",
  invitee_is_member:
    "Esta persona ya tiene una membresía vigente, por eso no se la puede invitar.",
  invitee_recent_member:
    "Esta persona tuvo una membresía hace poco, así que todavía no puede recibir una invitación.",
  invitee_recent_invitation:
    "Esta persona ya recibió una invitación hace poco, así que todavía no puede recibir otra.",
  phone_required: "El teléfono es obligatorio para activar una invitación.",
  phone_taken:
    "Ese teléfono ya está registrado en otra cuenta. Pedí ayuda en recepción para activar la invitación.",
  dni_taken:
    "Ese DNI ya está registrado en otra cuenta. Pedí ayuda en recepción para activar la invitación.",
};

/**
 * Copy para el INVITADO (la persona que activa su invitación en la app), en segunda
 * persona. Los motivos del lado del invitador (cupo, membresía) NO revelan su estado:
 * el invitado no tiene por qué saber si a quien lo invitó se le acabó el cupo o venció
 * su membresía (ME-03). El staff del canal asistido sigue viendo el detalle de
 * {@link INELIGIBLE_MESSAGES}.
 */
const INVITER_UNAVAILABLE_FOR_INVITEE =
  "Esta invitación no está disponible en este momento. Pedile a quien te invitó que te mande otra más adelante.";

export const INVITEE_MESSAGES: Record<InvitationIneligibleReason, string> = {
  inviter_not_found:
    "No encontramos esa invitación. Revisá que el código esté bien escrito.",
  inviter_not_member: INVITER_UNAVAILABLE_FOR_INVITEE,
  inviter_quota_exhausted: INVITER_UNAVAILABLE_FOR_INVITEE,
  self_invite: "No podés usar tu propio código de invitación.",
  invitee_is_member:
    "Ya tenés una membresía vigente, por eso no necesitás una invitación.",
  invitee_recent_member:
    "Tuviste una membresía hace poco, así que todavía no podés recibir una invitación.",
  invitee_recent_invitation:
    "Ya recibiste una invitación hace poco, así que todavía no podés recibir otra.",
  phone_required: INELIGIBLE_MESSAGES.phone_required,
  phone_taken: INELIGIBLE_MESSAGES.phone_taken,
  dni_taken: INELIGIBLE_MESSAGES.dni_taken,
};

/**
 * Error de regla de negocio de Invitaciones (409). Transporta el `reason`
 * estable para que la ruta lo serialice y el front muestre el mensaje correcto.
 * Extiende {@link ConflictError} (plan 194-08): todas las reglas dan 409.
 */
export class InvitationRuleError extends ConflictError {
  readonly reason: InvitationIneligibleReason;

  constructor(reason: InvitationIneligibleReason) {
    super(INELIGIBLE_MESSAGES[reason]);
    this.reason = reason;
  }
}
