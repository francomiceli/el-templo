import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { cleanAllTestData, createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  GbpSyncService,
  normalizeLocationId,
  patchHash,
  type GbpLocationPatch,
} from "../../src/modules/marketing/google/gbp";
import {
  getGbpConfig,
  type GbpConfig,
} from "../../src/modules/marketing/google/config";
import { runGbpSync } from "../../src/jobs/marketing-google";
import type { WebSiteData } from "../../src/modules/web-public/types";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  limpiarSegundoGimnasio,
  seedSecondTenant,
} from "../fixtures/second-tenant";
import { restoreTemploFlags, setModuleFlag } from "../fixtures/module-flags";

const CTX = { tenantId: TENANT_TEMPLO };
const CTX_DOS = { tenantId: TENANT_DOS };

const CODES = ["G195A", "G195B", "G195C", "G195D", "G195E"];
const ACTIVITY = "GBP sync 195";
const AR_KEY = "whatsapp.sales_number.AR";
const ES_KEY = "whatsapp.sales_number.ES";

const ACCESS_TOKEN = "gbp-access-token-195";
const CLIENT_ID = "gbp-client-id-195";
const CLIENT_SECRET = "gbp-client-secret-195";
const REFRESH_TOKEN = "gbp-refresh-token-195";

interface PatchCall {
  locationId: string;
  validateOnly: string | null;
  updateMask: string | null;
  method: string | undefined;
  authorization: string | undefined;
  body: GbpLocationPatch;
}

const fakeLog = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

/**
 * Fase 195-09 (D-21.3 y D-08): sync diario de Google Business Profile detrás de
 * GBP_SYNC_MODE. `fetch` va siempre mockeado con `vi.stubGlobal`: este archivo
 * NUNCA llama a Google.
 */
describe("Sync de Google Business Profile (branches → ficha)", () => {
  let app: FastifyInstance;
  let ids: Record<string, number>;
  let activityId: number;
  let originalSettings: Array<{ settingKey: string; settingValue: string }>;

  beforeAll(async () => {
    app = await createTestApp();

    originalSettings = await app.db
      .select({
        settingKey: schema.tenantSettings.settingKey,
        settingValue: schema.tenantSettings.settingValue,
      })
      .from(schema.tenantSettings)
      .where(
        and(
          tenantWhere(schema.tenantSettings, CTX),
          inArray(schema.tenantSettings.settingKey, [AR_KEY, ES_KEY]),
        ),
      );
    await setSetting(AR_KEY, "5492235820521");
    await setSetting(ES_KEY, "34680774331");

    await dropMine();
    const insertBranch = async (
      values: Partial<typeof schema.branches.$inferInsert> & {
        code: string;
        name: string;
      },
    ): Promise<number> => {
      const [row] = await app.db
        .insert(schema.branches)
        .values(tenantValues(CTX, { publishOnWeb: true, ...values }))
        .$returningId();
      return row.id;
    };
    ids = {
      G195A: await insertBranch({
        code: "G195A",
        name: "GBP A interna",
        webSlug: "g195a",
        publicName: "El Templo GBP A",
        address: "Calle GBP 195",
        locality: "Mar del Plata",
        region: "Buenos Aires",
        postalCode: "7600",
        gbpLocationId: "locations/111",
      }),
      // Sin horarios, con teléfono propio e id de ficha pelado (sin "locations/").
      G195B: await insertBranch({
        code: "G195B",
        name: "GBP B sin horarios",
        webSlug: "g195b",
        address: "Otra Calle 22",
        locality: "Mar del Plata",
        region: "Buenos Aires",
        phone: "+54 223 444-0000",
        gbpLocationId: "222",
      }),
      // Con ficha pero NO publicada en la web.
      G195C: await insertBranch({
        code: "G195C",
        name: "GBP C no publicada",
        webSlug: "g195c",
        publishOnWeb: false,
        address: "Calle Oculta 3",
        gbpLocationId: "locations/333",
      }),
      // Publicada pero sin ficha mapeada.
      G195D: await insertBranch({
        code: "G195D",
        name: "GBP D sin ficha",
        webSlug: "g195d",
        address: "Calle Sin Ficha 4",
      }),
      G195E: await insertBranch({
        code: "G195E",
        name: "GBP E Barcelona",
        webSlug: "g195e",
        country: "ES",
        timezone: "Europe/Madrid",
        address: "Carrer de Prova 5",
        locality: "Barcelona",
        region: "Cataluña",
        gbpLocationId: "locations/555",
      }),
    };
    const [act] = await app.db
      .insert(schema.activities)
      .values(tenantValues(CTX, { name: ACTIVITY, isActive: true }))
      .$returningId();
    activityId = act.id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await restoreTemploFlags(app);
    await dropMine();
    await restoreSettings();
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  beforeEach(async () => {
    await resetMine();
    await limpiarSegundoGimnasio(app);
    configure();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await restoreTemploFlags(app);
  });

  // ─── helpers ──────────────────────────────────────────────────────────────

  async function setSetting(key: string, value: string) {
    await app.db
      .insert(schema.tenantSettings)
      .values(tenantValues(CTX, { settingKey: key, settingValue: value }))
      .onDuplicateKeyUpdate({ set: { settingValue: value } });
  }

  async function restoreSettings() {
    await app.db
      .delete(schema.tenantSettings)
      .where(
        and(
          tenantWhere(schema.tenantSettings, CTX),
          inArray(schema.tenantSettings.settingKey, [AR_KEY, ES_KEY]),
        ),
      );
    for (const row of originalSettings) {
      await setSetting(row.settingKey, row.settingValue);
    }
  }

  async function dropMine() {
    const mine = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX),
          inArray(schema.branches.code, CODES),
        ),
      );
    if (mine.length > 0) {
      await app.db.delete(schema.schedules).where(
        and(
          tenantWhere(schema.schedules, CTX),
          inArray(
            schema.schedules.branchId,
            mine.map((b) => b.id),
          ),
        ),
      );
    }
    await app.db
      .delete(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX),
          inArray(schema.branches.code, CODES),
        ),
      );
    await app.db
      .delete(schema.activities)
      .where(
        and(
          tenantWhere(schema.activities, CTX),
          eq(schema.activities.name, ACTIVITY),
        ),
      );
  }

  async function slot(
    branchId: number,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
  ) {
    await app.db.insert(schema.schedules).values(
      tenantValues(CTX, {
        branchId,
        activityId,
        dayOfWeek,
        startTime,
        endTime,
        isActive: true,
      }),
    );
  }

  /**
   * Estado base de cada test: hash sin guardar, horarios, WhatsApp y las
   * columnas que algún test muta (teléfono, dirección, id de ficha) en su
   * valor original.
   */
  async function resetMine() {
    await app.db
      .update(schema.branches)
      .set({ gbpSyncedHash: null, gbpSyncedAt: null })
      .where(
        and(
          tenantWhere(schema.branches, CTX),
          inArray(schema.branches.code, CODES),
        ),
      );
    const restore = async (
      code: string,
      set: Partial<typeof schema.branches.$inferInsert>,
    ) => {
      await app.db
        .update(schema.branches)
        .set(set)
        .where(
          and(
            tenantWhere(schema.branches, CTX),
            eq(schema.branches.code, code),
          ),
        );
    };
    await restore("G195A", { phone: null, address: "Calle GBP 195" });
    await restore("G195B", {
      phone: "+54 223 444-0000",
      address: "Otra Calle 22",
      gbpLocationId: "222",
    });
    await app.db
      .delete(schema.schedules)
      .where(
        and(
          tenantWhere(schema.schedules, CTX),
          inArray(schema.schedules.branchId, Object.values(ids)),
        ),
      );
    await slot(ids.G195A, 1, "07:00", "12:00");
    await slot(ids.G195A, 1, "16:00", "21:00");
    await slot(ids.G195A, 6, "09:00", "12:00");
    await slot(ids.G195E, 2, "10:00", "14:00");
    await setSetting(AR_KEY, "5492235820521");
    await setSetting(ES_KEY, "34680774331");
  }

  function configure(env: Record<string, string> = {}) {
    const all: Record<string, string> = {
      GBP_SYNC_MODE: "apply",
      GBP_OAUTH_CLIENT_ID: CLIENT_ID,
      GBP_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
      GBP_REFRESH_TOKEN: REFRESH_TOKEN,
      ...env,
    };
    for (const [k, v] of Object.entries(all)) vi.stubEnv(k, v);
  }

  function config(mode: GbpConfig["mode"]): GbpConfig {
    return {
      mode,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
    };
  }

  /**
   * Mockea fetch: el token endpoint devuelve un access token y cada PATCH lo
   * resuelve `onPatch` (200 por defecto). Devuelve las llamadas capturadas.
   */
  function stubGoogle(
    onPatch: (call: PatchCall) => Response | Promise<Response> = () => json({}),
    onToken: () => Response = () => json({ access_token: ACCESS_TOKEN }),
  ): { token: number; patches: PatchCall[]; all: string[] } {
    const state = { token: 0, patches: [] as PatchCall[], all: [] as string[] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init: RequestInit) => {
        const raw = String(url);
        state.all.push(raw);
        if (raw === "https://oauth2.googleapis.com/token") {
          state.token += 1;
          return onToken();
        }
        const parsed = new URL(raw);
        const match = parsed.pathname.match(/^\/v1\/locations\/(.+)$/);
        if (
          parsed.origin !==
            "https://mybusinessbusinessinformation.googleapis.com" ||
          !match
        ) {
          throw new Error(`URL inesperada en el test: ${parsed.origin}`);
        }
        const call: PatchCall = {
          locationId: match[1],
          validateOnly: parsed.searchParams.get("validateOnly"),
          updateMask: parsed.searchParams.get("updateMask"),
          method: init.method,
          authorization: (init.headers as Record<string, string>).authorization,
          body: JSON.parse(String(init.body)) as GbpLocationPatch,
        };
        state.patches.push(call);
        return onPatch(call);
      }),
    );
    return state;
  }

  async function branchRow(code: string) {
    const [row] = await app.db
      .select({
        hash: schema.branches.gbpSyncedHash,
        at: schema.branches.gbpSyncedAt,
      })
      .from(schema.branches)
      .where(
        and(tenantWhere(schema.branches, CTX), eq(schema.branches.code, code)),
      );
    return row;
  }

  const service = (log = fakeLog()) =>
    new GbpSyncService(app.db, log as unknown as FastifyBaseLogger);

  const ids3 = () => ["111", "222", "555"];

  // ─── sin credenciales / apagado ───────────────────────────────────────────

  describe("apagado por defecto", () => {
    it.each([
      ["modo off", { GBP_SYNC_MODE: "off" }],
      ["modo vacío (default)", { GBP_SYNC_MODE: "" }],
      ["modo inválido", { GBP_SYNC_MODE: "aplicar" }],
      [
        "dry-run sin refresh token",
        { GBP_SYNC_MODE: "dry-run", GBP_REFRESH_TOKEN: "" },
      ],
      [
        "apply sin client id",
        { GBP_SYNC_MODE: "apply", GBP_OAUTH_CLIENT_ID: "" },
      ],
      [
        "apply sin client secret",
        { GBP_SYNC_MODE: "apply", GBP_OAUTH_CLIENT_SECRET: "" },
      ],
    ])("%s: no llama a Google ni toca la base", async (_n, env) => {
      configure(env);
      const calls = stubGoogle();
      await runGbpSync(app.db);
      expect(calls.all).toHaveLength(0);
      expect((await branchRow("G195A")).hash).toBeNull();
    });
  });

  // ─── dry-run ──────────────────────────────────────────────────────────────

  describe("dry-run", () => {
    it("hace PATCH con validateOnly=true para cada sede publicada con ficha y no guarda el hash", async () => {
      configure({ GBP_SYNC_MODE: "dry-run" });
      const calls = stubGoogle();

      await runGbpSync(app.db);

      expect(calls.patches.map((p) => p.locationId).sort()).toEqual(ids3());
      for (const p of calls.patches) {
        expect(p.validateOnly).toBe("true");
        expect(p.method).toBe("PATCH");
        expect(p.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      }
      for (const code of ["G195A", "G195B", "G195E"]) {
        const row = await branchRow(code);
        expect(row.hash).toBeNull();
        expect(row.at).toBeNull();
      }
    });

    it("corre siempre, aunque no haya cambios (valida cada vez)", async () => {
      configure({ GBP_SYNC_MODE: "dry-run" });
      const calls = stubGoogle();
      await runGbpSync(app.db);
      await runGbpSync(app.db);
      expect(calls.patches).toHaveLength(6);
      expect(calls.patches.every((p) => p.validateOnly === "true")).toBe(true);
    });

    it("un 400 de validación se loguea con el detalle de Google y no guarda nada", async () => {
      const calls = stubGoogle((c) =>
        c.locationId === "111"
          ? json({ error: { message: "Invalid hours for location" } }, 400)
          : json({}),
      );
      const log = fakeLog();
      const summary = await service(log).sync(CTX, config("dry-run"));
      expect(calls.patches).toHaveLength(3);
      expect(summary).toMatchObject({ patched: 2, failed: 1, evaluated: 3 });
      const [fields] = log.warn.mock.calls[0] as [Record<string, unknown>];
      expect(fields.branchId).toBe(ids.G195A);
      expect(fields.status).toBe(400);
      expect(String(fields.err)).toContain("Invalid hours for location");
      expect((await branchRow("G195A")).hash).toBeNull();
    });
  });

  // ─── apply ────────────────────────────────────────────────────────────────

  describe("apply", () => {
    it("hace PATCH con validateOnly=false y guarda hash y fecha de cada ficha aplicada", async () => {
      const calls = stubGoogle();
      const before = Date.now();

      await runGbpSync(app.db);

      expect(calls.patches.map((p) => p.locationId).sort()).toEqual(ids3());
      expect(calls.patches.every((p) => p.validateOnly === "false")).toBe(true);
      for (const [code, loc] of [
        ["G195A", "111"],
        ["G195B", "222"],
        ["G195E", "555"],
      ] as const) {
        const sent = calls.patches.find((p) => p.locationId === loc);
        const row = await branchRow(code);
        expect(row.hash).toBe(patchHash(sent?.body as GbpLocationPatch));
        expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(row.at?.getTime()).toBeGreaterThanOrEqual(before - 1000);
      }
      // La sede no publicada y la sin ficha quedan intactas.
      expect((await branchRow("G195C")).hash).toBeNull();
      expect((await branchRow("G195D")).hash).toBeNull();
    });

    it("una segunda corrida sin cambios no hace PATCH ni pide token", async () => {
      stubGoogle();
      await runGbpSync(app.db);
      vi.unstubAllGlobals();

      const calls = stubGoogle();
      const log = fakeLog();
      const summary = await service(log).sync(CTX, config("apply"));

      expect(calls.patches).toHaveLength(0);
      expect(calls.token).toBe(0);
      expect(summary).toMatchObject({ unchanged: 3, patched: 0, failed: 0 });
    });

    it("solo vuelve a mandar la ficha cuyo horario cambió", async () => {
      stubGoogle();
      await runGbpSync(app.db);
      const hashB = (await branchRow("G195B")).hash;
      const hashA = (await branchRow("G195A")).hash;
      vi.unstubAllGlobals();

      await slot(ids.G195A, 3, "10:00", "13:00");
      const calls = stubGoogle();
      await runGbpSync(app.db);

      expect(calls.patches.map((p) => p.locationId)).toEqual(["111"]);
      expect(
        calls.patches[0].body.regularHours?.periods.map((p) => p.openDay),
      ).toEqual(["MONDAY", "MONDAY", "WEDNESDAY", "SATURDAY"]);
      expect((await branchRow("G195A")).hash).not.toBe(hashA);
      expect((await branchRow("G195B")).hash).toBe(hashB);
    });

    it.each([
      [
        "teléfono",
        () =>
          app.db
            .update(schema.branches)
            .set({ phone: "+54 223 999-9999" })
            .where(
              and(
                tenantWhere(schema.branches, CTX),
                eq(schema.branches.code, "G195A"),
              ),
            ),
        "111",
      ],
      [
        "dirección",
        () =>
          app.db
            .update(schema.branches)
            .set({ address: "Calle Nueva 999" })
            .where(
              and(
                tenantWhere(schema.branches, CTX),
                eq(schema.branches.code, "G195B"),
              ),
            ),
        "222",
      ],
      [
        "WhatsApp de ventas (teléfono de las sedes sin número propio)",
        () => setSetting(AR_KEY, "5491100000000"),
        "111",
      ],
    ])("un cambio de %s dispara el PATCH", async (_n, change, loc) => {
      stubGoogle();
      await runGbpSync(app.db);
      vi.unstubAllGlobals();
      await change();
      const calls = stubGoogle();
      await runGbpSync(app.db);
      expect(calls.patches.map((p) => p.locationId)).toEqual([loc]);
    });

    it("el hash guardado de otra ficha distinta no evita el PATCH", async () => {
      await app.db
        .update(schema.branches)
        .set({ gbpSyncedHash: "f".repeat(64) })
        .where(
          and(
            tenantWhere(schema.branches, CTX),
            eq(schema.branches.code, "G195A"),
          ),
        );
      const calls = stubGoogle();
      await runGbpSync(app.db);
      expect(calls.patches.map((p) => p.locationId).sort()).toEqual(ids3());
    });
  });

  // ─── contenido del patch ──────────────────────────────────────────────────

  describe("contenido del PATCH", () => {
    it("manda horarios, teléfono, dirección y web de la sede (y el mask correcto)", async () => {
      const calls = stubGoogle();
      await service().sync(CTX, config("apply"));
      const a = calls.patches.find((p) => p.locationId === "111");

      expect(a?.updateMask).toBe(
        "regularHours,phoneNumbers,storefrontAddress,websiteUri",
      );
      expect(a?.body).toEqual({
        regularHours: {
          periods: [
            {
              openDay: "MONDAY",
              openTime: { hours: 7, minutes: 0 },
              closeDay: "MONDAY",
              closeTime: { hours: 12, minutes: 0 },
            },
            {
              openDay: "MONDAY",
              openTime: { hours: 16, minutes: 0 },
              closeDay: "MONDAY",
              closeTime: { hours: 21, minutes: 0 },
            },
            {
              openDay: "SATURDAY",
              openTime: { hours: 9, minutes: 0 },
              closeDay: "SATURDAY",
              closeTime: { hours: 12, minutes: 0 },
            },
          ],
        },
        phoneNumbers: { primaryPhone: "+5492235820521" },
        storefrontAddress: {
          regionCode: "AR",
          locality: "Mar del Plata",
          administrativeArea: "Buenos Aires",
          postalCode: "7600",
          addressLines: ["Calle GBP 195"],
        },
        websiteUri:
          "https://eltemplo.org/sedes/g195a?utm_source=google&utm_medium=organic&utm_campaign=gbp-g195a",
      });
    });

    it("los horarios son los MISMOS que publica la web (computeOpeningHours)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/web/site-data",
      });
      const site = JSON.parse(res.body) as WebSiteData;
      const published = site.sedes.find((s) => s.code === "G195A");
      expect(published?.openingHours.length).toBeGreaterThan(0);

      const calls = stubGoogle();
      await service().sync(CTX, config("dry-run"));
      const a = calls.patches.find((p) => p.locationId === "111");

      const days = [
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY",
      ];
      const fromWeb = (published?.openingHours ?? []).map((h) => ({
        openDay: days[h.dayOfWeek - 1],
        open: h.opens,
        close: h.closes,
      }));
      const fromGoogle = (a?.body.regularHours?.periods ?? []).map((p) => ({
        openDay: p.openDay,
        open: `${String(p.openTime.hours).padStart(2, "0")}:${String(p.openTime.minutes).padStart(2, "0")}`,
        close: `${String(p.closeTime.hours).padStart(2, "0")}:${String(p.closeTime.minutes).padStart(2, "0")}`,
      }));
      expect(fromGoogle).toEqual(fromWeb);
    });

    it("sede sin horarios publicados: no manda regularHours ni lo incluye en el mask; usa su teléfono propio y el id pelado", async () => {
      const calls = stubGoogle();
      await service().sync(CTX, config("apply"));
      const b = calls.patches.find((p) => p.locationId === "222");
      expect(b?.body.regularHours).toBeUndefined();
      expect(b?.updateMask).toBe("phoneNumbers,storefrontAddress,websiteUri");
      expect(b?.body.phoneNumbers).toEqual({
        primaryPhone: "+54 223 444-0000",
      });
      expect(b?.body.storefrontAddress?.postalCode).toBeUndefined();
    });

    it("sede de España: regionCode ES, /es/sedes y WhatsApp de España", async () => {
      const calls = stubGoogle();
      await service().sync(CTX, config("apply"));
      const e = calls.patches.find((p) => p.locationId === "555");
      expect(e?.body.storefrontAddress?.regionCode).toBe("ES");
      expect(e?.body.phoneNumbers?.primaryPhone).toBe("+34680774331");
      expect(e?.body.websiteUri).toBe(
        "https://eltemplo.org/es/sedes/g195e?utm_source=google&utm_medium=organic&utm_campaign=gbp-g195e",
      );
      expect(e?.body.regularHours?.periods).toEqual([
        {
          openDay: "TUESDAY",
          openTime: { hours: 10, minutes: 0 },
          closeDay: "TUESDAY",
          closeTime: { hours: 14, minutes: 0 },
        },
      ]);
    });

    it("sin WhatsApp de ventas ni teléfono propio no manda phoneNumbers (no borra el de la ficha)", async () => {
      await app.db
        .delete(schema.tenantSettings)
        .where(
          and(
            tenantWhere(schema.tenantSettings, CTX),
            eq(schema.tenantSettings.settingKey, AR_KEY),
          ),
        );
      const calls = stubGoogle();
      await service().sync(CTX, config("dry-run"));
      const a = calls.patches.find((p) => p.locationId === "111");
      expect(a?.body.phoneNumbers).toBeUndefined();
      expect(a?.updateMask).not.toContain("phoneNumbers");
    });
  });

  // ─── sedes que se saltean y errores aislados ──────────────────────────────

  describe("aislamiento de errores", () => {
    it("una sede no publicada o sin ficha no se llama", async () => {
      const calls = stubGoogle();
      const summary = await service().sync(CTX, config("apply"));
      expect(calls.patches.map((p) => p.locationId)).not.toContain("333");
      expect(summary.skipped).toBe(1);
      expect(summary.evaluated).toBe(3);
    });

    it("un id de ficha inválido se saltea (no viaja a la ruta)", async () => {
      await app.db
        .update(schema.branches)
        .set({ gbpLocationId: "locations/../accounts/9" })
        .where(
          and(
            tenantWhere(schema.branches, CTX),
            eq(schema.branches.code, "G195B"),
          ),
        );
      const calls = stubGoogle();
      await service().sync(CTX, config("apply"));
      expect(calls.all.some((u) => u.includes(".."))).toBe(false);
      expect(calls.patches.map((p) => p.locationId).sort()).toEqual([
        "111",
        "555",
      ]);
    });

    it("un 403 en una ficha no frena a las demás y no guarda su hash", async () => {
      const calls = stubGoogle((c) =>
        c.locationId === "111"
          ? json(
              { error: { message: "The caller does not have permission" } },
              403,
            )
          : json({}),
      );
      const log = fakeLog();
      const summary = await service(log).sync(CTX, config("apply"));

      expect(calls.patches).toHaveLength(3);
      expect(summary).toMatchObject({ patched: 2, failed: 1 });
      expect((await branchRow("G195A")).hash).toBeNull();
      expect((await branchRow("G195B")).hash).not.toBeNull();
      expect((await branchRow("G195E")).hash).not.toBeNull();
      const [fields, message] = log.warn.mock.calls[0] as [
        Record<string, unknown>,
        string,
      ];
      expect(fields).toMatchObject({ branchId: ids.G195A, status: 403 });
      expect(message).toBe("GBP: no se pudo sincronizar una ficha");
    });

    it("un error de red en una ficha no frena a las demás", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL) => {
          const raw = String(url);
          if (raw === "https://oauth2.googleapis.com/token") {
            return json({ access_token: ACCESS_TOKEN });
          }
          if (raw.includes("/locations/222"))
            throw new TypeError("fetch failed");
          return json({});
        }),
      );
      const summary = await service().sync(CTX, config("apply"));
      expect(summary).toMatchObject({ patched: 2, failed: 1 });
      expect((await branchRow("G195B")).hash).toBeNull();
    });

    it("un fallo al reintentar se recupera: la ficha que falló se manda en la corrida siguiente", async () => {
      stubGoogle((c) => (c.locationId === "111" ? json({}, 500) : json({})));
      await service().sync(CTX, config("apply"));
      vi.unstubAllGlobals();
      const calls = stubGoogle();
      await service().sync(CTX, config("apply"));
      expect(calls.patches.map((p) => p.locationId)).toEqual(["111"]);
    });
  });

  // ─── token y secretos ─────────────────────────────────────────────────────

  describe("token y secretos", () => {
    it("pide el token con el refresh token y las credenciales OAuth", async () => {
      const bodies: URLSearchParams[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL, init: RequestInit) => {
          if (String(url) === "https://oauth2.googleapis.com/token") {
            bodies.push(new URLSearchParams(String(init.body)));
            return json({ access_token: ACCESS_TOKEN });
          }
          return json({});
        }),
      );
      await service().sync(CTX, config("dry-run"));
      expect(bodies).toHaveLength(1);
      expect(bodies[0].get("grant_type")).toBe("refresh_token");
      expect(bodies[0].get("client_id")).toBe(CLIENT_ID);
      expect(bodies[0].get("client_secret")).toBe(CLIENT_SECRET);
      expect(bodies[0].get("refresh_token")).toBe(REFRESH_TOKEN);
    });

    it("refresh token vencido (invalid_grant): no hace PATCH, loguea sin secretos y no guarda nada", async () => {
      const calls = stubGoogle(undefined, () =>
        json(
          {
            error: "invalid_grant",
            error_description: "Token has been expired or revoked.",
          },
          400,
        ),
      );
      const log = fakeLog();
      const summary = await service(log).sync(CTX, config("apply"));

      expect(calls.patches).toHaveLength(0);
      expect(calls.token).toBe(1);
      expect(summary).toMatchObject({ patched: 0, failed: 3 });
      expect(log.error).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(log.error.mock.calls);
      expect(logged).toContain("invalid_grant");
      for (const secret of [REFRESH_TOKEN, CLIENT_SECRET, CLIENT_ID]) {
        expect(logged).not.toContain(secret);
      }
      expect((await branchRow("G195A")).hash).toBeNull();
    });

    it("los logs nunca incluyen access token, refresh token ni client secret", async () => {
      stubGoogle((c) =>
        c.locationId === "222"
          ? json({ error: { message: "boom" } }, 500)
          : json({}),
      );
      const log = fakeLog();
      await service(log).sync(CTX, config("apply"));
      const logged = JSON.stringify([
        ...log.info.mock.calls,
        ...log.warn.mock.calls,
        ...log.error.mock.calls,
        ...log.debug.mock.calls,
      ]);
      for (const secret of [ACCESS_TOKEN, REFRESH_TOKEN, CLIENT_SECRET]) {
        expect(logged).not.toContain(secret);
      }
    });
  });

  // ─── tenancy y módulo ─────────────────────────────────────────────────────

  describe("por gimnasio", () => {
    async function seedGym2WithFicha() {
      const gym2 = await seedSecondTenant(app);
      await app.db
        .update(schema.branches)
        .set({
          webSlug: "gym2-gbp-195",
          publishOnWeb: true,
          address: "Calle Dos 2",
          phone: "+54 11 0000-0002",
          gbpLocationId: "locations/777",
        })
        .where(
          and(
            tenantWhere(schema.branches, CTX_DOS),
            eq(schema.branches.id, gym2.branchId),
          ),
        );
      return gym2;
    }

    it("un gimnasio sin templo-marketing no se procesa; con el módulo cada uno manda solo lo suyo", async () => {
      const gym2 = await seedGym2WithFicha();
      await setModuleFlag(app, TENANT_DOS, "templo-marketing", false);
      const calls = stubGoogle();

      await runGbpSync(app.db);
      expect(calls.patches.map((p) => p.locationId).sort()).toEqual(ids3());

      await setModuleFlag(app, TENANT_DOS, "templo-marketing", true);
      calls.patches.length = 0;
      await runGbpSync(app.db);

      const dos = calls.patches.filter((p) => p.locationId === "777");
      expect(dos).toHaveLength(1);
      expect(dos[0].body.storefrontAddress?.addressLines).toEqual([
        "Calle Dos 2",
      ]);
      expect(dos[0].body.phoneNumbers?.primaryPhone).toBe("+54 11 0000-0002");
      // Lo del gimnasio 1 no viaja a la ficha del 2 y viceversa.
      const mine = calls.patches.filter((p) => p.locationId !== "777");
      expect(JSON.stringify(mine)).not.toContain("Calle Dos 2");
      expect(JSON.stringify(dos)).not.toContain("Calle GBP 195");
      // Cada hash se guardó en SU sede.
      const [row] = await app.db
        .select({ hash: schema.branches.gbpSyncedHash })
        .from(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, CTX_DOS),
            eq(schema.branches.id, gym2.branchId),
          ),
        );
      expect(row.hash).toBe(patchHash(dos[0].body));
    });

    it("con el módulo apagado en El Templo no llama a Google", async () => {
      await setModuleFlag(app, TENANT_TEMPLO, "templo-marketing", false);
      const calls = stubGoogle();
      await runGbpSync(app.db);
      expect(calls.all).toHaveLength(0);
    });

    it("la config de entorno se lee por corrida (sin cachear)", async () => {
      expect(getGbpConfig()?.mode).toBe("apply");
      configure({ GBP_SYNC_MODE: "off" });
      expect(getGbpConfig()).toBeNull();
    });
  });

  // ─── helpers puros que usa el servicio ────────────────────────────────────

  describe("normalizeLocationId", () => {
    it.each([
      ["locations/123", "123"],
      ["123", "123"],
      ["  locations/9  ", "9"],
      ["locations/abc", null],
      ["locations/1/../2", null],
      ["accounts/1/locations/2", null],
      ["", null],
      ["1".repeat(31), null],
    ])("%j → %j", (raw, expected) => {
      expect(normalizeLocationId(raw)).toBe(expected);
    });
  });
});
