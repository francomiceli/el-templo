// Módulo: referrals — InvitationService, ORQUESTACIÓN (Fase 194-08/09/10, partido en 194-32)
//
// Este archivo orquesta: consulta previa de la app (`previewActivation`),
// activación (`activate`), anulación (`voidInvitation`), compensación de una
// activación fallida y aplicación de los datos del invitado. Las REGLAS
// anti-abuso (cupo D-10, membresía del invitador D-10d, elegibilidad D-11/D-12,
// identidad por teléfono/DNI) viven en `invitation-rules.ts`; acá se componen
// con `this.rules` (público: quien necesite una regla suelta la llama directo).
//
// La carrera (dos activaciones simultáneas con el mismo cupo) se resuelve en
// `activate` con el lock `FOR UPDATE` de la tx del paso 2.
//
// AISLAMIENTO: toda query lleva `tenantWhere`. `tenant_id` sale del `ctx` del
// servidor, nunca del body.
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
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
import type { SubscriptionService } from "../subscriptions/service";
import type {
  BookingService,
  CancelledSlot,
} from "../scheduling/booking-service";
import { getInvitationSettings } from "./invitation-settings";
import { InvitationRules, type InvitationExecutor } from "./invitation-rules";
import { ReferralService } from "./service";
import {
  ACTIVATION_FAILED_REASON,
  InvitationRuleError,
  INELIGIBLE_MESSAGES,
  type ActivatedInvitation,
  type ActivateInvitationInput,
  type ActivationPreview,
  type ActivationPreviewInput,
  type InvitationIneligibleReason,
  type VoidInvitationInput,
} from "./invitation-types";

// Re-exports: los imports existentes (tests) toman estos símbolos de acá.
export { subtractMonths } from "./invitation-rules";
export type { InvitationExecutor } from "./invitation-rules";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Foto de los campos del invitado que el paso 3 de la activación escribe, para
 * restaurarlos si falla el paso 4 (T-194-33). `statusChanged` = el paso 3
 * insertó una transición a `prueba` en `user_status_history`.
 */
interface InviteeSnapshot {
  status: (typeof schema.users.$inferSelect)["status"];
  branchId: number;
  branchUpdatedAt: Date | null;
  branchSource: (typeof schema.users.$inferSelect)["branchSource"];
  phone: string | null;
  dni: string | null;
  leadStatus: (typeof schema.users.$inferSelect)["leadStatus"];
  leadStatusSource: (typeof schema.users.$inferSelect)["leadStatusSource"];
  purchasedPlanId: number | null;
  statusChanged: boolean;
}

export class InvitationService {
  /**
   * Reglas anti-abuso (cupo, elegibilidad, identidad): ver `invitation-rules.ts`. Público
   * de solo lectura: quien necesite consultar una regla suelta (canal asistido, tests) la
   * llama acá, sin delegadores intermedios.
   */
  readonly rules: InvitationRules;

  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    /** Lo usa la activación (194-09) para asignar el plan Invitación. */
    readonly subscriptionService?: SubscriptionService,
    /** Lo usa la anulación (194-09) para cancelar las reservas futuras del invitado. */
    readonly bookingService?: BookingService,
  ) {
    this.rules = new InvitationRules(db, log);
  }

  // ─── Consulta previa de la app (D-06) ────────────────────────────────────

  /**
   * `GET .../invitations/eligibility`: lo que la app muestra ANTES de activar.
   * Corre las MISMAS reglas que `activate` y en el mismo orden (self_invite ->
   * invitador D-10/D-10d -> invitado D-11/D-12), salvo la identidad por
   * teléfono/DNI, que se valida al activar porque el socio todavía no lo tipeó.
   *
   * Un código inexistente lanza `inviter_not_found` (404). Un invitador que no
   * puede invitar NO lanza: devuelve `eligible:false` con el motivo, para que la
   * pantalla explique por qué. T-194-35: solo el NOMBRE DE PILA del invitador.
   *
   * País de referencia (para el plan Invitación y las sedes a elegir): el de la
   * sede FÍSICA actual del socio; si está en la sede virtual, el de la sede
   * destino elegida (`branchId`); sin ninguna de las dos, `accessesBudget` es
   * null y se listan las sedes físicas de todos los países. `activate` usa la
   * misma regla, así el texto nunca difiere del plan que se asigna.
   */
  async previewActivation(
    ctx: TenantContext,
    input: ActivationPreviewInput,
  ): Promise<ActivationPreview> {
    const subscriptionService = this.requireSubscriptionService();
    const inviterId = await new ReferralService(
      this.db,
      this.log,
    ).resolveReferralCode(ctx, input.code.trim());
    if (inviterId === null) throw new InvitationRuleError("inviter_not_found");

    const people = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        phone: schema.users.phone,
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
    const inviter = people.find((p) => p.id === inviterId);

    const current = await this.loadBranch(ctx, invitee.branchId, this.db);
    const chosen =
      input.branchId !== undefined
        ? await this.loadBranch(ctx, input.branchId, this.db)
        : null;
    if (chosen?.isVirtual) {
      throw new BadRequestError(
        "Elegí una sede física para activar la invitación",
      );
    }
    if (chosen && !current.isVirtual && current.country !== chosen.country) {
      throw new BadRequestError("La sede elegida es de otro país");
    }
    const reference = !current.isVirtual ? current : chosen;

    let reason: InvitationIneligibleReason | null = null;
    if (inviterId === invitee.id) {
      reason = "self_invite";
    } else {
      try {
        await this.rules.assertInviterCanInvite(ctx, inviterId);
      } catch (err: unknown) {
        if (!(err instanceof InvitationRuleError)) throw err;
        reason = err.reason;
      }
      if (reason === null) {
        reason = await this.rules.findIneligibleReason(
          ctx,
          {
            inviterId,
            invitedUserId: invitee.id,
            phone: invitee.phone ?? "",
            dni: invitee.dni,
            branchId: reference?.id,
          },
          this.db,
          { skipIdentity: true },
        );
      }
    }

    const branches = await this.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
        country: schema.branches.country,
      })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.isVirtual, false),
          eq(schema.branches.isActive, true),
          reference
            ? eq(schema.branches.country, reference.country)
            : undefined,
        ),
      )
      .orderBy(schema.branches.country, schema.branches.name);

    let accessesBudget: number | null = null;
    if (reference) {
      try {
        const plan = await subscriptionService.findInvitationPlan(
          ctx,
          reference.country,
        );
        accessesBudget = plan.classesPerWeek ?? null;
      } catch (err: unknown) {
        // Sin plan configurado la app muestra copy genérico (findInvitationPlan
        // ya dejó el error de configuración en el log).
        if (!(err instanceof BadRequestError)) throw err;
      }
    }
    const settings = await getInvitationSettings(this.db, ctx, this.log);

    return {
      inviterFirstName: inviter?.firstName ?? null,
      eligible: reason === null,
      reason,
      message: reason === null ? null : INELIGIBLE_MESSAGES[reason],
      branches,
      accessesBudget,
      accessBusinessDays: settings.accessBusinessDays,
    };
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
      const quota = await this.rules.assertInviterCanInvite(ctx, inviterId, tx);
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
      await this.rules.assertInviteeEligible(
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
    let snapshot: InviteeSnapshot | null = null;
    let subIdFloor: number | null = null;
    try {
      // Paso 3 (si falla su propia tx no deja nada escrito: snapshot sigue null)
      snapshot = await this.applyInviteeData(ctx, input.invitedUserId, {
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
      // Piso de ids de sub ANTES de asignar: si `assignInvitationPlan` crea la
      // sub y falla después (no devolvió el id), la compensación igual la
      // encuentra (id > piso) y la cierra.
      subIdFloor = await this.maxSubscriptionId(ctx, input.invitedUserId);
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
        snapshot,
        subIdFloor,
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
   * Si cerró los accesos, cancela en la misma tx las reservas futuras del
   * invitado (`BookingService.cancelUpcomingBookingsForMember`) y después del
   * commit libera cupo/lista de espera.
   */
  async voidInvitation(
    ctx: TenantContext,
    invitationId: number,
    input: VoidInvitationInput,
  ): Promise<void> {
    const subscriptionService = this.requireSubscriptionService();
    const bookingService = this.requireBookingService();
    const reason = input.reason.trim();
    if (reason.length === 0) {
      throw new BadRequestError("Indicá el motivo de la anulación");
    }
    if (reason.length > 64) {
      throw new BadRequestError(
        "El motivo de la anulación admite hasta 64 caracteres",
      );
    }

    let releasedSlots: CancelledSlot[] = [];
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
        // D-04: si los accesos estaban vigentes, las reservas futuras del
        // invitado dependían de ellos: se cancelan en la MISMA tx (staff, sin
        // ventana de 20 min; no toca las ya escaneadas ni las pasadas). Si el
        // invitado ya había comprado (closed = 0) sus reservas cuelgan de la
        // membresía real y no se tocan.
        if (closed > 0) {
          releasedSlots = await bookingService.cancelUpcomingBookingsForMember(
            ctx,
            invitation.invitedUserId,
            tx,
          );
        }
        this.log.info(
          {
            invitationId,
            closedSubscriptions: closed,
            cancelledBookings: releasedSlots.length,
          },
          "invitaciones: invitación anulada por staff",
        );
      }
    });

    // Post-commit (como `cancel()`): liberar cupo, promover lista de espera y
    // emitir la ocupación. El `voided` ya está firme: un fallo acá se loguea.
    try {
      await bookingService.releaseCancelledSlots(ctx, releasedSlots);
    } catch (err: unknown) {
      this.log.error(
        {
          err: err instanceof Error ? err.message : String(err),
          invitationId,
        },
        "invitaciones: no se pudo promover la lista de espera tras anular",
      );
    }
  }

  // ─── Helpers privados ────────────────────────────────────────────────────

  private requireBookingService(): BookingService {
    if (!this.bookingService) {
      throw new Error(
        "InvitationService: falta BookingService para anular invitaciones",
      );
    }
    return this.bookingService;
  }

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
  ): Promise<InviteeSnapshot> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({
          status: schema.users.status,
          branchId: schema.users.branchId,
          branchUpdatedAt: schema.users.branchUpdatedAt,
          branchSource: schema.users.branchSource,
          phone: schema.users.phone,
          dni: schema.users.dni,
          leadStatus: schema.users.leadStatus,
          leadStatusSource: schema.users.leadStatusSource,
          purchasedPlanId: schema.users.purchasedPlanId,
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
      return { ...user, statusChanged: changesStatus };
    });
  }

  /** Mayor `subscriptions.id` del usuario (0 si no tiene): piso de la compensación. */
  private async maxSubscriptionId(
    ctx: TenantContext,
    userId: number,
  ): Promise<number> {
    const [row] = await this.db
      .select({ maxId: sql<number | null>`MAX(${schema.subscriptions.id})` })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx),
          eq(schema.subscriptions.userId, userId),
        ),
      );
    return Number(row?.maxId ?? 0);
  }

  /** Subs Invitación (is_trial + paquete) vigentes del usuario con id > `floor`. */
  private async findInvitationSubsAbove(
    ctx: TenantContext,
    userId: number,
    floor: number,
    exec: InvitationExecutor,
  ): Promise<number[]> {
    const rows = await exec
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
          gt(schema.subscriptions.id, floor),
          inArray(schema.subscriptions.status, ["active", "paused"]),
          eq(schema.subscriptionPlans.isTrial, true),
          eq(schema.subscriptionPlans.planCategory, "paquete"),
        ),
      );
    return rows.map((r) => r.id);
  }

  /**
   * Paso 5: deja la fila `voided` con `activation_failed`, cierra la sub de
   * accesos si ya se había creado y RESTAURA al invitado a como estaba antes del
   * paso 3 (status, sede, teléfono, DNI y lead; en el historial agrega la
   * transición inversa `invitation_undo`). Todo en UNA tx. `assignInvitationPlan` necesita la sede
   * física ya seteada (país del plan y regla de sede presencial), por eso se
   * compensa en vez de reordenar. Best-effort: un fallo acá se loguea y NO tapa
   * el error original de la activación.
   */
  private async compensateFailedActivation(
    ctx: TenantContext,
    invitationId: number,
    invitedUserId: number,
    subscriptionId: number | null,
    snapshot: InviteeSnapshot | null,
    subIdFloor: number | null,
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
        if (this.subscriptionService) {
          // La sub conocida + cualquier sub Invitación vigente que `assign...`
          // haya alcanzado a crear antes de fallar (id > piso).
          const orphanIds =
            subIdFloor === null
              ? []
              : await this.findInvitationSubsAbove(
                  ctx,
                  invitedUserId,
                  subIdFloor,
                  tx,
                );
          const toClose = [
            ...new Set([
              ...(subscriptionId !== null ? [subscriptionId] : []),
              ...orphanIds,
            ]),
          ];
          if (toClose.length > 0) {
            await this.subscriptionService.closeInvitationAccess(
              ctx,
              invitedUserId,
              toClose,
              tx,
              { recompute: true },
            );
          }
        }
        if (snapshot !== null) {
          await tx
            .update(schema.users)
            .set({
              status: snapshot.status,
              branchId: snapshot.branchId,
              branchUpdatedAt: snapshot.branchUpdatedAt,
              branchSource: snapshot.branchSource,
              phone: snapshot.phone,
              dni: snapshot.dni,
              leadStatus: snapshot.leadStatus,
              leadStatusSource: snapshot.leadStatusSource,
              purchasedPlanId: snapshot.purchasedPlanId,
            })
            .where(
              and(
                tenantWhere(schema.users, ctx),
                eq(schema.users.id, invitedUserId),
              ),
            );
          // Historial forward-only: no se borra la fila del paso 3, se agrega
          // la transición inversa (así el rastro dice que la activación se
          // deshizo). Un status previo NULL (sin pipeline) no tiene inversa.
          if (snapshot.statusChanged && snapshot.status !== null) {
            await tx.insert(schema.userStatusHistory).values(
              tenantValues(ctx, {
                userId: invitedUserId,
                fromStatus: "prueba" as const,
                toStatus: snapshot.status,
                source: "invitation_undo",
              }),
            );
          }
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
}
