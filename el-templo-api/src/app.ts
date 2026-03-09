// Application entry point
import Fastify from "fastify";
import * as Sentry from "@sentry/node";
import cors from "@fastify/cors";
import databasePlugin from "./plugins/database";
import r2Plugin from "./plugins/r2";
import authPlugin from "./plugins/auth";
import spomPlugin from "./plugins/spom";
import sessionsPlugin from "./plugins/sessions";
import progressionPlugin from "./plugins/progression";
import { authRoutes } from "./modules/auth";
import { adminRoutes } from "./modules/admin";
import { journeyRoutes } from "./modules/journeys";
import { franchiseRoutes } from "./modules/franchise";
import { gladiusRoutes } from "./modules/gladius";
import { blogRoutes } from "./modules/blog";
import { academyRoutes } from "./modules/academy";
import { appLandingRoutes } from "./modules/app-landing";
import { memberRoutes } from "./modules/members";
import {
  subscriptionRoutes,
  memberSubscriptionRoutes,
} from "./modules/subscriptions";
import { paymentRoutes } from "./modules/payments";
import {
  attendanceAdminRoutes,
  attendanceMemberRoutes,
} from "./modules/attendance";

export async function buildApp() {
  const app = Fastify({ logger: true });

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

  // Routes
  await app.register(authRoutes, { prefix: "/api/auth" });

  // Admin routes (session management for coaches/admins)
  await app.register(adminRoutes, { prefix: "/api/admin" });

  // Journey routes (member journey lifecycle + admin journey management)
  await app.register(journeyRoutes, { prefix: "/api" });

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

  // Member management routes (admin CRUD + notes)
  await app.register(memberRoutes, { prefix: "/api/admin/members" });

  // Subscription management routes (plans CRUD + subscription lifecycle)
  await app.register(subscriptionRoutes, {
    prefix: "/api/admin/subscriptions",
  });

  // Payment management routes (record, void, balance, overdue, summary)
  await app.register(paymentRoutes, { prefix: "/api/admin/payments" });

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

  // Health check endpoint
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Sentry: enrich errors with user context on authenticated requests
  app.addHook("onRequest", async (request) => {
    if (request.user) {
      Sentry.setUser({
        id: String(request.user.userId),
        email: request.user.email,
      });
    }
  });

  // Sentry: capture unhandled Fastify errors
  Sentry.setupFastifyErrorHandler(app);

  return app;
}
