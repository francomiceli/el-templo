/**
 * Fase 201 Plan 05 (D-02, D-08, D-12, D-17, T-201-12..16): circuito de pedido
 * de desbloqueo de Conquer.
 *
 *   - GET  /api/members/conquer/state            (alumno)
 *   - POST /api/members/conquer/unlock-request   (alumno)
 *   - GET  /api/admin/conquer/requests           (owner / admin)
 *   - GET  /api/admin/conquer/requests/count     (owner / admin)
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
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  addDays,
  DEFAULT_TENANT_TIMEZONE,
  todayInTz,
} from "../../src/modules/shared/date-utils";
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { clearModuleFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  createConquerStaff,
  insertConquerMember,
  TEMPLO_CTX,
} from "./_helpers";

const STATE_URL = "/api/members/conquer/state";
const UNLOCK_URL = "/api/members/conquer/unlock-request";
const REQUESTS_URL = "/api/admin/conquer/requests";
const COUNT_URL = "/api/admin/conquer/requests/count";

interface StateBody {
  status: "bloqueado" | "pedido" | "activo";
  requestedAt: string | null;
  member: {
    level: string | null;
    daysCount: number | null;
    activationDate: string | null;
    blockWeek: number;
    cutStage: number;
    publishEnabled: boolean;
    publishNoFace: boolean;
    incReps: number;
    incS: number;
  } | null;
}

interface RequestRow {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  branchName: string | null;
  requestedAt: string;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function getState(token: string) {
  return app.inject({ method: "GET", url: STATE_URL, headers: auth(token) });
}

async function postUnlock(token: string, payload?: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: UNLOCK_URL,
    headers: auth(token),
    ...(payload ? { payload } : {}),
  });
}

async function memberRows(userId: number) {
  return app.db
    .select()
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
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

describe("GET /api/members/conquer/state", () => {
  it("un socio nuevo SIN plan ve Bloqueado (D-17)", async () => {
    const socio = await createTestMember(app);

    const res = await getState(socio.token);

    expect(res.statusCode).toBe(200);
    expect(res.json<StateBody>()).toEqual({
      status: "bloqueado",
      requestedAt: null,
      member: null,
    });
  });

  it("sin token: 401", async () => {
    const res = await app.inject({ method: "GET", url: STATE_URL });
    expect(res.statusCode).toBe(401);
  });

  it("un alumno activo ve su nivel, días y semana del bloque", async () => {
    const socio = await createTestMember(app);
    await insertConquerMember(app, socio.id, {
      status: "activo",
      level: "novillo",
      daysCount: 3,
      // 14 días atrás: la semana del bloque es 2 o 3 sea cual sea la sede.
      activationDate: addDays(todayInTz(DEFAULT_TENANT_TIMEZONE), -14),
    });

    const res = await getState(socio.token);

    expect(res.statusCode).toBe(200);
    const body = res.json<StateBody>();
    expect(body.status).toBe("activo");
    expect(body.member).not.toBeNull();
    expect(body.member?.level).toBe("novillo");
    expect(body.member?.daysCount).toBe(3);
    expect(body.member?.blockWeek).toBeGreaterThanOrEqual(2);
    expect(body.member?.cutStage).toBe(0);
    expect(body.member?.publishEnabled).toBe(false);
    expect(body.member?.incReps).toBe(1);
    expect(body.member?.incS).toBe(2);
  });

  it("un alumno activo sin fecha de activación está en la semana 1", async () => {
    const socio = await createTestMember(app);
    await insertConquerMember(app, socio.id, {
      status: "activo",
      level: "toro",
      daysCount: 3,
    });

    const body = (await getState(socio.token)).json<StateBody>();

    expect(body.member?.blockWeek).toBe(1);
    expect(body.member?.activationDate).toBeNull();
  });
});

describe("POST /api/members/conquer/unlock-request", () => {
  it("registra el pedido y devuelve Pedido con requestedAt (D-12)", async () => {
    const socio = await createTestMember(app);

    const res = await postUnlock(socio.token);

    expect(res.statusCode).toBe(200);
    const body = res.json<StateBody>();
    expect(body.status).toBe("pedido");
    expect(body.requestedAt).toEqual(expect.any(String));
    expect(body.member).toBeNull();
    expect((await getState(socio.token)).json<StateBody>().status).toBe(
      "pedido",
    );
  });

  it("tocarlo de nuevo no cambia nada: mismo requestedAt y una sola fila", async () => {
    const socio = await createTestMember(app);
    const primero = (await postUnlock(socio.token)).json<StateBody>();

    const segundo = await postUnlock(socio.token);

    expect(segundo.statusCode).toBe(200);
    expect(segundo.json<StateBody>().requestedAt).toBe(primero.requestedAt);
    expect(await memberRows(socio.id)).toHaveLength(1);
  });

  it("dos toques en paralelo dejan una sola fila (T-201-15)", async () => {
    const socio = await createTestMember(app);

    const [a, b] = await Promise.all([
      postUnlock(socio.token),
      postUnlock(socio.token),
    ]);

    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(await memberRows(socio.id)).toHaveLength(1);
  });

  it("un alumno ya activo no vuelve a Pedido", async () => {
    const socio = await createTestMember(app);
    await insertConquerMember(app, socio.id, {
      status: "activo",
      level: "toro",
      daysCount: 4,
    });

    const res = await postUnlock(socio.token);

    expect(res.statusCode).toBe(200);
    expect(res.json<StateBody>().status).toBe("activo");
    const [fila] = await memberRows(socio.id);
    expect(fila.status).toBe("activo");
  });

  it("un userId en el body se ignora: el pedido es del que toca (T-201-14)", async () => {
    const yo = await createTestMember(app);
    const otro = await createTestMember(app);

    const res = await postUnlock(yo.token, { userId: otro.id });

    expect(res.statusCode).toBe(200);
    expect(await memberRows(yo.id)).toHaveLength(1);
    expect(await memberRows(otro.id)).toHaveLength(0);
    expect((await getState(otro.token)).json<StateBody>().status).toBe(
      "bloqueado",
    );
  });

  it("sin token: 401", async () => {
    const res = await app.inject({ method: "POST", url: UNLOCK_URL });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /api/admin/conquer/requests y /count (D-08, D-12)", () => {
  it.each(["owner", "admin"])(
    "%s ve la lista con nombre y el contador",
    async (role) => {
      const staff = await createConquerStaff(app, role);
      const socio = await createTestMember(app, {
        firstName: "Lucía",
        lastName: "Pedido",
      });
      await postUnlock(socio.token);

      const lista = await app.inject({
        method: "GET",
        url: REQUESTS_URL,
        headers: auth(staff.token),
      });
      const cuenta = await app.inject({
        method: "GET",
        url: COUNT_URL,
        headers: auth(staff.token),
      });

      expect(lista.statusCode).toBe(200);
      const { requests } = lista.json<{ requests: RequestRow[] }>();
      expect(requests).toHaveLength(1);
      expect(requests[0].userId).toBe(socio.id);
      expect(requests[0].firstName).toBe("Lucía");
      expect(requests[0].lastName).toBe("Pedido");
      expect(requests[0].email).toBe(socio.email);
      expect(requests[0].branchName).toEqual(expect.any(String));
      expect(requests[0].requestedAt).toEqual(expect.any(String));
      expect(cuenta.statusCode).toBe(200);
      expect(cuenta.json()).toEqual({ count: 1 });
    },
  );

  it("la lista va del pedido más viejo al más nuevo", async () => {
    const admin = await createConquerStaff(app, "admin");
    const primero = await createTestMember(app);
    const segundo = await createTestMember(app);
    await postUnlock(primero.token);
    await postUnlock(segundo.token);

    const res = await app.inject({
      method: "GET",
      url: REQUESTS_URL,
      headers: auth(admin.token),
    });

    const ids = res
      .json<{ requests: RequestRow[] }>()
      .requests.map((r) => r.userId);
    expect(ids).toEqual([primero.id, segundo.id]);
  });

  it("sin pedidos: lista vacía y contador 0", async () => {
    const admin = await createConquerStaff(app, "admin");

    const lista = await app.inject({
      method: "GET",
      url: REQUESTS_URL,
      headers: auth(admin.token),
    });
    const cuenta = await app.inject({
      method: "GET",
      url: COUNT_URL,
      headers: auth(admin.token),
    });

    expect(lista.json()).toEqual({ requests: [] });
    expect(cuenta.json()).toEqual({ count: 0 });
  });

  it("un alumno activo NO aparece en la lista ni en el contador", async () => {
    const admin = await createConquerStaff(app, "admin");
    const activo = await createTestMember(app);
    await insertConquerMember(app, activo.id, {
      status: "activo",
      level: "toro",
      daysCount: 4,
    });

    const lista = await app.inject({
      method: "GET",
      url: REQUESTS_URL,
      headers: auth(admin.token),
    });
    const cuenta = await app.inject({
      method: "GET",
      url: COUNT_URL,
      headers: auth(admin.token),
    });

    expect(lista.json()).toEqual({ requests: [] });
    expect(cuenta.json()).toEqual({ count: 0 });
  });

  it.each(["coach", "gestion", "recepcion", "admin_sede", "coach_actividad"])(
    "el rol %s recibe 403 en las dos rutas",
    async (role) => {
      const staff = await createConquerStaff(app, role);

      for (const url of [REQUESTS_URL, COUNT_URL]) {
        const res = await app.inject({
          method: "GET",
          url,
          headers: auth(staff.token),
        });
        expect(res.statusCode, `${role} ${url}`).toBe(403);
      }
    },
  );

  it.each([REQUESTS_URL, COUNT_URL])(
    "un socio recibe 403 en %s",
    async (url) => {
      const socio = await createTestMember(app);

      const res = await app.inject({
        method: "GET",
        url,
        headers: auth(socio.token),
      });

      expect(res.statusCode).toBe(403);
    },
  );

  it.each([REQUESTS_URL, COUNT_URL])("sin token: 401 en %s", async (url) => {
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode).toBe(401);
  });
});

describe("aislamiento entre gimnasios (T-201-13, T-201-16)", () => {
  it("un gimnasio sin el módulo templo-training recibe 404 en las 4 rutas", async () => {
    // El gimnasio 2 no tiene filas de flags: módulo apagado.
    const [socio] = gym2.socios;
    const rutas = [
      { method: "GET", url: STATE_URL, token: socio.token },
      { method: "POST", url: UNLOCK_URL, token: socio.token },
      { method: "GET", url: REQUESTS_URL, token: gym2.adminToken },
      { method: "GET", url: COUNT_URL, token: gym2.adminToken },
    ] as const;

    for (const ruta of rutas) {
      const res = await app.inject({
        method: ruta.method,
        url: ruta.url,
        headers: auth(ruta.token),
      });
      expect(res.statusCode, `${ruta.method} ${ruta.url}`).toBe(404);
    }
  });

  it("con el módulo prendido, cada gimnasio ve solo SUS pedidos", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const admin1 = await createConquerStaff(app, "admin");
    const socio1 = await createTestMember(app);
    await postUnlock(socio1.token);
    const [socio2] = gym2.socios;
    await app.db.insert(schema.conquerMembers).values(
      tenantValues(
        { tenantId: TENANT_DOS },
        {
          userId: socio2.id,
          status: "pedido" as const,
          requestedAt: new Date(),
        },
      ),
    );

    const lista1 = await app.inject({
      method: "GET",
      url: REQUESTS_URL,
      headers: auth(admin1.token),
    });
    const cuenta1 = await app.inject({
      method: "GET",
      url: COUNT_URL,
      headers: auth(admin1.token),
    });
    const lista2 = await app.inject({
      method: "GET",
      url: REQUESTS_URL,
      headers: auth(gym2.adminToken),
    });
    const cuenta2 = await app.inject({
      method: "GET",
      url: COUNT_URL,
      headers: auth(gym2.adminToken),
    });

    expect(
      lista1.json<{ requests: RequestRow[] }>().requests.map((r) => r.userId),
    ).toEqual([socio1.id]);
    expect(cuenta1.json()).toEqual({ count: 1 });
    expect(
      lista2.json<{ requests: RequestRow[] }>().requests.map((r) => r.userId),
    ).toEqual([socio2.id]);
    expect(cuenta2.json()).toEqual({ count: 1 });
  });

  it("el socio del gimnasio 2 no hereda el estado de un pedido del gimnasio 1", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const socio1 = await createTestMember(app);
    await postUnlock(socio1.token);
    const [socio2] = gym2.socios;

    const res = await getState(socio2.token);

    expect(res.statusCode).toBe(200);
    expect(res.json<StateBody>().status).toBe("bloqueado");
  });
});
