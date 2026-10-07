/**
 * Meta CAPI — outbox derivado por job (fase 195, plan 08, D-19/D-24/D-25).
 *
 * En vez de enganchar hooks en los caminos de pago y de reservas (que la
 * fase 194 reescribe), el job LEE el estado de la base y DERIVA los eventos:
 *
 *   - `CompleteRegistration` = una fila de `signup_attributions`;
 *   - `Schedule`             = una reserva de prueba (`bookings.is_trial`) no cancelada;
 *   - `Purchase`             = la PRIMERA suscripción paga del alumno
 *                              (`price_paid > 0` y `price_type_applied <> 'zero'`,
 *                              mismo criterio que `analytics/trial-funnel-service.ts`).
 *
 * Cada evento entra a `meta_capi_events` con un `event_id` determinista
 * (`reg-<userId>`, `trial-<bookingId>`, `purchase-<subscriptionId>`) y una
 * unique `(tenant_id, event_id)`: correr el barrido dos veces no duplica ni
 * reenvía. Al insertar se decide el estado: `pending` o el motivo por el que
 * NUNCA va a viajar (`skipped_es`, `skipped_ios`, `skipped_no_origin`,
 * `skipped_window`), así queda auditable.
 *
 * Qué NO se manda jamás: usuarios de sedes que no son de Argentina (D-25) ni
 * altas de iOS, de plataforma desconocida o sin fila de origen (D-24).
 *
 * PII: la IP y el user agent del registro web viven en `signup_attributions`
 * solo hasta que el registro se envió (o se descartó) o hasta 7 días
 * (`purgeClientContext`). Los tokens nunca se loguean.
 */

import {
  and,
  asc,
  eq,
  gte,
  inArray,
  lt,
  ne,
  or,
  gt,
  isNotNull,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../../db/schema";
// Path directo, NUNCA por el barrel `shared/index.ts` (fase 169).
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../shared/tenant";
import {
  buildPurchaseEvent,
  buildRegistrationEvent,
  buildTrialEvent,
  decideEventStatus,
  registrationActionSource,
  type CapiActionSource,
  type CapiEvent,
  type CapiPerson,
  type CapiRowStatus,
} from "./capi-builder";
import { MetaApiError, graphPost, redactSecrets } from "./client";
import type { MetaCapiConfig } from "./config";
import type { MetaCountry } from "./hash";

type Db = MySql2Database<typeof schema>;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Hasta cuándo se retiene IP y user agent del registro web. */
export const PII_RETENTION_MS = 7 * DAY_MS;
/** Reintentos de un lote rechazado antes de darlo por perdido. */
export const MAX_ATTEMPTS = 5;
/** Eventos por request (Meta admite 1000: se usa un lote chico). */
export const BATCH_SIZE = 100;
/** Filas que un barrido intenta enviar (el resto sigue en el próximo). */
const SEND_LIMIT = 1000;
/** Lo más viejo que puede ser un evento viable (`physical_store`: 62 días). */
const LOOKBACK_MS = 62 * DAY_MS;
const INSERT_CHUNK = 500;
const IN_CHUNK = 500;

export interface CapiDeriveSummary {
  derived: number;
  pending: number;
  skipped: number;
}

export interface CapiSendSummary {
  sent: number;
  failed: number;
  skipped: number;
}

interface CandidateRow {
  eventId: string;
  eventName: CapiEvent["event_name"];
  userId: number;
  entityType: "registration" | "trial_booking" | "subscription";
  entityId: number;
  actionSource: CapiActionSource;
  eventTime: Date;
  status: CapiRowStatus;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/** El país con el que se hashea: lo que quede después de excluir todo lo no argentino. */
const SEND_COUNTRY: MetaCountry = "AR";

export class MetaCapiService {
  constructor(
    private readonly db: Db,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Inserta (insert-ignore por la unique) los eventos posteriores a
   * `config.startAt` que todavía no están en el outbox, con el estado que les
   * corresponde. Solo mira desde `max(startAt, ahora - 62 días)`: lo más viejo
   * ya no entra en ninguna ventana de Meta.
   */
  async deriveCandidates(
    ctx: TenantContext,
    config: Pick<MetaCapiConfig, "startAt">,
    now: Date,
  ): Promise<CapiDeriveSummary> {
    const since = new Date(
      Math.max(config.startAt.getTime(), now.getTime() - LOOKBACK_MS),
    );
    const candidates = [
      ...(await this.registrationCandidates(ctx, since, now)),
      ...(await this.trialCandidates(ctx, since, now)),
      ...(await this.purchaseCandidates(ctx, since, now)),
    ];

    for (const part of chunk(candidates, INSERT_CHUNK)) {
      await this.db
        .insert(schema.metaCapiEvents)
        .values(
          part.map((c) =>
            tenantValues(ctx, {
              eventId: c.eventId,
              eventName: c.eventName,
              userId: c.userId,
              entityType: c.entityType,
              entityId: c.entityId,
              actionSource: c.actionSource,
              eventTime: c.eventTime,
              status: c.status,
            }),
          ),
        )
        // No-op si el evento ya está en el outbox (no pisa su estado).
        .onDuplicateKeyUpdate({ set: { id: sql`id` } });
    }

    const pending = candidates.filter((c) => c.status === "pending").length;
    return {
      derived: candidates.length,
      pending,
      skipped: candidates.length - pending,
    };
  }

  private async registrationCandidates(
    ctx: TenantContext,
    since: Date,
    now: Date,
  ): Promise<CandidateRow[]> {
    const sa = schema.signupAttributions;
    const userBranch = alias(schema.branches, "user_branch");
    const attrBranch = alias(schema.branches, "attr_branch");

    const rows = await this.db
      .select({
        userId: sa.userId,
        platform: sa.platform,
        userAgent: sa.userAgent,
        createdAt: sa.createdAt,
        userCountry: userBranch.country,
        attrCountry: attrBranch.country,
      })
      .from(sa)
      .innerJoin(
        schema.users,
        and(eq(schema.users.id, sa.userId), tenantWhere(schema.users, ctx)),
      )
      .innerJoin(
        userBranch,
        and(
          eq(userBranch.id, schema.users.branchId),
          tenantWhere(userBranch, ctx),
        ),
      )
      .leftJoin(
        attrBranch,
        and(eq(attrBranch.id, sa.branchId), tenantWhere(attrBranch, ctx)),
      )
      .where(and(tenantWhere(sa, ctx), gte(sa.createdAt, since)));

    return rows.map((r) => {
      const actionSource = registrationActionSource(r.platform, r.userAgent);
      return {
        eventId: `reg-${r.userId}`,
        eventName: "CompleteRegistration" as const,
        userId: r.userId,
        entityType: "registration" as const,
        entityId: r.userId,
        actionSource,
        eventTime: r.createdAt,
        status: decideEventStatus({
          countries: [r.userCountry, r.attrCountry],
          platform: r.platform,
          eventTime: r.createdAt,
          actionSource,
          now,
        }),
      };
    });
  }

  private async trialCandidates(
    ctx: TenantContext,
    since: Date,
    now: Date,
  ): Promise<CandidateRow[]> {
    const sa = schema.signupAttributions;
    const userBranch = alias(schema.branches, "user_branch");
    const attrBranch = alias(schema.branches, "attr_branch");
    const classBranch = alias(schema.branches, "class_branch");

    const rows = await this.db
      .select({
        bookingId: schema.bookings.id,
        userId: schema.bookings.memberId,
        bookedAt: schema.bookings.bookedAt,
        platform: sa.platform,
        userCountry: userBranch.country,
        attrCountry: attrBranch.country,
        classCountry: classBranch.country,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.users,
        and(
          eq(schema.users.id, schema.bookings.memberId),
          tenantWhere(schema.users, ctx),
        ),
      )
      .innerJoin(
        userBranch,
        and(
          eq(userBranch.id, schema.users.branchId),
          tenantWhere(userBranch, ctx),
        ),
      )
      .innerJoin(
        schema.schedules,
        and(
          eq(schema.schedules.id, schema.bookings.scheduleId),
          tenantWhere(schema.schedules, ctx),
        ),
      )
      .innerJoin(
        classBranch,
        and(
          eq(classBranch.id, schema.schedules.branchId),
          tenantWhere(classBranch, ctx),
        ),
      )
      .leftJoin(sa, and(eq(sa.userId, schema.users.id), tenantWhere(sa, ctx)))
      .leftJoin(
        attrBranch,
        and(eq(attrBranch.id, sa.branchId), tenantWhere(attrBranch, ctx)),
      )
      .where(
        and(
          tenantWhere(schema.bookings, ctx),
          eq(schema.bookings.isTrial, true),
          ne(schema.bookings.status, "cancelado"),
          gte(schema.bookings.bookedAt, since),
        ),
      );

    return rows.map((r) => ({
      eventId: `trial-${r.bookingId}`,
      eventName: "Schedule" as const,
      userId: r.userId,
      entityType: "trial_booking" as const,
      entityId: r.bookingId,
      actionSource: "system_generated" as const,
      eventTime: r.bookedAt,
      status: decideEventStatus({
        countries: [r.userCountry, r.attrCountry, r.classCountry],
        platform: r.platform,
        eventTime: r.bookedAt,
        actionSource: "system_generated",
        now,
      }),
    }));
  }

  private async purchaseCandidates(
    ctx: TenantContext,
    since: Date,
    now: Date,
  ): Promise<CandidateRow[]> {
    const sub = schema.subscriptions;
    const sa = schema.signupAttributions;
    const userBranch = alias(schema.branches, "user_branch");
    const attrBranch = alias(schema.branches, "attr_branch");
    const subBranch = alias(schema.branches, "sub_branch");
    const isPaid = and(gt(sub.pricePaid, 0), ne(sub.priceTypeApplied, "zero"));

    const rows = await this.db
      .select({
        subscriptionId: sub.id,
        userId: sub.userId,
        createdAt: sub.createdAt,
        platform: sa.platform,
        userCountry: userBranch.country,
        attrCountry: attrBranch.country,
        subCountry: subBranch.country,
      })
      .from(sub)
      .innerJoin(
        schema.users,
        and(eq(schema.users.id, sub.userId), tenantWhere(schema.users, ctx)),
      )
      .innerJoin(
        userBranch,
        and(
          eq(userBranch.id, schema.users.branchId),
          tenantWhere(userBranch, ctx),
        ),
      )
      .innerJoin(
        subBranch,
        and(eq(subBranch.id, sub.branchId), tenantWhere(subBranch, ctx)),
      )
      .leftJoin(sa, and(eq(sa.userId, schema.users.id), tenantWhere(sa, ctx)))
      .leftJoin(
        attrBranch,
        and(eq(attrBranch.id, sa.branchId), tenantWhere(attrBranch, ctx)),
      )
      .where(and(tenantWhere(sub, ctx), isPaid, gte(sub.createdAt, since)));

    if (rows.length === 0) return [];

    // "Primera suscripción paga" mira TODA la historia del alumno, no solo la
    // ventana: la primera por (createdAt, id). Si no es esta, no hay Purchase.
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const firstByUser = new Map<number, { id: number; createdAt: Date }>();
    for (const part of chunk(userIds, IN_CHUNK)) {
      const history = await this.db
        .select({ id: sub.id, userId: sub.userId, createdAt: sub.createdAt })
        .from(sub)
        .where(and(tenantWhere(sub, ctx), isPaid, inArray(sub.userId, part)));
      for (const h of history) {
        const current = firstByUser.get(h.userId);
        const isEarlier =
          !current ||
          h.createdAt.getTime() < current.createdAt.getTime() ||
          (h.createdAt.getTime() === current.createdAt.getTime() &&
            h.id < current.id);
        if (isEarlier)
          firstByUser.set(h.userId, { id: h.id, createdAt: h.createdAt });
      }
    }

    return rows
      .filter((r) => firstByUser.get(r.userId)?.id === r.subscriptionId)
      .map((r) => ({
        eventId: `purchase-${r.subscriptionId}`,
        eventName: "Purchase" as const,
        userId: r.userId,
        entityType: "subscription" as const,
        entityId: r.subscriptionId,
        actionSource: "physical_store" as const,
        eventTime: r.createdAt,
        status: decideEventStatus({
          countries: [r.userCountry, r.attrCountry, r.subCountry],
          platform: r.platform,
          eventTime: r.createdAt,
          actionSource: "physical_store",
          now,
        }),
      }));
  }

  /**
   * Manda los `pending` y los `failed` con intentos pendientes. Antes de armar
   * cada evento re-chequea la ventana y el país (el alumno pudo cambiar de
   * sede); lo que ya no puede viajar queda marcado con su motivo. Lotes de 100.
   */
  async sendPending(
    ctx: TenantContext,
    config: MetaCapiConfig,
    now: Date,
  ): Promise<CapiSendSummary> {
    const summary: CapiSendSummary = { sent: 0, failed: 0, skipped: 0 };
    const events = schema.metaCapiEvents;

    const rows = await this.db
      .select()
      .from(events)
      .where(
        and(
          tenantWhere(events, ctx),
          or(
            eq(events.status, "pending"),
            and(eq(events.status, "failed"), lt(events.attempts, MAX_ATTEMPTS)),
          ),
        ),
      )
      .orderBy(asc(events.id))
      .limit(SEND_LIMIT);
    if (rows.length === 0) return summary;

    const people = await this.loadPeople(ctx, [
      ...new Set(rows.map((r) => r.userId)),
    ]);
    const subscriptions = await this.loadSubscriptions(
      ctx,
      rows
        .filter((r) => r.entityType === "subscription")
        .map((r) => r.entityId),
    );

    const toSend: Array<{ rowId: number; event: CapiEvent }> = [];
    const skipped = new Map<CapiRowStatus, number[]>();
    const lost: number[] = [];

    for (const row of rows) {
      const person = people.get(row.userId);
      if (!person) {
        lost.push(row.id);
        continue;
      }
      const verdict = decideEventStatus({
        countries: [person.userCountry, person.attrCountry],
        // La plataforma ya se decidió al derivar; acá solo importa que siga
        // siendo elegible (una fila de origen no cambia).
        platform: person.platform,
        eventTime: row.eventTime,
        actionSource: row.actionSource as CapiActionSource,
        now,
      });
      if (verdict !== "pending") {
        skipped.set(verdict, [...(skipped.get(verdict) ?? []), row.id]);
        continue;
      }

      const base: CapiPerson = {
        userId: row.userId,
        tenantId: ctx.tenantId,
        email: person.email,
        phone: person.phone,
        country: SEND_COUNTRY,
        fbc: person.fbc,
        fbp: person.fbp,
      };

      if (row.entityType === "registration") {
        toSend.push({
          rowId: row.id,
          event: buildRegistrationEvent({
            ...base,
            eventTime: row.eventTime,
            platform: person.platform ?? "unknown",
            clientIp: person.clientIp,
            userAgent: person.userAgent,
          }),
        });
      } else if (row.entityType === "trial_booking") {
        toSend.push({
          rowId: row.id,
          event: buildTrialEvent({
            ...base,
            bookingId: row.entityId,
            eventTime: row.eventTime,
          }),
        });
      } else {
        const subscription = subscriptions.get(row.entityId);
        if (!subscription) {
          lost.push(row.id);
          continue;
        }
        toSend.push({
          rowId: row.id,
          event: buildPurchaseEvent({
            ...base,
            subscriptionId: row.entityId,
            eventTime: row.eventTime,
            // `pricePaid` está en unidades enteras de la moneda (pesos o euros,
            // sin centavos): es exactamente lo que renderiza `formatPrice`.
            value: subscription.pricePaid,
            currency: subscription.currency,
          }),
        });
      }
    }

    for (const [status, ids] of skipped) {
      await this.setStatus(ctx, ids, { status });
      summary.skipped += ids.length;
    }
    if (lost.length > 0) {
      // La entidad desapareció: no hay nada que reintentar.
      await this.db
        .update(events)
        .set({
          status: "failed",
          attempts: MAX_ATTEMPTS,
          lastError: "La entidad del evento ya no existe",
        })
        .where(and(tenantWhere(events, ctx), inArray(events.id, lost)));
      summary.failed += lost.length;
    }

    for (const batch of chunk(toSend, BATCH_SIZE)) {
      const ids = batch.map((b) => b.rowId);
      try {
        await graphPost(config, `/${config.pixelId}/events`, {
          data: batch.map((b) => b.event),
          ...(config.testEventCode
            ? { test_event_code: config.testEventCode }
            : {}),
        });
        await this.db
          .update(events)
          .set({
            status: "sent",
            sentAt: now,
            lastError: null,
            attempts: sql`${events.attempts} + 1`,
          })
          .where(and(tenantWhere(events, ctx), inArray(events.id, ids)));
        summary.sent += ids.length;
      } catch (err: unknown) {
        const message =
          err instanceof MetaApiError
            ? err.message
            : redactSecrets(
                err instanceof Error ? err.message : "Error desconocido",
                config.token,
              );
        // El mensaje ya viene sin el token. `tenantId` va como campo, no en el texto.
        this.log.warn(
          { tenantId: ctx.tenantId, batchSize: ids.length, err: message },
          "Meta CAPI rechazo un lote",
        );
        await this.db
          .update(events)
          .set({
            status: "failed",
            lastError: message.slice(0, 500),
            attempts: sql`${events.attempts} + 1`,
          })
          .where(and(tenantWhere(events, ctx), inArray(events.id, ids)));
        summary.failed += ids.length;
      }
    }

    return summary;
  }

  /**
   * Borra la IP y el user agent de `signup_attributions` (T-195-30) cuando el
   * registro ya se envió o se descartó, o cuando la fila tiene más de 7 días.
   * Solo toca filas que todavía tienen IP o user agent (las ya purgadas no se re-estampan). Devuelve cuántas purgó.
   */
  async purgeClientContext(ctx: TenantContext, now: Date): Promise<number> {
    const sa = schema.signupAttributions;
    const events = schema.metaCapiEvents;
    const cutoff = new Date(now.getTime() - PII_RETENTION_MS);

    const result = await this.db
      .update(sa)
      .set({ clientIp: null, userAgent: null, piiPurgedAt: now })
      .where(
        and(
          tenantWhere(sa, ctx),
          or(isNotNull(sa.clientIp), isNotNull(sa.userAgent)),
          or(
            lt(sa.createdAt, cutoff),
            // El evento de registro ya no está esperando envío: salió o se descartó.
            inArray(
              sa.userId,
              this.db
                .select({ userId: events.userId })
                .from(events)
                .where(
                  and(
                    tenantWhere(events, ctx),
                    eq(events.entityType, "registration"),
                    ne(events.status, "pending"),
                    ne(events.status, "failed"),
                  ),
                ),
            ),
          ),
        ),
      );
    const header = Array.isArray(result) ? result[0] : result;
    return (header as { affectedRows?: number }).affectedRows ?? 0;
  }

  private async setStatus(
    ctx: TenantContext,
    ids: number[],
    patch: { status: CapiRowStatus },
  ): Promise<void> {
    const events = schema.metaCapiEvents;
    await this.db
      .update(events)
      .set(patch)
      .where(and(tenantWhere(events, ctx), inArray(events.id, ids)));
  }

  /** Datos de cada alumno para armar `user_data` (solo en memoria, no se loguean). */
  private async loadPeople(ctx: TenantContext, userIds: number[]) {
    const sa = schema.signupAttributions;
    const userBranch = alias(schema.branches, "user_branch");
    const attrBranch = alias(schema.branches, "attr_branch");
    const out = new Map<
      number,
      {
        email: string | null;
        phone: string | null;
        platform: string | null;
        fbc: string | null;
        fbp: string | null;
        clientIp: string | null;
        userAgent: string | null;
        userCountry: string;
        attrCountry: string | null;
      }
    >();

    for (const part of chunk(userIds, IN_CHUNK)) {
      const rows = await this.db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          phone: schema.users.phone,
          platform: sa.platform,
          fbc: sa.fbc,
          fbp: sa.fbp,
          clientIp: sa.clientIp,
          userAgent: sa.userAgent,
          userCountry: userBranch.country,
          attrCountry: attrBranch.country,
        })
        .from(schema.users)
        .innerJoin(
          userBranch,
          and(
            eq(userBranch.id, schema.users.branchId),
            tenantWhere(userBranch, ctx),
          ),
        )
        .leftJoin(sa, and(eq(sa.userId, schema.users.id), tenantWhere(sa, ctx)))
        .leftJoin(
          attrBranch,
          and(eq(attrBranch.id, sa.branchId), tenantWhere(attrBranch, ctx)),
        )
        .where(
          and(tenantWhere(schema.users, ctx), inArray(schema.users.id, part)),
        );
      for (const r of rows) {
        out.set(r.id, {
          email: r.email,
          phone: r.phone,
          platform: r.platform,
          fbc: r.fbc,
          fbp: r.fbp,
          clientIp: r.clientIp,
          userAgent: r.userAgent,
          userCountry: r.userCountry,
          attrCountry: r.attrCountry,
        });
      }
    }
    return out;
  }

  private async loadSubscriptions(ctx: TenantContext, ids: number[]) {
    const sub = schema.subscriptions;
    const out = new Map<number, { pricePaid: number; currency: string }>();
    for (const part of chunk([...new Set(ids)], IN_CHUNK)) {
      const rows = await this.db
        .select({
          id: sub.id,
          pricePaid: sub.pricePaid,
          currency: sub.currency,
        })
        .from(sub)
        .where(and(tenantWhere(sub, ctx), inArray(sub.id, part)));
      for (const r of rows)
        out.set(r.id, { pricePaid: r.pricePaid, currency: r.currency });
    }
    return out;
  }
}
