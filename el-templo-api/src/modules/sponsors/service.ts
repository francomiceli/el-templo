/**
 * Module: sponsors — SponsorsService (Fase 199, D-17..D-25).
 *
 * Patrocinadores = marcas que DAN beneficios a los socios de El Templo
 * (D-17, no confundir con Partners/referidos). Son de la PLATAFORMA (D-18):
 * `sponsor_brands` es una tabla exenta de tenancy y solo El Templo las
 * administra (guard `isTemploPlatformAdmin`, aplicado en las rutas del plan 03).
 * `sponsor_views` (métricas por socio y marca) sí es gym-owned strict: lleva
 * `tenantWhere`/`tenantValues` como primer término en cada acceso.
 *
 * Decisiones de este servicio:
 *  - D-19: el contraste texto/fondo (WCAG >= 4.5) y el prefijo del logo se
 *    validan EN EL SERVER, no solo en el editor.
 *  - D-20: el feed del socio muestra marcas activas, dentro de vigencia (fecha
 *    en la zona horaria de SU sede) y de su país. La condición vive en UNA
 *    función (`visibleForCountry`) que usan el feed y los eventos, para que lo
 *    listado y lo reportable no diverjan.
 *  - D-21: todos los socios reciben el feed; el `redeemCode` solo viaja si el
 *    socio tiene plan activo. Plan activo = `paused`, o `active` con `endDate`
 *    no vencida: misma regla que `autoExpireSubscriptions` (que es la que
 *    corre `/me/plan-status`), calculada con el mismo `today` UTC, para que
 *    `canRedeem` y plan-status nunca diverjan. Lectura pura: no se llama al
 *    sweep ni se escribe en el feed.
 *  - D-24: límite de marcas activas por país (system_settings). Bajar el
 *    límite no desactiva nada; solo impide nuevas activaciones. El chequeo y
 *    el insert no son atómicos: dos admins activando a la vez podrían pasarse
 *    por una (aceptado, el alta es manual y de un único equipo).
 *  - D-25: una fila por (socio, marca); el primer `tapped_at`/`redeem_at` se
 *    conserva (UPDATE solo donde la columna es NULL).
 *  - Kaia (tenant != 1) queda fuera de alcance: feed vacío y eventos 404.
 *
 * Los 404 son siempre 404, nunca 403 (no revelar existencia).
 */
import {
  and,
  count,
  eq,
  gte,
  isNull,
  lte,
  max,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import {
  branches,
  referralPartners,
  sponsorBrands,
  sponsorViews,
  subscriptions,
  users,
} from "../../db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { DEFAULT_TENANT_TIMEZONE, todayInTz } from "../shared/date-utils";
import { TEMPLO_TENANT_ID } from "../shared/platform";
import type { SettingsService } from "../settings/service";
import { MIN_TEXT_CONTRAST, contrastRatio } from "./contrast";
import {
  SPONSOR_LOGO_PREFIX,
  type CreateSponsorBody,
  type MemberSponsorsResult,
  type SponsorAdminItem,
  type SponsorCountry,
  type SponsorEventType,
  type SponsorMemberItem,
  type UpdateSponsorBody,
} from "./schemas";

type DbInstance = MySql2Database<typeof schema>;
type BrandRow = typeof sponsorBrands.$inferSelect;
type BrandInsert = typeof sponsorBrands.$inferInsert;

/** Campos que `validateBrand` necesita (fila completa o borrador de alta). */
type BrandDraft = Pick<
  BrandRow,
  | "name"
  | "category"
  | "benefit"
  | "detail"
  | "bgColor"
  | "textColor"
  | "redeemType"
  | "redeemCode"
  | "startsOn"
  | "endsOn"
  | "countryAr"
  | "countryEs"
>;

const COUNTRY_LABEL: Record<SponsorCountry, string> = {
  AR: "Argentina",
  ES: "España",
};

function toCountries(
  row: Pick<BrandRow, "countryAr" | "countryEs">,
): SponsorCountry[] {
  const list: SponsorCountry[] = [];
  if (row.countryAr) list.push("AR");
  if (row.countryEs) list.push("ES");
  return list;
}

function fromCountries(list: SponsorCountry[]): {
  countryAr: boolean;
  countryEs: boolean;
} {
  return { countryAr: list.includes("AR"), countryEs: list.includes("ES") };
}

/**
 * UNA sola condición de visibilidad para el feed y los eventos (D-20): marca
 * activa, dentro de vigencia en `today` (YYYY-MM-DD, zona de la sede del socio)
 * y dirigida al país del socio. No incluye filtro de tenant (tabla exenta).
 */
function visibleForCountry(country: SponsorCountry, today: string): SQL {
  const countryFlag =
    country === "AR"
      ? eq(sponsorBrands.countryAr, true)
      : eq(sponsorBrands.countryEs, true);
  return and(
    eq(sponsorBrands.isActive, true),
    or(isNull(sponsorBrands.startsOn), lte(sponsorBrands.startsOn, today)),
    or(isNull(sponsorBrands.endsOn), gte(sponsorBrands.endsOn, today)),
    countryFlag,
  ) as SQL;
}

/** `YYYY-MM-DD` que además es una fecha real de calendario. */
function isRealDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function trimmedOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

export class SponsorsService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly settings: SettingsService,
  ) {}

  // ── Admin ────────────────────────────────────────────────────────────────

  /**
   * Todas las marcas (activas, inactivas, vencidas) con vistas / toques /
   * intentos de canje. Dos queries en total (marcas + un conteo agrupado por
   * marca), sin N+1. Las métricas se leen del tenant del admin (hoy solo El
   * Templo administra, así que equivale a global).
   */
  async listAdmin(ctx: TenantContext): Promise<SponsorAdminItem[]> {
    const rows = await this.db
      .select()
      .from(sponsorBrands)
      .orderBy(sponsorBrands.sortOrder, sponsorBrands.id);

    if (rows.length === 0) return [];

    const counts = await this.db
      .select({
        brandId: sponsorViews.brandId,
        views: count(),
        taps: count(sponsorViews.tappedAt),
        redeems: count(sponsorViews.redeemAt),
      })
      .from(sponsorViews)
      .where(tenantWhere(sponsorViews, ctx))
      .groupBy(sponsorViews.brandId);
    const countsById = new Map(counts.map((c) => [c.brandId, c]));

    return rows.map((row) => {
      const c = countsById.get(row.id);
      return this.toAdminItem(
        row,
        c?.views ?? 0,
        c?.taps ?? 0,
        c?.redeems ?? 0,
      );
    });
  }

  async create(
    ctx: TenantContext,
    input: CreateSponsorBody,
    createdBy: number,
  ): Promise<SponsorAdminItem> {
    const draft = {
      name: input.name.trim(),
      category: input.category.trim(),
      benefit: input.benefit.trim(),
      detail: input.detail.trim(),
      bgColor: input.bgColor,
      textColor: input.textColor,
      redeemType: input.redeemType,
      redeemCode: trimmedOrNull(input.redeemCode),
      startsOn: trimmedOrNull(input.startsOn),
      endsOn: trimmedOrNull(input.endsOn),
      ...fromCountries(input.countries),
    };
    this.validateBrand(draft);

    const logoUrl = trimmedOrNull(input.logoUrl);
    this.assertOwnLogoUrl(logoUrl);

    if (input.partnerId !== undefined && input.partnerId !== null) {
      await this.assertPartnerExists(ctx, input.partnerId);
    }
    const isActive = input.isActive ?? false;
    if (isActive) {
      await this.assertWithinLimit(ctx, input.countries);
    }

    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      const [top] = await this.db
        .select({ top: max(sponsorBrands.sortOrder) })
        .from(sponsorBrands);
      sortOrder = (top?.top ?? -1) + 1;
    }

    // sponsor_brands es una tabla exenta de plataforma: sin tenantValues.
    const [result] = await this.db.insert(sponsorBrands).values({
      ...draft,
      logoUrl,
      icon: trimmedOrNull(input.icon),
      conditions: trimmedOrNull(input.conditions),
      isActive,
      sortOrder,
      partnerId: input.partnerId ?? null,
      createdBy,
    });

    const insertId = Number(result.insertId);
    this.log.info(
      { sponsorId: insertId, tenantId: ctx.tenantId },
      "Patrocinador creado",
    );
    return this.getAdminItem(ctx, insertId);
  }

  async update(
    ctx: TenantContext,
    id: number,
    input: UpdateSponsorBody,
  ): Promise<SponsorAdminItem> {
    const row = await this.findBrand(id);

    // Solo lo enviado: cada clave se asigna únicamente si vino definida, así
    // el spread `{ ...row, ...set }` de abajo nunca pisa con `undefined`.
    const set: Partial<BrandInsert> = {};
    if (input.name !== undefined) set.name = input.name.trim();
    if (input.category !== undefined) set.category = input.category.trim();
    if (input.benefit !== undefined) set.benefit = input.benefit.trim();
    if (input.detail !== undefined) set.detail = input.detail.trim();
    if (input.bgColor !== undefined) set.bgColor = input.bgColor;
    if (input.textColor !== undefined) set.textColor = input.textColor;
    if (input.redeemType !== undefined) set.redeemType = input.redeemType;
    if (input.redeemCode !== undefined) {
      set.redeemCode = trimmedOrNull(input.redeemCode);
    }
    if (input.startsOn !== undefined)
      set.startsOn = trimmedOrNull(input.startsOn);
    if (input.endsOn !== undefined) set.endsOn = trimmedOrNull(input.endsOn);
    if (input.conditions !== undefined) {
      set.conditions = trimmedOrNull(input.conditions);
    }
    if (input.icon !== undefined) set.icon = trimmedOrNull(input.icon);
    if (input.logoUrl !== undefined) set.logoUrl = trimmedOrNull(input.logoUrl);
    if (input.isActive !== undefined) set.isActive = input.isActive;
    if (input.sortOrder !== undefined) set.sortOrder = input.sortOrder;
    if (input.partnerId !== undefined) set.partnerId = input.partnerId;
    if (input.countries !== undefined) {
      Object.assign(set, fromCountries(input.countries));
    }

    const merged: BrandRow = { ...row, ...set };
    this.validateBrand(merged);

    // Solo si el logo viene en el input: no se revalida el ya guardado, para
    // que un cambio de R2_PUBLIC_URL no trabe la edición de otras columnas.
    if (input.logoUrl !== undefined) {
      this.assertOwnLogoUrl(set.logoUrl ?? null);
    }
    if (input.partnerId !== undefined && input.partnerId !== null) {
      await this.assertPartnerExists(ctx, input.partnerId);
    }

    // Límite (D-24): si queda activa, se chequean los países en los que "entra"
    // ahora (todos si estaba inactiva; solo los agregados si ya estaba activa,
    // así editar una marca vieja no se traba por un límite bajado después).
    if (merged.isActive) {
      const newCountries = toCountries(merged);
      const toCheck = row.isActive
        ? newCountries.filter((c) => !toCountries(row).includes(c))
        : newCountries;
      if (toCheck.length > 0) {
        await this.assertWithinLimit(ctx, toCheck, id);
      }
    }

    if (Object.keys(set).length > 0) {
      await this.db
        .update(sponsorBrands)
        .set(set)
        .where(eq(sponsorBrands.id, id));
    }

    this.log.info(
      { sponsorId: id, tenantId: ctx.tenantId },
      "Patrocinador actualizado",
    );
    return this.getAdminItem(ctx, id);
  }

  async remove(ctx: TenantContext, id: number): Promise<void> {
    await this.findBrand(id);
    // Las vistas caen por ON DELETE CASCADE.
    await this.db.delete(sponsorBrands).where(eq(sponsorBrands.id, id));
    this.log.info(
      { sponsorId: id, tenantId: ctx.tenantId },
      "Patrocinador eliminado",
    );
  }

  async getMaxActivePerCountry(): Promise<number> {
    return this.settings.getSponsorsMaxActivePerCountry();
  }

  async setMaxActivePerCountry(value: number): Promise<void> {
    await this.settings.setSponsorsMaxActivePerCountry(value);
  }

  // ── Socio ────────────────────────────────────────────────────────────────

  /**
   * Feed del socio (D-18, D-20, D-21). Todos los socios de El Templo reciben
   * las marcas visibles; el código de canje solo con plan activo.
   */
  async listForMember(
    ctx: TenantContext,
    userId: number,
  ): Promise<MemberSponsorsResult> {
    const empty: MemberSponsorsResult = { sponsors: [], canRedeem: false };
    if (ctx.tenantId !== TEMPLO_TENANT_ID) return empty;

    const member = await this.getMemberContext(ctx, userId);
    if (!member) return empty;

    const today = todayInTz(member.timezone);
    const limit = await this.settings.getSponsorsMaxActivePerCountry();
    const rows = await this.db
      .select()
      .from(sponsorBrands)
      .where(visibleForCountry(member.country, today))
      .orderBy(sponsorBrands.sortOrder, sponsorBrands.id)
      // Defensivo: el límite de activas ya acota la lista por país.
      .limit(limit);

    const canRedeem = await this.hasActivePlan(ctx, userId);
    const sponsors: SponsorMemberItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      logoUrl: row.logoUrl,
      icon: row.icon,
      bgColor: row.bgColor,
      textColor: row.textColor,
      benefit: row.benefit,
      detail: row.detail,
      conditions: row.conditions,
      redeemType: row.redeemType,
      redeemCode:
        canRedeem && row.redeemType === "code" ? row.redeemCode : null,
    }));
    return { sponsors, canRedeem };
  }

  /**
   * D-25: upsert idempotente en `sponsor_views`. `seen` crea la fila;
   * `tapped`/`redeem` además completan su columna UNA sola vez (se conserva la
   * primera marca de tiempo). 404 si la marca no es visible para el socio
   * (inexistente, inactiva, vencida, de otro país) o el tenant no es El Templo;
   * 400 si intenta canjear sin plan activo.
   */
  async recordEvent(
    ctx: TenantContext,
    userId: number,
    brandId: number,
    type: SponsorEventType,
  ): Promise<void> {
    if (ctx.tenantId !== TEMPLO_TENANT_ID) {
      throw new NotFoundError("Patrocinador no encontrado");
    }
    const member = await this.getMemberContext(ctx, userId);
    if (!member) {
      throw new NotFoundError("Patrocinador no encontrado");
    }

    const today = todayInTz(member.timezone);
    const [visible] = await this.db
      .select({ id: sponsorBrands.id })
      .from(sponsorBrands)
      .where(
        and(
          eq(sponsorBrands.id, brandId),
          visibleForCountry(member.country, today),
        ),
      )
      .limit(1);
    if (!visible) {
      throw new NotFoundError("Patrocinador no encontrado");
    }

    if (type === "redeem" && !(await this.hasActivePlan(ctx, userId))) {
      throw new BadRequestError("Necesitás un plan activo para canjear");
    }

    const now = new Date();
    // Duplicado (socio, marca) = la fila ya existe: no-op.
    await this.db
      .insert(sponsorViews)
      .values(
        tenantValues(ctx, {
          brandId,
          userId,
          firstSeenAt: now,
          tappedAt: type === "tapped" ? now : null,
          redeemAt: type === "redeem" ? now : null,
        }),
      )
      .onDuplicateKeyUpdate({ set: { brandId: sql`brand_id` } });

    if (type === "tapped" || type === "redeem") {
      const column =
        type === "tapped" ? sponsorViews.tappedAt : sponsorViews.redeemAt;
      // Solo si todavía no tenía la marca: conserva la primera y es idempotente.
      await this.db
        .update(sponsorViews)
        .set(type === "tapped" ? { tappedAt: now } : { redeemAt: now })
        .where(
          and(
            tenantWhere(sponsorViews, ctx),
            eq(sponsorViews.userId, userId),
            eq(sponsorViews.brandId, brandId),
            isNull(column),
          ),
        );
    }

    this.log.info(
      { sponsorId: brandId, userId, tenantId: ctx.tenantId, eventType: type },
      "Evento de patrocinador registrado",
    );
  }

  // ── Privados ─────────────────────────────────────────────────────────────

  /** Lookup por PK en el catálogo de plataforma; 404 si no existe. */
  private async findBrand(id: number): Promise<BrandRow> {
    const [row] = await this.db
      .select()
      .from(sponsorBrands)
      .where(eq(sponsorBrands.id, id))
      .limit(1);
    if (!row) {
      throw new NotFoundError("Patrocinador no encontrado");
    }
    return row;
  }

  /** Relee la marca con sus métricas (respuesta de create/update). */
  private async getAdminItem(
    ctx: TenantContext,
    id: number,
  ): Promise<SponsorAdminItem> {
    const row = await this.findBrand(id);
    const [counts] = await this.db
      .select({
        views: count(),
        taps: count(sponsorViews.tappedAt),
        redeems: count(sponsorViews.redeemAt),
      })
      .from(sponsorViews)
      .where(and(tenantWhere(sponsorViews, ctx), eq(sponsorViews.brandId, id)));
    return this.toAdminItem(
      row,
      counts?.views ?? 0,
      counts?.taps ?? 0,
      counts?.redeems ?? 0,
    );
  }

  private toAdminItem(
    row: BrandRow,
    views: number,
    taps: number,
    redeems: number,
  ): SponsorAdminItem {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      logoUrl: row.logoUrl,
      icon: row.icon,
      bgColor: row.bgColor,
      textColor: row.textColor,
      benefit: row.benefit,
      detail: row.detail,
      conditions: row.conditions,
      redeemType: row.redeemType,
      redeemCode: row.redeemCode,
      countries: toCountries(row),
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      partnerId: row.partnerId,
      views,
      taps,
      redeems,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * D-19 / T-199-09 / T-199-48: el logo solo puede ser un archivo subido por el
   * flujo del editor al R2 propio (sin hotlink a terceros). `null` es válido.
   * `R2_PUBLIC_URL` se lee en cada llamada (los tests lo setean por describe).
   * Se compara con la barra final incluida para que `https://<base>.evil.com/`
   * no pase.
   */
  private assertOwnLogoUrl(logoUrl: string | null | undefined): void {
    if (logoUrl === null || logoUrl === undefined) return;
    const base = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
    if (base === "") {
      throw new BadRequestError(
        "No hay almacenamiento de imágenes configurado: no se puede asignar un logo",
      );
    }
    if (!logoUrl.startsWith(`${base}/${SPONSOR_LOGO_PREFIX}/`)) {
      throw new BadRequestError(
        "El logo tiene que subirse desde el editor (almacenamiento de El Templo)",
      );
    }
  }

  /** Reglas de negocio de una marca (D-19). Lanza 400 con mensaje accionable. */
  private validateBrand(brand: BrandDraft): void {
    if (
      brand.name === "" ||
      brand.category === "" ||
      brand.benefit === "" ||
      brand.detail === ""
    ) {
      throw new BadRequestError(
        "Nombre, rubro, beneficio y detalle no pueden estar vacíos",
      );
    }

    const ratio = contrastRatio(brand.bgColor, brand.textColor);
    if (ratio < MIN_TEXT_CONTRAST) {
      throw new BadRequestError(
        `El contraste entre el fondo y el texto es ${ratio.toFixed(2)}:1 y tiene que ser al menos ${MIN_TEXT_CONTRAST}:1`,
      );
    }

    if (brand.redeemType === "code" && !brand.redeemCode) {
      throw new BadRequestError(
        "Las marcas con código de canje necesitan el código",
      );
    }

    if (!brand.countryAr && !brand.countryEs) {
      throw new BadRequestError("Elegí al menos un país");
    }

    for (const date of [brand.startsOn, brand.endsOn]) {
      if (date && !isRealDate(date)) {
        throw new BadRequestError("La fecha de vigencia no es válida");
      }
    }
    if (brand.startsOn && brand.endsOn && brand.startsOn > brand.endsOn) {
      throw new BadRequestError(
        "La fecha de inicio no puede ser posterior a la de fin",
      );
    }
  }

  /**
   * T-199-08: `partner_id` apunta a `referral_partners` (gym-owned) desde una
   * tabla de plataforma. Se exige que el partner exista EN EL TENANT del admin;
   * si no, 400 (no se filtra si existe en otro gimnasio).
   */
  private async assertPartnerExists(
    ctx: TenantContext,
    partnerId: number,
  ): Promise<void> {
    const [partner] = await this.db
      .select({ id: referralPartners.id })
      .from(referralPartners)
      .where(
        and(
          tenantWhere(referralPartners, ctx),
          eq(referralPartners.id, partnerId),
        ),
      )
      .limit(1);
    if (!partner) {
      throw new BadRequestError("El partner no existe");
    }
  }

  /**
   * D-24: por cada país, las marcas activas (sin contar `excludeId`) tienen que
   * ser menos que el límite. "Activas" = `is_active`, sin mirar vigencia; una
   * marca AR+ES cuenta en los dos países.
   */
  private async assertWithinLimit(
    ctx: TenantContext,
    countries: SponsorCountry[],
    excludeId?: number,
  ): Promise<void> {
    const limit = await this.settings.getSponsorsMaxActivePerCountry();
    for (const country of countries) {
      const flag =
        country === "AR"
          ? eq(sponsorBrands.countryAr, true)
          : eq(sponsorBrands.countryEs, true);
      const [row] = await this.db
        .select({ active: count() })
        .from(sponsorBrands)
        .where(
          and(
            eq(sponsorBrands.isActive, true),
            flag,
            excludeId === undefined
              ? undefined
              : ne(sponsorBrands.id, excludeId),
          ),
        );
      if ((row?.active ?? 0) >= limit) {
        this.log.info(
          { tenantId: ctx.tenantId, country, limit },
          "Límite de patrocinadores activos alcanzado",
        );
        throw new BadRequestError(
          `Ya hay ${limit} patrocinadores activos en ${COUNTRY_LABEL[country]}. Desactivá uno antes de activar otro.`,
        );
      }
    }
  }

  /** País y zona horaria de la sede del socio, o `null` si no existe en el tenant. */
  private async getMemberContext(
    ctx: TenantContext,
    userId: number,
  ): Promise<{ country: SponsorCountry; timezone: string } | null> {
    const [row] = await this.db
      .select({ country: branches.country, timezone: branches.timezone })
      .from(users)
      .innerJoin(
        branches,
        and(tenantWhere(branches, ctx), eq(users.branchId, branches.id)),
      )
      .where(and(tenantWhere(users, ctx), eq(users.id, userId)))
      .limit(1);
    if (!row) return null;
    return {
      country: row.country === "ES" ? "ES" : "AR",
      timezone: row.timezone || DEFAULT_TENANT_TIMEZONE,
    };
  }

  /**
   * Plan activo = `paused`, o `active` con `endDate` nula o no vencida. La
   * condición de fecha aplica SOLO a `active`: `autoExpireSubscriptions` solo
   * vence `active` y la pausa no toca `endDate` hasta reanudar.
   *
   * Misma comparación que autoExpireSubscriptions (subscriptions/service.ts) y
   * por ende que /me/plan-status (plan 05): una sub `active` con `endDate`
   * pasada todavía no barrida NO habilita el canje. Sin sweep: lectura pura.
   */
  private async hasActivePlan(
    ctx: TenantContext,
    userId: number,
  ): Promise<boolean> {
    const todayUtc = new Date().toISOString().split("T")[0];
    const [row] = await this.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          tenantWhere(subscriptions, ctx),
          eq(subscriptions.userId, userId),
          or(
            eq(subscriptions.status, "paused"),
            and(
              eq(subscriptions.status, "active"),
              or(
                isNull(subscriptions.endDate),
                sql`${subscriptions.endDate} >= ${todayUtc}`,
              ),
            ),
          ),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
}
