/**
 * Notificaciones push propias con reglas recetadas — CRUD admin (pedido de
 * Franco, 2026-09-03). Integración HTTP contra `createTestApp()` de:
 *   POST/PUT/DELETE/GET /api/notifications/admin/templates (kind: 'custom')
 *   POST /api/notifications/admin/templates/preview-audience
 *   POST /api/notifications/admin/seed-templates ("Restaurar las del sistema")
 *
 * El motor de reglas en sí (los 5 triggers, cadencia, alcance) se prueba en
 * `test/notifications/custom-rules-engine.test.ts` — este archivo cubre
 * SOLO la capa HTTP: validación de contenido, permisos, y el contrato de
 * homogeneidad sistema/propias (borrar y restaurar).
 *
 * LIMPIEZA: `notification_templates` SÍ está en `TABLES_TO_CLEAN`
 * (`cleanAllTestData` la vacía entera, incluidas las 17 filas de sistema) —
 * los tests que necesitan el catálogo de sistema lo re-siembran con
 * `service.seedTemplates(CTX)` en su propio `beforeEach` local o inline.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/notifications/custom-rules.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { NotificationService } from "../../src/modules/notifications/service";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const BASE = "/api/notifications";
const CTX_TEMPLO = { tenantId: TENANT_TEMPLO };
const COACH_EMAIL = "coach-custom-rules@test.com";
const COACH_PASSWORD = "coachpass123";

// Tenant + sede AJENOS a El Templo, para el caso "scope con sede de otro
// tenant" (T-193-11: la validación de CONTENIDO, no solo de forma). Id
// elegido por no colisionar con los fixtures de otros archivos del mismo
// worker (90168/90169/90269/90369/90469/90671 ya están tomados).
const OTRO_TENANT_ID = 90919;
let otraSedeId: number;

function getComo(url: string, token: string) {
  return app.inject({
    method: "GET",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function postComo(url: string, token: string, payload?: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function putComo(url: string, token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "PUT",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function deleteComo(url: string, token: string) {
  return app.inject({
    method: "DELETE",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

interface TemplateRow {
  id: number;
  templateKey: string;
  kind: string;
  name: string | null;
  category: string;
  title: string;
  triggerType: string | null;
  triggerValue: number | null;
  triggerSegment: string | null;
  scopeBranchIds: number[] | null;
  scopeCountries: string[] | null;
  cooldownDays: number;
  isEnabled: boolean;
}

function buildValidRuleBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: "Regla de prueba 193",
    category: "motivacion",
    title: "Título de prueba",
    body: "Cuerpo de prueba",
    destination: { type: "app_section", section: "mi_templo", whatsappText: null },
    triggerType: "segment_is",
    triggerSegment: "alerta",
    ...overrides,
  };
}

async function getTemplates(token: string): Promise<TemplateRow[]> {
  const res = await getComo("/admin/templates", token);
  return (JSON.parse(res.body) as { templates: TemplateRow[] }).templates;
}

let app: FastifyInstance;
let adminToken: string;
let coachToken: string;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  await app.db.insert(schema.tenants).values({
    id: OTRO_TENANT_ID,
    name: "Otro gimnasio (custom-rules)",
    slug: `test-193-custom-rules-${OTRO_TENANT_ID}`,
    status: "active",
  });
  const [sede] = await app.db
    .insert(schema.branches)
    .values({
      tenantId: OTRO_TENANT_ID,
      name: "Sede ajena",
      code: `CR${OTRO_TENANT_ID}`,
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
    lastName: "CustomRules",
    role: "coach",
    branchId: 1,
  });
  coachToken = await getAuthToken(app, COACH_EMAIL, COACH_PASSWORD);
});

describe("notifications/custom-rules — POST /admin/templates (crear regla propia)", () => {
  it("(1) crea una regla propia válida, aparece en GET con kind:'custom' y templateKey generado", async () => {
    const res = await postComo("/admin/templates", adminToken, buildValidRuleBody());
    expect(res.statusCode, res.body).toBe(201);
    const created = JSON.parse(res.body) as TemplateRow;
    expect(created.kind).toBe("custom");
    expect(created.templateKey.startsWith("custom_")).toBe(true);
    expect(created.name).toBe("Regla de prueba 193");
    expect(created.triggerType).toBe("segment_is");
    expect(created.triggerSegment).toBe("alerta");

    const templates = await getTemplates(adminToken);
    expect(templates.some((t) => t.id === created.id)).toBe(true);
  });

  it("(2) triggerType fuera del catálogo -> 400", async () => {
    const res = await postComo(
      "/admin/templates",
      adminToken,
      buildValidRuleBody({ triggerType: "no_existe", triggerSegment: undefined }),
    );
    expect(res.statusCode, res.body).toBe(400);
  });

  it("(3) triggerValue fuera del rango del trigger (plan_expired_days_ago exige >= 1) -> 400", async () => {
    const res = await postComo(
      "/admin/templates",
      adminToken,
      buildValidRuleBody({
        triggerType: "plan_expired_days_ago",
        triggerSegment: undefined,
        triggerValue: 0,
      }),
    );
    expect(res.statusCode, res.body).toBe(400);
  });

  it("(3b) triggerValue en un trigger que no lo lleva (segment_is) -> 400", async () => {
    const res = await postComo(
      "/admin/templates",
      adminToken,
      buildValidRuleBody({ triggerValue: 5 }),
    );
    expect(res.statusCode, res.body).toBe(400);
  });

  it("(4) scopeBranchIds con una sede de OTRO tenant -> 400 (T-193-11, validación de contenido)", async () => {
    const res = await postComo(
      "/admin/templates",
      adminToken,
      buildValidRuleBody({ scopeBranchIds: [otraSedeId] }),
    );
    expect(res.statusCode, res.body).toBe(400);
  });

  it("(5) título/cuerpo con link -> 400", async () => {
    const res = await postComo(
      "/admin/templates",
      adminToken,
      buildValidRuleBody({ body: "Mirá esto: https://evil.example" }),
    );
    expect(res.statusCode, res.body).toBe(400);
  });

  it("(6) coach recibe 403 en las 5 rutas nuevas", async () => {
    const created = await postComo("/admin/templates", adminToken, buildValidRuleBody());
    const createdBody = JSON.parse(created.body) as TemplateRow;

    const post = await postComo("/admin/templates", coachToken, buildValidRuleBody());
    expect(post.statusCode).toBe(403);

    const put = await putComo(`/admin/templates/${createdBody.id}`, coachToken, {
      name: "hackeado",
    });
    expect(put.statusCode).toBe(403);

    const del = await deleteComo(`/admin/templates/${createdBody.id}`, coachToken);
    expect(del.statusCode).toBe(403);

    const preview = await postComo(
      "/admin/templates/preview-audience",
      coachToken,
      { triggerType: "segment_is", triggerSegment: "alerta" },
    );
    expect(preview.statusCode).toBe(403);

    const get = await getComo("/admin/templates", coachToken);
    expect(get.statusCode).toBe(403);
  });
});

describe("notifications/custom-rules — PUT/DELETE (homogeneidad sistema/propias)", () => {
  it("(7) PUT sobre una regla propia: name/triggerValue/cooldownDays editables -> 200", async () => {
    const created = await postComo(
      "/admin/templates",
      adminToken,
      buildValidRuleBody({
        triggerType: "plan_expires_in_days",
        triggerSegment: undefined,
        triggerValue: 3,
      }),
    );
    const createdBody = JSON.parse(created.body) as TemplateRow;

    const res = await putComo(`/admin/templates/${createdBody.id}`, adminToken, {
      name: "Regla renombrada",
      triggerValue: 5,
      cooldownDays: 45,
    });
    expect(res.statusCode, res.body).toBe(200);
    const updated = JSON.parse(res.body) as TemplateRow;
    expect(updated.name).toBe("Regla renombrada");
    expect(updated.triggerValue).toBe(5);
    expect(updated.cooldownDays).toBe(45);
  });

  it("(8) PUT con campos de regla sobre un template de SISTEMA -> 400 (no lleva condición recetada)", async () => {
    const service = new NotificationService(app.db, app.log);
    await service.seedTemplates(CTX_TEMPLO);
    const [systemTemplate] = await app.db
      .select({ id: schema.notificationTemplates.id })
      .from(schema.notificationTemplates)
      .where(
        and(
          tenantWhere(schema.notificationTemplates, CTX_TEMPLO),
          eq(schema.notificationTemplates.kind, "system"),
        ),
      )
      .limit(1);
    expect(systemTemplate).toBeDefined();

    const resBad = await putComo(
      `/admin/templates/${systemTemplate.id}`,
      adminToken,
      { name: "no debería aplicar" },
    );
    expect(resBad.statusCode, resBad.body).toBe(400);

    // Pero SÍ se edita completo en lo que no es la condición recetada
    // (homogeneidad, D-13).
    const resOk = await putComo(`/admin/templates/${systemTemplate.id}`, adminToken, {
      title: "Título de sistema editado",
    });
    expect(resOk.statusCode, resOk.body).toBe(200);
  });

  it("(9) DELETE de una regla propia -> 200; de una plantilla de SISTEMA -> 200 (homogéneo)", async () => {
    const created = await postComo("/admin/templates", adminToken, buildValidRuleBody());
    const createdBody = JSON.parse(created.body) as TemplateRow;
    const resCustom = await deleteComo(`/admin/templates/${createdBody.id}`, adminToken);
    expect(resCustom.statusCode, resCustom.body).toBe(200);

    const service = new NotificationService(app.db, app.log);
    await service.seedTemplates(CTX_TEMPLO);
    const [systemTemplate] = await app.db
      .select({ id: schema.notificationTemplates.id, templateKey: schema.notificationTemplates.templateKey })
      .from(schema.notificationTemplates)
      .where(
        and(
          tenantWhere(schema.notificationTemplates, CTX_TEMPLO),
          eq(schema.notificationTemplates.kind, "system"),
        ),
      )
      .limit(1);

    const resSystem = await deleteComo(`/admin/templates/${systemTemplate.id}`, adminToken);
    expect(resSystem.statusCode, resSystem.body).toBe(200);

    const templates = await getTemplates(adminToken);
    expect(templates.some((t) => t.templateKey === systemTemplate.templateKey)).toBe(false);
  });

  it("(10) POST /admin/seed-templates restaura SOLO lo que falta, sin pisar un título editado", async () => {
    const service = new NotificationService(app.db, app.log);
    const seedResult = await service.seedTemplates(CTX_TEMPLO);
    expect(seedResult.inserted).toBe(17);

    const rows = await app.db
      .select({ id: schema.notificationTemplates.id, templateKey: schema.notificationTemplates.templateKey })
      .from(schema.notificationTemplates)
      .where(tenantWhere(schema.notificationTemplates, CTX_TEMPLO));
    expect(rows.length).toBe(17);

    const [aEditar, aBorrar] = rows;

    // Editar el título de uno.
    await putComo(`/admin/templates/${aEditar.id}`, adminToken, {
      title: "Editado a mano por el admin",
    });

    // Borrar otro.
    const resDelete = await deleteComo(`/admin/templates/${aBorrar.id}`, adminToken);
    expect(resDelete.statusCode, resDelete.body).toBe(200);

    const resRestore = await postComo("/admin/seed-templates", adminToken);
    expect(resRestore.statusCode, resRestore.body).toBe(200);
    const restoreBody = JSON.parse(resRestore.body) as {
      restored: number;
      keys: string[];
    };
    expect(restoreBody.restored).toBe(1);
    expect(restoreBody.keys).toEqual([aBorrar.templateKey]);

    const templates = await getTemplates(adminToken);
    expect(templates.length).toBe(17);
    const editado = templates.find((t) => t.id === aEditar.id);
    expect(editado?.title).toBe("Editado a mano por el admin");
    expect(templates.some((t) => t.templateKey === aBorrar.templateKey)).toBe(true);
  });
});

describe("notifications/custom-rules — POST /admin/templates/preview-audience", () => {
  async function insertActiveMember(segment: "alerta" | "regular"): Promise<number> {
    const res = await app.db.insert(schema.users).values({
      email: `preview-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`,
      passwordHash: "x",
      firstName: "Preview",
      lastName: "Member",
      role: "member",
      status: "activo",
      branchId: 1,
    });
    const userId = Number(res[0].insertId);
    await app.db.insert(schema.memberProfiles).values({ userId, segment });
    return userId;
  }

  it("(11) devuelve el conteo de socios que hoy cumplirían la condición", async () => {
    await insertActiveMember("alerta");
    await insertActiveMember("alerta");
    await insertActiveMember("regular");

    const res = await postComo("/admin/templates/preview-audience", adminToken, {
      triggerType: "segment_is",
      triggerSegment: "alerta",
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { count: number };
    expect(body.count).toBe(2);
  });

  it("(12) validación de contenido también aplica acá: scope de otro tenant -> 400", async () => {
    const res = await postComo("/admin/templates/preview-audience", adminToken, {
      triggerType: "segment_is",
      triggerSegment: "alerta",
      scopeBranchIds: [otraSedeId],
    });
    expect(res.statusCode, res.body).toBe(400);
  });
});
