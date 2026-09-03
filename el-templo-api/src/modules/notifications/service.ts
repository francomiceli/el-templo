/**
 * NotificationService — Push notification queue, FCM delivery, and preference management.
 *
 * Requires: pnpm add firebase-admin
 * Until firebase-admin is installed, the service operates in DRY_RUN mode (logs only).
 *
 * Uses constructor DI pattern (Phase 56 convention).
 */

import { eq, and, lte, sql, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type {
  NotificationCategory,
  QueueNotificationInput,
  QueueAdHocInput,
} from "./types";
import { NOTIFICATION_CATEGORIES, TEMPLATE_SEEDS } from "./types";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import type { EmailService } from "../email/service";
// Fase 193 (D-01/D-02/D-04): destino curado compartido — buildPushData
// resuelve el payload FCM con fallback (route) + destino nuevo, nunca lanza.
import {
  fallbackRouteFor,
  DEFAULT_WHATSAPP_TEXT,
  type Destination,
  type DestinationType,
} from "../communications";

/** Fase 180 (D-20/D-24): template key del recordatorio de sesión de prueba. */
const TRIAL_REMINDER_TEMPLATE_KEY = "trial_session_reminder";

type DbInstance = MySql2Database<typeof schema>;

/** Batch size for queue processing (per D-10) */
const QUEUE_BATCH_SIZE = 100;

/** Purge sent/failed notifications older than this (ms) — 24 hours per D-11 */
const PURGE_AGE_MS = 24 * 60 * 60 * 1000;

/** Retry delay on FCM failure (ms) — per D-38 */
const RETRY_DELAY_MS = 1000;

/**
 * Minimal interface for FCM messaging so the service compiles without firebase-admin installed.
 * When firebase-admin is available, this is satisfied by admin.messaging().
 */
interface FcmMessaging {
  send(message: {
    token: string;
    notification: { title: string; body: string };
    data: Record<string, string>;
  }): Promise<string>;
}

/**
 * Fase 193 (D-04): payload `data` de la push, compatible hacia atrás.
 *
 * `route` SIEMPRE viaja — es el fallback que la app vieja ya sabe leer
 * (`handleTapNavigation(data?.route || '/mi-templo')`), nunca 404. `route`
 * llega YA resuelto (columna `route` de la fila, escrita en el momento del
 * encolado con `fallbackRouteFor`) — esta función no vuelve a resolverlo, solo
 * arma el objeto final.
 *
 * `destination`/`destinationSection`/`whatsappText` son el agregado nuevo
 * (D-01): una app vieja los ignora por completo. FCM `data` solo admite
 * strings — ninguna clave se agrega con `undefined`/`null`.
 *
 * Pura: sin `db`, sin `this`, testeable de punta a punta con un input en
 * memoria (T-193-23).
 */
export function buildPushData(input: {
  route: string;
  destinationType: DestinationType;
  destinationSection: string | null;
  whatsappText: string | null;
  notificationId: number;
}): Record<string, string> {
  const data: Record<string, string> = {
    route: input.route,
    notificationId: String(input.notificationId),
    destination: input.destinationType,
  };

  if (input.destinationSection) {
    data.destinationSection = input.destinationSection;
  }

  if (input.destinationType === "whatsapp_sales") {
    data.whatsappText = input.whatsappText ?? DEFAULT_WHATSAPP_TEXT;
  }

  return data;
}

export class NotificationService {
  private messaging: FcmMessaging | null = null;
  private readonly dryRun: boolean;

  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    dryRun?: boolean,
    // Fase 180 (D-24): opcional — de los ~18 call sites de NotificationService,
    // solo el que corre processQueue (notification-cron.ts) necesita el
    // fallback por email; sin este dependency el fallback simplemente no se
    // intenta y processQueue conserva su comportamiento actual (falla con
    // "No device tokens registered", igual que hoy).
    private readonly emailService?: EmailService,
  ) {
    this.dryRun = dryRun ?? process.env.DRY_RUN === "true";
  }

  // ── Firebase Initialization ─────────────────────────────────────────────

  /**
   * Initialize Firebase Admin SDK for FCM messaging.
   * Reads FIREBASE_SERVICE_ACCOUNT_BASE64 env var, decodes, and initializes.
   * If DRY_RUN or env var missing, skips initialization (log-only mode).
   */
  async initFirebase(): Promise<void> {
    if (this.dryRun) {
      this.log.info("NotificationService: DRY_RUN mode — FCM sends disabled");
      return;
    }

    const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!base64Key) {
      this.log.warn(
        "NotificationService: FIREBASE_SERVICE_ACCOUNT_BASE64 not set — FCM sends disabled",
      );
      return;
    }

    try {
      // Dynamic import so the module compiles even without firebase-admin installed.
      // firebase-admin is CJS — dynamic import wraps it in { default: ... }
      const adminModule = await import("firebase-admin");
      const admin = adminModule.default ?? adminModule;
      const serviceAccount = JSON.parse(
        Buffer.from(base64Key, "base64").toString("utf-8"),
      ) as Record<string, unknown>;

      // Only initialize if no app exists yet (avoid duplicate app error)
      const app =
        admin.apps.length > 0
          ? admin.apps[0]
          : admin.initializeApp({
              credential: admin.credential.cert(
                serviceAccount as Parameters<typeof admin.credential.cert>[0],
              ),
            });

      if (app) {
        this.messaging = admin.messaging(app) as unknown as FcmMessaging;
        this.log.info("NotificationService: Firebase initialized successfully");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown initialization error";
      this.log.error(
        { err: message },
        "NotificationService: Failed to initialize Firebase — FCM sends disabled",
      );
    }
  }

  // ── Token Management ────────────────────────────────────────────────────

  /**
   * Register or update an FCM device token for a user.
   * Handles the D-26 on-every-launch token registration pattern.
   * If token already exists (unique constraint), updates userId and updatedAt.
   *
   * T-175-03: `device_tokens` es gym-owned (COL-01) pero tenant-GLOBAL para
   * el UNIQUE del token (M8, ver `src/db/schema/notifications.ts`) — la FILA
   * igual necesita su tenant_id real, derivado del propio destinatario (no
   * hay `ctx` de request en este método; ver `resolveUserTenant`). El
   * `ON DUPLICATE` también refresca `tenant_id`: el mismo dispositivo físico
   * puede pasar de un usuario de un gimnasio a otro (logout/login), y sin
   * este refresh la fila quedaría con el `tenant_id` del primer dueño.
   */
  async registerToken(
    userId: number,
    token: string,
    platform: "android" | "ios",
  ): Promise<void> {
    const ctx = await this.resolveUserTenant(userId);
    if (!ctx) {
      throw new Error(
        `registerToken: usuario ${userId} no encontrado — no se puede resolver el gimnasio dueño del token`,
      );
    }

    await this.db.execute(
      sql`INSERT INTO device_tokens (user_id, token, device_platform, tenant_id)
          VALUES (${userId}, ${token}, ${platform}, ${ctx.tenantId})
          ON DUPLICATE KEY UPDATE user_id = ${userId}, tenant_id = ${ctx.tenantId}, updated_at = NOW()`,
    );

    this.log.info({ userId, platform }, "Device token registered");
  }

  /**
   * Remove a device token (called when FCM reports token invalid).
   */
  async removeToken(token: string): Promise<void> {
    // 175.1-07 (D-17, dos canales): este comentario exime al LINT; la MISMA
    // exención se repite EMBEBIDA en el `sql` de abajo porque el sentinel de
    // runtime solo lee el SQL final, nunca comentarios TS.
    /* tenant-safe: borrado por token, UNIQUE global (M8) — FCM reporta el token inválido, nunca el usuario/gimnasio dueño (T-175-03) */
    await this.db
      .delete(schema.deviceTokens)
      .where(
        sql`/* tenant-safe: borrado por token, UNIQUE global (M8) — FCM reporta el token inválido, nunca el usuario/gimnasio dueño (T-175-03) */ ${schema.deviceTokens.token} = ${token}`,
      );

    this.log.info(
      { token: token.slice(0, 20) + "..." },
      "Device token removed",
    );
  }

  // ── Notification Preferences ────────────────────────────────────────────

  /**
   * Get notification preferences for a user.
   * Returns all categories with defaults (true) for any missing rows (per D-19).
   */
  async getUserPreferences(
    userId: number,
  ): Promise<Record<NotificationCategory, boolean>> {
    /* tenant-safe: filtro por userId propio del destinatario — acota a las filas de un solo usuario sin ambigüedad, no hace falta tenant para resolverlas (mismo criterio que resolveUserTenant, T-175-03) */
    const rows = await this.db
      .select({
        category: schema.notificationPreferences.category,
        enabled: schema.notificationPreferences.enabled,
      })
      .from(schema.notificationPreferences)
      .where(
        sql`/* tenant-safe: filtro por userId propio del destinatario — acota a las filas de un solo usuario sin ambigüedad, no hace falta tenant para resolverlas (mismo criterio que resolveUserTenant, T-175-03) */ ${schema.notificationPreferences.userId} = ${userId}`,
      );

    // Default all categories to true
    const prefs: Record<NotificationCategory, boolean> = {
      entrenamiento: true,
      programas: true,
      motivacion: true,
      anuncios: true,
      planes: true,
      referidos: true,
    };

    for (const row of rows) {
      const cat = row.category as NotificationCategory;
      if (NOTIFICATION_CATEGORIES.includes(cat)) {
        prefs[cat] = row.enabled;
      }
    }

    return prefs;
  }

  /**
   * Update a single notification preference for a user.
   * Upserts — creates row if not exists, updates if exists.
   *
   * T-175-03: `tenant_id` estampado desde el tenant real del usuario
   * (derivado, `resolveUserTenant`). La unique es `(user_id, category)` así
   * que un duplicado siempre pertenece al MISMO usuario/tenant — no hace
   * falta refrescar `tenant_id` en el `ON DUPLICATE` como en `registerToken`.
   */
  async updatePreference(
    userId: number,
    category: NotificationCategory,
    enabled: boolean,
  ): Promise<void> {
    const ctx = await this.resolveUserTenant(userId);
    if (!ctx) {
      throw new Error(
        `updatePreference: usuario ${userId} no encontrado — no se puede resolver el gimnasio dueño de la preferencia`,
      );
    }

    await this.db.execute(
      sql`INSERT INTO notification_preferences (user_id, notification_category, enabled, tenant_id)
          VALUES (${userId}, ${category}, ${enabled}, ${ctx.tenantId})
          ON DUPLICATE KEY UPDATE enabled = ${enabled}, updated_at = NOW()`,
    );

    this.log.info(
      { userId, category, enabled },
      "Notification preference updated",
    );
  }

  // ── Gender Resolution ────────────────────────────────────────────────────

  /**
   * Resolve whether a user should receive female notification copy.
   * Per D-12: only 'female' gets female copy; male/other/unspecified/null all get default (male).
   *
   * T-175-03: reemplaza el guard `isNotNull(tenantId)` provisional (T-173-08)
   * por Pattern A real. `queueNotification` (su único llamador) sigue sin
   * `ctx` de request propio — T-173-08 dejó explícitamente afuera de esta
   * cirugía enhebrar `ctx` en los ~13 call sites ajenos de `queueNotification`
   * (crons, subscriptions/service.ts, scheduling/booking-service.ts,
   * sessions/routes.ts) — pero ahora SÍ deriva un `TenantContext` real por
   * fila propia (`resolveUserTenant`) antes de llegar acá, así que el
   * `ctx` que recibe este método ya no es una quinta fuente inventada.
   */
  private async resolveUseFemale(
    userId: number,
    ctx: TenantContext,
  ): Promise<boolean> {
    const [user] = await this.db
      .select({ gender: schema.users.gender })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
      .limit(1);
    return user?.gender === "female";
  }

  /**
   * Deriva el `TenantContext` real del destinatario leyendo su propia fila
   * de `users` (T-175-03). PRE-SCOPE deliberado: no hay `ctx` de request
   * disponible en `registerToken`/`updatePreference`/`queueNotification` (ver
   * el docblock de `resolveUseFemale`) — el `userId` identifica una sola
   * fila sin ambigüedad, así que no hace falta (ni se puede) filtrar por
   * tenant para resolverla. Mismo idioma que
   * `campaigns/tracking-service.ts#getSendEmail` (T-175-02) aplicado a un
   * usuario en vez de a un `campaign_send`.
   *
   * `null` cuando el usuario no existe (borrado entre el enqueue/la llamada
   * y esta resolución) — cada llamador decide si eso es un no-op o un error.
   */
  private async resolveUserTenant(
    userId: number,
  ): Promise<TenantContext | null> {
    const [row] = await this.db
      .select({ tenantId: schema.users.tenantId })
      .from(schema.users)
      .where(
        sql`/* tenant-safe: userId identifica la fila propia del destinatario, pre-scope para derivar su tenant real — no hay ctx previo posible acá (T-175-03) */ ${schema.users.id} = ${userId}`,
      )
      .limit(1);
    return row ? { tenantId: row.tenantId } : null;
  }

  // ── Queue Operations ────────────────────────────────────────────────────

  /**
   * Queue a notification using a predefined template.
   * Checks template existence, enabled status, and user preference before queueing.
   * Resolves user gender to select correct copy variant (per D-12).
   *
   * @returns The pending notification ID, or -1 if skipped
   */
  async queueNotification(input: QueueNotificationInput): Promise<number> {
    const {
      userId,
      templateKey,
      scheduledAt,
      titleOverride,
      bodyOverride,
      routeOverride,
    } = input;

    // T-175-03: deriva el tenant real del destinatario ANTES del lookup de
    // template. Sin esto, `templateKey` puede resolver la plantilla de OTRO
    // gimnasio desde la mig 168 (unique compuesta `(tenant_id, template_key)`,
    // no determinístico) — bug real, no solo higiene de lint.
    const ctx = await this.resolveUserTenant(userId);
    if (!ctx) {
      this.log.warn(
        { userId, templateKey },
        "queueNotification: usuario no encontrado — skipping",
      );
      return -1;
    }

    // Look up template, scoped al tenant real del destinatario (Pattern A)
    const [template] = await this.db
      .select()
      .from(schema.notificationTemplates)
      .where(
        and(
          tenantWhere(schema.notificationTemplates, ctx),
          eq(schema.notificationTemplates.templateKey, templateKey),
        ),
      )
      .limit(1);

    if (!template) {
      this.log.warn(
        { templateKey },
        "Notification template not found — skipping",
      );
      return -1;
    }

    if (!template.isEnabled) {
      this.log.info(
        { templateKey },
        "Notification template disabled — skipping",
      );
      return -1;
    }

    // Check user preference for this template's category
    const prefs = await this.getUserPreferences(userId);
    const category = template.category as NotificationCategory;
    if (!prefs[category]) {
      this.log.info(
        { userId, category, templateKey },
        "User preference disabled for category — skipping",
      );
      return -1;
    }

    // Skip enqueueing for users without a device token. Without one, the
    // queue processor would only mark the row 'failed' with
    // "No device tokens registered" — pure noise that drowns real FCM errors.
    // Fase 180 (D-20/D-24): `allowWithoutDeviceToken` opts out of this guard
    // for callers that have a guaranteed alternate channel (processQueue's
    // email fallback) — see the docblock on QueueNotificationInput.
    if (
      !input.allowWithoutDeviceToken &&
      !(await this.userHasDeviceToken(userId, ctx))
    ) {
      this.log.info(
        { userId, templateKey },
        "User has no device tokens — skipping",
      );
      return -1;
    }

    // Resolve gender-specific copy (per D-12)
    const useFemale = await this.resolveUseFemale(userId, ctx);
    const resolvedTitle =
      titleOverride ??
      (useFemale && template.titleFemale
        ? template.titleFemale
        : template.title);
    const resolvedBody =
      bodyOverride ??
      (useFemale && template.bodyFemale ? template.bodyFemale : template.body);

    // Insert into pending_notifications (T-175-03: tenant_id estampado del
    // ctx derivado del destinatario, ver arriba)
    const result = await this.db.insert(schema.pendingNotifications).values(
      tenantValues(ctx, {
        userId,
        templateId: template.id,
        title: resolvedTitle,
        body: resolvedBody,
        route: routeOverride ?? template.route ?? "/mi-templo",
        // Fase 193 (D-01/D-05): el destino curado del template viaja a la
        // fila encolada — sin esto, editar el destino de un template vía
        // PUT /admin/templates/:id no tendría ningún efecto en la push
        // real (routeOverride sigue ganando cuando un caller interno lo
        // pasa explícito, mismo criterio que ya regía para `route`).
        destinationType: routeOverride
          ? "app_section"
          : template.destinationType,
        destinationSection: routeOverride ? null : template.destinationSection,
        whatsappText: routeOverride ? null : template.whatsappText,
        status: "pending",
        scheduledAt: scheduledAt ?? new Date(),
      }),
    );

    const insertId = Number(result[0].insertId);
    this.log.info(
      { userId, templateKey, notificationId: insertId },
      "Notification queued",
    );

    return insertId;
  }

  /**
   * Queue an ad-hoc notification (for admin segment sends).
   * Checks user preference for 'anuncios' category (per D-22).
   *
   * T-175-03: a diferencia de `queueNotification`, ambos call sites de este
   * método (`routes.ts` admin/send-segment y `jobs/tenure-milestones.ts`) YA
   * resuelven un `TenantContext` real antes de llamarlo — así que acá SÍ se
   * enhebra `ctx` como parámetro en vez de derivarlo por fila (no hace falta
   * la vuelta de `resolveUserTenant`).
   *
   * @returns The pending notification ID, or -1 if skipped
   */
  async queueAdHocNotification(
    input: QueueAdHocInput,
    ctx: TenantContext,
  ): Promise<number> {
    const { userId, title, body, category, route, destination, scheduledAt } =
      input;

    // Check user preference for the notification category
    const prefs = await this.getUserPreferences(userId);
    if (!prefs[category]) {
      this.log.info(
        { userId, category },
        "User preference disabled for ad-hoc category — skipping",
      );
      return -1;
    }

    // Skip if user has no device token — see queueNotification for rationale.
    if (!(await this.userHasDeviceToken(userId, ctx))) {
      this.log.info(
        { userId, category },
        "User has no device tokens — skipping ad-hoc",
      );
      return -1;
    }

    // Fase 193 (D-01/D-04): `destination` (ya validado por el caller con
    // `validateDestination`) gana sobre el `route` suelto — deriva el
    // fallback con `fallbackRouteFor` y persiste el destino curado. Callers
    // viejos sin migrar (`jobs/tenure-milestones.ts`) siguen funcionando
    // idéntico: sin `destination`, cae al `route`/default de siempre.
    const resolvedRoute = destination
      ? fallbackRouteFor(destination)
      : (route ?? "/mi-templo");

    const result = await this.db.insert(schema.pendingNotifications).values(
      tenantValues(ctx, {
        userId,
        templateId: null,
        title,
        body,
        route: resolvedRoute,
        destinationType: destination?.type ?? "app_section",
        destinationSection: destination?.section ?? null,
        whatsappText: destination?.whatsappText ?? null,
        status: "pending",
        scheduledAt: scheduledAt ?? new Date(),
      }),
    );

    const insertId = Number(result[0].insertId);
    this.log.info(
      { userId, category, notificationId: insertId },
      "Ad-hoc notification queued",
    );

    return insertId;
  }

  // ── Queue Processing ────────────────────────────────────────────────────

  /**
   * Process the notification queue — called by cron every 15 min (per D-10).
   * Selects pending notifications where scheduledAt <= now, sends via FCM.
   *
   * T-175-03: barrido GENUINAMENTE cross-tenant — no recibe `ctx` y procesa
   * `pending_notifications` de TODOS los gimnasios en una sola pasada, PK por
   * PK. Cada fila ya nació con su `tenant_id` correcto (estampado en
   * `queueNotification`/`queueAdHocNotification`, T-175-03), así que este
   * método solo despacha/actualiza filas por su propia PK — no hace falta
   * (ni corresponde) un `tenantWhere` acá. NOTA (hallazgo, no arreglado en
   * este plan): `runNotificationQueueTickForTenant` en `notification-cron.ts`
   * llama a este método UNA VEZ POR GIMNASIO ACTIVO vía `forEachActiveTenant`
   * — con un solo tenant activo hoy es un no-op, pero el día que haya un
   * tenant 2 este barrido global se reprocesaría N veces (una por gimnasio).
   * Ese re-diseño (pasar `ctx` acá y filtrar `pending_notifications` por
   * tenant) es fuera del alcance de esta cirugía — 175 no fuerza `ctx` en
   * crons de sistema.
   */
  async processQueue(): Promise<{ sent: number; failed: number }> {
    // Add 1s buffer to account for MySQL timestamp second-level truncation
    const now = new Date(Date.now() + 1000);
    let sent = 0;
    let failed = 0;

    /* tenant-safe: barrido cron genuinamente cross-tenant — procesa la cola de TODOS los gimnasios en una pasada, ver docblock del método (T-175-03) */
    const notifications = await this.db
      .select()
      .from(schema.pendingNotifications)
      .where(
        and(
          sql`/* tenant-safe: barrido cron genuinamente cross-tenant — procesa la cola de TODOS los gimnasios en una pasada, ver docblock del método (T-175-03) */ 1 = 1`,
          eq(schema.pendingNotifications.status, "pending"),
          lte(schema.pendingNotifications.scheduledAt, now),
        ),
      )
      .orderBy(schema.pendingNotifications.scheduledAt)
      .limit(QUEUE_BATCH_SIZE);

    if (notifications.length === 0) {
      return { sent: 0, failed: 0 };
    }

    this.log.info(
      { count: notifications.length },
      "Processing notification queue",
    );

    for (const notification of notifications) {
      /* tenant-safe: barrido cron genuinamente cross-tenant, userId de la fila ya tenant-correcta de arriba — ver docblock de processQueue (T-175-03) */
      const tokens = await this.db
        .select({ token: schema.deviceTokens.token })
        .from(schema.deviceTokens)
        .where(
          sql`/* tenant-safe: barrido cron genuinamente cross-tenant, userId de la fila ya tenant-correcta de arriba — ver docblock de processQueue (T-175-03) */ ${schema.deviceTokens.userId} = ${notification.userId}`,
        );

      if (tokens.length === 0) {
        // Fase 180 (D-24): la única excepción al "failed sin device tokens"
        // — el recordatorio de sesión de prueba tiene un canal alternativo
        // garantizado (email). Cualquier otro templateKey conserva el
        // comportamiento de siempre (T-180-10/T-180-12/T-180-13 acotan el
        // alcance de esta rama a ESE template).
        if (await this.sendTrialReminderEmailFallback(notification)) {
          /* tenant-safe: update por PK de una fila ya resuelta por el barrido de arriba — ver docblock de processQueue (T-175-03) */
          await this.db
            .update(schema.pendingNotifications)
            .set({
              status: "sent",
              sentAt: new Date(),
            })
            .where(
              sql`/* tenant-safe: update por PK de una fila ya resuelta por el barrido de arriba — ver docblock de processQueue (T-175-03) */ ${schema.pendingNotifications.id} = ${notification.id}`,
            );

          sent++;
          continue;
        }

        /* tenant-safe: update por PK de una fila ya resuelta por el barrido de arriba — ver docblock de processQueue (T-175-03) */
        await this.db
          .update(schema.pendingNotifications)
          .set({
            status: "failed",
            errorMessage: "No device tokens registered",
          })
          .where(
            sql`/* tenant-safe: update por PK de una fila ya resuelta por el barrido de arriba — ver docblock de processQueue (T-175-03) */ ${schema.pendingNotifications.id} = ${notification.id}`,
          );

        failed++;
        continue;
      }

      let anySent = false;

      for (const { token } of tokens) {
        const success = await this.sendToDevice(
          token,
          notification.title,
          notification.body,
          notification,
        );

        if (success) {
          anySent = true;
        }
      }

      if (anySent) {
        /* tenant-safe: update por PK de una fila ya resuelta por el barrido de arriba — ver docblock de processQueue (T-175-03) */
        await this.db
          .update(schema.pendingNotifications)
          .set({
            status: "sent",
            sentAt: new Date(),
          })
          .where(
            sql`/* tenant-safe: update por PK de una fila ya resuelta por el barrido de arriba — ver docblock de processQueue (T-175-03) */ ${schema.pendingNotifications.id} = ${notification.id}`,
          );

        // Increment sentCount on template if applicable (per D-31)
        if (notification.templateId) {
          /* tenant-safe: update por PK de templateId ya resuelto desde la fila pending_notifications de arriba — anchor derivado, ver docblock de processQueue (T-175-03) */
          await this.db.execute(
            sql`/* tenant-safe: update por PK de templateId ya resuelto desde la fila pending_notifications de arriba — anchor derivado, ver docblock de processQueue (T-175-03) */
                UPDATE notification_templates
                SET sent_count = sent_count + 1
                WHERE id = ${notification.templateId}`,
          );
        }

        sent++;
      } else {
        /* tenant-safe: update por PK de una fila ya resuelta por el barrido de arriba — ver docblock de processQueue (T-175-03) */
        await this.db
          .update(schema.pendingNotifications)
          .set({
            status: "failed",
            errorMessage: "All device tokens failed",
          })
          .where(
            sql`/* tenant-safe: update por PK de una fila ya resuelta por el barrido de arriba — ver docblock de processQueue (T-175-03) */ ${schema.pendingNotifications.id} = ${notification.id}`,
          );

        failed++;
      }
    }

    this.log.info({ sent, failed }, "Notification queue processed");
    return { sent, failed };
  }

  // ── FCM Delivery ────────────────────────────────────────────────────────

  /**
   * Send a notification to a single device token via FCM.
   * In DRY_RUN mode, logs the notification and returns true.
   * On invalid token errors, auto-deletes the token (per D-27).
   * Single retry on failure (per D-38).
   *
   * Fase 193 (D-04): recibe la fila ENTERA de `pending_notifications` (no un
   * `route` suelto) — `buildPushData` arma el payload con el fallback
   * (`route`, ya resuelto al encolar) + el destino nuevo.
   */
  async sendToDevice(
    token: string,
    title: string,
    body: string,
    notification: typeof schema.pendingNotifications.$inferSelect,
  ): Promise<boolean> {
    const { id: notificationId } = notification;
    const route = notification.route ?? "/mi-templo";

    if (this.dryRun) {
      this.log.info(
        {
          token: token.slice(0, 20) + "...",
          title,
          route,
          notificationId,
        },
        "DRY_RUN: Would send notification",
      );
      return true;
    }

    if (!this.messaging) {
      this.log.warn(
        { notificationId },
        "FCM not initialized — cannot send notification",
      );
      return false;
    }

    const message = {
      token,
      notification: { title, body },
      data: buildPushData({
        route,
        destinationType: notification.destinationType,
        destinationSection: notification.destinationSection,
        whatsappText: notification.whatsappText,
        notificationId,
      }),
    };

    // First attempt
    try {
      await this.messaging.send(message);
      return true;
    } catch (err: unknown) {
      if (this.isInvalidTokenError(err)) {
        await this.removeToken(token);
        return false;
      }

      // Single retry (per D-38)
      this.log.warn(
        {
          token: token.slice(0, 20) + "...",
          err: err instanceof Error ? err.message : "Unknown",
        },
        "FCM send failed — retrying",
      );

      await this.delay(RETRY_DELAY_MS);

      try {
        await this.messaging.send(message);
        return true;
      } catch (retryErr: unknown) {
        if (this.isInvalidTokenError(retryErr)) {
          await this.removeToken(token);
        }

        this.log.error(
          {
            token: token.slice(0, 20) + "...",
            err: retryErr instanceof Error ? retryErr.message : "Unknown",
          },
          "FCM send failed after retry",
        );
        return false;
      }
    }
  }

  // ── Tracking ────────────────────────────────────────────────────────────

  /**
   * Record that a notification was opened by the user (per D-31, D-32).
   * Increments openedCount on the associated template.
   *
   * T-175-03: pre-scope genuino — `POST /:id/opened` (routes.ts) solo recibe
   * el `id` de la notificación, sin ctx. `notificationId` es la PK propia de
   * la fila que se marca abierta.
   */
  async recordOpened(notificationId: number): Promise<void> {
    /* tenant-safe: notificationId es la PK propia de la fila, pre-scope — no hay ctx en esta ruta pública (T-175-03) */
    const [notification] = await this.db
      .select({ templateId: schema.pendingNotifications.templateId })
      .from(schema.pendingNotifications)
      .where(
        sql`/* tenant-safe: notificationId es la PK propia de la fila, pre-scope — no hay ctx en esta ruta pública (T-175-03) */ ${schema.pendingNotifications.id} = ${notificationId}`,
      )
      .limit(1);

    if (!notification?.templateId) {
      this.log.info(
        { notificationId },
        "No template associated with notification — skip open tracking",
      );
      return;
    }

    /* tenant-safe: update por PK de templateId ya resuelto desde la fila pending_notifications de arriba — anchor derivado (T-175-03) */
    await this.db.execute(
      sql`/* tenant-safe: update por PK de templateId ya resuelto desde la fila pending_notifications de arriba — anchor derivado (T-175-03) */
          UPDATE notification_templates
          SET opened_count = opened_count + 1
          WHERE id = ${notification.templateId}`,
    );

    this.log.info(
      { notificationId, templateId: notification.templateId },
      "Notification opened recorded",
    );
  }

  // ── Maintenance ─────────────────────────────────────────────────────────

  /**
   * Purge sent/failed notifications older than 24 hours (per D-11).
   * Keeps the pending_notifications table small.
   *
   * T-175-03: barrido genuinamente cross-tenant, igual que `processQueue` —
   * purga por `status`/`createdAt` de TODOS los gimnasios en una pasada, sin
   * `ctx`. Cada fila ya nació con su `tenant_id` correcto (T-175-03); acá solo
   * se borra por esos dos campos, nunca se lee ni se expone el contenido.
   */
  async purgeOldNotifications(): Promise<number> {
    const cutoff = new Date(Date.now() - PURGE_AGE_MS);

    /* tenant-safe: barrido cron genuinamente cross-tenant — purga la cola de TODOS los gimnasios en una pasada, ver docblock del método (T-175-03) */
    const result = await this.db
      .delete(schema.pendingNotifications)
      .where(
        and(
          sql`/* tenant-safe: barrido cron genuinamente cross-tenant — purga la cola de TODOS los gimnasios en una pasada, ver docblock del método (T-175-03) */ 1 = 1`,
          inArray(schema.pendingNotifications.status, ["sent", "failed"]),
          lte(schema.pendingNotifications.createdAt, cutoff),
        ),
      );

    const deletedCount = result[0].affectedRows ?? 0;

    if (deletedCount > 0) {
      this.log.info({ deletedCount }, "Purged old notifications from queue");
    }

    return deletedCount;
  }

  /**
   * Seed notification templates from TEMPLATE_SEEDS.
   * Uses INSERT IGNORE to skip already-existing template keys.
   * Called during migration/startup.
   *
   * T-175-03: ahora recibe `ctx` real y siembra POR TENANT (antes insertaba
   * GLOBAL con el DEFAULT 1 — ver el comentario que dejó `notification-cron.ts`
   * anticipando este cambio en la adopción de la fase 175). Los dos call
   * sites (`routes.ts` admin/seed-templates y `notification-cron.ts` en el
   * boot) resuelven su propio `ctx` antes de llamar.
   */
  async seedTemplates(
    ctx: TenantContext,
  ): Promise<{ inserted: number; keys: string[] }> {
    const keys: string[] = [];
    for (const seed of TEMPLATE_SEEDS) {
      // `kind` NO va en el INSERT: la columna trae DEFAULT 'system'
      // (migración 0219) — las 16 filas de TEMPLATE_SEEDS son siempre
      // 'system', nunca una regla propia.
      const [result] = await this.db.execute(
        sql`INSERT IGNORE INTO notification_templates
            (tenant_id, template_key, notification_category, title, body, title_female, body_female, route)
            VALUES (${ctx.tenantId}, ${seed.templateKey}, ${seed.category}, ${seed.title}, ${seed.body}, ${seed.titleFemale}, ${seed.bodyFemale}, ${seed.route})`,
      );
      if ((result as { affectedRows?: number }).affectedRows === 1) {
        keys.push(seed.templateKey);
      }
    }

    const inserted = keys.length;
    const skipped = TEMPLATE_SEEDS.length - inserted;
    if (inserted > 0) {
      this.log.info({ inserted, skipped, keys }, "Notification templates seeded");
    } else {
      this.log.info(
        { total: TEMPLATE_SEEDS.length },
        "Notification templates already exist — skipped seeding",
      );
    }

    return { inserted, keys };
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Fase 180 (D-24): fallback por email para la única notificación con canal
   * alternativo garantizado — `trial_session_reminder`. Devuelve `true` si el
   * email salió (la fila debe marcarse 'sent'), `false` en cualquier otro
   * caso (otro template, sin `emailService` inyectado, usuario sin email, o
   * el envío mismo falla) — el llamador conserva el 'failed' de siempre.
   *
   * T-180-10: resuelve el destinatario por el `userId` de la fila ya
   * tenant-correcta del barrido de `processQueue` (mismo criterio que el
   * resto del método, T-175-03) — nunca cruza el email de OTRO usuario.
   */
  private async sendTrialReminderEmailFallback(
    notification: typeof schema.pendingNotifications.$inferSelect,
  ): Promise<boolean> {
    if (!this.emailService || !notification.templateId) return false;

    /* tenant-safe: lookup por PK de templateId ya resuelto desde la fila pending_notifications del barrido cross-tenant — anchor derivado, mismo criterio que el update de sent_count de processQueue (T-175-03) */
    const [template] = await this.db
      .select({ templateKey: schema.notificationTemplates.templateKey })
      .from(schema.notificationTemplates)
      .where(
        sql`/* tenant-safe: lookup por PK de templateId ya resuelto desde la fila pending_notifications del barrido cross-tenant — anchor derivado (T-175-03) */ ${schema.notificationTemplates.id} = ${notification.templateId}`,
      )
      .limit(1);
    if (template?.templateKey !== TRIAL_REMINDER_TEMPLATE_KEY) return false;

    /* tenant-safe: lookup por PK de userId ya resuelto desde la fila pending_notifications del barrido cross-tenant (T-175-03, T-180-10) */
    const [user] = await this.db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(
        sql`/* tenant-safe: lookup por PK de userId ya resuelto desde la fila pending_notifications del barrido cross-tenant (T-175-03, T-180-10) */ ${schema.users.id} = ${notification.userId}`,
      )
      .limit(1);
    if (!user?.email) return false; // nunca se inventa destinatario

    try {
      await this.emailService.sendTrialReminderEmail(
        user.email,
        notification.title,
        notification.body,
      );
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.log.error(
        { err: message, notificationId: notification.id },
        "Trial reminder email fallback failed",
      );
      return false;
    }
  }

  /**
   * Check whether the user has at least one registered device token.
   * Used as an enqueue-time guard to avoid filling pending_notifications
   * with rows that the processor will only mark 'failed: No device tokens'.
   *
   * T-175-03: sus dos llamadores (`queueNotification`/`queueAdHocNotification`)
   * ya tienen `ctx` en mano al llegar acá, así que aplica Pattern A real.
   */
  private async userHasDeviceToken(
    userId: number,
    ctx: TenantContext,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.deviceTokens.id })
      .from(schema.deviceTokens)
      .where(
        and(
          tenantWhere(schema.deviceTokens, ctx),
          eq(schema.deviceTokens.userId, userId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Check if an FCM error indicates an invalid/expired token.
   */
  private isInvalidTokenError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const message = err.message.toLowerCase();
    return (
      message.includes("registration-token-not-valid") ||
      message.includes("invalid-registration-token") ||
      message.includes("not-registered")
    );
  }

  /**
   * Simple delay utility for retry backoff.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
