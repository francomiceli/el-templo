/**
 * MagicLinkService (Phase 180, D-01/D-02) — canje token→sesión.
 *
 * El corazón de la fase: `exchange(token)` convierte un magic-link `purpose:
 * 'login'` (token-service.ts, `validateMagicLinkToken`) en una sesión REAL,
 * emitida por el mismo camino canónico que `POST /api/auth/login`
 * (`auth/routes.ts` líneas ~490-651): mismo shape de `user`, mismo par
 * `accessToken`/`refreshToken` vía `RefreshTokenService`, mismos gates de
 * `deletedAt`/`staffDisabled`.
 *
 * T-180-23 (confusión de tenant en la ruta pública) — el `tenantId` de la
 * sesión NUNCA sale del payload del token (que no lo carga, T-175-02): sale
 * de la fila `campaign_sends` referenciada por `payload.sendId`, resuelta con
 * un lookup PRE-SCOPE. No hay actor/ctx posible en esta ruta pública, así que
 * ese lookup lleva la MISMA exención `tenant-safe` DUPLICADA que
 * `tracking-service.ts#getSendEmail` (comentario TS pegado al acceso para el
 * LINT + el mismo texto embebido en el `sql` del `where` para el SENTINEL de
 * runtime, que solo lee el SQL final). Acá, a diferencia de `getSendEmail`,
 * el token SÍ autoriza (D-01 revisa D-21 SOLO para `purpose:'login'`) — pero
 * el tenant se sigue resolviendo desde la BASE por el mismo motivo: no existe
 * un `ctx` anterior a esta lectura.
 *
 * T-180-25 (anti-enumeración) — TODO camino de fallo (token inválido/vencido/
 * de tracking/firma alterada, `sendId` inexistente, `userId` no coincide,
 * usuario borrado/`staffDisabled`) devuelve `null`. El caller (`routes.ts`)
 * traduce SIEMPRE al mismo 401 genérico — este servicio nunca distingue el
 * motivo hacia afuera.
 *
 * T-180-27 — el token NUNCA se loguea, ni siquiera un prefijo. Los caminos de
 * token inválido/vencido son el flujo NORMAL de un magic link viejo (D-05):
 * severidad `warn` en toda la clase, nunca la severidad alta que llena Sentry
 * de ruido.
 */

import { and, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { appBranchName } from "../shared/app-branch-name";
import { RefreshTokenService } from "../auth/refresh-token-service";
import { validateMagicLinkToken } from "./token-service";
import { destinationForSegment } from "./segment-destinations";
import type { CampaignSegment } from "./types";
import type { MagicLinkDestination } from "./segment-destinations";

/** El mismo shape de `user` que devuelve `POST /api/auth/login` (auth/routes.ts). */
export interface MagicLinkSessionUser {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  level: string;
  branchId: number;
  branchName: string | null;
  branchIsVirtual: boolean;
  branchCountry: string;
  gender: string | null;
  dateOfBirth: string | null;
  onboardingCompleted: boolean;
}

export interface MagicLinkExchangeResult {
  /** Legacy 7d token (compat, mismo idioma que login). */
  token: string;
  /** Access token corto (30m). */
  accessToken: string;
  /** Refresh opaco (30d sliding), emitido por `RefreshTokenService.issue`. */
  refreshToken: string;
  user: MagicLinkSessionUser;
  /** Destino simbólico derivado del segmento persistido de la campaña (D-13). */
  destination: MagicLinkDestination;
}

export class MagicLinkService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private jwt: FastifyInstance["jwt"],
    private accessTokenExpiresIn: string,
  ) {}

  /**
   * Canjea un magic-link `purpose:'login'` por una sesión completa (D-01).
   * Devuelve `null` para TODO camino de fallo — nunca distingue el motivo
   * (T-180-25, anti-enumeración). Nunca lanza.
   */
  async exchange(token: string): Promise<MagicLinkExchangeResult | null> {
    const payload = validateMagicLinkToken(token);
    if (!payload) {
      // Camino normal de un link viejo/vencido/de tracking (D-05) — warn, no
      // error (evita ruido en Sentry). Nunca loguear el string firmado
      // (T-180-27): ni el objeto ni el mensaje llevan la variable `token`.
      this.log.warn(
        {},
        "magic-link exchange: firma invalida o no autoriza login",
      );
      return null;
    }

    // T-175-02 / T-180-23: lookup PRE-SCOPE por `sendId` — no hay ctx posible
    // antes de esta lectura, que es justamente la que lo deriva. Exención
    // `tenant-safe` DUPLICADA: comentario TS (LINT) + embebida en el SQL
    // (SENTINEL, que solo lee el SQL final que llega al pool).
    /* tenant-safe: sendId del token firmado con purpose:'login' (D-01), resuelve el tenant antes de tener ctx — pre-scope, no hay actor en esta ruta publica (T-175-02/T-180-23) */
    const [send] = await this.db
      .select({
        tenantId: schema.campaignSends.tenantId,
        userId: schema.campaignSends.userId,
        campaignId: schema.campaignSends.campaignId,
      })
      .from(schema.campaignSends)
      .where(
        sql`/* tenant-safe: sendId del token firmado con purpose:'login' (D-01), resuelve el tenant antes de tener ctx — pre-scope, no hay actor en esta ruta publica (T-175-02/T-180-23) */ ${schema.campaignSends.id} = ${payload.sendId}`,
      )
      .limit(1);

    if (!send) {
      this.log.warn(
        { sendId: payload.sendId },
        "magic-link exchange: sendId no resuelve ningun campaign_sends",
      );
      return null;
    }

    // El userId del token tiene que coincidir con el dueño real del send —
    // sin este chequeo, un token forjado con un userId ajeno pero un sendId
    // propio (T-180-22) podría intentar suplantar a otro socio.
    if (send.userId !== payload.userId) {
      this.log.warn(
        { sendId: payload.sendId },
        "magic-link exchange: userId del token no coincide con campaign_sends.user_id",
      );
      return null;
    }

    // ÚNICO ctx del handler, derivado de la fila YA encontrada (mismo patrón
    // que auth/routes.ts login, T-173-15) — nunca del payload del token.
    const ctx: TenantContext = { tenantId: send.tenantId };

    const [user] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        role: schema.users.role,
        level: schema.users.level,
        branchId: schema.users.branchId,
        gender: schema.users.gender,
        dateOfBirth: schema.users.dateOfBirth,
        deletedAt: schema.users.deletedAt,
        staffDisabled: schema.users.staffDisabled,
      })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, payload.userId),
        ),
      )
      .limit(1);

    if (!user) {
      this.log.warn(
        { sendId: payload.sendId },
        "magic-link exchange: userId no resuelve en el tenant del send",
      );
      return null;
    }

    // Mismos gates que el login canónico (auth/routes.ts).
    if (user.deletedAt) {
      this.log.warn(
        { sendId: payload.sendId },
        "magic-link exchange: usuario eliminado",
      );
      return null;
    }
    if (user.role !== "member" && user.staffDisabled === true) {
      this.log.warn(
        { sendId: payload.sendId },
        "magic-link exchange: cuenta de staff desactivada",
      );
      return null;
    }

    // Branch lookup por FK ya resuelta (mismo patrón tenant-safe que el login).
    /* tenant-safe: branches joineado por FK (user.branchId) a una fila de users ya resuelta arriba, no expone otro gimnasio (D4) */
    const [branchRow] = await this.db
      .select({
        name: schema.branches.name,
        isVirtual: schema.branches.isVirtual,
        country: schema.branches.country,
      })
      .from(schema.branches)
      .where(
        sql`/* tenant-safe: branches joineado por FK (user.branchId) a una fila de users ya resuelta arriba, no expone otro gimnasio (D4) */ ${schema.branches.id} = ${user.branchId}`,
      )
      .limit(1);

    const branchName = branchRow?.name ?? null;
    const branchIsVirtual = branchRow?.isVirtual ?? false;
    const branchCountry = branchRow?.country ?? "AR";

    const profileRows = await this.db
      .select({ completedAt: schema.memberProfiles.onboardingCompletedAt })
      .from(schema.memberProfiles)
      .where(
        and(
          tenantWhere(schema.memberProfiles, ctx),
          eq(schema.memberProfiles.userId, user.id),
        ),
      )
      .limit(1);
    const onboardingCompleted =
      profileRows.length > 0 && profileRows[0].completedAt !== null;

    // Segmento persistido de la campaña (D-13) → destino simbólico.
    const [campaign] = await this.db
      .select({ segment: schema.campaigns.segment })
      .from(schema.campaigns)
      .where(
        and(
          tenantWhere(schema.campaigns, ctx),
          eq(schema.campaigns.id, send.campaignId),
        ),
      )
      .limit(1);
    const destination = destinationForSegment(
      (campaign?.segment as CampaignSegment | undefined) ??
        "freemium_elegibles",
    );

    // Emisión de sesión: EXACTAMENTE el mismo bloque que el login canónico.
    const jwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const legacyToken = this.jwt.sign(jwtPayload);
    const accessToken = this.jwt.sign(jwtPayload, {
      expiresIn: this.accessTokenExpiresIn,
    });
    const refreshTokenService = new RefreshTokenService(this.db, this.log);
    const refreshToken = await refreshTokenService.issue(user.id);

    return {
      token: legacyToken,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        level: user.level,
        branchId: user.branchId,
        branchName:
          user.role === "member"
            ? appBranchName(branchName, ctx.tenantId)
            : branchName,
        branchIsVirtual,
        branchCountry,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        onboardingCompleted,
      },
      destination,
    };
  }
}
