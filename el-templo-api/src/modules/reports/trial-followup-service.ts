/**
 * TrialFollowupService — cadencia de mensajes en Sesiones de Prueba (brief
 * Nacho, 2026-09-26).
 *
 * Responsable de lo MANUAL que se persiste en `trial_followups` (marcar/
 * desmarcar mensajes, "Respondió", Perdida manual con motivo) y de las
 * franjas de turno por sede (`branches.trial_*`). La lectura/derivación del
 * reporte (estado, próxima acción, KPIs) vive en `ReportsService` — este
 * servicio la REUSA (`getTrialSessionRowByBookingId`) para conocer el estado
 * derivado ANTES de aplicar un guardrail, en vez de duplicar la lógica de
 * `trial-cadence.ts` (Facade pattern, CLAUDE.md §Patterns).
 *
 * Guardrails (SPEC "DECISIONES DE FRANCO" §"Guardrails API"):
 *   - Nunca se puede tocar una sesión Ganada/Perdida/Reagendada.
 *   - M2 antes del fin de la clase → 409.
 *   - M3 sin M2 → 409. M3/M2 con el código que no coincide con la asistencia
 *     registrada → 409.
 *   - Deshacer un mensaje con el siguiente ya enviado → 409 (evita huecos en
 *     la cadena).
 *   - "Perdida" manual reusa `MemberService.updateLead` (mismo criterio que
 *     el PATCH de leads existente) — NO se duplica esa lógica acá.
 *   - Marcar cualquier mensaje sella `users.trial_followup_started_at` si
 *     estaba en null (absorbe el botón viejo "Iniciar seguimiento").
 *   - Nunca se borran sesiones ni followups — solo se actualizan campos.
 */
import { and, eq, isNull } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, ConflictError, NotFoundError } from "../shared/errors";
import { assertBranchInEnforcedScope } from "../shared/branch-access";
import { tenantValues, tenantWhere, type TenantContext } from "../shared/tenant";
import { auditLog } from "../shared/audit-log";
import type { TxHandle } from "../finance/balance-service";
import { MemberService } from "../members/service";
import { ReportsService } from "./service";
import type {
  TrialFollowupAction,
  TrialFollowupUpdateInput,
  TrialSessionsRow,
  TrialShiftsRow,
} from "./types";

/** Alcance del actor — mismo contrato que `RenewalActorScope`. */
export interface TrialFollowupActorScope {
  userId: number;
  isOwner: boolean;
  country: "AR" | "ES" | null;
  branchIds?: number[] | null;
}

/**
 * Código estable de los 409 de guardrail — viaja como `code` en el body,
 * mismo patrón que `REASON_REQUIRED` de Renovaciones.
 */
export class TrialFollowupGuardrailError extends ConflictError {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const GUARDRAIL = {
  sessionClosed: "SESSION_CLOSED",
  m2BeforeClassEnd: "M2_BEFORE_CLASS_END",
  attendanceMismatch: "ATTENDANCE_MISMATCH",
  m3WithoutM2: "M3_WITHOUT_M2",
  alreadyResponded: "ALREADY_RESPONDED",
  cannotUnmark: "CANNOT_UNMARK",
  nothingToUnmark: "NOTHING_TO_UNMARK",
} as const;

/** "HH:MM" → "HH:MM:00"; "HH:MM:SS" se deja igual — para comparar franjas sin ambigüedad de longitud. */
function normalizeTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

type FollowupRow = typeof schema.trialFollowups.$inferSelect;

export class TrialFollowupService {
  private memberService: MemberService;
  private reportsService: ReportsService;

  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {
    this.memberService = new MemberService(db, log);
    this.reportsService = new ReportsService(db, log);
  }

  /**
   * Resuelve sede + socio de una sesión de prueba (booking `is_trial=1`) del
   * tenant, o `null` si no existe / no es de prueba.
   */
  private async resolveBookingScope(
    ctx: TenantContext,
    bookingId: number,
  ): Promise<{
    branchId: number;
    branchCountry: string;
    userId: number;
  } | null> {
    const [row] = await this.db
      .select({
        branchId: schema.branches.id,
        branchCountry: schema.branches.country,
        userId: schema.bookings.memberId,
        isTrial: schema.bookings.isTrial,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .where(
        and(
          tenantWhere(schema.bookings, ctx),
          eq(schema.bookings.id, bookingId),
        ),
      )
      .limit(1);
    if (!row || !row.isTrial) return null;
    return row;
  }

  /**
   * Recurso ajeno (inexistente, fuera de sede forzada, o de otro país para
   * admin/gestion sin sede forzada) ⇒ 404 SIEMPRE, nunca 403 — mismo criterio
   * que `RenewalsService.assertSubscriptionInScope`.
   */
  private async assertBookingInScope(
    ctx: TenantContext,
    bookingId: number,
    actor: TrialFollowupActorScope,
  ): Promise<{ branchId: number; userId: number }> {
    const scope = await this.resolveBookingScope(ctx, bookingId);
    if (!scope) throw new NotFoundError("Sesión de prueba no encontrada");
    if (actor.branchIds != null) {
      assertBranchInEnforcedScope(
        scope.branchId,
        actor.branchIds,
        "Sesión de prueba no encontrada",
      );
    } else if (!actor.isOwner) {
      if (actor.country === null || scope.branchCountry !== actor.country) {
        throw new NotFoundError("Sesión de prueba no encontrada");
      }
    }
    return scope;
  }

  /**
   * `PATCH /api/admin/reports/trial-sessions/:bookingId/followup` (SPEC).
   */
  async updateFollowup(
    ctx: TenantContext,
    bookingId: number,
    input: TrialFollowupUpdateInput,
    actor: TrialFollowupActorScope,
  ): Promise<TrialSessionsRow> {
    const scope = await this.assertBookingInScope(ctx, bookingId, actor);

    // Estado derivado ANTES de mutar — reusa el motor vía ReportsService en
    // vez de duplicar `trial-cadence.ts` acá (Facade, CLAUDE.md §Patterns).
    const sessionRow = await this.reportsService.getTrialSessionRowByBookingId(
      ctx,
      bookingId,
    );
    if (!sessionRow) throw new NotFoundError("Sesión de prueba no encontrada");

    if (
      sessionRow.sessionStatus === "ganada" ||
      sessionRow.sessionStatus === "perdida" ||
      sessionRow.sessionStatus === "reagendada"
    ) {
      throw new TrialFollowupGuardrailError(
        GUARDRAIL.sessionClosed,
        `La sesión ya está cerrada (${sessionRow.sessionStatus}) — no admite más acciones`,
      );
    }

    const [before] = await this.db
      .select()
      .from(schema.trialFollowups)
      .where(
        and(
          tenantWhere(schema.trialFollowups, ctx),
          eq(schema.trialFollowups.bookingId, bookingId),
        ),
      )
      .limit(1);

    const action = input.action;
    const next = this.applyGuardedAction(
      action,
      before,
      sessionRow,
      actor.userId,
    );

    let sealFollowupStart = false;
    if (action.type === "mark_sent") {
      // Absorbe el botón viejo "Iniciar seguimiento" (brief): marcar
      // cualquier mensaje sella `trial_followup_started_at` si era null.
      sealFollowupStart = true;
    }

    let updatedFollowupId = 0;
    await this.db.transaction(async (tx: TxHandle) => {
      await tx
        .insert(schema.trialFollowups)
        .values(
          tenantValues(ctx, {
            bookingId,
            m1SentAt: next.m1SentAt,
            m1SentBy: next.m1SentBy,
            m2Kind: next.m2Kind,
            m2SentAt: next.m2SentAt,
            m2SentBy: next.m2SentBy,
            m3SentAt: next.m3SentAt,
            m3SentBy: next.m3SentBy,
            respondedAt: next.respondedAt,
            respondedBy: next.respondedBy,
            lostReason: next.lostReason,
            lostNote: next.lostNote,
            rescheduledFromBookingId: before?.rescheduledFromBookingId ?? null,
            updatedBy: actor.userId,
          }),
        )
        .onDuplicateKeyUpdate({
          set: {
            m1SentAt: next.m1SentAt,
            m1SentBy: next.m1SentBy,
            m2Kind: next.m2Kind,
            m2SentAt: next.m2SentAt,
            m2SentBy: next.m2SentBy,
            m3SentAt: next.m3SentAt,
            m3SentBy: next.m3SentBy,
            respondedAt: next.respondedAt,
            respondedBy: next.respondedBy,
            lostReason: next.lostReason,
            lostNote: next.lostNote,
            updatedBy: actor.userId,
          },
        });

      const [after] = await tx
        .select()
        .from(schema.trialFollowups)
        .where(
          and(
            tenantWhere(schema.trialFollowups, ctx),
            eq(schema.trialFollowups.bookingId, bookingId),
          ),
        )
        .limit(1);
      updatedFollowupId = after?.id ?? 0;

      if (sealFollowupStart) {
        // "Sella SI ES NULL" (brief) — el `isNull` en el WHERE hace que un
        // segundo mensaje marcado más tarde NUNCA pise el timestamp histórico
        // del primero (mismo patrón que `MemberService.startTrialFollowup`).
        await tx
          .update(schema.users)
          .set({ trialFollowupStartedAt: new Date() })
          .where(
            and(
              tenantWhere(schema.users, ctx),
              eq(schema.users.id, scope.userId),
              isNull(schema.users.trialFollowupStartedAt),
            ),
          );
      }

      await auditLog.write(ctx, tx, {
        actorId: actor.userId,
        action: "trial_followup_updated",
        targetKind: "trial_followup",
        targetId: updatedFollowupId,
        payload: { bookingId, before: before ?? null, action, after: next },
      });
    });

    if (action.type === "lost") {
      // Reusa la lógica existente del PATCH de leads (no se duplica acá) —
      // fuera de la tx de arriba: `MemberService.updateLead` no acepta un
      // `TxHandle` externo (deuda documentada, ver SUMMARY del plan). Corre
      // ANTES del re-fetch de abajo para que la fila devuelta ya refleje
      // `sessionStatus: 'perdida'` sin necesitar un segundo GET.
      await this.memberService.updateLead(ctx, scope.userId, {
        leadStatus: "perdido",
      });
    }

    const row = await this.reportsService.getTrialSessionRowByBookingId(
      ctx,
      bookingId,
    );
    if (!row) throw new NotFoundError("Sesión de prueba no encontrada");

    return row;
  }

  /**
   * Aplica UNA acción sobre el estado `before` (o `undefined` si la sesión
   * nunca tuvo followup), validando los guardrails de la SPEC. Devuelve el
   * conjunto COMPLETO de columnas a escribir — nunca un parche parcial, así
   * el `INSERT ... ON DUPLICATE KEY UPDATE` de `updateFollowup` es siempre
   * determinístico.
   */
  private applyGuardedAction(
    action: TrialFollowupAction,
    before: FollowupRow | undefined,
    sessionRow: TrialSessionsRow,
    actorUserId: number,
  ): Pick<
    FollowupRow,
    | "m1SentAt"
    | "m1SentBy"
    | "m2Kind"
    | "m2SentAt"
    | "m2SentBy"
    | "m3SentAt"
    | "m3SentBy"
    | "respondedAt"
    | "respondedBy"
    | "lostReason"
    | "lostNote"
  > {
    const base = {
      m1SentAt: before?.m1SentAt ?? null,
      m1SentBy: before?.m1SentBy ?? null,
      m2Kind: before?.m2Kind ?? null,
      m2SentAt: before?.m2SentAt ?? null,
      m2SentBy: before?.m2SentBy ?? null,
      m3SentAt: before?.m3SentAt ?? null,
      m3SentBy: before?.m3SentBy ?? null,
      respondedAt: before?.respondedAt ?? null,
      respondedBy: before?.respondedBy ?? null,
      lostReason: before?.lostReason ?? null,
      lostNote: before?.lostNote ?? null,
    };
    const now = new Date();

    if (action.type === "mark_sent" || action.type === "unmark_sent") {
      const isMark = action.type === "mark_sent";
      const wantsKind: "venta" | "reagenda" | null =
        action.code === "M2b" || action.code === "M3b" ? "reagenda" : "venta";

      if (action.code === "M1") {
        if (isMark) {
          return {
            ...base,
            m1SentAt: now,
            m1SentBy: actorUserId,
          };
        }
        if (before?.m1SentAt == null) {
          throw new TrialFollowupGuardrailError(
            GUARDRAIL.nothingToUnmark,
            "M1 no está marcado como enviado",
          );
        }
        if (before?.m2SentAt != null) {
          throw new TrialFollowupGuardrailError(
            GUARDRAIL.cannotUnmark,
            "No se puede deshacer M1 con M2 ya enviado",
          );
        }
        return { ...base, m1SentAt: null, m1SentBy: null };
      }

      if (action.code === "M2a" || action.code === "M2b") {
        if (sessionRow.attended === null) {
          throw new TrialFollowupGuardrailError(
            GUARDRAIL.m2BeforeClassEnd,
            "No se puede marcar M2 antes de que termine la clase",
          );
        }
        const attendedWantsA = sessionRow.attended === "si";
        if (
          (action.code === "M2a" && !attendedWantsA) ||
          (action.code === "M2b" && attendedWantsA)
        ) {
          throw new TrialFollowupGuardrailError(
            GUARDRAIL.attendanceMismatch,
            "El mensaje no corresponde a la asistencia registrada",
          );
        }
        if (isMark) {
          return {
            ...base,
            m2Kind: wantsKind,
            m2SentAt: now,
            m2SentBy: actorUserId,
          };
        }
        if (before?.m2SentAt == null) {
          throw new TrialFollowupGuardrailError(
            GUARDRAIL.nothingToUnmark,
            "M2 no está marcado como enviado",
          );
        }
        if (before?.m3SentAt != null) {
          throw new TrialFollowupGuardrailError(
            GUARDRAIL.cannotUnmark,
            "No se puede deshacer M2 con M3 ya enviado",
          );
        }
        return { ...base, m2Kind: null, m2SentAt: null, m2SentBy: null };
      }

      // M3a / M3b
      if (isMark) {
        if (before?.m2SentAt == null) {
          throw new TrialFollowupGuardrailError(
            GUARDRAIL.m3WithoutM2,
            "No se puede marcar M3 sin M2 registrado",
          );
        }
        if (before?.respondedAt != null) {
          throw new TrialFollowupGuardrailError(
            GUARDRAIL.alreadyResponded,
            "La persona ya respondió — no corresponde reintento",
          );
        }
        const attendedWantsA = sessionRow.attended === "si";
        if (
          (action.code === "M3a" && !attendedWantsA) ||
          (action.code === "M3b" && attendedWantsA)
        ) {
          throw new TrialFollowupGuardrailError(
            GUARDRAIL.attendanceMismatch,
            "El mensaje no corresponde a la asistencia registrada",
          );
        }
        return { ...base, m3SentAt: now, m3SentBy: actorUserId };
      }
      if (before?.m3SentAt == null) {
        throw new TrialFollowupGuardrailError(
          GUARDRAIL.nothingToUnmark,
          "M3 no está marcado como enviado",
        );
      }
      return { ...base, m3SentAt: null, m3SentBy: null };
    }

    if (action.type === "responded") {
      return action.value
        ? { ...base, respondedAt: now, respondedBy: actorUserId }
        : { ...base, respondedAt: null, respondedBy: null };
    }

    // "lost" — el JSON schema no fuerza "reason" condicionalmente a
    // type==='lost' (mismo estilo que el resto del repo, sin if/then de AJV),
    // así que se revalida acá: un body malformado que igual pasa el schema no
    // puede persistir una Perdida sin motivo.
    if (!action.reason) {
      throw new BadRequestError(
        "El motivo es obligatorio para marcar la sesión como Perdida",
      );
    }
    return {
      ...base,
      lostReason: action.reason,
      lostNote: action.note ?? null,
    };
  }

  // ─── Franjas de turno por sede ──────────────────────────────────────────

  /** `GET /api/admin/reports/trial-sessions/shifts` (solo owner/admin). */
  async getShifts(ctx: TenantContext): Promise<TrialShiftsRow[]> {
    const rows = await this.db
      .select({
        branchId: schema.branches.id,
        branchName: schema.branches.name,
        morningStart: schema.branches.trialMorningStart,
        morningEnd: schema.branches.trialMorningEnd,
        afternoonStart: schema.branches.trialAfternoonStart,
        afternoonEnd: schema.branches.trialAfternoonEnd,
      })
      .from(schema.branches)
      .where(tenantWhere(schema.branches, ctx))
      .orderBy(schema.branches.name);
    return rows;
  }

  /** `PUT /api/admin/reports/trial-sessions/shifts/:branchId` (solo owner/admin). */
  async updateShifts(
    ctx: TenantContext,
    branchId: number,
    input: Partial<{
      morningStart: string;
      morningEnd: string;
      afternoonStart: string;
      afternoonEnd: string;
    }>,
  ): Promise<TrialShiftsRow> {
    const [branch] = await this.db
      .select({
        name: schema.branches.name,
        morningStart: schema.branches.trialMorningStart,
        morningEnd: schema.branches.trialMorningEnd,
        afternoonStart: schema.branches.trialAfternoonStart,
        afternoonEnd: schema.branches.trialAfternoonEnd,
      })
      .from(schema.branches)
      .where(
        and(tenantWhere(schema.branches, ctx), eq(schema.branches.id, branchId)),
      )
      .limit(1);
    if (!branch) throw new NotFoundError("Sede no encontrada");

    const next = {
      morningStart: normalizeTime(input.morningStart ?? branch.morningStart),
      morningEnd: normalizeTime(input.morningEnd ?? branch.morningEnd),
      afternoonStart: normalizeTime(
        input.afternoonStart ?? branch.afternoonStart,
      ),
      afternoonEnd: normalizeTime(input.afternoonEnd ?? branch.afternoonEnd),
    };

    if (next.morningStart >= next.morningEnd) {
      throw new BadRequestError(
        "El inicio del turno mañana debe ser anterior al fin",
      );
    }
    if (next.afternoonStart >= next.afternoonEnd) {
      throw new BadRequestError(
        "El inicio del turno tarde debe ser anterior al fin",
      );
    }
    if (next.morningEnd > next.afternoonStart) {
      throw new BadRequestError(
        "El turno mañana debe terminar antes de que empiece el turno tarde",
      );
    }

    await this.db
      .update(schema.branches)
      .set({
        trialMorningStart: next.morningStart,
        trialMorningEnd: next.morningEnd,
        trialAfternoonStart: next.afternoonStart,
        trialAfternoonEnd: next.afternoonEnd,
      })
      .where(
        and(tenantWhere(schema.branches, ctx), eq(schema.branches.id, branchId)),
      );

    return { branchId, branchName: branch.name, ...next };
  }
}
