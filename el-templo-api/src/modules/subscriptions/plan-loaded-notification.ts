// Módulo: subscriptions — aviso al socio cuando el staff le carga una membresía
//
// Los socios pagan antes del vencimiento y no sabían si la renovación quedó
// cargada. Cuando el staff carga una membresía a mano (alta, cambio de plan o
// renovación) se hacen DOS cosas, ambas best-effort:
//   1. se marca `subscriptions.member_notified_at = ahora` y `member_seen_at =
//      NULL` (mig 0301): eso prende la pelotita de la tab Planes en la app;
//   2. se encola la push `plan_loaded` con el nombre del plan y las fechas.
//
// El UPDATE de la pelotita corre aunque el socio no tenga device token (la push
// se saltea sola en `queueNotification`, la pelotita igual tiene que aparecer).
// Lo llaman SOLO los call sites de carga manual por staff, DESPUÉS de que el
// service devolvió OK y fuera de su transacción. No lo llaman el alta de socio,
// la promo de registro, el pase de prueba, la semana de regalo, las invitaciones,
// `bulkMigratePlan`, los imports ni los crons.
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { NotificationService } from "../notifications/service";
import { todayInTz } from "../shared/date-utils";
import { tenantWhere, type TenantContext } from "../shared/tenant";

type DbInstance = MySql2Database<typeof schema>;

// Misma constante que `member-routes.ts` (no se exporta de ahí para no arrastrar
// el plugin de rutas hasta este helper).
const AR_TIMEZONE = "America/Argentina/Buenos_Aires";

const PLAN_LOADED_TEMPLATE_KEY = "plan_loaded";

const MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

/** "loaded" = alta o renovación cargada; "change" = cambio de plan cargado. */
export type PlanLoadedKind = "loaded" | "change";

const TITLE_BY_KIND: Record<PlanLoadedKind, string> = {
  loaded: "Tu plan ya está cargado",
  change: "Tu cambio de plan está cargado",
};

/**
 * Fecha corta en español de un "YYYY-MM-DD": "16 nov", "15 dic". El año se
 * agrega SOLO si no es el año en curso (`today` = "YYYY-MM-DD" de hoy): "15 ene
 * 2027". Pura, sin reloj ni DB.
 */
export function formatShortDateEs(date: string, today: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const currentYear = Number(today.split("-")[0]);
  const label = `${day} ${MONTHS_ES[month - 1]}`;
  return year === currentYear ? label : `${label} ${year}`;
}

/**
 * Cuerpo de la push: `"{plan}: del {inicio} al {fin}. Tocá para verlo."`, o
 * `"{plan}: desde el {inicio}. Tocá para verlo."` si la sub no tiene fecha de fin.
 */
export function buildPlanLoadedBody(
  planName: string,
  startDate: string,
  endDate: string | null,
  today: string,
): string {
  const start = formatShortDateEs(startDate, today);
  if (endDate === null) {
    return `${planName}: desde el ${start}. Tocá para verlo.`;
  }
  return `${planName}: del ${start} al ${formatShortDateEs(endDate, today)}. Tocá para verlo.`;
}

/**
 * Avisa al socio que se le cargó la membresía `subscriptionId` (la NUEVA, no la
 * anterior). Best-effort: un fallo JAMÁS relanza ni rompe la operación del admin.
 */
export async function notifyMemberPlanLoaded(
  db: DbInstance,
  log: FastifyBaseLogger,
  ctx: TenantContext,
  subscriptionId: number,
  kind: PlanLoadedKind,
): Promise<void> {
  try {
    const [sub] = await db
      .select({
        userId: schema.subscriptions.userId,
        startDate: schema.subscriptions.startDate,
        endDate: schema.subscriptions.endDate,
        planName: schema.subscriptionPlans.name,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        and(
          eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
          tenantWhere(schema.subscriptionPlans, ctx),
        ),
      )
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx),
          eq(schema.subscriptions.id, subscriptionId),
        ),
      )
      .limit(1);
    if (!sub) {
      log.warn(
        { subscriptionId, kind },
        "plan loaded notification: subscription not found (best-effort)",
      );
      return;
    }

    // La pelotita de la app se prende acá, con o sin device token.
    await db
      .update(schema.subscriptions)
      .set({ memberNotifiedAt: new Date(), memberSeenAt: null })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx),
          eq(schema.subscriptions.id, subscriptionId),
        ),
      );

    await new NotificationService(db, log).queueNotification({
      userId: sub.userId,
      templateKey: PLAN_LOADED_TEMPLATE_KEY,
      titleOverride: TITLE_BY_KIND[kind],
      bodyOverride: buildPlanLoadedBody(
        sub.planName,
        sub.startDate,
        sub.endDate,
        todayInTz(AR_TIMEZONE),
      ),
    });
  } catch (err: unknown) {
    log.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        subscriptionId,
        kind,
      },
      "plan loaded notification failed (best-effort)",
    );
  }
}
