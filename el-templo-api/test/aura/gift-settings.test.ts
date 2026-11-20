// Fase 215 Plan 07 (D-11, T-215-07-03/T-215-07-04) — valor del regalo del profe
// por gimnasio, contra MySQL real. Casos:
//   (a) sin fila: el default (2)
//   (b) round-trip y upsert
//   (c) valores fuera de rango o no enteros: lanzan y no pisan lo guardado
//   (d) valor roto escrito a mano: lectura fail-closed al default
//   (e) aislamiento entre gimnasios
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import { tenantSettings } from "../../src/db/schema";
import {
  COACH_GIFT_SETTING_KEY,
  getCoachGiftAmount,
  setCoachGiftAmount,
} from "../../src/modules/aura/gift-settings";
import { COACH_GIFT_AMOUNT } from "../../src/modules/aura/gift-rules";
import {
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";

describe("aura/gift-settings (D-11)", () => {
  let app: FastifyInstance;
  const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };

  // `cleanAllTestData` no limpia `tenant_settings` (KV compartido con los flags
  // de módulos): esta suite borra solo su propia clave.
  async function clearOwnKey(): Promise<void> {
    await app.db
      .delete(tenantSettings)
      .where(eq(tenantSettings.settingKey, COACH_GIFT_SETTING_KEY));
  }

  beforeAll(async () => {
    app = await createTestApp();
    await clearOwnKey();
  });

  afterEach(async () => {
    await clearOwnKey();
  });

  afterAll(async () => {
    await clearOwnKey();
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  it("(a) sin fila devuelve el default", async () => {
    expect(COACH_GIFT_AMOUNT.default).toBe(2);
    expect(await getCoachGiftAmount(app.db, CTX_TEMPLO)).toBe(2);
  });

  it("(b) guarda y lee el valor, y una segunda escritura lo pisa sin duplicar la fila", async () => {
    expect(await setCoachGiftAmount(app.db, CTX_TEMPLO, 5)).toBe(5);
    expect(await getCoachGiftAmount(app.db, CTX_TEMPLO)).toBe(5);

    expect(await setCoachGiftAmount(app.db, CTX_TEMPLO, 10)).toBe(10);
    expect(await getCoachGiftAmount(app.db, CTX_TEMPLO)).toBe(10);

    const rows = await app.db
      .select({ id: tenantSettings.id })
      .from(tenantSettings)
      .where(eq(tenantSettings.settingKey, COACH_GIFT_SETTING_KEY));
    expect(rows).toHaveLength(1);

    // Los bordes del rango valen.
    expect(await setCoachGiftAmount(app.db, CTX_TEMPLO, 1)).toBe(1);
    expect(await getCoachGiftAmount(app.db, CTX_TEMPLO)).toBe(1);
  });

  it("(c) 0, 11, 2.5 y NaN lanzan con el mensaje en español y no pisan el valor guardado", async () => {
    await setCoachGiftAmount(app.db, CTX_TEMPLO, 5);

    for (const bad of [0, 11, 2.5, -3, Number.NaN]) {
      await expect(setCoachGiftAmount(app.db, CTX_TEMPLO, bad)).rejects.toThrow(
        "Tiene que ser un número entero entre 1 y 10.",
      );
    }

    expect(await getCoachGiftAmount(app.db, CTX_TEMPLO)).toBe(5);
  });

  it("(d) un valor roto escrito a mano cae al default (fail-closed)", async () => {
    for (const broken of ["abc", "2.5", "0", "11", "-1", ""]) {
      await clearOwnKey();
      // INSERT directo, sin pasar por setCoachGiftAmount: la columna es texto
      // libre, así que un valor corrupto es un escenario real.
      await app.db.insert(tenantSettings).values(
        tenantValues(CTX_TEMPLO, {
          settingKey: COACH_GIFT_SETTING_KEY,
          settingValue: broken,
        }),
      );
      expect(await getCoachGiftAmount(app.db, CTX_TEMPLO)).toBe(2);
    }
  });

  it("(e) aislamiento: guardar en el gimnasio 2 no cambia el valor del gimnasio 1", async () => {
    const gym2 = await seedSecondTenant(app);
    const ctxDos: TenantContext = { tenantId: gym2.tenantId };

    await setCoachGiftAmount(app.db, CTX_TEMPLO, 3);
    expect(await getCoachGiftAmount(app.db, ctxDos)).toBe(2);

    await setCoachGiftAmount(app.db, ctxDos, 8);
    expect(await getCoachGiftAmount(app.db, CTX_TEMPLO)).toBe(3);
    expect(await getCoachGiftAmount(app.db, ctxDos)).toBe(8);

    // Un valor inválido en el gimnasio 2 tampoco toca al 1.
    await expect(setCoachGiftAmount(app.db, ctxDos, 99)).rejects.toThrow();
    expect(await getCoachGiftAmount(app.db, CTX_TEMPLO)).toBe(3);
    expect(await getCoachGiftAmount(app.db, ctxDos)).toBe(8);
  });
});
