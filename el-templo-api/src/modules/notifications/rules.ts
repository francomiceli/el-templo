/**
 * Motor de reglas de notificaciones propias — pedido de Franco (2026-09-03).
 *
 * Una plantilla `kind: 'custom'` lleva una condición recetada (catálogo
 * cerrado `RULE_TRIGGERS`), un alcance opcional (sedes/países) y una
 * cadencia (`cooldownDays`). `evaluateCustomRulesForTenant` corre UNA VEZ
 * POR TENANT (el job `jobs/notification-rules.ts` la envuelve en
 * `forEachActiveTenant`) y por cada regla activa:
 *   1. resuelve los socios que HOY cumplen la condición (una query por
 *      trigger — todas parten de socios ACTIVOS, no borrados, con rol
 *      `member`, mismo criterio que `POST /admin/send-segment`),
 *   2. los filtra por alcance (sede/país, null = sin filtro),
 *   3. descarta a quien ya recibió ESTA MISMA regla dentro de la ventana
 *      de `cooldownDays`,
 *   4. encola vía `NotificationService.queueNotification` — así se
 *      respetan preferencias, copy por género y el guard de device token
 *      sin duplicar esa lógica acá.
 *
 * `countAudienceForRule` corre SOLO los pasos 1-2 (sin cooldown ni encolado)
 * para el preview del editor admin ("hoy alcanzaría N socios").
 */
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { addDays, todayInTz } from "../shared/date-utils";
import { deriveCoveredUntilBatch } from "../subscriptions/service";
import type { NotificationService } from "./service";
import type { MemberSegment } from "../segmentation/types";

type DbInstance = MySql2Database<typeof schema>;

const AR_TZ = "America/Argentina/Buenos_Aires";

// ── Catálogo cerrado ────────────────────────────────────────────────────────

export type RuleTriggerType =
  | "plan_expires_in_days"
  | "plan_expired_days_ago"
  | "days_without_attendance"
  | "member_since_days"
  | "segment_is";

export interface RuleTriggerDef {
  type: RuleTriggerType;
  label: string;
  /** Si el trigger necesita `triggerValue` (N días). */
  requiresValue: boolean;
  /** Si el trigger necesita `triggerSegment`. */
  requiresSegment: boolean;
  minValue?: number;
  maxValue?: number;
}

/**
 * Las 5 condiciones recetadas (catálogo cerrado, D-01 del plan). Agregar una
 * es un cambio de código chico: sumar acá + un `case` nuevo en
 * `resolveTriggerCandidates`.
 */
export const RULE_TRIGGERS: readonly RuleTriggerDef[] = [
  {
    type: "plan_expires_in_days",
    label: "El plan vence en N días",
    requiresValue: true,
    requiresSegment: false,
    minValue: 0,
    maxValue: 365,
  },
  {
    type: "plan_expired_days_ago",
    label: "El plan venció hace N días",
    requiresValue: true,
    requiresSegment: false,
    minValue: 1,
    maxValue: 365,
  },
  {
    type: "days_without_attendance",
    label: "N días sin asistir",
    requiresValue: true,
    requiresSegment: false,
    minValue: 1,
    maxValue: 365,
  },
  {
    type: "member_since_days",
    label: "Cumple N días de antigüedad",
    requiresValue: true,
    requiresSegment: false,
    minValue: 0,
    maxValue: 365,
  },
  {
    type: "segment_is",
    label: "Su segmento es",
    requiresValue: false,
    requiresSegment: true,
  },
];

const RULE_TRIGGER_BY_TYPE: ReadonlyMap<RuleTriggerType, RuleTriggerDef> =
  new Map(RULE_TRIGGERS.map((t) => [t.type, t]));

export function findRuleTrigger(type: string): RuleTriggerDef | undefined {
  return RULE_TRIGGER_BY_TYPE.get(type as RuleTriggerType);
}

/**
 * Cobertura (covered-until) de una lista de socios en UNA query. Envuelve
 * `deriveCoveredUntilBatch` y devuelve `null` para los que no figuran (misma
 * semántica que la versión de a uno). Evita el N+1 por candidato que el
 * codebase ya documenta como bug real (`subscriptions/service.ts`).
 */
async function coverageFor(
  db: MySql2Database<typeof schema>,
  userIds: number[],
  ctx: TenantContext,
): Promise<Map<number, string | null>> {
  if (userIds.length === 0) return new Map();
  return deriveCoveredUntilBatch(db, userIds, ctx);
}

// ── Input compartido por preview y evaluación real ──────────────────────────

export interface RuleConditionInput {
  triggerType: RuleTriggerType;
  triggerValue: number | null;
  triggerSegment: MemberSegment | null;
  scopeBranchIds: number[] | null;
  scopeCountries: string[] | null;
}

interface ActiveMember {
  userId: number;
  branchId: number;
  country: string;
  createdAt: Date;
}

/**
 * Socios ACTIVOS, no borrados, rol `member` (mismo criterio que
 * `POST /admin/send-segment`, `routes.ts` L505-606) — la base de audiencia
 * de CUALQUIER regla. Trae `branchId`/`country`/`createdAt` para resolver
 * alcance y el trigger `member_since_days` sin una query aparte.
 */
async function loadActiveMembers(
  db: DbInstance,
  ctx: TenantContext,
): Promise<ActiveMember[]> {
  const rows = await db
    .select({
      userId: schema.users.id,
      branchId: schema.users.branchId,
      country: schema.branches.country,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .innerJoin(
      schema.branches,
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.users.branchId, schema.branches.id),
      ),
    )
    .where(
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.role, "member"),
        eq(schema.users.status, "activo"),
        isNull(schema.users.deletedAt),
      ),
    );

  return rows;
}

/** Aplica el alcance (sede/país, `null` = sin filtro) sobre la lista de socios activos. */
function applyScope(
  members: ActiveMember[],
  scopeBranchIds: number[] | null,
  scopeCountries: string[] | null,
): ActiveMember[] {
  const branchSet = scopeBranchIds ? new Set(scopeBranchIds) : null;
  const countrySet = scopeCountries ? new Set(scopeCountries) : null;
  return members.filter((m) => {
    if (branchSet && !branchSet.has(m.branchId)) return false;
    if (countrySet && !countrySet.has(m.country)) return false;
    return true;
  });
}

/**
 * Resuelve los `userId` que cumplen el trigger HOY, ANTES de aplicar
 * alcance (eso lo hace el llamador cruzando contra `loadActiveMembers`).
 * Una query dedicada por trigger — nunca trae más de lo que el trigger
 * necesita.
 */
async function resolveTriggerCandidates(
  db: DbInstance,
  ctx: TenantContext,
  members: ActiveMember[],
  condition: RuleConditionInput,
  today: string,
): Promise<Set<number>> {
  const activeIds = new Set(members.map((m) => m.userId));

  switch (condition.triggerType) {
    case "plan_expires_in_days": {
      const n = condition.triggerValue ?? 0;
      const target = addDays(today, n);
      const rows = await db
        .selectDistinct({ userId: schema.subscriptions.userId })
        .from(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, ctx),
            inArray(schema.subscriptions.status, ["active", "scheduled"]),
            eq(schema.subscriptions.endDate, target),
          ),
        );

      const candidates = rows.map((r) => r.userId).filter((id) => activeIds.has(id));
      const coverage = await coverageFor(db, candidates, ctx);
      const result = new Set<number>();
      for (const userId of candidates) {
        // D-05 (mismo criterio que runPlanRenewalWarnings): si ya renovó, el
        // covered-until real corre más allá del target -> se suprime.
        if ((coverage.get(userId) ?? null) === target) result.add(userId);
      }
      return result;
    }

    case "plan_expired_days_ago": {
      const n = condition.triggerValue ?? 1;
      const target = addDays(today, -n);
      const rows = await db
        .selectDistinct({ userId: schema.subscriptions.userId })
        .from(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, ctx),
            // Solo vencimientos REALES: una suscripción cancelada/cambiada/
            // completada con end_date = target no "venció", la cerró alguien.
            // Mismo criterio de estados que `plan_expires_in_days`, más
            // `expired` (el cron ya la pudo marcar como vencida).
            inArray(schema.subscriptions.status, ["active", "expired"]),
            eq(schema.subscriptions.endDate, target),
          ),
        );

      const candidates = rows.map((r) => r.userId).filter((id) => activeIds.has(id));
      const coverage = await coverageFor(db, candidates, ctx);
      const result = new Set<number>();
      for (const userId of candidates) {
        // Sin otra suscripción activa/scheduled que cubra HOY -> no renovó.
        const coveredUntil = coverage.get(userId) ?? null;
        if (coveredUntil === null || coveredUntil < today) result.add(userId);
      }
      return result;
    }

    case "days_without_attendance": {
      const n = condition.triggerValue ?? 1;
      const target = addDays(today, -n);
      const rows = await db
        .select({
          userId: schema.attendance.memberId,
          lastDate: sql<string>`MAX(${schema.attendance.sessionDate})`,
        })
        .from(schema.attendance)
        .where(tenantWhere(schema.attendance, ctx))
        .groupBy(schema.attendance.memberId)
        .having(sql`MAX(${schema.attendance.sessionDate}) = ${target}`);

      const candidates = rows.map((r) => r.userId).filter((id) => activeIds.has(id));
      const coverage = await coverageFor(db, candidates, ctx);
      const result = new Set<number>();
      for (const userId of candidates) {
        // Con suscripción activa HOY (si ya no entrena y tampoco tiene plan
        // vigente, lo cubre `plan_expired_days_ago`, no este trigger).
        const coveredUntil = coverage.get(userId) ?? null;
        if (coveredUntil !== null && coveredUntil >= today) result.add(userId);
      }
      return result;
    }

    case "member_since_days": {
      const n = condition.triggerValue ?? 0;
      const target = addDays(today, -n);
      const result = new Set<number>();
      for (const m of members) {
        if (todayInTz(AR_TZ, m.createdAt) === target) result.add(m.userId);
      }
      return result;
    }

    case "segment_is": {
      if (!condition.triggerSegment) return new Set();
      const rows = await db
        .select({ userId: schema.memberProfiles.userId })
        .from(schema.memberProfiles)
        .where(
          and(
            tenantWhere(schema.memberProfiles, ctx),
            eq(schema.memberProfiles.segment, condition.triggerSegment),
          ),
        );
      const result = new Set<number>();
      for (const row of rows) {
        if (activeIds.has(row.userId)) result.add(row.userId);
      }
      return result;
    }

    default:
      return new Set();
  }
}

/**
 * Pasos 1-2 (candidatos + alcance), SIN cooldown ni encolado — usado por el
 * preview del editor admin ("hoy alcanzaría N socios") y por el motor real.
 */
export async function resolveAudienceForRule(
  db: DbInstance,
  ctx: TenantContext,
  condition: RuleConditionInput,
  today: string,
): Promise<number[]> {
  const members = await loadActiveMembers(db, ctx);
  const scoped = applyScope(
    members,
    condition.scopeBranchIds,
    condition.scopeCountries,
  );
  const scopedIds = new Set(scoped.map((m) => m.userId));

  const candidates = await resolveTriggerCandidates(
    db,
    ctx,
    members,
    condition,
    today,
  );

  return [...candidates].filter((id) => scopedIds.has(id));
}

/** Preview: cuántos socios alcanzaría la regla HOY (sin encolar nada). */
export async function countAudienceForRule(
  db: DbInstance,
  ctx: TenantContext,
  condition: RuleConditionInput,
  today: string,
): Promise<number> {
  const ids = await resolveAudienceForRule(db, ctx, condition, today);
  return ids.length;
}

// ── Evaluación real (job diario) ────────────────────────────────────────────

export interface EvaluateCustomRulesResult {
  rulesEvaluated: number;
  queued: number;
  skippedCooldown: number;
}

/**
 * Corre TODAS las reglas propias (`kind: 'custom' AND is_enabled=1`) de UN
 * tenant. El caller (`jobs/notification-rules.ts`) la llama una vez por
 * gimnasio activo vía `forEachActiveTenant` — esta función NO tiene su
 * propio barrido multi-tenant.
 */
export async function evaluateCustomRulesForTenant(
  db: DbInstance,
  service: NotificationService,
  ctx: TenantContext,
  today: string,
  log: FastifyBaseLogger,
): Promise<EvaluateCustomRulesResult> {
  const result: EvaluateCustomRulesResult = {
    rulesEvaluated: 0,
    queued: 0,
    skippedCooldown: 0,
  };

  const rules = await db
    .select()
    .from(schema.notificationTemplates)
    .where(
      and(
        tenantWhere(schema.notificationTemplates, ctx),
        eq(schema.notificationTemplates.kind, "custom"),
        eq(schema.notificationTemplates.isEnabled, true),
      ),
    );

  for (const rule of rules) {
    if (!rule.triggerType) {
      log.warn(
        { templateId: rule.id, templateKey: rule.templateKey },
        "Regla custom sin trigger_type — se salta",
      );
      continue;
    }

    result.rulesEvaluated++;

    const condition: RuleConditionInput = {
      triggerType: rule.triggerType as RuleTriggerType,
      triggerValue: rule.triggerValue,
      triggerSegment: rule.triggerSegment as MemberSegment | null,
      scopeBranchIds: (rule.scopeBranchIds as number[] | null) ?? null,
      scopeCountries: (rule.scopeCountries as string[] | null) ?? null,
    };

    let candidateIds: number[];
    try {
      candidateIds = await resolveAudienceForRule(db, ctx, condition, today);
    } catch (err: unknown) {
      log.error(
        { err, templateId: rule.id, templateKey: rule.templateKey },
        "Falló la resolución de audiencia de una regla custom — se salta",
      );
      continue;
    }
    if (candidateIds.length === 0) continue;

    // Cadencia (D-cooldown): descarta a quien ya recibió ESTA MISMA regla
    // dentro de la ventana de `cooldownDays`.
    const recentRows = await db
      .select({ userId: schema.pendingNotifications.userId })
      .from(schema.pendingNotifications)
      .where(
        and(
          tenantWhere(schema.pendingNotifications, ctx),
          eq(schema.pendingNotifications.templateId, rule.id),
          inArray(schema.pendingNotifications.userId, candidateIds),
          gte(
            schema.pendingNotifications.createdAt,
            sql`DATE_SUB(NOW(), INTERVAL ${rule.cooldownDays} DAY)`,
          ),
        ),
      );
    const recentSet = new Set(recentRows.map((r) => r.userId));

    for (const userId of candidateIds) {
      if (recentSet.has(userId)) {
        result.skippedCooldown++;
        continue;
      }
      try {
        const queued = await service.queueNotification({
          userId,
          templateKey: rule.templateKey,
        });
        if (queued >= 0) result.queued++;
      } catch (err: unknown) {
        log.error(
          { err, userId, templateId: rule.id, templateKey: rule.templateKey },
          "Falló el encolado de una regla custom para un socio — se sigue con el resto",
        );
      }
    }
  }

  return result;
}
