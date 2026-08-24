/**
 * Fase 176 Plan 06 (MOD-02) — semántica del registry de hooks probada contra
 * MySQL real: filters propagan, events aíslan, y un módulo apagado no corre.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ----------------------------
 * `src/modules/shared/hooks.ts` (176-06) define el contrato cerrado del doc
 * 04 §4: dos clases de hook con semánticas de error OPUESTAS. Un `try/catch`
 * de más adentro de `runFilter` sería un bug de cobro (T-176-07); un `throw`
 * sin atrapar dentro de `emit` tumbaría una operación principal por una
 * recompensa de racha caída (T-176-08). Este archivo prueba las dos
 * semánticas contra un `HookRegistry` real, no contra un mock del registry.
 *
 * EL TEST **NO** USA LA INSTANCIA DE PROCESO
 * -----------------------------------------------
 * Cada caso instancia `new HookRegistry()` propia. `hooks.ts` exporta además
 * una instancia de proceso (el registry que consumen `modules-boot.ts` y, a
 * término, `pricing.ts`/`StreakService`) y `vitest.config.ts` corre con
 * `isolate: false` (los módulos de Node, y por lo tanto esa instancia
 * compartida, se comparten entre TODOS los archivos de test del mismo
 * worker) — registrar handlers de prueba ahí contaminaría cualquier otro
 * archivo que la consuma más adelante en la fase (176-07/08/09/10). Este
 * archivo no importa ese símbolo en absoluto.
 *
 * QUÉ MÓDULO SE USA PARA "ON"/"OFF"
 * -------------------------------------
 * `"templo-gamification"` para el caso ON (se prende explícito con
 * `setModuleFlag`, no se asume el default de la migración 0209) y
 * `TENANT_DOS` (sin flags sembrados, fail-closed) para el caso OFF — el
 * mismo patrón que `mod-01-flags.test.ts`.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/mod-02-hooks.test.ts --hookTimeout=250000
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { FastifyBaseLogger } from "fastify";
import { createTestApp } from "../helpers";
import {
  HookRegistry,
  type HookCallCtx,
  type PricingAdjustCtx,
  type StreakMilestoneEvent,
} from "../../src/modules/shared/hooks";
import { TENANT_DOS, TENANT_TEMPLO } from "../fixtures/second-tenant";
import { setModuleFlag, restoreTemploFlags } from "../fixtures/module-flags";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

afterEach(async () => {
  await restoreTemploFlags(app);
});

// ─── Fixtures locales del archivo ───────────────────────────────────────────

/** Subclase propia — el caso 3 afirma la CLASE del error, no solo el mensaje. */
class FilterExplotoError extends Error {
  constructor(detalle: string) {
    super(detalle);
    this.name = "FilterExplotoError";
  }
}

/** Contexto de `pricing.adjust` con defaults razonables; overrides puntuales. */
function makeCtx(overrides: Partial<PricingAdjustCtx> = {}): PricingAdjustCtx {
  return {
    callSite: "assign",
    userId: 1,
    planId: 1,
    planCategory: "presencial",
    priceType: "regular",
    basePrice: 10000,
    price: 10000,
    priceLocked: null,
    commit: true,
    supports: { exclusiveBenefits: true, discounts: true },
    moduleInput: {},
    moduleOutput: {},
    applied: [],
    exclusive: false,
    resolvePriceType: async (t) => t,
    basePriceFor: () => 10000,
    ...overrides,
  };
}

function makeEvt(overrides: Partial<StreakMilestoneEvent> = {}): StreakMilestoneEvent {
  return {
    userId: 1,
    milestone: 7,
    streakDays: 7,
    ...overrides,
  };
}

/** Logger espía: solo `warn` importa a estos tests. */
function makeLogSpy(): { log: FastifyBaseLogger; warn: ReturnType<typeof vi.fn> } {
  const warn = vi.fn();
  const log = {
    warn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  } as unknown as FastifyBaseLogger;
  return { log, warn };
}

function makeHook(overrides: Partial<HookCallCtx> = {}): HookCallCtx {
  return {
    tenantId: TENANT_TEMPLO,
    db: app.db,
    log: app.log,
    ...overrides,
  };
}

describe("MOD-02 — registry de hooks: filters propagan, events aíslan", () => {
  it("filter con módulo ON corre una vez y la mutación de ctx.price se ve en el caller", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", true);
    const registry = new HookRegistry();
    let calls = 0;
    registry.setFilter("templo-gamification", "pricing.adjust", async (ctx) => {
      calls++;
      ctx.price -= 1000;
    });

    const ctx = makeCtx({ price: 10000 });
    await registry.runFilter("pricing.adjust", makeHook(), ctx);

    expect(calls).toBe(1);
    expect(ctx.price).toBe(9000);
  });

  it("filter con módulo OFF (TENANT_DOS) NO corre y ctx.price queda intacto", async () => {
    const registry = new HookRegistry();
    let calls = 0;
    registry.setFilter("templo-gamification", "pricing.adjust", async (ctx) => {
      calls++;
      ctx.price -= 1000;
    });

    const ctx = makeCtx({ price: 10000 });
    await registry.runFilter(
      "pricing.adjust",
      makeHook({ tenantId: TENANT_DOS }),
      ctx,
    );

    expect(
      calls,
      "TENANT_DOS no tiene module.templo-gamification.enabled sembrado " +
        "(fail-closed) — el handler NO debe correr.",
    ).toBe(0);
    expect(ctx.price).toBe(10000);
  });

  it("filter que tira: runFilter rejecta con el mismo error, clase intacta", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", true);
    const registry = new HookRegistry();
    registry.setFilter("templo-gamification", "pricing.adjust", async () => {
      throw new FilterExplotoError("saldo insuficiente");
    });

    const ctx = makeCtx();
    await expect(
      registry.runFilter("pricing.adjust", makeHook(), ctx),
    ).rejects.toThrow(FilterExplotoError);
  });

  it("event que tira: emit resuelve y se loguea log.warn con la propiedad err", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", true);
    const registry = new HookRegistry();
    registry.setEvent("templo-gamification", "streak.milestone", async () => {
      throw new Error("award AURA falló");
    });

    const { log, warn } = makeLogSpy();
    const evt = makeEvt();
    await expect(
      registry.emit("streak.milestone", makeHook({ log }), evt),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    const [payload] = warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload.err).toBeInstanceOf(Error);
  });

  it("event con módulo OFF (TENANT_DOS) NO corre", async () => {
    const registry = new HookRegistry();
    let calls = 0;
    registry.setEvent("templo-gamification", "streak.milestone", async () => {
      calls++;
    });

    const evt = makeEvt();
    await registry.emit(
      "streak.milestone",
      makeHook({ tenantId: TENANT_DOS }),
      evt,
    );

    expect(calls).toBe(0);
  });

  it("setFilter dos veces con el mismo (módulo, key): corre el último registrado, una sola vez", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", true);
    const registry = new HookRegistry();
    let firstCalls = 0;
    let secondCalls = 0;
    registry.setFilter("templo-gamification", "pricing.adjust", async () => {
      firstCalls++;
    });
    registry.setFilter("templo-gamification", "pricing.adjust", async () => {
      secondCalls++;
    });

    await registry.runFilter("pricing.adjust", makeHook(), makeCtx());

    expect(
      firstCalls,
      "El primer setFilter debió quedar reemplazado, no acumulado (T-176-15).",
    ).toBe(0);
    expect(secondCalls).toBe(1);
  });
});
