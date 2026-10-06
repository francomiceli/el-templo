/**
 * Fase 194 Plan 07 (D-15 / D-26d) — días hábiles.
 *
 * Parte 1: `addBusinessDays` es PURA, así que se prueba con fechas literales
 * (permitido en funciones puras de calendario, EXECUTOR-RULES). Referencias:
 * 2026-10-05 es lunes; 2026-12-31 es jueves.
 * Parte 2: `loadHolidaySet` contra MySQL real (feriados AR/ES + otro gimnasio).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import { holidays } from "../../src/db/schema";
import {
  addBusinessDays,
  businessDaysHorizon,
  loadHolidaySet,
} from "../../src/modules/shared/business-days";
import {
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";

const NONE: ReadonlySet<string> = new Set<string>();

describe("addBusinessDays (pura)", () => {
  it("lunes + 10 hábiles sin feriados = viernes de la semana siguiente (D-26d: el lunes no cuenta)", () => {
    expect(addBusinessDays("2026-10-05", 10, NONE)).toBe("2026-10-16");
  });

  it("n=0 devuelve el propio día de activación", () => {
    expect(addBusinessDays("2026-10-05", 0, NONE)).toBe("2026-10-05");
  });

  it("activación un sábado: el domingo no cuenta y se empieza a contar el lunes", () => {
    expect(addBusinessDays("2026-10-10", 1, NONE)).toBe("2026-10-12");
    expect(addBusinessDays("2026-10-10", 3, NONE)).toBe("2026-10-14");
  });

  it("el sábado SÍ cuenta como hábil (lun-sáb)", () => {
    // Lunes + 5 = sábado de la misma semana.
    expect(addBusinessDays("2026-10-05", 5, NONE)).toBe("2026-10-10");
  });

  it("un feriado en martes dentro del rango extiende un día", () => {
    expect(addBusinessDays("2026-10-05", 10, new Set(["2026-10-06"]))).toBe(
      "2026-10-17",
    );
  });

  it("un feriado en sábado no cuenta ese sábado", () => {
    expect(addBusinessDays("2026-10-05", 10, new Set(["2026-10-10"]))).toBe(
      "2026-10-17",
    );
  });

  it("un feriado en domingo no resta ni suma (ya era no hábil)", () => {
    expect(addBusinessDays("2026-10-10", 1, new Set(["2026-10-11"]))).toBe(
      "2026-10-12",
    );
  });

  it("un feriado el propio día de activación no cambia el cálculo", () => {
    expect(addBusinessDays("2026-10-05", 10, new Set(["2026-10-05"]))).toBe(
      "2026-10-16",
    );
  });

  it("cruza fin de mes", () => {
    // Viernes 30-oct: sáb 31 (1), dom 1-nov salteado, lun 2 (2), mar 3 (3).
    expect(addBusinessDays("2026-10-30", 3, NONE)).toBe("2026-11-03");
  });

  it("cruza fin de año con el 1-ene feriado", () => {
    // Jueves 31-dic: 1-ene (vie) feriado, sáb 2 (1), dom 3 salteado, lun 4 (2).
    expect(addBusinessDays("2026-12-31", 2, new Set(["2027-01-01"]))).toBe(
      "2027-01-04",
    );
    // Sin feriado: vie 1 (1), sáb 2 (2).
    expect(addBusinessDays("2026-12-31", 2, NONE)).toBe("2027-01-02");
  });
});

describe("businessDaysHorizon", () => {
  it("devuelve n*2+14 días corridos", () => {
    expect(businessDaysHorizon(10)).toBe(34);
    expect(businessDaysHorizon(0)).toBe(14);
  });
});

describe("loadHolidaySet (integración)", () => {
  let app: FastifyInstance;
  const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  it("devuelve solo los feriados del país y del tenant dentro del rango", async () => {
    const gym2 = await seedSecondTenant(app);
    const ctxDos: TenantContext = { tenantId: gym2.tenantId };

    await app.db.insert(holidays).values([
      tenantValues(CTX_TEMPLO, {
        country: "AR",
        date: "2031-05-01",
        name: "Día del Trabajador",
      }),
      tenantValues(CTX_TEMPLO, {
        country: "AR",
        date: "2031-05-25",
        name: "Revolución de Mayo",
      }),
      // Fuera del rango pedido.
      tenantValues(CTX_TEMPLO, {
        country: "AR",
        date: "2031-07-09",
        name: "Independencia",
      }),
      // Otro país del mismo tenant.
      tenantValues(CTX_TEMPLO, {
        country: "ES",
        date: "2031-05-02",
        name: "Comunidad de Madrid",
      }),
      // Mismo país y fecha, otro gimnasio.
      tenantValues(ctxDos, {
        country: "AR",
        date: "2031-05-10",
        name: "Feriado del gimnasio 2",
      }),
    ]);

    const ar = await loadHolidaySet(
      app.db,
      CTX_TEMPLO,
      "AR",
      "2031-05-01",
      "2031-06-30",
    );
    expect([...ar].sort()).toEqual(["2031-05-01", "2031-05-25"]);

    const es = await loadHolidaySet(
      app.db,
      CTX_TEMPLO,
      "ES",
      "2031-05-01",
      "2031-06-30",
    );
    expect([...es]).toEqual(["2031-05-02"]);

    const dos = await loadHolidaySet(
      app.db,
      ctxDos,
      "AR",
      "2031-05-01",
      "2031-06-30",
    );
    expect([...dos]).toEqual(["2031-05-10"]);

    // Los extremos del rango son inclusivos.
    const borde = await loadHolidaySet(
      app.db,
      CTX_TEMPLO,
      "AR",
      "2031-05-25",
      "2031-05-25",
    );
    expect([...borde]).toEqual(["2031-05-25"]);
  });

  it("el set cargado alimenta addBusinessDays", async () => {
    await app.db.insert(holidays).values(
      tenantValues(CTX_TEMPLO, {
        country: "AR",
        date: "2031-05-06",
        name: "Feriado de prueba",
      }),
    );
    // 2031-05-05 es lunes; el martes 6 es feriado.
    const set = await loadHolidaySet(
      app.db,
      CTX_TEMPLO,
      "AR",
      "2031-05-05",
      "2031-06-08",
    );
    expect(addBusinessDays("2031-05-05", 1, set)).toBe("2031-05-07");
  });
});
