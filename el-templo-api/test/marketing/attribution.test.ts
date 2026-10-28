import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import type { FastifyBaseLogger } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";
import { signupAttributions } from "../../src/db/schema/signup-attributions";
import {
  recordSignupAttribution,
  recordSignupAttributionBestEffort,
} from "../../src/modules/marketing/attribution-service";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const DOS_CTX = { tenantId: TENANT_DOS };

const REGISTER_URL = "/api/auth/register";
const TRIAL_URL = "/api/admin/members/trial";

/**
 * Fase 195-07 (D-18/D-21.1/D-24): atribución propia de altas.
 *
 *  - register guarda una fila de origen (con o sin `attribution`)
 *  - un error al guardar el origen NUNCA bloquea el alta (T-195-25)
 *  - valores fuera de rango o de charset (T-195-24) se rechazan o se descartan
 *  - el alta de Sesión de Prueba del admin guarda "¿Cómo nos conoció?" (T-195-28)
 *  - aislamiento de tenant (T-195-27): una sede del gimnasio 2 estampa tenant 2
 */
describe("signup_attributions — registro y alta de prueba", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let branchId: number;
  let gym2: SegundoGimnasio | null = null;
  let seq = 0;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    const [b] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.code, "TEST"), tenantWhere(branches, TEMPLO_CTX)));
    branchId = b.id;
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    gym2 = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function nextTag(): string {
    seq += 1;
    return `${Date.now().toString(36)}${seq}`;
  }

  /** POST /register con un email único; devuelve la respuesta cruda. */
  async function register(
    extra: Record<string, unknown> = {},
    headers: Record<string, string> = {},
    branch: number = branchId,
  ) {
    const tag = nextTag();
    const res = await app.inject({
      method: "POST",
      url: REGISTER_URL,
      headers,
      payload: {
        email: `attr-${tag}@test.com`,
        password: "password123",
        firstName: "Atri",
        lastName: `Bucion${tag}`,
        gender: "female",
        branchId: branch,
        ...extra,
      },
    });
    return res;
  }

  async function rowFor(userId: number, ctx = TEMPLO_CTX) {
    const rows = await app.db
      .select()
      .from(signupAttributions)
      .where(
        and(
          tenantWhere(signupAttributions, ctx),
          eq(signupAttributions.userId, userId),
        ),
      );
    return rows;
  }

  async function registerOk(
    extra: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ): Promise<number> {
    const res = await register(extra, headers);
    expect(res.statusCode, res.body).toBe(200);
    return JSON.parse(res.body).user.id as number;
  }

  // ─── register ────────────────────────────────────────────────────────────

  it("register con atribución completa guarda canal, plataforma, fbc y sede", async () => {
    const userId = await registerOk({
      attribution: {
        utm_source: "meta",
        utm_medium: "paid",
        utm_campaign: "jbj-octubre",
        utm_content: "video-1",
        utm_term: "calistenia",
        fbclid: "abc",
        fbp: "fb.1.1759999999999.123456",
        ft: "1760000000000",
        platform: "android",
        src_ref: "l.instagram.com",
        landing: "/sedes/juan-b-justo",
      },
    });

    const rows = await rowFor(userId);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.channel).toBe("meta_ads");
    expect(row.platform).toBe("android");
    expect(row.capturedVia).toBe("register");
    expect(row.tenantId).toBe(TENANT_TEMPLO);
    expect(row.branchId).toBe(branchId);
    expect(row.utmSource).toBe("meta");
    expect(row.utmMedium).toBe("paid");
    expect(row.utmCampaign).toBe("jbj-octubre");
    expect(row.utmContent).toBe("video-1");
    expect(row.utmTerm).toBe("calistenia");
    expect(row.fbclid).toBe("abc");
    expect(row.fbc).toBe("fb.1.1760000000000.abc");
    expect(row.fbp).toBe("fb.1.1759999999999.123456");
    expect(row.referrerHost).toBe("l.instagram.com");
    expect(row.landingPath).toBe("/sedes/juan-b-justo");
    expect(row.firstTouchAt?.getTime()).toBe(1760000000000);
    expect(row.manualOrigin).toBeNull();
    expect(row.piiPurgedAt).toBeNull();
  });

  it("register sin attribution responde 200 y guarda la fila 'directo' con plataforma 'unknown'", async () => {
    const userId = await registerOk();

    const rows = await rowFor(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe("directo");
    expect(rows[0].platform).toBe("unknown");
    expect(rows[0].capturedVia).toBe("register");
    expect(rows[0].utmSource).toBeNull();
    expect(rows[0].fbc).toBeNull();
    expect(rows[0].branchId).toBe(branchId);
  });

  it("register con attribution vacía {} también guarda 'directo'/'unknown'", async () => {
    const userId = await registerOk({ attribution: {} });
    const [row] = await rowFor(userId);
    expect(row.channel).toBe("directo");
    expect(row.platform).toBe("unknown");
  });

  it("clasifica IA por utm_source y por referrer", async () => {
    const porUtm = await registerOk({
      attribution: { utm_source: "chatgpt.com", platform: "web" },
    });
    const porReferrer = await registerOk({
      attribution: { src_ref: "www.perplexity.ai", platform: "web" },
    });
    expect((await rowFor(porUtm))[0].channel).toBe("ia");
    expect((await rowFor(porReferrer))[0].channel).toBe("ia");
    expect((await rowFor(porReferrer))[0].referrerHost).toBe(
      "www.perplexity.ai",
    );
  });

  it("guarda ref y promo crudos y los clasifica; un utm explícito gana", async () => {
    const referido = await registerOk({ ref: "ABCDEF" });
    const promo = await registerOk({ promoCode: "PROMOX" });
    const utmGana = await registerOk({
      ref: "ABCDEF",
      attribution: { utm_source: "instagram", platform: "ios" },
    });

    const [r1] = await rowFor(referido);
    expect(r1.channel).toBe("referido");
    expect(r1.refCode).toBe("ABCDEF");
    const [r2] = await rowFor(promo);
    expect(r2.channel).toBe("promo");
    expect(r2.promoCode).toBe("PROMOX");
    const [r3] = await rowFor(utmGana);
    expect(r3.channel).toBe("instagram");
    expect(r3.refCode).toBe("ABCDEF");
    expect(r3.platform).toBe("ios");
  });

  it("utm_source de 2000 caracteres es 400 de validación y no crea el usuario", async () => {
    const tag = nextTag();
    const email = `largo-${tag}@test.com`;
    const res = await register({
      email,
      attribution: { utm_source: "x".repeat(2000) },
    });
    expect(res.statusCode).toBe(400);
    const found = await app.db
      .select({ id: users.id })
      .from(users)
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.email, email)));
    expect(found).toHaveLength(0);
  });

  it.each([
    ["utm_campaign", "c".repeat(151)],
    ["landing", "/".padEnd(501, "a")],
    ["src_ref", "h".repeat(256)],
    ["fbclid", "f".repeat(256)],
    ["fbp", "p".repeat(101)],
    ["ft", "1".repeat(16)],
    ["ft", "17600000000ab"],
    ["platform", "windows"],
  ])("attribution.%s fuera de rango (%#) es 400", async (key, value) => {
    const res = await register({ attribution: { [key]: value } });
    expect(res.statusCode).toBe(400);
  });

  it("los valores en el límite exacto de la columna se aceptan", async () => {
    const userId = await registerOk({
      attribution: {
        utm_source: "s".repeat(150),
        utm_campaign: "c".repeat(150),
        landing: "/".padEnd(500, "a"),
        src_ref: "h".repeat(255),
        platform: "web",
      },
    });
    const [row] = await rowFor(userId);
    expect(row.utmSource).toHaveLength(150);
    expect(row.landingPath).toHaveLength(500);
  });

  it("una clave desconocida dentro de attribution se descarta sin romper el alta", async () => {
    const userId = await registerOk({
      attribution: { utm_source: "google", utm_medium: "cpc", futuro: "x" },
    });
    const [row] = await rowFor(userId);
    expect(row.channel).toBe("google_ads");
  });

  it("revalida el charset: ids, host y landing inválidos se descartan, el alta sigue", async () => {
    const userId = await registerOk({
      attribution: {
        utm_source: "goo\u0000gle\n",
        utm_medium: "cpc",
        fbclid: "a b<script>",
        gclid: "ok-Id_1.2",
        fbp: "fb 1 2",
        src_ref: "evil.com/path",
        landing: "javascript:alert(1)",
        ft: "5",
      },
    });
    const [row] = await rowFor(userId);
    expect(row.utmSource).toBe("google");
    expect(row.fbclid).toBeNull();
    expect(row.fbc).toBeNull();
    expect(row.gclid).toBe("ok-Id_1.2");
    expect(row.fbp).toBeNull();
    expect(row.referrerHost).toBeNull();
    expect(row.landingPath).toBeNull();
    // `ft` implausible (año 1970): no se usa como first-touch.
    expect(row.firstTouchAt).toBeNull();
    expect(row.channel).toBe("google_ads");
  });

  it("first-touch futuro (más de un día adelante) se descarta", async () => {
    const userId = await registerOk({
      attribution: { fbclid: "abc", ft: "9999999999999" },
    });
    const [row] = await rowFor(userId);
    expect(row.firstTouchAt).toBeNull();
    expect(row.fbc).not.toContain("9999999999999");
  });

  it("normaliza: recorta espacios en los textos y pasa el host a minúsculas", async () => {
    const userId = await registerOk({
      attribution: {
        utm_source: "  google  ",
        utm_medium: " organic ",
        src_ref: "L.INSTAGRAM.com",
      },
    });
    const [row] = await rowFor(userId);
    expect(row.utmSource).toBe("google");
    expect(row.utmMedium).toBe("organic");
    expect(row.referrerHost).toBe("l.instagram.com");
  });

  it("valores en blanco quedan NULL, no cadenas vacías", async () => {
    const userId = await registerOk({
      attribution: { utm_source: "   ", utm_campaign: "", landing: " " },
    });
    const [row] = await rowFor(userId);
    expect(row.utmSource).toBeNull();
    expect(row.utmCampaign).toBeNull();
    expect(row.landingPath).toBeNull();
    expect(row.channel).toBe("directo");
  });

  it("fbc con first-touch implausible usa la hora actual", async () => {
    const userId = await registerOk({
      attribution: { fbclid: "abc", ft: "5" },
    });
    const [row] = await rowFor(userId);
    expect(row.fbc).toMatch(/^fb\.1\.\d{13}\.abc$/);
    expect(row.fbc).not.toContain("fb.1.5.");
  });

  it("x-real-ip válida se guarda (IPv4 e IPv6); inválida queda NULL", async () => {
    const v4 = await registerOk({}, { "x-real-ip": "203.0.113.7" });
    const v6 = await registerOk({}, { "x-real-ip": "2001:db8::1" });
    const invalida = await registerOk({}, { "x-real-ip": "no-es-ip" });
    const inyeccion = await registerOk(
      {},
      { "x-real-ip": "203.0.113.7, 10.0.0.1" },
    );
    const sinHeader = await registerOk();
    expect((await rowFor(v4))[0].clientIp).toBe("203.0.113.7");
    expect((await rowFor(v6))[0].clientIp).toBe("2001:db8::1");
    expect((await rowFor(invalida))[0].clientIp).toBeNull();
    expect((await rowFor(inyeccion))[0].clientIp).toBeNull();
    expect((await rowFor(sinHeader))[0].clientIp).toBeNull();
  });

  it("guarda el user agent, truncado a 512", async () => {
    const userId = await registerOk(
      {},
      { "user-agent": `Mozilla/5.0 ${"x".repeat(600)}` },
    );
    const [row] = await rowFor(userId);
    expect(row.userAgent?.startsWith("Mozilla/5.0 xxx")).toBe(true);
    expect(row.userAgent).toHaveLength(512);
  });

  it("si el insert de atribución falla, register igual responde 200 con el alta hecha", async () => {
    const original = app.db.insert.bind(app.db);
    const spy = vi.spyOn(app.db, "insert").mockImplementation(((
      table: Parameters<typeof original>[0],
    ) => {
      if (table === signupAttributions) {
        throw new Error("boom: atribucion caida");
      }
      return original(table);
    }) as typeof app.db.insert);

    const res = await register({
      attribution: { utm_source: "meta", utm_medium: "paid" },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeTruthy();
    expect(body.user.id).toBeGreaterThan(0);
    // El spy se disparó (el insert de atribución se intentó) y no dejó fila.
    expect(spy.mock.calls.some(([table]) => table === signupAttributions)).toBe(
      true,
    );
    spy.mockRestore();
    expect(await rowFor(body.user.id)).toHaveLength(0);
  });

  // ─── servicio ────────────────────────────────────────────────────────────

  it("recordSignupAttributionBestEffort no lanza ante un error de DB (FK) y loguea un warn", async () => {
    const log = { warn: vi.fn() } as unknown as FastifyBaseLogger;
    await expect(
      recordSignupAttributionBestEffort(app.db, log, TEMPLO_CTX, {
        userId: 2_000_000_000,
        branchId,
        capturedVia: "register",
        platform: "web",
      }),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledTimes(1);
    const [fields, message] = (log.warn as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0] as [{ err: string; userId: number }, string];
    expect(message).toContain("Signup attribution failed");
    expect(fields.userId).toBe(2_000_000_000);
    expect(typeof fields.err).toBe("string");
  });

  it("recordSignupAttribution (sin best-effort) sí propaga el error", async () => {
    await expect(
      recordSignupAttribution(app.db, TEMPLO_CTX, {
        userId: 2_000_000_000,
        branchId,
        capturedVia: "register",
        platform: "web",
      }),
    ).rejects.toThrow();
  });

  it("la primera atribución gana: una segunda para el mismo usuario no la pisa", async () => {
    const userId = await registerOk({
      attribution: { utm_source: "instagram", platform: "web" },
    });
    await recordSignupAttribution(app.db, TEMPLO_CTX, {
      userId,
      branchId,
      capturedVia: "admin_trial",
      platform: "admin",
      manualOrigin: "otro",
    });
    const rows = await rowFor(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe("instagram");
    expect(rows[0].capturedVia).toBe("register");
  });

  // ─── alta de Sesión de Prueba (admin) ────────────────────────────────────

  async function createTrial(extra: Record<string, unknown> = {}) {
    const tag = nextTag();
    return app.inject({
      method: "POST",
      url: TRIAL_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Lead",
        lastName: `Prospecto${tag}`,
        phone: `+549115${String(Date.now() % 1_000_000).padStart(6, "0")}${String(seq % 100).padStart(2, "0")}`,
        branchId,
        ...extra,
      },
    });
  }

  it("alta de prueba con origin y campaign guarda origen manual, canal 'presencial' y plataforma 'admin'", async () => {
    const res = await createTrial({
      origin: "paso_por_la_puerta",
      campaign: "volante-octubre",
    });
    expect(res.statusCode, res.body).toBe(201);
    const memberId = JSON.parse(res.body).id as number;

    const rows = await rowFor(memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].manualOrigin).toBe("paso_por_la_puerta");
    expect(rows[0].channel).toBe("presencial");
    expect(rows[0].utmCampaign).toBe("volante-octubre");
    expect(rows[0].platform).toBe("admin");
    expect(rows[0].capturedVia).toBe("admin_trial");
    expect(rows[0].branchId).toBe(branchId);
    expect(rows[0].clientIp).toBeNull();
  });

  it.each([
    ["volante_qr", "qr"],
    ["google", "buscador"],
    ["ia", "ia"],
    ["meta_ads", "meta_ads"],
    ["referido", "referido"],
  ])("alta de prueba con origin %s -> canal %s", async (origin, channel) => {
    const res = await createTrial({ origin });
    expect(res.statusCode, res.body).toBe(201);
    const [row] = await rowFor(JSON.parse(res.body).id);
    expect(row.channel).toBe(channel);
    expect(row.utmCampaign).toBeNull();
  });

  it("alta de prueba sin origin igual responde 201 y guarda 'directo'/'admin'", async () => {
    const res = await createTrial();
    expect(res.statusCode, res.body).toBe(201);
    const [row] = await rowFor(JSON.parse(res.body).id);
    expect(row.channel).toBe("directo");
    expect(row.platform).toBe("admin");
    expect(row.manualOrigin).toBeNull();
  });

  it("alta de prueba con origin inventado es 400 y no crea el lead", async () => {
    const res = await createTrial({ origin: "inventado" });
    expect(res.statusCode).toBe(400);
    const rows = await app.db
      .select({ id: signupAttributions.id })
      .from(signupAttributions)
      .where(tenantWhere(signupAttributions, TEMPLO_CTX));
    expect(rows).toHaveLength(0);
  });

  it("alta de prueba con campaign de 151 caracteres es 400", async () => {
    const res = await createTrial({
      origin: "otro",
      campaign: "c".repeat(151),
    });
    expect(res.statusCode).toBe(400);
  });

  it("alta de prueba: clave desconocida sigue sin ser aceptada como dato (additionalProperties false)", async () => {
    const res = await createTrial({ origin: "otro", tenantId: 999 });
    // AJV (removeAdditional) la descarta: el alta se hace en el gimnasio del admin.
    expect(res.statusCode, res.body).toBe(201);
    const [row] = await rowFor(JSON.parse(res.body).id);
    expect(row.tenantId).toBe(TENANT_TEMPLO);
  });

  it("si el insert de atribución falla, el alta de prueba igual responde 201", async () => {
    const original = app.db.insert.bind(app.db);
    const spy = vi.spyOn(app.db, "insert").mockImplementation(((
      table: Parameters<typeof original>[0],
    ) => {
      if (table === signupAttributions) {
        throw new Error("boom: atribucion caida");
      }
      return original(table);
    }) as typeof app.db.insert);

    const res = await createTrial({ origin: "otro" });
    expect(res.statusCode, res.body).toBe(201);
    spy.mockRestore();
    expect(await rowFor(JSON.parse(res.body).id)).toHaveLength(0);
  });

  // ─── aislamiento de tenant ───────────────────────────────────────────────

  it("un gimnasio no ve las filas de origen de otro", async () => {
    // Siempre DESPUÉS de cleanAllTestData (ya corrió en el beforeEach).
    gym2 = await seedSecondTenant(app);

    // Alta real en una sede del gimnasio 2: la fila nace con tenant 2 porque el
    // tenant sale de la sede, no del cliente.
    const res = await register(
      { attribution: { utm_source: "instagram", platform: "web" } },
      {},
      gym2.branchId,
    );
    expect(res.statusCode, res.body).toBe(200);
    const userDos = JSON.parse(res.body).user.id as number;
    // Y una del gimnasio 1.
    const userUno = await registerOk({
      attribution: { utm_source: "google", utm_medium: "cpc" },
    });

    expect(await rowFor(userDos, TEMPLO_CTX)).toHaveLength(0);
    const delDos = await rowFor(userDos, DOS_CTX);
    expect(delDos).toHaveLength(1);
    expect(delDos[0].tenantId).toBe(TENANT_DOS);
    expect(delDos[0].branchId).toBe(gym2.branchId);

    expect(await rowFor(userUno, DOS_CTX)).toHaveLength(0);
    expect(await rowFor(userUno, TEMPLO_CTX)).toHaveLength(1);

    // Una fila sembrada directo con el tenant del gimnasio 2 tampoco aparece
    // en las consultas del gimnasio 1.
    await app.db.insert(signupAttributions).values(
      tenantValues(DOS_CTX, {
        userId: gym2.socios[0].id,
        branchId: gym2.branchId,
        channel: "qr",
        platform: "web",
        capturedVia: "register",
      }),
    );
    const todasUno = await app.db
      .select({ userId: signupAttributions.userId })
      .from(signupAttributions)
      .where(tenantWhere(signupAttributions, TEMPLO_CTX));
    expect(todasUno.map((r) => r.userId)).toEqual([userUno]);
    const todasDos = await app.db
      .select({ userId: signupAttributions.userId })
      .from(signupAttributions)
      .where(tenantWhere(signupAttributions, DOS_CTX));
    expect(todasDos.map((r) => r.userId).sort()).toEqual(
      [userDos, gym2.socios[0].id].sort(),
    );

    // Limpieza de lo sembrado (acotada por tenant).
    await app.db
      .delete(signupAttributions)
      .where(tenantWhere(signupAttributions, DOS_CTX));
  });
});
