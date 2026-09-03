/**
 * PromptService — el endpoint único "qué pop-up toca hoy" (Fase 193, D-06/D-07),
 * el registro server-side de eventos por socio (D-11), las tarjetas del
 * carrusel de Mi Templo (D-15b) y su helper de armado de destino/número de
 * ventas, compartido entre las tres superficies.
 *
 * ORQUESTA, NO REESCRIBE (regla dura del plan 05)
 * -------------------------------------------------
 * Las reglas de elegibilidad de calificación (48 h, última clase, fase 143),
 * de propuesta de mejora (silencio de 30 días post-envío, fase 144-…) y de
 * vencimiento (`SubscriptionService.getCoveredUntil` → `deriveCoveredUntil`,
 * fase 144-01) siguen INTACTAS en sus módulos dueños — este archivo solo las
 * llama, en el orden fijo de D-06, y les suma la cadencia editable del aviso
 * de sistema correspondiente (D-08/D-09) o la regla fija en código (D-10).
 *
 * ORDEN FIJO DE D-06 (server-side, no negociable desde el cliente)
 * -------------------------------------------------------------------
 *   1. plan_expiry     — `SubscriptionService.getCoveredUntil` + `wholeDaysUntil`
 *                         (0 <= daysRemaining <= 3, D-10 fijo en código).
 *   2. aviso vigente    — el primer `placement:'popup'` custom o `card_*`-ajeno
 *                         (excluyendo los 3 codes orquestados acá) que matchea
 *                         alcance (D-13), vigencia (D-14) y frecuencia (D-11).
 *   3. rating           — `RatingsService.getPendingRating` (D-P1..P4 intactos)
 *                         + cadencia del aviso `rating_prompt` (D-08).
 *   4. improvement      — `ImprovementProposalsService.getPromptStatus`
 *                         (silencio de 30 días intacto) + cadencia del aviso
 *                         `improvement_prompt` (D-09).
 *
 * Cada escalón corta en el primero que aplica — nunca se evalúan los
 * siguientes (T-193-19: cortocircuito, sin barrer las 4 reglas cuando la
 * primera ya resolvió).
 */
import {
  and,
  eq,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { avisos, avisoEvents, users, memberProfiles, branches } from "../../db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import { NotFoundError } from "../shared/errors";
import { todayInTz } from "../shared/date-utils";
import type { CountryCode } from "../shared/country-scope";
import type { MemberSegment } from "../segmentation/types";
import {
  resolveDestinationRoute,
  DEFAULT_WHATSAPP_TEXT,
  type AppSectionKey,
  type DestinationType,
  type Destination,
} from "./destinations";
import { resolveSalesNumberForUser } from "./sales-number";
import type { SystemAvisoCode } from "./system-avisos";
import { RatingsService } from "../ratings/service";
import type { PendingRating } from "../ratings/types";
import { ImprovementProposalsService } from "../improvement-proposals/service";
import { SubscriptionService } from "../subscriptions/service";
import { wholeDaysUntil } from "../subscriptions/member-routes";

type DbInstance = MySql2Database<typeof schema>;
type AvisoRow = typeof avisos.$inferSelect;

/** AR wall-clock: mismo criterio que `/coverage` (144-03) y `wholeDaysUntil`. */
const AR_TIMEZONE = "America/Argentina/Buenos_Aires";

/**
 * Los 3 codes de sistema `placement:'popup'` que este servicio orquesta
 * acá — se EXCLUYEN del escalón 2 (aviso vigente) para no competir consigo
 * mismos por partida doble.
 */
export const ORCHESTRATED_POPUP_CODES: readonly SystemAvisoCode[] = [
  "plan_expiry",
  "rating_prompt",
  "improvement_prompt",
];

/** Info del socio que `matchesScope` necesita (D-13). */
export interface MemberScopeInfo {
  branchId: number;
  country: CountryCode;
  segment: MemberSegment | null;
}

/** Forma de un aviso proyectada para la app (pop-up o tarjeta). */
export interface PromptAviso {
  id: number;
  /**
   * `code` de sistema (ej. `card_improvement`) o `null` para un aviso
   * `kind: 'custom'`. Plan 193-15: la app lo necesita para mapear las 4
   * tarjetas fijas del carrusel a su copy editable (`tarjetaByCode`); las
   * libres son las que traen `code: null`.
   */
  code: string | null;
  title: string;
  body: string;
  buttonText: string;
  destination: {
    type: DestinationType;
    section: AppSectionKey | null;
    route: string;
    /** Solo `whatsapp_sales`: el texto ya resuelto (con el default global si el aviso no trae uno propio). */
    whatsappText: string | null;
  };
  /** Solo presente cuando `destination.type === 'whatsapp_sales'` (D-20). */
  whatsappNumber?: string | null;
}

/** Unión discriminada por `kind` — a lo sumo UN pop-up por apertura (D-07). */
export type PromptResult =
  | { kind: "plan_expiry"; aviso: PromptAviso; daysRemaining: number }
  | { kind: "aviso"; aviso: PromptAviso }
  | { kind: "rating"; aviso: PromptAviso; pending: PendingRating }
  | { kind: "improvement"; aviso: PromptAviso }
  | null;

export class PromptService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  // ── D-07: el endpoint único ─────────────────────────────────────────────

  /**
   * Aplica el orden FIJO de D-06 y corta en el primer escalón que aplica.
   * `null` cuando ninguno de los 4 aplica hoy.
   */
  async resolvePrompt(ctx: TenantContext, userId: number): Promise<PromptResult> {
    const now = new Date();

    const planExpiry = await this.resolvePlanExpiry(ctx, userId, now);
    if (planExpiry) return planExpiry;

    const avisoVigente = await this.resolveAvisoVigente(ctx, userId, now);
    if (avisoVigente) return avisoVigente;

    const rating = await this.resolveRating(ctx, userId, now);
    if (rating) return rating;

    const improvement = await this.resolveImprovement(ctx, userId, now);
    if (improvement) return improvement;

    return null;
  }

  /** Escalón 1 (D-06/D-10): la regla de disparo queda FIJA EN CÓDIGO. */
  private async resolvePlanExpiry(
    ctx: TenantContext,
    userId: number,
    now: Date,
  ): Promise<PromptResult> {
    const row = await this.getSystemAviso(ctx, "plan_expiry");
    if (!row || row.status !== "active") return null;

    // D-10: la regla de disparo (≤3 días, supresión por cobertura) vive en
    // `SubscriptionService.getCoveredUntil` (→ `deriveCoveredUntil`, fase
    // 144-01) — se llama, no se reimplementa.
    const subscriptionService = new SubscriptionService(this.db, this.log);
    const coveredUntil = await subscriptionService.getCoveredUntil(userId, ctx);
    if (coveredUntil === null) return null;

    const daysRemaining = wholeDaysUntil(coveredUntil);
    if (daysRemaining < 0 || daysRemaining > 3) return null;

    const lastShown = await this.getLastShownAt(ctx, row.id, userId);
    if (!frequencyAllows(row, lastShown, now)) return null;

    const aviso = await this.buildPromptAvisoWithNumber(ctx, userId, row);
    return { kind: "plan_expiry", aviso, daysRemaining };
  }

  /** Escalón 2 (D-06/D-13/D-14): el primer aviso vigente que matchea alcance y frecuencia. */
  private async resolveAvisoVigente(
    ctx: TenantContext,
    userId: number,
    now: Date,
  ): Promise<PromptResult> {
    const member = await this.getMemberScopeInfo(ctx, userId);
    if (!member) return null;

    const today = todayInTz(AR_TIMEZONE);

    const candidates = await this.db
      .select()
      .from(avisos)
      .where(
        and(
          tenantWhere(avisos, ctx),
          eq(avisos.placement, "popup"),
          eq(avisos.status, "active"),
          or(
            isNull(avisos.code),
            notInArray(avisos.code, [...ORCHESTRATED_POPUP_CODES]),
          ),
        ),
      )
      .orderBy(avisos.sortOrder, avisos.id);

    if (candidates.length === 0) return null;

    const lastShownByAviso = await this.getLastShownMap(
      ctx,
      userId,
      candidates.map((c) => c.id),
    );

    for (const candidate of candidates) {
      if (!this.withinVigencia(candidate, today)) continue;
      if (!matchesScope(candidate, member)) continue;
      const lastShown = lastShownByAviso.get(candidate.id) ?? null;
      if (!frequencyAllows(candidate, lastShown, now)) continue;

      const aviso = await this.buildPromptAvisoWithNumber(ctx, userId, candidate);
      return { kind: "aviso", aviso };
    }

    return null;
  }

  /** Escalón 3 (D-06/D-08): D-P1..P4 intactos, más la cadencia del aviso `rating_prompt`. */
  private async resolveRating(
    ctx: TenantContext,
    userId: number,
    now: Date,
  ): Promise<PromptResult> {
    const row = await this.getSystemAviso(ctx, "rating_prompt");
    if (!row || row.status !== "active") return null;

    const ratingsService = new RatingsService(this.db);
    const pending = await ratingsService.getPendingRating(ctx, userId);
    if (!pending) return null;

    const lastShown = await this.getLastShownAt(ctx, row.id, userId);
    if (!frequencyAllows(row, lastShown, now)) return null;

    const aviso = await this.buildPromptAvisoWithNumber(ctx, userId, row);
    return { kind: "rating", aviso, pending };
  }

  /** Escalón 4 (D-06/D-09): el silencio de 30 días post-envío intacto, más la cadencia del aviso `improvement_prompt`. */
  private async resolveImprovement(
    ctx: TenantContext,
    userId: number,
    now: Date,
  ): Promise<PromptResult> {
    const row = await this.getSystemAviso(ctx, "improvement_prompt");
    if (!row || row.status !== "active") return null;

    const improvementService = new ImprovementProposalsService(this.db);
    const status = await improvementService.getPromptStatus(ctx, userId);
    if (!status.shouldPrompt) return null;

    const lastShown = await this.getLastShownAt(ctx, row.id, userId);
    if (!frequencyAllows(row, lastShown, now)) return null;

    const aviso = await this.buildPromptAvisoWithNumber(ctx, userId, row);
    return { kind: "improvement", aviso };
  }

  // ── D-11: registro de eventos por socio ─────────────────────────────────

  /**
   * Upsert en `aviso_events` (unique `(aviso_id, user_id, event_type)`):
   * primera vez inserta, repeticiones incrementan `eventCount` y refrescan
   * `lastAt` (alimenta `frequencyAllows` y las métricas D-17). Un aviso de
   * OTRO tenant da 404 (T-193-16/T-193-17), nunca 403.
   */
  async recordEvent(
    ctx: TenantContext,
    userId: number,
    avisoId: number,
    type: "shown" | "dismissed" | "clicked",
  ): Promise<void> {
    const [aviso] = await this.db
      .select({ id: avisos.id })
      .from(avisos)
      .where(and(tenantWhere(avisos, ctx), eq(avisos.id, avisoId)))
      .limit(1);
    if (!aviso) {
      throw new NotFoundError("Aviso no encontrado");
    }

    await this.db
      .insert(avisoEvents)
      .values(
        tenantValues(ctx, {
          avisoId,
          userId,
          eventType: type,
        }),
      )
      .onDuplicateKeyUpdate({
        set: {
          eventCount: sql`${avisoEvents.eventCount} + 1`,
          lastAt: sql`NOW()`,
        },
      });

    this.log.info(
      { avisoId, userId, tenantId: ctx.tenantId, eventType: type },
      "Evento de aviso registrado",
    );
  }

  // ── D-15b: tarjetas del carrusel ─────────────────────────────────────────

  /**
   * Avisos `placement:'tarjeta'` activos, en vigencia y que matchean alcance,
   * ordenados por `sortOrder`/`id` (los 4 de sistema + las libres, D-15a/b).
   * Sin frecuencia: el carrusel se ve en cada apertura (los avisos de tarjeta
   * nacen forzados a `every_open` en `createAviso`/`updateAviso`).
   */
  async listTarjetas(ctx: TenantContext, userId: number): Promise<PromptAviso[]> {
    const member = await this.getMemberScopeInfo(ctx, userId);
    if (!member) return [];

    const today = todayInTz(AR_TIMEZONE);

    const rows = await this.db
      .select()
      .from(avisos)
      .where(
        and(
          tenantWhere(avisos, ctx),
          eq(avisos.placement, "tarjeta"),
          eq(avisos.status, "active"),
          // Los pop-ups orquestados se resuelven por `code` en los escalones
          // 1/3/4: jamás deben aparecer también como tarjeta, aunque alguien
          // les cambie el `placement` (además `updateAviso` lo rechaza).
          or(
            isNull(avisos.code),
            notInArray(avisos.code, [...ORCHESTRATED_POPUP_CODES]),
          ),
        ),
      )
      .orderBy(avisos.sortOrder, avisos.id);

    // Resuelto UNA vez para todas las tarjetas de esta llamada (evita N
    // lecturas de `tenant_settings` si varias tarjetas son `whatsapp_sales`
    // — hoy card_upsell y card_program lo son).
    const { number: whatsappNumber } = await resolveSalesNumberForUser(
      this.db,
      ctx,
      userId,
    );

    const tarjetas: PromptAviso[] = [];
    for (const row of rows) {
      if (!this.withinVigencia(row, today)) continue;
      if (!matchesScope(row, member)) continue;
      tarjetas.push(buildPromptAviso(row, whatsappNumber));
    }
    return tarjetas;
  }

  // ── Privados ─────────────────────────────────────────────────────────────

  private async getSystemAviso(
    ctx: TenantContext,
    code: SystemAvisoCode,
  ): Promise<AvisoRow | null> {
    const [row] = await this.db
      .select()
      .from(avisos)
      .where(and(tenantWhere(avisos, ctx), eq(avisos.code, code)))
      .limit(1);
    return row ?? null;
  }

  private async getLastShownAt(
    ctx: TenantContext,
    avisoId: number,
    userId: number,
  ): Promise<Date | null> {
    const [row] = await this.db
      .select({ lastAt: avisoEvents.lastAt })
      .from(avisoEvents)
      .where(
        and(
          tenantWhere(avisoEvents, ctx),
          eq(avisoEvents.avisoId, avisoId),
          eq(avisoEvents.userId, userId),
          eq(avisoEvents.eventType, "shown"),
        ),
      )
      .limit(1);
    return row?.lastAt ?? null;
  }

  /** Versión en lote de {@link getLastShownAt} — UN select para N avisos (T-193-19). */
  private async getLastShownMap(
    ctx: TenantContext,
    userId: number,
    avisoIds: number[],
  ): Promise<Map<number, Date>> {
    const map = new Map<number, Date>();
    if (avisoIds.length === 0) return map;

    const rows = await this.db
      .select({ avisoId: avisoEvents.avisoId, lastAt: avisoEvents.lastAt })
      .from(avisoEvents)
      .where(
        and(
          tenantWhere(avisoEvents, ctx),
          eq(avisoEvents.userId, userId),
          eq(avisoEvents.eventType, "shown"),
          inArray(avisoEvents.avisoId, avisoIds),
        ),
      );
    for (const row of rows) {
      map.set(row.avisoId, row.lastAt);
    }
    return map;
  }

  /** D-14: `startsOn <= hoy <= endsOn`, `null` en cualquiera de los dos = sin límite. */
  private withinVigencia(
    aviso: Pick<AvisoRow, "startsOn" | "endsOn">,
    today: string,
  ): boolean {
    if (aviso.startsOn && aviso.startsOn > today) return false;
    if (aviso.endsOn && aviso.endsOn < today) return false;
    return true;
  }

  /** `matchesScope` necesita sede, país y segmento del socio (D-13). */
  private async getMemberScopeInfo(
    ctx: TenantContext,
    userId: number,
  ): Promise<MemberScopeInfo | null> {
    const [row] = await this.db
      .select({
        branchId: users.branchId,
        country: branches.country,
        segment: memberProfiles.segment,
      })
      .from(users)
      .innerJoin(branches, eq(users.branchId, branches.id))
      .leftJoin(
        memberProfiles,
        and(
          tenantWhere(memberProfiles, ctx),
          eq(memberProfiles.userId, users.id),
        ),
      )
      .where(and(tenantWhere(users, ctx), eq(users.id, userId)))
      .limit(1);

    if (!row) return null;
    const country: CountryCode = row.country === "ES" ? "ES" : "AR";
    return { branchId: row.branchId, country, segment: row.segment };
  }

  /** Wrapper async: resuelve `whatsappNumber` SOLO si el destino lo necesita. */
  private async buildPromptAvisoWithNumber(
    ctx: TenantContext,
    userId: number,
    row: AvisoRow,
  ): Promise<PromptAviso> {
    let whatsappNumber: string | null = null;
    if (row.destinationType === "whatsapp_sales") {
      const resolved = await resolveSalesNumberForUser(this.db, ctx, userId);
      whatsappNumber = resolved.number;
    }
    return buildPromptAviso(row, whatsappNumber);
  }
}

// ── Helpers exportados y testeables por separado ────────────────────────────

/**
 * D-13: alcance por sede, país y segmento. Un `scope*` `null` o `[]` = "todos"
 * para ese criterio; si tiene valores, el socio tiene que estar incluido. Los
 * tres criterios se combinan con AND.
 */
export function matchesScope(
  aviso: Pick<AvisoRow, "scopeBranchIds" | "scopeCountries" | "scopeSegments">,
  member: MemberScopeInfo,
): boolean {
  if (
    aviso.scopeBranchIds &&
    aviso.scopeBranchIds.length > 0 &&
    !aviso.scopeBranchIds.includes(member.branchId)
  ) {
    return false;
  }
  if (
    aviso.scopeCountries &&
    aviso.scopeCountries.length > 0 &&
    !aviso.scopeCountries.includes(member.country)
  ) {
    return false;
  }
  if (aviso.scopeSegments && aviso.scopeSegments.length > 0) {
    if (!member.segment || !aviso.scopeSegments.includes(member.segment)) {
      return false;
    }
  }
  return true;
}

/**
 * D-11: `once` solo si nunca se mostró; `every_n_days` habilita cuando pasaron
 * `frequencyDays` días completos desde `lastShownAt` (o nunca se mostró);
 * `every_open` siempre.
 */
export function frequencyAllows(
  aviso: Pick<AvisoRow, "frequencyType" | "frequencyDays">,
  lastShownAt: Date | null,
  now: Date,
): boolean {
  if (aviso.frequencyType === "every_open") return true;
  if (aviso.frequencyType === "once") return lastShownAt === null;

  // every_n_days
  if (lastShownAt === null) return true;
  const days = aviso.frequencyDays ?? 0;
  const elapsedMs = now.getTime() - lastShownAt.getTime();
  return elapsedMs >= days * 24 * 60 * 60 * 1000;
}

/**
 * Arma la forma que la app necesita a partir de una fila de `avisos` — pura,
 * sin `db`: `whatsappNumber` se resuelve afuera (D-20) y se pasa ya resuelto,
 * así una sola lectura de `tenant_settings` alcanza para N avisos de la misma
 * llamada (T-193-19).
 */
function buildPromptAviso(row: AvisoRow, whatsappNumber: string | null): PromptAviso {
  const destination: Destination = {
    type: row.destinationType,
    section: row.destinationSection as AppSectionKey | null,
    whatsappText: row.whatsappText,
  };
  const route = resolveDestinationRoute(destination);

  const aviso: PromptAviso = {
    id: row.id,
    code: row.code,
    title: row.title,
    body: row.body,
    buttonText: row.buttonText,
    destination: {
      type: row.destinationType,
      section: row.destinationSection as AppSectionKey | null,
      route,
      whatsappText:
        row.destinationType === "whatsapp_sales"
          ? (row.whatsappText ?? DEFAULT_WHATSAPP_TEXT)
          : null,
    },
  };
  if (row.destinationType === "whatsapp_sales") {
    aviso.whatsappNumber = whatsappNumber;
  }
  return aviso;
}
