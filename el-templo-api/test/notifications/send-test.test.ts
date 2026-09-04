/**
 * "Probar en tu teléfono" — `POST /admin/templates/send-test`
 * (pedido de Franco, 2026-09-04).
 *
 * Manda YA el título/cuerpo del editor a los dispositivos de un socio del
 * mismo gimnasio, sin guardar plantilla ni pasar por la cola del cron.
 *
 * DRY_RUN=true evita envíos FCM reales (mismo criterio que
 * notifications.test.ts): `sendToDevice` devuelve true sin tocar Firebase.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/notifications/send-test.test.ts
 */

process.env.DRY_RUN = "true";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const BASE = "/api/notifications";
const CTX = { tenantId: TENANT_TEMPLO };
const OTRO_TENANT_ID = 90920;
const COACH_EMAIL = "coach-send-test@test.com";
const COACH_PASSWORD = "coachpass123";

let app: FastifyInstance;
let adminToken: string;
let coachToken: string;
let otraSedeId: number;
let seq = 0;

function post(url: string, token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Título de prueba",
    body: "Cuerpo de prueba",
    destination: { type: "app_section", section: "mi_templo", whatsappText: null },
    ...overrides,
  };
}

async function insertMember(opts: { tenantId?: number; branchId?: number } = {}): Promise<number> {
  seq += 1;
  const res = await app.db.insert(schema.users).values({
    tenantId: opts.tenantId ?? TENANT_TEMPLO,
    email: `send-test-${seq}-${Date.now()}@test.com`,
    passwordHash: "x",
    firstName: "Prueba",
    lastName: `Socio ${seq}`,
    role: "member",
    status: "activo",
    branchId: opts.branchId ?? 1,
  });
  return Number(res[0].insertId);
}

async function giveDeviceToken(userId: number, tenantId = TENANT_TEMPLO): Promise<void> {
  await app.db.insert(schema.deviceTokens).values({
    tenantId,
    userId,
    token: `tok-${userId}-${Date.now()}`,
    platform: "android",
  });
}

async function pendingRowsFor(userId: number) {
  return app.db
    .select()
    .from(schema.pendingNotifications)
    .where(
      and(
        tenantWhere(schema.pendingNotifications, CTX),
        eq(schema.pendingNotifications.userId, userId),
      ),
    );
}

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  await app.db.insert(schema.tenants).values({
    id: OTRO_TENANT_ID,
    name: "Otro gimnasio (send-test)",
    slug: `test-send-test-${OTRO_TENANT_ID}`,
    status: "active",
  });
  const [sede] = await app.db
    .insert(schema.branches)
    .values({
      tenantId: OTRO_TENANT_ID,
      name: "Sede ajena",
      code: `ST${OTRO_TENANT_ID}`,
      country: "AR",
    })
    .$returningId();
  otraSedeId = sede.id;
});

afterAll(async () => {
  await app.db.delete(schema.branches).where(eq(schema.branches.id, otraSedeId));
  await app.db.delete(schema.tenants).where(eq(schema.tenants.id, OTRO_TENANT_ID));
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await createStaffUser(app, {
    email: COACH_EMAIL,
    password: COACH_PASSWORD,
    firstName: "Coach",
    lastName: "SendTest",
    role: "coach",
    branchId: 1,
  });
  coachToken = await getAuthToken(app, COACH_EMAIL, COACH_PASSWORD);
});

describe("notifications/send-test — POST /admin/templates/send-test", () => {
  it("(1) socio con dispositivo: manda YA, 200 status 'sent', fila en pending_notifications ya como sent (nunca pending)", async () => {
    const userId = await insertMember();
    await giveDeviceToken(userId);

    const res = await post("/admin/templates/send-test", adminToken, validBody({ userId }));
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      status: string;
      notificationId: number;
      memberName: string;
    };
    expect(body.status).toBe("sent");
    expect(body.memberName).toContain("Prueba");

    const rows = await pendingRowsFor(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(body.notificationId);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].templateId).toBeNull();
    expect(rows[0].title).toBe("Título de prueba");
    expect(rows[0].route).toBe("/mi-templo");
    expect(rows[0].destinationType).toBe("app_section");
  });

  it("(2) socio sin dispositivo: 200 status 'no_tokens' y NO se inserta nada", async () => {
    const userId = await insertMember();

    const res = await post("/admin/templates/send-test", adminToken, validBody({ userId }));
    expect(res.statusCode, res.body).toBe(200);
    expect((JSON.parse(res.body) as { status: string }).status).toBe("no_tokens");
    expect(await pendingRowsFor(userId)).toHaveLength(0);
  });

  it("(3) destino whatsapp_sales: la fila guarda destinationType/whatsappText y route de fallback", async () => {
    const userId = await insertMember();
    await giveDeviceToken(userId);

    const res = await post(
      "/admin/templates/send-test",
      adminToken,
      validBody({
        userId,
        destination: { type: "whatsapp_sales", section: null, whatsappText: "Hola, quiero info" },
      }),
    );
    expect(res.statusCode, res.body).toBe(200);
    const [row] = await pendingRowsFor(userId);
    expect(row.destinationType).toBe("whatsapp_sales");
    expect(row.whatsappText).toBe("Hola, quiero info");
    expect(row.route).toBe("/mi-templo");
  });

  it("(4) socio de OTRO gimnasio -> 404 (nunca cruza tenant)", async () => {
    const ajeno = await insertMember({ tenantId: OTRO_TENANT_ID, branchId: otraSedeId });
    await giveDeviceToken(ajeno, OTRO_TENANT_ID);

    const res = await post("/admin/templates/send-test", adminToken, validBody({ userId: ajeno }));
    expect(res.statusCode, res.body).toBe(404);
  });

  it("(5) título/cuerpo con link -> 400; destino inválido -> 400; sin userId -> 400", async () => {
    const userId = await insertMember();
    await giveDeviceToken(userId);

    const conLink = await post(
      "/admin/templates/send-test",
      adminToken,
      validBody({ userId, body: "Mirá https://ejemplo.com" }),
    );
    expect(conLink.statusCode, conLink.body).toBe(400);

    const destinoMalo = await post(
      "/admin/templates/send-test",
      adminToken,
      validBody({ userId, destination: { type: "app_section", section: "no_existe" } }),
    );
    expect(destinoMalo.statusCode, destinoMalo.body).toBe(400);

    const sinUser = await post("/admin/templates/send-test", adminToken, validBody());
    expect(sinUser.statusCode, sinUser.body).toBe(400);

    expect(await pendingRowsFor(userId)).toHaveLength(0);
  });

  it("(6) coach -> 403", async () => {
    const userId = await insertMember();
    const res = await post("/admin/templates/send-test", coachToken, validBody({ userId }));
    expect(res.statusCode, res.body).toBe(403);
  });
});
