/**
 * Fase 167 Plan 01 (COL-01): gate fail-closed de la clasificación de tablas.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * `src/db/tenant-tables.ts` es una lista escrita a mano, y una lista escrita a
 * mano se pudre: alguien agrega una tabla al schema en la fase 172 y nadie se
 * acuerda de clasificarla. Esa tabla quedaría FUERA del aislamiento
 * multi-tenant para siempre — sin columna `tenant_id`, sin unique compuesta
 * (fase 168), sin `tenantWhere` (fase 169), sin lint (fase 170) — y nada la
 * delataría hasta que un tenant leyera datos de otro.
 *
 * Este test cruza la lista contra el schema Drizzle REAL. Es fail-closed en
 * las dos direcciones: una tabla del schema sin clasificar rompe, y un nombre
 * clasificado que no existe en el schema (typo, rename, tabla borrada) también.
 *
 * NO toca la base de datos: es pura introspección de los objetos Drizzle
 * exportados por el barrel. Corre igual bajo el `setupFiles` del repo (que
 * provisiona la DB por worker) porque así está configurado vitest para todos
 * los archivos — no requiere `createTestApp()`.
 */
import { describe, it, expect } from "vitest";
import { is, getTableName } from "drizzle-orm";
import { MySqlTable } from "drizzle-orm/mysql-core";
import * as schema from "../../src/db/schema";
import {
  GYM_OWNED_TABLES,
  TENANT_EXEMPT_TABLES,
  isGymOwnedTable,
} from "../../src/db/tenant-tables";

/**
 * Nombres físicos de todas las tablas exportadas por `src/db/schema/index.ts`.
 * Set (no array) porque el barrel podría reexportar el mismo objeto desde dos
 * módulos y eso no debe contar doble.
 */
function collectSchemaTableNames(): Set<string> {
  const names = new Set<string>();
  for (const value of Object.values(schema as Record<string, unknown>)) {
    if (is(value, MySqlTable)) {
      names.add(getTableName(value));
    }
  }
  return names;
}

const schemaTables = collectSchemaTableNames();
const gymOwned = new Set<string>(GYM_OWNED_TABLES);
const exempt = new Set<string>(TENANT_EXEMPT_TABLES);

describe("tenant-tables — clasificación canónica de tablas (COL-01)", () => {
  it("toda tabla del schema está clasificada como gym-owned o exenta", () => {
    const unclassified = [...schemaTables]
      .filter((name) => !gymOwned.has(name) && !exempt.has(name))
      .sort();

    expect(
      unclassified,
      `Tablas del schema Drizzle SIN clasificar en src/db/tenant-tables.ts: ` +
        `${unclassified.join(", ")}. Toda tabla nueva tiene que entrar en ` +
        `GYM_OWNED_TABLES (lleva tenant_id) o en TENANT_EXEMPT_TABLES (con el ` +
        `motivo escrito). No hay tercera opción — el aislamiento multi-tenant ` +
        `de las fases 168/169/170 se construye sobre esta lista.`,
    ).toEqual([]);
  });

  it("ninguna tabla está en las dos listas a la vez", () => {
    const both = [...gymOwned].filter((name) => exempt.has(name)).sort();

    expect(
      both,
      `Tablas clasificadas como gym-owned Y exentas al mismo tiempo: ${both.join(", ")}`,
    ).toEqual([]);
  });

  it("todo nombre clasificado existe realmente en el schema (atrapa typos y renames)", () => {
    const ghosts = [...gymOwned, ...exempt]
      .filter((name) => !schemaTables.has(name))
      .sort();

    expect(
      ghosts,
      `Nombres en src/db/tenant-tables.ts que NO existen en el schema Drizzle ` +
        `(typo, rename o tabla eliminada): ${ghosts.join(", ")}`,
    ).toEqual([]);
  });

  it("los conteos son 87 gym-owned + 4 exentas y cubren las 91 tablas del schema", () => {
    expect(GYM_OWNED_TABLES.length).toBe(87);
    expect(TENANT_EXEMPT_TABLES.length).toBe(4);
    // Sin duplicados dentro de cada lista.
    expect(gymOwned.size).toBe(GYM_OWNED_TABLES.length);
    expect(exempt.size).toBe(TENANT_EXEMPT_TABLES.length);
    expect(schemaTables.size).toBe(91);
    expect(gymOwned.size + exempt.size).toBe(schemaTables.size);
  });

  it("isGymOwnedTable clasifica bien las anclas y las exentas", () => {
    // Anclas ya migradas en la fase 166: cuentan como gym-owned.
    expect(isGymOwnedTable("users")).toBe(true);
    expect(isGymOwnedTable("branches")).toBe(true);
    // Exentas: ninguna lleva tenant_id.
    expect(isGymOwnedTable("tenants")).toBe(false);
    expect(isGymOwnedTable("tenant_settings")).toBe(false);
    expect(isGymOwnedTable("system_settings")).toBe(false);
    expect(isGymOwnedTable("labs_inquiries")).toBe(false);
    // Tabla inexistente.
    expect(isGymOwnedTable("no_existe")).toBe(false);
  });
});
