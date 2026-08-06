/**
 * Aniversarios de permanencia — job diario de push + regalo de Aura (09:00 AR).
 *
 * Cada día busca a los alumnos ACTIVOS que cumplen un hito de antigüedad HOY
 * (3 meses, 6 meses, 1 año, y anuales) desde su alta (users.createdAt) y, por
 * cada uno, le regala puntos de Aura y le encola un push de felicitación.
 *
 * Idempotencia (una sola vez por hito, decisión 2026-08-06): el asiento en
 * aura_transactions con reference_type='tenure_milestone' + reference_id=<meses>
 * ES el registro de reconocimiento. El unique `unique_user_source_ref` garantiza
 * que un segundo intento (reproceso, corrida doble, race) reviente por
 * constraint — no hay tabla de logros aparte. El push se dispara SOLO cuando el
 * award recién se creó, así que tampoco se duplica la notificación.
 *
 * La línea "Cumple X en El Templo" de la lista de asistencia del admin es OTRA
 * superficie, stateless, y no pasa por acá (ver attendance/service.ts).
 *
 * Barrido multi-tenant obligatorio vía forEachActiveTenant (Fase 169): corre una
 * vez por gimnasio activo y aísla errores por iteración.
 */
import cron from "node-cron";
import pino from "pino";
import { and, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import {
  forEachActiveTenant,
  tenantWhere,
  type TenantContext,
} from "../modules/shared/tenant";
import { todayInTz } from "../modules/shared/date-utils";
import { milestoneOnDate } from "../modules/shared/tenure-milestones";
import { AuraService } from "../modules/aura/service";
import { NotificationService } from "../modules/notifications/service";

const log = pino({ name: "tenure-milestones" });

const AR_TZ = "America/Argentina/Buenos_Aires";

/** Un reconocimiento efectivamente aplicado en esta corrida. */
export interface TenureRecognition {
  memberId: number;
  months: number;
  aura: number;
}

export interface TenureMilestoneResult {
  /** Alumnos activos que cumplen un hito hoy (antes de filtrar ya reconocidos). */
  candidates: number;
  /** Reconocimientos nuevos aplicados (Aura otorgada + push encolado). */
  recognized: TenureRecognition[];
  /** Ya reconocidos en una corrida previa: se saltaron. */
  alreadyDone: number;
  /** Awards que fallaron (incluye duplicados por race): no dispararon push. */
  failed: number;
}

/**
 * Lógica pura y testeable. `now` inyectable para pinnear el reloj en tests.
 * Con dryRun=true calcula los candidatos pero NO otorga Aura ni encola push.
 */
export async function runTenureMilestones(
  db: MySql2Database<typeof schema>,
  opts: { now?: Date; dryRun?: boolean } = {},
): Promise<TenureMilestoneResult> {
  const result: TenureMilestoneResult = {
    candidates: 0,
    recognized: [],
    alreadyDone: 0,
    failed: 0,
  };

  await forEachActiveTenant(db, log, "tenure-milestones", async (ctx) => {
    const r = await runForTenant(db, ctx, opts);
    result.candidates += r.candidates;
    result.recognized.push(...r.recognized);
    result.alreadyDone += r.alreadyDone;
    result.failed += r.failed;
  });

  return result;
}

async function runForTenant(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  opts: { now?: Date; dryRun?: boolean },
): Promise<TenureMilestoneResult> {
  const dryRun = opts.dryRun ?? false;
  const today = todayInTz(AR_TZ, opts.now ?? new Date());

  log.info({ today, dryRun }, "Aniversarios de permanencia — barrido diario");

  const result: TenureMilestoneResult = {
    candidates: 0,
    recognized: [],
    alreadyDone: 0,
    failed: 0,
  };

  // Alumnos activos (no staff, no inactivos/freemium/prueba/wellhub): la
  // permanencia se cuenta desde el alta, pero el reconocimiento automático es
  // para quien HOY es socio activo.
  const members = await db
    .select({
      id: schema.users.id,
      firstName: schema.users.firstName,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.role, "member"),
        eq(schema.users.status, "activo"),
      ),
    );

  // Filtrar a los que cumplen un hito EXACTAMENTE hoy.
  const hits = members
    .map((m) => ({ member: m, milestone: milestoneOnDate(m.createdAt, today) }))
    .filter(
      (h): h is { member: (typeof members)[number]; milestone: NonNullable<typeof h.milestone> } =>
        h.milestone !== null,
    );
  result.candidates = hits.length;
  if (hits.length === 0) return result;

  // ¿Cuáles ya se reconocieron en una corrida previa? El ledger de Aura es la
  // fuente de verdad (referenceType='tenure_milestone', referenceId=<meses>).
  const hitIds = hits.map((h) => h.member.id);
  const existing = await db
    .select({
      userId: schema.auraTransactions.userId,
      referenceId: schema.auraTransactions.referenceId,
    })
    .from(schema.auraTransactions)
    .where(
      and(
        tenantWhere(schema.auraTransactions, ctx),
        inArray(schema.auraTransactions.userId, hitIds),
        eq(schema.auraTransactions.sourceType, "tenure_milestone"),
        eq(schema.auraTransactions.referenceType, "tenure_milestone"),
      ),
    );
  const doneSet = new Set(existing.map((e) => `${e.userId}:${e.referenceId}`));

  const aura = new AuraService(db, log);
  const notifications = new NotificationService(db, log);

  for (const { member, milestone } of hits) {
    if (doneSet.has(`${member.id}:${milestone.months}`)) {
      result.alreadyDone += 1;
      continue;
    }
    if (dryRun) {
      result.recognized.push({
        memberId: member.id,
        months: milestone.months,
        aura: milestone.aura,
      });
      continue;
    }

    // 1. Regalo de Aura (durable + candado de idempotencia). Si el award falla
    //    —típicamente duplicado por race con otra corrida— NO mandamos push,
    //    para no notificar dos veces.
    try {
      await aura.award({
        userId: member.id,
        sourceType: "tenure_milestone",
        referenceType: "tenure_milestone",
        referenceId: milestone.months,
        amount: milestone.aura,
        description: `Aniversario: ${milestone.label} en El Templo`,
      });
    } catch (err: unknown) {
      result.failed += 1;
      log.error(
        { err, memberId: member.id, months: milestone.months },
        "No se pudo otorgar Aura de aniversario; se omite el push",
      );
      continue;
    }

    // 2. Push de felicitación (best-effort: un fallo de la cola nunca deshace
    //    el Aura ya otorgado). Copy neutra en género (voseo) a propósito.
    try {
      await notifications.queueAdHocNotification({
        userId: member.id,
        title: `🎉 ¡${milestone.label} en El Templo!`,
        body: `Hoy cumplís ${milestone.label} entrenando con nosotros. ¡Gracias por bancar la barra! 💪`,
        category: "motivacion",
      });
    } catch (err: unknown) {
      log.error(
        { err, memberId: member.id, months: milestone.months },
        "Aura de aniversario otorgada pero falló al encolar el push",
      );
    }

    result.recognized.push({
      memberId: member.id,
      months: milestone.months,
      aura: milestone.aura,
    });
  }

  return result;
}

export function startTenureMilestonesJob(
  db: MySql2Database<typeof schema>,
): void {
  // Diario a las 09:00 AR: el push llega a la mañana del día del hito.
  cron.schedule(
    "0 9 * * *",
    async () => {
      log.info("Running tenure-milestones job");
      try {
        const res = await runTenureMilestones(db);
        log.info(
          {
            candidates: res.candidates,
            recognized: res.recognized.length,
            alreadyDone: res.alreadyDone,
            failed: res.failed,
          },
          "Tenure-milestones job done",
        );
      } catch (err: unknown) {
        log.error({ err }, "Tenure-milestones job failed");
      }
    },
    { timezone: AR_TZ },
  );

  log.info("Tenure-milestones cron scheduled daily at 09:00 (Argentina timezone)");
}
// chore(staging): re-trigger de deploy (paths-filter/event.before) — solo staging.
// reintento 2 tras incidente de GitHub Actions (2026-08-06).
