/**
 * Recategorización de miembros MULTISUCURSAL (mensual, día 1 a las 04:00 AR).
 *
 * A los miembros con un plan multisucursal (multi_branch) les reasigna la sede
 * ("sucursal elegida" = users.branch_id) a la sucursal donde MÁS ASISTIERON en
 * los últimos 30 días, y sincroniza subscriptions.branch_id de las subs vivas
 * (misma regla que la edición admin; como son multi_branch NO se tocan bookings
 * ni turnos fijos).
 *
 * Reglas / guardrails (decisiones Franco 2026-07-17):
 *  - Señal = ASISTENCIAS efectivas (tabla attendance, tiene branch_id directo),
 *    no reservas.
 *  - Margen mínimo (anti-flapping): la sede top reasigna solo si domina —
 *    concentra ≥60% de las asistencias del mes O le saca ≥3 visitas a la 2ª —
 *    y hay al menos 4 asistencias en la ventana.
 *  - Mismo país OBLIGATORIO: la sede candidata debe ser del mismo país que la
 *    sede actual (si no, mover AR→ES rompería el check-in por el guard
 *    cross-country que mira subscriptions.branch_id).
 *  - Respeta reasignación manual reciente: si branch_source='manual' y
 *    branch_updated_at < 45 días, no la pisa.
 *  - Empate / pocas asistencias / ya está en la top → no toca.
 *
 * dryRun: runReassignMultibranch(db, { dryRun: true }) NO escribe — devuelve qué
 * cambiaría, para validar la lógica/SQL contra datos reales sin efectos.
 */
import cron from "node-cron";
import pino from "pino";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";

const log = pino({ name: "reassign-multibranch" });

// Ventana de asistencias que define "dónde entrena" (últimos N días).
const ATTENDANCE_WINDOW_DAYS = 30;
// No pisar una reasignación MANUAL más nueva que esto.
const MANUAL_PROTECTION_DAYS = 45;
// Mínimo de asistencias en la ventana para que la señal sea confiable.
const MIN_ATTENDANCES = 4;
// La sede top domina si concentra al menos este % de las asistencias...
const DOMINANCE_RATIO = 0.6;
// ...O si le saca al menos esta diferencia de visitas a la 2ª sede.
const DOMINANCE_MARGIN = 3;

export interface ReassignChange {
  memberId: number;
  fromBranchId: number;
  toBranchId: number;
  toBranchCount: number;
  totalAttendances: number;
}

export interface ReassignSkip {
  memberId: number;
  reason:
    | "manual_recent"
    | "few_attendances"
    | "cross_country"
    | "already_top"
    | "no_dominance";
}

export interface ReassignResult {
  candidates: number;
  changes: ReassignChange[];
  skipped: ReassignSkip[];
  dryRun: boolean;
}

/**
 * Lógica pura y testeable. Con dryRun=true NO escribe: solo devuelve qué
 * cambiaría (mismo cálculo, sin efectos).
 */
export async function runReassignMultibranch(
  db: MySql2Database<typeof schema>,
  opts: { dryRun?: boolean } = {},
): Promise<ReassignResult> {
  const dryRun = opts.dryRun ?? false;

  // 1. Candidatos: members con AL MENOS una sub ACTIVA sobre un plan multi_branch.
  const candidateRows = await db
    .selectDistinct({ memberId: schema.subscriptions.userId })
    .from(schema.subscriptions)
    .innerJoin(
      schema.subscriptionPlans,
      eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
    )
    .where(
      and(
        eq(schema.subscriptions.status, "active"),
        eq(schema.subscriptionPlans.multiBranch, true),
      ),
    );
  const candidateIds = candidateRows.map((r) => r.memberId);

  const result: ReassignResult = {
    candidates: candidateIds.length,
    changes: [],
    skipped: [],
    dryRun,
  };
  if (candidateIds.length === 0) return result;

  // 2. Estado actual de cada candidato: sede home + tracking del último cambio.
  const members = await db
    .select({
      id: schema.users.id,
      branchId: schema.users.branchId,
      branchUpdatedAt: schema.users.branchUpdatedAt,
      branchSource: schema.users.branchSource,
    })
    .from(schema.users)
    .where(inArray(schema.users.id, candidateIds));
  const memberById = new Map(members.map((m) => [m.id, m]));

  // 3. Mapa de sedes → país (guardrail de mismo país).
  const branchRows = await db
    .select({ id: schema.branches.id, country: schema.branches.country })
    .from(schema.branches);
  const countryByBranch = new Map(branchRows.map((b) => [b.id, b.country]));

  // 4. Asistencias por (miembro, sede) en la ventana, en una sola agregada.
  //    La ventana se computa en JS (desde Date.now()) para que sea determinista
  //    bajo fake timers en los tests; sessionDate es un DATE (YYYY-MM-DD).
  const windowStartStr = new Date(
    Date.now() - ATTENDANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  const attRows = await db
    .select({
      memberId: schema.attendance.memberId,
      branchId: schema.attendance.branchId,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.attendance)
    .where(
      and(
        inArray(schema.attendance.memberId, candidateIds),
        gte(schema.attendance.sessionDate, windowStartStr),
      ),
    )
    .groupBy(schema.attendance.memberId, schema.attendance.branchId);

  const byMember = new Map<number, Array<{ branchId: number; count: number }>>();
  for (const r of attRows) {
    const arr = byMember.get(r.memberId) ?? [];
    arr.push({ branchId: r.branchId, count: Number(r.count) });
    byMember.set(r.memberId, arr);
  }

  const nowMs = Date.now();
  const protectionMs = MANUAL_PROTECTION_DAYS * 24 * 60 * 60 * 1000;

  for (const memberId of candidateIds) {
    const member = memberById.get(memberId);
    if (!member) continue;

    // Respetar una reasignación MANUAL reciente.
    if (
      member.branchSource === "manual" &&
      member.branchUpdatedAt !== null &&
      nowMs - member.branchUpdatedAt.getTime() < protectionMs
    ) {
      result.skipped.push({ memberId, reason: "manual_recent" });
      continue;
    }

    const buckets = (byMember.get(memberId) ?? [])
      .slice()
      .sort((a, b) => b.count - a.count);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    if (total < MIN_ATTENDANCES) {
      result.skipped.push({ memberId, reason: "few_attendances" });
      continue;
    }

    const top = buckets[0];
    const second = buckets[1];

    // Guardrail país: la sede top debe ser del mismo país que la actual.
    const currentCountry = countryByBranch.get(member.branchId) ?? null;
    const topCountry = countryByBranch.get(top.branchId) ?? null;
    if (
      currentCountry !== null &&
      topCountry !== null &&
      currentCountry !== topCountry
    ) {
      result.skipped.push({ memberId, reason: "cross_country" });
      continue;
    }

    if (top.branchId === member.branchId) {
      result.skipped.push({ memberId, reason: "already_top" });
      continue;
    }

    // Dominancia (anti-flapping).
    const ratio = top.count / total;
    const margin = top.count - (second?.count ?? 0);
    if (ratio < DOMINANCE_RATIO && margin < DOMINANCE_MARGIN) {
      result.skipped.push({ memberId, reason: "no_dominance" });
      continue;
    }

    result.changes.push({
      memberId,
      fromBranchId: member.branchId,
      toBranchId: top.branchId,
      toBranchCount: top.count,
      totalAttendances: total,
    });

    if (!dryRun) {
      await reassignMemberBranch(db, memberId, top.branchId);
    }
  }

  return result;
}

/**
 * Escribe la nueva sede: users.branch_id + tracking ('auto') y sincroniza
 * subscriptions.branch_id de las subs vivas (active/scheduled/paused). El
 * miembro es multi_branch, así que NO se tocan bookings ni turnos fijos (a
 * diferencia del path single-branch de la edición admin).
 */
async function reassignMemberBranch(
  db: MySql2Database<typeof schema>,
  memberId: number,
  branchId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ branchId, branchUpdatedAt: new Date(), branchSource: "auto" })
      .where(eq(schema.users.id, memberId));
    await tx
      .update(schema.subscriptions)
      .set({ branchId })
      .where(
        and(
          eq(schema.subscriptions.userId, memberId),
          inArray(schema.subscriptions.status, [
            "active",
            "scheduled",
            "paused",
          ]),
        ),
      );
  });
}

export function startReassignMultibranchJob(
  db: MySql2Database<typeof schema>,
): void {
  // Mensual: día 1 a las 04:00 AR (después de los batch nocturnos).
  cron.schedule(
    "0 4 1 * *",
    async () => {
      log.info("Running multibranch reassignment job");
      try {
        const res = await runReassignMultibranch(db);
        log.info(
          {
            candidates: res.candidates,
            reassigned: res.changes.length,
            skipped: res.skipped.length,
          },
          "Multibranch reassignment done",
        );
        for (const c of res.changes) {
          log.info(
            {
              memberId: c.memberId,
              from: c.fromBranchId,
              to: c.toBranchId,
              count: c.toBranchCount,
              total: c.totalAttendances,
            },
            "Member reassigned to most-attended branch",
          );
        }
      } catch (err: unknown) {
        log.error({ err }, "Multibranch reassignment job failed");
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" },
  );

  log.info(
    "Multibranch reassignment cron scheduled for the 1st of each month at 04:00 (Argentina timezone)",
  );
}
