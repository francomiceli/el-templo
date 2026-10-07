// Módulo: referrals — InvitationRules, las REGLAS anti-abuso (Fase 194-08, partido en 194-32)
//
// Reglas anti-abuso del programa de Invitaciones como funciones componibles:
//   - D-10  cupo mensual del invitador (cuenta solo invitaciones `active`)
//   - D-10d el invitador necesita membresía vigente (cobertura de MEMBRESÍA,
//           que ignora los planes `is_trial`: D-03)
//   - D-11  el invitado nunca fue socio o su última membresía terminó hace >= N meses
//   - D-12  ninguna invitación `active` en los últimos N días para la MISMA PERSONA
//           (mismo usuario, mismo teléfono o mismo DNI, aunque sea otra cuenta)
//   - identificación: teléfono obligatorio, y ni el teléfono ni el DNI pueden
//           pertenecer a OTRO usuario del tenant
//
// POR QUÉ UN EXECUTOR
// -------------------
// La app muestra la elegibilidad ANTES de activar (`GET .../eligibility`) y la
// activación (194-09) corre las MISMAS funciones dentro de una transacción con
// lock. Por eso toda función acepta un `exec` (`db` o `tx`, default `this.db`).
// Los parámetros (N meses, N días, cupo) salen de `getInvitationSettings`, que
// siempre lee por el pool: son filas de `tenant_settings` que la activación no
// escribe, así que no necesitan estar dentro de la transacción.
//
// La carrera (dos activaciones simultáneas con el mismo cupo) NO se resuelve
// acá: es del lock de la activación (`InvitationService.activate`). Estas
// funciones solo LEEN. Este archivo NO importa `invitation-service` (la
// orquestación depende de las reglas, nunca al revés).
//
// AISLAMIENTO: toda query lleva `tenantWhere`. `tenant_id` sale del `ctx` del
// servidor, nunca del body.
import {
  and,
  eq,
  gte,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  count,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type { TxHandle } from "../finance/balance-service";
import { NotFoundError } from "../shared/errors";
import { subtractMonths, todayInTz } from "../shared/date-utils";
import { DNI_NORMALIZE_SQL_PATTERN, normalizeDni } from "../shared/dni";
import { normalizePhone } from "../shared/phone";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { deriveMembershipCoveredUntil } from "../subscriptions/coverage";
import { getInvitationSettings } from "./invitation-settings";
import {
  InvitationRuleError,
  INELIGIBLE_MESSAGES,
  type EligibilityResult,
  type InvitationIneligibleReason,
  type InviteeEligibilityInput,
  type InviterQuota,
} from "./invitation-types";

type DbInstance = MySql2Database<typeof schema>;
/** Pool o handle de transacción (mismo patrón que `programs/enrollment-service`). */
export type InvitationExecutor = DbInstance | TxHandle;

/** Tope de fecha de "sin vencimiento": se usa como `COALESCE` en el SQL de D-11. */
const OPEN_ENDED_DATE = "9999-12-31";

export class InvitationRules {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  // ─── Cupo del invitador (D-10) y membresía vigente (D-10d) ──────────────

  /**
   * Cupo del mes en curso del invitador: `limit` de settings (default 2), `used`
   * = invitaciones `active` con `quota_month` = mes actual en la tz de SU sede.
   * Las `voided` no cuentan; no acumula meses anteriores.
   */
  async getInviterQuota(
    ctx: TenantContext,
    inviterId: number,
    exec: InvitationExecutor = this.db,
  ): Promise<InviterQuota> {
    const inviter = await this.loadUserWithTimezone(ctx, inviterId, exec);
    if (!inviter) throw new InvitationRuleError("inviter_not_found");
    return this.computeQuota(ctx, inviterId, inviter.timezone, exec);
  }

  /**
   * Aserción de D-10d + D-10: el invitador existe, tiene membresía vigente
   * (cobertura de membresía >= hoy en la tz de su sede, sin contar `is_trial`) y
   * le queda cupo este mes. Devuelve el cupo para que el llamador lo reuse.
   */
  async assertInviterCanInvite(
    ctx: TenantContext,
    inviterId: number,
    exec: InvitationExecutor = this.db,
  ): Promise<InviterQuota> {
    const inviter = await this.loadUserWithTimezone(ctx, inviterId, exec);
    if (!inviter) throw new InvitationRuleError("inviter_not_found");

    // Fase 194 D-10d: "activo" = cobertura de MEMBRESÍA vigente. Un invitador
    // que solo tiene accesos de invitación (plan is_trial) no puede invitar.
    const coveredUntil = await deriveMembershipCoveredUntil(
      exec,
      inviterId,
      ctx,
    );
    if (coveredUntil === null || coveredUntil < todayInTz(inviter.timezone)) {
      throw new InvitationRuleError("inviter_not_member");
    }

    const quota = await this.computeQuota(
      ctx,
      inviterId,
      inviter.timezone,
      exec,
    );
    if (quota.remaining <= 0) {
      throw new InvitationRuleError("inviter_quota_exhausted");
    }
    return quota;
  }

  /**
   * Cupo del mes de la tz dada (público desde 194-19: el overview ya tiene la tz
   * del usuario y no necesita recargarlo con `getInviterQuota`).
   */
  async computeQuota(
    ctx: TenantContext,
    inviterId: number,
    timezone: string,
    exec: InvitationExecutor,
  ): Promise<InviterQuota> {
    const settings = await getInvitationSettings(this.db, ctx, this.log);
    // Fase 194 D-10: el mes de cupo es el calendario de la sede del INVITADOR.
    const month = todayInTz(timezone).slice(0, 7);
    const [row] = await exec
      .select({ used: count() })
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, ctx),
          eq(schema.invitations.inviterId, inviterId),
          eq(schema.invitations.quotaMonth, month),
          eq(schema.invitations.status, "active"),
        ),
      );
    const used = Number(row?.used ?? 0);
    const limit = settings.monthlyQuota;
    return { limit, used, remaining: Math.max(0, limit - used), month };
  }

  // ─── Elegibilidad del invitado (D-11, D-12) e identificación ────────────

  /**
   * Evalúa al invitado SIN lanzar. Orden fijo, corta en la primera falla:
   * `self_invite` -> identificación (`phone_required`/`phone_taken`/`dni_taken`)
   * -> D-11 (historial de membresía) -> D-12 (invitación reciente por persona).
   * No consulta reservas: la SP comercial no bloquea (D-12).
   */
  async evaluateInviteeEligibility(
    ctx: TenantContext,
    input: InviteeEligibilityInput,
    exec: InvitationExecutor = this.db,
  ): Promise<EligibilityResult> {
    const reason = await this.findIneligibleReason(ctx, input, exec);
    return {
      eligible: reason === null,
      reason,
      message: reason === null ? null : INELIGIBLE_MESSAGES[reason],
    };
  }

  /** Igual que {@link evaluateInviteeEligibility} pero lanza (para la activación). */
  async assertInviteeEligible(
    ctx: TenantContext,
    input: InviteeEligibilityInput,
    exec: InvitationExecutor = this.db,
  ): Promise<void> {
    const reason = await this.findIneligibleReason(ctx, input, exec);
    if (reason !== null) throw new InvitationRuleError(reason);
  }

  /**
   * Identificación del invitado: teléfono obligatorio y ni el teléfono (últimos
   * 10 dígitos) ni el DNI pueden ser de OTRO usuario del tenant (T-194-26: no
   * "lavar" el historial con una cuenta nueva). El propio teléfono/DNI del
   * invitado no cuenta como choque. Lanza `phone_required`, `phone_taken` o
   * `dni_taken`.
   */
  async assertIdentityNotTaken(
    ctx: TenantContext,
    input: Pick<InviteeEligibilityInput, "invitedUserId" | "phone" | "dni">,
    exec: InvitationExecutor = this.db,
  ): Promise<void> {
    const reason = await this.findIdentityReason(ctx, input, exec);
    if (reason !== null) throw new InvitationRuleError(reason);
  }

  /**
   * Primera regla de elegibilidad que falla (o null). Pública para que la
   * consulta previa de la app (`previewActivation`) pueda saltear la identidad.
   */
  async findIneligibleReason(
    ctx: TenantContext,
    input: InviteeEligibilityInput,
    exec: InvitationExecutor,
    opts: { skipIdentity?: boolean } = {},
  ): Promise<InvitationIneligibleReason | null> {
    if (input.inviterId === input.invitedUserId) return "self_invite";

    // La consulta previa de la app (`previewActivation`) todavía no tiene el
    // teléfono que el socio va a tipear: la identidad se valida recién al activar.
    if (!opts.skipIdentity) {
      const identity = await this.findIdentityReason(ctx, input, exec);
      if (identity !== null) return identity;
    }

    const settings = await getInvitationSettings(this.db, ctx, this.log);
    const today = todayInTz(await this.resolveTimezone(ctx, input, exec));

    const history = await this.findHistoryReason(
      ctx,
      input.invitedUserId,
      today,
      settings.exMemberInactivityMonths,
      exec,
    );
    if (history !== null) return history;

    const recent = await this.hasRecentInvitation(
      ctx,
      input,
      settings.reinviteWindowDays,
      exec,
    );
    return recent ? "invitee_recent_invitation" : null;
  }

  private async findIdentityReason(
    ctx: TenantContext,
    input: Pick<InviteeEligibilityInput, "invitedUserId" | "phone" | "dni">,
    exec: InvitationExecutor,
  ): Promise<InvitationIneligibleReason | null> {
    // Se compara contra los últimos 10 dígitos, como `checkDuplicates`: el
    // teléfono guardado puede venir con +, espacios o guiones (self-service y
    // `createTrialMember` guardan distinto, ver shared/phone.ts).
    const last10 = normalizePhone(input.phone ?? "");
    if (last10.length === 0) return "phone_required";

    const [phoneOwner] = await exec
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, ctx),
          ne(schema.users.id, input.invitedUserId),
          isNull(schema.users.deletedAt),
          sql`RIGHT(REGEXP_REPLACE(${schema.users.phone}, '[^0-9]', ''), 10) = ${last10}`,
        ),
      )
      .limit(1);
    if (phoneOwner) return "phone_taken";

    // LO-06: se compara el documento NORMALIZADO ("12.345.678" == "12345678"), tanto
    // el tipeado como el guardado (que puede tener puntos o espacios).
    const dni = normalizeDni(input.dni);
    if (dni) {
      const [dniOwner] = await exec
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            tenantWhere(schema.users, ctx),
            ne(schema.users.id, input.invitedUserId),
            isNull(schema.users.deletedAt),
            sql`UPPER(REGEXP_REPLACE(${schema.users.dni}, ${DNI_NORMALIZE_SQL_PATTERN}, '')) = ${dni}`,
          ),
        )
        .limit(1);
      if (dniOwner) return "dni_taken";
    }
    return null;
  }

  /**
   * D-11: fin de la última cobertura de MEMBRESÍA del invitado (planes NO
   * `is_trial`). `LEAST(end_date, DATE(cancelled_at))` porque cancelar una sub
   * no toca su `end_date`; el guard `start_date <=` descarta una sub cancelada
   * antes de arrancar; las `scheduled` no cuentan.
   */
  private async findHistoryReason(
    ctx: TenantContext,
    userId: number,
    today: string,
    inactivityMonths: number,
    exec: InvitationExecutor,
  ): Promise<InvitationIneligibleReason | null> {
    // Fase 194 (regla agregada en 194-09): una sub NO-trial `scheduled` (ya
    // compró y arranca después) hace al invitado socio a todos los efectos, por
    // el mismo motivo que un socio vigente: no se lo puede invitar. Va antes
    // del historial porque `scheduled` no entra en `lastEnd` (no arrancó).
    const [scheduledMembership] = await exec
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        and(
          eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
          tenantWhere(schema.subscriptionPlans, ctx),
        ),
      )
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx),
          eq(schema.subscriptions.userId, userId),
          eq(schema.subscriptionPlans.isTrial, false),
          eq(schema.subscriptions.status, "scheduled"),
          or(
            isNull(schema.subscriptions.endDate),
            gte(schema.subscriptions.endDate, today),
          ),
        ),
      )
      .limit(1);
    if (scheduledMembership) return "invitee_is_member";

    /* tenant-safe: fragmento de expresión sobre columnas de subscriptions; solo
       viaja dentro de la query de abajo, que acota con tenantWhere. */
    const effectiveEnd = sql`LEAST(COALESCE(${schema.subscriptions.endDate}, ${OPEN_ENDED_DATE}), COALESCE(DATE(${schema.subscriptions.cancelledAt}), ${OPEN_ENDED_DATE}))`;
    const [row] = await exec
      .select({
        lastEnd: sql<string | null>`CAST(MAX(${effectiveEnd}) AS CHAR)`,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        and(
          eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
          tenantWhere(schema.subscriptionPlans, ctx),
        ),
      )
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx),
          eq(schema.subscriptions.userId, userId),
          // Fase 194 D-03/D-11: `p.is_trial = 0` — un acceso is_trial no es
          // membresía (las 1988 subs importadas de "Sesión de Prueba" quedan afuera).
          eq(schema.subscriptionPlans.isTrial, false),
          ne(schema.subscriptions.status, "scheduled"),
          sql`${schema.subscriptions.startDate} <= ${effectiveEnd}`,
        ),
      );

    const lastEnd = row?.lastEnd ?? null;
    if (lastEnd === null) return null; // nunca fue socio
    if (lastEnd >= today) return "invitee_is_member";
    // Fase 194 D-11: elegible si terminó hace >= N meses.
    return lastEnd <= subtractMonths(today, inactivityMonths)
      ? null
      : "invitee_recent_member";
  }

  /**
   * D-12: ¿hay una invitación `active` activada dentro de la ventana para la
   * misma PERSONA? Se compara contra el snapshot de la fila (user, teléfono
   * últimos 10, DNI), así que otra cuenta con el mismo teléfono/DNI también
   * bloquea. Las `voided` no cuentan.
   * La SP comercial previa NO se consulta.
   */
  private async hasRecentInvitation(
    ctx: TenantContext,
    input: InviteeEligibilityInput,
    windowDays: number,
    exec: InvitationExecutor,
  ): Promise<boolean> {
    const i = schema.invitations;
    const personMatch: SQL[] = [eq(i.invitedUserId, input.invitedUserId)];
    // Sin teléfono (consulta previa de la app) no hay nada que comparar.
    const phoneLast10 = normalizePhone(input.phone);
    if (phoneLast10.length > 0) {
      personMatch.push(eq(i.invitedPhoneLast10, phoneLast10));
    }
    const dni = normalizeDni(input.dni);
    if (dni) {
      /* tenant-safe: condición de persona sobre invitations.invited_dni; viaja dentro de la query de abajo, que acota invitations con tenantWhere. */
      const byDni = and(
        isNotNull(i.invitedDni),
        sql`UPPER(REGEXP_REPLACE(${i.invitedDni}, ${DNI_NORMALIZE_SQL_PATTERN}, '')) = ${dni}`,
      );
      if (byDni) personMatch.push(byDni);
    }
    const [row] = await exec
      .select({ id: i.id })
      .from(i)
      .where(
        and(
          tenantWhere(i, ctx),
          eq(i.status, "active"),
          sql`${i.activatedAt} >= DATE_SUB(NOW(), INTERVAL ${windowDays} DAY)`,
          or(...personMatch),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  // ─── Carga de datos que las reglas necesitan ─────────────────────────────

  /** Usuario (no borrado) del tenant con la tz de su sede. */
  async loadUserWithTimezone(
    ctx: TenantContext,
    userId: number,
    exec: InvitationExecutor,
  ): Promise<{ id: number; timezone: string } | undefined> {
    const [row] = await exec
      .select({ id: schema.users.id, timezone: schema.branches.timezone })
      .from(schema.users)
      .innerJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.users.branchId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, userId),
          isNull(schema.users.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  /** tz del "hoy" de las reglas del invitado: la sede elegida, o la suya actual. */
  private async resolveTimezone(
    ctx: TenantContext,
    input: InviteeEligibilityInput,
    exec: InvitationExecutor,
  ): Promise<string> {
    if (input.branchId !== undefined) {
      const [branch] = await exec
        .select({ timezone: schema.branches.timezone })
        .from(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, ctx),
            eq(schema.branches.id, input.branchId),
          ),
        )
        .limit(1);
      if (!branch) throw new NotFoundError("Sede no encontrada");
      return branch.timezone;
    }
    const invited = await this.loadUserWithTimezone(
      ctx,
      input.invitedUserId,
      exec,
    );
    if (!invited) throw new NotFoundError("Usuario no encontrado");
    return invited.timezone;
  }
}
