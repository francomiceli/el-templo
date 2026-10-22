/**
 * Fase 201 Plan 27 (hallazgo 1 del UAT, DA-21, T-201-99..101): la guía
 * "¿Cómo funciona?" se muestra una sola vez por alumno.
 *
 *   - POST /api/members/conquer/guide-seen
 *   - GET  /api/members/conquer/state  (member.guideSeen)
 *
 * Integración contra el MySQL de tests. Usuarios SIEMPRE con fábricas. Los
 * timestamps se comparan en SQL (el MySQL local corre en otra zona horaria que
 * Node): la fecha se retrocede con un UPDATE directo y se compara con
 * `NOW() - INTERVAL` también en SQL.
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
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { clearModuleFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  createActiveConquerMember,
  insertConquerMember,
  TEMPLO_CTX,
  type ConquerErrorBody,
} from "./_helpers";

const GUIDE_URL = "/api/members/conquer/guide-seen";
const STATE_URL = "/api/members/conquer/state";

interface StateBody {
  status: "bloqueado" | "pedido" | "activo";
  member: { guideSeen: boolean } | null;
}

interface GuideSeenBody {
  guideSeen: boolean;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function postGuide(token: string) {
  return app.inject({
    method: "POST",
    url: GUIDE_URL,
    headers: auth(token),
    payload: {},
  });
}

async function fetchState(token: string): Promise<StateBody> {
  const res = await app.inject({
    method: "GET",
    url: STATE_URL,
    headers: auth(token),
  });
  expect(res.statusCode).toBe(200);
  return res.json<StateBody>();
}

/** `member.guideSeen` del alumno activo (falla fuerte si no hay `member`). */
async function guideSeenOf(token: string): Promise<boolean> {
  const { member } = await fetchState(token);
  if (!member) throw new Error("el alumno deberia estar activo");
  return member.guideSeen;
}

/** Alumno activo (Toro, 4 días): el estado trae `member.guideSeen`. */
async function activeMember() {
  return createActiveConquerMember(app, { level: "toro", daysCount: 4 });
}

/** Retrocede `guide_seen_at` a hace 2 días con SQL (sin depender del reloj de Node). */
async function backdateGuideSeen(userId: number): Promise<void> {
  await app.db
    .update(schema.conquerMembers)
    .set({ guideSeenAt: sql`NOW() - INTERVAL 2 DAY` })
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
}

/** Estado de `guide_seen_at` en la base, calculado en SQL. */
async function readGuideColumn(userId: number) {
  const [row] = await app.db
    .select({
      seen: sql<number>`(${schema.conquerMembers.guideSeenAt} IS NOT NULL)`,
      olderThanOneDay: sql<number>`(${schema.conquerMembers.guideSeenAt} < NOW() - INTERVAL 1 DAY)`,
    })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    )
    .limit(1);
  return {
    seen: Number(row.seen) === 1,
    olderThanOneDay: Number(row.olderThanOneDay) === 1,
  };
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

describe("GET /state: member.guideSeen", () => {
  it("un alumno recién activado todavía no vio la guía", async () => {
    const m = await activeMember();

    expect(await guideSeenOf(m.token)).toBe(false);
    expect((await readGuideColumn(m.userId)).seen).toBe(false);
  });
});

describe("POST /guide-seen", () => {
  it("marca la guía como vista y el estado lo refleja", async () => {
    const m = await activeMember();

    const res = await postGuide(m.token);

    expect(res.statusCode).toBe(200);
    expect(res.json<GuideSeenBody>()).toEqual({ guideSeen: true });
    expect(await guideSeenOf(m.token)).toBe(true);
    expect((await readGuideColumn(m.userId)).seen).toBe(true);
  });

  it("sin body también marca la guía como vista", async () => {
    const m = await activeMember();

    const res = await app.inject({
      method: "POST",
      url: GUIDE_URL,
      headers: auth(m.token),
    });

    expect(res.statusCode).toBe(200);
    expect(await guideSeenOf(m.token)).toBe(true);
  });

  it("es idempotente: marcarla de nuevo conserva la PRIMERA fecha", async () => {
    const m = await activeMember();
    await postGuide(m.token);
    await backdateGuideSeen(m.userId);
    expect((await readGuideColumn(m.userId)).olderThanOneDay).toBe(true);

    const res = await postGuide(m.token);

    expect(res.statusCode).toBe(200);
    expect(res.json<GuideSeenBody>()).toEqual({ guideSeen: true });
    // Si el UPDATE pisara la fecha, ya no sería anterior a hace 1 día.
    expect((await readGuideColumn(m.userId)).olderThanOneDay).toBe(true);
  });

  it("solo marca al alumno que llama: otro alumno del mismo gimnasio sigue sin verla", async () => {
    const primero = await activeMember();
    const segundo = await activeMember();

    const res = await postGuide(primero.token);

    expect(res.statusCode).toBe(200);
    expect(await guideSeenOf(primero.token)).toBe(true);
    expect(await guideSeenOf(segundo.token)).toBe(false);
    expect((await readGuideColumn(segundo.userId)).seen).toBe(false);
  });

  it("alumno en pedido: 409 CONQUER_NO_ACTIVO y no marca nada", async () => {
    const socio = await createTestMember(app);
    await insertConquerMember(app, socio.id, { status: "pedido" });

    const res = await postGuide(socio.token);

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    expect((await readGuideColumn(socio.id)).seen).toBe(false);
  });

  it("socio sin fila de Conquer (bloqueado): 409 CONQUER_NO_ACTIVO", async () => {
    const socio = await createTestMember(app);

    const res = await postGuide(socio.token);

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
  });

  it("socio del gimnasio 2 sin el módulo de entrenamiento: 404 y el alumno del gimnasio 1 sigue sin verla", async () => {
    const m = await activeMember();

    // El gimnasio 2 no tiene filas de flags: módulo apagado.
    const res = await postGuide(gym2.socios[0].token);

    expect(res.statusCode).toBe(404);
    expect(await guideSeenOf(m.token)).toBe(false);
  });

  it("socio del gimnasio 2 con el módulo prendido: 409, nunca 200 ni 500, y no toca al gimnasio 1", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const m = await activeMember();

    const res = await postGuide(gym2.socios[0].token);

    // `ctx` sale del token (gimnasio 2): no hay fila de Conquer en ese gimnasio.
    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    expect(await guideSeenOf(m.token)).toBe(false);
    expect((await readGuideColumn(m.userId)).seen).toBe(false);
  });

  it("sin token: 401", async () => {
    const res = await app.inject({ method: "POST", url: GUIDE_URL });

    expect(res.statusCode).toBe(401);
  });

  it.each([
    ["un array", JSON.stringify([1, 2])],
    ["un string", JSON.stringify("abc")],
    ["un número", JSON.stringify(42)],
  ])(
    "body que no es objeto (%s): 400 y no marca nada",
    async (_nombre, raw) => {
      const m = await activeMember();

      const res = await app.inject({
        method: "POST",
        url: GUIDE_URL,
        headers: { ...auth(m.token), "content-type": "application/json" },
        payload: raw,
      });

      expect(res.statusCode).toBe(400);
      expect((await readGuideColumn(m.userId)).seen).toBe(false);
    },
  );
});
