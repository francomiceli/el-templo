/**
 * Fase 200 Plan 10: migraciones 0287 (nombres D1 de rutas) y 0288 (los cinco
 * SISSY SQ OL sin ruta pasan a SS).
 *
 * Guard ESTATICO sobre el texto del SQL, sin DB: la tabla `routes` la vacian
 * otras suites del mismo worker (Pitfall 1), asi que afirmar contra la fila viva
 * seria flaky. Lo que se fija es lo que importa de una migracion de datos que
 * corre contra prod: que no tenga `;` en los comentarios (el runner splittea
 * antes de strippear), que apunte por codigo/nombre + tenant y nunca por id, y
 * que no toque HT, NC ni QC (R4).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../src/db/migrations");

function leer(nombre: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, nombre), "utf8");
}

/** Lineas que no son comentario `--` ni vacias. */
function sentencias(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l) && l.trim() !== "")
    .join("\n");
}

const SQL_0287 = leer("0287_route_display_names_d1.sql");
const SQL_0288 = leer("0288_sissy_sq_ol_to_ss.sql");

const D1: ReadonlyArray<readonly [string, string]> = [
  ["HR", "Espinales y planchas laterales"],
  ["HD/ID", "Fondos"],
  ["SIDE PCK", "Side Pancake"],
  ["MN/RP", "Manna"],
  ["FLR", "Front Lever Row"],
];

describe("Migraciones 0287-0288 — nombres D1 y SISSY SQ OL a SS", () => {
  describe.each([
    ["0287_route_display_names_d1.sql", SQL_0287],
    ["0288_sissy_sq_ol_to_ss.sql", SQL_0288],
  ])("%s", (_nombre, sql) => {
    it("ningun comentario -- lleva punto y coma (Hard Rule 2)", () => {
      const conPuntoYComa = sql
        .split("\n")
        .filter((l) => /^\s*--/.test(l) && l.includes(";"));
      expect(conPuntoYComa).toEqual([]);
    });

    it("ninguna sentencia apunta por id", () => {
      expect(sentencias(sql)).not.toMatch(/\bid\s*(=|in\b)/i);
    });

    it("toda sentencia lleva tenant_id = 1", () => {
      const cuerpo = sentencias(sql);
      const updates = cuerpo.split(";").filter((s) => s.trim() !== "");
      expect(updates.length).toBeGreaterThan(0);
      for (const sentencia of updates) {
        expect(sentencia).toContain("tenant_id = 1");
      }
    });
  });

  describe("0287 — display_name D1", () => {
    it("tiene exactamente 5 UPDATE sobre routes", () => {
      const updates = sentencias(SQL_0287).match(/UPDATE routes SET/g) ?? [];
      expect(updates).toHaveLength(5);
    });

    it.each(D1)("%s queda como '%s' por codigo + tenant", (code, nombre) => {
      const esperado = `UPDATE routes SET display_name = '${nombre}' WHERE code = '${code}' AND tenant_id = 1;`;
      expect(sentencias(SQL_0287)).toContain(esperado);
    });

    it("no toca HT, NC ni QC en sentencias (R4)", () => {
      const cuerpo = sentencias(SQL_0287);
      for (const code of ["HT", "NC", "QC"]) {
        expect(cuerpo).not.toContain(`'${code}'`);
      }
    });
  });

  describe("0288 — SISSY SQ OL a SS", () => {
    const cuerpo = sentencias(SQL_0288);

    it("es un unico UPDATE sobre exercises", () => {
      expect(cuerpo.match(/UPDATE exercises SET/g) ?? []).toHaveLength(1);
    });

    it("fija la ruta en SS", () => {
      expect(cuerpo).toContain("SET route = 'SS'");
    });

    it("apunta por ruta vacia + nombre + categoria + tenant", () => {
      expect(cuerpo).toContain("TRIM(route) = ''");
      expect(cuerpo).toContain("LIKE 'SISSY SQ OL%'");
      expect(cuerpo).toContain("TRIM(category) = 'KNEE DOMINANT'");
      expect(cuerpo).toContain("tenant_id = 1");
    });
  });
});
