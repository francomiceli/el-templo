/**
 * Auto-approve Cron Job
 *
 * Runs at 23:59 daily (Argentina timezone) to auto-approve pending sessions
 * for the next day. This ensures members always have sessions available even
 * if admins haven't reviewed them yet.
 *
 * Auto-approved sessions are marked with approvedBySystem=true to distinguish
 * them from manually reviewed sessions.
 */

import cron from "node-cron";
import pino from "pino";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../db/schema";
import { AdminSessionService } from "../modules/admin/service";
import {
  forEachActiveTenant,
  type TenantContext,
} from "../modules/shared/tenant";

const log = pino({ name: "auto-approve" });

/**
 * Fase 169 (CON-04, D-01) — BARRIDO POR TENANT ACTIVO
 * ---------------------------------------------------
 * El barrido corre UNA VEZ POR GIMNASIO ACTIVO: `forEachActiveTenant` resuelve
 * la lista de `tenants` en cada corrida (activar un gimnasio no debería exigir
 * un restart de la API) y aísla los errores POR ITERACIÓN (D-03) — un gimnasio
 * roto no frena el barrido de los demás, el error se loguea con `tenantId`
 * estructurado y el loop sigue.
 *
 * D-02: el `ctx` NO baja a los services. `AdminSessionService` mantiene su
 * firma hasta su fase de adopción (172-175); acá el contexto llega hasta el
 * CUERPO del job, se loguea y queda disponible. Con un solo tenant activo el
 * resultado es IDÉNTICO al de hoy.
 *
 * VENCIMIENTO de esta forma intermedia: mientras el cuerpo siga siendo global,
 * más de un tenant activo repetiría el MISMO barrido N veces. Por eso el gate
 * del MILESTONE (no de esta fase) es que el tenant 2 no se onboardea hasta que
 * la batería de aislamiento ISO-03 (fase 171) esté verde.
 *
 * Cuerpo de la auto-aprobación para UN gimnasio; el acumulador de abajo suma
 * entre gimnasios.
 */
async function runAutoApproveForTenant(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
): Promise<{ approved: number }> {
  // El service se construye DENTRO del cuerpo por tenant (antes vivía en la
  // función de scheduling): cada vuelta arranca limpia, y el día que su firma
  // reciba el `ctx` (172-175) el cambio queda local a esta función.
  const adminService = new AdminSessionService(db);

  const result = await adminService.autoApprovePendingSessions();

  // Una línea por vuelta del barrido, con `tenantId` como CAMPO ESTRUCTURADO
  // (jamás interpolado en el mensaje). Va a la salida porque el cuerpo no tiene
  // early return: un solo statement de log cubre los dos casos.
  log.info(
    { tenantId: ctx.tenantId, approved: result.approved },
    result.approved > 0
      ? "Sesiones auto-aprobadas para mañana en un gimnasio"
      : "Sin sesiones pendientes de auto-aprobar en un gimnasio",
  );

  return { approved: result.approved };
}

/**
 * Corre la auto-aprobación completa una vez, para TODOS los gimnasios activos.
 * Expuesta para tests e invocación manual (mismo patrón que `runExpireLostLeads`
 * y `runMarkNoShows`): antes de la fase 169 este job NO tenía función pura y era
 * intesteable, porque toda su lógica vivía dentro del `cron.schedule`.
 */
export async function runAutoApprove(
  db: MySql2Database<typeof schema>,
): Promise<{ approved: number }> {
  let approved = 0;

  await forEachActiveTenant(db, log, "auto-approve", async (ctx) => {
    const r = await runAutoApproveForTenant(db, ctx);
    approved += r.approved;
  });

  return { approved };
}

/**
 * Agenda la auto-aprobación a las 23:59 hora AR (justo antes de medianoche),
 * para que las sesiones del día siguiente existan aunque nadie las haya
 * revisado. El callback NO tiene lógica de negocio: llama a la función pura,
 * loguea el total y contiene el error.
 */
export function startAutoApproveJob(db: MySql2Database<typeof schema>): void {
  cron.schedule(
    "59 23 * * *",
    async () => {
      log.info("Running auto-approve job");
      try {
        const { approved } = await runAutoApprove(db);
        if (approved > 0) {
          log.info({ approved }, "Auto-approved sessions for tomorrow");
        } else {
          log.info("No pending sessions to auto-approve");
        }
      } catch (err: unknown) {
        log.error({ err }, "Auto-approve job failed");
      }
    },
    {
      timezone: "America/Argentina/Buenos_Aires", // Branch timezone
    },
  );

  log.info("Cron job scheduled for 23:59 daily (Argentina timezone)");
}
