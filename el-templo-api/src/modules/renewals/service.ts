/**
 * RenewalsService — módulo de Renovaciones (2026-09-24, brief Nacho).
 *
 * Pantalla operativa que reemplaza el Excel semanal de vencimientos: lista
 * las membresías que vencen en un rango, con un estado de renovación
 * (mayormente DERIVADO), avance de contacto (mensaje 0–4) y motivos de no
 * renovación.
 *
 * PRINCIPIO CENTRAL (SPEC §"derivado vs. persistido") — LEER ANTES DE TOCAR
 * ESTE ARCHIVO:
 *   - Renovó / Volvió tarde / Pausada se DERIVAN en cada lectura desde
 *     `subscriptions`. NUNCA se persisten — no hay columna para ellos.
 *   - Solo se persiste lo MANUAL: `messageCount`, `manualStatus`
 *     ('en_proceso'|'no_renovo'), `reasonId`/`reasonNote` y quién/cuándo
 *     (`renewal_followups`).
 *   - Un "No renovó" manual queda PISADO por una renovación derivada: se
 *     muestra 'renovo'/'volvio_tarde' + `manualOverridden=true`. El registro
 *     manual NUNCA se borra ni se pisa en la base — solo se re-etiqueta en la
 *     lectura.
 *
 * CÓMO SE ARMA LA "SUB SIGUIENTE" (continuación) — decisión de diseño
 * ---------------------------------------------------------------------
 * `expiry-cohort.ts` (`retainedExpr`) resuelve esto con una subquery
 * correlacionada en SQL. Acá se resuelve DIFERENTE, a propósito: se trae el
 * universo de subs candidatas de los socios del listado en UNA query batch
 * (`fetchNextSubCandidates`) y el emparejamiento (mismo user, mismo grupo de
 * categoría, `end_date` posterior, `start_date` más temprano) se hace en
 * TypeScript (`pickNextSubscription`). Motivo: esta pantalla es un reporte
 * acotado (una semana de vencimientos, rango máximo 93 días — pocas decenas/
 * cientos de filas), y la trampa documentada en `expiry-cohort.ts` (columnas
 * SIN calificar dentro de `.select()` en subqueries correlacionadas, que ya
 * rompió analytics dos veces — ver skill `el-templo-db-migrations`) no tiene
 * forma de reproducirse si la lógica de matching nunca vive en un fragmento
 * `sql` correlacionado. Explicit over clever.
 */
import { and, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, ConflictError, NotFoundError } from "../shared/errors";
import { assertBranchInEnforcedScope } from "../shared/branch-access";
import { tenantValues, tenantWhere, type TenantContext } from "../shared/tenant";
import { isDuplicateKeyError } from "../shared/sql-errors";
import { auditLog } from "../shared/audit-log";
import { normalizePhoneE164 } from "../shared/phone";
import { todayInTz } from "../shared/date-utils";
import type { TxHandle } from "../finance/balance-service";
import { MemberService } from "../members/service";
import type { MemberNote } from "../members/types";
import type {
  RenewalActorScope,
  RenewalFollowupUpdateInput,
  RenewalKpis,
  RenewalListFilters,
  RenewalListResult,
  RenewalManualStatus,
  RenewalPlanDistributionEntry,
  RenewalReason,
  RenewalReasonCreateInput,
  RenewalReasonUpdateInput,
  RenewalRow,
  RenewalStatus,
} from "./types";

/**
 * Ventana de seguimiento de renovación de ESTE módulo — 5 días fijos (SPEC
 * §"Ventana"). El tablero de Analíticas (`expiry-cohort.ts`,
 * `RENOVATION_WINDOW_DEFAULT_DAYS = 15`) es una constante DISTINTA y no se
 * toca: comparten la idea de "ventana de renovación" pero son dos productos
 * con dos configuraciones independientes.
 */
export const RENEWAL_FOLLOWUP_WINDOW_DAYS = 5;

/**
 * Código estable del 400 (SPEC §"PATCH .../:subscriptionId": "manualStatus=
 * 'no_renovo' exige reasonId activo del tenant (400 REASON_REQUIRED)") —
 * mismo patrón que `BRANCH_OUT_OF_SCOPE` (`shared/branch-access.ts`): una
 * constante exportada para que `routes.ts` matchee exacto en vez de parsear
 * el mensaje.
 */
export const REASON_REQUIRED = "REASON_REQUIRED";

/**
 * El default `handleServiceError` solo emite `{ error, message }`, así que
 * `routes.ts` agrega el `code` explícitamente — mismo patrón que
 * `BranchOutOfScopeError`/`BRANCH_OUT_OF_SCOPE`.
 */
export class ReasonRequiredError extends BadRequestError {
  readonly code = REASON_REQUIRED;

  constructor(
    message = "El motivo es obligatorio para marcar 'No renovó' y tiene que estar activo",
  ) {
    super(message);
  }
}

/** Rango máximo de días entre dateFrom/dateTo (SPEC §"GET /api/admin/renewals"). */
export const RENEWAL_MAX_RANGE_DAYS = 93;

/** Duración mínima de plan para contar como renovación (SPEC — excluye clase única/suelta). */
const MIN_RENEWAL_PLAN_DURATION_DAYS = 7;

const EXPIRING_STATUSES = ["active", "paused", "expired", "completed"] as const;

/** Candidato a "sub siguiente" — universo batch, sin filtrar por fila todavía. */
interface NextSubCandidate {
  id: number;
  userId: number;
  planId: number;
  planName: string;
  planCategory: string;
  startDate: string;
  endDate: string | null;
  createdAt: Date;
}

/** Una fila cruda de la query principal, antes de derivar el estado. */
interface ExpiringRow {
  subscriptionId: number;
  userId: number;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  branchId: number;
  branchName: string;
  branchCountry: "AR" | "ES";
  branchTimezone: string;
  planId: number;
  planName: string;
  planCategory: string;
  status: string;
  endDate: string;
  pauseEndDate: string | null;
  messageCount: number | null;
  lastMessageAt: Date | null;
  manualStatus: RenewalManualStatus | null;
  reasonId: number | null;
  reasonNote: string | null;
  reasonLabel: string | null;
}

/** `sp.plan_category = 'presencial'` vs cualquier otro valor — mismo criterio que `coverageExists` (reports/service.ts). */
function isPresencial(category: string): boolean {
  return category === "presencial";
}

/** `YYYY-MM-DD` + N días, aritmética UTC pura (mismo patrón que `isoWeekRange`, reports/service.ts). */
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Días calendario entre "hoy" EN LA TZ DE LA SEDE y `endDate`. Con "hoy" en
 * UTC, de 21 a 24 h en Argentina el contador ya mostraba un día menos.
 */
function daysUntil(endDate: string, tz: string): number {
  const today = todayInTz(tz);
  return Math.round(
    (new Date(endDate + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) /
      86_400_000,
  );
}

/**
 * Elige la "sub siguiente" de una fila E entre el universo de candidatas del
 * mismo socio (SPEC §"Sub siguiente"): distinto id, `status <> 'cancelled'`,
 * mismo grupo de categoría (presencial vs no-presencial), `end_date` posterior
 * a la de E. Desempate: `start_date` más temprano, luego `id` menor.
 */
function pickNextSubscription(
  candidates: NextSubCandidate[],
  e: Pick<ExpiringRow, "subscriptionId" | "userId" | "planCategory" | "endDate">,
): NextSubCandidate | null {
  const matches = candidates.filter(
    (c) =>
      c.userId === e.userId &&
      c.id !== e.subscriptionId &&
      c.endDate !== null &&
      c.endDate > e.endDate &&
      isPresencial(c.planCategory) === isPresencial(e.planCategory),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
    return a.id - b.id;
  });
  return matches[0];
}

/** Deriva el `RenewalRow` completo de una fila cruda (SPEC §"Estado derivado"). */
function deriveRow(
  e: ExpiringRow,
  nextSub: NextSubCandidate | null,
  lastNote: { content: string; createdAt: string } | null,
  windowDays: number,
): RenewalRow {
  const messageCount = e.messageCount ?? 0;
  const manualStatus: RenewalManualStatus = e.manualStatus ?? "en_proceso";

  let status: RenewalStatus;
  let newPlanId: number | null = null;
  let newPlanName: string | null = null;
  let renewedAt: string | null = null;
  let nextStartDate: string | null = null;
  let pauseEndDate: string | null = null;

  if (nextSub) {
    const threshold = addDaysISO(e.endDate, windowDays);
    status = nextSub.startDate <= threshold ? "renovo" : "volvio_tarde";
    newPlanId = nextSub.planId;
    newPlanName = nextSub.planName;
    renewedAt = nextSub.createdAt.toISOString();
    nextStartDate = nextSub.startDate;
  } else if (e.status === "paused") {
    status = "pausada";
    pauseEndDate = e.pauseEndDate;
  } else if (manualStatus === "no_renovo") {
    status = "no_renovo";
  } else {
    status = "en_proceso";
  }

  const manualOverridden =
    manualStatus === "no_renovo" && (status === "renovo" || status === "volvio_tarde");
  const paraCerrar = status === "en_proceso" && messageCount >= 4;

  return {
    subscriptionId: e.subscriptionId,
    userId: e.userId,
    memberName: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim(),
    phone: e.phone,
    // Botón de WhatsApp (cambio de alcance 2026-09-24): normalizado a E.164
    // según el país de la SEDE de la sub que vence — `null` si no se puede
    // normalizar con confianza (ver `normalizePhoneE164`).
    phoneE164: normalizePhoneE164(e.phone, e.branchCountry),
    branchId: e.branchId,
    branchName: e.branchName,
    planId: e.planId,
    planName: e.planName,
    endDate: e.endDate,
    daysRemaining: daysUntil(e.endDate, e.branchTimezone),
    status,
    pauseEndDate,
    newPlanId,
    newPlanName,
    renewedAt,
    nextStartDate,
    messageCount,
    lastMessageAt: e.lastMessageAt ? e.lastMessageAt.toISOString() : null,
    reasonId: status === "no_renovo" ? e.reasonId : null,
    reasonLabel: status === "no_renovo" ? e.reasonLabel : null,
    reasonNote: status === "no_renovo" ? e.reasonNote : null,
    manualStatus,
    manualOverridden,
    paraCerrar,
    lastNote,
  };
}

/** KPIs sobre las filas ya derivadas (SPEC §"KPIs"). */
function computeKpis(rows: RenewalRow[]): RenewalKpis {
  let renovo = 0;
  let volvioTarde = 0;
  let noRenovo = 0;
  let enProceso = 0;
  let sinContactar = 0;
  let pausadas = 0;
  let paraCerrar = 0;
  const planCounts = new Map<number, { planName: string; count: number }>();

  for (const r of rows) {
    switch (r.status) {
      case "renovo":
        renovo += 1;
        if (r.newPlanId !== null) {
          const entry = planCounts.get(r.newPlanId) ?? {
            planName: r.newPlanName ?? "",
            count: 0,
          };
          entry.count += 1;
          planCounts.set(r.newPlanId, entry);
        }
        break;
      case "volvio_tarde":
        volvioTarde += 1;
        break;
      case "no_renovo":
        noRenovo += 1;
        break;
      case "pausada":
        pausadas += 1;
        break;
      case "en_proceso":
        enProceso += 1;
        if (r.messageCount === 0) sinContactar += 1;
        break;
    }
    if (r.paraCerrar) paraCerrar += 1;
  }

  const gestionados = renovo + noRenovo + volvioTarde;
  const renewalRate = gestionados === 0 ? null : (renovo / gestionados) * 100;

  const newPlanDistribution: RenewalPlanDistributionEntry[] = [...planCounts.entries()]
    .map(([planId, { planName, count }]) => ({
      planId,
      planName,
      count,
      percentage: renovo === 0 ? 0 : (count / renovo) * 100,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total: rows.length,
    renovo,
    volvioTarde,
    noRenovo,
    enProceso,
    sinContactar,
    pausadas,
    paraCerrar,
    renewalRate,
    newPlanDistribution,
  };
}

export class RenewalsService {
  private memberService: MemberService;

  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {
    // Facade (CLAUDE.md §Patterns): las notas del socio son responsabilidad de
    // `MemberService` — este módulo NO duplica esa lógica (SPEC §"POST notes").
    this.memberService = new MemberService(db, log);
  }

  /**
   * `GET /api/admin/renewals` (SPEC): filas + KPIs para el rango de vencimiento.
   */
  async listRenewals(
    ctx: TenantContext,
    filters: RenewalListFilters,
  ): Promise<RenewalListResult> {
    if (filters.dateFrom > filters.dateTo) {
      throw new BadRequestError("dateFrom no puede ser posterior a dateTo");
    }
    const spanDays = Math.round(
      (new Date(filters.dateTo + "T00:00:00Z").getTime() -
        new Date(filters.dateFrom + "T00:00:00Z").getTime()) /
        86_400_000,
    );
    if (spanDays > RENEWAL_MAX_RANGE_DAYS) {
      throw new BadRequestError(
        `El rango no puede superar los ${RENEWAL_MAX_RANGE_DAYS} días`,
      );
    }

    const eRows = await this.fetchExpiringRows(ctx, filters);
    if (eRows.length === 0) {
      return { rows: [], kpis: computeKpis([]), windowDays: RENEWAL_FOLLOWUP_WINDOW_DAYS };
    }

    const userIds = [...new Set(eRows.map((r) => r.userId))];
    const [candidates, lastNotes] = await Promise.all([
      this.fetchNextSubCandidates(ctx, userIds),
      this.fetchLastNotes(ctx, userIds),
    ]);

    const rows = eRows.map((e) => {
      const nextSub = pickNextSubscription(candidates, e);
      const lastNote = lastNotes.get(e.userId) ?? null;
      return deriveRow(e, nextSub, lastNote, RENEWAL_FOLLOWUP_WINDOW_DAYS);
    });

    return { rows, kpis: computeKpis(rows), windowDays: RENEWAL_FOLLOWUP_WINDOW_DAYS };
  }

  /** El universo de subs que vencen en el rango, con su followup manual (si existe). */
  private async fetchExpiringRows(
    ctx: TenantContext,
    filters: RenewalListFilters,
  ): Promise<ExpiringRow[]> {
    const conditions = [
      tenantWhere(schema.subscriptions, ctx),
      inArray(schema.subscriptions.status, EXPIRING_STATUSES),
      gte(schema.subscriptions.endDate, filters.dateFrom),
      lte(schema.subscriptions.endDate, filters.dateTo),
      gte(schema.subscriptionPlans.durationDays, MIN_RENEWAL_PLAN_DURATION_DAYS),
      ...(filters.branchId !== undefined
        ? [eq(schema.subscriptions.branchId, filters.branchId)]
        : []),
      ...(filters.country !== undefined
        ? [eq(schema.branches.country, filters.country)]
        : []),
    ];

    const rows = await this.db
      .select({
        subscriptionId: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        branchId: schema.subscriptions.branchId,
        branchName: schema.branches.name,
        branchCountry: schema.branches.country,
        branchTimezone: schema.branches.timezone,
        planId: schema.subscriptions.planId,
        planName: schema.subscriptionPlans.name,
        planCategory: schema.subscriptionPlans.planCategory,
        status: schema.subscriptions.status,
        endDate: schema.subscriptions.endDate,
        pauseEndDate: schema.subscriptions.pauseEndDate,
        messageCount: schema.renewalFollowups.messageCount,
        lastMessageAt: schema.renewalFollowups.lastMessageAt,
        manualStatus: schema.renewalFollowups.manualStatus,
        reasonId: schema.renewalFollowups.reasonId,
        reasonNote: schema.renewalFollowups.reasonNote,
        reasonLabel: schema.renewalReasons.label,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.users,
        and(tenantWhere(schema.users, ctx), eq(schema.users.id, schema.subscriptions.userId)),
      )
      .innerJoin(schema.branches, eq(schema.branches.id, schema.subscriptions.branchId))
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .leftJoin(
        schema.renewalFollowups,
        and(
          tenantWhere(schema.renewalFollowups, ctx),
          eq(schema.renewalFollowups.subscriptionId, schema.subscriptions.id),
        ),
      )
      .leftJoin(
        schema.renewalReasons,
        and(
          tenantWhere(schema.renewalReasons, ctx),
          eq(schema.renewalReasons.id, schema.renewalFollowups.reasonId),
        ),
      )
      .where(and(...conditions))
      .orderBy(schema.subscriptions.endDate, schema.users.firstName, schema.users.lastName);

    return rows.map((r) => ({
      ...r,
      endDate: r.endDate ?? "",
      // `branches.country` es varchar(2) sin enum en el schema (Drizzle lo
      // infiere como `string`) — se angosta acá al literal, mismo patrón que
      // `resolveBranchCountry` (shared/country-scope.ts): cualquier valor que
      // no sea 'ES' cae en 'AR' (default de la propia columna en el schema).
      branchCountry: r.branchCountry === "ES" ? ("ES" as const) : ("AR" as const),
    }));
  }

  /** Universo batch de subs candidatas a "sub siguiente" — ver docblock del archivo. */
  private async fetchNextSubCandidates(
    ctx: TenantContext,
    userIds: number[],
  ): Promise<NextSubCandidate[]> {
    const rows = await this.db
      .select({
        id: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
        planId: schema.subscriptions.planId,
        planName: schema.subscriptionPlans.name,
        planCategory: schema.subscriptionPlans.planCategory,
        startDate: schema.subscriptions.startDate,
        endDate: schema.subscriptions.endDate,
        createdAt: schema.subscriptions.createdAt,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx),
          inArray(schema.subscriptions.userId, userIds),
          ne(schema.subscriptions.status, "cancelled"),
          // Mismo corte que la fila que vence: comprar una CLASE ÚNICA/SUELTA
          // después de vencer NO es renovar el plan.
          gte(schema.subscriptionPlans.durationDays, MIN_RENEWAL_PLAN_DURATION_DAYS),
        ),
      );
    return rows;
  }

  /** Última `member_notes` por socio — reducido en JS (ver docblock del archivo). */
  private async fetchLastNotes(
    ctx: TenantContext,
    userIds: number[],
  ): Promise<Map<number, { content: string; createdAt: string }>> {
    const rows = await this.db
      .select({
        userId: schema.memberNotes.userId,
        content: schema.memberNotes.content,
        createdAt: schema.memberNotes.createdAt,
      })
      .from(schema.memberNotes)
      .where(
        and(tenantWhere(schema.memberNotes, ctx), inArray(schema.memberNotes.userId, userIds)),
      )
      .orderBy(desc(schema.memberNotes.createdAt), desc(schema.memberNotes.id));

    const map = new Map<number, { content: string; createdAt: string }>();
    for (const r of rows) {
      if (!map.has(r.userId)) {
        map.set(r.userId, { content: r.content, createdAt: r.createdAt.toISOString() });
      }
    }
    return map;
  }

  /**
   * Resuelve la fila derivada de UNA sub puntual — reusa `fetchExpiringRows`
   * con un rango de UN día (`[endDate, endDate]`) para no duplicar la query
   * principal, y agrega la sub misma como candidata (por si vive fuera del
   * rango de vencimiento consultado, algo irrelevante para el matching de
   * "sub siguiente"). Usado por `updateFollowup`/`addNote` para devolver la
   * fila recalculada después de escribir.
   */
  private async fetchSingleRow(
    ctx: TenantContext,
    subscriptionId: number,
  ): Promise<RenewalRow | null> {
    const [sub] = await this.db
      .select({ endDate: schema.subscriptions.endDate })
      .from(schema.subscriptions)
      .where(and(tenantWhere(schema.subscriptions, ctx), eq(schema.subscriptions.id, subscriptionId)))
      .limit(1);
    if (!sub || sub.endDate === null) return null;

    const [eRows, candidates, lastNotes] = await Promise.all([
      this.fetchExpiringRows(ctx, { dateFrom: sub.endDate, dateTo: sub.endDate }),
      this.fetchNextSubCandidatesForSubscription(ctx, subscriptionId),
      this.fetchLastNotesForSubscription(ctx, subscriptionId),
    ]);
    const e = eRows.find((r) => r.subscriptionId === subscriptionId);
    if (!e) return null;

    const nextSub = pickNextSubscription(candidates, e);
    const lastNote = lastNotes.get(e.userId) ?? null;
    return deriveRow(e, nextSub, lastNote, RENEWAL_FOLLOWUP_WINDOW_DAYS);
  }

  private async fetchNextSubCandidatesForSubscription(
    ctx: TenantContext,
    subscriptionId: number,
  ): Promise<NextSubCandidate[]> {
    const [sub] = await this.db
      .select({ userId: schema.subscriptions.userId })
      .from(schema.subscriptions)
      .where(and(tenantWhere(schema.subscriptions, ctx), eq(schema.subscriptions.id, subscriptionId)))
      .limit(1);
    if (!sub) return [];
    return this.fetchNextSubCandidates(ctx, [sub.userId]);
  }

  private async fetchLastNotesForSubscription(
    ctx: TenantContext,
    subscriptionId: number,
  ): Promise<Map<number, { content: string; createdAt: string }>> {
    const [sub] = await this.db
      .select({ userId: schema.subscriptions.userId })
      .from(schema.subscriptions)
      .where(and(tenantWhere(schema.subscriptions, ctx), eq(schema.subscriptions.id, subscriptionId)))
      .limit(1);
    if (!sub) return new Map();
    return this.fetchLastNotes(ctx, [sub.userId]);
  }

  /**
   * Resuelve `subscriptions.branchId` de una sub del tenant, o `null` si no
   * existe/no es del tenant. Fail-closed cross-tenant: 404, nunca 403 (SPEC
   * §"PATCH .../:subscriptionId" — "Recurso ajeno ⇒ 404, nunca 403").
   */
  private async resolveSubscriptionBranch(
    ctx: TenantContext,
    subscriptionId: number,
  ): Promise<{ branchId: number; userId: number; branchCountry: string } | null> {
    const [row] = await this.db
      .select({
        branchId: schema.subscriptions.branchId,
        userId: schema.subscriptions.userId,
        branchCountry: schema.branches.country,
      })
      .from(schema.subscriptions)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.subscriptions.branchId))
      .where(and(tenantWhere(schema.subscriptions, ctx), eq(schema.subscriptions.id, subscriptionId)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Chequea que `subscriptionId` exista en el tenant y en el alcance del
   * actor. Recurso ajeno (inexistente, fuera de sede forzada O de otro país)
   * ⇒ 404 SIEMPRE (SPEC), nunca 403 — mismo criterio ISO-03 que
   * `ReportsService.updateDebtManagement`, salvo que ACÁ el mismatch de país
   * también es 404 (el SPEC de este módulo lo pide explícito, a diferencia
   * de `updateDebtManagement` que devuelve 403 en ese caso).
   */
  private async assertSubscriptionInScope(
    ctx: TenantContext,
    subscriptionId: number,
    actor: RenewalActorScope,
  ): Promise<{ branchId: number; userId: number }> {
    const sub = await this.resolveSubscriptionBranch(ctx, subscriptionId);
    if (!sub) {
      throw new NotFoundError("Suscripción no encontrada");
    }
    if (actor.branchIds != null) {
      assertBranchInEnforcedScope(sub.branchId, actor.branchIds, "Suscripción no encontrada");
    } else if (!actor.isOwner) {
      // admin/gestion: sin alcance forzado por sede, pero SÍ por país (mismo
      // recorte que `listRenewals` aplica vía `filters.country`) — sin esto,
      // un admin de Argentina podría PATCHear/anotar una sub de una sede de
      // España del MISMO tenant.
      if (actor.country === null || sub.branchCountry !== actor.country) {
        throw new NotFoundError("Suscripción no encontrada");
      }
    }
    return sub;
  }

  /**
   * `PATCH /api/admin/renewals/:subscriptionId` (SPEC): upsert del followup
   * manual, dentro de una transacción con el `audit_log`.
   */
  async updateFollowup(
    ctx: TenantContext,
    subscriptionId: number,
    input: RenewalFollowupUpdateInput,
    actor: RenewalActorScope,
  ): Promise<RenewalRow> {
    const subRow = await this.assertSubscriptionInScope(ctx, subscriptionId, actor);
    // Solo subs que la pantalla lista (estado/plan elegibles): sin esto se
    // podía escribir un followup sobre una sub cancelada y recién después
    // responder 404.
    if (!(await this.fetchSingleRow(ctx, subscriptionId))) {
      throw new NotFoundError("Suscripción no encontrada");
    }

    const [before] = await this.db
      .select()
      .from(schema.renewalFollowups)
      .where(
        and(
          tenantWhere(schema.renewalFollowups, ctx),
          eq(schema.renewalFollowups.subscriptionId, subscriptionId),
        ),
      )
      .limit(1);

    const finalManualStatus: RenewalManualStatus =
      input.manualStatus ?? before?.manualStatus ?? "en_proceso";

    let resolvedReasonId: number | null;
    let resolvedReasonNote: string | null;

    if (finalManualStatus === "no_renovo") {
      // Resuelto EXPLÍCITAMENTE contra `input.reasonId` (incluso si vino
      // `null`) — un PATCH `{ manualStatus: "no_renovo", reasonId: null }` NO
      // puede colarse sin motivo con solo pasar `null` en vez de omitir el
      // campo (el `!== undefined` de la versión anterior lo dejaba pasar).
      resolvedReasonId =
        input.reasonId !== undefined ? input.reasonId : (before?.reasonId ?? null);
      if (resolvedReasonId === null) {
        throw new ReasonRequiredError();
      }
      // Solo revalida contra la DB cuando ESTE PATCH toca el motivo o recién
      // transiciona a no_renovo — un PATCH que solo mueve `messageCount`
      // sobre una fila que ya estaba en no_renovo no repite el chequeo (si el
      // motivo se desactivó DESPUÉS, esa es una decisión de otra pantalla, no
      // algo que este PATCH deba rechazar retroactivamente).
      const debeValidarMotivo =
        input.reasonId !== undefined ||
        (input.manualStatus === "no_renovo" && before?.manualStatus !== "no_renovo");
      if (debeValidarMotivo) {
        const [reason] = await this.db
          .select({ id: schema.renewalReasons.id })
          .from(schema.renewalReasons)
          .where(
            and(
              tenantWhere(schema.renewalReasons, ctx),
              eq(schema.renewalReasons.id, resolvedReasonId),
              eq(schema.renewalReasons.isActive, true),
            ),
          )
          .limit(1);
        if (!reason) {
          throw new ReasonRequiredError("Motivo inválido o inactivo");
        }
      }
      resolvedReasonNote =
        input.reasonNote !== undefined ? input.reasonNote : (before?.reasonNote ?? null);
    } else {
      // Volver a en_proceso limpia el motivo (SPEC línea 33), sin importar lo
      // que venga en el body.
      resolvedReasonId = null;
      resolvedReasonNote = null;
    }

    const finalMessageCount = input.messageCount ?? before?.messageCount ?? 0;
    const messageChanged =
      input.messageCount !== undefined && input.messageCount !== (before?.messageCount ?? 0);
    const finalLastMessageAt = messageChanged ? new Date() : (before?.lastMessageAt ?? null);

    await this.db.transaction(async (tx: TxHandle) => {
      await tx
        .insert(schema.renewalFollowups)
        .values(
          tenantValues(ctx, {
            subscriptionId,
            userId: subRow.userId,
            messageCount: finalMessageCount,
            lastMessageAt: finalLastMessageAt,
            manualStatus: finalManualStatus,
            reasonId: resolvedReasonId,
            reasonNote: resolvedReasonNote,
            updatedBy: actor.userId,
          }),
        )
        .onDuplicateKeyUpdate({
          set: {
            messageCount: finalMessageCount,
            ...(messageChanged ? { lastMessageAt: finalLastMessageAt } : {}),
            manualStatus: finalManualStatus,
            reasonId: resolvedReasonId,
            reasonNote: resolvedReasonNote,
            updatedBy: actor.userId,
          },
        });

      const [after] = await tx
        .select()
        .from(schema.renewalFollowups)
        .where(
          and(
            tenantWhere(schema.renewalFollowups, ctx),
            eq(schema.renewalFollowups.subscriptionId, subscriptionId),
          ),
        )
        .limit(1);

      await auditLog.write(ctx, tx, {
        actorId: actor.userId,
        action: "renewal_followup_updated",
        targetKind: "renewal_followup",
        targetId: after?.id ?? 0,
        payload: { before: before ?? null, after: after ?? null },
      });
    });

    const row = await this.fetchSingleRow(ctx, subscriptionId);
    if (!row) throw new NotFoundError("Suscripción no encontrada");
    return row;
  }

  /** `POST /api/admin/renewals/:subscriptionId/notes` (SPEC): reusa `MemberService.createNote`. */
  async addNote(
    ctx: TenantContext,
    subscriptionId: number,
    content: string,
    actor: RenewalActorScope,
  ): Promise<MemberNote> {
    const sub = await this.assertSubscriptionInScope(ctx, subscriptionId, actor);
    return this.memberService.createNote(ctx, actor.userId, { userId: sub.userId, content });
  }

  // ─── Motivos ────────────────────────────────────────────────────────────

  async listReasons(ctx: TenantContext, includeInactive: boolean): Promise<RenewalReason[]> {
    const rows = await this.db
      .select({
        id: schema.renewalReasons.id,
        label: schema.renewalReasons.label,
        sortOrder: schema.renewalReasons.sortOrder,
        isActive: schema.renewalReasons.isActive,
      })
      .from(schema.renewalReasons)
      .where(
        and(
          tenantWhere(schema.renewalReasons, ctx),
          ...(includeInactive ? [] : [eq(schema.renewalReasons.isActive, true)]),
        ),
      )
      .orderBy(schema.renewalReasons.sortOrder, schema.renewalReasons.label);
    return rows;
  }

  async createReason(ctx: TenantContext, input: RenewalReasonCreateInput): Promise<RenewalReason> {
    const label = input.label.trim();
    if (label.length === 0) {
      throw new BadRequestError("La etiqueta no puede estar vacía");
    }

    const [{ maxSort }] = await this.db
      .select({
        maxSort: schema.renewalReasons.sortOrder,
      })
      .from(schema.renewalReasons)
      .where(tenantWhere(schema.renewalReasons, ctx))
      .orderBy(desc(schema.renewalReasons.sortOrder))
      .limit(1)
      .then((rows) => (rows.length > 0 ? rows : [{ maxSort: -1 }]));

    try {
      const result = await this.db
        .insert(schema.renewalReasons)
        .values(tenantValues(ctx, { label, sortOrder: maxSort + 1 }));
      const id = Number(result[0].insertId);
      return { id, label, sortOrder: maxSort + 1, isActive: true };
    } catch (err: unknown) {
      const { isDuplicate } = isDuplicateKeyError(err);
      if (isDuplicate) {
        throw new ConflictError("Ya existe un motivo con esa etiqueta");
      }
      throw err;
    }
  }

  async updateReason(
    ctx: TenantContext,
    reasonId: number,
    input: RenewalReasonUpdateInput,
  ): Promise<RenewalReason> {
    const [existing] = await this.db
      .select({ id: schema.renewalReasons.id })
      .from(schema.renewalReasons)
      .where(and(tenantWhere(schema.renewalReasons, ctx), eq(schema.renewalReasons.id, reasonId)))
      .limit(1);
    if (!existing) {
      throw new NotFoundError("Motivo no encontrado");
    }

    const label = input.label?.trim();
    if (label !== undefined && label.length === 0) {
      throw new BadRequestError("La etiqueta no puede estar vacía");
    }

    try {
      await this.db
        .update(schema.renewalReasons)
        .set({
          ...(label !== undefined ? { label } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        })
        .where(and(tenantWhere(schema.renewalReasons, ctx), eq(schema.renewalReasons.id, reasonId)));
    } catch (err: unknown) {
      const { isDuplicate } = isDuplicateKeyError(err);
      if (isDuplicate) {
        throw new ConflictError("Ya existe un motivo con esa etiqueta");
      }
      throw err;
    }

    const [updated] = await this.db
      .select({
        id: schema.renewalReasons.id,
        label: schema.renewalReasons.label,
        sortOrder: schema.renewalReasons.sortOrder,
        isActive: schema.renewalReasons.isActive,
      })
      .from(schema.renewalReasons)
      .where(and(tenantWhere(schema.renewalReasons, ctx), eq(schema.renewalReasons.id, reasonId)))
      .limit(1);
    if (!updated) throw new NotFoundError("Motivo no encontrado");
    return updated;
  }
}
