/**
 * Improvement Proposals Service
 *
 * Canal de propuestas de mejora por sucursal (brief Nacho 2026-07-15).
 * Reglas server-side, nunca confiadas al cliente:
 *  - La sucursal se resuelve de users.branch_id (el socio no la elige) y se
 *    denormaliza en la fila al momento del envío.
 *  - Anti-spam: máximo MAX_PROPOSALS_PER_WINDOW envíos por ventana móvil de
 *    24h por socio (ventana móvil y no "día calendario" a propósito: evita
 *    depender de la timezone de la sede — hay sedes AR y ES).
 *  - El popup se relanza por campaña subiendo PROMPT_CAMPAIGN acá (deploy de
 *    API, sin release del app).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, gte, sql, desc, like, inArray, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import type {
  ProposalPromptStatus,
  SubmitProposalInput,
  AdminProposalsFilters,
  AdminProposalsResult,
  AdminProposalRow,
  ProposalsScope,
} from "./types";

/** Máximo de propuestas por socio por ventana móvil de 24h. */
const MAX_PROPOSALS_PER_WINDOW = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Silencio del popup después de un envío: recurrencia mensual. Un socio que
 * mandó una propuesta no vuelve a ver el popup hasta pasados 30 días del
 * último envío (cuenta cualquier envío: popup o página). El re-prompt tras
 * "Ahora no" (14 días) es cadencia del cliente, no de acá.
 */
const PROMPT_QUIET_AFTER_SUBMIT_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Versión de campaña del popup: versiona la key de storage local del app.
 * Subirla fuerza un re-show inmediato para quienes están dentro de la
 * ventana de 14 días del "Ahora no" (deploy de API, sin release del app).
 */
const PROMPT_CAMPAIGN_VERSION = 1;

/** Escapa los metacaracteres de LIKE para que la búsqueda sea literal. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}

export class ImprovementProposalsService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  // ─── Member ────────────────────────────────────────────────────────────────

  /**
   * Estado del popup para el socio: shouldPrompt mientras no haya enviado
   * ninguna propuesta en los últimos 30 días (recurrencia mensual). La
   * cadencia de re-prompt tras "Ahora no" (14 días entre apariciones) la
   * maneja el cliente con storage local.
   */
  async getPromptStatus(memberId: number): Promise<ProposalPromptStatus> {
    const quietStart = new Date(Date.now() - PROMPT_QUIET_AFTER_SUBMIT_MS);
    const [row] = await this.db
      .select({ id: schema.improvementProposals.id })
      .from(schema.improvementProposals)
      .where(
        and(
          eq(schema.improvementProposals.memberId, memberId),
          gte(schema.improvementProposals.createdAt, quietStart),
        ),
      )
      .limit(1);

    return {
      shouldPrompt: !row,
      campaign: PROMPT_CAMPAIGN_VERSION,
    };
  }

  /**
   * Registra una propuesta. La sucursal sale de users.branch_id; el límite
   * anti-spam se revalida acá (no se confía en que el cliente lo respete).
   */
  async submitProposal(
    memberId: number,
    input: SubmitProposalInput,
  ): Promise<void> {
    const proposal = input.proposal?.trim() ?? "";
    if (proposal.length === 0) {
      throw new BadRequestError("Escribí tu propuesta antes de enviar");
    }
    if (proposal.length > 1000) {
      throw new BadRequestError("La propuesta supera los 1000 caracteres");
    }

    const [user] = await this.db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(eq(schema.users.id, memberId))
      .limit(1);
    if (!user) {
      throw new BadRequestError("Usuario no encontrado");
    }

    const windowStart = new Date(Date.now() - WINDOW_MS);
    const [countRow] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.improvementProposals)
      .where(
        and(
          eq(schema.improvementProposals.memberId, memberId),
          gte(schema.improvementProposals.createdAt, windowStart),
        ),
      );
    if (Number(countRow?.count ?? 0) >= MAX_PROPOSALS_PER_WINDOW) {
      throw new BadRequestError(
        "Ya enviaste varias propuestas hoy. ¡Gracias! Podés mandar más mañana.",
      );
    }

    await this.db.insert(schema.improvementProposals).values({
      memberId,
      branchId: user.branchId,
      proposal,
    });
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────

  /**
   * Listado admin paginado. Scope espejo de getOwnerRatings: owner ve todo;
   * admin/gestion quedan restringidos a las sucursales de su país. Filtros:
   * rango de fechas (sobre created_at, en fecha calendario), sucursal y
   * palabra clave (LIKE literal sobre el texto).
   */
  async getAdminProposals(
    scope: ProposalsScope,
    filters: AdminProposalsFilters = {},
  ): Promise<AdminProposalsResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;
    const emptyResult: AdminProposalsResult = {
      rows: [],
      total: 0,
      page,
      limit,
    };

    const conds = await this.buildConditions(scope, filters);
    if (conds === null) {
      return emptyResult;
    }
    const whereClause = conds.length > 0 ? and(...conds) : undefined;

    const [countRow] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.improvementProposals)
      .where(whereClause);
    const total = Number(countRow?.count ?? 0);

    const rows = await this.fetchRows(whereClause, limit, offset);

    return { rows, total, page, limit };
  }

  /**
   * Filas para el export xlsx: mismos filtros que el listado, sin paginar.
   */
  async getExportRows(
    scope: ProposalsScope,
    filters: AdminProposalsFilters = {},
  ): Promise<AdminProposalRow[]> {
    const conds = await this.buildConditions(scope, filters);
    if (conds === null) {
      return [];
    }
    const whereClause = conds.length > 0 ? and(...conds) : undefined;
    return this.fetchRows(whereClause);
  }

  /**
   * Condiciones comunes de listado y export. Devuelve null cuando el scope no
   * habilita ninguna sucursal (staff sin país o país sin sedes) — resultado
   * vacío sin consultar.
   */
  private async buildConditions(
    scope: ProposalsScope,
    filters: AdminProposalsFilters,
  ): Promise<SQL[] | null> {
    const conds: SQL[] = [];

    if (!scope.isOwner) {
      if (scope.country === null) {
        return null;
      }
      const branchRows = await this.db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(eq(schema.branches.country, scope.country));
      const branchIds = branchRows.map((b) => b.id);
      if (branchIds.length === 0) {
        return null;
      }
      conds.push(inArray(schema.improvementProposals.branchId, branchIds));
    }

    if (filters.branchId !== undefined) {
      conds.push(eq(schema.improvementProposals.branchId, filters.branchId));
    }
    if (filters.dateFrom !== undefined) {
      conds.push(
        sql`DATE(${schema.improvementProposals.createdAt}) >= ${filters.dateFrom}`,
      );
    }
    if (filters.dateTo !== undefined) {
      conds.push(
        sql`DATE(${schema.improvementProposals.createdAt}) <= ${filters.dateTo}`,
      );
    }
    const keyword = filters.q?.trim();
    if (keyword) {
      conds.push(
        like(schema.improvementProposals.proposal, `%${escapeLike(keyword)}%`),
      );
    }

    return conds;
  }

  private async fetchRows(
    whereClause: SQL | undefined,
    limit?: number,
    offset?: number,
  ): Promise<AdminProposalRow[]> {
    let query = this.db
      .select({
        id: schema.improvementProposals.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        branchName: schema.branches.name,
        proposal: schema.improvementProposals.proposal,
        createdAt: schema.improvementProposals.createdAt,
      })
      .from(schema.improvementProposals)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.improvementProposals.memberId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.improvementProposals.branchId),
      )
      .where(whereClause)
      // Tiebreaker id DESC: filas con el mismo createdAt mantienen orden
      // estable entre páginas (mismo criterio que getOwnerRatings).
      .orderBy(
        desc(schema.improvementProposals.createdAt),
        desc(schema.improvementProposals.id),
      )
      .$dynamic();

    if (limit !== undefined) {
      query = query.limit(limit).offset(offset ?? 0);
    }

    const rows = await query;
    return rows.map((r) => ({
      id: r.id,
      memberName: [r.firstName, r.lastName].filter(Boolean).join(" "),
      branchName: r.branchName,
      proposal: r.proposal,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    }));
  }
}
