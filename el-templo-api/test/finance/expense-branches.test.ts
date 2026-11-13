/**
 * Fase 209 Plan 02: sedes operativas de Egresos y "hoy" por país (DI-08, DI-05).
 *
 * Corre contra la MySQL de test. Crea sus propias sedes con prefijo
 * "ZZZ-EGR-<sufijo>" y las borra en `afterAll`.
 */
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, inArray } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { todayInTz } from "../../src/modules/shared/date-utils";
import {
  CASA_MATRIZ_LABEL,
  branchNamesByIds,
  casaMatrizAllowed,
  countryToday,
  listOperationalBranches,
} from "../../src/modules/finance/expense-branches";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

let app: FastifyInstance;
const sufijo = `${Date.now() % 1_000_000}`;
const ids: Record<"arB" | "arA" | "arVirtual" | "arInactiva" | "es", number> = {
  arB: 0,
  arA: 0,
  arVirtual: 0,
  arInactiva: 0,
  es: 0,
};

async function crearSede(
  clave: keyof typeof ids,
  valores: {
    name: string;
    country: string;
    isVirtual?: boolean;
    isActive?: boolean;
    timezone?: string;
  },
): Promise<void> {
  const [res] = await app.db.insert(schema.branches).values(
    tenantValues(TEMPLO_CTX, {
      ...valores,
      code: `E${clave.slice(0, 3)}${sufijo}`.slice(0, 20),
    }),
  );
  ids[clave] = Number(res.insertId);
}

beforeAll(async () => {
  app = await createTestApp();
  // Se insertan fuera de orden alfabético para probar el ORDER BY.
  await crearSede("arB", { name: `ZZZ-EGR-${sufijo}-B`, country: "AR" });
  await crearSede("arA", { name: `ZZZ-EGR-${sufijo}-A`, country: "AR" });
  await crearSede("arVirtual", {
    name: `ZZZ-EGR-${sufijo}-Virtual`,
    country: "AR",
    isVirtual: true,
  });
  await crearSede("arInactiva", {
    name: `ZZZ-EGR-${sufijo}-Inactiva`,
    country: "AR",
    isActive: false,
  });
  await crearSede("es", {
    name: `ZZZ-EGR-${sufijo}-ES`,
    country: "ES",
    timezone: "Europe/Madrid",
  });
});

afterAll(async () => {
  await app.db
    .delete(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, TEMPLO_CTX),
        inArray(schema.branches.id, Object.values(ids)),
      ),
    );
  await app.close();
});

describe("expense-branches", () => {
  it("Casa Matriz: etiqueta fija y solo permitida en Argentina", () => {
    expect(CASA_MATRIZ_LABEL).toBe("Casa Matriz");
    expect(casaMatrizAllowed("AR")).toBe(true);
    expect(casaMatrizAllowed("ES")).toBe(false);
  });

  it("listOperationalBranches(AR) incluye las activas no virtuales y excluye virtual, inactiva y ES", async () => {
    const lista = await listOperationalBranches(app.db, TEMPLO_CTX, "AR");
    const listaIds = lista.map((b) => b.id);
    expect(listaIds).toContain(ids.arA);
    expect(listaIds).toContain(ids.arB);
    expect(listaIds).not.toContain(ids.arVirtual);
    expect(listaIds).not.toContain(ids.arInactiva);
    expect(listaIds).not.toContain(ids.es);
  });

  it("viene ordenada por nombre (A antes que B aunque B se insertó primero)", async () => {
    const lista = await listOperationalBranches(app.db, TEMPLO_CTX, "AR");
    expect(lista.findIndex((b) => b.id === ids.arA)).toBeLessThan(
      lista.findIndex((b) => b.id === ids.arB),
    );
  });

  it("listOperationalBranches(ES) incluye la sede de España y ninguna argentina", async () => {
    const lista = await listOperationalBranches(app.db, TEMPLO_CTX, "ES");
    const listaIds = lista.map((b) => b.id);
    expect(listaIds).toContain(ids.es);
    expect(listaIds).not.toContain(ids.arA);
    const es = lista.find((b) => b.id === ids.es);
    expect(es?.timezone).toBe("Europe/Madrid");
  });

  it("branchNamesByIds devuelve también la inactiva, con isActive false", async () => {
    const mapa = await branchNamesByIds(app.db, TEMPLO_CTX, [
      ids.arA,
      ids.arInactiva,
    ]);
    expect(mapa.size).toBe(2);
    expect(mapa.get(ids.arA)).toEqual({
      name: `ZZZ-EGR-${sufijo}-A`,
      isActive: true,
    });
    expect(mapa.get(ids.arInactiva)).toEqual({
      name: `ZZZ-EGR-${sufijo}-Inactiva`,
      isActive: false,
    });
  });

  it("branchNamesByIds con lista vacía devuelve un Map vacío", async () => {
    const mapa = await branchNamesByIds(app.db, TEMPLO_CTX, []);
    expect(mapa.size).toBe(0);
  });

  it("branchNamesByIds no devuelve sedes de otro gimnasio", async () => {
    const mapa = await branchNamesByIds(
      app.db,
      { tenantId: TENANT_TEMPLO + 999_999 },
      [ids.arA],
    );
    expect(mapa.size).toBe(0);
  });

  it("countryToday(AR) es el 'hoy' de la zona de la primera sede AR", async () => {
    const lista = await listOperationalBranches(app.db, TEMPLO_CTX, "AR");
    const hoy = await countryToday(app.db, TEMPLO_CTX, "AR");
    expect(hoy).toBe(todayInTz(lista[0].timezone));
    expect(hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("countryToday sin sedes operativas usa la zona por defecto del gimnasio", async () => {
    const hoy = await countryToday(
      app.db,
      { tenantId: TENANT_TEMPLO + 999_999 },
      "AR",
    );
    expect(hoy).toBe(todayInTz("America/Argentina/Buenos_Aires"));
  });
});
