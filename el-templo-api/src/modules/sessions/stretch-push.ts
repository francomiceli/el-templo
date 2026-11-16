/**
 * Push "¿Estiraste?" del estiramiento post-clase (fase 213, plan 07).
 *
 * Paso del tick de `notification-cron.ts` (cada 5 min, una vez por gimnasio
 * activo, ANTES de `processQueue`): recorre las asistencias elegibles, crea la
 * oferta del día para todos los grupos y encola el push de los grupos push.
 *
 * Decisiones que implementa:
 * - D-10 (momento): el push sale a fin de clase + 30/60 min según el grupo, con
 *   tope 21:30 hora de la sede y ventana fin <= ahora < fin + 120 min. El
 *   cálculo es `computeStretchPushAt` (puro, `stretch-timing.ts`). Cada
 *   asistencia se evalúa con la zona de SU sede, nunca la del proceso.
 * - D-11 (motivo de no envío): cada decisión queda en `stretch_offers.push_decision`
 *   con el motivo PRE-CHEQUEADO (`queueNotification` devuelve -1 igual para
 *   plantilla apagada, sin token o categoría apagada, y no dice cuál). Una
 *   decisión por alumno y día: una fila ya decidida no se vuelve a evaluar.
 * - D-12: el push usa la plantilla `stretch_followup` tal como la editó el staff
 *   en Comunicaciones: sin título, cuerpo ni ruta propios.
 * - D-13: un gimnasio sin el módulo `templo-training` no genera filas ni pushes
 *   (primera línea del paso, fail-closed).
 * - D-14: no hay `cron.schedule` nuevo; el paso corre dentro del tick existente.
 * - D-15: la fila de `stretch_offers` ES la oferta y el dedupe. Se crea con
 *   `findEligibleAttendance` + `ensureOffer` (los mismos que usa la card), así
 *   la fila es idéntica venga de donde venga. Cada decisión se reclama con
 *   `UPDATE ... WHERE push_decision IS NULL` (en mysql2 `affectedRows` cuenta
 *   filas encontradas: con ese WHERE encontrada = cambiada).
 * - D-16: la fila se crea para TODOS los grupos (el control incluido: queda
 *   con `push_decision = 'control'`), porque el denominador de la medición son
 *   las asistencias elegibles.
 *
 * Además reconcilia `push_sent_at` leyendo `pending_notifications` ANTES de la
 * purga de 24 h del tick (el id guardado en la fila no tiene FK).
 *
 * Un fallo en un candidato no frena a los demás; un fallo del paso no frena la
 * cola (lo contiene el try/catch del tick, que también loguea los contadores). Toda consulta lleva `tenantWhere`.
 */
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { AuraService } from "../aura/service";
import { NotificationService } from "../notifications/service";
import {
  STRETCH_FOLLOWUP_TEMPLATE_KEY,
  type NotificationCategory,
} from "../notifications/types";
import { isGenericClassActivity } from "../scheduling/derived-label";
import { buildClassDateTime, todayInTz } from "../shared/date-utils";
import { isModuleEnabled } from "../shared/module-flags";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { shiftDate } from "../shared/week-dates";
import { StretchService, type EligibleAttendance } from "./stretch-service";
import {
  STRETCH_PUSH_OFFSET_MINUTES,
  computeStretchPushAt,
  decideFrequencyBlock,
  isWithinPushWindow,
  type StretchPushDecision,
} from "./stretch-timing";

type Db = MySql2Database<typeof schema>;

/** Días de historia que se leen para el tope semanal y la pausa (D-11). */
export const STRETCH_HISTORY_DAYS = 30;

/**
 * Las filas encoladas solo se reconcilian mientras la fila de
 * `pending_notifications` sigue viva (el tick la purga a las 24 h).
 */
export const STRETCH_RECONCILE_HOURS = 23;

const HOUR_MS = 60 * 60 * 1000;

/** Motivos por los que una asistencia no llega a tener fila (SPEC 5.2 "sin oferta"). */
export type StretchSkipReason =
  | "actividad"
  | "otro_dia"
  | "fuera_de_ventana"
  | "sin_rutina"
  | "esperando";

/** Contadores de un paso del tick para un gimnasio. */
export interface StretchPushResult {
  /** Candidatos que terminaron con una oferta (creada en este paso o ya existente). */
  offers: number;
  /** Pushes encolados en este paso. */
  queued: number;
  /** Decisiones de no envío tomadas en este paso, por motivo. */
  decided: Partial<Record<StretchPushDecision, number>>;
  /** Asistencias que no avanzaron, por motivo. */
  skipped: Record<StretchSkipReason, number>;
  /** Filas encoladas cuyo estado de envío se reconcilió (enviado o fallido). */
  reconciled: number;
  /** Candidatos que lanzaron una excepción. */
  failed: number;
}

function emptyResult(): StretchPushResult {
  return {
    offers: 0,
    queued: 0,
    decided: {},
    skipped: {
      actividad: 0,
      otro_dia: 0,
      fuera_de_ventana: 0,
      sin_rutina: 0,
      esperando: 0,
    },
    reconciled: 0,
    failed: 0,
  };
}

/** `true` si el paso hizo algo que valga un log (lo usa el tick del cron). */
export function stretchPushHadActivity(r: StretchPushResult): boolean {
  return (
    r.offers > 0 ||
    r.queued > 0 ||
    r.reconciled > 0 ||
    r.failed > 0 ||
    Object.keys(r.decided).length > 0
  );
}

/** Plantilla del push, leída una vez por paso. */
interface FollowupTemplate {
  isEnabled: boolean;
  category: NotificationCategory;
}

/**
 * Reconciliación (antes de la purga de 24 h): copia a la fila de la oferta lo
 * que le pasó a su `pending_notifications`. `sent` -> `push_sent_at`; `failed`
 * -> `push_decision = 'fallo_envio'`. Una fila purgada o todavía `pending` no
 * cambia nada.
 */
async function reconcileSent(
  db: Db,
  ctx: TenantContext,
  log: FastifyBaseLogger,
  now: Date,
  result: StretchPushResult,
): Promise<void> {
  const since = new Date(now.getTime() - STRETCH_RECONCILE_HOURS * HOUR_MS);
  const rows = await db
    .select({
      id: schema.stretchOffers.id,
      pendingId: schema.stretchOffers.pendingNotificationId,
    })
    .from(schema.stretchOffers)
    .where(
      and(
        tenantWhere(schema.stretchOffers, ctx),
        eq(schema.stretchOffers.pushDecision, "queued"),
        isNull(schema.stretchOffers.pushSentAt),
        isNotNull(schema.stretchOffers.pendingNotificationId),
        gte(schema.stretchOffers.pushQueuedAt, since),
      ),
    );
  if (rows.length === 0) return;

  const pendingIds = rows
    .map((r) => r.pendingId)
    .filter((id): id is number => id !== null);
  const pendings = await db
    .select({
      id: schema.pendingNotifications.id,
      status: schema.pendingNotifications.status,
      sentAt: schema.pendingNotifications.sentAt,
    })
    .from(schema.pendingNotifications)
    .where(
      and(
        tenantWhere(schema.pendingNotifications, ctx),
        inArray(schema.pendingNotifications.id, pendingIds),
      ),
    );
  const byId = new Map(pendings.map((p) => [p.id, p]));

  for (const row of rows) {
    try {
      const pending =
        row.pendingId === null ? undefined : byId.get(row.pendingId);
      if (!pending) continue;
      if (pending.status === "sent") {
        const [res] = await db
          .update(schema.stretchOffers)
          .set({ pushSentAt: pending.sentAt ?? now })
          .where(
            and(
              tenantWhere(schema.stretchOffers, ctx),
              eq(schema.stretchOffers.id, row.id),
              eq(schema.stretchOffers.pushDecision, "queued"),
              isNull(schema.stretchOffers.pushSentAt),
            ),
          );
        if (res.affectedRows > 0) result.reconciled += 1;
      } else if (pending.status === "failed") {
        const [res] = await db
          .update(schema.stretchOffers)
          .set({ pushDecision: "fallo_envio" })
          .where(
            and(
              tenantWhere(schema.stretchOffers, ctx),
              eq(schema.stretchOffers.id, row.id),
              eq(schema.stretchOffers.pushDecision, "queued"),
              isNull(schema.stretchOffers.pushSentAt),
            ),
          );
        if (res.affectedRows > 0) result.reconciled += 1;
      }
    } catch (err: unknown) {
      log.warn(
        {
          tenantId: ctx.tenantId,
          offerId: row.id,
          err: err instanceof Error ? err.message : String(err),
        },
        "Stretch push reconcile failed",
      );
    }
  }
}

/**
 * Candidatos del tick: socios con una asistencia de HOY (en la zona de su sede)
 * a una clase General no especial cuya ventana de disparo está abierta.
 * Devuelve `userId -> día local`. El acotado de ±1 día en UTC solo limita el
 * scan; la comparación real es contra `todayInTz(zona de la sede)`.
 */
async function findCandidates(
  db: Db,
  ctx: TenantContext,
  now: Date,
  result: StretchPushResult,
): Promise<Map<number, string>> {
  const todayUtc = todayInTz("UTC", now);
  const rows = await db
    .select({
      userId: schema.attendance.memberId,
      sessionDate: schema.attendance.sessionDate,
      endTime: schema.schedules.endTime,
      activityName: schema.activities.name,
      isSpecial: schema.activities.isSpecial,
      timezone: schema.branches.timezone,
    })
    .from(schema.attendance)
    .innerJoin(
      schema.schedules,
      and(
        eq(schema.attendance.scheduleId, schema.schedules.id),
        tenantWhere(schema.schedules, ctx),
      ),
    )
    .innerJoin(
      schema.activities,
      and(
        eq(schema.schedules.activityId, schema.activities.id),
        tenantWhere(schema.activities, ctx),
      ),
    )
    .innerJoin(
      schema.branches,
      and(
        eq(schema.attendance.branchId, schema.branches.id),
        tenantWhere(schema.branches, ctx),
      ),
    )
    .where(
      and(
        tenantWhere(schema.attendance, ctx),
        isNotNull(schema.attendance.scheduleId),
        gte(schema.attendance.sessionDate, shiftDate(todayUtc, -1)),
        lte(schema.attendance.sessionDate, shiftDate(todayUtc, 1)),
      ),
    );

  const candidates = new Map<number, string>();
  for (const row of rows) {
    if (!isGenericClassActivity(row.activityName, row.isSpecial)) {
      result.skipped.actividad += 1;
      continue;
    }
    if (row.sessionDate !== todayInTz(row.timezone, now)) {
      result.skipped.otro_dia += 1;
      continue;
    }
    const classEndAt = buildClassDateTime(
      row.sessionDate,
      row.endTime,
      row.timezone,
    );
    if (!isWithinPushWindow(now, classEndAt)) {
      result.skipped.fuera_de_ventana += 1;
      continue;
    }
    candidates.set(row.userId, row.sessionDate);
  }
  return candidates;
}

/** Historia del socio para el tope: filas de [hoy - 30, hoy) (sin la de hoy). */
async function loadHistory(
  db: Db,
  ctx: TenantContext,
  userId: number,
  todayLocal: string,
): Promise<
  { localDate: string; pushQueuedAt: Date | null; pushOpenedAt: Date | null }[]
> {
  return db
    .select({
      localDate: schema.stretchOffers.localDate,
      pushQueuedAt: schema.stretchOffers.pushQueuedAt,
      pushOpenedAt: schema.stretchOffers.pushOpenedAt,
    })
    .from(schema.stretchOffers)
    .where(
      and(
        tenantWhere(schema.stretchOffers, ctx),
        eq(schema.stretchOffers.userId, userId),
        gte(
          schema.stretchOffers.localDate,
          shiftDate(todayLocal, -STRETCH_HISTORY_DAYS),
        ),
        lt(schema.stretchOffers.localDate, todayLocal),
      ),
    );
}

/**
 * Paso del tick de notificaciones para UN gimnasio. `now` entra por parámetro
 * (los tests inyectan el reloj); el tick del cron usa el reloj real.
 */
export async function runStretchPushForTenant(
  db: Db,
  ctx: TenantContext,
  log: FastifyBaseLogger,
  now: Date = new Date(),
): Promise<StretchPushResult> {
  const result = emptyResult();

  // D-13: sin el módulo no se hace nada. Es lo primero que se evalúa.
  if (!(await isModuleEnabled(ctx.tenantId, "templo-training", db))) {
    return result;
  }

  await reconcileSent(db, ctx, log, now, result);

  const candidates = await findCandidates(db, ctx, now, result);
  if (candidates.size === 0) return result;

  const stretchService = new StretchService(db, log, new AuraService(db));
  const notificationService = new NotificationService(db, log);

  // Plantilla: una lectura por paso (la comparten todos los candidatos).
  let template: FollowupTemplate | null | undefined;
  const loadTemplate = async (): Promise<FollowupTemplate | null> => {
    if (template !== undefined) return template;
    const [row] = await db
      .select({
        isEnabled: schema.notificationTemplates.isEnabled,
        category: schema.notificationTemplates.category,
      })
      .from(schema.notificationTemplates)
      .where(
        and(
          tenantWhere(schema.notificationTemplates, ctx),
          eq(
            schema.notificationTemplates.templateKey,
            STRETCH_FOLLOWUP_TEMPLATE_KEY,
          ),
        ),
      )
      .limit(1);
    template = row ?? null;
    return template;
  };

  /** Escribe un motivo de no envío si nadie decidió antes (D-15). */
  const decide = async (
    offerId: number,
    decision: StretchPushDecision,
  ): Promise<void> => {
    const [res] = await db
      .update(schema.stretchOffers)
      .set({ pushDecision: decision })
      .where(
        and(
          tenantWhere(schema.stretchOffers, ctx),
          eq(schema.stretchOffers.id, offerId),
          isNull(schema.stretchOffers.pushDecision),
        ),
      );
    if (res.affectedRows > 0) {
      result.decided[decision] = (result.decided[decision] ?? 0) + 1;
    }
  };

  async function processCandidate(
    userId: number,
    localDate: string,
  ): Promise<void> {
    // Misma elección que la card (D-09: la clase de fin más temprano).
    const att: EligibleAttendance | null =
      await stretchService.findEligibleAttendance(ctx, userId, localDate, now);
    if (!att) {
      result.skipped.sin_rutina += 1;
      return;
    }
    if (!isWithinPushWindow(now, att.classEndAt)) {
      result.skipped.fuera_de_ventana += 1;
      return;
    }

    // La fila se crea para TODOS los grupos (D-16). Null = sin rutina (ROM,
    // sin sesión aprobada, catálogo vacío): no hay oferta ni push.
    const offer = await stretchService.ensureOffer(ctx, att, now);
    if (!offer) {
      result.skipped.sin_rutina += 1;
      return;
    }
    result.offers += 1;

    // Ya decidido (control desde la creación, o un tick anterior): una decisión
    // por alumno y día.
    if (offer.pushDecision !== null) return;

    if (offer.arm === "control") {
      await decide(offer.id, "control");
      return;
    }

    const sendAt = computeStretchPushAt({
      classEndAt: offer.classEndAt,
      offsetMinutes: STRETCH_PUSH_OFFSET_MINUTES[offer.arm],
      timezone: att.timezone,
    });
    if (sendAt === null) {
      await decide(offer.id, "fuera_de_horario");
      return;
    }
    if (now.getTime() < sendAt.getTime()) {
      // Todavía no es la hora: se decide en un tick posterior.
      result.skipped.esperando += 1;
      return;
    }

    // Motivos de no envío, en este orden (H-2: se pre-chequean, nunca se
    // deducen del -1 de `queueNotification`).
    if (offer.startedAt !== null || offer.completedAt !== null) {
      await decide(offer.id, "ya_empezo");
      return;
    }

    const tpl = await loadTemplate();
    if (!tpl || !tpl.isEnabled) {
      await decide(offer.id, "plantilla_apagada");
      return;
    }

    const [token] = await db
      .select({ id: schema.deviceTokens.id })
      .from(schema.deviceTokens)
      .where(
        and(
          tenantWhere(schema.deviceTokens, ctx),
          eq(schema.deviceTokens.userId, userId),
        ),
      )
      .limit(1);
    if (!token) {
      await decide(offer.id, "sin_token");
      return;
    }

    const prefs = await notificationService.getUserPreferences(userId);
    if (!prefs[tpl.category]) {
      await decide(offer.id, "categoria_apagada");
      return;
    }

    const history = await loadHistory(db, ctx, userId, offer.localDate);
    const blocked = decideFrequencyBlock(history, now, offer.localDate);
    if (blocked !== null) {
      await decide(offer.id, blocked);
      return;
    }

    // Reclamo: solo el que gana encola (dos ticks o dos instancias a la vez).
    const [claim] = await db
      .update(schema.stretchOffers)
      .set({ pushDecision: "queued", pushQueuedAt: now })
      .where(
        and(
          tenantWhere(schema.stretchOffers, ctx),
          eq(schema.stretchOffers.id, offer.id),
          isNull(schema.stretchOffers.pushDecision),
        ),
      );
    if (claim.affectedRows === 0) return;

    // D-12: sin título, cuerpo ni ruta propios; sale lo que se editó en
    // Comunicaciones. D-15: sin `booking_id`, no choca con el dedupe de
    // `class_reminder`.
    let notificationId: number;
    try {
      notificationId = await notificationService.queueNotification({
        userId,
        templateKey: STRETCH_FOLLOWUP_TEMPLATE_KEY,
        scheduledAt: now,
      });
    } catch (err: unknown) {
      await markEnqueueError(offer.id);
      throw err;
    }
    if (notificationId === -1) {
      // Carrera con un cambio de preferencia, plantilla o token entre el
      // pre-chequeo y el encolado.
      await markEnqueueError(offer.id);
      result.decided.error_encolado = (result.decided.error_encolado ?? 0) + 1;
      return;
    }

    await db
      .update(schema.stretchOffers)
      .set({ pendingNotificationId: notificationId })
      .where(
        and(
          tenantWhere(schema.stretchOffers, ctx),
          eq(schema.stretchOffers.id, offer.id),
        ),
      );
    result.queued += 1;
  }

  async function markEnqueueError(offerId: number): Promise<void> {
    await db
      .update(schema.stretchOffers)
      .set({
        pushDecision: "error_encolado",
        pushQueuedAt: null,
      })
      .where(
        and(
          tenantWhere(schema.stretchOffers, ctx),
          eq(schema.stretchOffers.id, offerId),
          eq(schema.stretchOffers.pushDecision, "queued"),
        ),
      );
  }

  const userIds = [...candidates.keys()].sort((a, b) => a - b);
  for (const userId of userIds) {
    try {
      await processCandidate(userId, candidates.get(userId) ?? "");
    } catch (err: unknown) {
      result.failed += 1;
      log.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          userId,
          tenantId: ctx.tenantId,
        },
        "Stretch push candidate failed",
      );
    }
  }

  return result;
}
