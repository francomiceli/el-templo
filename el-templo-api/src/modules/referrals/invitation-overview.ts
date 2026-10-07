// Módulo: referrals — bloques de invitaciones del overview (Fase 194-19)
//
// Superficie de LECTURA de "Mis invitados" (app) y del bloque "invitado por" de la
// ficha/lead: cupo del mes, link de invitación, invitados con estado derivado,
// accesos x/N y descuento. `ReferralService.getReferralOverview` delega acá (regla
// de 194-32: lo nuevo no engorda `service.ts`); el resultado se sirve por las dos
// rutas existentes (`GET /api/members/referrals` y `GET /api/admin/members/:id/referrals`).
//
// SIN N+1 (T-194-65): cada carga es UNA query para todos los invitados
// (invitaciones + sub de accesos + "compró" + nombre en un solo SELECT; coberturas
// en batch; sedes entrenadas agrupadas). Nada de `await` dentro de loops.
//
// PRIVACIDAD (T-194-63): la lista de invitados expone nombre de pila + inicial del
// apellido; nunca teléfono, DNI ni email. El `userId` sale del token (o del target
// ya validado por la ficha), jamás del body.
//
// URL (T-194-66): se arma acá, server-side, con `FRONTEND_URL`; nunca desde input.
//
// "COMPRÓ" = el invitado tiene una sub paga (`price_paid > 0`) de un plan que NO es
// `is_trial`, creada desde la activación de ESA invitación (RESEARCH §Patrón 7). Una
// sub cancelada cuenta como compra (el estado pasa a `inactivo`, que es lo cierto).
// Los vínculos heredados (`referrals` sin invitación) usan `qualified` = compró.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { todayInTz } from "../shared/date-utils";
import { notTrialPlanSql } from "../shared/membership";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { deriveMembershipCoveredUntilBatch } from "../subscriptions/service";
import { InvitationRules } from "./invitation-rules";
import {
  accessesUsed,
  deriveInviteeState,
  deriveLeadStage,
} from "./invitation-states";
import { loadTrainedBranches } from "./invitation-trained-branches";
import type { InvitationsOverview, InvitedByView, InviteeView } from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** tz de respaldo si el usuario no tiene sede cargable (usuario borrado). */
const FALLBACK_TIMEZONE = "America/Argentina/Buenos_Aires";
/** Base del link cuando `FRONTEND_URL` no está definida (mismo default que `app.ts`). */
const DEFAULT_FRONTEND_URL = "https://app.eltemplo.org";

/**
 * Link de invitación del socio: `<FRONTEND_URL>/invitacion/<CODE>`. Server-side
 * (T-194-66); el código va codificado por si alguna vez trae caracteres raros.
 */
export function buildInviteUrl(code: string): string {
  const base = (process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL).replace(
    /\/+$/,
    "",
  );
  return `${base}/invitacion/${encodeURIComponent(code)}`;
}

/** Vínculo de `referrals` (no revoked) tal como lo carga `getReferralOverview`. */
export interface OverviewLink {
  referrerId: number;
  referredId: number;
  status: "pending" | "qualified" | "revoked";
}

export interface InvitationOverviewInput {
  /** Código legible del socio (lazy, ya generado por el servicio). */
  referralCode: string;
  /** Vínculos no-revoked del usuario en ambas direcciones (ya cargados). */
  links: OverviewLink[];
  /** % de descuento vigente (el mismo del cobro, `computeReferralDiscountPercent`). */
  percent: number;
}

/** Fila de una invitación del usuario como INVITADOR con todo lo que el estado necesita. */
interface InviterInvitationRow {
  id: number;
  invitedUserId: number;
  activatedAt: Date;
  accessExpiresOn: string;
  classesBudget: number | null;
  classesRemaining: number | null;
  firstName: string | null;
  lastName: string | null;
  purchased: number | string | boolean;
}

export class InvitationOverview {
  private readonly rules: InvitationRules;

  constructor(
    private readonly db: DbInstance,
    log: FastifyBaseLogger,
  ) {
    this.rules = new InvitationRules(db, log);
  }

  /** Bloques `invitations` e `invitedBy` del overview del usuario. */
  async build(
    ctx: TenantContext,
    userId: number,
    input: InvitationOverviewInput,
  ): Promise<{
    invitations: InvitationsOverview;
    invitedBy: InvitedByView | null;
  }> {
    const user = await this.rules.loadUserWithTimezone(ctx, userId, this.db);
    const timezone = user?.timezone ?? FALLBACK_TIMEZONE;
    // `today` = día calendario de la sede del usuario (no UTC).
    const today = todayInTz(timezone);

    const quota = await this.rules.computeQuota(ctx, userId, timezone, this.db);
    const invitees = await this.buildInvitees(ctx, userId, input, today);
    const invitedBy = await this.buildInvitedBy(ctx, userId, today);

    return {
      invitations: {
        quota,
        inviteUrl: buildInviteUrl(input.referralCode),
        invitees,
        discount: {
          percent: input.percent,
          activeInvitees: invitees.filter((invitee) => invitee.sumaDescuento)
            .length,
        },
      },
      invitedBy,
    };
  }

  // ─── Invitados (el usuario como invitador) ──────────────────────────────

  private async buildInvitees(
    ctx: TenantContext,
    userId: number,
    input: InvitationOverviewInput,
    today: string,
  ): Promise<InviteeView[]> {
    const rows = await this.loadInviterInvitations(ctx, userId);

    // Legado (SC-6): vínculos donde el usuario es referidor y el invitado NO tiene
    // una invitación activa suya (nacieron antes de la fase o por asignación D-17).
    const invitedIds = new Set(rows.map((row) => row.invitedUserId));
    const legacyLinks = input.links.filter(
      (link) => link.referrerId === userId && !invitedIds.has(link.referredId),
    );
    const legacyNames = await this.loadNames(
      ctx,
      legacyLinks.map((link) => link.referredId),
    );

    const coveredMap = await deriveMembershipCoveredUntilBatch(
      this.db,
      [...invitedIds, ...legacyLinks.map((link) => link.referredId)],
      ctx,
    );
    const isCovered = (id: number): boolean => {
      const covered = coveredMap.get(id) ?? null;
      return covered !== null && covered >= today;
    };
    const qualifiedInvitees = new Set(
      input.links
        .filter(
          (link) => link.referrerId === userId && link.status === "qualified",
        )
        .map((link) => link.referredId),
    );
    // `referrals.referred_id` es UNIQUE: el vínculo es uno por invitado, así que
    // solo la invitación MÁS RECIENTE de cada persona (las filas vienen ordenadas
    // por activación descendente) lleva la marca de "suma descuento".
    const flagged = new Set<number>();
    const suma = (id: number): boolean => {
      if (flagged.has(id) || !qualifiedInvitees.has(id) || !isCovered(id)) {
        return false;
      }
      flagged.add(id);
      return true;
    };

    const fromInvitations = rows.map((row): InviteeView => {
      const purchased = Number(row.purchased) === 1;
      return {
        invitationId: row.id,
        userId: row.invitedUserId,
        ...nameParts(row.firstName, row.lastName),
        state: deriveInviteeState({
          purchased,
          membershipCoveredUntil: coveredMap.get(row.invitedUserId) ?? null,
          today,
          accessExpiresOn: row.accessExpiresOn,
          classesBudget: row.classesBudget,
          classesRemaining: row.classesRemaining,
        }),
        accessesUsed: accessesUsed(row.classesBudget, row.classesRemaining),
        accessesBudget: row.classesBudget,
        activatedAt: row.activatedAt.toISOString(),
        accessExpiresOn: row.accessExpiresOn,
        sumaDescuento: suma(row.invitedUserId),
        source: "invitation",
      };
    });

    const fromLegacy = legacyLinks.map((link): InviteeView => {
      const name = legacyNames.get(link.referredId);
      return {
        invitationId: null,
        userId: link.referredId,
        firstName: name?.firstName ?? "",
        lastInitial: name?.lastInitial ?? "",
        state: deriveInviteeState({
          purchased: link.status === "qualified",
          membershipCoveredUntil: coveredMap.get(link.referredId) ?? null,
          today,
          accessExpiresOn: null,
          classesBudget: null,
          classesRemaining: null,
        }),
        accessesUsed: null,
        accessesBudget: null,
        activatedAt: null,
        accessExpiresOn: null,
        sumaDescuento: suma(link.referredId),
        source: "legacy_link",
      };
    });

    return [...fromInvitations, ...fromLegacy];
  }

  /**
   * Invitaciones `active` del usuario como invitador, la más reciente primero. Una
   * sola query: invitado (nombre), sub de accesos (`classes_*`) y el EXISTS de "compró".
   */
  private async loadInviterInvitations(
    ctx: TenantContext,
    userId: number,
  ): Promise<InviterInvitationRow[]> {
    const i = schema.invitations;
    return this.db
      .select({
        id: i.id,
        invitedUserId: i.invitedUserId,
        activatedAt: i.activatedAt,
        accessExpiresOn: i.accessExpiresOn,
        classesBudget: schema.subscriptions.classesBudget,
        classesRemaining: schema.subscriptions.classesRemaining,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        // Fase 194 (RESEARCH §Patrón 7): "compró" = sub paga no-trial creada desde
        // la activación de esta invitación. Correlacionado a invitations (literal).
        purchased: sql<number>`EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.tenant_id = ${ctx.tenantId}
            AND s.user_id = invitations.invited_user_id
            AND s.created_at >= invitations.activated_at
            AND s.price_paid > 0
            AND ${notTrialPlanSql("s")}
        )`,
      })
      .from(i)
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, i.invitedUserId),
        ),
      )
      .leftJoin(
        schema.subscriptions,
        and(
          tenantWhere(schema.subscriptions, ctx),
          eq(schema.subscriptions.id, i.subscriptionId),
        ),
      )
      .where(
        and(
          tenantWhere(i, ctx),
          eq(i.inviterId, userId),
          eq(i.status, "active"),
        ),
      )
      .orderBy(desc(i.activatedAt), desc(i.id));
  }

  /** `userId -> { firstName, lastInitial }` en una query (solo no sensibles). */
  private async loadNames(
    ctx: TenantContext,
    userIds: number[],
  ): Promise<Map<number, { firstName: string; lastInitial: string }>> {
    const result = new Map<
      number,
      { firstName: string; lastInitial: string }
    >();
    if (userIds.length === 0) return result;
    const rows = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, ctx), inArray(schema.users.id, userIds)),
      );
    for (const row of rows) {
      result.set(row.id, nameParts(row.firstName, row.lastName));
    }
    return result;
  }

  // ─── "Invitado por" (el usuario como invitado) ──────────────────────────

  /**
   * Invitación `active` más reciente donde el usuario es el INVITADO, con la etapa
   * del lead (`deriveLeadStage`, `today` en la tz de su sede) y las sedes donde
   * entrenó. `null` si nadie lo invitó.
   */
  private async buildInvitedBy(
    ctx: TenantContext,
    userId: number,
    today: string,
  ): Promise<InvitedByView | null> {
    const i = schema.invitations;
    const [row] = await this.db
      .select({
        id: i.id,
        inviterId: i.inviterId,
        channel: i.channel,
        activatedAt: i.activatedAt,
        accessExpiresOn: i.accessExpiresOn,
        convertedAt: i.convertedAt,
        classesBudget: schema.subscriptions.classesBudget,
        classesRemaining: schema.subscriptions.classesRemaining,
        inviterFirstName: schema.users.firstName,
        inviterLastName: schema.users.lastName,
      })
      .from(i)
      .innerJoin(
        schema.users,
        and(tenantWhere(schema.users, ctx), eq(schema.users.id, i.inviterId)),
      )
      .leftJoin(
        schema.subscriptions,
        and(
          tenantWhere(schema.subscriptions, ctx),
          eq(schema.subscriptions.id, i.subscriptionId),
        ),
      )
      .where(
        and(
          tenantWhere(i, ctx),
          eq(i.invitedUserId, userId),
          eq(i.status, "active"),
        ),
      )
      .orderBy(desc(i.activatedAt), desc(i.id))
      .limit(1);
    if (!row) return null;

    const branches = await loadTrainedBranches(this.db, ctx, [row.id]);
    return {
      inviterId: row.inviterId,
      inviterName: [row.inviterFirstName, row.inviterLastName]
        .filter(Boolean)
        .join(" ")
        .trim(),
      activatedAt: row.activatedAt.toISOString(),
      accessesUsed: accessesUsed(row.classesBudget, row.classesRemaining) ?? 0,
      accessesBudget: row.classesBudget ?? 0,
      accessExpiresOn: row.accessExpiresOn,
      stage: deriveLeadStage({
        converted: row.convertedAt !== null,
        today,
        accessExpiresOn: row.accessExpiresOn,
        classesBudget: row.classesBudget,
        classesRemaining: row.classesRemaining,
      }),
      branchesTrained: branches.get(row.id) ?? [],
      channel: row.channel,
    };
  }
}

/** Nombre de pila + inicial del apellido en mayúscula (T-194-63). */
function nameParts(
  firstName: string | null,
  lastName: string | null,
): { firstName: string; lastInitial: string } {
  const initial = (lastName ?? "").trim().charAt(0).toUpperCase();
  return { firstName: (firstName ?? "").trim(), lastInitial: initial };
}
