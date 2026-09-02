// Application entry point
import Fastify from "fastify";
import type { RouteOptions } from "fastify";
import * as Sentry from "@sentry/node";
import querystring from "node:querystring";
import cors from "@fastify/cors";
import databasePlugin from "./plugins/database";
import r2Plugin from "./plugins/r2";
import authPlugin from "./plugins/auth";
import spomPlugin from "./plugins/spom";
import sessionsPlugin from "./plugins/sessions";
import progressionPlugin from "./plugins/progression";
import treeProgressPlugin from "./plugins/tree-progress";
import treeEditorPlugin from "./plugins/tree-editor";
import exerciseAdjustmentsPlugin from "./plugins/exercise-adjustments";
import exerciseAdjustmentsCoachPlugin from "./plugins/exercise-adjustments-coach";
import { authRoutes } from "./modules/auth";
import { adminRoutes } from "./modules/admin";
import { goalPlanRoutes } from "./modules/goal-plans";
import { memberRoutes } from "./modules/members";
import { leadsRoutes } from "./modules/members/leads-routes";
import {
  subscriptionRoutes,
  memberSubscriptionRoutes,
} from "./modules/subscriptions";
import {
  attendanceAdminRoutes,
  attendanceMemberRoutes,
} from "./modules/attendance";
import { anniversaryAdminRoutes } from "./modules/anniversaries";
import {
  schedulingAdminRoutes,
  schedulingMemberRoutes,
} from "./modules/scheduling";
import { analyticsRoutes } from "./modules/analytics";
import { reportsRoutes } from "./modules/reports";
import { coachRoutes } from "./modules/coach";
import { ratingsAdminRoutes, ratingsMemberRoutes } from "./modules/ratings";
import {
  improvementProposalsAdminRoutes,
  improvementProposalsMemberRoutes,
} from "./modules/improvement-proposals";
import { financeRoutes, coachLoadRoutes } from "./modules/finance";
import { userRoutes } from "./modules/users";
import { settingsRoutes } from "./modules/settings";
import {
  checkInRoutes,
  checkInAdminRoutes,
  checkInRosterRoutes,
} from "./modules/check-ins";
import { programRoutes } from "./modules/programs";
import { notificationRoutes } from "./modules/notifications";
import { communicationsRoutes, tvAvisosRoutes } from "./modules/communications";
import { referralMemberRoutes } from "./modules/referrals/routes";
import { referralAdminRoutes } from "./modules/referrals/admin-routes";
import { referralPartnersAdminRoutes } from "./modules/referral-partners";
import { campaignRoutes } from "./modules/campaigns/routes";
import { wellhubWebhookRoutes } from "./modules/wellhub/routes";
import { wellhubOccupancyListener } from "./modules/wellhub/occupancy-listener";
import { tvControlRoutes } from "./modules/tv";
import { moduleScope } from "./modules/shared/module-registry";
import { registerModules } from "./modules-boot";

/**
 * Opciones de `buildApp`. Hoy tiene un solo campo y es a propósito: la
 * superficie mínima es parte de la decisión (fase 171, ISO-01).
 *
 * ES TEST-ONLY
 * ------------
 * `src/index.ts` llama `buildApp()` sin argumentos: en producción las opciones
 * son el default `{}`, el campo es exactamente `undefined` y NO se agrega
 * ningún hook. El seam no cuesta nada en el binario que sirve a los socios.
 *
 * POR QUÉ VIVE ACÁ Y NO EN `createTestApp()`
 * ------------------------------------------
 * Porque ahí no funcionaría, no por gusto. Un hook `onRoute` solo ve las rutas
 * registradas DESPUÉS de colgarse, y cada `await app.register(...)` de abajo
 * ejecuta su plugin en el acto: para cuando `buildApp()` retorna, las ~370
 * rutas ya están registradas y un hook colgado por el llamador vería 0. Peor
 * todavía después de `await app.ready()`, donde Fastify tira
 * `FST_ERR_INSTANCE_ALREADY_LISTENING`. Por eso el hook se cuelga acá adentro,
 * como primerísimo statement del factory —antes del parser de content-type y
 * antes del primer `register`— y `createTestApp()` solo REENVÍA las opciones.
 *
 * QUIÉN LO CONSUME
 * ----------------
 * El gate fail-closed `test/tenancy/iso-01-manifiesto.test.ts` (fase 171,
 * ISO-01): cruza las rutas que este hook observa contra el manifiesto escrito a
 * mano `test/tenant-manifest.ts`. Una ruta nueva sin clasificar deja CI en rojo.
 * Si alguien "limpia" este parámetro, ese gate deja de existir.
 */
export interface BuildAppOptions {
  /** Se invoca una vez por cada ruta registrada, con el `RouteOptions` de Fastify. */
  onRoute?: (route: RouteOptions) => void;
}

export async function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? { level: "silent" } : true,
  });

  // Seam del inventario de rutas (fase 171, ISO-01). Va PRIMERO: un hook
  // `onRoute` solo ve lo que se registra después de colgarse. Ver el docblock
  // de `BuildAppOptions` — en producción esto es `undefined` y no corre nada.
  if (opts.onRoute) app.addHook("onRoute", opts.onRoute);

  // Permissive content-type parser for application/x-www-form-urlencoded.
  // Capacitor Android WebView defaults to this content-type on mutating
  // requests with no body, causing Fastify to return 415 for old app builds
  // (pre-Apr 2026 axios workaround). We accept and parse the body so the
  // route runs normally — for all current routes the URL params carry the
  // identifying info; any form fields end up in request.body as-is.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const parsed =
          typeof body === "string" && body.length > 0
            ? querystring.parse(body)
            : {};
        done(null, parsed);
      } catch (err) {
        done(err instanceof Error ? err : new Error(String(err)));
      }
    },
  );

  // CORS configuration
  await app.register(cors, {
    origin:
      process.env.NODE_ENV === "development"
        ? [
            "http://localhost:9000",
            "http://localhost:9100",
            "http://localhost:9101",
            "http://localhost:9200", // el-templo-web (landing/franchise)
            "capacitor://localhost",
            "http://localhost",
          ]
        : [
            process.env.FRONTEND_URL || "https://app.eltemplo.org",
            process.env.ADMIN_URL || "https://admin.eltemplo.org",
            "https://eltemplo.org", // Landing / franchise page
            "capacitor://localhost", // Android Capacitor
            "http://localhost", // iOS Capacitor
          ],
    methods: ["GET", "HEAD", "PUT", "POST", "PATCH", "DELETE", "OPTIONS"],
    // Sin esto el browser recuerda el preflight solo 5 segundos (default de la spec) y el
    // kiosco de la TV, que pollea cada 2,5 s con header Authorization, manda un OPTIONS
    // por medio. 24 h es el techo que respeta Chromium (lo capea a 2 h por su cuenta).
    maxAge: 86400,
  });

  // Database plugin (decorates fastify.db)
  await app.register(databasePlugin);

  // R2 plugin (decorates fastify.r2 and fastify.r2Bucket)
  await app.register(r2Plugin);

  // Auth plugin (decorates fastify.jwt and fastify.authenticate)
  await app.register(authPlugin);

  // Fase 176 Plan 03 (MOD-01, D-04): los 12 registros de rutas de
  // `templo-training` quedan IN-PLACE acá (no migran al formato `ModuleDef`
  // en esta fase) pero envueltos con `moduleScope`, que appendea el guard
  // `requireModule` a cada ruta que registren. Son 12, no 7: los 7 `fp` de
  // abajo cubren 25 de las 102 rutas de training — las otras 77 vienen de
  // los 5 registros directos (adminRoutes, goalPlanRoutes, programRoutes,
  // checkInRoutes, checkInAdminRoutes) envueltos más abajo. Ver
  // 176-RESEARCH.md §"Mapeo completo" para el detalle ruta por ruta.

  // SPOM plugin (SPOM data access endpoints)
  await moduleScope(app, "templo-training", spomPlugin);

  // Sessions plugin (session generation and retrieval)
  await moduleScope(app, "templo-training", sessionsPlugin);

  // Progression plugin (member stats and evaluation requests)
  await moduleScope(app, "templo-training", progressionPlugin);

  // Tree-progress plugin (member skill-tree % advancement — Phase 127)
  await moduleScope(app, "templo-training", treeProgressPlugin);

  // Tree-editor plugin (admin/coach skill-tree editor — Phase 128)
  await moduleScope(app, "templo-training", treeEditorPlugin);

  // Exercise-adjustments plugin (in-session difficulty adjustment — Phase 131)
  await moduleScope(app, "templo-training", exerciseAdjustmentsPlugin);

  // Exercise-adjustments coach plugin (coach/owner read of a member's
  // dominado/bajado log — Phase 131 Plan 02)
  await moduleScope(app, "templo-training", exerciseAdjustmentsCoachPlugin);

  // Routes
  await app.register(authRoutes, { prefix: "/api/auth" });

  // Admin routes (session management for coaches/admins)
  await moduleScope(app, "templo-training", adminRoutes, {
    prefix: "/api/admin",
  });

  // Goal plan routes (member goal plan lifecycle + admin goal plan management)
  await moduleScope(app, "templo-training", goalPlanRoutes, {
    prefix: "/api",
  });

  // Wellhub webhook (público, autenticado por firma HMAC — una sola URL para
  // todos los eventos de check-in y reservas de la plataforma Wellhub)
  await app.register(wellhubWebhookRoutes, { prefix: "/api/webhooks/wellhub" });

  // Wellhub: push de ocupación ante reservas/cancelaciones (no-op sin config)
  await app.register(wellhubOccupancyListener);

  // Member management routes (admin CRUD + notes)
  await app.register(memberRoutes, { prefix: "/api/admin/members" });

  // Phase 114: Admin leads sub-router (PATCH lead_status / lead_notes on
  // users with status='prueba'). Sibling of /api/admin/members because the
  // verb space is distinct and the plugin needs its own onRequest hook.
  await app.register(leadsRoutes, { prefix: "/api/admin/leads" });

  // Subscription management routes (plans CRUD + subscription lifecycle)
  await app.register(subscriptionRoutes, {
    prefix: "/api/admin/subscriptions",
  });

  // Attendance management routes (QR generation, batch confirm, manual check-in)
  await app.register(anniversaryAdminRoutes, {
    prefix: "/api/admin/anniversaries",
  });

  await app.register(attendanceAdminRoutes, {
    prefix: "/api/admin/attendance",
  });

  // Member-facing attendance routes (QR check-in, history)
  await app.register(attendanceMemberRoutes, {
    prefix: "/api/members/attendance",
  });

  // Member-facing subscription route (read-only, no admin role required)
  await app.register(memberSubscriptionRoutes, {
    prefix: "/api/members/subscription",
  });

  // Member-facing referrals route (fase 158, read-only, self-scoped by token)
  await app.register(referralMemberRoutes, {
    prefix: "/api/members/referrals",
  });

  // Admin referrals route (v5.5 follow-up): resultados globales del A/B copy test
  await app.register(referralAdminRoutes, {
    prefix: "/api/admin/referrals",
  });

  // CRUD admin de partners de comercio/marca (fase 179): listar, ver, crear y
  // editar. Solo MEMBER_LIFECYCLE_ROLES (owner/admin/gestion).
  await app.register(referralPartnersAdminRoutes, {
    prefix: "/api/admin/referral-partners",
  });

  // Scheduling management routes (activities, schedules, bookings, holidays)
  await app.register(schedulingAdminRoutes, {
    prefix: "/api/admin/scheduling",
  });

  // Member-facing scheduling routes (weekly grid, reserve, cancel, my bookings)
  await app.register(schedulingMemberRoutes, {
    prefix: "/api/members/scheduling",
  });

  // Analytics routes (admin-only KPI stats, member/attendance/financial analytics)
  await app.register(analyticsRoutes, {
    prefix: "/api/admin/analytics",
  });

  // Reports routes (access log, charges, expiring, inactive + Excel exports)
  await app.register(reportsRoutes, {
    prefix: "/api/admin/reports",
  });

  // Coach routes (simplified Deudas tab for professors at the door)
  await app.register(coachRoutes, {
    prefix: "/api/admin/coach",
  });

  // Ratings routes (Phase 143): weekly roster write (coach/owner) + owner-only
  // ratings view, and member-facing pending + submit.
  await app.register(ratingsAdminRoutes, {
    prefix: "/api/admin/ratings",
  });
  await app.register(ratingsMemberRoutes, {
    prefix: "/api/members/ratings",
  });

  // Propuestas de mejora por sucursal: member prompt-status + submit, y
  // listado/export admin (MEMBER_LIFECYCLE_ROLES).
  await app.register(improvementProposalsAdminRoutes, {
    prefix: "/api/admin/improvement-proposals",
  });
  await app.register(improvementProposalsMemberRoutes, {
    prefix: "/api/members/improvement-proposals",
  });

  // Finance routes (transactions create/void/list, financial history) — Phase 106
  await app.register(financeRoutes, {
    prefix: "/api/admin/finance",
  });

  // Phase 140 — coach PoS load plugin. SEPARATE registration (its own
  // FINANCE_LOAD_ROLES guard) so the finance module's FINANCE_READ_ROLES hook
  // (coach excluded) never blocks the coach load endpoints.
  await app.register(coachLoadRoutes, {
    prefix: "/api/admin/finance/coach-load",
  });

  // Fase 164 — pantalla TV de sucursal. El kiosco anonimo por device token
  // (RFC 8628) se elimino: la pantalla TV ahora es una vista del admin
  // AUTENTICADA (`tvControlRoutes`, staff con `fastify.authenticate` +
  // TV_CONTROL_ROLES, D-01). `tv_pairings` / `tv_devices` quedan en el schema
  // sin uso hasta que se decida el DROP.
  await app.register(tvControlRoutes, { prefix: "/api/admin/tv" });

  // User management routes (owner-only staff CRUD)
  await app.register(userRoutes, {
    prefix: "/api/admin/users",
  });

  // Settings routes (Phase 154 ALUM-03): pricing rules — GET readable by any
  // staff (PoS needs the value), PUT owner-only.
  await app.register(settingsRoutes, {
    prefix: "/api/admin/settings",
  });

  // Check-in routes (daily energy/soreness/sleep check-ins)
  await moduleScope(app, "templo-training", checkInRoutes, {
    prefix: "/api/check-ins",
  });
  // Vista admin del Registro del día (tab de Feedback, ADMIN_ROLES).
  await moduleScope(app, "templo-training", checkInAdminRoutes, {
    prefix: "/api/admin/check-ins",
  });
  // Roster de registros del día para Horarios (coach + admin/dueño). NO se
  // envuelve con moduleScope (176-03, D-04): comparte prefijo con
  // checkInAdminRoutes de arriba pero está clasificado `tenant-scoped` en el
  // manifiesto — es un registro distinto, no una ruta de templo-training.
  await app.register(checkInRosterRoutes, { prefix: "/api/admin/check-ins" });

  // Program management routes (admin CRUD + member catalog/progress)
  await moduleScope(app, "templo-training", programRoutes, { prefix: "/api" });

  // Notification routes (push notifications, preferences, admin templates)
  await app.register(notificationRoutes, { prefix: "/api/notifications" });

  // Fase 193 — Comunicaciones. Core para todos los tenants (D-23): NO va
  // envuelto en `moduleScope`. Solo las rutas de avisos de TV se gatean por
  // `templo-training` (ver `tvAvisosRoutes`).
  await app.register(communicationsRoutes, { prefix: "/api/communications" });

  // Fase 193 Plan 07 (D-23): la pestaña Avisos en TV se gatea por
  // `templo-training`, el mismo módulo que gatea el resto del TV en vivo
  // (`spomPlugin`, `sessionsPlugin`, `checkInRoutes`). No existe un módulo
  // `tv` propio (`MODULE_NAMES`). `tvControlRoutes` sigue registrada SIN
  // `moduleScope` a propósito: cambiar su gate está fuera de alcance en esta
  // fase (D-25: un módulo apagado no puede dejar a un TV de producción sin
  // datos a mitad de clase).
  await moduleScope(app, "templo-training", tvAvisosRoutes, {
    prefix: "/api/communications/tv",
  });

  // Campaign routes (Phase 119): public tracking (open/click/unsubscribe) +
  // admin campaign create/list/send/funnel/eligible-count.
  await app.register(campaignRoutes, { prefix: "/api/campaigns" });

  // Composition root de módulos Templo (marketing, onboarding, gamification).
  // Ver `src/modules-boot.ts` para el detalle de qué registra y por qué.
  await registerModules(app);

  // Health check endpoint
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Sentry: enrich errors with user context on authenticated requests
  app.addHook("onRequest", async (request) => {
    if (request.user) {
      Sentry.setUser({
        id: String(request.user.userId),
        email: request.user.email ?? undefined,
      });
    }
  });

  // Sentry: capture unhandled Fastify errors
  Sentry.setupFastifyErrorHandler(app);

  return app;
}
