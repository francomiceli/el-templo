/**
 * Fase 170 (CON-05) — Contrato de clasificación del parser del sentinel.
 *
 * QUÉ PRUEBA
 * ----------
 * La decisión que toma `analyzeSql` sobre cada forma de SQL que el pool va a
 * ver: qué es una violación de tenancy, qué es ruido de infraestructura y qué
 * está exento. Es el único archivo que congela ese contrato — el plan 03 monta
 * el wrap del pool encima de esta función, así que un cambio silencioso acá se
 * propaga a todo el sentinel.
 *
 * Los strings de SQL NO están inventados: son salida real de Drizzle 0.45.1
 * capturada con `.toSQL()` durante la investigación de la fase. Copiarlos tal
 * cual es deliberado — un parser que apruebe SQL estilizado a mano y falle
 * contra el que emite el driver no sirve para nada.
 *
 * POR QUÉ ES UN TEST UNITARIO Y NO UNO MYSQL-BACKED
 * -------------------------------------------------
 * `analyzeSql` es una función PURA: `string → veredicto`. No abre conexiones, no
 * lee `NODE_ENV` y no depende de que exista ninguna tabla. Este archivo NO monta
 * la app de test ni importa las utilidades de integración de `test/` — su única
 * importación es el módulo bajo prueba. Es el mismo criterio que
 * `test/unit/require-tenant.test.ts` (fase 169): lo que tiene reglas se prueba
 * sin recursos, y el mecanismo que las aplica se prueba aparte.
 *
 * ADVERTENCIA SOBRE "UNITARIO"
 * ----------------------------
 * En este repo, "unitario" significa **no necesita recursos**, NO "corre en
 * milisegundos dentro de la suite completa": el `setupFiles` de Vitest
 * provisiona MySQL para TODO archivo de test, incluido este (~96-115 s de
 * overhead — hallazgo 169-07). Las aserciones de acá corren en milisegundos; la
 * espera es del provisioning, no del parser. Es también el motivo por el que el
 * lint de la fase NO es un gate de Vitest (D-09).
 *
 * LAS AFIRMACIONES QUE NO SON OBVIAS
 * ----------------------------------
 * 1. **El trap de la proyección** (T-170-01): un SELECT sin `where` sobre una
 *    tabla gym-owned CONTIENE el literal `tenant_id` —Drizzle expande la
 *    proyección a todas las columnas— y aun así es la fuga más grave posible.
 *    El `it` dedicado lleva su par de aserción positiva para que un parser roto
 *    que devolviera siempre `violation` no pase en verde.
 * 2. **Cada forma de no-DML tiene su propio `it`** (T-170-04). Un solo test con
 *    diez strings adentro se arregla borrando el string que molesta; diez tests
 *    hay que borrarlos de a uno y se ven en el diff. Mismo patrón "recorrer
 *    todos los valores del enum" de `require-tenant.test.ts`.
 * 3. **El set gym-owned es inyectable** (D-07): hay un test que le pasa un set
 *    con UNA tabla y afirma que una tabla gym-owned real queda en `skip`. Sin
 *    él, el parámetro podría estar ignorado y todo lo demás seguiría en verde.
 */

import { describe, it, expect } from "vitest";
import {
  analyzeSql,
  fingerprint,
  type SentinelVerdict,
} from "../../src/db/sentinel/analyze";

// ─────────────────────────────────────────────────────────────────────────────
// SQL real emitido por Drizzle 0.45.1 (capturado con .toSQL())
// ─────────────────────────────────────────────────────────────────────────────

/** El trap: scan completo sin `where`, con `tenant_id` en la PROYECCIÓN. */
const SELECT_SIN_WHERE = "select `id`, `tenant_id`, `first_name` from `users`";

/** El mismo SELECT, ahora sí filtrado por tenant. */
const SELECT_CON_TENANT =
  "select `id`, `tenant_id`, `first_name` from `users` where (`users`.`tenant_id` = ? and `users`.`id` = ?)";

const kinds = (sql: string, gymOwned?: ReadonlySet<string>): SentinelVerdict =>
  analyzeSql(sql, gymOwned);

describe("analyzeSql — veredictos sobre SQL emitido por Drizzle", () => {
  it("violation: un SELECT sin filtro de tenant sobre una tabla gym-owned", () => {
    const v = kinds(SELECT_SIN_WHERE);
    expect(v.kind).toBe("violation");
    expect(v.tables).toEqual(["users"]);
    // La razón viaja al log y al inventario: tiene que nombrar la tabla.
    expect(v.reason).toContain("users");
  });

  it("ok: un SELECT con `tenant_id` en el WHERE", () => {
    const v = kinds(SELECT_CON_TENANT);
    expect(v.kind).toBe("ok");
    expect(v.tables).toEqual(["users"]);
  });

  it("violation: un count(*) sin filtro también es una fuga", () => {
    // No devuelve filas de otro gimnasio, pero sí su CANTIDAD. El diseño
    // (D-03) mete todas las lecturas en el mismo saco a propósito.
    const v = kinds("select count(*) from `bookings`");
    expect(v.kind).toBe("violation");
    expect(v.tables).toEqual(["bookings"]);
  });

  it("ok: un INSERT que escribe la columna tenant_id", () => {
    const v = kinds(
      "insert into `users` (`id`, `tenant_id`, `first_name`) values (?, ?, ?)",
    );
    expect(v.kind).toBe("ok");
    expect(v.tables).toEqual(["users"]);
  });

  it("violation: un INSERT que se olvida de tenant_id", () => {
    const v = kinds("insert into `tv_pairings` (`user_code`) values (?)");
    expect(v.kind).toBe("violation");
    expect(v.tables).toEqual(["tv_pairings"]);
  });

  it("violation: un UPDATE filtrado solo por id", () => {
    // El caso clásico del olvido: el id parece suficiente hasta que dos
    // gimnasios tienen filas con ids que el atacante puede enumerar.
    const v = kinds("update `users` set `first_name` = ? where `users`.`id` = ?");
    expect(v.kind).toBe("violation");
    expect(v.tables).toEqual(["users"]);
  });

  it("ok: un DELETE con tenant_id en el WHERE", () => {
    const v = kinds("delete from `users` where `users`.`tenant_id` = ? and `id` = ?");
    expect(v.kind).toBe("ok");
    expect(v.tables).toEqual(["users"]);
  });

  it("violation: un JOIN de dos gym-owned reporta LAS DOS tablas", () => {
    const v = kinds(
      "select `bookings`.`id`, `users`.`first_name` from `bookings` inner join `users` on `bookings`.`member_id` = `users`.`id`",
    );
    expect(v.kind).toBe("violation");
    // Se afirma el CONTENIDO, no el largo: un parser que devolviera dos veces
    // la misma tabla pasaría un `toHaveLength(2)`.
    expect(v.tables).toContain("bookings");
    expect(v.tables).toContain("users");
    expect(v.tables).toHaveLength(2);
  });
});

describe("analyzeSql — el trap de la PROYECCIÓN expandida (T-170-01)", () => {
  it("un SELECT sin WHERE es violation AUNQUE la proyección contenga tenant_id", () => {
    // Esta es la aserción más importante del archivo. Drizzle expande
    // `db.select().from(users)` a TODAS las columnas, `tenant_id` incluida, así
    // que el string del scan completo —la fuga más grave posible— CONTIENE el
    // literal. Un chequeo de presencia sobre el SQL entero devolvería "cumple".
    expect(SELECT_SIN_WHERE).toContain("tenant_id"); // el literal está ahí…
    expect(kinds(SELECT_SIN_WHERE).kind).toBe("violation"); // …y aun así viola
  });

  it("el mismo SQL con tenant_id en el WHERE sí da ok (el par que separa el verde real del de mentira)", () => {
    // Sin esta mitad, un parser roto que devolviera SIEMPRE `violation` pasaría
    // el test de arriba. Las dos aserciones juntas fijan que el recorte de la
    // proyección discrimina, no que el parser sea pesimista.
    expect(kinds(SELECT_CON_TENANT).kind).toBe("ok");
  });
});

describe("analyzeSql — no-DML e introspección nunca son violación (T-170-04)", () => {
  // Un `it` por forma: Drizzle emite el control de transacción por el MISMO
  // canal que las queries, y un falso positivo acá rompería toda transacción
  // legítima en modo throw. Borrar una de estas formas del parser tiene que
  // dejar SU test rojo, no diluirse en un test genérico.

  it("skip: begin", () => {
    expect(kinds("begin").kind).toBe("skip");
  });

  it("skip: commit", () => {
    expect(kinds("commit").kind).toBe("skip");
  });

  it("skip: rollback", () => {
    expect(kinds("rollback").kind).toBe("skip");
  });

  it("skip: savepoint sp1", () => {
    expect(kinds("savepoint sp1").kind).toBe("skip");
  });

  it("skip: release savepoint sp1", () => {
    expect(kinds("release savepoint sp1").kind).toBe("skip");
  });

  it("skip: rollback to sp1", () => {
    expect(kinds("rollback to sp1").kind).toBe("skip");
  });

  it("skip: start transaction", () => {
    expect(kinds("start transaction").kind).toBe("skip");
  });

  it("skip: SET autocommit=0", () => {
    expect(kinds("SET autocommit=0").kind).toBe("skip");
  });

  it("skip: SHOW TABLES", () => {
    expect(kinds("SHOW TABLES").kind).toBe("skip");
  });

  it("skip: select database()", () => {
    // El guard de base que usan los scripts del repo (verify-tenant-uniques.ts).
    expect(kinds("select database()").kind).toBe("skip");
  });

  it("skip: cualquier consulta a information_schema", () => {
    const v = kinds(
      "select `column_name` from `information_schema`.`columns` where `table_name` = ?",
    );
    expect(v.kind).toBe("skip");
    expect(v.reason).toContain("introspección");
  });

  it("los statements de no-DML no reportan tablas", () => {
    // `tables` vacío cuando kind === "skip" es parte del contrato: el inventario
    // agrupa por tabla y una entrada fantasma lo ensuciaría.
    for (const sql of ["begin", "commit", "SHOW TABLES", "select database()"]) {
      expect(kinds(sql).tables).toEqual([]);
    }
  });
});

describe("analyzeSql — exención anotada en el SQL (D-17)", () => {
  it("exempt: comentario de bloque con motivo, delante del statement", () => {
    const v = kinds(
      "/* tenant-safe: idempotencia global */ insert into `users` (`id`) values (?)",
    );
    expect(v.kind).toBe("exempt");
    // El motivo viaja en la razón: un inventario de exenciones sin motivos es
    // una alfombra (mismo criterio que los registros de la fase 168).
    expect(v.reason).toContain("idempotencia global");
  });

  it("exempt: la anotación también vale escrita dentro del SQL crudo", () => {
    // Un comentario de bloque escrito dentro de un sql`` llega INTACTO al pool
    // (verificado en la investigación). Es el canal del sentinel.
    const v = kinds(
      "select `id` from `users` where /* tenant-safe: lookup por token global */ `token` = ?",
    );
    expect(v.kind).toBe("exempt");
  });

  it("una anotación SIN motivo no exime: se sigue clasificando", () => {
    // El motivo es obligatorio (T-169-36): una anotación pelada es
    // indistinguible de un olvido. Ojo con la regex ingenua — el `*` del cierre
    // del comentario es un carácter no-blanco y haría pasar el motivo vacío.
    const v = kinds("/* tenant-safe: */ insert into `users` (`id`) values (?)");
    expect(v.kind).toBe("violation");
    expect(v.tables).toEqual(["users"]);
  });

  it("una anotación sin motivo tampoco convierte en exenta una query que sí cumple", () => {
    const v = kinds(
      "/* tenant-safe: */ insert into `users` (`id`, `tenant_id`) values (?, ?)",
    );
    expect(v.kind).toBe("ok");
  });
});

describe("analyzeSql — tablas fuera del alcance", () => {
  it("skip: una tabla que no es gym-owned", () => {
    // `system_settings` es la mina M2 del diseño: config GLOBAL heredada, está
    // en TENANT_EXEMPT_TABLES y no recibe `tenant_id` en todo v6.0.
    const v = kinds("select `value` from `system_settings` where `key` = ?");
    expect(v.kind).toBe("skip");
    expect(v.reason).toContain("gym-owned");
    expect(v.tables).toEqual([]);
  });

  it("skip: la propia tabla `tenants` (es plataforma, no de un gimnasio)", () => {
    expect(kinds("select `id`, `status` from `tenants` where `id` = ?").kind).toBe(
      "skip",
    );
  });

  it("D-07: el set gym-owned inyectado se respeta", () => {
    // Se inyecta un set con UNA sola tabla. `users` es gym-owned de verdad, pero
    // no está en ESTE set, así que tiene que quedar en skip. Sin este test, el
    // parámetro podría estar ignorado (usando siempre el default) y todo lo
    // demás seguiría en verde — y el sentinel del plan 04 necesita inyectarlo.
    const soloBookings: ReadonlySet<string> = new Set(["bookings"]);
    expect(kinds(SELECT_SIN_WHERE, soloBookings).kind).toBe("skip");
    // La contraprueba con la misma inyección: la tabla que SÍ está se clasifica.
    expect(kinds("select count(*) from `bookings`", soloBookings).kind).toBe(
      "violation",
    );
  });
});

describe("fingerprint", () => {
  it("dos formateos del mismo statement comparten fingerprint", () => {
    // Es la clave de deduplicación de D-01: sin colapsar el whitespace, el mismo
    // statement emitido con un salto de línea distinto contaría como violación
    // nueva y el log de prod se llenaría igual.
    const a = "  select `id`,\n  `tenant_id`   from `users`  ";
    const b = "select `id`, `tenant_id` from `users`";
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("dos statements distintos NO comparten fingerprint", () => {
    expect(fingerprint(SELECT_SIN_WHERE)).not.toBe(
      fingerprint("select count(*) from `bookings`"),
    );
  });

  it("no altera los placeholders `?` (no hay nada que redactar — T-170-02)", () => {
    // El texto que ve el pool ya viene parametrizado: los valores nunca están en
    // el string, y por eso es seguro loguearlo.
    const fp = fingerprint(SELECT_CON_TENANT);
    expect(fp).toContain("?");
    expect(fp).toContain("tenant_id");
  });
});
