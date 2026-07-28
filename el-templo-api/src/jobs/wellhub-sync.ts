/**
 * Wellhub Sync Cron Job
 *
 * Cada 30 minutos publica/actualiza las clases y slots del horizonte en
 * Wellhub para todas las sedes con wellhub_gym_id, reconcilia la ocupación
 * (pushes perdidos, operaciones masivas que no emiten al bus) y expira
 * solicitudes 'pending' muertas. No-op si la integración no está
 * configurada.
 *
 * Patrón: lógica pura exportada (runWellhubSync) para tests + scheduler
 * (startWellhubSyncJob), como mark-no-shows.ts.
 */

import cron from "node-cron";
import pino from "pino";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import { AuraService } from "../modules/aura";
import { EnrollmentService } from "../modules/programs/enrollment-service";
import { NotificationService } from "../modules/notifications/service";
import { SubscriptionService } from "../modules/subscriptions/service";
import { BookingService } from "../modules/scheduling/booking-service";
import { getWellhubConfig, type WellhubConfig } from "../modules/wellhub/config";
import { WellhubClient } from "../modules/wellhub/client";
import {
  WellhubSyncService,
  type WellhubSyncSummary,
} from "../modules/wellhub/sync-service";
import {
  forEachActiveTenant,
  type TenantContext,
} from "../modules/shared/tenant";

const log = pino({ name: "wellhub-sync" });

/**
 * Fase 169 (CON-04, D-01) — BARRIDO POR TENANT ACTIVO
 * ---------------------------------------------------
 * Sincroniza Wellhub para todos los gimnasios ACTIVOS. El tipo de retorno NO
 * cambió con el sweep: devuelve el summary del ÚLTIMO gimnasio procesado, o
 * `null` si la integración no está configurada o si no se procesó ninguno.
 *
 * El guard de configuración corre ANTES del sweep, y por eso esta función va
 * PRIMERA en el archivo: un despliegue sin Wellhub configurado sigue siendo un
 * no-op absoluto y ni siquiera consulta la tabla `tenants` (T-169-11).
 *
 * `forEachActiveTenant` resuelve la lista de `tenants` en cada corrida (activar
 * un gimnasio no debería exigir un restart de la API) y aísla los errores POR
 * ITERACIÓN (D-03) — si la sincronización explota para un gimnasio (p. ej. la
 * API de Wellhub devuelve 5xx para sus sedes), se loguea con `tenantId`
 * estructurado y el barrido SIGUE con el siguiente.
 *
 * D-02: el `ctx` NO baja a los services. Los 6 que se construyen en el cuerpo
 * MANTIENEN su firma actual hasta su fase de adopción (172-175); el contexto
 * llega hasta el cuerpo del job, se loguea y queda disponible. Con un solo
 * tenant activo el resultado es IDÉNTICO al de hoy.
 *
 * VENCIMIENTO de esta forma intermedia: mientras el cuerpo siga siendo global,
 * más de un tenant activo repetiría el MISMO barrido N veces (acá: publicaría
 * las mismas clases N veces). Por eso el gate del MILESTONE es que el tenant 2
 * no se onboardea hasta que la batería de aislamiento ISO-03 (fase 171) esté
 * verde.
 */
export async function runWellhubSync(
  db: MySql2Database<typeof schema>,
): Promise<WellhubSyncSummary | null> {
  const config = getWellhubConfig();
  if (!config) return null;

  // Variable de closure: `forEachActiveTenant` devuelve el conteo del barrido,
  // no los resultados, así que el summary se captura acá.
  const sweep: { last: WellhubSyncSummary | null } = { last: null };

  await forEachActiveTenant(db, log, "wellhub-sync", async (ctx) => {
    sweep.last = await runWellhubSyncForTenant(db, ctx, config);
  });

  return sweep.last;
}

/**
 * Cuerpo de la sincronización para UN gimnasio. Recibe el `config` ya validado
 * por el guard de {@link runWellhubSync}, así que no vuelve a consultarlo.
 */
async function runWellhubSyncForTenant(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  config: WellhubConfig,
): Promise<WellhubSyncSummary> {
  const auraService = new AuraService(db);
  const enrollmentService = new EnrollmentService(db, log);
  const subscriptionService = new SubscriptionService(
    db,
    log,
    auraService,
    undefined,
    enrollmentService,
  );
  const notificationService = new NotificationService(db, log);
  const bookingService = new BookingService(
    db,
    log,
    subscriptionService,
    notificationService,
  );
  const client = new WellhubClient(config, log);
  const syncService = new WellhubSyncService(db, log, client, bookingService);

  const summary = await syncService.syncAllBranches();

  // `tenantId` como CAMPO ESTRUCTURADO (jamás interpolado en el mensaje): este
  // log vive acá y no en `startWellhubSyncJob` porque el tipo de retorno público
  // de `runWellhubSync` está lockeado (`WellhubSyncSummary | null`) y no lleva el
  // `tenantId` hasta el scheduler. Una línea por vuelta del barrido.
  log.info(
    { tenantId: ctx.tenantId, ...summary },
    "Sincronización Wellhub completada para un gimnasio",
  );

  return summary;
}

export function startWellhubSyncJob(db: MySql2Database<typeof schema>): void {
  if (!getWellhubConfig()) {
    log.info("Wellhub sin configurar — cron de sincronización apagado");
    return;
  }

  cron.schedule("*/30 * * * *", async () => {
    try {
      // El summary de cada gimnasio ya se loguea con su `tenantId` dentro del
      // barrido (fase 169): loguearlo otra vez acá duplicaría la línea y, con
      // más de un gimnasio activo, atribuiría el summary del último a todos.
      await runWellhubSync(db);
    } catch (error) {
      log.error({ err: error }, "Sincronización Wellhub falló");
    }
  });

  log.info("Wellhub sync job scheduled (cada 30 minutos)");
}
