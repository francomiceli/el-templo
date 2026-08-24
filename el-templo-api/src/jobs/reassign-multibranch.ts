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
import { resolveBranchDelGimnasio } from "../modules/shared/branch-consistency";
import {
  forEachActiveTenant,
  tenantWhere,
  type TenantContext,
} from "../modules/shared/tenant";

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
    | "no_dominance"
    | "cross_tenant";
}

export interface ReassignResult {
  candidates: number;
  changes: ReassignChange[];
  skipped: ReassignSkip[];
  dryRun: boolean;
}

/**
 * Fase 169 (CON-04, D-01) — BARRIDO POR TENANT ACTIVO
 * ---------------------------------------------------
 * Lógica pura y testeable. Con dryRun=true NO escribe: solo devuelve qué
 * cambiaría (mismo cálculo, sin efectos).
 *
 * El barrido corre UNA VEZ POR GIMNASIO ACTIVO: `forEachActiveTenant` resuelve
 * la lista de `tenants` en cada corrida (activar un gimnasio no debería exigir
 * un restart de la API) y aísla los errores POR ITERACIÓN (D-03) — un gimnasio
 * roto no frena la recategorización de los demás.
 *
 * La firma y el tipo de retorno NO cambiaron: los contadores y las listas se
 * acumulan entre gimnasios (igual que `runMarkNoShows` acumula sobre el loop de
 * timezones) y `dryRun` se propaga INTACTO al cuerpo — el sweep no altera qué
 * escribe el job.
 *
 * D-02: el `ctx` NO baja a nada aguas abajo (`reassignMemberBranch` mantiene su
 * firma hasta la fase de adopción, 172-175). Con un solo tenant activo el
 * resultado es IDÉNTICO al de hoy.
 *
 * VENCIMIENTO de esta forma intermedia: mientras el cuerpo siga siendo global,
 * más de un tenant activo repetiría el MISMO barrido N veces. Por eso el gate
 * del MILESTONE es que el tenant 2 no se onboardea hasta que la batería de
 * aislamiento ISO-03 (fase 171) esté verde.
 */
export async function runReassignMultibranch(
  db: MySql2Database<typeof schema>,
  opts: { dryRun?: boolean } = {},
): Promise<ReassignResult> {
  const result: ReassignResult = {
    candidates: 0,
    changes: [],
    skipped: [],
    dryRun: opts.dryRun ?? false,
  };

  await forEachActiveTenant(db, log, "reassign-multibranch", async (ctx) => {
    const r = await runReassignMultibranchForTenant(db, ctx, opts);
    result.candidates += r.candidates;
    result.changes.push(...r.changes);
    result.skipped.push(...r.skipped);
  });

  return result;
}

/** Cuerpo de la recategorización para UN gimnasio. */
async function runReassignMultibranchForTenant(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  opts: { dryRun?: boolean } = {},
): Promise<ReassignResult> {
  const dryRun = opts.dryRun ?? false;

  // Una línea por vuelta del barrido, con `tenantId` como CAMPO ESTRUCTURADO
  // (jamás interpolado en el mensaje). Va a la ENTRADA y no a la salida porque
  // el cuerpo tiene un early return: así el statement no se duplica.
  log.info(
    { tenantId: ctx.tenantId, dryRun },
    "Recategorización multisucursal para un gimnasio",
  );

  // 1. Candidatos: members con AL MENOS una sub ACTIVA sobre un plan multi_branch.
  //    `subscriptions` y `subscription_plans` no son tablas strict de ESTA fase
  //    (son de la 174), pero filtrarlas igual es correcto y necesario para que
  //    el barrido sea por gimnasio (D-04) — el `tenantWhere` va en el `where`
  //    de la tabla base y en el `ON` del join (mordió 4× en el resto de la fase).
  const candidateRows = await db
    .selectDistinct({ memberId: schema.subscriptions.userId })
    .from(schema.subscriptions)
    .innerJoin(
      schema.subscriptionPlans,
      and(
        tenantWhere(schema.subscriptionPlans, ctx),
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.subscriptions, ctx),
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
  //    `users` SÍ es tabla strict de esta fase (D-01): `tenantWhere` inline.
  const members = await db
    .select({
      id: schema.users.id,
      branchId: schema.users.branchId,
      branchUpdatedAt: schema.users.branchUpdatedAt,
      branchSource: schema.users.branchSource,
    })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, ctx),
        inArray(schema.users.id, candidateIds),
      ),
    );
  const memberById = new Map(members.map((m) => [m.id, m]));

  // 3. Mapa de sedes → país (guardrail de mismo país). T-173-16-02 (mina M10):
  //    SOLO sedes del PROPIO gimnasio — sin este filtro, esta es la query que
  //    le permite al cron elegir una sede ajena como "dominante" (una sede de
  //    otro gimnasio quedaba en el mapa con su país real y podía ganar la
  //    comparación de abajo). Con el filtro, una sede ajena simplemente NO
  //    ESTÁ en `countryByBranch` y el filtro de `buckets` de más abajo la
  //    descarta antes de que compita por ser la sede top.
  const branchRows = await db
    .select({ id: schema.branches.id, country: schema.branches.country })
    .from(schema.branches)
    .where(tenantWhere(schema.branches, ctx));
  const countryByBranch = new Map(branchRows.map((b) => [b.id, b.country]));

  // 4. Asistencias por (miembro, sede) en la ventana, en una sola agregada.
  //    La ventana se computa en JS (desde Date.now()) para que sea determinista
  //    bajo fake timers en los tests; sessionDate es un DATE (YYYY-MM-DD).
  //    `attendance` no es tabla strict de esta fase, pero se filtra igual
  //    (D-04): sin esto, una asistencia con `branch_id` de otro gimnasio (dato
  //    cruzado, la tabla no tiene ninguna FK que lo impida hoy — D-08) seguiría
  //    entrando al cómputo de "dónde entrena".
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
        tenantWhere(schema.attendance, ctx),
        inArray(schema.attendance.memberId, candidateIds),
        gte(schema.attendance.sessionDate, windowStartStr),
      ),
    )
    .groupBy(schema.attendance.memberId, schema.attendance.branchId);

  const byMember = new Map<
    number,
    Array<{ branchId: number; count: number }>
  >();
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

    // T-173-16-02: solo compiten por ser la sede top las sedes que aparecen en
    // `countryByBranch`, o sea las del PROPIO gimnasio (query 3). Una
    // asistencia con `branch_id` de otro gimnasio queda descartada ACÁ, antes
    // de que `total`/`top` la vean — es la mitigación de la mina M10 aplicada
    // a la señal de entrada, no solo al UPDATE final.
    const buckets = (byMember.get(memberId) ?? [])
      .filter((b) => countryByBranch.has(b.branchId))
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
      // D-07 — guarda ANTES del UPDATE, además del filtro de arriba (defensa
      // en profundidad, mina M10): `reassignMemberBranch` vuelve a resolver la
      // sede por `ctx` justo antes de escribir. Si por cualquier motivo ya no
      // es del gimnasio (carrera, dato que cambió entre el SELECT y acá), NO
      // escribe nada, el "change" recién agregado se revierte a "skipped", se
      // loguea con campos estructurados y el barrido SIGUE con el resto.
      const moved = await reassignMemberBranch(ctx, db, memberId, top.branchId);
      if (!moved) {
        result.changes.pop();
        result.skipped.push({ memberId, reason: "cross_tenant" });
        log.warn(
          { tenantId: ctx.tenantId, memberId, branchId: top.branchId },
          "Sede candidata ya no es del gimnasio: recategorización salteada",
        );
        continue;
      }
    }
  }

  return result;
}

/**
 * Escribe la nueva sede: users.branch_id + tracking ('auto') y sincroniza
 * subscriptions.branch_id de las subs vivas (active/scheduled/paused). El
 * miembro es multi_branch, así que NO se tocan bookings ni turnos fijos (a
 * diferencia del path single-branch de la edición admin).
 *
 * D-07 (mina M10) — GUARDA ANTES DEL UPDATE: resuelve la sede con
 * `resolveBranchDelGimnasio` filtrada por `ctx` ANTES de escribir. Si no
 * resuelve (la sede ya no es del gimnasio, o no existe), NO escribe nada y
 * devuelve `false` — el llamador decide "saltear y seguir", nunca abortar el
 * barrido (D-07/T-173-16-05). Con la FK compuesta `users(tenant_id,
 * branch_id)` del plan 173-12 aplicada, un UPDATE cross-tenant además EXPLOTA
 * en la base: esta guarda de app existe para que el cron salte limpio en vez
 * de reventar con un error de FK. Escribe el `id` de la fila YA RESUELTA
 * (`branch.id`), no el parámetro crudo — mismo idioma que
 * `assertBranchDelGimnasio` en `members/service.ts` y `users/service.ts`.
 */
async function reassignMemberBranch(
  ctx: TenantContext,
  db: MySql2Database<typeof schema>,
  memberId: number,
  branchId: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const branch = await resolveBranchDelGimnasio(ctx, branchId, tx);
    if (!branch) return false;

    await tx
      .update(schema.users)
      .set({
        branchId: branch.id,
        branchUpdatedAt: new Date(),
        branchSource: "auto",
      })
      .where(
        and(tenantWhere(schema.users, ctx), eq(schema.users.id, memberId)),
      );
    await tx
      .update(schema.subscriptions)
      .set({ branchId: branch.id })
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx),
          eq(schema.subscriptions.userId, memberId),
          inArray(schema.subscriptions.status, [
            "active",
            "scheduled",
            "paused",
          ]),
        ),
      );
    return true;
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
