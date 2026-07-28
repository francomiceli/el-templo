/**
 * Daily subscription-lifecycle Cron Job (00:05 Argentina timezone)
 *
 * Three sweeps, all idempotent:
 *  1. Auto-resume paused subs whose pauseEndDate has arrived. resumeSubscription
 *     extends endDate by the actual pause duration, so admins don't have to
 *     manually unpause fixed-duration breaks.
 *  2. Activate scheduled subs whose startDate has arrived.
 *  3. Auto-expire active subs past their endDate. This keeps users.status fresh
 *     for consumers that read the column directly, rather than relying on the
 *     per-member "expire on read" path firing when someone opens each detail.
 */

import cron from "node-cron";
import pino from "pino";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../db/schema";
import { SubscriptionService } from "../modules/subscriptions/service";
import { AuraService } from "../modules/aura";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../modules/finance";
import { EnrollmentService } from "../modules/programs/enrollment-service";
import {
  forEachActiveTenant,
  type TenantContext,
} from "../modules/shared/tenant";

const log = pino({ name: "auto-resume-pauses" });

/**
 * Fase 169 (CON-04, D-01) — BARRIDO POR TENANT ACTIVO
 * ---------------------------------------------------
 * Los tres barridos corren UNA VEZ POR GIMNASIO ACTIVO: `forEachActiveTenant`
 * resuelve la lista de `tenants` en cada corrida (activar un gimnasio no
 * debería exigir un restart de la API) y aísla los errores POR ITERACIÓN
 * (D-03) — un gimnasio roto no frena a los demás.
 *
 * D-02: el `ctx` NO baja a los services. Las seis firmas de service que se
 * construyen acá abajo cambian en su fase de adopción (172-175); en la 169 el
 * contexto llega hasta el CUERPO del job, se loguea y queda disponible. Con un
 * solo tenant activo el resultado es IDÉNTICO al de hoy.
 *
 * VENCIMIENTO de esta forma intermedia: mientras el cuerpo siga siendo global,
 * más de un tenant activo repetiría el MISMO barrido N veces. Por eso el gate
 * del MILESTONE (no de esta fase) es que el tenant 2 no se onboardea hasta que
 * la batería de aislamiento ISO-03 (fase 171) esté verde.
 *
 * DOBLE NIVEL DE CONTENCIÓN — NO "ARREGLAR"
 * -----------------------------------------
 * Los tres `try/catch` de abajo son los ORIGINALES y se conservan tal cual: que
 * un barrido falle no puede impedir los otros dos (el barrido que rompió
 * devuelve 0 y el job sigue). Como ya tragan sus propios errores, el `catch` por
 * iteración de `forEachActiveTenant` casi nunca se va a disparar en ESTE job:
 * solo lo haría si fallara algo fuera de los tres bloques (la construcción de un
 * service, por ejemplo). Es correcto que estén los dos niveles y está escrito acá
 * para que nadie los "simplifique" después.
 *
 * Cuerpo de los tres barridos para UN gimnasio. Devuelve los tres contadores,
 * con 0 en el barrido que haya fallado; el acumulador de abajo los suma entre
 * gimnasios.
 */
async function runAutoResumePausesForTenant(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
): Promise<{ resumed: number; activated: number; expired: number }> {
  const tenantId = ctx.tenantId;

  // Los seis services se construyen DENTRO del cuerpo por tenant (antes vivían
  // en la función de scheduling) para que cada vuelta del barrido arranque
  // limpia, y para que el día que sus firmas reciban el `ctx` (172-175) el
  // cambio quede local a esta función.
  const auraService = new AuraService(db);
  const balanceService = new BalanceService(db, log);
  const cashRegisterService = new CashRegisterService(db, log);
  const transactionService = new TransactionService(
    db,
    log,
    balanceService,
    cashRegisterService,
  );
  const enrollmentService = new EnrollmentService(db, log);
  const subscriptionService = new SubscriptionService(
    db,
    log,
    auraService,
    transactionService,
    enrollmentService,
  );

  // `tenantId` va como CAMPO ESTRUCTURADO, jamás interpolado en el mensaje.
  log.info({ tenantId }, "Barrido de suscripciones para un gimnasio");

  let resumed = 0;
  let activated = 0;
  let expired = 0;

  try {
    resumed = await subscriptionService.autoResumeDuePauses();
    if (resumed === 0) {
      log.info({ tenantId }, "No paused subscriptions due for resume");
    }
  } catch (err: unknown) {
    log.error({ err, tenantId }, "Auto-resume job failed");
  }

  try {
    activated = await subscriptionService.activateDueScheduledSubs();
    if (activated === 0) {
      log.info({ tenantId }, "No scheduled subscriptions due for activation");
    } else {
      log.info({ tenantId, activated }, "Activated scheduled subscriptions");
    }
  } catch (err: unknown) {
    log.error({ err, tenantId }, "Activate-scheduled job failed");
  }

  try {
    expired = await subscriptionService.autoExpireDueSubscriptions();
    if (expired === 0) {
      log.info({ tenantId }, "No subscriptions due for expiration");
    } else {
      log.info({ tenantId, users: expired }, "Auto-expired due subscriptions");
    }
  } catch (err: unknown) {
    log.error({ err, tenantId }, "Auto-expire job failed");
  }

  return { resumed, activated, expired };
}

/**
 * Corre los tres barridos una vez, para TODOS los gimnasios activos. Expuesta
 * para tests e invocación manual (mismo patrón que `runExpireLostLeads` y
 * `runMarkNoShows`): antes de la fase 169 este job NO tenía función pura y era
 * intesteable, porque toda su lógica vivía dentro del `cron.schedule`.
 */
export async function runAutoResumePauses(
  db: MySql2Database<typeof schema>,
): Promise<{ resumed: number; activated: number; expired: number }> {
  let resumed = 0;
  let activated = 0;
  let expired = 0;

  await forEachActiveTenant(db, log, "auto-resume-pauses", async (ctx) => {
    const r = await runAutoResumePausesForTenant(db, ctx);
    resumed += r.resumed;
    activated += r.activated;
    expired += r.expired;
  });

  return { resumed, activated, expired };
}

/**
 * Agenda los tres barridos a las 00:05 hora AR (justo después de medianoche).
 * El callback NO tiene lógica de negocio: llama a la función pura y contiene el
 * error.
 */
export function startAutoResumePausesJob(
  db: MySql2Database<typeof schema>,
): void {
  cron.schedule(
    "5 0 * * *",
    async () => {
      log.info("Running auto-resume job");
      try {
        await runAutoResumePauses(db);
      } catch (err: unknown) {
        log.error({ err }, "Auto-resume + activate + expire job failed");
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" },
  );

  log.info(
    "Auto-resume + activate-scheduled + auto-expire cron job scheduled for 00:05 daily (Argentina timezone)",
  );
}
