/**
 * Tests de integracion del flujo de vinculacion del TV de sucursal (fase 164).
 *
 * Endpoints:
 *   POST /api/tv/pair/start                 (publico — el TV no tiene credenciales)
 *   GET  /api/tv/pair/status?deviceCode=    (publico — pide el SECRETO, no el user_code)
 *   GET  /api/tv/me                         (device token)
 *   POST /api/admin/tv/pair/claim           (JWT + TV_CONTROL_ROLES + sede)
 *   GET  /api/admin/tv/devices              (idem)
 *   POST /api/admin/tv/devices/:id/revoke   (idem)
 *
 * El caso central es el de Pitfall 10 / T-164-09: mandar el `user_code` VISIBLE
 * al endpoint de status no puede entregar un token. Es la unica razon por la que
 * un codigo que no expira (D-02) es aceptable.
 *
 * Corre contra el MySQL de test por worker (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";

const START_URL = "/api/tv/pair/start";
const STATUS_URL = "/api/tv/pair/status";
const CLAIM_URL = "/api/admin/tv/pair/claim";
const DEVICES_URL = "/api/admin/tv/devices";
const ME_URL = "/api/tv/me";

const USER_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

interface Ctx {
  branchAId: number;
  branchBId: number;
  coachAToken: string;
  recepcionAToken: string;
  ownerToken: string;
}

async function seedBranch(
  app: FastifyInstance,
  name: string,
  code: string,
): Promise<number> {
  const [row] = await app.db
    .insert(schema.branches)
    .values({
      name,
      code: nextSuffix(code),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  return row.id;
}

async function seed(app: FastifyInstance): Promise<Ctx> {
  const branchAId = await seedBranch(app, "TV-Sede-A", "TVA");
  const branchBId = await seedBranch(app, "TV-Sede-B", "TVB");

  await createStaffUser(app, {
    email: "tv-coach-a@test.com",
    password: "coach-pass-123",
    firstName: "Coach",
    lastName: "A",
    role: "coach",
    branchId: branchAId,
  });
  await createStaffUser(app, {
    email: "tv-recepcion-a@test.com",
    password: "recep-pass-123",
    firstName: "Recep",
    lastName: "A",
    role: "recepcion",
    branchId: branchAId,
  });
  await createStaffUser(app, {
    email: "tv-owner@test.com",
    password: "owner-pass-123",
    firstName: "Owner",
    lastName: "TV",
    role: "owner",
    branchId: branchAId,
  });

  return {
    branchAId,
    branchBId,
    coachAToken: await getAuthToken(
      app,
      "tv-coach-a@test.com",
      "coach-pass-123",
    ),
    recepcionAToken: await getAuthToken(
      app,
      "tv-recepcion-a@test.com",
      "recep-pass-123",
    ),
    ownerToken: await getAuthToken(app, "tv-owner@test.com", "owner-pass-123"),
  };
}

async function startPairing(
  app: FastifyInstance,
): Promise<{ userCode: string; deviceCode: string }> {
  const res = await app.inject({ method: "POST", url: START_URL });
  if (res.statusCode !== 201) {
    throw new Error(`pair/start failed: ${res.statusCode} ${res.body}`);
  }
  return JSON.parse(res.body) as { userCode: string; deviceCode: string };
}

function status(app: FastifyInstance, deviceCode: string) {
  return app.inject({
    method: "GET",
    url: `${STATUS_URL}?deviceCode=${encodeURIComponent(deviceCode)}`,
  });
}

function claim(
  app: FastifyInstance,
  token: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: CLAIM_URL,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

/** start -> claim -> status: devuelve el device token ya emitido. */
async function pairDevice(
  app: FastifyInstance,
  token: string,
  branchId: number,
  name?: string,
): Promise<{ deviceToken: string; userCode: string }> {
  const { userCode, deviceCode } = await startPairing(app);
  const claimed = await claim(app, token, {
    userCode,
    branchId,
    ...(name ? { name } : {}),
  });
  if (claimed.statusCode !== 200) {
    throw new Error(`claim failed: ${claimed.statusCode} ${claimed.body}`);
  }
  const res = await status(app, deviceCode);
  const body = JSON.parse(res.body) as { deviceToken?: string };
  if (!body.deviceToken) {
    throw new Error(`no deviceToken emitted: ${res.body}`);
  }
  return { deviceToken: body.deviceToken, userCode };
}

describe("TV pairing (RFC 8628) — vinculacion, listado y revocacion", () => {
  let app: FastifyInstance;
  let ctx: Ctx;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    ctx = await seed(app);
  });

  it("POST /pair/start devuelve un user_code legible y un device_code secreto", async () => {
    const res = await app.inject({ method: "POST", url: START_URL });
    expect(res.statusCode).toBe(201);

    const body = JSON.parse(res.body) as {
      userCode: string;
      deviceCode: string;
    };
    // 6 chars del alfabeto sin I/1/O/0 — se lee a 4 metros.
    expect(body.userCode).toMatch(USER_CODE_RE);
    // 256 bits en base64url: nada que se pueda tipear ni fotografiar de lejos.
    expect(body.deviceCode.length).toBeGreaterThanOrEqual(22);
    expect(body.deviceCode).not.toBe(body.userCode);

    // Solo el sha256 se persiste: el device_code en claro no esta en la DB.
    const rows = await app.db
      .select({ hash: schema.tvPairings.deviceCodeHash })
      .from(schema.tvPairings)
      .where(eq(schema.tvPairings.userCode, body.userCode));
    expect(rows).toHaveLength(1);
    expect(rows[0].hash).not.toBe(body.deviceCode);
    expect(rows[0].hash).toHaveLength(64);
  });

  it("GET /pair/status sin claim devuelve pending y ningun token", async () => {
    const { deviceCode } = await startPairing(app);

    const res = await status(app, deviceCode);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "pending" });
    expect(res.body).not.toContain("deviceToken");
  });

  it("T-164-09: mandar el user_code al endpoint de status NO entrega token", async () => {
    const { userCode } = await startPairing(app);

    // El user_code es publico (esta en la pantalla del TV). Aunque un tercero lo
    // lea, el endpoint que emite el token pide el device_code secreto: el codigo
    // de 6 chars ni siquiera pasa la validacion sintactica.
    const res = await status(app, userCode);
    expect(res.statusCode).not.toBe(200);
    expect(res.body).not.toContain("deviceToken");
  });

  it("T-164-09 bis: un user_code estirado al largo del device_code sigue sin entregar token", async () => {
    const { userCode } = await startPairing(app);

    // Mismo ataque, esquivando el minLength: el lookup es por sha256 del
    // device_code, asi que el codigo visible simplemente no existe.
    const padded = userCode.repeat(8).slice(0, 43);
    const res = await status(app, padded);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ status: "unknown" });
    expect(res.body).not.toContain("deviceToken");
  });

  it("D-01: un coach puede reclamar el pairing de su sede", async () => {
    const { userCode } = await startPairing(app);

    const res = await claim(app, ctx.coachAToken, {
      userCode,
      branchId: ctx.branchAId,
      name: "TV sala grande",
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      ok: true,
      branchId: ctx.branchAId,
    });
  });

  it("D-01: recepcion NO puede reclamar un pairing (403)", async () => {
    const { userCode } = await startPairing(app);

    const res = await claim(app, ctx.recepcionAToken, {
      userCode,
      branchId: ctx.branchAId,
    });
    expect(res.statusCode).toBe(403);
  });

  it("T-164-12: un coach no puede reclamar un TV de otra sede (BRANCH_OUT_OF_SCOPE)", async () => {
    const { userCode } = await startPairing(app);

    const res = await claim(app, ctx.coachAToken, {
      userCode,
      branchId: ctx.branchBId,
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("BRANCH_OUT_OF_SCOPE");

    // Y el pairing sigue sin reclamar: el 403 no dejo efectos.
    const [row] = await app.db
      .select({ claimedAt: schema.tvPairings.claimedAt })
      .from(schema.tvPairings)
      .where(eq(schema.tvPairings.userCode, userCode));
    expect(row.claimedAt).toBeNull();
  });

  it("reclamar un user_code inexistente devuelve 404", async () => {
    const res = await claim(app, ctx.ownerToken, {
      userCode: "ZZZZZZ",
      branchId: ctx.branchAId,
    });
    expect(res.statusCode).toBe(404);
  });

  it("D-02: el user_code se consume una sola vez — el segundo claim es 409", async () => {
    const { userCode } = await startPairing(app);

    const first = await claim(app, ctx.coachAToken, {
      userCode,
      branchId: ctx.branchAId,
    });
    expect(first.statusCode).toBe(200);

    const second = await claim(app, ctx.ownerToken, {
      userCode,
      branchId: ctx.branchBId,
    });
    expect(second.statusCode).toBe(409);

    // La sede quedo en la del primer claim: el segundo no reescribio nada.
    const [row] = await app.db
      .select({ branchId: schema.tvPairings.branchId })
      .from(schema.tvPairings)
      .where(eq(schema.tvPairings.userCode, userCode));
    expect(row.branchId).toBe(ctx.branchAId);
  });

  it("el device token se emite exactamente una vez (paired -> consumed)", async () => {
    const { userCode, deviceCode } = await startPairing(app);
    await claim(app, ctx.coachAToken, { userCode, branchId: ctx.branchAId });

    const first = await status(app, deviceCode);
    expect(first.statusCode).toBe(200);
    const firstBody = JSON.parse(first.body) as {
      status: string;
      deviceToken: string;
      branchName: string;
    };
    expect(firstBody.status).toBe("paired");
    expect(firstBody.deviceToken.length).toBeGreaterThanOrEqual(22);
    expect(firstBody.branchName).toBe("TV-Sede-A");

    const second = await status(app, deviceCode);
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body)).toEqual({ status: "consumed" });
    expect(second.body).not.toContain("deviceToken");

    // Un solo dispositivo creado, y el token en claro no quedo en la DB.
    const devices = await app.db
      .select({ tokenHash: schema.tvDevices.tokenHash })
      .from(schema.tvDevices);
    expect(devices).toHaveLength(1);
    expect(devices[0].tokenHash).not.toBe(firstBody.deviceToken);
  });

  it("D-05: GET /devices lista el TV vinculado con lastSeenAt null e isActive true", async () => {
    await pairDevice(app, ctx.coachAToken, ctx.branchAId, "TV sala grande");

    const res = await app.inject({
      method: "GET",
      url: DEVICES_URL,
      headers: { authorization: `Bearer ${ctx.coachAToken}` },
    });
    expect(res.statusCode).toBe(200);

    const { devices } = JSON.parse(res.body) as {
      devices: Array<Record<string, unknown>>;
    };
    expect(devices).toHaveLength(1);
    expect(devices[0].name).toBe("TV sala grande");
    expect(devices[0].branchId).toBe(ctx.branchAId);
    expect(devices[0].branchName).toBe("TV-Sede-A");
    expect(devices[0].isActive).toBe(true);
    expect(devices[0].lastSeenAt).toBeNull();
    // T-164-11: el listado nunca expone el hash del token.
    expect(res.body).not.toContain("tokenHash");
  });

  it("el listado esta acotado al scope: un coach no ve los TVs de otra sede", async () => {
    await pairDevice(app, ctx.ownerToken, ctx.branchBId, "TV de la sede B");

    const coachRes = await app.inject({
      method: "GET",
      url: DEVICES_URL,
      headers: { authorization: `Bearer ${ctx.coachAToken}` },
    });
    expect(coachRes.statusCode).toBe(200);
    expect(JSON.parse(coachRes.body).devices).toHaveLength(0);

    // El owner sí lo ve (bypass por rol).
    const ownerRes = await app.inject({
      method: "GET",
      url: DEVICES_URL,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(JSON.parse(ownerRes.body).devices).toHaveLength(1);
  });

  it("D-04: dos televisores vinculados a la misma sede conviven", async () => {
    await pairDevice(app, ctx.coachAToken, ctx.branchAId, "TV sala grande");
    await pairDevice(app, ctx.coachAToken, ctx.branchAId, "TV vestuario");

    const res = await app.inject({
      method: "GET",
      url: `${DEVICES_URL}?branchId=${ctx.branchAId}`,
      headers: { authorization: `Bearer ${ctx.coachAToken}` },
    });
    expect(res.statusCode).toBe(200);

    const { devices } = JSON.parse(res.body) as {
      devices: Array<{ name: string; isActive: boolean }>;
    };
    expect(devices).toHaveLength(2);
    expect(devices.map((d) => d.name).sort()).toEqual([
      "TV sala grande",
      "TV vestuario",
    ]);
    expect(devices.every((d) => d.isActive)).toBe(true);
  });

  it("un device token valido resuelve su sede en GET /api/tv/me", async () => {
    const { deviceToken } = await pairDevice(
      app,
      ctx.coachAToken,
      ctx.branchAId,
    );

    const res = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: { authorization: `Device ${deviceToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      branchId: ctx.branchAId,
      branchName: "TV-Sede-A",
    });
  });

  it("sin header Device (o con un token inventado) las rutas de device dan 401", async () => {
    const sinHeader = await app.inject({ method: "GET", url: ME_URL });
    expect(sinHeader.statusCode).toBe(401);

    const inventado = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: { authorization: "Device no-existe-este-token-123456789012" },
    });
    expect(inventado.statusCode).toBe(401);

    // Un Bearer JWT tampoco sirve: son dos esquemas distintos.
    const conJwt = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(conJwt.statusCode).toBe(401);
  });

  it("D-03: revocar un dispositivo lo desactiva y le corta el acceso (401)", async () => {
    const { deviceToken } = await pairDevice(
      app,
      ctx.coachAToken,
      ctx.branchAId,
    );
    const [device] = await app.db
      .select({ id: schema.tvDevices.id })
      .from(schema.tvDevices);

    const revoke = await app.inject({
      method: "POST",
      url: `${DEVICES_URL}/${device.id}/revoke`,
      headers: { authorization: `Bearer ${ctx.coachAToken}` },
    });
    expect(revoke.statusCode).toBe(200);
    expect(JSON.parse(revoke.body)).toEqual({ ok: true });

    const listed = await app.inject({
      method: "GET",
      url: DEVICES_URL,
      headers: { authorization: `Bearer ${ctx.coachAToken}` },
    });
    const { devices } = JSON.parse(listed.body) as {
      devices: Array<{ isActive: boolean }>;
    };
    expect(devices[0].isActive).toBe(false);

    // El token no expira nunca (D-03): lo unico que lo corta es esta revocacion.
    const afterRevoke = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: { authorization: `Device ${deviceToken}` },
    });
    expect(afterRevoke.statusCode).toBe(401);
  });

  it("T-164-12: un coach no puede revocar un TV de otra sede", async () => {
    await pairDevice(app, ctx.ownerToken, ctx.branchBId);
    const [device] = await app.db
      .select({ id: schema.tvDevices.id })
      .from(schema.tvDevices);

    const res = await app.inject({
      method: "POST",
      url: `${DEVICES_URL}/${device.id}/revoke`,
      headers: { authorization: `Bearer ${ctx.coachAToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("BRANCH_OUT_OF_SCOPE");

    const [row] = await app.db
      .select({ isActive: schema.tvDevices.isActive })
      .from(schema.tvDevices)
      .where(eq(schema.tvDevices.id, device.id));
    expect(row.isActive).toBe(true);
  });
});
