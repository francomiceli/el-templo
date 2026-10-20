// Fase 197: extraído de sessions/routes.ts para que /weekly y la canasta compartan gate y forma
import { eq, and, or, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { PRESENCIAL_GROUP_CATEGORIES } from "../subscriptions/types";
import type { LevelGroup } from "./types";
import { isKairos } from "./pipeline/utils/kairos";
import { tenantWhere, type TenantContext } from "../shared/tenant";

/**
 * Map individual level to level group for session generation
 */
export function levelToLevelGroup(level: string): LevelGroup {
  switch (level) {
    // Phase 129 (D-02): kairos reuses the alfa_delta group. The default already
    // returns alfa_delta, but the explicit case prevents silent misrouting if
    // the default ever changes.
    case "kairos":
    case "alfa":
    case "delta":
      return "alfa_delta";
    case "sigma":
      return "sigma";
    case "omega":
    case "spartan":
      return "omega";
    default:
      return "alfa_delta";
  }
}

/**
 * Build the ordered list of candidate dayIds to try for a member on a given
 * week/day, most-specific first. The caller resolves the first candidate that
 * has an approved session.
 *
 * Fallback chain for a goal-plan member (Phase 83 GP-{type} views):
 *   1. GP-{type}-W{week}-{day}-{level}   curated goal-plan session
 *   2. GP-{type}-W{week}-{day}-alfa      (only when level is kairos)
 *   3. W{week}-{day}-{level}             Foundation (templo) session
 *   4. W{week}-{day}-alfa               (only when level is kairos)
 *
 * Goal-plan libraries are authored up to a fixed week while /daily and /weekly
 * index by calendar week, so once the calendar passes the last authored week a
 * goal-plan member has no curated session. Rather than 404, they fall back to
 * the Foundation session for the same week/day/level — the same content that
 * presencial/Foundation members receive. This mirrors the kairos→alfa fallback.
 *
 * Foundation/templo members (buildAsTemplo, or a program with no goalPlanType)
 * only ever resolve to the templo W* dayId.
 */
export function buildDayIdCandidates(
  buildAsTemplo: boolean,
  goalPlanType: string | null,
  week: number,
  dayName: string,
  effectiveLevel: string,
): string[] {
  const templo = (lvl: string): string => `W${week}-${dayName}-${lvl}`;
  const candidates: string[] = [];
  if (!buildAsTemplo && goalPlanType) {
    const gp = (lvl: string): string =>
      `GP-${goalPlanType}-W${week}-${dayName}-${lvl}`;
    candidates.push(gp(effectiveLevel));
    if (effectiveLevel === "kairos") candidates.push(gp("alfa"));
    // Foundation fallback (see docblock).
    candidates.push(templo(effectiveLevel));
    if (effectiveLevel === "kairos") candidates.push(templo("alfa"));
  } else {
    candidates.push(templo(effectiveLevel));
    if (effectiveLevel === "kairos") candidates.push(templo("alfa"));
  }
  return candidates;
}

// =============================================================================
// Phase 104 R7 + R8: view resolution + ownership gating for session endpoints
// =============================================================================
//
// Both `/sessions/daily` and `/sessions/weekly` need identical "which view does
// this user see, and are they allowed to see it?" logic. The helper below
// returns one of:
//   - { kind: "templo" } — build W* dayIds
//   - { kind: "program", enrollment } — build GP-{type}-* dayIds (or W* if
//     enrollment.goalPlanType is NULL, e.g. Foundation programs per Phase 83)
//   - { kind: "deny", status, message } — handler returns the matching HTTP
//     status with the Spanish message verbatim
//
// Spec mapping:
//   R7 — `view=templo` requires active presencial subscription; `view=program`
//        requires `currentProgramEnrollmentId` pointing at an active enrollment
//        owned by the user.
//   R8 — Default resolution (no `view` param): prefer current program if the
//        pointer is valid, else templo if presencial active, else first active
//        enrollment by id ASC, else 404.
export type ResolveViewResult =
  | { kind: "templo" }
  | {
      kind: "program";
      enrollment: {
        id: number;
        programId: number;
        goalPlanType: string | null;
      };
    }
  | { kind: "deny"; status: 403 | 404; message: string };

export async function resolveSessionView(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  userId: number,
  requested: "templo" | "program" | undefined,
): Promise<ResolveViewResult> {
  // 1. Active presencial subscription? Active OR paused both count — paused
  //    members retain plan access (consistent with rest of app per
  //    subscription state machine). Por GRUPO presencial (fase 177): el
  //    paquete de clases es presencial-flexible y también accede a las
  //    sesiones del Templo — con el literal 'presencial' respondía 403.
  const [presencialSub] = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .innerJoin(
      schema.subscriptionPlans,
      eq(schema.subscriptions.planId, schema.subscriptionPlans.id),
    )
    .where(
      and(
        tenantWhere(schema.subscriptions, ctx),
        eq(schema.subscriptions.userId, userId),
        or(
          eq(schema.subscriptions.status, "active"),
          eq(schema.subscriptions.status, "paused"),
        ),
        inArray(
          schema.subscriptionPlans.planCategory,
          PRESENCIAL_GROUP_CATEGORIES,
        ),
      ),
    )
    .limit(1);
  const hasPresencial = !!presencialSub;

  // 2. Read user's currentProgramEnrollmentId pointer (Phase 104 Plan 01).
  // T-173-09-01: `users` es tabla strict.
  const [user] = await db
    .select({
      currentProgramEnrollmentId: schema.users.currentProgramEnrollmentId,
    })
    .from(schema.users)
    .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
    .limit(1);

  async function loadEnrollment(enrollmentId: number) {
    const [row] = await db
      .select({
        id: schema.programEnrollments.id,
        userId: schema.programEnrollments.userId,
        programId: schema.programEnrollments.programId,
        status: schema.programEnrollments.status,
        goalPlanType: schema.programs.goalPlanType,
      })
      .from(schema.programEnrollments)
      .innerJoin(
        schema.programs,
        eq(schema.programs.id, schema.programEnrollments.programId),
      )
      .where(eq(schema.programEnrollments.id, enrollmentId))
      .limit(1);
    return row ?? null;
  }

  if (requested === "templo") {
    if (!hasPresencial) {
      return {
        kind: "deny",
        status: 403,
        message:
          "Necesitas un plan presencial activo para ver las sesiones del Templo",
      };
    }
    return { kind: "templo" };
  }

  if (requested === "program") {
    if (!user || user.currentProgramEnrollmentId === null) {
      return {
        kind: "deny",
        status: 404,
        message: "No tenes un programa activo seleccionado",
      };
    }
    const enrollment = await loadEnrollment(user.currentProgramEnrollmentId);
    if (
      !enrollment ||
      enrollment.userId !== userId ||
      enrollment.status !== "active"
    ) {
      return {
        kind: "deny",
        status: 403,
        message:
          "Necesitas estar inscripto en un programa para ver estas sesiones",
      };
    }
    return {
      kind: "program",
      enrollment: {
        id: enrollment.id,
        programId: enrollment.programId,
        goalPlanType: enrollment.goalPlanType,
      },
    };
  }

  // No `view` param — derive default per R8.
  if (
    user?.currentProgramEnrollmentId !== null &&
    user?.currentProgramEnrollmentId !== undefined
  ) {
    const enrollment = await loadEnrollment(user.currentProgramEnrollmentId);
    if (
      enrollment &&
      enrollment.userId === userId &&
      enrollment.status === "active"
    ) {
      return {
        kind: "program",
        enrollment: {
          id: enrollment.id,
          programId: enrollment.programId,
          goalPlanType: enrollment.goalPlanType,
        },
      };
    }
    // Pointer is stale — fall through to templo or first enrollment.
  }
  if (hasPresencial) return { kind: "templo" };

  // Last resort: first active enrollment by id ASC (SPEC R10 heuristic).
  const [firstEnrollment] = await db
    .select({
      id: schema.programEnrollments.id,
      programId: schema.programEnrollments.programId,
      goalPlanType: schema.programs.goalPlanType,
    })
    .from(schema.programEnrollments)
    .innerJoin(
      schema.programs,
      eq(schema.programs.id, schema.programEnrollments.programId),
    )
    .where(
      and(
        eq(schema.programEnrollments.userId, userId),
        eq(schema.programEnrollments.status, "active"),
      ),
    )
    .orderBy(schema.programEnrollments.id)
    .limit(1);

  if (firstEnrollment) {
    return {
      kind: "program",
      enrollment: firstEnrollment,
    };
  }

  return {
    kind: "deny",
    status: 404,
    message: "No hay vista disponible para tu cuenta",
  };
}

/**
 * Nivel efectivo de un día para armar los dayIds candidatos. En días ROM los
 * niveles se reducen a alfa/delta (per D-29).
 */
export function effectiveLevelForDay(
  memberLevel: string,
  isRomDay: boolean,
): string {
  if (!isRomDay) return memberLevel;
  // WR-04 / D-03: kairos inherits Alfa, so on ROM days a kairos member
  // reads the alfa ROM variant (not delta). Mapping non-alfa→delta
  // would hand kairos a full delta ROM session, breaking the "kairos
  // always trains ultra-simple" promise.
  return memberLevel === "alfa" || isKairos(memberLevel) ? "alfa" : "delta";
}
