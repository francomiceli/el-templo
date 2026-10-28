/**
 * Meta — gasto diario por campaña (fase 195, plan 08, D-20).
 *
 * Trae de la Marketing API (Insights, nivel campaña, un renglón por día) los
 * últimos 7 días de cada cuenta publicitaria y los guarda en `ad_spend_daily`
 * con upsert por `(tenant_id, platform, campaign_id, spend_date)`: se re-trae
 * toda la semana porque Meta ajusta el gasto a posteriori. La moneda se guarda
 * TAL CUAL la informa la cuenta (`account_currency`): NUNCA se convierte
 * (Pitfall 13). Una cuenta que falla no frena a las demás.
 */

import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../../db/schema";
// Path directo, NUNCA por el barrel `shared/index.ts` (fase 169).
import { tenantValues, type TenantContext } from "../../shared/tenant";
import { MetaApiError, graphGetAll, redactSecrets } from "./client";
import type { MetaSpendConfig } from "./config";

type Db = MySql2Database<typeof schema>;

/** Días hacia atrás que se re-traen en cada corrida. */
export const SPEND_LOOKBACK_DAYS = 7;
const UPSERT_CHUNK = 200;

export interface SpendSyncSummary {
  accounts: number;
  failedAccounts: number;
  rows: number;
  skippedRows: number;
}

/** `YYYY-MM-DD` de una fecha en UTC. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Importe de Insights ("12.3", "0") a decimal con 2 decimales, o null si no es un número. */
function toDecimal(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const text = String(raw).trim();
  if (!/^[0-9]+(\.[0-9]+)?$/.test(text)) return null;
  return Number(text).toFixed(2);
}

function str(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

export class MetaSpendService {
  constructor(
    private readonly db: Db,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * `today` es el día de referencia (el job pasa la fecha de Argentina). El
   * rango es `[today - 7 días, today]`.
   */
  async syncSpend(
    ctx: TenantContext,
    config: MetaSpendConfig,
    today: string | Date,
  ): Promise<SpendSyncSummary> {
    const until = typeof today === "string" ? today : isoDate(today);
    const untilMs = Date.parse(`${until}T00:00:00Z`);
    const since = isoDate(new Date(untilMs - SPEND_LOOKBACK_DAYS * 86_400_000));

    const summary: SpendSyncSummary = {
      accounts: config.adAccountIds.length,
      failedAccounts: 0,
      rows: 0,
      skippedRows: 0,
    };

    for (const accountId of config.adAccountIds) {
      try {
        const insights = await graphGetAll(
          config,
          `/act_${accountId}/insights`,
          {
            level: "campaign",
            time_increment: "1",
            time_range: JSON.stringify({ since, until }),
            fields:
              "campaign_id,campaign_name,spend,account_currency,date_start",
            limit: "500",
          },
        );

        const values = [];
        for (const row of insights) {
          const campaignId = str(row.campaign_id);
          const campaignName = str(row.campaign_name);
          const spendDate = str(row.date_start);
          const currency = str(row.account_currency)?.toUpperCase() ?? null;
          const spend = toDecimal(row.spend);
          if (
            campaignId === null ||
            campaignName === null ||
            spendDate === null ||
            !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(spendDate) ||
            currency === null ||
            !/^[A-Z]{3}$/.test(currency) ||
            spend === null
          ) {
            summary.skippedRows += 1;
            continue;
          }
          values.push({
            platform: "meta",
            accountId,
            campaignId: campaignId.slice(0, 40),
            campaignName: campaignName.slice(0, 255),
            spendDate,
            spend,
            currency,
          });
        }

        for (let i = 0; i < values.length; i += UPSERT_CHUNK) {
          await this.db
            .insert(schema.adSpendDaily)
            .values(
              values
                .slice(i, i + UPSERT_CHUNK)
                .map((v) => tenantValues(ctx, v)),
            )
            .onDuplicateKeyUpdate({
              set: {
                campaignName: sql`VALUES(campaign_name)`,
                spend: sql`VALUES(spend)`,
                currency: sql`VALUES(currency)`,
              },
            });
        }
        summary.rows += values.length;
      } catch (err: unknown) {
        summary.failedAccounts += 1;
        const message =
          err instanceof MetaApiError
            ? err.message
            : redactSecrets(
                err instanceof Error ? err.message : "Error desconocido",
                config.token,
              );
        // El mensaje ya viene sin el token; la cuenta y el gimnasio van como campos.
        this.log.error(
          { tenantId: ctx.tenantId, accountId, err: message },
          "No se pudo traer el gasto de una cuenta de Meta",
        );
      }
    }
    return summary;
  }
}
