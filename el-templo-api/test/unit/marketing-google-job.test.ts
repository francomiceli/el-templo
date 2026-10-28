import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";

const schedule = vi.hoisted(() => vi.fn());
vi.mock("node-cron", () => ({ default: { schedule } }));

import { startMarketingGoogleJob } from "../../src/jobs/marketing-google";

/**
 * Fase 195-09: el scheduler del job de Google. Sin DB: `node-cron` va mockeado
 * para capturar qué se agenda (expresión y huso) según las credenciales.
 */
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA_B64 = Buffer.from(
  JSON.stringify({
    client_email: "sc@x.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  }),
).toString("base64");

// db que revienta ante cualquier uso: el scheduler no debe tocarla al agendar.
const fakeDb = {} as never;

function env(over: Record<string, string> = {}) {
  const all: Record<string, string> = {
    GOOGLE_SC_SERVICE_ACCOUNT_BASE64: "",
    GBP_SYNC_MODE: "off",
    GBP_OAUTH_CLIENT_ID: "",
    GBP_OAUTH_CLIENT_SECRET: "",
    GBP_REFRESH_TOKEN: "",
    ...over,
  };
  for (const [k, v] of Object.entries(all)) vi.stubEnv(k, v);
}

const GBP_ON = {
  GBP_SYNC_MODE: "dry-run",
  GBP_OAUTH_CLIENT_ID: "cid",
  GBP_OAUTH_CLIENT_SECRET: "csec",
  GBP_REFRESH_TOKEN: "rtok",
};

beforeEach(() => {
  schedule.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("startMarketingGoogleJob", () => {
  it("sin credenciales no agenda nada", () => {
    env();
    startMarketingGoogleJob(fakeDb);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("GBP en off aunque haya credenciales: no agenda GBP", () => {
    env({ ...GBP_ON, GBP_SYNC_MODE: "off" });
    startMarketingGoogleJob(fakeDb);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("solo Search Console: agenda los lunes 07:00 de Argentina", () => {
    env({ GOOGLE_SC_SERVICE_ACCOUNT_BASE64: SA_B64 });
    startMarketingGoogleJob(fakeDb);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][0]).toBe("0 7 * * 1");
    expect(schedule.mock.calls[0][2]).toEqual({
      timezone: "America/Argentina/Buenos_Aires",
    });
  });

  it("solo GBP: agenda todos los días 05:30 de Argentina", () => {
    env(GBP_ON);
    startMarketingGoogleJob(fakeDb);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][0]).toBe("30 5 * * *");
    expect(schedule.mock.calls[0][2]).toEqual({
      timezone: "America/Argentina/Buenos_Aires",
    });
  });

  it("ambos: agenda las dos tareas", () => {
    env({ GOOGLE_SC_SERVICE_ACCOUNT_BASE64: SA_B64, ...GBP_ON });
    startMarketingGoogleJob(fakeDb);
    expect(schedule.mock.calls.map((c) => c[0]).sort()).toEqual([
      "0 7 * * 1",
      "30 5 * * *",
    ]);
  });

  it("un tick que falla no rompe el proceso (try/catch en cada tick)", async () => {
    env({ GOOGLE_SC_SERVICE_ACCOUNT_BASE64: SA_B64, ...GBP_ON });
    startMarketingGoogleJob(fakeDb);
    for (const call of schedule.mock.calls) {
      const tick = call[1] as () => Promise<void>;
      await expect(tick()).resolves.toBeUndefined();
    }
  });
});

describe("cableado en index.ts", () => {
  it("importa y arranca el job con app.db", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../src/index.ts"),
      "utf8",
    );
    expect(source).toContain(
      'import { startMarketingGoogleJob } from "./jobs/marketing-google";',
    );
    expect(source).toMatch(/^\s+startMarketingGoogleJob\(app\.db\);$/m);
  });
});
