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
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  MetaCapiService,
  MAX_ATTEMPTS,
} from "../../src/modules/marketing/meta/capi-service";
import { getMetaCapiConfig } from "../../src/modules/marketing/meta/config";
import { sha256Hex } from "../../src/modules/marketing/meta/hash";
import type { CapiEvent } from "../../src/modules/marketing/meta/capi-builder";
import { runCapiSweep, runPiiPurge } from "../../src/jobs/marketing-meta";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  limpiarSegundoGimnasio,
  seedSecondTenant,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { setModuleFlag } from "../fixtures/module-flags";

const CTX = { tenantId: TENANT_TEMPLO };
const CTX_DOS = { tenantId: TENANT_DOS };

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
/** Sin milisegundos: las columnas timestamp de MySQL guardan segundos. */
const NOW = new Date(Math.floor(Date.now() / 1000) * 1000);
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const TOKEN = "EAAB-super-secret-token-195";
const PIXEL = "999000111222";
const ES_CODE = "ES195CAPI";

// Vectores calculados por fuera del código (python hashlib).
const H_PHONE_AR =
  "2ba6f5dd98125761418c65c6383b27df04888d408d04206e5b7fbadc2cce4021";
const H_COUNTRY_AR =
  "ab5b62081b1d305e78d0daadb2cd23470b3faeb65af7370627798b7219ea2061";

interface MetaCall {
  url: string;
  body: {
    data: CapiEvent[];
    access_token?: string;
    test_event_code?: string;
  };
  hasTimeout: boolean;
}

interface UserOrigin {
  platform: string;
  createdAt?: Date;
  ip?: string | null;
  ua?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  branchId?: number | null;
}

/**
 * Fase 195-08 (D-19/D-24/D-25): CAPI como outbox derivado por job. `fetch` va
 * siempre mockeado con `vi.stubGlobal`: este archivo NUNCA llama a Meta.
 */
describe("Meta CAPI — outbox derivado, exclusiones y envío", () => {
  let app: FastifyInstance;
  let branchId: number;
  let esBranchId: number;
  let planId: number;
  let scheduleId: number;
  let esScheduleId: number;
  let gym2: SegundoGimnasio | null = null;
  let seq = 0;

  beforeAll(async () => {
    app = await createTestApp();
    const [b] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.code, "TEST"),
          tenantWhere(schema.branches, CTX),
        ),
      );
    branchId = b.id;
    await app.db
      .delete(schema.branches)
      .where(
        and(
          eq(schema.branches.code, ES_CODE),
          tenantWhere(schema.branches, CTX),
        ),
      );
    const [es] = await app.db
      .insert(schema.branches)
      .values(
        tenantValues(CTX, {
          name: "Sede ES CAPI 195",
          code: ES_CODE,
          country: "ES",
          isVirtual: false,
          isActive: true,
        }),
      )
      .$returningId();
    esBranchId = es.id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await cleanAllTestData(app);
    await cleanGym2();
    await app.db
      .delete(schema.branches)
      .where(
        and(
          eq(schema.branches.code, ES_CODE),
          tenantWhere(schema.branches, CTX),
        ),
      );
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await cleanGym2();
    gym2 = null;
    configure();

    const [activity] = await app.db
      .insert(schema.activities)
      .values(tenantValues(CTX, { name: `Act CAPI ${seq++}`, isActive: true }))
      .$returningId();
    const mkSchedule = async (branch: number) => {
      const [s] = await app.db
        .insert(schema.schedules)
        .values(
          tenantValues(CTX, {
            branchId: branch,
            activityId: activity.id,
            dayOfWeek: 1,
            startTime: "10:00",
            endTime: "11:00",
            isActive: true,
          }),
        )
        .$returningId();
      return s.id;
    };
    scheduleId = await mkSchedule(branchId);
    esScheduleId = await mkSchedule(esBranchId);
    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values(
        tenantValues(CTX, {
          name: `Plan CAPI ${seq++}`,
          planTier: "flex" as const,
          bookingMode: "flexible" as const,
          planCategory: "presencial" as const,
          priceRegular: 15000,
          priceZero: 10000,
          durationDays: 30,
          classesPerWeek: 3,
        }),
      )
      .$returningId();
    planId = plan.id;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // ─── helpers ──────────────────────────────────────────────────────────────

  async function cleanGym2(): Promise<void> {
    // `limpiarSegundoGimnasio` borra users (el outbox y la atribución caen en
    // cascada) y tenants; `ad_spend_daily` solo tiene FK a tenants.
    await app.db
      .delete(schema.adSpendDaily)
      .where(tenantWhere(schema.adSpendDaily, CTX_DOS));
    await limpiarSegundoGimnasio(app);
  }

  function configure(env: Record<string, string> = {}): void {
    const all: Record<string, string> = {
      META_ACCESS_TOKEN: TOKEN,
      META_PIXEL_ID: PIXEL,
      META_CAPI_START_AT: ago(30 * DAY).toISOString(),
      META_AD_ACCOUNT_IDS: "",
      META_GRAPH_VERSION: "",
      META_CAPI_TEST_EVENT_CODE: "",
      ...env,
    };
    for (const [k, v] of Object.entries(all)) vi.stubEnv(k, v);
  }

  /** Mockea fetch; por defecto Meta responde 200. Devuelve las llamadas capturadas. */
  function stubMeta(
    handler?: (call: MetaCall) => Response | Promise<Response>,
  ): MetaCall[] {
    const calls: MetaCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const call: MetaCall = {
          url: String(url),
          body: JSON.parse(String(init?.body ?? "{}")) as MetaCall["body"],
          hasTimeout: init?.signal instanceof AbortSignal,
        };
        calls.push(call);
        return handler
          ? handler(call)
          : new Response(
              JSON.stringify({ events_received: call.body.data.length }),
              { status: 200 },
            );
      }),
    );
    return calls;
  }

  const eventsOf = (calls: MetaCall[]): CapiEvent[] =>
    calls.flatMap((c) => c.body.data);

  async function makeUser(
    opts: {
      branch?: number;
      phone?: string | null;
      origin?: UserOrigin | null;
      tenant?: { tenantId: number };
    } = {},
  ): Promise<{ id: number; email: string }> {
    const ctx = opts.tenant ?? CTX;
    const tag = `${Date.now().toString(36)}${seq++}`;
    const branch = opts.branch ?? branchId;
    const email = `Capi-${tag}@Test.com`;
    const m = await createTestMember(app, {
      email,
      branchId: branch,
      ...(ctx.tenantId !== TENANT_TEMPLO ? { tenantId: ctx.tenantId } : {}),
    });
    await app.db
      .update(schema.users)
      .set({ phone: opts.phone === undefined ? "0223 582-0521" : opts.phone })
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, m.id)));
    // `register` ya dejó su fila de origen ('unknown'): se reemplaza por la pedida.
    await app.db
      .delete(schema.signupAttributions)
      .where(
        and(
          tenantWhere(schema.signupAttributions, ctx),
          eq(schema.signupAttributions.userId, m.id),
        ),
      );
    const origin =
      opts.origin === undefined
        ? ({ platform: "web" } as UserOrigin)
        : opts.origin;
    if (origin !== null) {
      await app.db.insert(schema.signupAttributions).values(
        tenantValues(ctx, {
          userId: m.id,
          branchId: origin.branchId === undefined ? branch : origin.branchId,
          channel: "directo",
          platform: origin.platform,
          capturedVia: "register" as const,
          createdAt: origin.createdAt ?? ago(HOUR),
          clientIp: origin.ip === undefined ? "203.0.113.7" : origin.ip,
          userAgent: origin.ua === undefined ? "Mozilla/5.0 (Test)" : origin.ua,
          fbc: origin.fbc ?? null,
          fbp: origin.fbp ?? null,
        }),
      );
    }
    return { id: m.id, email };
  }

  async function addTrial(
    userId: number,
    at: Date,
    over: {
      status?: "reservado" | "cancelado" | "confirmado";
      isTrial?: boolean;
      schedule?: number;
    } = {},
  ): Promise<number> {
    const [b] = await app.db
      .insert(schema.bookings)
      .values(
        tenantValues(CTX, {
          memberId: userId,
          scheduleId: over.schedule ?? scheduleId,
          bookingDate: at.toISOString().slice(0, 10),
          status: over.status ?? "reservado",
          bookedAt: at,
          isTrial: over.isTrial ?? true,
        }),
      )
      .$returningId();
    return b.id;
  }

  async function addSub(
    userId: number,
    at: Date,
    over: {
      pricePaid?: number;
      priceTypeApplied?: "regular" | "zero" | "credit_card";
      currency?: string;
      branch?: number;
    } = {},
  ): Promise<number> {
    const [s] = await app.db
      .insert(schema.subscriptions)
      .values(
        tenantValues(CTX, {
          userId,
          planId,
          branchId: over.branch ?? branchId,
          status: "active" as const,
          startDate: at.toISOString().slice(0, 10),
          pricePaid: over.pricePaid ?? 45000,
          currency: over.currency ?? "ARS",
          priceTypeApplied: over.priceTypeApplied ?? ("regular" as const),
          createdAt: at,
        }),
      )
      .$returningId();
    return s.id;
  }

  async function outbox(ctx = CTX) {
    return app.db
      .select()
      .from(schema.metaCapiEvents)
      .where(tenantWhere(schema.metaCapiEvents, ctx))
      .orderBy(schema.metaCapiEvents.id);
  }

  async function statusOf(
    eventId: string,
    ctx = CTX,
  ): Promise<string | undefined> {
    const rows = await app.db
      .select({ status: schema.metaCapiEvents.status })
      .from(schema.metaCapiEvents)
      .where(
        and(
          tenantWhere(schema.metaCapiEvents, ctx),
          eq(schema.metaCapiEvents.eventId, eventId),
        ),
      );
    return rows[0]?.status;
  }

  async function attributionOf(userId: number, ctx = CTX) {
    const rows = await app.db
      .select()
      .from(schema.signupAttributions)
      .where(
        and(
          tenantWhere(schema.signupAttributions, ctx),
          eq(schema.signupAttributions.userId, userId),
        ),
      );
    return rows[0];
  }

  const sweep = () => runCapiSweep(app.db, NOW);

  // ─── sin credenciales ─────────────────────────────────────────────────────

  describe("sin credenciales o sin fecha de activación es un no-op", () => {
    it.each([
      ["sin token", { META_ACCESS_TOKEN: "" }],
      ["sin pixel", { META_PIXEL_ID: "" }],
      ["sin META_CAPI_START_AT", { META_CAPI_START_AT: "" }],
      ["con START_AT inválida", { META_CAPI_START_AT: "no-es-fecha" }],
    ])("%s: no llama a Meta ni escribe el outbox", async (_n, env) => {
      configure(env);
      const calls = stubMeta();
      const u = await makeUser();
      await addTrial(u.id, ago(HOUR));
      await addSub(u.id, ago(HOUR));

      await sweep();

      expect(calls).toHaveLength(0);
      expect(await outbox()).toHaveLength(0);
    });
  });

  // ─── camino feliz ─────────────────────────────────────────────────────────

  describe("derivación y envío", () => {
    it("registro web AR + prueba + primer pago: 3 filas, un POST con 3 eventos hasheados", async () => {
      const calls = stubMeta();
      const u = await makeUser({
        origin: {
          platform: "web",
          createdAt: ago(3 * HOUR),
          fbc: "fb.1.1759999999999.AbCdEf",
          fbp: "fb.1.1759999999999.123",
        },
      });
      const bookingId = await addTrial(u.id, ago(2 * HOUR));
      const subId = await addSub(u.id, ago(HOUR), {
        pricePaid: 45000,
        currency: "ARS",
      });

      await sweep();

      const rows = await outbox();
      expect(rows.map((r) => r.eventId).sort()).toEqual(
        [`reg-${u.id}`, `trial-${bookingId}`, `purchase-${subId}`].sort(),
      );
      expect(rows.every((r) => r.status === "sent" && r.attempts === 1)).toBe(
        true,
      );
      expect(rows.every((r) => r.sentAt !== null)).toBe(true);
      expect(rows.every((r) => r.tenantId === TENANT_TEMPLO)).toBe(true);

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(
        `https://graph.facebook.com/v26.0/${PIXEL}/events`,
      );
      expect(calls[0].body.access_token).toBe(TOKEN);
      expect(calls[0].body.test_event_code).toBeUndefined();
      // Siempre con timeout: un Meta colgado no cuelga el job.
      expect(calls[0].hasTimeout).toBe(true);
      const byName = Object.fromEntries(
        calls[0].body.data.map((e) => [e.event_name, e]),
      );
      expect(Object.keys(byName).sort()).toEqual([
        "CompleteRegistration",
        "Purchase",
        "Schedule",
      ]);

      const reg = byName.CompleteRegistration;
      expect(reg.event_id).toBe(`reg-${u.id}`);
      expect(reg.action_source).toBe("website");
      expect(reg.event_source_url).toBe("https://app.eltemplo.org/register");
      expect(reg.user_data.client_ip_address).toBe("203.0.113.7");
      expect(reg.user_data.client_user_agent).toBe("Mozilla/5.0 (Test)");
      expect(reg.user_data.fbc).toBe("fb.1.1759999999999.AbCdEf");
      expect(reg.user_data.fbp).toBe("fb.1.1759999999999.123");

      const trial = byName.Schedule;
      expect(trial.event_id).toBe(`trial-${bookingId}`);
      expect(trial.action_source).toBe("system_generated");
      // IP y user agent solo viajan en el registro web.
      expect(trial.user_data.client_ip_address).toBeUndefined();
      expect(trial.user_data.client_user_agent).toBeUndefined();

      const purchase = byName.Purchase;
      expect(purchase.event_id).toBe(`purchase-${subId}`);
      expect(purchase.action_source).toBe("physical_store");
      expect(purchase.custom_data).toEqual({ value: 45000, currency: "ARS" });
      expect(purchase.event_time).toBe(Math.floor(ago(HOUR).getTime() / 1000));

      // Hash SHA-256 del email normalizado + teléfono AR + country + external_id.
      for (const e of [reg, trial, purchase]) {
        expect(e.user_data.em).toEqual([sha256Hex(u.email.toLowerCase())]);
        expect(e.user_data.ph).toEqual([H_PHONE_AR]);
        expect(e.user_data.country).toEqual([H_COUNTRY_AR]);
        expect(e.user_data.external_id).toEqual([
          sha256Hex(`${TENANT_TEMPLO}:${u.id}`),
        ]);
      }
      // Nada en claro: ni el email ni el teléfono salen en el body.
      const raw = JSON.stringify(calls[0].body);
      expect(raw).not.toContain(u.email);
      expect(raw.toLowerCase()).not.toContain(u.email.toLowerCase());
      expect(raw).not.toContain("0223 582-0521");
      expect(raw).not.toContain("5492235820521");
    });

    it("con META_CAPI_TEST_EVENT_CODE lo manda en el body; sin él, no", async () => {
      configure({ META_CAPI_TEST_EVENT_CODE: "TEST777" });
      const calls = stubMeta();
      const u = await makeUser();
      await addTrial(u.id, ago(HOUR));

      await sweep();

      expect(calls[0].body.test_event_code).toBe("TEST777");
    });

    it("META_GRAPH_VERSION cambia la versión de la URL", async () => {
      configure({ META_GRAPH_VERSION: "v27.0" });
      const calls = stubMeta();
      await makeUser();
      await sweep();
      expect(calls[0].url).toBe(
        `https://graph.facebook.com/v27.0/${PIXEL}/events`,
      );
    });

    it("correr el barrido dos veces no duplica filas ni reenvía lo ya enviado", async () => {
      const calls = stubMeta();
      const u = await makeUser();
      await addTrial(u.id, ago(2 * HOUR));
      await addSub(u.id, ago(HOUR));

      await sweep();
      const first = await outbox();
      await sweep();
      const second = await outbox();

      expect(first).toHaveLength(3);
      expect(second).toHaveLength(3);
      expect(calls).toHaveLength(1);
      expect(second.map((r) => [r.id, r.status, r.attempts])).toEqual(
        first.map((r) => [r.id, r.status, r.attempts]),
      );
    });

    it("un evento nuevo después del primer barrido sale solo (sin reenviar el anterior)", async () => {
      const calls = stubMeta();
      const u = await makeUser();
      await sweep();
      const bookingId = await addTrial(u.id, ago(60 * 1000));
      await sweep();

      expect(calls).toHaveLength(2);
      expect(calls[1].body.data.map((e) => e.event_id)).toEqual([
        `trial-${bookingId}`,
      ]);
    });

    it("teléfono ambiguo: el evento viaja sin `ph`; sin teléfono, igual", async () => {
      const calls = stubMeta();
      const a = await makeUser({ phone: "223 15 582 0521" });
      const b = await makeUser({ phone: null });
      await sweep();

      const events = eventsOf(calls);
      expect(events).toHaveLength(2);
      for (const e of events) {
        expect(e.user_data.ph).toBeUndefined();
        expect(e.user_data.em).toHaveLength(1);
      }
      expect(events.map((e) => e.event_id).sort()).toEqual(
        [`reg-${a.id}`, `reg-${b.id}`].sort(),
      );
    });

    it("origen android y admin: system_generated, sin URL ni IP/UA aunque estuvieran guardados", async () => {
      const calls = stubMeta();
      const a = await makeUser({ origin: { platform: "android" } });
      const d = await makeUser({ origin: { platform: "admin" } });
      await sweep();

      for (const e of eventsOf(calls)) {
        expect(e.action_source).toBe("system_generated");
        expect(e.event_source_url).toBeUndefined();
        expect(e.user_data.client_ip_address).toBeUndefined();
        expect(e.user_data.client_user_agent).toBeUndefined();
      }
      expect(
        eventsOf(calls)
          .map((e) => e.event_id)
          .sort(),
      ).toEqual([`reg-${a.id}`, `reg-${d.id}`].sort());
    });

    it("registro web sin user agent baja a system_generated (website lo exige)", async () => {
      const calls = stubMeta();
      await makeUser({ origin: { platform: "web", ua: null } });
      await sweep();
      expect(eventsOf(calls)[0].action_source).toBe("system_generated");
      expect(eventsOf(calls)[0].event_source_url).toBeUndefined();
    });

    it("lotes de 100: 250 pendientes salen en 3 POST", async () => {
      const calls = stubMeta();
      const u = await makeUser();
      // Se siembra el outbox directo (una fila por evento): lo que se prueba es el lote.
      await app.db.insert(schema.metaCapiEvents).values(
        Array.from({ length: 250 }, (_, i) =>
          tenantValues(CTX, {
            eventId: `trial-${900000 + i}`,
            eventName: "Schedule",
            userId: u.id,
            entityType: "trial_booking",
            entityId: 900000 + i,
            actionSource: "system_generated",
            eventTime: ago(HOUR),
            status: "pending",
          }),
        ),
      );

      await sweep();

      const sizes = calls.map((c) => c.body.data.length).sort((a, b) => b - a);
      // 250 sembrados + el registro derivado = 251 eventos.
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(251);
      expect(sizes).toEqual([100, 100, 51]);
      expect((await outbox()).every((r) => r.status === "sent")).toBe(true);
    });
  });

  // ─── exclusiones ──────────────────────────────────────────────────────────

  describe("exclusiones (D-24 iOS/unknown, D-25 España)", () => {
    it("iOS, plataforma desconocida y sin fila de origen: skipped_* y nada llega a Meta", async () => {
      const calls = stubMeta();
      const ios = await makeUser({ origin: { platform: "ios" } });
      const unk = await makeUser({ origin: { platform: "unknown" } });
      const none = await makeUser({ origin: null });
      const ok = await makeUser({ origin: { platform: "web" } });
      for (const u of [ios, unk, none, ok]) {
        await addTrial(u.id, ago(2 * HOUR));
        await addSub(u.id, ago(HOUR));
      }

      await sweep();

      const rows = await outbox();
      const forUser = (id: number) => rows.filter((r) => r.userId === id);
      expect(forUser(ios.id).map((r) => r.status)).toEqual([
        "skipped_ios",
        "skipped_ios",
        "skipped_ios",
      ]);
      expect(
        forUser(unk.id).every((r) => r.status === "skipped_no_origin"),
      ).toBe(true);
      expect(forUser(unk.id)).toHaveLength(3);
      // Sin fila de origen: solo hay trial y purchase (no hay registro que derivar).
      expect(
        forUser(none.id)
          .map((r) => r.status)
          .sort(),
      ).toEqual(["skipped_no_origin", "skipped_no_origin"]);
      expect(forUser(ok.id).every((r) => r.status === "sent")).toBe(true);

      // Lo excluido no llega al body: solo viajan los 3 eventos del usuario válido.
      const sent = eventsOf(calls);
      expect(sent).toHaveLength(3);
      const externalIds = sent.map((e) => e.user_data.external_id?.[0]);
      expect(new Set(externalIds)).toEqual(
        new Set([sha256Hex(`${TENANT_TEMPLO}:${ok.id}`)]),
      );
      const raw = JSON.stringify(calls.map((c) => c.body));
      for (const u of [ios, unk, none]) {
        expect(raw).not.toContain(sha256Hex(`${TENANT_TEMPLO}:${u.id}`));
      }
    });

    it("usuario de una sede de España: skipped_es en registro, prueba y pago", async () => {
      const calls = stubMeta();
      const es = await makeUser({
        branch: esBranchId,
        origin: { platform: "web", branchId: esBranchId },
      });
      await addTrial(es.id, ago(2 * HOUR), { schedule: esScheduleId });
      await addSub(es.id, ago(HOUR), { branch: esBranchId, currency: "EUR" });

      await sweep();

      const rows = await outbox();
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.status === "skipped_es")).toBe(true);
      expect(calls).toHaveLength(0);
    });

    it("alumno argentino con alta en sede de España: skipped_es por la sede de la atribución", async () => {
      const calls = stubMeta();
      const u = await makeUser({
        origin: { platform: "web", branchId: esBranchId },
      });
      await sweep();
      expect(await statusOf(`reg-${u.id}`)).toBe("skipped_es");
      expect(calls).toHaveLength(0);
    });

    it("alumno argentino que reserva la prueba o paga en una sede de España: solo ese evento queda afuera", async () => {
      const calls = stubMeta();
      const u = await makeUser();
      const trialEs = await addTrial(u.id, ago(2 * HOUR), {
        schedule: esScheduleId,
      });
      const subEs = await addSub(u.id, ago(HOUR), { branch: esBranchId });

      await sweep();

      expect(await statusOf(`trial-${trialEs}`)).toBe("skipped_es");
      expect(await statusOf(`purchase-${subEs}`)).toBe("skipped_es");
      expect(await statusOf(`reg-${u.id}`)).toBe("sent");
      expect(eventsOf(calls).map((e) => e.event_id)).toEqual([`reg-${u.id}`]);
    });

    it("el alumno se muda a España después de derivar: al enviar queda skipped_es", async () => {
      const calls = stubMeta();
      const u = await makeUser();
      const service = new MetaCapiService(app.db, {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as FastifyBaseLogger);
      const config = getMetaCapiConfig();
      if (!config) throw new Error("config esperada");
      await service.deriveCandidates(CTX, config, NOW);
      expect(await statusOf(`reg-${u.id}`)).toBe("pending");

      await app.db
        .update(schema.users)
        .set({ branchId: esBranchId })
        .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, u.id)));
      await service.sendPending(CTX, config, NOW);

      expect(await statusOf(`reg-${u.id}`)).toBe("skipped_es");
      expect(calls).toHaveLength(0);
    });
  });

  // ─── fecha de activación y ventana ────────────────────────────────────────

  describe("META_CAPI_START_AT y ventana de Meta", () => {
    it("lo anterior a START_AT no se deriva", async () => {
      configure({ META_CAPI_START_AT: ago(HOUR).toISOString() });
      const calls = stubMeta();
      const old = await makeUser({
        origin: { platform: "web", createdAt: ago(2 * HOUR) },
      });
      await addTrial(old.id, ago(2 * HOUR));
      await addSub(old.id, ago(2 * HOUR));
      const fresh = await makeUser({
        origin: { platform: "web", createdAt: ago(60 * 1000) },
      });

      await sweep();

      const rows = await outbox();
      expect(rows.map((r) => r.eventId)).toEqual([`reg-${fresh.id}`]);
      expect(calls).toHaveLength(1);
    });

    it("START_AT en el borde: un evento exactamente en START_AT sí se deriva", async () => {
      const edge = ago(2 * HOUR);
      configure({ META_CAPI_START_AT: edge.toISOString() });
      stubMeta();
      const u = await makeUser({
        origin: { platform: "web", createdAt: edge },
      });
      await sweep();
      expect(await statusOf(`reg-${u.id}`)).toBe("sent");
    });

    it("un Schedule o un registro de hace más de 7 días: skipped_window (no viajan); un pago de hace 10 días sí (physical_store, 62)", async () => {
      const calls = stubMeta();
      const u = await makeUser({
        origin: { platform: "web", createdAt: ago(8 * DAY) },
      });
      const trial = await addTrial(u.id, ago(10 * DAY));
      const sub = await addSub(u.id, ago(10 * DAY));

      await sweep();

      expect(await statusOf(`reg-${u.id}`)).toBe("skipped_window");
      expect(await statusOf(`trial-${trial}`)).toBe("skipped_window");
      expect(await statusOf(`purchase-${sub}`)).toBe("sent");
      expect(eventsOf(calls).map((e) => e.event_name)).toEqual(["Purchase"]);
    });

    it("un pago de hace más de 62 días no se deriva aunque START_AT sea anterior", async () => {
      configure({ META_CAPI_START_AT: ago(120 * DAY).toISOString() });
      const calls = stubMeta();
      const u = await makeUser({
        origin: { platform: "web", createdAt: ago(100 * DAY) },
      });
      await addSub(u.id, ago(70 * DAY));

      await sweep();

      expect(await outbox()).toHaveLength(0);
      expect(calls).toHaveLength(0);
    });

    it("al enviar re-chequea la ventana: un pendiente que venció queda skipped_window", async () => {
      const calls = stubMeta();
      const u = await makeUser();
      await app.db.insert(schema.metaCapiEvents).values(
        tenantValues(CTX, {
          eventId: `trial-777001`,
          eventName: "Schedule",
          userId: u.id,
          entityType: "trial_booking",
          entityId: 777001,
          actionSource: "system_generated",
          eventTime: ago(8 * DAY),
          status: "pending",
        }),
      );
      await sweep();
      expect(await statusOf("trial-777001")).toBe("skipped_window");
      expect(eventsOf(calls).map((e) => e.event_id)).toEqual([`reg-${u.id}`]);
    });
  });

  // ─── criterio de cada evento ──────────────────────────────────────────────

  describe("criterio de cada evento", () => {
    it("una reserva cancelada o que no es de prueba no genera Schedule", async () => {
      stubMeta();
      const u = await makeUser();
      // Fechas distintas: hay unique (socio, horario, fecha).
      await addTrial(u.id, ago(HOUR), { status: "cancelado" });
      await addTrial(u.id, ago(HOUR + DAY), { isTrial: false });
      const ok = await addTrial(u.id, ago(HOUR + 2 * DAY), {
        status: "confirmado",
      });

      await sweep();

      const trials = (await outbox()).filter(
        (r) => r.entityType === "trial_booking",
      );
      expect(trials.map((r) => r.eventId)).toEqual([`trial-${ok}`]);
    });

    it("la segunda suscripción paga no genera otro Purchase", async () => {
      stubMeta();
      const u = await makeUser();
      const first = await addSub(u.id, ago(3 * HOUR));
      await addSub(u.id, ago(HOUR));

      await sweep();

      const purchases = (await outbox()).filter(
        (r) => r.entityType === "subscription",
      );
      expect(purchases.map((r) => r.eventId)).toEqual([`purchase-${first}`]);
    });

    it("priceTypeApplied 'zero' o pricePaid 0 no cuentan: el primer pago real es el Purchase", async () => {
      stubMeta();
      const u = await makeUser();
      await addSub(u.id, ago(5 * HOUR), {
        priceTypeApplied: "zero",
        pricePaid: 10000,
      });
      await addSub(u.id, ago(4 * HOUR), { pricePaid: 0 });
      const real = await addSub(u.id, ago(HOUR), {
        pricePaid: 30000,
        priceTypeApplied: "credit_card",
      });

      await sweep();

      const purchases = (await outbox()).filter(
        (r) => r.entityType === "subscription",
      );
      expect(purchases.map((r) => r.eventId)).toEqual([`purchase-${real}`]);
    });

    it("si el primer pago fue ANTES de START_AT, un pago posterior no es 'el primero'", async () => {
      configure({ META_CAPI_START_AT: ago(2 * HOUR).toISOString() });
      stubMeta();
      const u = await makeUser();
      await addSub(u.id, ago(10 * DAY));
      await addSub(u.id, ago(HOUR));

      await sweep();

      expect(
        (await outbox()).filter((r) => r.entityType === "subscription"),
      ).toHaveLength(0);
    });

    it("misma marca de tiempo: gana el id más chico (un solo Purchase)", async () => {
      stubMeta();
      const u = await makeUser();
      const a = await addSub(u.id, ago(HOUR));
      await addSub(u.id, ago(HOUR));

      await sweep();

      const purchases = (await outbox()).filter(
        (r) => r.entityType === "subscription",
      );
      expect(purchases.map((r) => r.eventId)).toEqual([`purchase-${a}`]);
    });

    it("el valor del Purchase sale tal cual (EUR incluido) y la moneda también", async () => {
      const calls = stubMeta();
      const u = await makeUser();
      await addSub(u.id, ago(HOUR), { pricePaid: 70, currency: "EUR" });
      await sweep();
      const purchase = eventsOf(calls).find((e) => e.event_name === "Purchase");
      expect(purchase?.custom_data).toEqual({ value: 70, currency: "EUR" });
    });
  });

  // ─── fallas y reintentos ──────────────────────────────────────────────────

  describe("rechazo de Meta y reintentos", () => {
    it("un 400 deja el lote en 'failed' con attempts+1 y SIN el token en last_error; el siguiente barrido reintenta", async () => {
      let fail = true;
      const calls = stubMeta((call) =>
        fail
          ? new Response(
              JSON.stringify({
                error: {
                  message: `Invalid parameter (access_token=${TOKEN})`,
                },
              }),
              { status: 400 },
            )
          : new Response(
              JSON.stringify({ events_received: call.body.data.length }),
              {
                status: 200,
              },
            ),
      );
      const u = await makeUser();
      await addTrial(u.id, ago(HOUR));

      await sweep();

      let rows = await outbox();
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.status === "failed" && r.attempts === 1)).toBe(
        true,
      );
      for (const r of rows) {
        expect(r.lastError).toContain("400");
        expect(r.lastError).toContain("Invalid parameter");
        expect(r.lastError).not.toContain(TOKEN);
        expect(r.lastError).toContain("***");
        expect(r.sentAt).toBeNull();
      }

      fail = false;
      await sweep();
      rows = await outbox();
      expect(rows.every((r) => r.status === "sent" && r.attempts === 2)).toBe(
        true,
      );
      expect(rows.every((r) => r.lastError === null)).toBe(true);
      expect(calls).toHaveLength(2);
    });

    it("un error de red con el token en el mensaje también se guarda redactado", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new TypeError(
            `fetch failed for https://x?access_token=${TOKEN} y ${TOKEN}`,
          );
        }),
      );
      await makeUser();
      await sweep();
      const [row] = await outbox();
      expect(row.status).toBe("failed");
      expect(row.lastError).not.toContain(TOKEN);
      expect(row.lastError).toContain("Error de red");
    });

    it("el token no aparece en ningún log del servicio", async () => {
      stubMeta(
        () =>
          new Response(JSON.stringify({ error: { message: `bad ${TOKEN}` } }), {
            status: 400,
          }),
      );
      const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const service = new MetaCapiService(
        app.db,
        log as unknown as FastifyBaseLogger,
      );
      await makeUser();
      const config = getMetaCapiConfig();
      if (!config) throw new Error("config esperada");
      await service.deriveCandidates(CTX, config, NOW);
      await service.sendPending(CTX, config, NOW);

      expect(log.warn).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify([
        log.info.mock.calls,
        log.warn.mock.calls,
        log.error.mock.calls,
      ]);
      expect(logged).not.toContain(TOKEN);
      expect(logged).not.toContain("access_token");
    });

    it("se reintenta hasta attempts = 5 y ahí se deja de intentar", async () => {
      const calls = stubMeta();
      const u = await makeUser();
      await app.db.insert(schema.metaCapiEvents).values([
        tenantValues(CTX, {
          eventId: "trial-880001",
          eventName: "Schedule",
          userId: u.id,
          entityType: "trial_booking",
          entityId: 880001,
          actionSource: "system_generated",
          eventTime: ago(HOUR),
          status: "failed",
          attempts: MAX_ATTEMPTS - 1,
        }),
        tenantValues(CTX, {
          eventId: "trial-880002",
          eventName: "Schedule",
          userId: u.id,
          entityType: "trial_booking",
          entityId: 880002,
          actionSource: "system_generated",
          eventTime: ago(HOUR),
          status: "failed",
          attempts: MAX_ATTEMPTS,
        }),
      ]);

      await sweep();

      expect(eventsOf(calls).map((e) => e.event_id)).toContain("trial-880001");
      expect(eventsOf(calls).map((e) => e.event_id)).not.toContain(
        "trial-880002",
      );
      expect(await statusOf("trial-880001")).toBe("sent");
      expect(await statusOf("trial-880002")).toBe("failed");
    });

    it("si la entidad desapareció (pago borrado) la fila queda failed definitiva y no tira el lote", async () => {
      const calls = stubMeta();
      const u = await makeUser();
      await app.db.insert(schema.metaCapiEvents).values(
        tenantValues(CTX, {
          eventId: "purchase-770001",
          eventName: "Purchase",
          userId: u.id,
          entityType: "subscription",
          entityId: 770001,
          actionSource: "physical_store",
          eventTime: ago(HOUR),
          status: "pending",
        }),
      );

      await sweep();

      const [lost] = (await outbox()).filter(
        (r) => r.eventId === "purchase-770001",
      );
      expect(lost.status).toBe("failed");
      expect(lost.attempts).toBe(MAX_ATTEMPTS);
      expect(eventsOf(calls).map((e) => e.event_id)).toEqual([`reg-${u.id}`]);
    });
  });

  // ─── purga de IP / user agent ─────────────────────────────────────────────

  describe("purga de IP y user agent (T-195-30)", () => {
    it("después del envío la fila queda con IP y user agent NULL y pii_purged_at", async () => {
      stubMeta();
      const u = await makeUser();
      const before = await attributionOf(u.id);
      expect(before.clientIp).toBe("203.0.113.7");
      expect(before.userAgent).not.toBeNull();
      expect(before.piiPurgedAt).toBeNull();

      await sweep();

      const after = await attributionOf(u.id);
      expect(after.clientIp).toBeNull();
      expect(after.userAgent).toBeNull();
      expect(after.piiPurgedAt).not.toBeNull();
    });

    it("también se purga lo que se descartó (iOS, España): no se guarda PII de lo que nunca viaja", async () => {
      stubMeta();
      const ios = await makeUser({ origin: { platform: "ios" } });
      const es = await makeUser({
        branch: esBranchId,
        origin: { platform: "web", branchId: esBranchId },
      });
      await sweep();
      for (const u of [ios, es]) {
        const a = await attributionOf(u.id);
        expect(a.clientIp).toBeNull();
        expect(a.userAgent).toBeNull();
        expect(a.piiPurgedAt).not.toBeNull();
      }
    });

    it("si el registro falló (sigue pendiente de reintento) y es reciente, la IP se conserva", async () => {
      stubMeta(
        () =>
          new Response(JSON.stringify({ error: { message: "boom" } }), {
            status: 500,
          }),
      );
      const u = await makeUser();
      await sweep();
      expect(await statusOf(`reg-${u.id}`)).toBe("failed");
      const a = await attributionOf(u.id);
      expect(a.clientIp).toBe("203.0.113.7");
      expect(a.piiPurgedAt).toBeNull();
    });

    it("filas de más de 7 días se purgan aunque nunca se hayan enviado", async () => {
      stubMeta(
        () =>
          new Response(JSON.stringify({ error: { message: "boom" } }), {
            status: 500,
          }),
      );
      const old = await makeUser({
        origin: { platform: "web", createdAt: ago(7 * DAY + 60 * 1000) },
      });
      const edge = await makeUser({
        origin: { platform: "web", createdAt: ago(7 * DAY - 60 * 1000) },
      });

      await sweep();

      const o = await attributionOf(old.id);
      expect(o.clientIp).toBeNull();
      expect(o.piiPurgedAt).not.toBeNull();
      const e = await attributionOf(edge.id);
      expect(e.clientIp).toBe("203.0.113.7");
    });

    it("mientras el registro está pendiente de envío (derivado pero no enviado) la IP se conserva", async () => {
      const u = await makeUser();
      const service = new MetaCapiService(app.db, {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as FastifyBaseLogger);
      const config = getMetaCapiConfig();
      if (!config) throw new Error("config esperada");
      await service.deriveCandidates(CTX, config, NOW);
      expect(await statusOf(`reg-${u.id}`)).toBe("pending");

      await runPiiPurge(app.db, NOW);

      const a = await attributionOf(u.id);
      expect(a.clientIp).toBe("203.0.113.7");
      expect(a.piiPurgedAt).toBeNull();
    });

    it("que otro evento del alumno (la prueba) se haya enviado NO purga la IP si el registro sigue sin salir", async () => {
      const u = await makeUser();
      await app.db.insert(schema.metaCapiEvents).values([
        tenantValues(CTX, {
          eventId: `reg-${u.id}`,
          eventName: "CompleteRegistration",
          userId: u.id,
          entityType: "registration",
          entityId: u.id,
          actionSource: "website",
          eventTime: ago(HOUR),
          status: "failed",
          attempts: 1,
        }),
        tenantValues(CTX, {
          eventId: "trial-660001",
          eventName: "Schedule",
          userId: u.id,
          entityType: "trial_booking",
          entityId: 660001,
          actionSource: "system_generated",
          eventTime: ago(HOUR),
          status: "sent",
          attempts: 1,
        }),
      ]);

      await runPiiPurge(app.db, NOW);

      expect((await attributionOf(u.id)).clientIp).toBe("203.0.113.7");
    });

    it("la purga corre aunque Meta NO esté configurado (runPiiPurge no llama a Meta)", async () => {
      configure({
        META_ACCESS_TOKEN: "",
        META_PIXEL_ID: "",
        META_CAPI_START_AT: "",
      });
      const calls = stubMeta();
      const old = await makeUser({
        origin: { platform: "web", createdAt: ago(8 * DAY) },
      });
      const fresh = await makeUser({
        origin: { platform: "web", createdAt: ago(HOUR) },
      });

      await runPiiPurge(app.db, NOW);

      expect(calls).toHaveLength(0);
      expect((await attributionOf(old.id)).clientIp).toBeNull();
      expect((await attributionOf(old.id)).piiPurgedAt).not.toBeNull();
      expect((await attributionOf(fresh.id)).clientIp).toBe("203.0.113.7");
      expect(await outbox()).toHaveLength(0);
    });

    it("no vuelve a tocar filas ya purgadas (conserva su pii_purged_at)", async () => {
      stubMeta();
      const u = await makeUser();
      await sweep();
      const first = (await attributionOf(u.id)).piiPurgedAt;
      await runPiiPurge(app.db, new Date(NOW.getTime() + DAY));
      expect((await attributionOf(u.id)).piiPurgedAt?.getTime()).toBe(
        first?.getTime(),
      );
    });
  });

  // ─── tenancy ──────────────────────────────────────────────────────────────

  describe("aislamiento por gimnasio y módulo templo-marketing", () => {
    it("un gimnasio sin el módulo no se procesa; con el módulo, cada gimnasio solo ve lo suyo", async () => {
      gym2 = await seedSecondTenant(app);
      await setModuleFlag(app, TENANT_DOS, "templo-marketing", false);
      const calls = stubMeta();

      const mine = await makeUser();
      const other = await makeUser({ tenant: CTX_DOS, branch: gym2.branchId });

      await sweep();

      // Módulo apagado en el gimnasio 2: ni filas ni eventos de su alumno.
      expect(await outbox(CTX_DOS)).toHaveLength(0);
      expect((await outbox(CTX)).map((r) => r.eventId)).toEqual([
        `reg-${mine.id}`,
      ]);
      const raw = JSON.stringify(calls.map((c) => c.body));
      expect(raw).not.toContain(sha256Hex(`${TENANT_DOS}:${other.id}`));

      // Módulo encendido: sus datos entran, con SU tenant y sin cruzarse.
      await setModuleFlag(app, TENANT_DOS, "templo-marketing", true);
      await sweep();
      const dos = await outbox(CTX_DOS);
      expect(dos.map((r) => r.eventId)).toEqual([`reg-${other.id}`]);
      expect(dos.every((r) => r.tenantId === TENANT_DOS)).toBe(true);
      expect((await outbox(CTX)).map((r) => r.eventId)).toEqual([
        `reg-${mine.id}`,
      ]);
      // El external_id incluye el gimnasio: nunca se confunden dos alumnos con el mismo id.
      const ids = eventsOf(calls).map((e) => e.user_data.external_id?.[0]);
      expect(ids).toContain(sha256Hex(`${TENANT_TEMPLO}:${mine.id}`));
      expect(ids).toContain(sha256Hex(`${TENANT_DOS}:${other.id}`));
    });

    it("la purga también respeta el módulo: un gimnasio sin él conserva su fila", async () => {
      gym2 = await seedSecondTenant(app);
      await setModuleFlag(app, TENANT_DOS, "templo-marketing", false);
      const other = await makeUser({
        tenant: CTX_DOS,
        branch: gym2.branchId,
        origin: { platform: "web", createdAt: ago(30 * DAY) },
      });
      await runPiiPurge(app.db, NOW);
      expect((await attributionOf(other.id, CTX_DOS)).clientIp).toBe(
        "203.0.113.7",
      );
    });

    it("las filas del outbox llevan el tenant del gimnasio (nunca el default)", async () => {
      stubMeta();
      await makeUser();
      await sweep();
      const rows = await app.db
        .select({ tenantId: schema.metaCapiEvents.tenantId })
        .from(schema.metaCapiEvents)
        .where(
          inArray(schema.metaCapiEvents.tenantId, [TENANT_TEMPLO, TENANT_DOS]),
        );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.tenantId === TENANT_TEMPLO)).toBe(true);
    });
  });
});
