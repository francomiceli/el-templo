/**
 * Núcleo COMPARTIDO del seguimiento manual (`renewal_followups`).
 *
 * Lo usan dos pantallas con las mismas reglas y la misma tabla:
 *   - Renovaciones (`RenewalsService.updateFollowup`, `PATCH /api/admin/renewals/:subscriptionId`).
 *   - Invitaciones (`InvitationFollowupService`, `PATCH /api/admin/referrals/invitations/:invitationId/followup`),
 *     que guarda el seguimiento de un invitado sobre la sub de accesos de su invitación.
 *
 * Vive en el módulo `renewals` porque `renewal_followups` y `renewal_reasons` son tablas de ese
 * módulo (strict): quien las escribe es este archivo, y referrals solo lo llama.
 *
 * Qué resuelve `applyFollowupUpdate` (idéntico al `updateFollowup` original de Renovaciones):
 *   - estado manual resultante (`input` pisa a la fila previa);
 *   - motivo obligatorio y activo al pasar a `no_renovo` (`ReasonRequiredError`), y limpieza del
 *     motivo al volver a `en_proceso`;
 *   - contador de mensajes y `lastMessageAt` (solo cambia cuando el contador cambia);
 *   - upsert + `audit_log` en UNA transacción, con un gancho (`inTransaction`) para que el llamador
 *     sume escrituras que tienen que ser atómicas con el seguimiento.
 *
 * El alcance del actor (sede/país) y la existencia de la sub los valida el llamador ANTES.
 */
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { assertBranchInEnforcedScope } from "../shared/branch-access";
import { tenantValues, tenantWhere, type TenantContext } from "../shared/tenant";
import { auditLog, type AuditAction } from "../shared/audit-log";
import type { TxHandle } from "../finance/balance-service";
import type {
  RenewalActorScope,
  RenewalFollowupUpdateInput,
  RenewalManualStatus,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Código estable del 400 (SPEC §"PATCH .../:subscriptionId": "manualStatus=
 * 'no_renovo' exige reasonId activo del tenant (400 REASON_REQUIRED)") —
 * mismo patrón que `BRANCH_OUT_OF_SCOPE` (`shared/branch-access.ts`): una
 * constante exportada para que `routes.ts` matchee exacto en vez de parsear
 * el mensaje.
 */
export const REASON_REQUIRED = "REASON_REQUIRED";

/**
 * El default `handleServiceError` solo emite `{ error, message }`, así que
 * `routes.ts` agrega el `code` explícitamente — mismo patrón que
 * `BranchOutOfScopeError`/`BRANCH_OUT_OF_SCOPE`.
 */
export class ReasonRequiredError extends BadRequestError {
  readonly code = REASON_REQUIRED;

  constructor(
    message = "El motivo es obligatorio para marcar 'No renueva' y tiene que estar activo",
  ) {
    super(message);
  }
}

/** Fila de `renewal_followups` tal como se lee de la base. */
export type RenewalFollowupRecord = typeof schema.renewalFollowups.$inferSelect;

/**
 * Chequea que una fila con sede (`branchId` + país de esa sede) esté en el alcance del actor.
 * Fuera de alcance ⇒ `NotFoundError(notFoundMessage)` SIEMPRE (nunca 403: un recurso ajeno
 * se ve igual que uno inexistente, ISO-03):
 *   - alcance forzado por sede (`admin_sede`): la sede tiene que estar en sus sedes;
 *   - admin/gestión (sin sedes forzadas ni owner): la sede tiene que ser de SU país
 *     (mismo recorte que los listados vía `filters.country`), y un país nulo (dato
 *     corrupto) falla cerrado;
 *   - owner: todo el gimnasio.
 */
export function assertRowInActorScope(
  row: { branchId: number; branchCountry: string },
  actor: RenewalActorScope,
  notFoundMessage: string,
): void {
  if (actor.branchIds != null) {
    assertBranchInEnforcedScope(row.branchId, actor.branchIds, notFoundMessage);
  } else if (!actor.isOwner) {
    if (actor.country === null || row.branchCountry !== actor.country) {
      throw new NotFoundError(notFoundMessage);
    }
  }
}

export interface ApplyFollowupParams {
  subscriptionId: number;
  /** Dueño de la sub (el socio / invitado al que se le hace el seguimiento). */
  userId: number;
  input: RenewalFollowupUpdateInput;
  actorId: number;
  /** Acción del `audit_log`: distingue a qué pantalla pertenece el cambio. */
  auditAction: AuditAction;
  /**
   * Escrituras adicionales ATÓMICAS con el seguimiento: corren dentro de la misma transacción,
   * después del upsert y antes del `audit_log`. Si lanzan, se revierte todo.
   */
  inTransaction?: (
    tx: TxHandle,
    change: { before: RenewalFollowupRecord | null; after: RenewalFollowupRecord },
  ) => Promise<void>;
}

/**
 * Upsert del seguimiento manual de una sub, dentro de una transacción con el `audit_log`.
 * Devuelve la fila antes y después del cambio.
 */
export async function applyFollowupUpdate(
  db: DbInstance,
  ctx: TenantContext,
  params: ApplyFollowupParams,
): Promise<{
  before: RenewalFollowupRecord | null;
  after: RenewalFollowupRecord;
}> {
  const { subscriptionId, userId, input, actorId, auditAction } = params;

  const [before] = await db
    .select()
    .from(schema.renewalFollowups)
    .where(
      and(
        tenantWhere(schema.renewalFollowups, ctx),
        eq(schema.renewalFollowups.subscriptionId, subscriptionId),
      ),
    )
    .limit(1);

  const finalManualStatus: RenewalManualStatus =
    input.manualStatus ?? before?.manualStatus ?? "en_proceso";

  let resolvedReasonId: number | null;
  let resolvedReasonNote: string | null;

  if (finalManualStatus === "no_renovo") {
    // Resuelto EXPLÍCITAMENTE contra `input.reasonId` (incluso si vino
    // `null`) — un PATCH `{ manualStatus: "no_renovo", reasonId: null }` NO
    // puede colarse sin motivo con solo pasar `null` en vez de omitir el
    // campo (el `!== undefined` de la versión anterior lo dejaba pasar).
    resolvedReasonId =
      input.reasonId !== undefined
        ? input.reasonId
        : (before?.reasonId ?? null);
    if (resolvedReasonId === null) {
      throw new ReasonRequiredError();
    }
    // Solo revalida contra la DB cuando ESTE PATCH toca el motivo o recién
    // transiciona a no_renovo — un PATCH que solo mueve `messageCount`
    // sobre una fila que ya estaba en no_renovo no repite el chequeo (si el
    // motivo se desactivó DESPUÉS, esa es una decisión de otra pantalla, no
    // algo que este PATCH deba rechazar retroactivamente).
    const debeValidarMotivo =
      input.reasonId !== undefined ||
      (input.manualStatus === "no_renovo" &&
        before?.manualStatus !== "no_renovo");
    if (debeValidarMotivo) {
      const [reason] = await db
        .select({ id: schema.renewalReasons.id })
        .from(schema.renewalReasons)
        .where(
          and(
            tenantWhere(schema.renewalReasons, ctx),
            eq(schema.renewalReasons.id, resolvedReasonId),
            eq(schema.renewalReasons.isActive, true),
          ),
        )
        .limit(1);
      if (!reason) {
        throw new ReasonRequiredError("Motivo inválido o inactivo");
      }
    }
    resolvedReasonNote =
      input.reasonNote !== undefined
        ? input.reasonNote
        : (before?.reasonNote ?? null);
  } else {
    // Volver a en_proceso limpia el motivo (SPEC línea 33), sin importar lo
    // que venga en el body.
    resolvedReasonId = null;
    resolvedReasonNote = null;
  }

  const finalMessageCount = input.messageCount ?? before?.messageCount ?? 0;
  const messageChanged =
    input.messageCount !== undefined &&
    input.messageCount !== (before?.messageCount ?? 0);
  const finalLastMessageAt = messageChanged
    ? new Date()
    : (before?.lastMessageAt ?? null);

  return db.transaction(async (tx: TxHandle) => {
    await tx
      .insert(schema.renewalFollowups)
      .values(
        tenantValues(ctx, {
          subscriptionId,
          userId,
          messageCount: finalMessageCount,
          lastMessageAt: finalLastMessageAt,
          manualStatus: finalManualStatus,
          reasonId: resolvedReasonId,
          reasonNote: resolvedReasonNote,
          updatedBy: actorId,
        }),
      )
      .onDuplicateKeyUpdate({
        set: {
          messageCount: finalMessageCount,
          ...(messageChanged ? { lastMessageAt: finalLastMessageAt } : {}),
          manualStatus: finalManualStatus,
          reasonId: resolvedReasonId,
          reasonNote: resolvedReasonNote,
          updatedBy: actorId,
        },
      });

    const [after] = await tx
      .select()
      .from(schema.renewalFollowups)
      .where(
        and(
          tenantWhere(schema.renewalFollowups, ctx),
          eq(schema.renewalFollowups.subscriptionId, subscriptionId),
        ),
      )
      .limit(1);
    // El upsert acaba de garantizar la fila: si no está, algo anda muy mal y
    // revertir es lo correcto (antes se auditaba con targetId 0).
    if (!after) {
      throw new Error("No se pudo leer el seguimiento recién guardado");
    }

    if (params.inTransaction) {
      await params.inTransaction(tx, { before: before ?? null, after });
    }

    await auditLog.write(ctx, tx, {
      actorId,
      action: auditAction,
      targetKind: "renewal_followup",
      targetId: after.id,
      payload: { before: before ?? null, after },
    });

    return { before: before ?? null, after };
  });
}
