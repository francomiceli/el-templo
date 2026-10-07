// Módulo: referrals — canal ASISTIDO de Invitaciones (Fase 194-12, D-16/D-24).
//
// Recepción/gestión crean la invitación EN NOMBRE de un socio desde el admin
// (ficha del invitado o alta "Nuevo en Prueba"). Este archivo NO tiene reglas
// propias: compone `InvitationService` (mismo `activate`, mismas reglas de cupo,
// elegibilidad e identidad que la app: SC-2) y solo agrega lo específico del
// canal — resolver el teléfono guardado del invitado, verificar que la
// invitación a anular sea de ese alumno y orquestar el alta de un lead con
// invitador. Vive aparte de `invitation-service.ts` a propósito (194-32): ese
// archivo no engorda.
//
// AISLAMIENTO: toda query lleva `tenantWhere`; `tenant_id` sale del `ctx` del
// servidor. `createdBy`/`voidedBy` los pone la ruta desde el JWT, nunca el body.
import { and, eq, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { AppError, NotFoundError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { InvitationService } from "./invitation-service";
import {
  ACTIVATION_FAILED_REASON,
  InvitationRuleError,
  type ActivatedInvitation,
  type InvitationIneligibleReason,
} from "./invitation-types";

type DbInstance = MySql2Database<typeof schema>;

/** Entrada de la activación asistida desde la ficha del invitado. */
export interface AssistedActivationInput {
  /** `users.id` del alumno que recibe los accesos (de la URL, ya validado en scope). */
  invitedUserId: number;
  /** `users.id` del socio que invita (del body, validado en el gimnasio y el scope de país). */
  inviterId: number;
  branchId: number;
  /** Si falta se usa el teléfono guardado del alumno; sin ninguno => `phone_required`. */
  phone?: string;
  dni?: string | null;
  /** `users.id` del staff: sale del JWT. */
  createdBy: number;
}

/** Por qué no se pudo activar la invitación DESPUÉS de crear el lead (alta "Nuevo en Prueba"). */
export interface AssistedInvitationError {
  reason: InvitationIneligibleReason | typeof ACTIVATION_FAILED_REASON;
  message: string;
}

/** Resultado del alta de un lead con invitador: el lead vale por sí mismo. */
export interface LeadWithInvitation<TLead> {
  lead: TLead;
  invitation: ActivatedInvitation | null;
  invitationError: AssistedInvitationError | null;
}

const ACTIVATION_FAILED_MESSAGE =
  "El alumno se creó, pero no se pudo activar la invitación. Probá cargarla desde su ficha.";

export class AssistedInvitations {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly invitations: InvitationService,
  ) {}

  /**
   * Activa una invitación asistida (D-16) para un alumno YA existente (p. ej.
   * un lead cargado por recepción sin email ni contraseña: D-06, no se crea
   * ninguna cuenta nueva). Canal `assisted`, `created_by` = el staff.
   */
  async activateForMember(
    ctx: TenantContext,
    input: AssistedActivationInput,
  ): Promise<ActivatedInvitation> {
    const phone =
      input.phone !== undefined && input.phone.trim() !== ""
        ? input.phone
        : await this.loadStoredPhone(ctx, input.invitedUserId);
    return this.invitations.activate(ctx, {
      inviterId: input.inviterId,
      invitedUserId: input.invitedUserId,
      branchId: input.branchId,
      phone,
      dni: input.dni,
      channel: "assisted",
      createdBy: input.createdBy,
    });
  }

  /**
   * Anula (D-04, sin DELETE) una invitación del alumno `invitedUserId`. Una
   * invitación de otro alumno o de otro gimnasio es indistinguible de una
   * inexistente (404): la URL no puede usarse para anular invitaciones ajenas.
   */
  async voidForMember(
    ctx: TenantContext,
    invitedUserId: number,
    invitationId: number,
    input: { voidedBy: number; reason: string },
  ): Promise<void> {
    const [row] = await this.db
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, ctx),
          eq(schema.invitations.id, invitationId),
          eq(schema.invitations.invitedUserId, invitedUserId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError("Invitación no encontrada");
    await this.invitations.voidInvitation(ctx, invitationId, input);
  }

  /**
   * D-24 "Lo invita": alta de un lead + invitación asistida.
   *
   *  1. ANTES de crear nada se valida al invitador (membresía vigente + cupo):
   *     si no puede invitar, la request falla y NO queda ningún lead.
   *  2. `createLead` crea el lead (con su propio dedupe).
   *  3. Se activa la invitación. Si falla (p. ej. sin plan Invitación del país o
   *     sede virtual) el lead YA existe y vale por sí mismo: se devuelve con
   *     `invitationError` en vez de perderlo.
   */
  async createLeadWithInvitation<TLead extends { id: number }>(
    ctx: TenantContext,
    params: {
      inviterId: number;
      branchId: number;
      phone: string;
      createdBy: number;
      createLead: () => Promise<TLead>;
    },
  ): Promise<LeadWithInvitation<TLead>> {
    await this.invitations.rules.assertInviterCanInvite(ctx, params.inviterId);

    const lead = await params.createLead();
    try {
      const invitation = await this.activateForMember(ctx, {
        invitedUserId: lead.id,
        inviterId: params.inviterId,
        branchId: params.branchId,
        phone: params.phone,
        createdBy: params.createdBy,
      });
      return { lead, invitation, invitationError: null };
    } catch (err: unknown) {
      return {
        lead,
        invitation: null,
        invitationError: this.toInvitationError(err, lead.id),
      };
    }
  }

  /** Reglas de negocio y errores de validación se muestran; el resto, genérico. */
  private toInvitationError(
    err: unknown,
    leadId: number,
  ): AssistedInvitationError {
    if (err instanceof InvitationRuleError) {
      return { reason: err.reason, message: err.message };
    }
    if (err instanceof AppError && err.statusCode < 500) {
      return { reason: ACTIVATION_FAILED_REASON, message: err.message };
    }
    this.log.error(
      {
        err: err instanceof Error ? err.message : String(err),
        leadId,
      },
      "invitaciones: el lead se creó pero la activación asistida falló",
    );
    return {
      reason: ACTIVATION_FAILED_REASON,
      message: ACTIVATION_FAILED_MESSAGE,
    };
  }

  /** Teléfono guardado del alumno ('' si no tiene: `activate` responde `phone_required`). */
  private async loadStoredPhone(
    ctx: TenantContext,
    userId: number,
  ): Promise<string> {
    const [row] = await this.db
      .select({ phone: schema.users.phone })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, userId),
          isNull(schema.users.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError("Alumno no encontrado");
    return row.phone ?? "";
  }
}
