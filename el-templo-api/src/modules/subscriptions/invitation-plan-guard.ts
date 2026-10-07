// Módulo: subscriptions — protección del plan "Invitación" (Fase 194, HI-02)
//
// El plan Invitación se identifica por dos flags de negocio (`is_trial` +
// `plan_category = 'paquete'`, ver `isInvitationPlan`) y la invariante central de
// la fase ("`is_trial` da acceso, nunca membresía") depende de ellos. Si una
// edición del admin los cambia, las subs de invitación existentes pasan a contar
// como membresía, o `findInvitationPlan` falla cerrado y se caen todas las
// activaciones del país. Estas funciones se llaman desde create/update/deactivate
// de planes y NO importan `service.ts` (la lógica vive acá para no engordarlo).
//
// La cantidad de accesos (`classes_per_week`) NO se edita por el CRUD de planes:
// tiene un endpoint dedicado (`PUT /api/admin/settings/invitations`, campo
// `accessesPerInvitation`) que valida el rango. Así hay una sola puerta.
import { and, eq, ne } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { subscriptionPlans } from "../../db/schema";
import { BadRequestError, ConflictError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  isInvitationPlan,
  type PlanDetail,
  type UpdatePlanInput,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

const IMMUTABLE_MESSAGE =
  "El plan Invitación es del sistema: no se pueden cambiar su categoría, su marca de prueba, su alcance ni su precio";

const DEACTIVATE_MESSAGE =
  "El plan Invitación no se puede desactivar: sin él se caen todas las invitaciones del país";

const ACCESSES_MESSAGE =
  "Los accesos del plan Invitación se cambian en Configuración > Invitaciones";

/**
 * Rechaza (400) cualquier edición que cambie la identidad, el alcance o el
 * precio del plan Invitación. Compara contra el valor ACTUAL: mandar el mismo
 * valor (el formulario del admin reenvía el plan completo) no es un cambio.
 */
export function assertInvitationPlanUpdateAllowed(
  existing: PlanDetail,
  input: UpdatePlanInput,
): void {
  if (!isInvitationPlan(existing)) return;

  const changes = [
    input.isTrial !== undefined && input.isTrial !== existing.isTrial,
    input.planCategory !== undefined &&
      input.planCategory !== existing.planCategory,
    input.multiBranch !== undefined &&
      input.multiBranch !== existing.multiBranch,
    input.priceRegular !== undefined &&
      input.priceRegular !== existing.priceRegular,
    input.priceZero !== undefined && input.priceZero !== existing.priceZero,
    input.priceCreditCard !== undefined &&
      input.priceCreditCard !== existing.priceCreditCard,
  ];
  if (changes.some(Boolean)) throw new BadRequestError(IMMUTABLE_MESSAGE);

  if (
    input.classesPerWeek !== undefined &&
    input.classesPerWeek !== existing.classesPerWeek
  ) {
    throw new BadRequestError(ACCESSES_MESSAGE);
  }
}

/** Desactivar el plan Invitación no está permitido (400). */
export function assertInvitationPlanDeactivationAllowed(
  existing: PlanDetail,
): void {
  if (isInvitationPlan(existing)) throw new BadRequestError(DEACTIVATE_MESSAGE);
}

/**
 * Un país no puede tener dos planes Invitación (activos o no, archivados o no:
 * `findInvitationPlan` falla cerrado con más de uno activo, y reactivar uno
 * viejo lo dejaría roto). 409 si el estado FINAL del plan es Invitación y ya
 * existe otro en el mismo gimnasio y país. `excludePlanId` = el propio plan en
 * un update.
 */
export async function assertNoOtherInvitationPlan(
  db: DbInstance,
  ctx: TenantContext,
  final: { isTrial: boolean; planCategory: string; country: string },
  excludePlanId?: number,
): Promise<void> {
  if (!isInvitationPlan(final)) return;
  const [other] = await db
    .select({ id: subscriptionPlans.id })
    .from(subscriptionPlans)
    .where(
      and(
        tenantWhere(subscriptionPlans, ctx),
        eq(subscriptionPlans.isTrial, true),
        eq(subscriptionPlans.planCategory, "paquete"),
        eq(subscriptionPlans.country, final.country),
        excludePlanId === undefined
          ? undefined
          : ne(subscriptionPlans.id, excludePlanId),
      ),
    )
    .limit(1);
  if (other) {
    throw new ConflictError(
      `Ya existe un plan Invitación para ${final.country}: solo puede haber uno por país`,
    );
  }
}
