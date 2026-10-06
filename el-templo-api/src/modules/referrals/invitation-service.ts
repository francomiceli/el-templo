// Módulo: referrals — InvitationService, mitad de LECTURA/ASERCIÓN (Fase 194-08)
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
// POR QUÉ UN SERVICIO CON EXECUTOR
// --------------------------------
// La app muestra la elegibilidad ANTES de activar (`GET .../eligibility`) y la
// activación (194-09) corre las MISMAS funciones dentro de una transacción con
// lock. Por eso toda función acepta un `exec` (`db` o `tx`, default `this.db`).
// Los parámetros (N meses, N días, cupo) salen de `getInvitationSettings`, que
// siempre lee por el pool: son filas de `tenant_settings` que la activación no
// escribe, así que no necesitan estar dentro de la transacción.
//
// La carrera (dos activaciones simultáneas con el mismo cupo) NO se resuelve
// acá: es del lock de 194-09. Estas funciones solo LEEN.
//
// AISLAMIENTO: toda query lleva `tenantWhere`. `tenant_id` sale del `ctx` del
// servidor, nunca del body.
import {
  and,
  eq,
  gte,
  inArray,
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
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../shared/errors";
import {
  addBusinessDays,
  businessDaysHorizon,
  loadHolidaySet,
} from "../shared/business-days";
import { addDays, todayInTz } from "../shared/date-utils";
import { normalizePhone, sanitizePhoneForStorage } from "../shared/phone";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { deriveMembershipCoveredUntil } from "../subscriptions/service";
import type { SubscriptionService } from "../subscriptions/service";
import { getInvitationSettings } from "./invitation-settings";
import { ReferralService } from "./service";
import {
  ACTIVATION_FAILED_REASON,
  InvitationRuleError,
  INELIGIBLE_MESSAGES,
  type ActivatedInvitation,
  type ActivateInvitationInput,
  type EligibilityResult,
  type InvitationIneligibleReason,
  type InviteeEligibilityInput,
  type InviterQuota,
  type VoidInvitationInput,
} from "./invitation-types";

type DbInstance = MySql2Database<typeof schema>;
/** Pool o handle de transacción (mismo patrón que `programs/enrollment-service`). */
export type InvitationExecutor = DbInstance | TxHandle;

/** Tope de fecha de "sin vencimiento": se usa como `COALESCE` en el SQL de D-11. */
const OPEN_ENDED_DATE = "9999-12-31";

/**
 * Resta `months` meses a una fecha `YYYY-MM-DD` (pura, sin zona horaria). Si el
 * día no existe en el mes destino se recorta al último día (31-ago - 6 meses =
 * 28/29-feb). Se opera sobre el string de `todayInTz` para no mezclar husos.
 */
export function subtractMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Mes en base 0 acumulado: así restar cruza años sin casos especiales.
  const total = y * 12 + (m - 1) - months;
  const year = Math.floor(total / 12);
  const month = total - year * 12; // 0..11
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const pad = (n: number, w: number): string => String(n).padStart(w, "0");
  return `${pad(year, 4)}-${pad(month + 1, 2)}-${pad(day, 2)}`;
}

export class InvitationService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    /** Lo usa la activación (194-09) para asignar el plan Invitación. */
    readonly subscriptionService?: SubscriptionService,
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

  private async computeQuota(
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

  private async findIneligibleReason(
    ctx: TenantContext,
    input: InviteeEligibilityInput,
    exec: InvitationExecutor,
  ): Promise<InvitationIneligibleReason | null> {
    if (input.inviterId === input.invitedUserId) return "self_invite";

    const identity = await this.findIdentityReason(ctx, input, exec);
    if (identity !== null) return identity;

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

    const dni = input.dni?.trim();
    if (dni) {
      const [dniOwner] = await exec
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            tenantWhere(schema.users, ctx),
            ne(schema.users.id, input.invitedUserId),
            isNull(schema.users.deletedAt),
            eq(schema.users.dni, dni),
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
    const personMatch: SQL[] = [
      eq(i.invitedUserId, input.invitedUserId),
      eq(i.invitedPhoneLast10, normalizePhone(input.phone)),
    ];
    const dni = input.dni?.trim();
    if (dni) {
      const byDni = and(isNotNull(i.invitedDni), eq(i.invitedDni, dni));
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

  // ─── Activación (D-06) y anulación (D-04) ────────────────────────────────

  /**
   * Activa una invitación para los dos canales (app `self_service` y recepción
   * `assisted`): las MISMAS reglas, el mismo servicio.
   *
   * Paso 1 (sin tx)  resuelve al invitador. El canal app solo acepta `code`
   *                  (T-194-30); el asistido, `inviterId` o `code`.
   * Paso 2 (tx corta) lockea invitador + invitado `FOR UPDATE` en orden de id
   *                  (T-194-29), revalida cupo/elegibilidad bajo el lock e
   *                  INSERTA la fila `invitations` (D-10: COUNT + INSERT
   *                  atómicos). Commit: la fila ya consume cupo y ventana.
   * Paso 3 (tx)      muda al invitado a la sede física elegida (Pitfall 1),
   *                  guarda teléfono/DNI, lo pasa a `prueba` con historial
   *                  (D-01) y lo deja `en_seguimiento` como lead (D-18).
   * Paso 4           asigna el plan Invitación del país con $0 y vigencia real
   *                  de N días hábiles (`assignInvitationPlan`, D-02/D-15).
   * Paso 5           si 3 o 4 fallan, la fila queda `voided` con
   *                  `activation_failed` (T-194-33) y el error se propaga.
   *                  Nunca se borra (D-04).
   * `assignPlan` maneja su propia tx y no acepta una externa (mismo motivo que
   * `partner-week-service`), por eso 3-4 no entran en la tx del paso 2.
   */
  async activate(
    ctx: TenantContext,
    input: ActivateInvitationInput,
  ): Promise<ActivatedInvitation> {
    const subscriptionService = this.requireSubscriptionService();

    // Paso 1
    const inviterId = await this.resolveInviterId(ctx, input);
    if (inviterId === input.invitedUserId) {
      throw new InvitationRuleError("self_invite");
    }
    const phoneLast10 = normalizePhone(input.phone ?? "");
    const phoneStored = sanitizePhoneForStorage(input.phone ?? "");
    if (phoneLast10.length === 0)
      throw new InvitationRuleError("phone_required");
    const dniInput = input.dni?.trim() ? input.dni.trim() : null;
    if (dniInput !== null && dniInput.length > 20) {
      throw new BadRequestError("El DNI es demasiado largo");
    }

    // Paso 2
    const prepared = await this.db.transaction(async (tx) => {
      // Fase 194 D-10 / T-194-29: lock de filas de `users` en orden fijo de id
      // (evita deadlock entre dos activaciones). NINGUNA lectura previa en esta
      // tx: el snapshot de lectura consistente nace DESPUÉS del lock, así que
      // quien espera ve el COUNT de la activación que lo precedió.
      const [lo, hi] =
        inviterId < input.invitedUserId
          ? [inviterId, input.invitedUserId]
          : [input.invitedUserId, inviterId];
      await tx.execute(
        sql`SELECT id FROM users WHERE tenant_id = ${ctx.tenantId} AND id IN (${lo}, ${hi}) ORDER BY id FOR UPDATE`,
      );

      const people = await tx
        .select({
          id: schema.users.id,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          dni: schema.users.dni,
          branchId: schema.users.branchId,
        })
        .from(schema.users)
        .where(
          and(
            tenantWhere(schema.users, ctx),
            inArray(schema.users.id, [inviterId, input.invitedUserId]),
            isNull(schema.users.deletedAt),
          ),
        );
      const invitee = people.find((p) => p.id === input.invitedUserId);
      if (!invitee) throw new NotFoundError("Alumno no encontrado");

      // D-10 + D-10d (lanza inviter_not_found | inviter_not_member | cupo).
      const quota = await this.assertInviterCanInvite(ctx, inviterId, tx);
      const inviter = people.find((p) => p.id === inviterId);
      if (!inviter) throw new InvitationRuleError("inviter_not_found");

      // T-194-31: la sede sale del tenant (404 igual que una inexistente) y
      // tiene que ser física.
      const branch = await this.loadBranch(ctx, input.branchId, tx);
      if (branch.isVirtual) {
        throw new BadRequestError(
          "Elegí una sede física para activar la invitación",
        );
      }
      // Un invitado que ya entrena en una sede FÍSICA de otro país no se
      // muda de país por una invitación. Uno en la sede virtual (el registro
      // sin sede) no tiene país propio: elige libremente.
      const current = await this.loadBranch(ctx, invitee.branchId, tx);
      if (!current.isVirtual && current.country !== branch.country) {
        throw new BadRequestError("La sede elegida es de otro país");
      }

      // D-11 + D-12 + identidad, bajo el lock.
      await this.assertInviteeEligible(
        ctx,
        {
          inviterId,
          invitedUserId: input.invitedUserId,
          phone: input.phone,
          dni: dniInput,
          branchId: branch.id,
        },
        tx,
      );

      // D-15: vigencia en días hábiles de la sede elegida (lun-sáb sin
      // feriados de SU país), contando desde el día siguiente (D-26d).
      const settings = await getInvitationSettings(this.db, ctx, this.log);
      const accessStartsOn = todayInTz(branch.timezone);
      const holidaySet = await loadHolidaySet(
        this.db,
        ctx,
        branch.country,
        accessStartsOn,
        addDays(
          accessStartsOn,
          businessDaysHorizon(settings.accessBusinessDays),
        ),
      );
      const accessExpiresOn = addBusinessDays(
        accessStartsOn,
        settings.accessBusinessDays,
        holidaySet,
      );

      const [row] = await tx
        .insert(schema.invitations)
        .values(
          tenantValues(ctx, {
            inviterId,
            invitedUserId: input.invitedUserId,
            channel: input.channel,
            status: "active" as const,
            quotaMonth: quota.month,
            accessStartsOn,
            accessExpiresOn,
            branchId: branch.id,
            invitedPhoneLast10: phoneLast10,
            invitedDni: invitee.dni || dniInput,
            createdBy: input.channel === "assisted" ? input.createdBy : null,
          }),
        )
        .$returningId();

      return {
        invitationId: row.id,
        branch,
        accessStartsOn,
        accessExpiresOn,
        inviterName:
          [inviter.firstName, inviter.lastName]
            .filter((s): s is string => Boolean(s))
            .join(" ") || "un socio",
      };
    });

    this.log.info(
      {
        invitationId: prepared.invitationId,
        inviterId,
        invitedUserId: input.invitedUserId,
        channel: input.channel,
      },
      "invitaciones: invitación registrada, completando datos y accesos",
    );

    // Pasos 3-5
    let subscriptionId: number | null = null;
    try {
      // Paso 3
      await this.applyInviteeData(ctx, input.invitedUserId, {
        branchId: prepared.branch.id,
        phone: phoneStored,
        dni: dniInput,
      });

      // Paso 4: plan por país de la sede, server-side (T-194-31); $0 con razón
      // y un `adminId` que sea un users.id real (FK de audit_log): el staff, o
      // el propio invitado en el canal app (self-assignment).
      const plan = await subscriptionService.findInvitationPlan(
        ctx,
        prepared.branch.country,
      );
      const sub = await subscriptionService.assignInvitationPlan(
        ctx,
        input.invitedUserId,
        {
          planId: plan.id,
          branchId: prepared.branch.id,
          startDate: prepared.accessStartsOn,
          endDateOverride: prepared.accessExpiresOn,
          priceTypeApplied: "regular",
          paymentMethod: "cash", // valor neutro: con $0 no se registra cobro
          priceOverrideAmount: 0, // camino canónico a membership_kind='bonificada'
          priceOverrideReason: `Invitación de ${prepared.inviterName}`,
        },
        input.createdBy ?? input.invitedUserId,
      );
      subscriptionId = sub.id;

      await this.db
        .update(schema.invitations)
        .set({ subscriptionId: sub.id })
        .where(
          and(
            tenantWhere(schema.invitations, ctx),
            eq(schema.invitations.id, prepared.invitationId),
          ),
        );

      return {
        invitationId: prepared.invitationId,
        subscriptionId: sub.id,
        accessExpiresOn: prepared.accessExpiresOn,
        classesBudget: sub.classesBudget,
        branchId: prepared.branch.id,
      };
    } catch (err: unknown) {
      // Paso 5 (T-194-33): una activación rota no puede consumir cupo ni ventana.
      await this.compensateFailedActivation(
        ctx,
        prepared.invitationId,
        input.invitedUserId,
        subscriptionId,
      );
      this.log.error(
        {
          err: err instanceof Error ? err.message : String(err),
          invitationId: prepared.invitationId,
          invitedUserId: input.invitedUserId,
        },
        "invitaciones: la activación falló, la invitación quedó anulada (activation_failed)",
      );
      throw err;
    }
  }

  /**
   * Anulación manual por staff (D-04): `voided` + `voided_by/at/reason`, sin
   * DELETE. Libera el cupo del invitador y la ventana del invitado (ambos
   * cuentan solo `active`). Si la sub de accesos sigue vigente la cierra
   * `completed` por el mismo helper que la compra (D-07) y recalcula el status;
   * si el invitado ya compró (la sub ya está `completed`) no toca subs. Sin
   * membresía real el `users.status` no se baja: queda como estaba (`prueba`).
   */
  async voidInvitation(
    ctx: TenantContext,
    invitationId: number,
    input: VoidInvitationInput,
  ): Promise<void> {
    const subscriptionService = this.requireSubscriptionService();
    const reason = input.reason.trim();
    if (reason.length === 0) {
      throw new BadRequestError("Indicá el motivo de la anulación");
    }
    if (reason.length > 64) {
      throw new BadRequestError(
        "El motivo de la anulación admite hasta 64 caracteres",
      );
    }

    await this.db.transaction(async (tx) => {
      const [invitation] = await tx
        .select({
          id: schema.invitations.id,
          status: schema.invitations.status,
          invitedUserId: schema.invitations.invitedUserId,
          subscriptionId: schema.invitations.subscriptionId,
        })
        .from(schema.invitations)
        .where(
          and(
            tenantWhere(schema.invitations, ctx),
            eq(schema.invitations.id, invitationId),
          ),
        )
        .limit(1)
        .for("update");
      // Otro gimnasio se ve igual que una inexistente (D-06 de tenancy).
      if (!invitation) throw new NotFoundError("Invitación no encontrada");
      if (invitation.status !== "active") {
        throw new ConflictError("La invitación ya está anulada");
      }

      await tx
        .update(schema.invitations)
        .set({
          status: "voided",
          voidedAt: new Date(),
          voidedBy: input.voidedBy,
          voidReason: reason,
        })
        .where(
          and(
            tenantWhere(schema.invitations, ctx),
            eq(schema.invitations.id, invitationId),
            eq(schema.invitations.status, "active"),
          ),
        );

      if (invitation.subscriptionId !== null) {
        const closed = await subscriptionService.closeInvitationAccess(
          ctx,
          invitation.invitedUserId,
          [invitation.subscriptionId],
          tx,
          { recompute: true },
        );
        this.log.info(
          { invitationId, closedSubscriptions: closed },
          "invitaciones: invitación anulada por staff",
        );
      }
    });
  }

  // ─── Helpers privados ────────────────────────────────────────────────────

  private requireSubscriptionService(): SubscriptionService {
    if (!this.subscriptionService) {
      throw new Error(
        "InvitationService: falta SubscriptionService para activar/anular invitaciones",
      );
    }
    return this.subscriptionService;
  }

  /**
   * Invitador de la activación. Fase 194 T-194-30: el canal app NUNCA acepta
   * `inviterId` del cliente; solo el `code` que se resuelve acá en el servidor.
   */
  private async resolveInviterId(
    ctx: TenantContext,
    input: ActivateInvitationInput,
  ): Promise<number> {
    if (input.channel === "self_service") {
      if (input.inviterId !== undefined) {
        throw new BadRequestError(
          "El canal de la app no admite elegir el invitador",
        );
      }
      if (!input.code?.trim()) {
        throw new BadRequestError("Falta el código de invitación");
      }
    } else if (input.inviterId === undefined && !input.code?.trim()) {
      throw new BadRequestError("Indicá quién hace la invitación");
    }
    if (input.inviterId !== undefined) return input.inviterId;
    const id = await new ReferralService(this.db, this.log).resolveReferralCode(
      ctx,
      (input.code ?? "").trim(),
    );
    if (id === null) throw new InvitationRuleError("inviter_not_found");
    return id;
  }

  /** Sede del tenant (404 si no existe o es de otro gimnasio). */
  private async loadBranch(
    ctx: TenantContext,
    branchId: number,
    exec: InvitationExecutor,
  ): Promise<{
    id: number;
    country: string;
    timezone: string;
    isVirtual: boolean;
  }> {
    const [branch] = await exec
      .select({
        id: schema.branches.id,
        country: schema.branches.country,
        timezone: schema.branches.timezone,
        isVirtual: schema.branches.isVirtual,
      })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, branchId),
        ),
      )
      .limit(1);
    if (!branch) throw new NotFoundError("Sede no encontrada");
    return branch;
  }

  /**
   * Paso 3 de la activación: sede física, teléfono/DNI, `prueba` con historial
   * `source='invitation'` (solo si el status cambia) y lead `en_seguimiento`
   * (D-18) respetando un `lead_status_source='manual'`.
   */
  private async applyInviteeData(
    ctx: TenantContext,
    userId: number,
    data: { branchId: number; phone: string; dni: string | null },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({
          status: schema.users.status,
          branchId: schema.users.branchId,
          dni: schema.users.dni,
          leadStatusSource: schema.users.leadStatusSource,
        })
        .from(schema.users)
        .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
        .limit(1);
      if (!user) throw new NotFoundError("Alumno no encontrado");

      const changesStatus = user.status !== "prueba";
      const keepLead = user.leadStatusSource === "manual";
      await tx
        .update(schema.users)
        .set({
          phone: data.phone,
          ...(user.dni ? {} : data.dni ? { dni: data.dni } : {}),
          // Pitfall 1: la sede se muda ANTES de assignPlan. branchUpdatedAt +
          // branchSource='manual' viajan juntos (el cron de recategorización
          // no pisa una reasignación manual reciente).
          ...(user.branchId !== data.branchId
            ? {
                branchId: data.branchId,
                branchUpdatedAt: new Date(),
                branchSource: "manual" as const,
              }
            : {}),
          // D-01: freemium/inactivo/prueba -> prueba (nunca `activo`).
          ...(changesStatus ? { status: "prueba" as const } : {}),
          // D-18: alta del lead. Un lead tocado a mano no se pisa.
          ...(keepLead
            ? {}
            : {
                leadStatus: "en_seguimiento" as const,
                leadStatusSource: "auto" as const,
                purchasedPlanId: null,
              }),
        })
        .where(
          and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)),
        );

      if (changesStatus) {
        await tx.insert(schema.userStatusHistory).values(
          tenantValues(ctx, {
            userId,
            fromStatus: user.status,
            toStatus: "prueba" as const,
            source: "invitation",
          }),
        );
        this.log.info(
          { userId, fromStatus: user.status, toStatus: "prueba" },
          "user status transition recorded",
        );
      }
    });
  }

  /**
   * Paso 5: deja la fila `voided` con `activation_failed` y, si ya se había
   * creado la sub de accesos, la cierra. Best-effort: un fallo acá se loguea y
   * NO tapa el error original de la activación.
   */
  private async compensateFailedActivation(
    ctx: TenantContext,
    invitationId: number,
    invitedUserId: number,
    subscriptionId: number | null,
  ): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .update(schema.invitations)
          .set({
            status: "voided",
            voidedAt: new Date(),
            voidReason: ACTIVATION_FAILED_REASON,
          })
          .where(
            and(
              tenantWhere(schema.invitations, ctx),
              eq(schema.invitations.id, invitationId),
              eq(schema.invitations.status, "active"),
            ),
          );
        if (subscriptionId !== null && this.subscriptionService) {
          await this.subscriptionService.closeInvitationAccess(
            ctx,
            invitedUserId,
            [subscriptionId],
            tx,
            { recompute: true },
          );
        }
      });
    } catch (compensationErr: unknown) {
      this.log.error(
        {
          err:
            compensationErr instanceof Error
              ? compensationErr.message
              : String(compensationErr),
          invitationId,
        },
        "invitaciones: no se pudo anular la invitación tras una activación fallida",
      );
    }
  }

  /** Usuario (no borrado) del tenant con la tz de su sede. */
  private async loadUserWithTimezone(
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
