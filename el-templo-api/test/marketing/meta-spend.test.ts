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
import { cleanAllTestData, createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { MetaSpendService } from "../../src/modules/marketing/meta/spend-service";
import { getMetaSpendConfig } from "../../src/modules/marketing/meta/config";
import { runSpendSync } from "../../src/jobs/marketing-meta";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  limpiarSegundoGimnasio,
  seedSecondTenant,
} from "../fixtures/second-tenant";
import { setModuleFlag } from "../fixtures/module-flags";

const CTX = { tenantId: TENANT_TEMPLO };
const CTX_DOS = { tenantId: TENANT_DOS };

const TOKEN = "EAAB-spend-secret-token-195";
/** 12:00 UTC = 09:00 en Argentina: el mismo día calendario. */
const NOON = new Date("2026-10-07T12:00:00Z");

interface InsightsCall {
  url: URL;
  raw: string;
}

type Row = Record<string, unknown>;

function insightsRow(over: Row = {}): Row {
  return {
    campaign_id: "c1",
    campaign_name: "Campaña Uno",
    spend: "100.50",
    account_currency: "ARS",
    date_start: "2026-10-05",
    date_stop: "2026-10-05",
    ...over,
  };
}

/**
 * Fase 195-08 (D-20): gasto diario de Meta. `fetch` va siempre mockeado con
 * `vi.stubGlobal`: este archivo NUNCA llama a Meta.
 */
describe("Meta gasto diario (Insights → ad_spend_daily)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await cleanAllTestData(app);
    await cleanGym2();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await cleanGym2();
    configure();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function cleanGym2(): Promise<void> {
    await app.db
      .delete(schema.adSpendDaily)
      .where(tenantWhere(schema.adSpendDaily, CTX_DOS));
    await limpiarSegundoGimnasio(app);
  }

  function configure(env: Record<string, string> = {}): void {
    const all: Record<string, string> = {
      META_ACCESS_TOKEN: TOKEN,
      META_PIXEL_ID: "",
      META_CAPI_START_AT: "",
      META_AD_ACCOUNT_IDS: "act_111",
      META_GRAPH_VERSION: "",
      ...env,
    };
    for (const [k, v] of Object.entries(all)) vi.stubEnv(k, v);
  }

  /** Mockea fetch con un handler por llamada; devuelve las llamadas capturadas. */
  function stubFetch(
    handler: (call: InsightsCall, n: number) => Response | Promise<Response>,
  ): InsightsCall[] {
    const calls: InsightsCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const call = { url: new URL(String(url)), raw: String(url) };
        calls.push(call);
        return handler(call, calls.length);
      }),
    );
    return calls;
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  async function spendRows(ctx = CTX) {
    return app.db
      .select()
      .from(schema.adSpendDaily)
      .where(tenantWhere(schema.adSpendDaily, ctx))
      .orderBy(schema.adSpendDaily.campaignId, schema.adSpendDaily.spendDate);
  }

  const fakeLog = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

  // ─── sin credenciales ─────────────────────────────────────────────────────

  describe("sin credenciales es un no-op", () => {
    it.each([
      ["sin token", { META_ACCESS_TOKEN: "" }],
      ["sin cuentas", { META_AD_ACCOUNT_IDS: "" }],
      ["cuentas no numéricas", { META_AD_ACCOUNT_IDS: "abc,../x" }],
    ])("%s: no llama a Meta ni escribe filas", async (_n, env) => {
      configure(env);
      const calls = stubFetch(() => json({ data: [insightsRow()] }));
      await runSpendSync(app.db, NOON);
      expect(calls).toHaveLength(0);
      expect(await spendRows()).toHaveLength(0);
    });

    it("el gasto no necesita pixel ni fecha de CAPI (son independientes)", async () => {
      configure({ META_PIXEL_ID: "", META_CAPI_START_AT: "" });
      const calls = stubFetch(() => json({ data: [insightsRow()] }));
      await runSpendSync(app.db, NOON);
      expect(calls).toHaveLength(1);
    });
  });

  // ─── consulta y paginado ──────────────────────────────────────────────────

  describe("consulta a Insights", () => {
    it("pide nivel campaña, un renglón por día, los últimos 7 días y 500 por página", async () => {
      const calls = stubFetch(() => json({ data: [] }));
      await runSpendSync(app.db, NOON);

      expect(calls).toHaveLength(1);
      const u = calls[0].url;
      expect(u.origin + u.pathname).toBe(
        "https://graph.facebook.com/v26.0/act_111/insights",
      );
      expect(u.searchParams.get("level")).toBe("campaign");
      expect(u.searchParams.get("time_increment")).toBe("1");
      expect(u.searchParams.get("limit")).toBe("500");
      expect(u.searchParams.get("fields")).toBe(
        "campaign_id,campaign_name,spend,account_currency,date_start",
      );
      expect(JSON.parse(u.searchParams.get("time_range") ?? "{}")).toEqual({
        since: "2026-09-30",
        until: "2026-10-07",
      });
      expect(u.searchParams.get("access_token")).toBe(TOKEN);
    });

    it("el día de referencia es el de Argentina, no el de UTC", async () => {
      // 01:30 UTC del 8 = 22:30 del 7 en Buenos Aires.
      const calls = stubFetch(() => json({ data: [] }));
      await runSpendSync(app.db, new Date("2026-10-08T01:30:00Z"));
      expect(
        JSON.parse(calls[0].url.searchParams.get("time_range") ?? "{}"),
      ).toEqual({ since: "2026-09-30", until: "2026-10-07" });
    });

    it("META_GRAPH_VERSION cambia la versión de la URL", async () => {
      configure({ META_GRAPH_VERSION: "v27.0" });
      const calls = stubFetch(() => json({ data: [] }));
      await runSpendSync(app.db, NOON);
      expect(calls[0].url.pathname).toBe("/v27.0/act_111/insights");
    });

    it("dos páginas (paging.next): se piden las dos y se guardan todas las filas", async () => {
      const next =
        "https://graph.facebook.com/v26.0/act_111/insights?after=CURSOR&access_token=" +
        TOKEN;
      const calls = stubFetch((_c, n) =>
        n === 1
          ? json({
              data: [
                insightsRow({
                  campaign_id: "c1",
                  date_start: "2026-10-04",
                  spend: "10",
                }),
                insightsRow({
                  campaign_id: "c1",
                  date_start: "2026-10-05",
                  spend: "20.5",
                }),
              ],
              paging: { next },
            })
          : json({
              data: [
                insightsRow({
                  campaign_id: "c2",
                  campaign_name: "Dos",
                  spend: "0",
                }),
              ],
            }),
      );

      await runSpendSync(app.db, NOON);

      expect(calls).toHaveLength(2);
      expect(calls[1].url.searchParams.get("after")).toBe("CURSOR");
      const rows = await spendRows();
      expect(rows.map((r) => [r.campaignId, r.spendDate, r.spend])).toEqual([
        ["c1", "2026-10-04", "10.00"],
        ["c1", "2026-10-05", "20.50"],
        ["c2", "2026-10-05", "0.00"],
      ]);
      expect(rows.every((r) => r.tenantId === TENANT_TEMPLO)).toBe(true);
      expect(
        rows.every((r) => r.platform === "meta" && r.accountId === "111"),
      ).toBe(true);
    });

    it("un paging.next que apunta fuera de graph.facebook.com no se sigue (la cuenta falla, no se guarda nada)", async () => {
      const calls = stubFetch(() =>
        json({
          data: [insightsRow()],
          paging: { next: "https://evil.example.com/steal?access_token=x" },
        }),
      );
      const log = fakeLog();
      const service = new MetaSpendService(
        app.db,
        log as unknown as FastifyBaseLogger,
      );
      const config = getMetaSpendConfig();
      if (!config) throw new Error("config esperada");

      const summary = await service.syncSpend(CTX, config, "2026-10-07");

      expect(calls).toHaveLength(1);
      expect(summary.failedAccounts).toBe(1);
      expect(await spendRows()).toHaveLength(0);
      expect(log.error).toHaveBeenCalledTimes(1);
    });

    it("un paging.next por http (no https) tampoco se sigue", async () => {
      const calls = stubFetch(() =>
        json({
          data: [insightsRow()],
          paging: {
            next: "http://graph.facebook.com/v26.0/act_111/insights?after=x",
          },
        }),
      );
      await runSpendSync(app.db, NOON);
      expect(calls).toHaveLength(1);
      expect(await spendRows()).toHaveLength(0);
    });

    it("un paging.next en bucle se corta (tope de páginas)", async () => {
      const next =
        "https://graph.facebook.com/v26.0/act_111/insights?after=LOOP";
      const calls = stubFetch(() => json({ data: [], paging: { next } }));
      await runSpendSync(app.db, NOON);
      expect(calls.length).toBeLessThanOrEqual(51);
      expect(calls.length).toBeGreaterThan(10);
    });
  });

  // ─── upsert ───────────────────────────────────────────────────────────────

  describe("upsert sin duplicar y sin convertir monedas", () => {
    it("una segunda corrida con gasto distinto actualiza (spend, nombre, moneda) sin duplicar ni tocar otros días", async () => {
      stubFetch(() =>
        json({
          data: [
            insightsRow({ date_start: "2026-10-05", spend: "100.50" }),
            insightsRow({ date_start: "2026-10-06", spend: "50" }),
            insightsRow({
              campaign_id: "c9",
              campaign_name: "Otra",
              date_start: "2026-10-06",
              spend: "7",
            }),
          ],
        }),
      );
      await runSpendSync(app.db, NOON);
      const first = await spendRows();
      expect(first).toHaveLength(3);

      stubFetch(() =>
        json({
          data: [
            insightsRow({
              campaign_name: "Campaña Uno (renombrada)",
              date_start: "2026-10-05",
              spend: "130.25",
              account_currency: "USD",
            }),
          ],
        }),
      );
      await runSpendSync(app.db, NOON);

      const second = await spendRows();
      expect(second).toHaveLength(3);
      const byKey = Object.fromEntries(
        second.map((r) => [`${r.campaignId}@${r.spendDate}`, r]),
      );
      expect(byKey["c1@2026-10-05"].spend).toBe("130.25");
      expect(byKey["c1@2026-10-05"].campaignName).toBe(
        "Campaña Uno (renombrada)",
      );
      expect(byKey["c1@2026-10-05"].currency).toBe("USD");
      // Lo que Meta no devolvió esta vez queda como estaba.
      expect(byKey["c1@2026-10-06"].spend).toBe("50.00");
      expect(byKey["c9@2026-10-06"].spend).toBe("7.00");
      // Mismo id de fila: fue un update, no un delete + insert.
      expect(byKey["c1@2026-10-05"].id).toBe(
        first.find((r) => r.campaignId === "c1" && r.spendDate === "2026-10-05")
          ?.id,
      );
    });

    it("cada cuenta guarda su moneda tal cual (ARS, USD, EUR), sin convertir", async () => {
      configure({ META_AD_ACCOUNT_IDS: "act_111,222, 333" });
      stubFetch((c) => {
        const acc = c.url.pathname.split("/")[2];
        const currency =
          { act_111: "ARS", act_222: "USD", act_333: "EUR" }[acc] ?? "XXX";
        return json({
          data: [
            insightsRow({
              campaign_id: `camp-${acc}`,
              spend: "1000",
              account_currency: currency,
            }),
          ],
        });
      });

      await runSpendSync(app.db, NOON);

      const rows = await spendRows();
      expect(
        rows.map((r) => [r.accountId, r.currency, r.spend]).sort(),
      ).toEqual([
        ["111", "ARS", "1000.00"],
        ["222", "USD", "1000.00"],
        ["333", "EUR", "1000.00"],
      ]);
    });

    it("renglones inválidos (sin campaña, fecha o moneda, gasto no numérico) se saltean y se cuentan", async () => {
      stubFetch(() =>
        json({
          data: [
            insightsRow({ campaign_id: "ok" }),
            insightsRow({ campaign_id: undefined }),
            insightsRow({ campaign_id: "x2", spend: "mucho" }),
            insightsRow({ campaign_id: "x3", spend: "-5" }),
            insightsRow({ campaign_id: "x4", date_start: "ayer" }),
            insightsRow({ campaign_id: "x5", account_currency: "pesos" }),
            insightsRow({ campaign_id: "x6", account_currency: undefined }),
            insightsRow({ campaign_id: "x7", campaign_name: "  " }),
          ],
        }),
      );
      const service = new MetaSpendService(
        app.db,
        fakeLog() as unknown as FastifyBaseLogger,
      );
      const config = getMetaSpendConfig();
      if (!config) throw new Error("config esperada");

      const summary = await service.syncSpend(CTX, config, "2026-10-07");

      expect(summary).toEqual({
        accounts: 1,
        failedAccounts: 0,
        rows: 1,
        skippedRows: 7,
      });
      expect((await spendRows()).map((r) => r.campaignId)).toEqual(["ok"]);
    });

    it("una moneda en minúscula se guarda en mayúscula; el gasto con decimales largos se redondea a 2", async () => {
      stubFetch(() =>
        json({
          data: [insightsRow({ account_currency: "eur", spend: "12.3456" })],
        }),
      );
      await runSpendSync(app.db, NOON);
      const [row] = await spendRows();
      expect(row.currency).toBe("EUR");
      expect(row.spend).toBe("12.35");
    });
  });

  // ─── fallas ───────────────────────────────────────────────────────────────

  describe("una cuenta que falla no frena a las demás", () => {
    it("un 400 en la primera cuenta: la segunda se sincroniza y el token no sale en el log", async () => {
      configure({ META_AD_ACCOUNT_IDS: "111,222" });
      stubFetch((c) =>
        c.url.pathname.includes("act_111")
          ? json(
              {
                error: {
                  message: `Invalid OAuth access token ${TOKEN} (access_token=${TOKEN})`,
                },
              },
              400,
            )
          : json({ data: [insightsRow({ campaign_id: "de-222" })] }),
      );
      const log = fakeLog();
      const service = new MetaSpendService(
        app.db,
        log as unknown as FastifyBaseLogger,
      );
      const config = getMetaSpendConfig();
      if (!config) throw new Error("config esperada");

      const summary = await service.syncSpend(CTX, config, "2026-10-07");

      expect(summary).toMatchObject({
        accounts: 2,
        failedAccounts: 1,
        rows: 1,
      });
      expect((await spendRows()).map((r) => r.campaignId)).toEqual(["de-222"]);
      expect(log.error).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify([
        log.info.mock.calls,
        log.warn.mock.calls,
        log.error.mock.calls,
      ]);
      expect(logged).not.toContain(TOKEN);
      expect(logged).toContain("Invalid OAuth access token");
      expect(logged).toContain("111");
    });

    it("un error de red con el token en el mensaje tampoco lo filtra", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new TypeError(`fetch failed ${TOKEN}`);
        }),
      );
      const log = fakeLog();
      const service = new MetaSpendService(
        app.db,
        log as unknown as FastifyBaseLogger,
      );
      const config = getMetaSpendConfig();
      if (!config) throw new Error("config esperada");
      const summary = await service.syncSpend(CTX, config, "2026-10-07");
      expect(summary.failedAccounts).toBe(1);
      expect(JSON.stringify(log.error.mock.calls)).not.toContain(TOKEN);
    });

    it("el mensaje de error de Meta se recorta a 500 caracteres antes de loguearse", async () => {
      stubFetch(() => json({ error: { message: "x".repeat(5000) } }, 400));
      const log = fakeLog();
      const service = new MetaSpendService(
        app.db,
        log as unknown as FastifyBaseLogger,
      );
      const config = getMetaSpendConfig();
      if (!config) throw new Error("config esperada");
      await service.syncSpend(CTX, config, "2026-10-07");
      const logged = log.error.mock.calls[0][0] as { err: string };
      expect(logged.err.length).toBeLessThanOrEqual(500);
      expect(logged.err.length).toBeGreaterThan(400);
    });

    it("la consulta lleva timeout (un Meta colgado no cuelga el job)", async () => {
      const signals: boolean[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string | URL, init?: RequestInit) => {
          signals.push(init?.signal instanceof AbortSignal);
          return json({ data: [] });
        }),
      );
      await runSpendSync(app.db, NOON);
      expect(signals).toEqual([true]);
    });

    it("una respuesta que no es JSON es un error de la cuenta, no un crash", async () => {
      stubFetch(() => new Response("<html>gateway</html>", { status: 200 }));
      await expect(runSpendSync(app.db, NOON)).resolves.toBeUndefined();
      expect(await spendRows()).toHaveLength(0);
    });
  });

  // ─── tenancy ──────────────────────────────────────────────────────────────

  describe("aislamiento por gimnasio y módulo templo-marketing", () => {
    it("un gimnasio sin el módulo no se procesa; con él, sus filas llevan SU tenant", async () => {
      await seedSecondTenant(app);
      await setModuleFlag(app, TENANT_DOS, "templo-marketing", false);
      const calls = stubFetch(() => json({ data: [insightsRow()] }));

      await runSpendSync(app.db, NOON);

      expect(calls).toHaveLength(1);
      expect(await spendRows(CTX)).toHaveLength(1);
      expect(await spendRows(CTX_DOS)).toHaveLength(0);

      await setModuleFlag(app, TENANT_DOS, "templo-marketing", true);
      await runSpendSync(app.db, NOON);

      expect(calls).toHaveLength(3);
      const dos = await spendRows(CTX_DOS);
      expect(dos).toHaveLength(1);
      expect(dos[0].tenantId).toBe(TENANT_DOS);
      expect(await spendRows(CTX)).toHaveLength(1);
      // La unique es por gimnasio: la misma campaña convive en los dos.
      expect(dos[0].campaignId).toBe((await spendRows(CTX))[0].campaignId);
    });
  });
});
