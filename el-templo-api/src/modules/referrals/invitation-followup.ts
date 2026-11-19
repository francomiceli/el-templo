// Módulo: referrals — seguimiento manual de invitados (lista de trabajo del admin)
//
// El seguimiento de una invitación vive en `renewal_followups` (única por tenant + sub),
// usando la sub de accesos de la invitación (`invitations.subscription_id`) y los motivos
// de `renewal_reasons`: el MISMO registro y las MISMAS reglas que Renovaciones. El núcleo
// del upsert (motivo obligatorio/activo, contador 0-4, `lastMessageAt`, audit en
// transacción) es `applyFollowupUpdate` (`renewals/followup-core.ts`), compartido con
// `RenewalsService.updateFollowup`. Los invitados NO aparecen en Renovaciones (ahí nunca se
// listan subs `is_trial`), así que esa fila solo se ve desde la bandeja de Invitaciones.
//
// SINCRONÍA CON EL LEAD (misma transacción que el seguimiento, por `updateLead` — la función
// del `PATCH /api/admin/leads/:userId`, sin duplicar sus reglas):
//   - el estado manual pasa a `no_renovo` y el invitado NO compró -> `lead_status = perdido`;
//   - el estado manual vuelve de `no_renovo` a `en_proceso` y el lead estaba `perdido` ->
//     `en_seguimiento`;
//   - jamás se toca un lead `ganado` (ni uno con plan comprado).
// Solo actúa en la TRANSICIÓN del estado manual: un PATCH que solo mueve el contador no
// pisa un `lead_status` que alguien cambió a mano después.
//
// ALCANCE: la invitación tiene que ser `active`, del gimnasio y estar en el alcance del actor
// (sede forzada de `admin_sede`, país de admin/gestión, owner todo). Fuera de alcance o
// inexistente -> 404 indistinguible.
import { and, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { ConflictError, NotFoundError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { TxHandle } from "../finance/balance-service";
import { MemberService } from "../members/service";
import type { MemberNote } from "../members/types";
import {
  applyFollowupUpdate,
  assertRowInActorScope,
} from "../renewals/followup-core";
import type {
  RenewalActorScope,
  RenewalFollowupUpdateInput,
} from "../renewals/types";
import {
  InvitationLeadList,
  invitationPurchasedSql,
  type InvitationLeadRow,
} from "./invitation-lead-list";

type DbInstance = MySql2Database<typeof schema>;

const NOT_FOUND_MESSAGE = "Invitación no encontrada";

interface ScopedInvitation {
  id: number;
  invitedUserId: number;
  subscriptionId: number | null;
  branchId: number;
  branchCountry: string;
}

export class InvitationFollowupService {
  private readonly memberService: MemberService;
  private readonly leadList: InvitationLeadList;

  constructor(
    private readonly db: DbInstance,
    log: FastifyBaseLogger,
  ) {
    this.memberService = new MemberService(db, log);
    this.leadList = new InvitationLeadList(db);
  }

  /**
   * La invitación `active` del gimnasio y en el alcance del actor, o 404 (nunca 403: una
   * invitación ajena se ve igual que una inexistente).
   */
  private async resolveInScope(
    ctx: TenantContext,
    invitationId: number,
    actor: RenewalActorScope,
  ): Promise<ScopedInvitation> {
    const [row] = await this.db
      .select({
        id: schema.invitations.id,
        invitedUserId: schema.invitations.invitedUserId,
        subscriptionId: schema.invitations.subscriptionId,
        branchId: schema.invitations.branchId,
        branchCountry: schema.branches.country,
      })
      .from(schema.invitations)
      .innerJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.invitations.branchId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.invitations, ctx),
          eq(schema.invitations.id, invitationId),
          eq(schema.invitations.status, "active"),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError(NOT_FOUND_MESSAGE);
    assertRowInActorScope(row, actor, NOT_FOUND_MESSAGE);
    return row;
  }

  /**
   * `PATCH /api/admin/referrals/invitations/:invitationId/followup`: mismo cuerpo y mismas
   * reglas que el PATCH de Renovaciones. Devuelve la fila actualizada de la bandeja.
   */
  async updateFollowup(
    ctx: TenantContext,
    invitationId: number,
    input: RenewalFollowupUpdateInput,
    actor: RenewalActorScope,
  ): Promise<InvitationLeadRow> {
    const invitation = await this.resolveInScope(ctx, invitationId, actor);
    if (invitation.subscriptionId === null) {
      throw new ConflictError(
        "Esta invitación no tiene una suscripción de accesos: no se puede registrar el seguimiento",
      );
    }

    await applyFollowupUpdate(this.db, ctx, {
      subscriptionId: invitation.subscriptionId,
      userId: invitation.invitedUserId,
      input,
      actorId: actor.userId,
      auditAction: "invitation_followup_updated",
      inTransaction: (tx, { before, after }) =>
        this.syncLeadStatus(ctx, tx, invitation, {
          from: before?.manualStatus ?? "en_proceso",
          to: after.manualStatus,
        }),
    });

    const row = await this.leadList.getRow(ctx, invitationId);
    if (!row) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return row;
  }

  /** `POST /api/admin/referrals/invitations/:invitationId/notes`: nota del invitado (igual que Renovaciones). */
  async addNote(
    ctx: TenantContext,
    invitationId: number,
    content: string,
    actor: RenewalActorScope,
  ): Promise<MemberNote> {
    const invitation = await this.resolveInScope(ctx, invitationId, actor);
    return this.memberService.createNote(ctx, actor.userId, {
      userId: invitation.invitedUserId,
      content,
    });
  }

  /**
   * Mueve `users.lead_status` con las reglas de `MemberService.updateLead`, dentro de la
   * transacción del seguimiento. Solo en la transición del estado manual (ver docblock).
   */
  private async syncLeadStatus(
    ctx: TenantContext,
    tx: TxHandle,
    invitation: ScopedInvitation,
    manual: {
      from: "en_proceso" | "no_renovo";
      to: "en_proceso" | "no_renovo";
    },
  ): Promise<void> {
    if (manual.from === manual.to) return;

    const [user] = await tx
      .select({
        status: schema.users.status,
        leadStatus: schema.users.leadStatus,
        purchasedPlanId: schema.users.purchasedPlanId,
      })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, invitation.invitedUserId),
        ),
      )
      .limit(1);
    if (!user) return;
    // Nunca se toca un lead ganado ni uno con plan comprado, ni a quien nunca fue lead
    // (`updateLead` lo rechazaría con 409 y revertiría el seguimiento entero).
    if (user.leadStatus === "ganado" || user.purchasedPlanId !== null) return;
    if (user.status !== "prueba" && user.leadStatus === null) return;

    if (manual.to === "no_renovo") {
      if (user.leadStatus === "perdido") return;
      const [state] = await tx
        .select({
          convertedAt: schema.invitations.convertedAt,
          purchased: sql<number>`${invitationPurchasedSql(ctx)}`,
        })
        .from(schema.invitations)
        .where(
          and(
            tenantWhere(schema.invitations, ctx),
            eq(schema.invitations.id, invitation.id),
          ),
        )
        .limit(1);
      // Compró (dentro o fuera de la ventana de compra tardía): el lead no se pierde.
      if (!state || state.convertedAt !== null || Number(state.purchased) > 0) {
        return;
      }
      await this.memberService.updateLead(
        ctx,
        invitation.invitedUserId,
        { leadStatus: "perdido" },
        tx,
      );
      return;
    }

    // Vuelve a en_proceso: un lead `perdido` se reabre.
    if (user.leadStatus === "perdido") {
      await this.memberService.updateLead(
        ctx,
        invitation.invitedUserId,
        { leadStatus: "en_seguimiento" },
        tx,
      );
    }
  }
}
