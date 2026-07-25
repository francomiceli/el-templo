// Application entry point
import Fastify from "fastify";
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
import { franchiseRoutes } from "./modules/franchise";
import { gladiusRoutes } from "./modules/gladius";
import { blogRoutes } from "./modules/blog";
import { academyRoutes } from "./modules/academy";
import { appLandingRoutes } from "./modules/app-landing";
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
import { onboardingRoutes } from "./modules/onboarding";
import { barChallengeRoutes } from "./modules/bar-challenge/routes";
import { checkInRoutes, checkInAdminRoutes } from "./modules/check-ins";
import { programRoutes } from "./modules/programs";
import { notificationRoutes } from "./modules/notifications";
import { referralMemberRoutes } from "./modules/referrals/routes";
import { referralAdminRoutes } from "./modules/referrals/admin-routes";
import { campaignRoutes } from "./modules/campaigns/routes";
import { wellhubWebhookRoutes } from "./modules/wellhub/routes";
import { wellhubOccupancyListener } from "./modules/wellhub/occupancy-listener";
import { tvDeviceRoutes, tvControlRoutes } from "./modules/tv";

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? { level: "silent" } : true,
  });

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

  // SPOM plugin (SPOM data access endpoints)
  await app.register(spomPlugin);

  // Sessions plugin (session generation and retrieval)
  await app.register(sessionsPlugin);

  // Progression plugin (member stats and evaluation requests)
  await app.register(progressionPlugin);

  // Tree-progress plugin (member skill-tree % advancement — Phase 127)
  await app.register(treeProgressPlugin);

  // Tree-editor plugin (admin/coach skill-tree editor — Phase 128)
  await app.register(treeEditorPlugin);

  // Exercise-adjustments plugin (in-session difficulty adjustment — Phase 131)
  await app.register(exerciseAdjustmentsPlugin);

  // Exercise-adjustments coach plugin (coach/owner read of a member's
  // dominado/bajado log — Phase 131 Plan 02)
  await app.register(exerciseAdjustmentsCoachPlugin);

  // Routes
  await app.register(authRoutes, { prefix: "/api/auth" });

  // Admin routes (session management for coaches/admins)
  await app.register(adminRoutes, { prefix: "/api/admin" });

  // Goal plan routes (member goal plan lifecycle + admin goal plan management)
  await app.register(goalPlanRoutes, { prefix: "/api" });

  // Franchise routes (public franchise application form)
  await app.register(franchiseRoutes, { prefix: "/api/franchise" });

  // Gladius routes (product catalog + inquiry form)
  await app.register(gladiusRoutes, { prefix: "/api/gladius" });

  // Blog routes (public blog + admin CRUD + image upload)
  await app.register(blogRoutes, { prefix: "/api/blog" });

  // Academy routes (enrollment inquiry form)
  await app.register(academyRoutes, { prefix: "/api/academy" });

  // App landing routes (waitlist + Labs inquiry forms)
  await app.register(appLandingRoutes, { prefix: "/api/app" });

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

  // Fase 164 — pantalla TV de sucursal. DOS registros separados a proposito
  // (mismo criterio que coachRoutes / coachLoadRoutes de arriba): los guards son
  // incompatibles. `tvDeviceRoutes` atiende al televisor, que no tiene JWT ni
  // rol ni scope de pais — solo un token opaco de dispositivo; `tvControlRoutes`
  // atiende al staff con `fastify.authenticate` + TV_CONTROL_ROLES (D-01).
  // Un unico plugin no podria tener las dos cosas.
  await app.register(tvDeviceRoutes, { prefix: "/api/tv" });
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

  // Onboarding routes (member quiz completion + profile retrieval + analytics)
  await app.register(onboardingRoutes, { prefix: "/api/onboarding" });

  // Phase 115 bar challenge result endpoint (single-attempt, member-only).
  await app.register(barChallengeRoutes, { prefix: "/api/bar-challenge" });

  // Check-in routes (daily energy/soreness/sleep check-ins)
  await app.register(checkInRoutes, { prefix: "/api/check-ins" });
  // Vista admin del Registro del día (tab de Feedback, ADMIN_ROLES).
  await app.register(checkInAdminRoutes, { prefix: "/api/admin/check-ins" });

  // Program management routes (admin CRUD + member catalog/progress)
  await app.register(programRoutes, { prefix: "/api" });

  // Notification routes (push notifications, preferences, admin templates)
  await app.register(notificationRoutes, { prefix: "/api/notifications" });

  // Campaign routes (Phase 119): public tracking (open/click/unsubscribe) +
  // admin campaign create/list/send/funnel/eligible-count.
  await app.register(campaignRoutes, { prefix: "/api/campaigns" });

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
