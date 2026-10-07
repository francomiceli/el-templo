// Módulo: marketing — reportes de atribución (fase 195, plan 10, D-18/D-20/D-21).
//
// `AttributionReportService` responde la pregunta "¿de dónde salen los alumnos
// que pagan y cuánto cuesta cada uno?":
//
//   - `getFunnel`: embudo registro → prueba → pago → facturación por canal,
//     campaña y sede, con el gasto de Meta (`ad_spend_daily`) y el costo por
//     alumno pago, el desglose del tráfico de IA y el gasto sin altas.
//   - `getSearchConsole`: consultas, clics e impresiones del ÚLTIMO período de
//     `search_console_stats` por página de sede.
//
// REGLAS DE NEGOCIO (las que el test fija):
//   * Cohorte = altas (`signup_attributions.created_at`) dentro del rango, ambos
//     bordes inclusive. Los pagos cuentan hasta hoy.
//   * Prueba = ≥ 1 `bookings` con `is_trial = 1` y `booking_status <> 'cancelado'`.
//     Pago = ≥ 1 suscripción con `price_paid > 0` y `price_type_applied <> 'zero'`
//     (criterio de `analytics/trial-funnel-service.ts`). Cuenta USUARIOS, no
//     suscripciones. Facturación = SUM(`price_paid`) de esas suscripciones.
//   * Monedas: facturación y gasto SIEMPRE por moneda, jamás sumadas (Pitfall 13).
//   * El gasto de Meta es de CAMPAÑA: una campaña trae alumnos a varias sedes,
//     así que se muestra en `campaigns` (alumnos pagos de todas sus sedes) y solo
//     baja a la fila de una sede cuando el NOMBRE de la campaña codifica esa sede
//     (contiene el `web_slug` de exactamente una sede publicada). Nunca se
//     reparte ni se duplica entre sedes.
//   * `totals.gasto` sale directo de `ad_spend_daily` del rango: no es la suma de
//     las filas del embudo, así que cuenta también las campañas sin altas.
//
// TENANCY: módulo strict. `tenantWhere` en cada tabla (también `branches`, que no
// es strict pero sí gym-owned). Las subconsultas EXISTS son SQL literal con
// `tenant_id` explícito y las columnas externas escritas como
// `signup_attributions.user_id` (gotcha (b) del skill de migraciones: Drizzle
// renderiza sin calificar las columnas de una subconsulta correlacionada y
// binden contra la tabla interna).
import {
  and,
  desc,
  eq,
  gte,
  isNotNull,
  like,
  lte,
  max,
  min,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";

type DbInstance = MySql2Database<typeof schema>;

/** Plataforma de `ad_spend_daily` que se empareja con el canal `meta_ads`. */
const META_PLATFORM = "meta";
/** Canal de `signup_attributions` al que corresponde el gasto de Meta. */
const META_CHANNEL = "meta_ads";
/**
 * Moneda de cada país: `ad_spend_daily` no guarda país (solo la moneda de la
 * cuenta publicitaria), así que un admin de un país ve el gasto en SU moneda.
 */
const COUNTRY_CURRENCY = { AR: "ARS", ES: "EUR" } as const;
/** Páginas de sede de la web (también las de `/es/sedes/`). */
const SEDE_PAGE_LIKE = "%/sedes/%";
const QUERIES_PER_PAGE = 5;

export interface Money {
  currency: string;
  amount: number;
}

export interface FunnelFilters {
  dateFrom: string;
  dateTo: string;
  branchId?: number;
  country?: "AR" | "ES";
}

export interface FunnelRow {
  channel: string;
  utmCampaign: string | null;
  branchId: number | null;
  branchName: string | null;
  registros: number;
  conPrueba: number;
  pagaron: number;
  facturacion: Money[];
  gasto: Money[] | null;
  costoPorAlumnoPago: Money[] | null;
}

export interface FunnelCampaign {
  utmCampaign: string;
  registros: number;
  conPrueba: number;
  pagaron: number;
  facturacion: Money[];
  gasto: Money[] | null;
  costoPorAlumnoPago: Money[] | null;
  sedeCodificada: { branchId: number; branchName: string } | null;
  porSede: Array<{
    branchId: number | null;
    branchName: string | null;
    registros: number;
    pagaron: number;
  }>;
}

export interface AttributionFunnel {
  range: { dateFrom: string; dateTo: string };
  rows: FunnelRow[];
  campaigns: FunnelCampaign[];
  totals: {
    registros: number;
    conPrueba: number;
    pagaron: number;
    facturacion: Money[];
    gasto: Money[];
  };
  ia: Array<{
    referrerHost: string | null;
    registros: number;
    pagaron: number;
  }>;
  gastoSinAtribuir: Array<{
    campaignName: string;
    currency: string;
    amount: number;
  }>;
}

export interface SearchConsoleMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleReport {
  period: { periodStart: string; periodEnd: string } | null;
  pages: Array<{ page: string } & SearchConsoleMetrics>;
  queries: Array<{ page: string; query: string } & SearchConsoleMetrics>;
}

interface PublishedSede {
  id: number;
  name: string;
  slug: string;
}

/** Normaliza para comparar nombres de campaña con slugs: minúsculas, sin acentos. */
function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Sede que codifica el nombre de una campaña: la campaña contiene el
 * `web_slug` (como palabra entera, separada por cualquier no alfanumérico) de
 * EXACTAMENTE una sede publicada. Cero o varias coincidencias → null (no se
 * adivina).
 */
export function codifiedSede(
  campaignKey: string,
  sedes: readonly PublishedSede[],
): PublishedSede | null {
  const padded = `-${normalizeText(campaignKey).replace(/[^a-z0-9]+/g, "-")}-`;
  const hits = sedes.filter((s) => padded.includes(`-${s.slug}-`));
  return hits.length === 1 ? hits[0] : null;
}

/** `YYYY-MM-DD` + 1 día (aritmética en UTC: no depende del huso del server). */
function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Acumulador de importes por moneda. */
class MoneyBag {
  private readonly byCurrency = new Map<string, number>();

  add(currency: string, amount: number): void {
    this.byCurrency.set(
      currency,
      (this.byCurrency.get(currency) ?? 0) + amount,
    );
  }

  toList(): Money[] {
    return [...this.byCurrency.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount: round2(amount) }));
  }
}

/** Gasto dividido por alumnos pagos, por moneda del gasto. null si no hay base. */
function costPerPaid(gasto: Money[] | null, pagaron: number): Money[] | null {
  if (gasto === null || gasto.length === 0 || pagaron <= 0) return null;
  return gasto.map((g) => ({
    currency: g.currency,
    amount: round2(g.amount / pagaron),
  }));
}

interface GroupKey {
  channel: string;
  utmCampaign: string | null;
  branchId: number | null;
}

const groupId = (k: GroupKey): string =>
  `${k.channel}\u0000${k.utmCampaign ?? ""}\u0000${k.branchId ?? ""}`;

export class AttributionReportService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** Condiciones de la cohorte compartidas por el embudo, la facturación y la IA. */
  private cohortConditions(ctx: TenantContext, f: FunnelFilters): SQL[] {
    return [
      tenantWhere(schema.signupAttributions, ctx),
      sql`${schema.signupAttributions.createdAt} >= ${f.dateFrom}`,
      sql`${schema.signupAttributions.createdAt} < ${nextDay(f.dateTo)}`,
      ...(f.branchId === undefined
        ? []
        : [eq(schema.signupAttributions.branchId, f.branchId)]),
      ...(f.country === undefined
        ? []
        : [eq(schema.branches.country, f.country)]),
    ];
  }

  async getFunnel(
    ctx: TenantContext,
    filters: FunnelFilters,
  ): Promise<AttributionFunnel> {
    // Expresiones con la columna escrita como literal (la tabla ya está en el
    // FROM de cada query): no cuentan como un acceso suelto a la tabla.
    const campaignKey = sql<
      string | null
    >`NULLIF(LOWER(TRIM(signup_attributions.utm_campaign)), '')`;
    const conds = this.cohortConditions(ctx, filters);

    // Prueba y pago por usuario: EXISTS con SQL literal (gotcha (b)).
    const hasTrial = sql`EXISTS (SELECT 1 FROM bookings WHERE bookings.member_id = signup_attributions.user_id AND bookings.tenant_id = ${ctx.tenantId} AND bookings.is_trial = 1 AND bookings.booking_status <> 'cancelado')`;
    const hasPaid = sql`EXISTS (SELECT 1 FROM subscriptions WHERE subscriptions.user_id = signup_attributions.user_id AND subscriptions.tenant_id = ${ctx.tenantId} AND subscriptions.price_paid > 0 AND subscriptions.price_type_applied <> 'zero')`;

    const funnelRows = await this.db
      .select({
        channel: schema.signupAttributions.channel,
        utmCampaign: campaignKey,
        branchId: schema.signupAttributions.branchId,
        branchName: schema.branches.name,
        registros: sql<string>`COUNT(*)`,
        conPrueba: sql<string>`COALESCE(SUM(${hasTrial}), 0)`,
        pagaron: sql<string>`COALESCE(SUM(${hasPaid}), 0)`,
      })
      .from(schema.signupAttributions)
      .leftJoin(
        schema.branches,
        and(
          eq(schema.branches.id, schema.signupAttributions.branchId),
          tenantWhere(schema.branches, ctx),
        ),
      )
      .where(and(...conds))
      .groupBy(
        schema.signupAttributions.channel,
        campaignKey,
        schema.signupAttributions.branchId,
        schema.branches.name,
      );

    // Facturación: query aparte, agrupada por moneda de la suscripción.
    const billingRows = await this.db
      .select({
        channel: schema.signupAttributions.channel,
        utmCampaign: campaignKey,
        branchId: schema.signupAttributions.branchId,
        currency: schema.subscriptions.currency,
        amount: sql<string>`SUM(${schema.subscriptions.pricePaid})`,
      })
      .from(schema.signupAttributions)
      .innerJoin(
        schema.subscriptions,
        and(
          eq(schema.subscriptions.userId, schema.signupAttributions.userId),
          tenantWhere(schema.subscriptions, ctx),
        ),
      )
      .leftJoin(
        schema.branches,
        and(
          eq(schema.branches.id, schema.signupAttributions.branchId),
          tenantWhere(schema.branches, ctx),
        ),
      )
      .where(
        and(
          ...conds,
          sql`${schema.subscriptions.pricePaid} > 0`,
          sql`${schema.subscriptions.priceTypeApplied} <> 'zero'`,
        ),
      )
      .groupBy(
        schema.signupAttributions.channel,
        campaignKey,
        schema.signupAttributions.branchId,
        schema.subscriptions.currency,
      );

    // IA: qué sitio mandó el alta. Sin referrer cae a `utm_source` (ChatGPT lo
    // agrega como `utm_source=chatgpt.com`).
    const iaHost = sql<
      string | null
    >`NULLIF(LOWER(TRIM(COALESCE(signup_attributions.referrer_host, signup_attributions.utm_source))), '')`;
    const iaRows = await this.db
      .select({
        referrerHost: iaHost,
        registros: sql<string>`COUNT(*)`,
        pagaron: sql<string>`COALESCE(SUM(${hasPaid}), 0)`,
      })
      .from(schema.signupAttributions)
      .leftJoin(
        schema.branches,
        and(
          eq(schema.branches.id, schema.signupAttributions.branchId),
          tenantWhere(schema.branches, ctx),
        ),
      )
      .where(and(...conds, eq(schema.signupAttributions.channel, "ia")))
      .groupBy(iaHost)
      .orderBy(desc(sql`COUNT(*)`), iaHost);

    const sedes = await this.publishedSedes(ctx);
    const spend = await this.spendByCampaign(ctx, filters, sedes);

    // ── Filas ────────────────────────────────────────────────────────────────
    const billingByGroup = new Map<string, MoneyBag>();
    for (const b of billingRows) {
      const id = groupId({
        channel: b.channel,
        utmCampaign: b.utmCampaign,
        branchId: b.branchId,
      });
      const bag = billingByGroup.get(id) ?? new MoneyBag();
      bag.add(b.currency, Number(b.amount));
      billingByGroup.set(id, bag);
    }

    const rows: FunnelRow[] = funnelRows.map((r) => {
      const key: GroupKey = {
        channel: r.channel,
        utmCampaign: r.utmCampaign,
        branchId: r.branchId,
      };
      const pagaron = Number(r.pagaron);
      // El gasto baja a la fila SOLO si es del canal Meta y el nombre de la
      // campaña codifica la sede de la fila.
      const sede = r.utmCampaign ? codifiedSede(r.utmCampaign, sedes) : null;
      const spendList =
        r.channel === META_CHANNEL &&
        r.utmCampaign !== null &&
        sede !== null &&
        sede.id === r.branchId
          ? (spend.byCampaign.get(r.utmCampaign) ?? null)
          : null;
      return {
        channel: r.channel,
        utmCampaign: r.utmCampaign,
        branchId: r.branchId,
        branchName: r.branchName,
        registros: Number(r.registros),
        conPrueba: Number(r.conPrueba),
        pagaron,
        facturacion: billingByGroup.get(groupId(key))?.toList() ?? [],
        gasto: spendList,
        costoPorAlumnoPago: costPerPaid(spendList, pagaron),
      };
    });
    rows.sort(
      (a, b) =>
        a.channel.localeCompare(b.channel) ||
        (a.utmCampaign ?? "").localeCompare(b.utmCampaign ?? "") ||
        (a.branchName ?? "").localeCompare(b.branchName ?? ""),
    );

    // ── Campañas (suma de TODAS sus sedes y canales) ─────────────────────────
    const campaigns = this.buildCampaigns(
      rows,
      billingRows,
      spend.byCampaign,
      sedes,
      filters.branchId,
    );

    // ── Totales ──────────────────────────────────────────────────────────────
    const totalBilling = new MoneyBag();
    for (const b of billingRows) totalBilling.add(b.currency, Number(b.amount));
    const cohortCampaigns = new Set(
      rows.flatMap((r) => (r.utmCampaign ? [r.utmCampaign] : [])),
    );

    this.log.debug(
      {
        tenantId: ctx.tenantId,
        rows: rows.length,
        campaigns: campaigns.length,
      },
      "attribution funnel computed",
    );

    return {
      range: { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
      rows,
      campaigns,
      totals: {
        registros: rows.reduce((n, r) => n + r.registros, 0),
        conPrueba: rows.reduce((n, r) => n + r.conPrueba, 0),
        pagaron: rows.reduce((n, r) => n + r.pagaron, 0),
        facturacion: totalBilling.toList(),
        gasto: spend.total.toList(),
      },
      ia: iaRows.map((r) => ({
        referrerHost: r.referrerHost,
        registros: Number(r.registros),
        pagaron: Number(r.pagaron),
      })),
      gastoSinAtribuir: spend.entries
        .filter((e) => !cohortCampaigns.has(e.key))
        .map((e) => ({
          campaignName: e.name,
          currency: e.currency,
          amount: e.amount,
        }))
        .sort(
          (a, b) =>
            a.campaignName.localeCompare(b.campaignName) ||
            a.currency.localeCompare(b.currency),
        ),
    };
  }

  /** Sedes publicadas del gimnasio con su slug (insumo de `codifiedSede`). */
  private async publishedSedes(ctx: TenantContext): Promise<PublishedSede[]> {
    const rows = await this.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
        slug: schema.branches.webSlug,
      })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.publishOnWeb, true),
          isNotNull(schema.branches.webSlug),
        ),
      );
    return rows.flatMap((r) =>
      r.slug === null ? [] : [{ id: r.id, name: r.name, slug: r.slug }],
    );
  }

  /**
   * Gasto de Meta del rango, directo de `ad_spend_daily`, agrupado por campaña
   * (nombre normalizado) y moneda. Con filtro de país solo entra la moneda del
   * país; con filtro de sede solo las campañas que codifican esa sede (el gasto
   * de una campaña multi-sede no es de ninguna sede en particular).
   */
  private async spendByCampaign(
    ctx: TenantContext,
    filters: FunnelFilters,
    sedes: readonly PublishedSede[],
  ): Promise<{
    entries: Array<{
      key: string;
      name: string;
      currency: string;
      amount: number;
    }>;
    byCampaign: Map<string, Money[]>;
    total: MoneyBag;
  }> {
    const key = sql<string>`LOWER(TRIM(ad_spend_daily.campaign_name))`;
    const countryCond =
      filters.country === undefined
        ? []
        : [sql`ad_spend_daily.currency = ${COUNTRY_CURRENCY[filters.country]}`];
    const raw = await this.db
      .select({
        key,
        name: sql<string>`MAX(TRIM(${schema.adSpendDaily.campaignName}))`,
        currency: schema.adSpendDaily.currency,
        amount: sql<string>`SUM(${schema.adSpendDaily.spend})`,
      })
      .from(schema.adSpendDaily)
      .where(
        and(
          tenantWhere(schema.adSpendDaily, ctx),
          eq(schema.adSpendDaily.platform, META_PLATFORM),
          gte(schema.adSpendDaily.spendDate, filters.dateFrom),
          lte(schema.adSpendDaily.spendDate, filters.dateTo),
          ...countryCond,
        ),
      )
      .groupBy(key, schema.adSpendDaily.currency);

    const entries = raw
      .filter(
        (r) =>
          filters.branchId === undefined ||
          codifiedSede(r.key, sedes)?.id === filters.branchId,
      )
      .map((r) => ({
        key: r.key,
        name: r.name,
        currency: r.currency,
        amount: round2(Number(r.amount)),
      }));

    const byCampaign = new Map<string, Money[]>();
    const total = new MoneyBag();
    for (const e of entries) {
      total.add(e.currency, e.amount);
      const list = byCampaign.get(e.key) ?? [];
      list.push({ currency: e.currency, amount: e.amount });
      list.sort((a, b) => a.currency.localeCompare(b.currency));
      byCampaign.set(e.key, list);
    }
    return { entries, byCampaign, total };
  }

  private buildCampaigns(
    rows: readonly FunnelRow[],
    billingRows: ReadonlyArray<{
      utmCampaign: string | null;
      currency: string;
      amount: string;
    }>,
    spendByCampaign: ReadonlyMap<string, Money[]>,
    sedes: readonly PublishedSede[],
    branchFilter: number | undefined,
  ): FunnelCampaign[] {
    interface Acc {
      registros: number;
      conPrueba: number;
      pagaron: number;
      billing: MoneyBag;
      sedesAcc: Map<
        string,
        {
          branchId: number | null;
          branchName: string | null;
          registros: number;
          pagaron: number;
        }
      >;
    }
    const byKey = new Map<string, Acc>();
    for (const r of rows) {
      if (r.utmCampaign === null) continue;
      const acc = byKey.get(r.utmCampaign) ?? {
        registros: 0,
        conPrueba: 0,
        pagaron: 0,
        billing: new MoneyBag(),
        sedesAcc: new Map(),
      };
      acc.registros += r.registros;
      acc.conPrueba += r.conPrueba;
      acc.pagaron += r.pagaron;
      const sedeKey = String(r.branchId ?? "");
      const s = acc.sedesAcc.get(sedeKey) ?? {
        branchId: r.branchId,
        branchName: r.branchName,
        registros: 0,
        pagaron: 0,
      };
      s.registros += r.registros;
      s.pagaron += r.pagaron;
      acc.sedesAcc.set(sedeKey, s);
      byKey.set(r.utmCampaign, acc);
    }
    for (const b of billingRows) {
      if (b.utmCampaign === null) continue;
      byKey.get(b.utmCampaign)?.billing.add(b.currency, Number(b.amount));
    }

    const out: FunnelCampaign[] = [];
    for (const [utmCampaign, acc] of byKey) {
      const sede = codifiedSede(utmCampaign, sedes);
      // Con filtro de sede, el gasto de campaña solo se muestra si la campaña
      // codifica ESA sede (si no, el total de la campaña no es de esta sede).
      const spendList =
        branchFilter !== undefined && sede?.id !== branchFilter
          ? null
          : (spendByCampaign.get(utmCampaign) ?? null);
      out.push({
        utmCampaign,
        registros: acc.registros,
        conPrueba: acc.conPrueba,
        pagaron: acc.pagaron,
        facturacion: acc.billing.toList(),
        gasto: spendList,
        costoPorAlumnoPago: costPerPaid(spendList, acc.pagaron),
        sedeCodificada: sede
          ? { branchId: sede.id, branchName: sede.name }
          : null,
        porSede: [...acc.sedesAcc.values()].sort(
          (a, b) =>
            b.registros - a.registros ||
            (a.branchName ?? "").localeCompare(b.branchName ?? ""),
        ),
      });
    }
    return out.sort(
      (a, b) =>
        b.registros - a.registros || a.utmCampaign.localeCompare(b.utmCampaign),
    );
  }

  /**
   * Último período de Search Console por página de sede: clics e impresiones
   * sumados, CTR = clics / impresiones y posición promedio ponderada por
   * impresiones, ordenadas por impresiones; más las 5 consultas principales de
   * cada página. Sin datos → `period: null` y listas vacías.
   */
  async getSearchConsole(
    ctx: TenantContext,
    opts: { limit?: number } = {},
  ): Promise<SearchConsoleReport> {
    const limit = opts.limit ?? 50;

    const [latest] = await this.db
      .select({ periodEnd: max(schema.searchConsoleStats.periodEnd) })
      .from(schema.searchConsoleStats)
      .where(tenantWhere(schema.searchConsoleStats, ctx));
    if (!latest?.periodEnd) return { period: null, pages: [], queries: [] };

    const periodEnd = latest.periodEnd;
    const [start] = await this.db
      .select({ periodStart: min(schema.searchConsoleStats.periodStart) })
      .from(schema.searchConsoleStats)
      .where(
        and(
          tenantWhere(schema.searchConsoleStats, ctx),
          eq(schema.searchConsoleStats.periodEnd, periodEnd),
        ),
      );

    const impressionsSum = sql<string>`SUM(search_console_stats.impressions)`;
    const pageRows = await this.db
      .select({
        page: schema.searchConsoleStats.page,
        clicks: sql<string>`SUM(${schema.searchConsoleStats.clicks})`,
        impressions: impressionsSum,
        weighted: sql<string>`SUM(${schema.searchConsoleStats.position} * ${schema.searchConsoleStats.impressions})`,
        plain: sql<string>`AVG(${schema.searchConsoleStats.position})`,
      })
      .from(schema.searchConsoleStats)
      .where(
        and(
          tenantWhere(schema.searchConsoleStats, ctx),
          eq(schema.searchConsoleStats.periodEnd, periodEnd),
          like(schema.searchConsoleStats.page, SEDE_PAGE_LIKE),
        ),
      )
      .groupBy(schema.searchConsoleStats.page)
      .orderBy(
        desc(impressionsSum),
        desc(sql`SUM(${schema.searchConsoleStats.clicks})`),
        schema.searchConsoleStats.page,
      )
      .limit(limit);

    const pages = pageRows.map((r) => {
      const clicks = Number(r.clicks);
      const impressions = Number(r.impressions);
      return {
        page: r.page,
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        position: round2(
          impressions > 0 ? Number(r.weighted) / impressions : Number(r.plain),
        ),
      };
    });

    let queries: SearchConsoleReport["queries"] = [];
    if (pages.length > 0) {
      const ranked = this.db
        .select({
          page: schema.searchConsoleStats.page,
          query: schema.searchConsoleStats.query,
          clicks: schema.searchConsoleStats.clicks,
          impressions: schema.searchConsoleStats.impressions,
          ctr: schema.searchConsoleStats.ctr,
          position: schema.searchConsoleStats.position,
          rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${schema.searchConsoleStats.page} ORDER BY ${schema.searchConsoleStats.impressions} DESC, ${schema.searchConsoleStats.clicks} DESC, ${schema.searchConsoleStats.id})`.as(
            "rn",
          ),
        })
        .from(schema.searchConsoleStats)
        .where(
          and(
            tenantWhere(schema.searchConsoleStats, ctx),
            eq(schema.searchConsoleStats.periodEnd, periodEnd),
            like(schema.searchConsoleStats.page, SEDE_PAGE_LIKE),
            isNotNull(schema.searchConsoleStats.query),
          ),
        )
        .as("ranked");
      const top = await this.db
        .select()
        .from(ranked)
        .where(lte(ranked.rn, QUERIES_PER_PAGE))
        .orderBy(ranked.page, ranked.rn);
      // Mismo orden que `pages` (por impresiones), no alfabético por URL.
      const pageOrder = new Map(pages.map((p, i) => [p.page, i]));
      queries = top
        .filter((q) => pageOrder.has(q.page) && q.query !== null)
        .sort(
          (a, b) =>
            (pageOrder.get(a.page) ?? 0) - (pageOrder.get(b.page) ?? 0) ||
            a.rn - b.rn,
        )
        .map((q) => ({
          page: q.page,
          query: q.query ?? "",
          clicks: q.clicks,
          impressions: q.impressions,
          ctr: Number(q.ctr),
          position: Number(q.position),
        }));
    }

    return {
      period: { periodStart: start?.periodStart ?? periodEnd, periodEnd },
      pages,
      queries,
    };
  }
}
