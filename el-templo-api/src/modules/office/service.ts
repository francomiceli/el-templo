/**
 * OfficeService — Oficina, central de temas de gestión (Fase 205).
 *
 * Un tema es algo que la gerencia está atendiendo: título, contexto, vínculo
 * opcional a una cosa del sistema, responsable opcional, estado
 * (abierto / dormido / cerrado) y un hilo de eventos. El hilo ES la tabla
 * `office_topic_events` (D-05): no se escribe en `audit_log`.
 *
 * REGLAS QUE ESTE ARCHIVO SOSTIENE (leer antes de tocar)
 * ------------------------------------------------------
 *   - D-07: toda acción PROPIA sobre un tema (crear, comentar, asignar, dormir,
 *     cerrar, editar) upsertea la lectura del actor con el MISMO timestamp que
 *     el evento. Así un comentario propio nunca aparece como "nuevo" para uno
 *     mismo. `unseen` es "sin lectura o actividad estrictamente posterior".
 *   - D-08: badge = menciones sin leer en temas no cerrados + temas asignados
 *     a mí, no cerrados, con actividad posterior a mi última vista.
 *   - D-09: los dormidos vencidos se despiertan solos (job cada 30 min y, de
 *     forma perezosa, el listado). "Hoy" es el de la sede del tema, o el de la
 *     primera sede activa si el tema no tiene sede.
 *   - Tenancy: toda query sobre `office_*`, `users` y `branches` lleva
 *     `tenantWhere`/`tenantValues`. Un tema de otro gimnasio es indistinguible
 *     de uno inexistente (404).
 *
 * Los timestamps de negocio se truncan a SEGUNDOS (`nowSeconds`): las columnas
 * son `timestamp(0)` y MySQL REDONDEA los milisegundos, lo que podía dejar
 * `last_activity_at` un segundo por delante de la lectura del actor.
 */
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  max,
  ne,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type {
  OfficeTopicEventRow,
  OfficeTopicRow,
} from "../../db/schema/office";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../shared/errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { isDuplicateKeyError } from "../shared/sql-errors";
import { readAffectedRows } from "../shared/affected-rows";
import { todayInTz } from "../shared/date-utils";
import type { TxHandle } from "../finance/balance-service";
import type {
  CreateSystemTopicInput,
  CreateTopicInput,
  ListTopicsQuery,
  OfficeBadge,
  OfficeEvent,
  OfficeEventType,
  OfficePerson,
  OfficeStaff,
  OfficeSystemTopicRef,
  OfficeTargetKind,
  OfficeTopicDetail,
  OfficeTopicListItem,
  PatchTopicInput,
} from "./types";

const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const TARGET_LABEL_MAX = 160;

/** Roles que NO son staff: socios y la cuenta de los televisores. */
const NON_STAFF_ROLES: ("member" | "tv")[] = ["member", "tv"];

/** `now` truncado a segundos (ver docblock del archivo). */
function nowSeconds(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}

/** Texto libre: recorta y convierte vacío en null. */
function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function personOf(
  id: number | null,
  firstName: string | null,
  lastName: string | null,
): OfficePerson | null {
  if (id === null) return null;
  return { id, firstName, lastName };
}

function fullName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(" ");
}

/** Escapa los comodines de LIKE para que `q` se busque literal. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** `YYYY-MM-DD` que además es una fecha real (descarta 2026-13-45). */
function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Zona horaria por sede + la de respaldo para temas sin sede. */
interface TimezoneBook {
  forBranch(branchId: number | null): string;
}

interface InternalTopic {
  item: OfficeTopicListItem;
  body: string | null;
}

export class OfficeService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  // ───────────────────────────── Lecturas ─────────────────────────────

  async listTopics(
    ctx: TenantContext,
    actorId: number,
    query: ListTopicsQuery,
  ): Promise<OfficeTopicListItem[]> {
    await this.wakeDueTopics(ctx);

    const conditions: SQL[] = [];
    const view = query.view ?? "abiertos";
    if (view === "abiertos") {
      conditions.push(eq(schema.officeTopics.status, "abierto"));
    } else if (view === "dormidos") {
      conditions.push(eq(schema.officeTopics.status, "dormido"));
    } else if (view === "cerrados") {
      conditions.push(eq(schema.officeTopics.status, "cerrado"));
    } else if (view === "mios") {
      conditions.push(eq(schema.officeTopics.assigneeId, actorId));
      conditions.push(ne(schema.officeTopics.status, "cerrado"));
    }

    if (query.origin) {
      conditions.push(eq(schema.officeTopics.origin, query.origin));
    }
    if (query.targetKind) {
      conditions.push(eq(schema.officeTopics.targetKind, query.targetKind));
    }
    if (query.targetId !== undefined) {
      conditions.push(eq(schema.officeTopics.targetId, query.targetId));
    }
    const q = cleanText(query.q);
    if (q) {
      const pattern = `%${escapeLike(q)}%`;
      const textMatch = or(
        like(schema.officeTopics.title, pattern),
        like(schema.officeTopics.targetLabel, pattern),
        like(schema.officeTopics.body, pattern),
      );
      if (textMatch) conditions.push(textMatch);
    }

    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const rows = await this.queryTopics(ctx, actorId, conditions, limit);
    return rows.map((r) => r.item);
  }

  async getTopic(
    ctx: TenantContext,
    actorId: number,
    id: number,
  ): Promise<OfficeTopicDetail> {
    const rows = await this.queryTopics(
      ctx,
      actorId,
      [eq(schema.officeTopics.id, id)],
      1,
    );
    const found = rows[0];
    if (!found) throw new NotFoundError("Tema no encontrado");

    const actor = alias(schema.users, "office_event_actor");
    const eventRows = await this.db
      .select({
        id: schema.officeTopicEvents.id,
        type: schema.officeTopicEvents.type,
        body: schema.officeTopicEvents.body,
        payload: schema.officeTopicEvents.payload,
        createdAt: schema.officeTopicEvents.createdAt,
        actorId: schema.officeTopicEvents.actorId,
        actorFirstName: actor.firstName,
        actorLastName: actor.lastName,
      })
      .from(schema.officeTopicEvents)
      .leftJoin(
        actor,
        and(
          tenantWhere(actor, ctx),
          eq(actor.id, schema.officeTopicEvents.actorId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.officeTopicEvents, ctx),
          eq(schema.officeTopicEvents.topicId, id),
        ),
      )
      .orderBy(
        asc(schema.officeTopicEvents.createdAt),
        asc(schema.officeTopicEvents.id),
      );

    const events: OfficeEvent[] = eventRows.map((e) => ({
      id: e.id,
      type: e.type,
      body: e.body,
      payload: e.payload ?? null,
      actor: personOf(e.actorId, e.actorFirstName, e.actorLastName),
      createdAt: e.createdAt.toISOString(),
    }));

    return { ...found.item, body: found.body, events };
  }

  async getBadge(ctx: TenantContext, actorId: number): Promise<OfficeBadge> {
    const [mentionRow] = await this.db
      .select({ n: count() })
      .from(schema.officeMentions)
      .innerJoin(
        schema.officeTopics,
        and(
          tenantWhere(schema.officeTopics, ctx),
          eq(schema.officeTopics.id, schema.officeMentions.topicId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.officeMentions, ctx),
          eq(schema.officeMentions.userId, actorId),
          isNull(schema.officeMentions.readAt),
          ne(schema.officeTopics.status, "cerrado"),
        ),
      );

    const [assignedRow] = await this.db
      .select({ n: count() })
      .from(schema.officeTopics)
      .leftJoin(
        schema.officeTopicReads,
        and(
          tenantWhere(schema.officeTopicReads, ctx),
          eq(schema.officeTopicReads.topicId, schema.officeTopics.id),
          eq(schema.officeTopicReads.userId, actorId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.officeTopics, ctx),
          eq(schema.officeTopics.assigneeId, actorId),
          ne(schema.officeTopics.status, "cerrado"),
          or(
            isNull(schema.officeTopicReads.id),
            gt(
              schema.officeTopics.lastActivityAt,
              schema.officeTopicReads.lastSeenAt,
            ),
          ),
        ),
      );

    const mentions = Number(mentionRow?.n ?? 0);
    const assigned = Number(assignedRow?.n ?? 0);
    return { count: mentions + assigned, mentions, assigned };
  }

  async listStaff(ctx: TenantContext): Promise<OfficeStaff[]> {
    const rows = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(and(...this.staffConditions(ctx)))
      .orderBy(asc(schema.users.firstName), asc(schema.users.lastName));
    return rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      role: r.role,
    }));
  }

  // ───────────────────────────── Escrituras ─────────────────────────────

  async createTopic(
    ctx: TenantContext,
    actorId: number,
    input: CreateTopicInput,
  ): Promise<OfficeTopicDetail> {
    const title = input.title.trim();
    if (title.length === 0) {
      throw new BadRequestError("El título no puede estar vacío");
    }
    const body = cleanText(input.body);
    const target = await this.resolveTarget(ctx, input);
    if (input.branchId !== undefined && input.branchId !== null) {
      await this.assertBranch(ctx, input.branchId);
    }
    const assignee =
      input.assigneeId !== undefined && input.assigneeId !== null
        ? await this.assertStaff(ctx, input.assigneeId)
        : null;

    const topicId = await this.db.transaction(async (tx: TxHandle) => {
      const at = nowSeconds();
      const id = await this.insertTopic(tx, ctx, {
        title,
        body,
        origin: "manual",
        sourceKey: null,
        target,
        branchId: input.branchId ?? null,
        assigneeId: assignee ? assignee.id : null,
        createdBy: actorId,
        at,
      });
      const createdEventId = await this.insertEvent(
        tx,
        ctx,
        id,
        actorId,
        "creado",
        body,
        null,
        at,
      );
      await this.insertMentions(
        tx,
        ctx,
        id,
        createdEventId,
        input.mentionUserIds,
        actorId,
      );
      if (assignee) {
        await this.insertEvent(
          tx,
          ctx,
          id,
          actorId,
          assignee.id === actorId ? "tomado" : "asignado",
          null,
          {
            assigneeId: assignee.id,
            assigneeName: fullName(assignee.firstName, assignee.lastName),
          },
          at,
        );
      }
      await this.touchRead(tx, ctx, actorId, id, at);
      return id;
    });

    return this.getTopic(ctx, actorId, topicId);
  }

  /**
   * Abre un tema del sistema (lo usa el job del plan 03). Devuelve el id del
   * tema nuevo, o `null` si ya existía uno con ese `source_key` (en cualquier
   * estado: si el staff lo cerró a mano no se reabre, D-04).
   */
  async createSystemTopic(
    ctx: TenantContext,
    input: CreateSystemTopicInput,
  ): Promise<number | null> {
    const [existing] = await this.db
      .select({ id: schema.officeTopics.id })
      .from(schema.officeTopics)
      .where(
        and(
          tenantWhere(schema.officeTopics, ctx),
          eq(schema.officeTopics.sourceKey, input.sourceKey),
        ),
      )
      .limit(1);
    if (existing) return null;

    const target =
      input.targetKind !== null && input.targetId !== null
        ? {
            kind: input.targetKind,
            id: input.targetId,
            label:
              cleanText(input.targetLabel)?.slice(0, TARGET_LABEL_MAX) ?? null,
          }
        : null;
    const body = cleanText(input.body);

    try {
      return await this.db.transaction(async (tx: TxHandle) => {
        const at = nowSeconds();
        const id = await this.insertTopic(tx, ctx, {
          title: input.title.trim().slice(0, 160),
          body,
          origin: "sistema",
          sourceKey: input.sourceKey,
          target,
          branchId: input.branchId,
          assigneeId: null,
          createdBy: null,
          at,
        });
        await this.insertEvent(tx, ctx, id, null, "creado", body, null, at);
        return id;
      });
    } catch (err: unknown) {
      // Dos corridas del job a la vez: la unique (tenant, source_key) decide.
      if (isDuplicateKeyError(err).isDuplicate) return null;
      throw err;
    }
  }

  /**
   * Cierra el tema del sistema `sourceKey` si sigue abierto o dormido. Devuelve
   * `true` si lo cerró. El evento lo firma el sistema (actor NULL).
   */
  async closeSystemTopic(
    ctx: TenantContext,
    sourceKey: string,
    reason: string,
  ): Promise<boolean> {
    return this.db.transaction(async (tx: TxHandle) => {
      const [row] = await tx
        .select({ id: schema.officeTopics.id })
        .from(schema.officeTopics)
        .where(
          and(
            tenantWhere(schema.officeTopics, ctx),
            eq(schema.officeTopics.sourceKey, sourceKey),
            ne(schema.officeTopics.status, "cerrado"),
          ),
        )
        .limit(1)
        .for("update");
      if (!row) return false;

      const at = nowSeconds();
      await tx
        .update(schema.officeTopics)
        .set({
          status: "cerrado",
          snoozedUntil: null,
          closedAt: at,
          closedBy: null,
          lastActivityAt: at,
        })
        .where(
          and(
            tenantWhere(schema.officeTopics, ctx),
            eq(schema.officeTopics.id, row.id),
          ),
        );
      await this.insertEvent(
        tx,
        ctx,
        row.id,
        null,
        "sistema",
        reason,
        null,
        at,
      );
      return true;
    });
  }

  /** Temas del sistema no cerrados cuyo `source_key` empieza por `prefix`. */
  async listOpenSystemTopics(
    ctx: TenantContext,
    sourceKeyPrefix: string,
  ): Promise<OfficeSystemTopicRef[]> {
    const rows = await this.db
      .select({
        id: schema.officeTopics.id,
        sourceKey: schema.officeTopics.sourceKey,
      })
      .from(schema.officeTopics)
      .where(
        and(
          tenantWhere(schema.officeTopics, ctx),
          eq(schema.officeTopics.origin, "sistema"),
          ne(schema.officeTopics.status, "cerrado"),
          like(
            schema.officeTopics.sourceKey,
            `${escapeLike(sourceKeyPrefix)}%`,
          ),
        ),
      );
    const refs: OfficeSystemTopicRef[] = [];
    for (const r of rows) {
      if (r.sourceKey !== null) refs.push({ id: r.id, sourceKey: r.sourceKey });
    }
    return refs;
  }

  async addComment(
    ctx: TenantContext,
    actorId: number,
    topicId: number,
    body: string,
    mentionUserIds?: number[],
  ): Promise<OfficeTopicDetail> {
    const text = cleanText(body);
    if (!text) throw new BadRequestError("El comentario no puede estar vacío");

    await this.db.transaction(async (tx: TxHandle) => {
      const topic = await this.lockTopic(tx, ctx, topicId);
      if (topic.status === "cerrado") {
        throw new ConflictError(
          "El tema está cerrado: reabrilo para poder comentar",
        );
      }
      const at = nowSeconds();
      const eventId = await this.insertEvent(
        tx,
        ctx,
        topicId,
        actorId,
        "comentario",
        text,
        null,
        at,
      );
      await this.insertMentions(
        tx,
        ctx,
        topicId,
        eventId,
        mentionUserIds,
        actorId,
      );
      await this.bumpActivity(tx, ctx, topicId, at, {});
      await this.touchRead(tx, ctx, actorId, topicId, at);
    });

    return this.getTopic(ctx, actorId, topicId);
  }

  async patchTopic(
    ctx: TenantContext,
    actorId: number,
    topicId: number,
    input: PatchTopicInput,
  ): Promise<OfficeTopicDetail> {
    const pre = await this.findTopicRow(ctx, topicId);

    const snoozeValue = input.snoozedUntil;
    if (typeof snoozeValue === "string" && input.status !== undefined) {
      throw new BadRequestError(
        "No se puede dormir un tema y cambiarle el estado en el mismo pedido",
      );
    }
    let today: string | null = null;
    if (typeof snoozeValue === "string") {
      if (!isRealIsoDate(snoozeValue)) {
        throw new BadRequestError("La fecha para dormir el tema no es válida");
      }
      const book = await this.loadTimezones(ctx);
      today = todayInTz(book.forBranch(pre.branchId));
    }

    let title: string | undefined;
    if (input.title !== undefined) {
      title = input.title.trim();
      if (title.length === 0) {
        throw new BadRequestError("El título no puede estar vacío");
      }
    }
    const assignee =
      input.assigneeId !== undefined && input.assigneeId !== null
        ? await this.assertStaff(ctx, input.assigneeId)
        : null;

    await this.db.transaction(async (tx: TxHandle) => {
      const row = await this.lockTopic(tx, ctx, topicId);
      const at = nowSeconds();
      const set: Partial<typeof schema.officeTopics.$inferInsert> = {};
      let status = row.status;
      let touched = false;

      // 1) Ediciones de título / contexto.
      const editedFields: string[] = [];
      if (title !== undefined && title !== row.title) {
        set.title = title;
        editedFields.push("title");
      }
      if (input.body !== undefined) {
        const nextBody = cleanText(input.body);
        if (nextBody !== (row.body ?? null)) {
          set.body = nextBody;
          editedFields.push("body");
        }
      }
      if (editedFields.length > 0) {
        await this.insertEvent(
          tx,
          ctx,
          topicId,
          actorId,
          "editado",
          null,
          {
            fields: editedFields,
          },
          at,
        );
        touched = true;
      }

      // 2) Responsable.
      if (input.assigneeId === null) {
        if (row.assigneeId !== null) {
          set.assigneeId = null;
          await this.insertEvent(
            tx,
            ctx,
            topicId,
            actorId,
            "desasignado",
            null,
            {
              previousAssigneeId: row.assigneeId,
            },
            at,
          );
          touched = true;
        }
      } else if (assignee && assignee.id !== row.assigneeId) {
        set.assigneeId = assignee.id;
        await this.insertEvent(
          tx,
          ctx,
          topicId,
          actorId,
          assignee.id === actorId ? "tomado" : "asignado",
          null,
          {
            assigneeId: assignee.id,
            assigneeName: fullName(assignee.firstName, assignee.lastName),
          },
          at,
        );
        touched = true;
      }

      // 3) Dormir / quitar el sueño.
      if (typeof snoozeValue === "string") {
        if (status === "cerrado") {
          throw new ConflictError(
            "El tema está cerrado: reabrilo antes de dormirlo",
          );
        }
        if (today === null || snoozeValue <= today) {
          throw new BadRequestError(
            "La fecha para dormir el tema tiene que ser posterior a hoy",
          );
        }
        status = "dormido";
        set.status = "dormido";
        set.snoozedUntil = snoozeValue;
        await this.insertEvent(
          tx,
          ctx,
          topicId,
          actorId,
          "dormido",
          null,
          {
            until: snoozeValue,
          },
          at,
        );
        touched = true;
      } else if (snoozeValue === null && status === "dormido") {
        status = "abierto";
        set.status = "abierto";
        set.snoozedUntil = null;
        await this.insertEvent(
          tx,
          ctx,
          topicId,
          actorId,
          "reabierto",
          null,
          null,
          at,
        );
        touched = true;
      }

      // 4) Cerrar / reabrir.
      if (input.status === "cerrado" && status !== "cerrado") {
        status = "cerrado";
        set.status = "cerrado";
        set.snoozedUntil = null;
        set.closedAt = at;
        set.closedBy = actorId;
        await this.insertEvent(
          tx,
          ctx,
          topicId,
          actorId,
          "cerrado",
          cleanText(input.note),
          null,
          at,
        );
        touched = true;
      } else if (input.status === "abierto" && status !== "abierto") {
        status = "abierto";
        set.status = "abierto";
        set.snoozedUntil = null;
        set.closedAt = null;
        set.closedBy = null;
        await this.insertEvent(
          tx,
          ctx,
          topicId,
          actorId,
          "reabierto",
          null,
          null,
          at,
        );
        touched = true;
      }

      if (touched) {
        await this.bumpActivity(tx, ctx, topicId, at, set);
        await this.touchRead(tx, ctx, actorId, topicId, at);
      }
    });

    return this.getTopic(ctx, actorId, topicId);
  }

  /** Marca el tema como visto por `actorId` y le lee sus menciones de ese tema. */
  async markSeen(
    ctx: TenantContext,
    actorId: number,
    topicId: number,
  ): Promise<void> {
    await this.findTopicRow(ctx, topicId);
    const at = nowSeconds();
    await this.db.transaction(async (tx: TxHandle) => {
      await this.touchRead(tx, ctx, actorId, topicId, at);
      await tx
        .update(schema.officeMentions)
        .set({ readAt: at })
        .where(
          and(
            tenantWhere(schema.officeMentions, ctx),
            eq(schema.officeMentions.topicId, topicId),
            eq(schema.officeMentions.userId, actorId),
            isNull(schema.officeMentions.readAt),
          ),
        );
    });
  }

  /**
   * Despierta los dormidos con `snoozed_until <= hoy` (D-09). Devuelve cuántos
   * despertó. Idempotente y a prueba de carreras: el UPDATE exige
   * `status = 'dormido'`, así que dos despertadores simultáneos no duplican el
   * evento `reabierto`.
   */
  async wakeDueTopics(ctx: TenantContext): Promise<number> {
    const sleeping = await this.db
      .select({
        id: schema.officeTopics.id,
        branchId: schema.officeTopics.branchId,
        snoozedUntil: schema.officeTopics.snoozedUntil,
      })
      .from(schema.officeTopics)
      .where(
        and(
          tenantWhere(schema.officeTopics, ctx),
          eq(schema.officeTopics.status, "dormido"),
          isNotNull(schema.officeTopics.snoozedUntil),
        ),
      );
    if (sleeping.length === 0) return 0;

    const book = await this.loadTimezones(ctx);
    let woken = 0;
    for (const topic of sleeping) {
      if (topic.snoozedUntil === null) continue;
      const today = todayInTz(book.forBranch(topic.branchId));
      if (topic.snoozedUntil > today) continue;

      const didWake = await this.db.transaction(async (tx: TxHandle) => {
        const at = nowSeconds();
        const result = await tx
          .update(schema.officeTopics)
          .set({ status: "abierto", snoozedUntil: null, lastActivityAt: at })
          .where(
            and(
              tenantWhere(schema.officeTopics, ctx),
              eq(schema.officeTopics.id, topic.id),
              eq(schema.officeTopics.status, "dormido"),
            ),
          );
        if (readAffectedRows(result) === 0) return false;
        await this.insertEvent(
          tx,
          ctx,
          topic.id,
          null,
          "reabierto",
          null,
          {
            auto: true,
          },
          at,
        );
        return true;
      });
      if (didWake) woken += 1;
    }
    if (woken > 0) {
      this.log.info(
        { tenantId: ctx.tenantId, woken },
        "office: temas dormidos despertados",
      );
    }
    return woken;
  }

  // ───────────────────────────── Privados ─────────────────────────────

  /** Condiciones de "staff activo del gimnasio" (no socio, no TV, no deshabilitado, no borrado). */
  private staffConditions(ctx: TenantContext): SQL[] {
    return [
      tenantWhere(schema.users, ctx),
      notInArray(schema.users.role, NON_STAFF_ROLES),
      eq(schema.users.staffDisabled, false),
      isNull(schema.users.deletedAt),
    ];
  }

  private async assertStaff(
    ctx: TenantContext,
    userId: number,
  ): Promise<{
    id: number;
    firstName: string | null;
    lastName: string | null;
  }> {
    const [row] = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.users)
      .where(and(...this.staffConditions(ctx), eq(schema.users.id, userId)))
      .limit(1);
    if (!row) {
      throw new BadRequestError("La persona elegida no es parte del staff");
    }
    return row;
  }

  private async assertBranch(
    ctx: TenantContext,
    branchId: number,
  ): Promise<void> {
    const [row] = await this.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, branchId),
        ),
      )
      .limit(1);
    if (!row) throw new BadRequestError("La sede elegida no existe");
  }

  /** Valida el vínculo (`targetKind` y `targetId` van juntos) y resuelve la etiqueta del socio. */
  private async resolveTarget(
    ctx: TenantContext,
    input: CreateTopicInput,
  ): Promise<{
    kind: OfficeTargetKind;
    id: number;
    label: string | null;
  } | null> {
    const kind = input.targetKind ?? null;
    const id = input.targetId ?? null;
    if ((kind === null) !== (id === null)) {
      throw new BadRequestError("targetKind y targetId van juntos");
    }
    if (kind === null || id === null) return null;

    let label = cleanText(input.targetLabel);
    if (kind === "socio") {
      const [member] = await this.db
        .select({
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
        })
        .from(schema.users)
        .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, id)))
        .limit(1);
      if (!member) throw new NotFoundError("Socio no encontrado");
      if (!label) {
        label = cleanText(fullName(member.firstName, member.lastName));
      }
    }
    return { kind, id, label: label ? label.slice(0, TARGET_LABEL_MAX) : null };
  }

  private async insertTopic(
    tx: TxHandle,
    ctx: TenantContext,
    v: {
      title: string;
      body: string | null;
      origin: "manual" | "sistema";
      sourceKey: string | null;
      target: {
        kind: OfficeTargetKind;
        id: number;
        label: string | null;
      } | null;
      branchId: number | null;
      assigneeId: number | null;
      createdBy: number | null;
      at: Date;
    },
  ): Promise<number> {
    const result = await tx.insert(schema.officeTopics).values(
      tenantValues(ctx, {
        title: v.title,
        body: v.body,
        status: "abierto" as const,
        origin: v.origin,
        sourceKey: v.sourceKey,
        targetKind: v.target ? v.target.kind : null,
        targetId: v.target ? v.target.id : null,
        targetLabel: v.target ? v.target.label : null,
        branchId: v.branchId,
        assigneeId: v.assigneeId,
        createdBy: v.createdBy,
        lastActivityAt: v.at,
        createdAt: v.at,
      }),
    );
    return Number(result[0].insertId);
  }

  private async insertEvent(
    tx: TxHandle,
    ctx: TenantContext,
    topicId: number,
    actorId: number | null,
    type: OfficeEventType,
    body: string | null,
    payload: Record<string, unknown> | null,
    at: Date,
  ): Promise<number> {
    const result = await tx.insert(schema.officeTopicEvents).values(
      tenantValues(ctx, {
        topicId,
        actorId,
        type,
        body,
        payload,
        createdAt: at,
      }),
    );
    return Number(result[0].insertId);
  }

  /** Un UPDATE del tema que además deja `last_activity_at = at`. */
  private async bumpActivity(
    tx: TxHandle,
    ctx: TenantContext,
    topicId: number,
    at: Date,
    set: Partial<typeof schema.officeTopics.$inferInsert>,
  ): Promise<void> {
    await tx
      .update(schema.officeTopics)
      .set({ ...set, lastActivityAt: at })
      .where(
        and(
          tenantWhere(schema.officeTopics, ctx),
          eq(schema.officeTopics.id, topicId),
        ),
      );
  }

  /** D-07: la lectura del actor queda con el MISMO timestamp que su evento. */
  private async touchRead(
    tx: TxHandle,
    ctx: TenantContext,
    userId: number,
    topicId: number,
    at: Date,
  ): Promise<void> {
    await tx
      .insert(schema.officeTopicReads)
      .values(tenantValues(ctx, { topicId, userId, lastSeenAt: at }))
      .onDuplicateKeyUpdate({ set: { lastSeenAt: at } });
  }

  /**
   * D-06: una fila en `office_mentions` por (evento, usuario). Se filtra a
   * staff activo del gimnasio, se ignora al propio actor y se deduplica.
   */
  private async insertMentions(
    tx: TxHandle,
    ctx: TenantContext,
    topicId: number,
    eventId: number,
    userIds: number[] | undefined,
    actorId: number | null,
  ): Promise<void> {
    const wanted = [...new Set(userIds ?? [])].filter((id) => id !== actorId);
    if (wanted.length === 0) return;
    const valid = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(...this.staffConditions(ctx), inArray(schema.users.id, wanted)),
      );
    if (valid.length === 0) return;
    await tx
      .insert(schema.officeMentions)
      .values(
        valid.map((u) => tenantValues(ctx, { topicId, eventId, userId: u.id })),
      );
  }

  /** Fila del tema (404 si no existe en este gimnasio). */
  private async findTopicRow(
    ctx: TenantContext,
    id: number,
  ): Promise<OfficeTopicRow> {
    const [row] = await this.db
      .select()
      .from(schema.officeTopics)
      .where(
        and(
          tenantWhere(schema.officeTopics, ctx),
          eq(schema.officeTopics.id, id),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError("Tema no encontrado");
    return row;
  }

  /** Igual que `findTopicRow` pero con `FOR UPDATE`: serializa las mutaciones de un tema. */
  private async lockTopic(
    tx: TxHandle,
    ctx: TenantContext,
    id: number,
  ): Promise<OfficeTopicRow> {
    const [row] = await tx
      .select()
      .from(schema.officeTopics)
      .where(
        and(
          tenantWhere(schema.officeTopics, ctx),
          eq(schema.officeTopics.id, id),
        ),
      )
      .limit(1)
      .for("update");
    if (!row) throw new NotFoundError("Tema no encontrado");
    return row;
  }

  private async loadTimezones(ctx: TenantContext): Promise<TimezoneBook> {
    const rows = await this.db
      .select({
        id: schema.branches.id,
        timezone: schema.branches.timezone,
        isActive: schema.branches.isActive,
      })
      .from(schema.branches)
      .where(tenantWhere(schema.branches, ctx))
      .orderBy(asc(schema.branches.id));
    const byId = new Map<number, string>();
    for (const r of rows) byId.set(r.id, r.timezone);
    const fallback = rows.find((r) => r.isActive)?.timezone ?? DEFAULT_TIMEZONE;
    return {
      forBranch: (branchId) =>
        (branchId !== null ? byId.get(branchId) : undefined) ?? fallback,
    };
  }

  /**
   * Query principal del listado y del detalle: una sola consulta sobre
   * `office_topics` (con assignee, creador, sede y la lectura del actor) más
   * tres agregadas por lote (comentarios, último evento y su autor).
   */
  private async queryTopics(
    ctx: TenantContext,
    actorId: number,
    extraWhere: SQL[],
    limit: number,
  ): Promise<InternalTopic[]> {
    const assignee = alias(schema.users, "office_assignee");
    const creator = alias(schema.users, "office_creator");

    const rows = await this.db
      .select({
        id: schema.officeTopics.id,
        title: schema.officeTopics.title,
        body: schema.officeTopics.body,
        status: schema.officeTopics.status,
        origin: schema.officeTopics.origin,
        targetKind: schema.officeTopics.targetKind,
        targetId: schema.officeTopics.targetId,
        targetLabel: schema.officeTopics.targetLabel,
        branchId: schema.officeTopics.branchId,
        branchName: schema.branches.name,
        assigneeId: schema.officeTopics.assigneeId,
        assigneeFirstName: assignee.firstName,
        assigneeLastName: assignee.lastName,
        createdById: schema.officeTopics.createdBy,
        creatorFirstName: creator.firstName,
        creatorLastName: creator.lastName,
        snoozedUntil: schema.officeTopics.snoozedUntil,
        lastActivityAt: schema.officeTopics.lastActivityAt,
        createdAt: schema.officeTopics.createdAt,
        closedAt: schema.officeTopics.closedAt,
        readId: schema.officeTopicReads.id,
        lastSeenAt: schema.officeTopicReads.lastSeenAt,
      })
      .from(schema.officeTopics)
      .leftJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.officeTopics.branchId),
        ),
      )
      .leftJoin(
        assignee,
        and(
          tenantWhere(assignee, ctx),
          eq(assignee.id, schema.officeTopics.assigneeId),
        ),
      )
      .leftJoin(
        creator,
        and(
          tenantWhere(creator, ctx),
          eq(creator.id, schema.officeTopics.createdBy),
        ),
      )
      .leftJoin(
        schema.officeTopicReads,
        and(
          tenantWhere(schema.officeTopicReads, ctx),
          eq(schema.officeTopicReads.topicId, schema.officeTopics.id),
          eq(schema.officeTopicReads.userId, actorId),
        ),
      )
      .where(and(tenantWhere(schema.officeTopics, ctx), ...extraWhere))
      .orderBy(
        desc(schema.officeTopics.lastActivityAt),
        desc(schema.officeTopics.id),
      )
      .limit(limit);

    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    // Comentarios por tema.
    const commentRows = await this.db
      .select({
        topicId: schema.officeTopicEvents.topicId,
        n: count(),
      })
      .from(schema.officeTopicEvents)
      .where(
        and(
          tenantWhere(schema.officeTopicEvents, ctx),
          eq(schema.officeTopicEvents.type, "comentario"),
          inArray(schema.officeTopicEvents.topicId, ids),
        ),
      )
      .groupBy(schema.officeTopicEvents.topicId);
    const commentCount = new Map<number, number>();
    for (const c of commentRows) commentCount.set(c.topicId, Number(c.n));

    // Último evento por tema (MAX(id) por tema, después el evento y su autor).
    const lastIdRows = await this.db
      .select({
        topicId: schema.officeTopicEvents.topicId,
        lastId: max(schema.officeTopicEvents.id),
      })
      .from(schema.officeTopicEvents)
      .where(
        and(
          tenantWhere(schema.officeTopicEvents, ctx),
          inArray(schema.officeTopicEvents.topicId, ids),
        ),
      )
      .groupBy(schema.officeTopicEvents.topicId);
    const lastIds: number[] = [];
    for (const r of lastIdRows) {
      if (r.lastId !== null) lastIds.push(Number(r.lastId));
    }

    const lastEvents = new Map<
      number,
      {
        row: Pick<OfficeTopicEventRow, "type" | "body" | "createdAt">;
        actorFirstName: string | null;
      }
    >();
    if (lastIds.length > 0) {
      const actor = alias(schema.users, "office_last_event_actor");
      const eventRows = await this.db
        .select({
          topicId: schema.officeTopicEvents.topicId,
          type: schema.officeTopicEvents.type,
          body: schema.officeTopicEvents.body,
          createdAt: schema.officeTopicEvents.createdAt,
          actorFirstName: actor.firstName,
        })
        .from(schema.officeTopicEvents)
        .leftJoin(
          actor,
          and(
            tenantWhere(actor, ctx),
            eq(actor.id, schema.officeTopicEvents.actorId),
          ),
        )
        .where(
          and(
            tenantWhere(schema.officeTopicEvents, ctx),
            inArray(schema.officeTopicEvents.id, lastIds),
          ),
        );
      for (const e of eventRows) {
        lastEvents.set(e.topicId, {
          row: { type: e.type, body: e.body, createdAt: e.createdAt },
          actorFirstName: e.actorFirstName,
        });
      }
    }

    return rows.map((r): InternalTopic => {
      const last = lastEvents.get(r.id);
      const unseen =
        r.readId === null ||
        r.lastSeenAt === null ||
        r.lastActivityAt.getTime() > r.lastSeenAt.getTime();
      return {
        body: r.body,
        item: {
          id: r.id,
          title: r.title,
          status: r.status,
          origin: r.origin,
          targetKind: r.targetKind,
          targetId: r.targetId,
          targetLabel: r.targetLabel,
          branchId: r.branchId,
          branchName: r.branchName,
          assignee: personOf(
            r.assigneeId,
            r.assigneeFirstName,
            r.assigneeLastName,
          ),
          createdBy: personOf(
            r.createdById,
            r.creatorFirstName,
            r.creatorLastName,
          ),
          snoozedUntil: r.snoozedUntil,
          lastActivityAt: r.lastActivityAt.toISOString(),
          createdAt: r.createdAt.toISOString(),
          closedAt: r.closedAt ? r.closedAt.toISOString() : null,
          commentCount: commentCount.get(r.id) ?? 0,
          lastEvent: last
            ? {
                type: last.row.type,
                body: last.row.body,
                actorFirstName: last.actorFirstName,
                createdAt: last.row.createdAt.toISOString(),
              }
            : null,
          unseen,
        },
      };
    });
  }
}
