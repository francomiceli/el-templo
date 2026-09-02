/**
 * TvAvisosService — CRUD de avisos de TV (Fase 193, D-24) + lectura del
 * aviso activo por sede para el control del profe (D-29).
 *
 * Entidad APARTE de `avisos` (avisos de la app): sin vigencia por fechas, sin
 * frecuencia por socio, sin destino — solo título+cuerpo, sedes, modo y
 * activo/inactivo manual (docblock de `tv_avisos`, 193-02). Mismo patrón de
 * constructor DI que `CommunicationsService` (`db`, `log` inyectados por
 * Fastify). Toda query sobre `tv_avisos`/`tv_class_state` pasa por
 * `tenantWhere`/`tenantValues` — las dos tablas son gym-owned (193-02).
 */
import { and, desc, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { tvAvisos, branches, tvClassState } from "../../db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import { BadRequestError, NotFoundError } from "../shared/errors";

type DbInstance = MySql2Database<typeof schema>;

export type TvAvisoMode = "manual" | "flex_inicio" | "flex_final";
type TvAvisoRow = typeof tvAvisos.$inferSelect;

const TITLE_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 400;
const VALID_MODES: readonly TvAvisoMode[] = [
  "manual",
  "flex_inicio",
  "flex_final",
];

/** Forma de un aviso de TV en las respuestas del CRUD admin y del control. */
export interface TvAvisoItem {
  id: number;
  title: string;
  body: string;
  mode: TvAvisoMode;
  isActive: boolean;
  scopeBranchIds: number[] | null;
}

export interface CreateTvAvisoInput {
  title: string;
  body: string;
  mode: TvAvisoMode;
  isActive?: boolean;
  scopeBranchIds?: number[] | null;
}

export interface UpdateTvAvisoInput {
  title?: string;
  body?: string;
  mode?: TvAvisoMode;
  isActive?: boolean;
  scopeBranchIds?: number[] | null;
}

export class TvAvisosService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** D-24: todos los avisos de TV del tenant, activos primero, más recientes primero. */
  async list(ctx: TenantContext): Promise<TvAvisoItem[]> {
    const rows = await this.db
      .select()
      .from(tvAvisos)
      .where(tenantWhere(tvAvisos, ctx))
      .orderBy(desc(tvAvisos.isActive), desc(tvAvisos.id));
    return rows.map((row) => this.toItem(row));
  }

  /**
   * D-24: crea un aviso de TV. Valida título/cuerpo (T-193-27 no aplica acá,
   * es límite de placa: la placa es Cinzel a tamaño de TV) y que cada sede de
   * `scopeBranchIds` sea del tenant (T-193-27: una sede ajena es 400, nunca
   * se persiste).
   */
  async create(
    ctx: TenantContext,
    input: CreateTvAvisoInput,
  ): Promise<TvAvisoItem> {
    this.assertTitleAndBody(input.title, input.body);
    this.assertMode(input.mode);
    await this.assertBranchesBelongToTenant(ctx, input.scopeBranchIds ?? null);

    const [result] = await this.db.insert(tvAvisos).values(
      tenantValues(ctx, {
        title: input.title,
        body: input.body,
        mode: input.mode,
        isActive: input.isActive ?? false,
        scopeBranchIds: input.scopeBranchIds ?? null,
      }),
    );

    const insertId = Number(result.insertId);
    this.log.info(
      { tvAvisoId: insertId, tenantId: ctx.tenantId, mode: input.mode },
      "Aviso de TV creado",
    );

    const [row] = await this.db
      .select()
      .from(tvAvisos)
      .where(and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.id, insertId)))
      .limit(1);
    return this.toItem(row);
  }

  /**
   * Lookup por PK **con `tenantWhere`**: un id ajeno da 404 `NotFoundError`,
   * nunca 403 (criterio T-175-03, mismo que `CommunicationsService`).
   */
  async update(
    ctx: TenantContext,
    id: number,
    input: UpdateTvAvisoInput,
  ): Promise<TvAvisoItem> {
    const [existing] = await this.db
      .select()
      .from(tvAvisos)
      .where(and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.id, id)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Aviso de TV no encontrado");
    }

    if (input.title !== undefined || input.body !== undefined) {
      this.assertTitleAndBody(
        input.title ?? existing.title,
        input.body ?? existing.body,
      );
    }
    if (input.mode !== undefined) {
      this.assertMode(input.mode);
    }
    if (input.scopeBranchIds !== undefined) {
      await this.assertBranchesBelongToTenant(ctx, input.scopeBranchIds);
    }

    const updates: Record<string, unknown> = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.body !== undefined) updates.body = input.body;
    if (input.mode !== undefined) updates.mode = input.mode;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.scopeBranchIds !== undefined)
      updates.scopeBranchIds = input.scopeBranchIds;

    if (Object.keys(updates).length === 0) {
      throw new BadRequestError("No hay campos para actualizar");
    }

    await this.db
      .update(tvAvisos)
      .set(updates)
      .where(and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.id, id)));

    const [row] = await this.db
      .select()
      .from(tvAvisos)
      .where(and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.id, id)))
      .limit(1);

    this.log.info(
      { tvAvisoId: id, tenantId: ctx.tenantId },
      "Aviso de TV actualizado",
    );
    return this.toItem(row);
  }

  /**
   * T-193-28: antes de borrar, limpia CUALQUIER `tv_class_state` que esté
   * apuntando a este aviso (`screen: 'aviso'`, `tv_aviso_id: <id>`) — si no,
   * la FK `tv_class_state.tv_aviso_id` bloquea el DELETE y un TV podría
   * quedar mostrando (o intentando mostrar) un aviso borrado. Lookup por PK
   * con `tenantWhere`: id ajeno da 404, nunca 403.
   */
  async remove(ctx: TenantContext, id: number): Promise<void> {
    const [existing] = await this.db
      .select({ id: tvAvisos.id })
      .from(tvAvisos)
      .where(and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.id, id)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Aviso de TV no encontrado");
    }

    await this.db
      .update(tvClassState)
      .set({ screen: "class", tvAvisoId: null })
      .where(
        and(tenantWhere(tvClassState, ctx), eq(tvClassState.tvAvisoId, id)),
      );

    await this.db
      .delete(tvAvisos)
      .where(and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.id, id)));

    this.log.info(
      { tvAvisoId: id, tenantId: ctx.tenantId },
      "Aviso de TV borrado (referencia en tv_class_state limpiada antes)",
    );
  }

  /**
   * D-29: el aviso activo aplicable a `branchId` — `isActive: true` y
   * (`scopeBranchIds` null/vacío = todas las sedes, o contiene `branchId`),
   * filtrando por `mode` si se pasa. El más reciente (`id` desc) si hay más
   * de uno, o `null`. El filtro de alcance por sede se resuelve en memoria
   * (JSON column, mismo criterio que `avisos.scopeBranchIds` en
   * `CommunicationsService` — dataset chico por tenant, sin N+1).
   */
  async getActiveForBranch(
    ctx: TenantContext,
    branchId: number,
    mode?: TvAvisoMode,
  ): Promise<TvAvisoItem | null> {
    const rows = await this.db
      .select()
      .from(tvAvisos)
      .where(
        mode
          ? and(
              tenantWhere(tvAvisos, ctx),
              eq(tvAvisos.isActive, true),
              eq(tvAvisos.mode, mode),
            )
          : and(tenantWhere(tvAvisos, ctx), eq(tvAvisos.isActive, true)),
      )
      .orderBy(desc(tvAvisos.id));

    const match = rows.find((row) => this.appliesToBranch(row, branchId));
    return match ? this.toItem(match) : null;
  }

  // ── Privados ─────────────────────────────────────────────────────────────

  private appliesToBranch(row: TvAvisoRow, branchId: number): boolean {
    const scope = row.scopeBranchIds;
    if (!scope || scope.length === 0) return true;
    return scope.includes(branchId);
  }

  private toItem(row: TvAvisoRow): TvAvisoItem {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      mode: row.mode,
      isActive: row.isActive,
      scopeBranchIds: row.scopeBranchIds ?? null,
    };
  }

  private assertTitleAndBody(title: string, body: string): void {
    if (!title || title.trim().length === 0) {
      throw new BadRequestError("El título no puede estar vacío");
    }
    if (title.length > TITLE_MAX_LENGTH) {
      throw new BadRequestError(
        `El título no puede superar los ${TITLE_MAX_LENGTH} caracteres`,
      );
    }
    if (!body || body.trim().length === 0) {
      throw new BadRequestError("El cuerpo no puede estar vacío");
    }
    if (body.length > BODY_MAX_LENGTH) {
      throw new BadRequestError(
        `El cuerpo no puede superar los ${BODY_MAX_LENGTH} caracteres (la placa es Cinzel a tamaño de TV: más texto no entra)`,
      );
    }
  }

  private assertMode(mode: string): void {
    if (!VALID_MODES.includes(mode as TvAvisoMode)) {
      throw new BadRequestError(`mode inválido: '${mode}'`);
    }
  }

  /** T-193-27: cada id de `branchIds` tiene que ser una sede EXISTENTE DEL TENANT. */
  private async assertBranchesBelongToTenant(
    ctx: TenantContext,
    branchIds: number[] | null | undefined,
  ): Promise<void> {
    if (!branchIds || branchIds.length === 0) return;

    const rows = await this.db
      .select({ id: branches.id })
      .from(branches)
      .where(tenantWhere(branches, ctx));
    const validIds = new Set(rows.map((row) => row.id));

    const invalid = branchIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestError(
        `Las sedes [${invalid.join(", ")}] no pertenecen a este gimnasio`,
      );
    }
  }
}
