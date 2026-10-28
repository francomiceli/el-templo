/**
 * Fase 201 Plan 13 (§6, A19, T-201-47): permiso de publicación del alumno.
 *
 *   - PUT /api/members/conquer/publish-permission
 *   - GET /api/members/conquer/state (member.publishEnabled / publishNoFace)
 *
 * Integración contra el MySQL de tests. Usuarios SIEMPRE con fábricas.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { clearModuleFlags } from "../fixtures/module-flags";
import {
  createActiveConquerMember,
  insertConquerMember,
  TEMPLO_CTX,
  type ConquerErrorBody,
} from "./_helpers";

const PUBLISH_URL = "/api/members/conquer/publish-permission";
const STATE_URL = "/api/members/conquer/state";

interface PublishBody {
  enabled: boolean;
  noFace: boolean;
  changedAt: string;
}

interface StateBody {
  member: { publishEnabled: boolean; publishNoFace: boolean } | null;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function putPublish(token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "PUT",
    url: PUBLISH_URL,
    headers: auth(token),
    payload,
  });
}

async function stateMember(token: string) {
  const res = await app.inject({
    method: "GET",
    url: STATE_URL,
    headers: auth(token),
  });
  expect(res.statusCode).toBe(200);
  const member = res.json<StateBody>().member;
  if (!member) throw new Error("el alumno debería estar activo");
  return member;
}

async function readMemberRow(userId: number) {
  const [row] = await app.db
    .select()
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
  return row;
}

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterEach(async () => {
  await clearModuleFlags(app, TENANT_DOS);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

describe("PUT /publish-permission (§6, A19)", () => {
  it("el alumno recién activado no tiene permiso; al activarlo con 'sin cara' queda reflejado en la respuesta, en /state y en la base", async () => {
    const m = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    expect(await stateMember(m.token)).toMatchObject({
      publishEnabled: false,
      publishNoFace: false,
    });
    expect((await readMemberRow(m.userId)).publishChangedAt).toBeNull();

    const res = await putPublish(m.token, { enabled: true, noFace: true });

    expect(res.statusCode).toBe(200);
    const body = res.json<PublishBody>();
    expect(body.enabled).toBe(true);
    expect(body.noFace).toBe(true);
    expect(Number.isNaN(Date.parse(body.changedAt))).toBe(false);
    expect(await stateMember(m.token)).toMatchObject({
      publishEnabled: true,
      publishNoFace: true,
    });
    const row = await readMemberRow(m.userId);
    expect(row.publishEnabled).toBe(true);
    expect(row.publishNoFace).toBe(true);
    expect(row.publishChangedAt).not.toBeNull();
  });

  it("activar con la cara visible deja noFace en false", async () => {
    const m = await createActiveConquerMember(app, {
      level: "ternero",
      daysCount: 3,
    });

    const res = await putPublish(m.token, { enabled: true, noFace: false });

    expect(res.statusCode).toBe(200);
    expect(res.json<PublishBody>()).toMatchObject({
      enabled: true,
      noFace: false,
    });
  });

  it("el alumno puede retirar el permiso: enabled false", async () => {
    const m = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    await putPublish(m.token, { enabled: true, noFace: true });

    const res = await putPublish(m.token, { enabled: false, noFace: true });

    expect(res.statusCode).toBe(200);
    expect(res.json<PublishBody>().enabled).toBe(false);
    expect(await stateMember(m.token)).toMatchObject({
      publishEnabled: false,
    });
    expect((await readMemberRow(m.userId)).publishEnabled).toBe(false);
  });

  it("cambia SOLO al alumno del token, aunque el body traiga el userId de otro", async () => {
    const yo = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const otro = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 3,
    });

    const res = await putPublish(yo.token, {
      enabled: true,
      noFace: true,
      userId: otro.userId,
    });

    expect(res.statusCode).toBe(200);
    expect((await readMemberRow(yo.userId)).publishEnabled).toBe(true);
    const ajeno = await readMemberRow(otro.userId);
    expect(ajeno.publishEnabled).toBe(false);
    expect(ajeno.publishChangedAt).toBeNull();
  });

  it("alumno con pedido pendiente: 409 CONQUER_NO_ACTIVO y no cambia nada", async () => {
    const socio = await createTestMember(app);
    await insertConquerMember(app, socio.id);

    const res = await putPublish(socio.token, { enabled: true, noFace: false });

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    const row = await readMemberRow(socio.id);
    expect(row.publishEnabled).toBe(false);
    expect(row.publishChangedAt).toBeNull();
  });

  it("alumno bloqueado (sin fila): 409 CONQUER_NO_ACTIVO y no crea la fila", async () => {
    const socio = await createTestMember(app);

    const res = await putPublish(socio.token, { enabled: true, noFace: false });

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    expect(await readMemberRow(socio.id)).toBeUndefined();
  });

  it.each([
    ["body vacío", {}],
    ["sin noFace", { enabled: true }],
    ["sin enabled", { noFace: true }],
    ["enabled no booleano", { enabled: "si", noFace: false }],
    ["noFace no booleano", { enabled: true, noFace: "no" }],
  ])("body inválido (%s): 400", async (_titulo, payload) => {
    const m = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const res = await putPublish(m.token, payload);

    expect(res.statusCode).toBe(400);
    expect((await readMemberRow(m.userId)).publishEnabled).toBe(false);
  });

  it("sin token: 401", async () => {
    const res = await app.inject({
      method: "PUT",
      url: PUBLISH_URL,
      payload: { enabled: true, noFace: false },
    });

    expect(res.statusCode).toBe(401);
  });

  it("socio del gimnasio 2 sin el módulo de entrenamiento: 404", async () => {
    // El gimnasio 2 no tiene filas de flags: módulo apagado.
    const res = await putPublish(gym2.socios[0].token, {
      enabled: true,
      noFace: false,
    });

    expect(res.statusCode).toBe(404);
  });
});
