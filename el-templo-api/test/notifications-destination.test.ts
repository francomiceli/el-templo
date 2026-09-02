/**
 * Notifications — Destino común (Fase 193, D-01/D-02/D-04/D-05)
 *
 * Cubre:
 * - `buildPushData` (unitario, sin DB): payload FCM con fallback SIEMPRE +
 *   destino nuevo, compatible hacia atrás (D-04), solo strings (requisito FCM).
 * - `PUT /admin/templates/:id` y `POST /admin/send-segment`: el destino se
 *   valida server-side contra la lista curada (D-05); `route` de texto libre
 *   desaparece del body (`additionalProperties: false`).
 *
 * DRY_RUN=true evita envíos FCM reales (mismo criterio que notifications.test.ts).
 */

process.env.DRY_RUN = "true";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  registerUser,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
} from "./helpers";
import { buildPushData, NotificationService } from "../src/modules/notifications/service";
import { DEFAULT_WHATSAPP_TEXT } from "../src/modules/communications";
import * as schema from "../src/db/schema";
import { tenantWhere } from "../src/modules/shared/tenant";
import { and, eq } from "drizzle-orm";

// El gimnasio de los fixtures (El Templo = tenant 1).
const CTX = { tenantId: 1 };

describe("Notifications — Destino común (Fase 193)", () => {
  // ===========================================================================
  // 1. buildPushData — unitario, sin DB (T-193-23)
  // ===========================================================================
  describe("buildPushData (unit)", () => {
    it("app_section: route viaja tal cual y destination === 'app_section'", () => {
      const data = buildPushData({
        route: "/reservas",
        destinationType: "app_section",
        destinationSection: "reservas",
        whatsappText: null,
        notificationId: 42,
      });

      expect(data.route).toBe("/reservas");
      expect(data.destination).toBe("app_section");
      expect(data.destinationSection).toBe("reservas");
      expect(data.notificationId).toBe("42");
    });

    it("whatsapp_sales: route de fallback es /mi-templo (D-04, la app vieja nunca cae en 404)", () => {
      const data = buildPushData({
        route: "/mi-templo",
        destinationType: "whatsapp_sales",
        destinationSection: null,
        whatsappText: "Hola! Quiero saber más",
        notificationId: 7,
      });

      expect(data.route).toBe("/mi-templo");
      expect(data.destination).toBe("whatsapp_sales");
      expect(data.whatsappText).toBe("Hola! Quiero saber más");
    });

    it("whatsapp_sales sin whatsappText propio usa el default global (D-02)", () => {
      const data = buildPushData({
        route: "/mi-templo",
        destinationType: "whatsapp_sales",
        destinationSection: null,
        whatsappText: null,
        notificationId: 8,
      });

      expect(data.whatsappText).toBe(DEFAULT_WHATSAPP_TEXT);
    });

    it("todos los valores son string y ninguna clave queda con undefined (requisito FCM data)", () => {
      const withSection = buildPushData({
        route: "/reservas",
        destinationType: "app_section",
        destinationSection: "reservas",
        whatsappText: null,
        notificationId: 1,
      });
      for (const value of Object.values(withSection)) {
        expect(typeof value).toBe("string");
      }
      // Sin whatsapp_sales, la clave `whatsappText` ni siquiera se agrega —
      // no está presente en `Object.keys`, no es un `undefined` colado.
      expect(Object.keys(withSection)).not.toContain("whatsappText");

      const withWhatsapp = buildPushData({
        route: "/mi-templo",
        destinationType: "whatsapp_sales",
        destinationSection: null,
        whatsappText: null,
        notificationId: 2,
      });
      for (const value of Object.values(withWhatsapp)) {
        expect(typeof value).toBe("string");
      }
      expect(Object.keys(withWhatsapp)).not.toContain("destinationSection");
    });
  });

  // ===========================================================================
  // 2. Rutas admin — validación server-side (D-05) + no-regresión de compat
  // ===========================================================================
  describe("Rutas admin — validación de destino e integración", () => {
    let app: FastifyInstance;
    let ownerToken: string;
    let adminToken: string;
    let coachToken: string;
    let memberToken: string;
    let memberId: number;

    const timestamp = Date.now();
    const ownerEmail = `notifdest-owner-${timestamp}@test.com`;
    const ownerPassword = "owner-pass-123";
    const adminEmail = `notifdest-admin-${timestamp}@test.com`;
    const adminPassword = "admin-pass-123";
    const coachEmail = `notifdest-coach-${timestamp}@test.com`;
    const coachPassword = "coach-pass-123";
    const memberEmail = `notifdest-member-${timestamp}@test.com`;
    const memberPassword = "member-pass-123";

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await cleanAllTestData(app);
      await app.close();
    });

    beforeEach(async () => {
      await cleanAllTestData(app);

      await createStaffUser(app, {
        email: ownerEmail,
        password: ownerPassword,
        firstName: "Owner",
        lastName: "Test",
        role: "owner",
        branchId: 1,
      });
      ownerToken = await getAuthToken(app, ownerEmail, ownerPassword);

      await createStaffUser(app, {
        email: adminEmail,
        password: adminPassword,
        firstName: "Admin",
        lastName: "Test",
        role: "admin",
        branchId: 1,
      });
      adminToken = await getAuthToken(app, adminEmail, adminPassword);

      await createStaffUser(app, {
        email: coachEmail,
        password: coachPassword,
        firstName: "Coach",
        lastName: "Test",
        role: "coach",
        branchId: 1,
      });
      coachToken = await getAuthToken(app, coachEmail, coachPassword);

      const memberResult = await registerUser(app, {
        email: memberEmail,
        password: memberPassword,
        branchId: 1,
      });
      memberToken = memberResult.token;
      memberId = (memberResult.user as { id: number }).id;

      const seedRes = await app.inject({
        method: "POST",
        url: "/api/notifications/admin/seed-templates",
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(seedRes.statusCode).toBe(200);
    });

    /** Trae el id del primer template sembrado (mismo patrón que notifications.test.ts). */
    async function firstTemplateId(): Promise<number> {
      const listRes = await app.inject({
        method: "GET",
        url: "/api/notifications/admin/templates",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const templates = JSON.parse(listRes.body).templates;
      return templates[0].id;
    }

    async function templateRow(id: number) {
      const [row] = await app.db
        .select()
        .from(schema.notificationTemplates)
        .where(
          and(
            tenantWhere(schema.notificationTemplates, CTX),
            eq(schema.notificationTemplates.id, id),
          ),
        );
      return row;
    }

    // ── PUT /admin/templates/:id ──────────────────────────────────────────

    it("PUT .../templates/:id con section fuera de la lista curada devuelve 400 y no cambia la fila", async () => {
      const templateId = await firstTemplateId();
      const before = await templateRow(templateId);

      const res = await app.inject({
        method: "PUT",
        url: `/api/notifications/admin/templates/${templateId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          destination: { type: "app_section", section: "no-existe" },
        },
      });

      expect(res.statusCode).toBe(400);

      const after = await templateRow(templateId);
      expect(after.route).toBe(before.route);
      expect(after.destinationType).toBe(before.destinationType);
      expect(after.destinationSection).toBe(before.destinationSection);
    });

    it("PUT .../templates/:id con whatsappText con link devuelve 400 (T-193-22)", async () => {
      const templateId = await firstTemplateId();

      const res = await app.inject({
        method: "PUT",
        url: `/api/notifications/admin/templates/${templateId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          destination: {
            type: "whatsapp_sales",
            whatsappText: "mirá https://evil.example",
          },
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("PUT .../templates/:id con body viejo { route } devuelve 400 (additionalProperties:false, T-193-21)", async () => {
      const templateId = await firstTemplateId();

      const res = await app.inject({
        method: "PUT",
        url: `/api/notifications/admin/templates/${templateId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { route: "/lo-que-sea" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("PUT .../templates/:id con destino app_section válido devuelve 200 y route = ruta de la sección", async () => {
      const templateId = await firstTemplateId();

      const res = await app.inject({
        method: "PUT",
        url: `/api/notifications/admin/templates/${templateId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          destination: { type: "app_section", section: "reservas" },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.route).toBe("/reservas");
      // Deviation (plan 08, Rule 2): el admin necesita el destino curado en
      // la respuesta para re-pintar el selector tras guardar, sin recargar.
      expect(body.destinationType).toBe("app_section");
      expect(body.destinationSection).toBe("reservas");

      const row = await templateRow(templateId);
      expect(row.route).toBe("/reservas");
      expect(row.destinationType).toBe("app_section");
      expect(row.destinationSection).toBe("reservas");
    });

    it("PUT .../templates/:id con destino whatsapp_sales válido devuelve 200 y route cae a /mi-templo (D-04)", async () => {
      const templateId = await firstTemplateId();

      const res = await app.inject({
        method: "PUT",
        url: `/api/notifications/admin/templates/${templateId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          destination: { type: "whatsapp_sales", whatsappText: null },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.route).toBe("/mi-templo");
      expect(body.destinationType).toBe("whatsapp_sales");
      // whatsappText queda null (no vino uno propio); el default global
      // (D-02) se resuelve más tarde, en `buildPushData` al armar la push
      // real — no acá, donde el admin necesita ver "vacío" para saber que
      // no hay override propio.
      expect(body.whatsappText).toBeNull();

      const row = await templateRow(templateId);
      expect(row.route).toBe("/mi-templo");
      expect(row.destinationType).toBe("whatsapp_sales");
      expect(row.destinationSection).toBeNull();
      expect(row.whatsappText).toBeNull();
    });

    it("GET /admin/templates devuelve destinationType/destinationSection/whatsappText por fila (deviation plan 08)", async () => {
      const templateId = await firstTemplateId();
      await app.inject({
        method: "PUT",
        url: `/api/notifications/admin/templates/${templateId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          destination: { type: "app_section", section: "referidos" },
        },
      });

      const listRes = await app.inject({
        method: "GET",
        url: "/api/notifications/admin/templates",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const templates = JSON.parse(listRes.body).templates;
      const row = templates.find((t: { id: number }) => t.id === templateId);
      expect(row.destinationType).toBe("app_section");
      expect(row.destinationSection).toBe("referidos");
      expect(row.whatsappText).toBeNull();
    });

    it("PUT .../templates/:id con rol coach devuelve 403", async () => {
      const templateId = await firstTemplateId();

      const res = await app.inject({
        method: "PUT",
        url: `/api/notifications/admin/templates/${templateId}`,
        headers: { authorization: `Bearer ${coachToken}` },
        payload: {
          destination: { type: "app_section", section: "mi_templo" },
        },
      });

      expect(res.statusCode).toBe(403);
    });

    // ── POST /admin/send-segment ──────────────────────────────────────────

    it("POST /admin/send-segment con destino whatsapp_sales encola filas con destination_type y route correctos", async () => {
      await app.db.insert(schema.memberProfiles).values({
        userId: memberId,
        segment: "optima",
        segmentUpdatedAt: new Date(),
      });

      const service = new NotificationService(app.db, app.log, true);
      await service.registerToken(
        memberId,
        "fcm-dest-segment-token-abcdef123456789012345678901234567890",
        "android",
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/admin/send-segment",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: "Hablemos",
          body: "Escribinos por WhatsApp",
          segmentIds: ["optima"],
          destination: {
            type: "whatsapp_sales",
            whatsappText: "Hola! Quiero más info",
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.queued).toBeGreaterThanOrEqual(1);

      const [row] = await app.db
        .select()
        .from(schema.pendingNotifications)
        .where(
          and(
            tenantWhere(schema.pendingNotifications, CTX),
            eq(schema.pendingNotifications.userId, memberId),
          ),
        );
      expect(row).toBeDefined();
      expect(row.destinationType).toBe("whatsapp_sales");
      expect(row.route).toBe("/mi-templo");
      expect(row.whatsappText).toBe("Hola! Quiero más info");
    });

    it("POST /admin/send-segment sin destination (compat) sigue funcionando con el default de siempre (mi_templo)", async () => {
      await app.db.insert(schema.memberProfiles).values({
        userId: memberId,
        segment: "optima",
        segmentUpdatedAt: new Date(),
      });

      const service = new NotificationService(app.db, app.log, true);
      await service.registerToken(
        memberId,
        "fcm-dest-segment-nodest-token-abcdef123456789012345678901234567890",
        "android",
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/admin/send-segment",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: "Sin destino explícito",
          body: "Body de prueba",
          segmentIds: ["optima"],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.queued).toBeGreaterThanOrEqual(1);

      const [row] = await app.db
        .select()
        .from(schema.pendingNotifications)
        .where(
          and(
            tenantWhere(schema.pendingNotifications, CTX),
            eq(schema.pendingNotifications.userId, memberId),
          ),
        );
      expect(row.route).toBe("/mi-templo");
      expect(row.destinationType).toBe("app_section");
    });

    it("POST /admin/send-segment con rol coach devuelve 403", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/admin/send-segment",
        headers: { authorization: `Bearer ${coachToken}` },
        payload: {
          title: "No debería enviarse",
          body: "Body",
          segmentIds: ["optima"],
          destination: { type: "app_section", section: "mi_templo" },
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("POST /admin/send-segment con member token devuelve 403 (no admin)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/admin/send-segment",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          title: "No debería enviarse",
          body: "Body",
          segmentIds: ["optima"],
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
