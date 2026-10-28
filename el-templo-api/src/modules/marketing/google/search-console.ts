/**
 * Google Search Console (fase 195, plan 09, D-21.2).
 *
 * Trae de la API de Search Console las consultas, clics, impresiones, CTR y
 * posición por página del período `[hoy - 9 días, hoy - 3 días]` (los datos
 * llegan con 2-3 días de demora) y los guarda en `search_console_stats`.
 *
 * Idempotencia: no hay unique (página + consulta no caben en un índice), así que
 * dentro de UNA transacción se borran las filas del tenant con ese
 * `period_start`/`period_end` y se reinsertan. Todas las páginas de resultados
 * se bajan ANTES de abrir la transacción: un fallo a mitad de camino no borra
 * lo que ya había.
 *
 * Auth: service account con scope de solo lectura (`webmasters.readonly`),
 * JWT RS256 propio (`auth.ts`). Un 401/403/404 (la service account no es
 * usuaria de la propiedad, o la propiedad no existe) se loguea y no rompe.
 */
import { and, eq } from "drizzle-orm";
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
  GoogleApiError,
  SEARCH_CONSOLE_SCOPE,
  serviceAccountAccessToken,
} from "./auth";
import type { SearchConsoleConfig } from "./config";

type Db = MySql2Database<typeof schema>;

const SEARCH_ANALYTICS_ORIGIN =
  "https://www.googleapis.com/webmasters/v3/sites";
const ROW_LIMIT = 25_000;
/** Tope de páginas por corrida: un bucle de `startRow` no cuelga el job. */
const MAX_PAGES = 40;
const REQUEST_TIMEOUT_MS = 30_000;
const INSERT_CHUNK = 500;
/** Días de demora de los datos de GSC y largo del período semanal. */
export const PERIOD_START_OFFSET_DAYS = 9;
export const PERIOD_END_OFFSET_DAYS = 3;
const NO_ACCESS_STATUSES = new Set([401, 403, 404]);

export interface SearchConsoleSyncSummary {
  periodStart: string;
  periodEnd: string;
  /** Filas guardadas. */
  rows: number;
  /** Filas descartadas por no tener números válidos. */
  skippedRows: number;
  /** false si no se pudo leer (sin acceso, token, error de Google). */
  fetched: boolean;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Período semanal en UTC: `[today - 9, today - 3]`. */
export function searchConsolePeriod(today: Date): {
  startDate: string;
  endDate: string;
} {
  const day = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return {
    startDate: isoDate(new Date(day - PERIOD_START_OFFSET_DAYS * 86_400_000)),
    endDate: isoDate(new Date(day - PERIOD_END_OFFSET_DAYS * 86_400_000)),
  };
}

interface GscRow {
  keys?: unknown;
  clicks?: unknown;
  impressions?: unknown;
  ctr?: unknown;
  position?: unknown;
}

type StatsValues = {
  periodStart: string;
  periodEnd: string;
  page: string;
  query: string | null;
  clicks: number;
  impressions: number;
  ctr: string;
  position: string;
};

function finiteNonNegative(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

function toValues(
  row: GscRow,
  periodStart: string,
  periodEnd: string,
): StatsValues | null {
  const keys = Array.isArray(row.keys) ? row.keys : [];
  const page = typeof keys[0] === "string" ? keys[0] : null;
  const query = typeof keys[1] === "string" ? keys[1] : null;
  const clicks = finiteNonNegative(row.clicks);
  const impressions = finiteNonNegative(row.impressions);
  const ctr = finiteNonNegative(row.ctr);
  const position = finiteNonNegative(row.position);
  if (
    page === null ||
    page.length === 0 ||
    clicks === null ||
    impressions === null ||
    ctr === null ||
    position === null
  ) {
    return null;
  }
  return {
    periodStart,
    periodEnd,
    page: page.slice(0, 500),
    query: query !== null && query.length > 0 ? query.slice(0, 500) : null,
    clicks: Math.round(clicks),
    impressions: Math.round(impressions),
    // Escalas de las columnas: DECIMAL(6,4) y DECIMAL(6,2).
    ctr: Math.min(ctr, 99.9999).toFixed(4),
    position: Math.min(position, 9999.99).toFixed(2),
  };
}

export class SearchConsoleService {
  constructor(
    private readonly db: Db,
    private readonly log: FastifyBaseLogger,
  ) {}

  async syncPeriod(
    ctx: TenantContext,
    config: SearchConsoleConfig,
    today: Date = new Date(),
  ): Promise<SearchConsoleSyncSummary> {
    const { startDate, endDate } = searchConsolePeriod(today);
    const summary: SearchConsoleSyncSummary = {
      periodStart: startDate,
      periodEnd: endDate,
      rows: 0,
      skippedRows: 0,
      fetched: false,
    };

    let token: string;
    try {
      token = await serviceAccountAccessToken(
        config.serviceAccount,
        SEARCH_CONSOLE_SCOPE,
      );
    } catch (err: unknown) {
      this.log.error(
        {
          tenantId: ctx.tenantId,
          status: err instanceof GoogleApiError ? err.status : undefined,
          err: err instanceof Error ? err.message : "Error desconocido",
        },
        "Search Console: no se pudo obtener el token de la service account",
      );
      return summary;
    }

    const rawRows: GscRow[] = [];
    const url = `${SEARCH_ANALYTICS_ORIGIN}/${encodeURIComponent(config.siteUrl)}/searchAnalytics/query`;
    for (let page = 0; page < MAX_PAGES; page++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            startDate,
            endDate,
            dimensions: ["page", "query"],
            rowLimit: ROW_LIMIT,
            startRow: page * ROW_LIMIT,
            dataState: "final",
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err: unknown) {
        this.log.warn(
          {
            tenantId: ctx.tenantId,
            err: err instanceof Error ? err.name : "Error",
          },
          "Search Console: error de red, se reintenta la semana próxima",
        );
        return summary;
      }

      if (NO_ACCESS_STATUSES.has(response.status)) {
        this.log.warn(
          { tenantId: ctx.tenantId, status: response.status },
          "Search Console sin acceso a la propiedad",
        );
        return summary;
      }
      if (!response.ok) {
        this.log.warn(
          { tenantId: ctx.tenantId, status: response.status },
          "Search Console respondió con error, se reintenta la semana próxima",
        );
        return summary;
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        this.log.warn(
          { tenantId: ctx.tenantId },
          "Search Console devolvió una respuesta que no es JSON",
        );
        return summary;
      }
      const rows =
        body && typeof body === "object" && "rows" in body
          ? (body as { rows?: unknown }).rows
          : undefined;
      const pageRows = Array.isArray(rows) ? (rows as GscRow[]) : [];
      rawRows.push(...pageRows);
      if (pageRows.length < ROW_LIMIT) break;
    }
    summary.fetched = true;

    const values: StatsValues[] = [];
    for (const row of rawRows) {
      const v = toValues(row, startDate, endDate);
      if (v === null) summary.skippedRows += 1;
      else values.push(v);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.searchConsoleStats)
        .where(
          and(
            tenantWhere(schema.searchConsoleStats, ctx),
            eq(schema.searchConsoleStats.periodStart, startDate),
            eq(schema.searchConsoleStats.periodEnd, endDate),
          ),
        );
      for (let i = 0; i < values.length; i += INSERT_CHUNK) {
        await tx
          .insert(schema.searchConsoleStats)
          .values(
            values.slice(i, i + INSERT_CHUNK).map((v) => tenantValues(ctx, v)),
          );
      }
    });
    summary.rows = values.length;
    return summary;
  }
}
