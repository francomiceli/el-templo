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
  TENANT_GLOBAL_UNIQUES,
  TENANT_UNIQUE_ALLOWLIST,
  PLATFORM_PHYSICAL_TABLES,
  isGymOwnedTable,
  isTenantGlobalUnique,
  isAllowedGlobalUnique,
  tenantUniqueMotive,
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

/**
 * Fase 168 Plan 05 (CON-01, CON-02): mismo gate anti-podredumbre, ahora sobre
 * los DOS registros de uniques que la 168 le sumó a este archivo.
 *
 * Los cinco tests de arriba no se tocan: la 168 no agrega ni saca tablas, así
 * que 87 / 4 / 91 tienen que seguir intactos. Un rojo ahí NO es de esta fase.
 *
 * Qué protege este bloque que el verificador de base de datos no puede
 * proteger: `verify-tenant-uniques.ts` cruza los registros contra
 * INFORMATION_SCHEMA y atrapa las entradas que apuntan a un índice inexistente
 * (`staleClassifications`), pero no puede opinar sobre la FORMA de una entrada.
 * Una clave con dos puntos, una clave sobre una tabla exenta, un motivo vacío o
 * un "TODO: ver después" pasarían su gate en verde y dejarían el registro
 * inauditable. Esto es puro TypeScript: no toca la base.
 */
describe("tenant-tables — registros de uniques globales (fase 168)", () => {
  const clavesM8 = Object.keys(TENANT_GLOBAL_UNIQUES);
  const clavesAllowlist = Object.keys(TENANT_UNIQUE_ALLOWLIST);
  const todasLasClaves = [...clavesM8, ...clavesAllowlist];

  const entradas: Array<{ registro: string; clave: string; motivo: string }> = [
    ...Object.entries(TENANT_GLOBAL_UNIQUES).map(([clave, motivo]) => ({
      registro: "TENANT_GLOBAL_UNIQUES",
      clave,
      motivo,
    })),
    ...Object.entries(TENANT_UNIQUE_ALLOWLIST).map(([clave, motivo]) => ({
      registro: "TENANT_UNIQUE_ALLOWLIST",
      clave,
      motivo,
    })),
  ];

  it("toda clave tiene el formato tabla.indice con exactamente un punto separador", () => {
    const malFormadas = todasLasClaves
      .filter((clave) => {
        const partes = clave.split(".");
        return (
          partes.length !== 2 ||
          partes[0].length === 0 ||
          partes[1].length === 0
        );
      })
      .sort();

    expect(
      malFormadas,
      `Claves con formato inválido en los registros de uniques: ${malFormadas.join(", ")}. ` +
        `El formato es "<tabla_física>.<nombre_físico_de_índice>", los dos tal como los ` +
        `devuelve INFORMATION_SCHEMA.STATISTICS — no el nombre de la constante TypeScript ni ` +
        `el de la columna. Sin ese formato exacto, isTenantGlobalUnique nunca matchea y la ` +
        `clasificación no protege nada.`,
    ).toEqual([]);
  });

  it("la tabla de toda clave existe en GYM_OWNED_TABLES", () => {
    // Los dos registros clasifican uniques de tablas GYM-OWNED: es lo único que
    // el verificador les pregunta. Una clave sobre una tabla exenta o
    // inexistente no se consulta jamás — es un typo disfrazado de clasificación.
    const huerfanas = todasLasClaves
      .filter((clave) => !gymOwned.has(clave.split(".")[0]))
      .sort();

    expect(
      huerfanas,
      `Claves de los registros de uniques cuya tabla NO está en GYM_OWNED_TABLES: ` +
        `${huerfanas.join(", ")}. O la tabla está mal escrita, o se clasificó una unique de ` +
        `una tabla exenta (que no lleva tenant_id y por lo tanto no puede tener una unique ` +
        `"por tenant"). El verificador nunca va a preguntar por esa clave: quedaría muerta.`,
    ).toEqual([]);
  });

  it("ninguna clave está en los dos registros a la vez", () => {
    const enLosDos = clavesM8
      .filter((clave) => clavesAllowlist.includes(clave))
      .sort();

    expect(
      enLosDos,
      `Uniques clasificadas como M8 Y en la allowlist al mismo tiempo: ${enLosDos.join(", ")}. ` +
        `Son dos afirmaciones distintas y excluyentes: M8 es "global a propósito y para ` +
        `siempre", la allowlist es "no arranca con tenant_id pero es segura o es deuda ` +
        `aceptada". Duplicarla deja dos motivos que van a divergir.`,
    ).toEqual([]);
  });

  it("todo motivo es una cadena con contenido real, sin marcadores de trabajo pendiente", () => {
    // El marcador se busca en MAYÚSCULAS a propósito: "todo" es una palabra
    // común en castellano ("en todo v6.0", "todos los tenants") y los motivos
    // están escritos en castellano. El convenio de código es TODO/FIXME/TBD/XXX
    // en mayúscula; "pendiente" sí se busca sin distinguir mayúsculas porque en
    // un motivo solo puede significar una cosa.
    const MARCADORES = /\b(TODO|FIXME|TBD|XXX)\b/;
    const vacios = entradas
      .filter((entrada) => entrada.motivo.trim().length === 0)
      .map((entrada) => `${entrada.registro}: ${entrada.clave} (motivo vacío)`);
    const conMarcador = entradas
      .filter(
        (entrada) =>
          MARCADORES.test(entrada.motivo) || /pendiente/i.test(entrada.motivo),
      )
      .map(
        (entrada) =>
          `${entrada.registro}: ${entrada.clave} (marcador de trabajo pendiente)`,
      );
    const problemas = [...vacios, ...conMarcador].sort();

    expect(
      problemas,
      `Motivos inservibles en los registros de uniques:\n${problemas.join("\n")}\n` +
        `El motivo es obligatorio y es lo ÚNICO que permite auditar la decisión un año ` +
        `después: tiene que nombrar la FK padre concreta, el módulo Templo concreto o el ` +
        `racional M8 concreto. Un motivo vacío o un "TODO" convierten la allowlist en una ` +
        `alfombra debajo de la cual barrer uniques sin scope.`,
    ).toEqual([]);
  });

  it("TENANT_GLOBAL_UNIQUES tiene exactamente 11 entradas (la lista M8 cerrada)", () => {
    expect(
      clavesM8.length,
      `TENANT_GLOBAL_UNIQUES tiene ${clavesM8.length} entradas, esperadas 11. La lista M8 se ` +
        `aprobó COMPLETA el 2026-07-26 (doc 06 §8-Q4): son once uniques que quedan globales ` +
        `para siempre, seis ids de plataforma externa y cinco secretos random con lookup ` +
        `pre-scope. Agregar una doceava es una DECISIÓN DE DISEÑO —significa afirmar que ese ` +
        `valor no puede ser por tenant nunca— y no un detalle de implementación: va con el ` +
        `dueño del producto, no en un plan de ejecución. Si la unique nueva simplemente no ` +
        `arranca con tenant_id pero es segura por transitividad o es deuda de módulo, su ` +
        `lugar es TENANT_UNIQUE_ALLOWLIST (precedente: financial_transactions, plan 168-03).`,
    ).toBe(11);
  });

  it("los tres helpers responden bien sobre M8, sobre la allowlist y sobre un par inexistente", () => {
    // Entradas reales y estables de cada registro. Si alguna se renombrara, este
    // test cae — que es exactamente lo que queremos: los helpers se prueban
    // contra datos vivos, no contra un fixture inventado.
    const M8_TABLA = "users";
    const M8_INDICE = "users_gympass_id_unique";
    const ALLOW_TABLA = "user_branches";
    const ALLOW_INDICE = "user_branch_unique";

    expect(
      isTenantGlobalUnique(M8_TABLA, M8_INDICE),
      `${M8_TABLA}.${M8_INDICE} tiene que estar en TENANT_GLOBAL_UNIQUES (id de plataforma externa)`,
    ).toBe(true);
    expect(
      isTenantGlobalUnique(ALLOW_TABLA, ALLOW_INDICE),
      `${ALLOW_TABLA}.${ALLOW_INDICE} está en la ALLOWLIST, no en M8: isTenantGlobalUnique no ` +
        `puede confundir los dos registros`,
    ).toBe(false);
    expect(
      isTenantGlobalUnique(M8_TABLA, "indice_que_no_existe"),
      "un índice inexistente nunca está clasificado como M8",
    ).toBe(false);

    expect(
      isAllowedGlobalUnique(M8_TABLA, M8_INDICE),
      "isAllowedGlobalUnique tiene que aceptar las M8: es la pregunta que hace el verificador",
    ).toBe(true);
    expect(
      isAllowedGlobalUnique(ALLOW_TABLA, ALLOW_INDICE),
      "isAllowedGlobalUnique tiene que aceptar las entradas de la allowlist",
    ).toBe(true);
    expect(
      isAllowedGlobalUnique(M8_TABLA, "indice_que_no_existe"),
      "fail-closed: lo no clasificado NO es aceptable, y por eso el verificador lo reporta",
    ).toBe(false);

    expect(
      tenantUniqueMotive(M8_TABLA, M8_INDICE),
      "el motivo de una M8 tiene que salir escrito, para que el reporte se lea con contexto",
    ).toContain("Gympass");
    expect(
      tenantUniqueMotive(ALLOW_TABLA, ALLOW_INDICE),
      "el motivo de una entrada de allowlist derivada de FK tiene que nombrar su tabla padre",
    ).toContain("users");
    expect(
      tenantUniqueMotive(M8_TABLA, "indice_que_no_existe"),
      "un par inexistente no tiene motivo: undefined, nunca una cadena vacía",
    ).toBeUndefined();
  });

  it("PLATFORM_PHYSICAL_TABLES no se solapa con gym-owned ni con exentas", () => {
    const solapadas = PLATFORM_PHYSICAL_TABLES.filter(
      (name) => gymOwned.has(name) || exempt.has(name),
    )
      .slice()
      .sort();

    expect(
      solapadas,
      `Tablas en PLATFORM_PHYSICAL_TABLES que también están clasificadas como gym-owned o ` +
        `exentas: ${solapadas.join(", ")}. Las tres listas son excluyentes: ` +
        `PLATFORM_PHYSICAL_TABLES es para tablas que existen en MySQL pero NO en el schema ` +
        `Drizzle (_migrations, __drizzle_migrations). Si una está en dos listas, el ` +
        `verificador la clasifica por la primera que evalúa y el criterio queda escondido.`,
    ).toEqual([]);
  });
});
