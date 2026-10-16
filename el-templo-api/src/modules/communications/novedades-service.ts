/**
 * NovedadesService — feed de "Novedades" de Mi Templo: CRUD admin (con vistas y
 * clics por novedad) + lectura y eventos del socio.
 *
 * Entidad APARTE de `avisos` (D-1): sin botón, sin frecuencia, sin vigencia.
 * Solo una oración corta (máx. 80), sedes, destino opcional, fecha de
 * publicación y estado. Modelo base: `tv_avisos` (docblock de `novedades`).
 *
 * VISIBILIDAD DEL SOCIO (D-4): `status='active' AND publish_at <= ahora` y
 * (alcance vacío/NULL o que incluye la sede del socio), `publish_at DESC,
 * id DESC`, máximo 3. La condición vive en UN solo lugar
 * ({@link visibleToBranch}) y la usan el listado y el chequeo de eventos,
 * así "lo que se lista" y "lo que se puede reportar" no pueden divergir. El
 * alcance se resuelve en SQL (`JSON_CONTAINS`) y no en memoria como en
 * `tv_avisos`: las novedades no vencen (D-3), así que la tabla solo crece y
 * cada apertura de Mi Templo no debería leerla entera.
 *
 * FECHAS: `publish_at`/`first_seen_at`/`clicked_at` son DATETIME en UTC. El
 * "ahora" es siempre un `Date` de la app pasado como parámetro (Drizzle lo
 * serializa en UTC) y NUNCA `NOW()` del servidor MySQL, que depende de la zona
 * de la sesión.
 *
 * Toda query sobre `novedades`/`novedad_views` pasa por `tenantWhere`/
 * `tenantValues` (ambas gym-owned y strict). Un id de otro tenant da 404
 * `NotFoundError`, nunca 403 (T-175-03).
 */
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { novedades, novedadViews, users, branches } from "../../db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import { BadRequestError, NotFoundError } from "../shared/errors";
import {
  DEFAULT_WHATSAPP_TEXT,
  resolveDestinationRoute,
  validateDestination,
  type AppSectionKey,
  type Destination,
  type DestinationType,
} from "./destinations";
import { assertBranchesBelongToTenant } from "./branch-scope";

type DbInstance = MySql2Database<typeof schema>;
type NovedadRow = typeof novedades.$inferSelect;

/** D-2: largo máximo de la oración (cabe en 2 líneas de la card). */
export const NOVEDAD_TEXT_MAX_LENGTH = 80;
/** D-4: cuántas novedades ve como máximo un socio. */
export const NOVEDADES_MEMBER_LIMIT = 3;

export type NovedadStatus = "active" | "paused";
export type NovedadEventType = "seen" | "clicked";

/** Fila del CRUD admin, con las métricas de D-5. */
export interface NovedadAdminItem {
  id: number;
  text: string;
  /** `null` o `[]` = todas las sedes. */
  scopeBranchIds: number[] | null;
  destinationType: DestinationType | null;
  destinationSection: string | null;
  whatsappText: string | null;
  /** ISO 8601 (UTC). Futuro = programada. */
  publishAt: string;
  status: NovedadStatus;
  createdBy: number | null;
  createdAt: string;
  /** Socios únicos que la vieron. */
  views: number;
  /** Socios únicos que la tocaron. */
  clicks: number;
}

/** Forma que consume la app (D-4, D-6). */
export interface NovedadMemberItem {
  /** `"novedad:<id>"`: identidad estable para dedupe / `:key` / "NUEVO" en la app. */
  key: string;
  id: number;
  text: string;
  /** `null` si la novedad es global; si no, el nombre de la sede del socio. */
  branchLabel: string | null;
  /** ISO 8601 (UTC). La app calcula el "hace N días" (D-7). */
  publishedAt: string;
  /**
   * `null` = solo informa. `route` y `whatsappText` ya vienen resueltos (mismo
   * criterio que `PromptAviso.destination`), así la app reutiliza
   * `navigateToAvisoDestination`.
   */
  destination: {
    type: DestinationType;
    section: AppSectionKey | null;
    route: string;
    whatsappText: string | null;
  } | null;
  /** `true` si el socio ya la vio (se apaga el "NUEVO"). */
  seen: boolean;
}

export interface CreateNovedadInput {
  text: string;
  scopeBranchIds?: number[] | null;
  destinationType?: DestinationType | null;
  destinationSection?: string | null;
  whatsappText?: string | null;
  /** Sin valor = ahora. */
  publishAt?: Date;
  status?: NovedadStatus;
  createdBy: number;
}

export interface UpdateNovedadInput {
  text?: string;
  scopeBranchIds?: number[] | null;
  /**
   * Si la KEY `destinationType` viene (aunque sea `null`), el destino se
   * reemplaza ENTERO por (type, section, whatsappText) — lo que no viene queda
   * en `null`. Sin la key, `destinationSection`/`whatsappText` se mezclan con
   * el destino actual (p. ej. cambiar solo el texto de WhatsApp).
   */
  destinationType?: DestinationType | null;
  destinationSection?: string | null;
  whatsappText?: string | null;
  publishAt?: Date;
  status?: NovedadStatus;
}

/** Destino normalizado, listo para persistir. */
interface DestinationColumns {
  destinationType: DestinationType | null;
  destinationSection: string | null;
  whatsappText: string | null;
}

/**
 * D-4: condición de visibilidad para un socio de la sede `branchId` en el
 * instante `now`. NO incluye el filtro de tenant: cada sitio de llamada lo
 * suma con `tenantWhere` a la vista (el lint de tenancy juzga por statement).
 *
 * Las columnas JSON van como texto en el `sql` (sin `${novedades.col}`): solo
 * se usa en queries con `FROM novedades` sin joins (así no es ambigua), y
 * interpolar la tabla en un `sql` crudo lo cuenta el lint como un acceso suelto.
 */
function visibleToBranch(branchId: number, now: Date): SQL | undefined {
  return and(
    eq(novedades.status, "active"),
    lte(novedades.publishAt, now),
    or(
      isNull(novedades.scopeBranchIds),
      sql`JSON_LENGTH(scope_branch_ids) = 0`,
      sql`JSON_CONTAINS(scope_branch_ids, ${JSON.stringify(branchId)})`,
    ),
  );
}

export class NovedadesService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  // ── Admin ────────────────────────────────────────────────────────────────

  /**
   * Todas las novedades del tenant (activas, pausadas y programadas), más
   * recientes primero, con vistas y clics. Dos queries en total (la lista y un
   * conteo agrupado por novedad), sin N+1.
   */
  async list(ctx: TenantContext): Promise<NovedadAdminItem[]> {
    const rows = await this.db
      .select()
      .from(novedades)
      .where(tenantWhere(novedades, ctx))
      .orderBy(desc(novedades.publishAt), desc(novedades.id));

    if (rows.length === 0) return [];

    const counts = await this.db
      .select({
        novedadId: novedadViews.novedadId,
        views: count(),
        clicks: count(novedadViews.clickedAt),
      })
      .from(novedadViews)
      .where(tenantWhere(novedadViews, ctx))
      .groupBy(novedadViews.novedadId);
    const countsById = new Map(counts.map((c) => [c.novedadId, c]));

    return rows.map((row) =>
      this.toAdminItem(
        row,
        countsById.get(row.id)?.views ?? 0,
        countsById.get(row.id)?.clicks ?? 0,
      ),
    );
  }

  async create(
    ctx: TenantContext,
    input: CreateNovedadInput,
  ): Promise<NovedadAdminItem> {
    const text = this.normalizeText(input.text);
    const destination = this.resolveDestination({
      destinationType: input.destinationType ?? null,
      destinationSection: input.destinationSection ?? null,
      whatsappText: input.whatsappText ?? null,
    });
    await assertBranchesBelongToTenant(
      this.db,
      ctx,
      input.scopeBranchIds ?? null,
    );

    const [result] = await this.db.insert(novedades).values(
      tenantValues(ctx, {
        text,
        scopeBranchIds: this.normalizeScope(input.scopeBranchIds),
        ...destination,
        publishAt: input.publishAt ?? new Date(),
        status: input.status ?? "active",
        createdBy: input.createdBy,
      }),
    );

    const insertId = Number(result.insertId);
    this.log.info(
      { novedadId: insertId, tenantId: ctx.tenantId },
      "Novedad creada",
    );
    return this.getAdminItem(ctx, insertId);
  }

  async update(
    ctx: TenantContext,
    id: number,
    input: UpdateNovedadInput,
  ): Promise<NovedadAdminItem> {
    const existing = await this.findOwned(ctx, id);

    const updates: Partial<typeof novedades.$inferInsert> = {};
    if (input.text !== undefined) updates.text = this.normalizeText(input.text);
    if (input.scopeBranchIds !== undefined) {
      await assertBranchesBelongToTenant(this.db, ctx, input.scopeBranchIds);
      updates.scopeBranchIds = this.normalizeScope(input.scopeBranchIds);
    }

    const touchesDestination =
      input.destinationType !== undefined ||
      input.destinationSection !== undefined ||
      input.whatsappText !== undefined;
    if (touchesDestination) {
      const replacesAll = input.destinationType !== undefined;
      Object.assign(
        updates,
        this.resolveDestination(
          replacesAll
            ? {
                destinationType: input.destinationType ?? null,
                destinationSection: input.destinationSection ?? null,
                whatsappText: input.whatsappText ?? null,
              }
            : {
                destinationType: existing.destinationType,
                destinationSection:
                  input.destinationSection !== undefined
                    ? input.destinationSection
                    : existing.destinationSection,
                whatsappText:
                  input.whatsappText !== undefined
                    ? input.whatsappText
                    : existing.whatsappText,
              },
        ),
      );
    }

    if (input.publishAt !== undefined) updates.publishAt = input.publishAt;
    if (input.status !== undefined) updates.status = input.status;

    if (Object.keys(updates).length === 0) {
      throw new BadRequestError("No hay campos para actualizar");
    }

    await this.db
      .update(novedades)
      .set(updates)
      .where(and(tenantWhere(novedades, ctx), eq(novedades.id, id)));

    this.log.info({ novedadId: id, tenantId: ctx.tenantId }, "Novedad editada");
    return this.getAdminItem(ctx, id);
  }

  /** Borrado físico (D-2): las filas de `novedad_views` caen en cascada. */
  async remove(ctx: TenantContext, id: number): Promise<void> {
    await this.findOwned(ctx, id);

    await this.db
      .delete(novedades)
      .where(and(tenantWhere(novedades, ctx), eq(novedades.id, id)));

    this.log.info({ novedadId: id, tenantId: ctx.tenantId }, "Novedad borrada");
  }

  // ── Socio ────────────────────────────────────────────────────────────────

  /** D-4/D-6: hasta 3 novedades visibles para la sede del socio. */
  async listForMember(
    ctx: TenantContext,
    userId: number,
  ): Promise<NovedadMemberItem[]> {
    const member = await this.getMemberBranch(ctx, userId);
    if (!member) return [];

    const rows = await this.db
      .select()
      .from(novedades)
      .where(
        and(
          tenantWhere(novedades, ctx),
          visibleToBranch(member.branchId, new Date()),
        ),
      )
      .orderBy(desc(novedades.publishAt), desc(novedades.id))
      .limit(NOVEDADES_MEMBER_LIMIT);
    if (rows.length === 0) return [];

    const seenRows = await this.db
      .select({ novedadId: novedadViews.novedadId })
      .from(novedadViews)
      .where(
        and(
          tenantWhere(novedadViews, ctx),
          eq(novedadViews.userId, userId),
          inArray(
            novedadViews.novedadId,
            rows.map((row) => row.id),
          ),
        ),
      );
    const seenIds = new Set(seenRows.map((row) => row.novedadId));

    return rows.map((row) =>
      this.toMemberItem(row, member.branchName, seenIds),
    );
  }

  /**
   * D-5/D-10: upsert idempotente en `novedad_views`. `seen` crea la fila si no
   * existe; `clicked` además completa `clicked_at` (una sola vez: se conserva
   * el primer clic) y crea la fila si el socio no había reportado la vista.
   * 404 si la novedad no existe, es de otro tenant o el socio no debería verla
   * (otra sede, pausada, futura).
   */
  async recordEvent(
    ctx: TenantContext,
    userId: number,
    novedadId: number,
    type: NovedadEventType,
  ): Promise<void> {
    const member = await this.getMemberBranch(ctx, userId);
    if (!member) {
      throw new NotFoundError("Novedad no encontrada");
    }

    const now = new Date();
    const [visible] = await this.db
      .select({ id: novedades.id })
      .from(novedades)
      .where(
        and(
          tenantWhere(novedades, ctx),
          visibleToBranch(member.branchId, now),
          eq(novedades.id, novedadId),
        ),
      )
      .limit(1);
    if (!visible) {
      throw new NotFoundError("Novedad no encontrada");
    }

    // Duplicado (novedad, socio) = la fila ya existe: no-op.
    await this.db
      .insert(novedadViews)
      .values(
        tenantValues(ctx, {
          novedadId,
          userId,
          firstSeenAt: now,
          clickedAt: type === "clicked" ? now : null,
        }),
      )
      .onDuplicateKeyUpdate({ set: { novedadId: sql`novedad_id` } });

    if (type === "clicked") {
      // Solo si todavía no tenía clic: conserva el primero y es idempotente.
      await this.db
        .update(novedadViews)
        .set({ clickedAt: now })
        .where(
          and(
            tenantWhere(novedadViews, ctx),
            eq(novedadViews.novedadId, novedadId),
            eq(novedadViews.userId, userId),
            isNull(novedadViews.clickedAt),
          ),
        );
    }

    this.log.info(
      { novedadId, userId, tenantId: ctx.tenantId, eventType: type },
      "Evento de novedad registrado",
    );
  }

  // ── Privados ─────────────────────────────────────────────────────────────

  /** Lookup por PK **con `tenantWhere`**: un id ajeno da 404, nunca 403. */
  private async findOwned(ctx: TenantContext, id: number): Promise<NovedadRow> {
    const [row] = await this.db
      .select()
      .from(novedades)
      .where(and(tenantWhere(novedades, ctx), eq(novedades.id, id)))
      .limit(1);
    if (!row) {
      throw new NotFoundError("Novedad no encontrada");
    }
    return row;
  }

  /** Relee la fila con sus métricas (para las respuestas de create/update). */
  private async getAdminItem(
    ctx: TenantContext,
    id: number,
  ): Promise<NovedadAdminItem> {
    const row = await this.findOwned(ctx, id);
    const [counts] = await this.db
      .select({ views: count(), clicks: count(novedadViews.clickedAt) })
      .from(novedadViews)
      .where(
        and(tenantWhere(novedadViews, ctx), eq(novedadViews.novedadId, id)),
      );
    return this.toAdminItem(row, counts?.views ?? 0, counts?.clicks ?? 0);
  }

  /** Sede (id y nombre) del socio, o `null` si no existe en el tenant. */
  private async getMemberBranch(
    ctx: TenantContext,
    userId: number,
  ): Promise<{ branchId: number; branchName: string } | null> {
    const [row] = await this.db
      .select({ branchId: users.branchId, branchName: branches.name })
      .from(users)
      .innerJoin(branches, eq(users.branchId, branches.id))
      .where(and(tenantWhere(users, ctx), eq(users.id, userId)))
      .limit(1);
    return row ?? null;
  }

  private normalizeText(raw: string): string {
    const text = raw.trim();
    if (text.length === 0) {
      throw new BadRequestError("El texto no puede estar vacío");
    }
    if (text.length > NOVEDAD_TEXT_MAX_LENGTH) {
      throw new BadRequestError(
        `El texto no puede superar los ${NOVEDAD_TEXT_MAX_LENGTH} caracteres`,
      );
    }
    return text;
  }

  /** `[]` y `null` significan lo mismo (todas las sedes): se persiste `null`. */
  private normalizeScope(ids: number[] | null | undefined): number[] | null {
    if (!ids || ids.length === 0) return null;
    return [...new Set(ids)];
  }

  /**
   * Coherencia del destino (D-2). Sin tipo: ni sección ni texto de WhatsApp.
   * Con tipo: lo valida `validateDestination` (la MISMA lista curada de
   * secciones que usan los avisos).
   */
  private resolveDestination(input: DestinationColumns): DestinationColumns {
    if (input.destinationType === null) {
      if (input.destinationSection !== null || input.whatsappText !== null) {
        throw new BadRequestError(
          "Una novedad sin destino no lleva sección ni texto de WhatsApp",
        );
      }
      return {
        destinationType: null,
        destinationSection: null,
        whatsappText: null,
      };
    }

    const result = validateDestination({
      type: input.destinationType,
      section: input.destinationSection,
      whatsappText: input.whatsappText,
    });
    if (!result.ok) {
      throw new BadRequestError(result.reason);
    }
    return {
      destinationType: result.value.type,
      destinationSection: result.value.section,
      whatsappText: result.value.whatsappText,
    };
  }

  private toAdminItem(
    row: NovedadRow,
    views: number,
    clicks: number,
  ): NovedadAdminItem {
    return {
      id: row.id,
      text: row.text,
      scopeBranchIds: row.scopeBranchIds ?? null,
      destinationType: row.destinationType ?? null,
      destinationSection: row.destinationSection ?? null,
      whatsappText: row.whatsappText ?? null,
      publishAt: row.publishAt.toISOString(),
      status: row.status,
      createdBy: row.createdBy ?? null,
      createdAt: row.createdAt.toISOString(),
      views,
      clicks,
    };
  }

  private toMemberItem(
    row: NovedadRow,
    memberBranchName: string,
    seenIds: ReadonlySet<number>,
  ): NovedadMemberItem {
    const isGlobal = !row.scopeBranchIds || row.scopeBranchIds.length === 0;

    let destination: NovedadMemberItem["destination"] = null;
    if (row.destinationType) {
      const base: Destination = {
        type: row.destinationType,
        section: row.destinationSection as AppSectionKey | null,
        whatsappText: row.whatsappText,
      };
      destination = {
        type: base.type,
        section: base.section,
        route: resolveDestinationRoute(base),
        whatsappText:
          base.type === "whatsapp_sales"
            ? (base.whatsappText ?? DEFAULT_WHATSAPP_TEXT)
            : null,
      };
    }

    return {
      key: `novedad:${row.id}`,
      id: row.id,
      text: row.text,
      branchLabel: isGlobal ? null : memberBranchName,
      publishedAt: row.publishAt.toISOString(),
      destination,
      seen: seenIds.has(row.id),
    };
  }
}
