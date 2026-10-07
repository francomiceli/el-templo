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
import { generateKeyPairSync } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { inArray } from "drizzle-orm";
import { cleanAllTestData, createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  SearchConsoleService,
  searchConsolePeriod,
} from "../../src/modules/marketing/google/search-console";
import { getSearchConsoleConfig } from "../../src/modules/marketing/google/config";
import { runSearchConsoleSync } from "../../src/jobs/marketing-google";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  limpiarSegundoGimnasio,
  seedSecondTenant,
} from "../fixtures/second-tenant";
import { restoreTemploFlags, setModuleFlag } from "../fixtures/module-flags";

const CTX = { tenantId: TENANT_TEMPLO };
const CTX_DOS = { tenantId: TENANT_DOS };

/** 12:00 UTC del 7 de octubre de 2026: período = 2026-09-28 .. 2026-10-04. */
const TODAY = new Date("2026-10-07T12:00:00Z");
const START = "2026-09-28";
const END = "2026-10-04";

const ACCESS_TOKEN = "gsc-access-token-195";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_PEM = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
const SA_JSON = JSON.stringify({
  client_email: "sc-reader@proyecto.iam.gserviceaccount.com",
  private_key: PRIVATE_PEM,
  private_key_id: "kid-195",
});

type GscRow = {
  keys: unknown;
  clicks: unknown;
  impressions: unknown;
  ctr: unknown;
  position: unknown;
};

function gscRow(
  page: string,
  query: string,
  over: Partial<GscRow> = {},
): GscRow {
  return {
    keys: [page, query],
    clicks: 3,
    impressions: 40,
    ctr: 0.075,
    position: 4.2,
    ...over,
  };
}

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

const fakeLog = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

/**
 * Fase 195-09 (D-21.2): Search Console semanal. `fetch` va siempre mockeado con
 * `vi.stubGlobal`: este archivo NUNCA llama a Google.
 */
describe("Search Console semanal (searchAnalytics → search_console_stats)", () => {
  let app: FastifyInstance;
  let gym2Seeded = false;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await restoreTemploFlags(app);
    await cleanAllTestData(app);
    await cleanGym2();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await cleanGym2();
    configure();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await restoreTemploFlags(app);
  });

  async function cleanGym2(): Promise<void> {
    if (gym2Seeded) {
      await app.db
        .delete(schema.searchConsoleStats)
        .where(tenantWhere(schema.searchConsoleStats, CTX_DOS));
    }
    await limpiarSegundoGimnasio(app);
    gym2Seeded = false;
  }

  function configure(env: Record<string, string> = {}): void {
    const all: Record<string, string> = {
      GOOGLE_SC_SERVICE_ACCOUNT_BASE64: Buffer.from(SA_JSON).toString("base64"),
      GOOGLE_SC_SITE_URL: "sc-domain:eltemplo.org",
      ...env,
    };
    for (const [k, v] of Object.entries(all)) vi.stubEnv(k, v);
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  /**
   * Mockea fetch: el token endpoint responde un access token y cada llamada a
   * searchAnalytics la resuelve `onQuery`. Devuelve las llamadas capturadas.
   */
  function stubGoogle(
    onQuery: (call: Call, n: number) => Response,
    onToken: () => Response = () => json({ access_token: ACCESS_TOKEN }),
  ): { token: Call[]; query: Call[] } {
    const token: Call[] = [];
    const query: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init: RequestInit) => {
        const raw = String(url);
        const call: Call = {
          url: raw,
          init,
          body:
            init.body instanceof URLSearchParams
              ? Object.fromEntries(init.body.entries())
              : (JSON.parse(String(init.body)) as Record<string, unknown>),
        };
        if (raw === "https://oauth2.googleapis.com/token") {
          token.push(call);
          return onToken();
        }
        query.push(call);
        return onQuery(call, query.length);
      }),
    );
    return { token, query };
  }

  async function stats(ctx = CTX) {
    return app.db
      .select()
      .from(schema.searchConsoleStats)
      .where(tenantWhere(schema.searchConsoleStats, ctx))
      .orderBy(schema.searchConsoleStats.id);
  }

  async function seedRow(
    over: Partial<typeof schema.searchConsoleStats.$inferInsert> = {},
    ctx = CTX,
  ): Promise<void> {
    await app.db.insert(schema.searchConsoleStats).values(
      tenantValues(ctx, {
        periodStart: START,
        periodEnd: END,
        page: "https://eltemplo.org/viejo",
        query: "viejo",
        clicks: 1,
        impressions: 2,
        ctr: "0.5000",
        position: "1.00",
        ...over,
      }),
    );
  }

  const service = (log = fakeLog()) =>
    new SearchConsoleService(app.db, log as unknown as FastifyBaseLogger);

  function config() {
    const c = getSearchConsoleConfig();
    if (!c) throw new Error("config de prueba inválida");
    return c;
  }

  // ─── período ──────────────────────────────────────────────────────────────

  describe("searchConsolePeriod", () => {
    it("es [hoy - 9, hoy - 3] en UTC", () => {
      expect(searchConsolePeriod(TODAY)).toEqual({
        startDate: START,
        endDate: END,
      });
    });

    it("cruza mes y año sin romper", () => {
      expect(searchConsolePeriod(new Date("2027-01-05T23:59:00Z"))).toEqual({
        startDate: "2026-12-27",
        endDate: "2027-01-02",
      });
    });

    it("usa el día UTC aunque la hora sea las 00:00", () => {
      expect(searchConsolePeriod(new Date("2026-10-07T00:00:00Z"))).toEqual({
        startDate: START,
        endDate: END,
      });
    });
  });

  // ─── sin credenciales ─────────────────────────────────────────────────────

  describe("sin credenciales es un no-op", () => {
    it.each([
      ["sin service account", { GOOGLE_SC_SERVICE_ACCOUNT_BASE64: "" }],
      [
        "service account que no es JSON",
        {
          GOOGLE_SC_SERVICE_ACCOUNT_BASE64:
            Buffer.from("basura").toString("base64"),
        },
      ],
    ])("%s: no llama a Google ni escribe filas", async (_n, env) => {
      configure(env);
      const calls = stubGoogle(() =>
        json({ rows: [gscRow("https://a/", "q")] }),
      );
      await runSearchConsoleSync(app.db, TODAY);
      expect(calls.token).toHaveLength(0);
      expect(calls.query).toHaveLength(0);
      expect(await stats()).toHaveLength(0);
    });
  });

  // ─── camino feliz ─────────────────────────────────────────────────────────

  describe("sync del período", () => {
    it("pide el período, la propiedad codificada y las dimensiones, y guarda las filas", async () => {
      const calls = stubGoogle(() =>
        json({
          rows: [
            gscRow(
              "https://eltemplo.org/sedes/jujuy",
              "gimnasio mar del plata",
              {
                clicks: 12,
                impressions: 340,
                ctr: 0.123456,
                position: 3.456,
              },
            ),
            gscRow("https://eltemplo.org/", "el templo"),
          ],
        }),
      );

      const summary = await service().syncPeriod(CTX, config(), TODAY);

      expect(summary).toEqual({
        periodStart: START,
        periodEnd: END,
        rows: 2,
        skippedRows: 0,
        fetched: true,
      });
      expect(calls.query).toHaveLength(1);
      const q = calls.query[0];
      expect(q.url).toBe(
        "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aeltemplo.org/searchAnalytics/query",
      );
      expect(q.init.method).toBe("POST");
      expect((q.init.headers as Record<string, string>).authorization).toBe(
        `Bearer ${ACCESS_TOKEN}`,
      );
      expect(q.body).toEqual({
        startDate: START,
        endDate: END,
        dimensions: ["page", "query"],
        rowLimit: 25000,
        startRow: 0,
        dataState: "final",
      });
      expect(q.init.signal).toBeInstanceOf(AbortSignal);

      // El token se pide con scope de SOLO LECTURA.
      expect(calls.token).toHaveLength(1);
      const assertion = String(calls.token[0].body.assertion);
      const claims = JSON.parse(
        Buffer.from(assertion.split(".")[1], "base64url").toString("utf8"),
      ) as { scope: string; iss: string };
      expect(claims.scope).toBe(
        "https://www.googleapis.com/auth/webmasters.readonly",
      );
      expect(claims.iss).toBe("sc-reader@proyecto.iam.gserviceaccount.com");

      const rows = await stats();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        tenantId: TENANT_TEMPLO,
        periodStart: START,
        periodEnd: END,
        page: "https://eltemplo.org/sedes/jujuy",
        query: "gimnasio mar del plata",
        clicks: 12,
        impressions: 340,
        ctr: "0.1235",
        position: "3.46",
      });
      expect(rows[1].ctr).toBe("0.0750");
      expect(rows[1].position).toBe("4.20");
    });

    it("la propiedad de la config se respeta (URL-prefix)", async () => {
      configure({ GOOGLE_SC_SITE_URL: "https://eltemplo.org/" });
      const calls = stubGoogle(() => json({ rows: [] }));
      await service().syncPeriod(CTX, config(), TODAY);
      expect(calls.query[0].url).toBe(
        "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Feltemplo.org%2F/searchAnalytics/query",
      );
    });

    it("trunca page y query a 500 caracteres y redondea clics e impresiones", async () => {
      stubGoogle(() =>
        json({
          rows: [
            gscRow(`https://eltemplo.org/${"p".repeat(600)}`, "q".repeat(700), {
              clicks: 2.6,
              impressions: 9.4,
            }),
          ],
        }),
      );
      await service().syncPeriod(CTX, config(), TODAY);
      const [row] = await stats();
      expect(row.page).toHaveLength(500);
      expect(row.query).toHaveLength(500);
      expect(row.clicks).toBe(3);
      expect(row.impressions).toBe(9);
    });

    it("descarta filas sin números válidos o sin página y cuenta las descartadas", async () => {
      stubGoogle(() =>
        json({
          rows: [
            gscRow("https://eltemplo.org/ok", "ok"),
            gscRow("https://eltemplo.org/a", "a", { clicks: "3" }),
            gscRow("https://eltemplo.org/b", "b", { ctr: Number.NaN }),
            gscRow("https://eltemplo.org/c", "c", { position: -1 }),
            { keys: [], clicks: 1, impressions: 1, ctr: 0.1, position: 1 },
            { keys: "x", clicks: 1, impressions: 1, ctr: 0.1, position: 1 },
          ],
        }),
      );
      const summary = await service().syncPeriod(CTX, config(), TODAY);
      expect(summary.rows).toBe(1);
      expect(summary.skippedRows).toBe(5);
      expect((await stats()).map((r) => r.query)).toEqual(["ok"]);
    });

    it("una consulta ausente se guarda como NULL", async () => {
      stubGoogle(() =>
        json({
          rows: [
            {
              keys: ["https://eltemplo.org/solo-pagina"],
              clicks: 1,
              impressions: 2,
              ctr: 0.5,
              position: 1,
            },
          ],
        }),
      );
      await service().syncPeriod(CTX, config(), TODAY);
      expect((await stats())[0].query).toBeNull();
    });

    it("cada fila lleva el tenant del gimnasio (nunca el default)", async () => {
      stubGoogle(() => json({ rows: [gscRow("https://eltemplo.org/", "x")] }));
      await service().syncPeriod(CTX, config(), TODAY);
      const all = await app.db
        .select({ tenantId: schema.searchConsoleStats.tenantId })
        .from(schema.searchConsoleStats)
        .where(
          inArray(schema.searchConsoleStats.tenantId, [
            TENANT_TEMPLO,
            TENANT_DOS,
          ]),
        );
      expect(all.length).toBeGreaterThan(0);
      expect(all.every((r) => r.tenantId === TENANT_TEMPLO)).toBe(true);
    });

    it("respuesta sin rows (período sin datos) deja el período vacío", async () => {
      await seedRow();
      stubGoogle(() => json({}));
      const summary = await service().syncPeriod(CTX, config(), TODAY);
      expect(summary.fetched).toBe(true);
      expect(summary.rows).toBe(0);
      expect(await stats()).toHaveLength(0);
    });
  });

  // ─── paginación ───────────────────────────────────────────────────────────

  describe("paginación por startRow", () => {
    it("pide la página siguiente mientras vuelvan 25000 filas", async () => {
      const full = Array.from({ length: 25000 }, (_, i) =>
        gscRow("https://eltemplo.org/", `consulta ${i}`),
      );
      const calls = stubGoogle((_c, n) =>
        n === 1
          ? json({ rows: full })
          : json({
              rows: [
                gscRow("https://eltemplo.org/sedes/a", "uno"),
                gscRow("https://eltemplo.org/sedes/b", "dos"),
                gscRow("https://eltemplo.org/sedes/c", "tres"),
              ],
            }),
      );

      const summary = await service().syncPeriod(CTX, config(), TODAY);

      expect(calls.query.map((c) => c.body.startRow)).toEqual([0, 25000]);
      expect(summary.rows).toBe(25003);
      expect(await stats()).toHaveLength(25003);
    }, 120_000);

    it("si la segunda página falla no borra lo que ya había", async () => {
      await seedRow();
      const full = Array.from({ length: 25000 }, (_, i) =>
        gscRow("https://eltemplo.org/", `consulta ${i}`),
      );
      stubGoogle((_c, n) => (n === 1 ? json({ rows: full }) : json({}, 500)));

      const log = fakeLog();
      const summary = await service(log).syncPeriod(CTX, config(), TODAY);

      expect(summary.fetched).toBe(false);
      const rows = await stats();
      expect(rows).toHaveLength(1);
      expect(rows[0].query).toBe("viejo");
    }, 120_000);
  });

  // ─── idempotencia ─────────────────────────────────────────────────────────

  describe("re-correr el mismo período", () => {
    it("deja la misma cantidad de filas (borra y reinserta)", async () => {
      stubGoogle(() =>
        json({
          rows: [
            gscRow("https://eltemplo.org/a", "uno"),
            gscRow("https://eltemplo.org/b", "dos"),
            gscRow("https://eltemplo.org/c", "tres"),
          ],
        }),
      );
      await service().syncPeriod(CTX, config(), TODAY);
      await service().syncPeriod(CTX, config(), TODAY);
      await service().syncPeriod(CTX, config(), TODAY);
      expect(await stats()).toHaveLength(3);
    });

    it("reemplaza lo que ya había del período por los datos nuevos", async () => {
      await seedRow({ query: "dato-viejo-1" });
      await seedRow({ query: "dato-viejo-2" });
      stubGoogle(() =>
        json({ rows: [gscRow("https://eltemplo.org/", "nuevo")] }),
      );
      await service().syncPeriod(CTX, config(), TODAY);
      expect((await stats()).map((r) => r.query)).toEqual(["nuevo"]);
    });

    it("no toca otros períodos del mismo gimnasio", async () => {
      await seedRow({
        periodStart: "2026-09-21",
        periodEnd: "2026-09-27",
        query: "semana-anterior",
      });
      await seedRow({
        periodStart: START,
        periodEnd: "2026-10-05",
        query: "mismo-inicio-otro-fin",
      });
      await seedRow({
        periodStart: "2026-09-27",
        periodEnd: END,
        query: "mismo-fin-otro-inicio",
      });
      stubGoogle(() =>
        json({ rows: [gscRow("https://eltemplo.org/", "nuevo")] }),
      );
      await service().syncPeriod(CTX, config(), TODAY);
      expect((await stats()).map((r) => r.query).sort()).toEqual([
        "mismo-fin-otro-inicio",
        "mismo-inicio-otro-fin",
        "nuevo",
        "semana-anterior",
      ]);
    });

    it("no toca las filas de otro gimnasio con el mismo período", async () => {
      await seedSecondTenant(app);
      gym2Seeded = true;
      await seedRow({ query: "del-gimnasio-2" }, CTX_DOS);
      stubGoogle(() =>
        json({ rows: [gscRow("https://eltemplo.org/", "mio")] }),
      );
      await service().syncPeriod(CTX, config(), TODAY);
      expect((await stats(CTX)).map((r) => r.query)).toEqual(["mio"]);
      expect((await stats(CTX_DOS)).map((r) => r.query)).toEqual([
        "del-gimnasio-2",
      ]);
    });
  });

  // ─── errores de Google ────────────────────────────────────────────────────

  describe("errores de Google", () => {
    it.each([401, 403, 404])(
      "%s: log.warn con el status, sin throw y la tabla no cambia",
      async (status) => {
        await seedRow();
        stubGoogle(() =>
          json({ error: { code: status, message: "sin permiso" } }, status),
        );
        const log = fakeLog();

        const summary = await service(log).syncPeriod(CTX, config(), TODAY);

        expect(summary.fetched).toBe(false);
        expect(log.warn).toHaveBeenCalledTimes(1);
        const [fields, message] = log.warn.mock.calls[0] as [
          Record<string, unknown>,
          string,
        ];
        expect(fields.status).toBe(status);
        expect(message).toBe("Search Console sin acceso a la propiedad");
        const rows = await stats();
        expect(rows).toHaveLength(1);
        expect(rows[0].query).toBe("viejo");
      },
    );

    it.each([429, 500, 503])(
      "%s: se loguea, no rompe y la tabla no cambia",
      async (status) => {
        await seedRow();
        stubGoogle(() => json({ error: { message: "x" } }, status));
        const log = fakeLog();
        const summary = await service(log).syncPeriod(CTX, config(), TODAY);
        expect(summary.fetched).toBe(false);
        expect(log.warn).toHaveBeenCalled();
        expect((await stats()).map((r) => r.query)).toEqual(["viejo"]);
      },
    );

    it("error de red: se loguea el nombre del error, no rompe y la tabla no cambia", async () => {
      await seedRow();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL) => {
          if (String(url) === "https://oauth2.googleapis.com/token") {
            return json({ access_token: ACCESS_TOKEN });
          }
          throw new TypeError("fetch failed");
        }),
      );
      const log = fakeLog();
      const summary = await service(log).syncPeriod(CTX, config(), TODAY);
      expect(summary.fetched).toBe(false);
      expect(log.warn).toHaveBeenCalled();
      expect((await stats()).map((r) => r.query)).toEqual(["viejo"]);
    });

    it("respuesta que no es JSON: no rompe y la tabla no cambia", async () => {
      await seedRow();
      stubGoogle(() => new Response("<html>nope</html>", { status: 200 }));
      const summary = await service().syncPeriod(CTX, config(), TODAY);
      expect(summary.fetched).toBe(false);
      expect((await stats()).map((r) => r.query)).toEqual(["viejo"]);
    });

    it("el token falla (invalid_grant): no consulta Google, la tabla no cambia y los logs no filtran secretos", async () => {
      await seedRow();
      const calls = stubGoogle(
        () => json({}),
        () =>
          json({ error: "invalid_grant", error_description: "Bad JWT" }, 400),
      );
      const log = fakeLog();

      const summary = await service(log).syncPeriod(CTX, config(), TODAY);

      expect(summary.fetched).toBe(false);
      expect(calls.query).toHaveLength(0);
      expect(log.error).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify([
        ...log.error.mock.calls,
        ...log.warn.mock.calls,
        ...log.info.mock.calls,
      ]);
      expect(logged).toContain("invalid_grant");
      expect(logged).not.toContain("BEGIN PRIVATE KEY");
      expect(logged).not.toContain(String(calls.token[0].body.assertion));
      expect((await stats()).map((r) => r.query)).toEqual(["viejo"]);
    });

    it("nunca loguea el access token ni la clave en el camino feliz", async () => {
      stubGoogle(() => json({ rows: [gscRow("https://eltemplo.org/", "x")] }));
      const log = fakeLog();
      await service(log).syncPeriod(CTX, config(), TODAY);
      const logged = JSON.stringify([
        ...log.error.mock.calls,
        ...log.warn.mock.calls,
        ...log.info.mock.calls,
        ...log.debug.mock.calls,
      ]);
      expect(logged).not.toContain(ACCESS_TOKEN);
      expect(logged).not.toContain("PRIVATE KEY");
    });
  });

  // ─── job: módulo y tenancy ────────────────────────────────────────────────

  describe("job por gimnasio", () => {
    it("corre para el gimnasio con templo-marketing y guarda sus filas", async () => {
      const calls = stubGoogle(() =>
        json({ rows: [gscRow("https://eltemplo.org/", "x")] }),
      );
      await runSearchConsoleSync(app.db, TODAY);
      expect(calls.query).toHaveLength(1);
      expect(await stats()).toHaveLength(1);
    });

    it("un gimnasio sin el módulo no se procesa; con el módulo cada uno guarda lo suyo", async () => {
      await seedSecondTenant(app);
      gym2Seeded = true;
      await setModuleFlag(app, TENANT_DOS, "templo-marketing", false);
      const calls = stubGoogle(() =>
        json({ rows: [gscRow("https://eltemplo.org/", "x")] }),
      );

      await runSearchConsoleSync(app.db, TODAY);
      expect(calls.query).toHaveLength(1);
      expect(await stats(CTX_DOS)).toHaveLength(0);

      await setModuleFlag(app, TENANT_DOS, "templo-marketing", true);
      await runSearchConsoleSync(app.db, TODAY);
      expect(calls.query).toHaveLength(3);
      expect(await stats(CTX_DOS)).toHaveLength(1);
      expect(await stats(CTX)).toHaveLength(1);
    });

    it("con el módulo apagado en El Templo no llama a Google", async () => {
      await setModuleFlag(app, TENANT_TEMPLO, "templo-marketing", false);
      const calls = stubGoogle(() => json({ rows: [] }));
      await runSearchConsoleSync(app.db, TODAY);
      expect(calls.token).toHaveLength(0);
      expect(calls.query).toHaveLength(0);
    });

    it("usa el período de la fecha pasada al job", async () => {
      const calls = stubGoogle(() => json({ rows: [] }));
      await runSearchConsoleSync(app.db, new Date("2026-11-20T10:00:00Z"));
      expect(calls.query[0].body.startDate).toBe("2026-11-11");
      expect(calls.query[0].body.endDate).toBe("2026-11-17");
    });
  });
});
