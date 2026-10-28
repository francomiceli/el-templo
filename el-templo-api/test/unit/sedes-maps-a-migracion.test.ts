import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  MAPS_URL_MAX,
  MAX_HOPS,
  MIGRATION_FILE,
  buildRow,
  chooseMapsUrl,
  normalizePhone,
  parseInput,
  renderMigrationSql,
  renderTable,
  resolveMapsLink,
  sqlString,
  validatePostalCode,
  type SedeInput,
  type SedeRow,
} from "../../scripts/sedes-maps-a-migracion";
import { splitSqlStatements } from "../../src/db/run-migrations";

/**
 * Fase 195-14: generador de la migración 0275 (links de Google Maps -> SQL).
 * `fetch` va SIEMPRE mockeado: estos tests nunca llaman a Google.
 */
const LARGO =
  "https://www.google.com/maps/place/X/@-38.0335,-57.5522,17z/data=!3m1!4b1!3d-38.0334512!4d-57.5521989";

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

/** fetch falso: devuelve la respuesta de cada URL pedida y registra los pedidos. */
function fakeFetch(map: Record<string, () => Response>) {
  const calls: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect(init?.redirect).toBe("manual");
    const make = map[url];
    if (!make) throw new Error(`pedido inesperado a ${url}`);
    return make();
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const input = (over: Partial<SedeInput> = {}): SedeInput => ({
  code: "ALEM",
  mapsLink: "",
  placeId: "",
  phone: "",
  postalCode: "",
  ...over,
});

describe("resolveMapsLink", () => {
  it("un link largo de Google no hace ningún pedido", async () => {
    const { impl, calls } = fakeFetch({});
    const r = await resolveMapsLink(LARGO, impl);
    expect(r).toEqual({ ok: true, finalUrl: LARGO, hops: 0 });
    expect(calls).toEqual([]);
  });

  it("sigue un link corto hasta el link largo", async () => {
    const { impl, calls } = fakeFetch({
      "https://maps.app.goo.gl/abc": () => redirect(LARGO),
    });
    const r = await resolveMapsLink("https://maps.app.goo.gl/abc", impl);
    expect(r).toEqual({ ok: true, finalUrl: LARGO, hops: 1 });
    expect(calls).toEqual(["https://maps.app.goo.gl/abc"]);
  });

  it("acepta saltos entre links cortos (goo.gl/maps -> maps.app.goo.gl -> largo)", async () => {
    const { impl, calls } = fakeFetch({
      "https://goo.gl/maps/xyz": () =>
        redirect("https://maps.app.goo.gl/abc", 301),
      "https://maps.app.goo.gl/abc": () => redirect(LARGO, 307),
    });
    const r = await resolveMapsLink("https://goo.gl/maps/xyz", impl);
    expect(r).toEqual({ ok: true, finalUrl: LARGO, hops: 2 });
    expect(calls).toEqual([
      "https://goo.gl/maps/xyz",
      "https://maps.app.goo.gl/abc",
    ]);
  });

  it("rechaza si el destino final es otro host y NO lo pide", async () => {
    const { impl, calls } = fakeFetch({
      "https://maps.app.goo.gl/abc": () =>
        redirect("https://evil.example.com/maps/x"),
    });
    const r = await resolveMapsLink("https://maps.app.goo.gl/abc", impl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("evil.example.com");
    expect(calls).toEqual(["https://maps.app.goo.gl/abc"]);
  });

  it("rechaza un host parecido a Google (www.google.com.evil.com)", async () => {
    const { impl } = fakeFetch({
      "https://maps.app.goo.gl/abc": () =>
        redirect(
          "https://www.google.com.evil.com/maps/place/@-38.03345,-57.55219,17z",
        ),
    });
    const r = await resolveMapsLink("https://maps.app.goo.gl/abc", impl);
    expect(r.ok).toBe(false);
  });

  it("rechaza el destino de consentimiento de Google (no es Maps) con el motivo", async () => {
    const { impl } = fakeFetch({
      "https://maps.app.goo.gl/abc": () =>
        redirect(
          "https://consent.google.com/ml?continue=https://www.google.com/maps/x",
        ),
    });
    const r = await resolveMapsLink("https://maps.app.goo.gl/abc", impl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("consent.google.com");
  });

  it("un link inicial de otro sitio no se pide", async () => {
    const { impl, calls } = fakeFetch({});
    const r = await resolveMapsLink("https://example.com/foo", impl);
    expect(r.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("http plano y texto que no es URL se rechazan sin pedidos", async () => {
    const { impl, calls } = fakeFetch({});
    expect((await resolveMapsLink("http://maps.app.goo.gl/abc", impl)).ok).toBe(
      false,
    );
    expect((await resolveMapsLink("no es un link", impl)).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("un salto a http se rechaza", async () => {
    const { impl } = fakeFetch({
      "https://maps.app.goo.gl/abc": () =>
        redirect("http://www.google.com/maps/place/x"),
    });
    const r = await resolveMapsLink("https://maps.app.goo.gl/abc", impl);
    expect(r.ok).toBe(false);
  });

  it(`corta después de ${MAX_HOPS} saltos`, async () => {
    const map: Record<string, () => Response> = {};
    for (let i = 0; i < 10; i++) {
      map[`https://maps.app.goo.gl/h${i}`] = () =>
        redirect(`https://maps.app.goo.gl/h${i + 1}`);
    }
    const { impl, calls } = fakeFetch(map);
    const r = await resolveMapsLink("https://maps.app.goo.gl/h0", impl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(String(MAX_HOPS));
    expect(calls).toHaveLength(MAX_HOPS);
  });

  it(`llega al destino con exactamente ${MAX_HOPS} saltos`, async () => {
    const map: Record<string, () => Response> = {};
    for (let i = 0; i < MAX_HOPS - 1; i++) {
      map[`https://maps.app.goo.gl/h${i}`] = () =>
        redirect(`https://maps.app.goo.gl/h${i + 1}`);
    }
    map[`https://maps.app.goo.gl/h${MAX_HOPS - 1}`] = () => redirect(LARGO);
    const { impl } = fakeFetch(map);
    const r = await resolveMapsLink("https://maps.app.goo.gl/h0", impl);
    expect(r).toEqual({ ok: true, finalUrl: LARGO, hops: MAX_HOPS });
  });

  it("un link corto que no redirige (200 o sin location) se rechaza", async () => {
    const a = fakeFetch({
      "https://maps.app.goo.gl/a": () => new Response("x", { status: 200 }),
    });
    const ra = await resolveMapsLink("https://maps.app.goo.gl/a", a.impl);
    expect(ra.ok).toBe(false);
    const b = fakeFetch({
      "https://maps.app.goo.gl/b": () => new Response(null, { status: 302 }),
    });
    const rb = await resolveMapsLink("https://maps.app.goo.gl/b", b.impl);
    expect(rb.ok).toBe(false);
  });

  it("un error de red se informa sin romper", async () => {
    const impl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const r = await resolveMapsLink("https://maps.app.goo.gl/abc", impl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("ECONNRESET");
  });
});

describe("normalizePhone / validatePostalCode", () => {
  it("normaliza separadores y valida el largo", () => {
    expect(normalizePhone("+54 223 479-2626")).toEqual({
      value: "+542234792626",
    });
    expect(normalizePhone("(223) 479.2626")).toEqual({ value: "2234792626" });
    expect(normalizePhone("1234567")).toHaveProperty("problem");
    expect(normalizePhone("12345678")).toEqual({ value: "12345678" });
    expect(normalizePhone(`+${"1".repeat(15)}`)).toEqual({
      value: `+${"1".repeat(15)}`,
    });
    expect(normalizePhone(`+${"1".repeat(16)}`)).toHaveProperty("problem");
  });
  it("rechaza letras, + en el medio y caracteres de SQL", () => {
    expect(normalizePhone("22347926ab")).toHaveProperty("problem");
    expect(normalizePhone("223+4792626")).toHaveProperty("problem");
    expect(normalizePhone("2234792626'; DROP TABLE users;--")).toHaveProperty(
      "problem",
    );
  });
  it("código postal: hasta 20 caracteres y charset acotado", () => {
    expect(validatePostalCode("B7600")).toEqual({ value: "B7600" });
    expect(validatePostalCode("08008")).toEqual({ value: "08008" });
    expect(validatePostalCode("A".repeat(20))).toEqual({
      value: "A".repeat(20),
    });
    expect(validatePostalCode("A".repeat(21))).toHaveProperty("problem");
    expect(validatePostalCode("76'00")).toHaveProperty("problem");
    expect(validatePostalCode("7600;")).toHaveProperty("problem");
    expect(validatePostalCode("")).toHaveProperty("problem");
  });
});

describe("parseInput", () => {
  it("exige una lista", () => {
    expect(parseInput({}).fatal).toContain("lista");
    expect(parseInput("x").fatal).toContain("lista");
  });
  it("marca code desconocido, repetido, campos desconocidos y tipos incorrectos", () => {
    const { entries } = parseInput([
      { code: "ALEM" },
      { code: "ALEM" },
      { code: "XXX" },
      { code: "BCN", telefono: "123" },
      { code: "PARK", phone: 123 },
      "texto",
    ]);
    expect(entries[0]?.problems).toEqual([]);
    expect(entries[1]?.problems.join()).toContain("repetido");
    expect(entries[2]?.problems.join()).toContain("desconocido");
    expect(entries[3]?.problems.join()).toContain(
      'campo desconocido "telefono"',
    );
    expect(entries[4]?.problems.join()).toContain("texto entre comillas");
    expect(entries[5]?.problems.join()).toContain("no es un objeto");
  });
  it("el ejemplo del repo (todo vacío) no trae problemas", () => {
    const example = JSON.parse(
      readFileSync(
        path.resolve(__dirname, "../../scripts/sedes-maps.example.json"),
        "utf8",
      ),
    ) as unknown;
    const { entries, fatal } = parseInput(example);
    expect(fatal).toBeNull();
    expect(entries).toHaveLength(8);
    for (const e of entries) expect(e.problems).toEqual([]);
  });
});

describe("buildRow", () => {
  it("entrada vacía se saltea sin problemas ni pedidos", async () => {
    const { impl, calls } = fakeFetch({});
    const row = await buildRow(input(), [], impl);
    expect(row.empty).toBe(true);
    expect(row.problems).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("link largo con 7 decimales: coordenadas, precisión OK y link guardado", async () => {
    const { impl } = fakeFetch({});
    const row = await buildRow(
      input({
        mapsLink: LARGO,
        phone: "+54 9 223 479 2626",
        postalCode: "B7600",
      }),
      [],
      impl,
    );
    expect(row.problems).toEqual([]);
    expect(row).toMatchObject({
      lat: -38.0334512,
      lng: -57.5521989,
      precisionOk: true,
      mapsUrl: LARGO,
      phone: "+5492234792626",
      postalCode: "B7600",
      placeId: null,
    });
  });

  it("link corto: resuelve y guarda el link largo", async () => {
    const { impl } = fakeFetch({
      "https://maps.app.goo.gl/abc": () => redirect(LARGO),
    });
    const row = await buildRow(
      input({ mapsLink: "https://maps.app.goo.gl/abc" }),
      [],
      impl,
    );
    expect(row.problems).toEqual([]);
    expect(row.mapsUrl).toBe(LARGO);
  });

  it("coordenadas con 4 decimales (link del centro del mapa) son un error y no se escribe maps_url", async () => {
    const { impl } = fakeFetch({});
    const row = await buildRow(
      input({
        mapsLink: "https://www.google.com/maps/place/X/@-38.0335,-57.5522,17z",
      }),
      [],
      impl,
    );
    expect(row.precisionOk).toBe(false);
    expect(row.problems.join()).toContain("menos de 5 decimales");
    expect(row.mapsUrl).toBeNull();
  });

  it("precisión mixta: latitud con 5 y longitud con 4 es error", async () => {
    const { impl } = fakeFetch({});
    const row = await buildRow(
      input({ mapsLink: "https://maps.google.com/?q=-38.03345,-57.5522" }),
      [],
      impl,
    );
    expect(row.precisionOk).toBe(false);
    expect(row.problems.length).toBeGreaterThan(0);
  });

  it("5 decimales justos en las dos coordenadas es válido", async () => {
    const { impl } = fakeFetch({});
    const row = await buildRow(
      input({ mapsLink: "https://maps.google.com/?q=-38.03345,-57.55219" }),
      [],
      impl,
    );
    expect(row.problems).toEqual([]);
    expect(row.precisionOk).toBe(true);
  });

  it("el Place ID del JSON gana sobre el del link", async () => {
    const { impl } = fakeFetch({});
    const row = await buildRow(
      input({
        mapsLink:
          "https://www.google.com/maps/search/?api=1&query=-38.03345,-57.55219&query_place_id=ChIJdelLink12345",
        placeId: "ChIJdelJson12345",
      }),
      [],
      impl,
    );
    expect(row.problems).toEqual([]);
    expect(row.placeId).toBe("ChIJdelJson12345");
  });

  it("sin Place ID en el JSON usa el del link", async () => {
    const { impl } = fakeFetch({});
    const row = await buildRow(
      input({
        mapsLink:
          "https://www.google.com/maps/search/?api=1&query=-38.03345,-57.55219&query_place_id=ChIJdelLink12345",
      }),
      [],
      impl,
    );
    expect(row.placeId).toBe("ChIJdelLink12345");
  });

  it("un Place ID inválido en el JSON es un error", async () => {
    const { impl } = fakeFetch({});
    const row = await buildRow(input({ placeId: "corto" }), [], impl);
    expect(row.problems.join()).toContain("placeId inválido");
    const row2 = await buildRow(
      input({ placeId: "ChIJ'; DROP TABLE x;--" }),
      [],
      impl,
    );
    expect(row2.problems.join()).toContain("placeId inválido");
  });

  it("solo Place ID, solo teléfono o solo CP son entradas válidas (sin coordenadas)", async () => {
    const { impl } = fakeFetch({});
    const row = await buildRow(input({ phone: "+542234792626" }), [], impl);
    expect(row.problems).toEqual([]);
    expect(row.empty).toBe(false);
    expect(row.lat).toBeNull();
  });

  it("un link de Place ID sin coordenadas es un error (hay mapsLink pero no sirve)", async () => {
    const { impl } = fakeFetch({});
    const row = await buildRow(
      input({
        mapsLink:
          "https://www.google.com/maps/search/?api=1&query=Juan+B+Justo&query_place_id=ChIJdelLink12345",
      }),
      [],
      impl,
    );
    expect(row.problems.join()).toContain("no trae coordenadas");
  });

  it("un link de otro sitio es un error con el motivo", async () => {
    const { impl, calls } = fakeFetch({});
    const row = await buildRow(
      input({ mapsLink: "https://example.com/foo" }),
      [],
      impl,
    );
    expect(row.problems.join()).toContain("otro sitio");
    expect(calls).toEqual([]);
  });

  it("un link de Google Maps sin datos legibles es un error", async () => {
    const { impl } = fakeFetch({});
    const row = await buildRow(
      input({ mapsLink: "https://www.google.com/maps/place/Juan+B+Justo" }),
      [],
      impl,
    );
    expect(row.problems.join()).toContain("no se encontraron coordenadas");
  });

  it("conserva los problemas heredados de la validación del JSON", async () => {
    const { impl } = fakeFetch({});
    const row = await buildRow(
      input({ phone: "+542234792626" }),
      ["algo previo"],
      impl,
    );
    expect(row.problems).toEqual(["algo previo"]);
  });

  it("un teléfono o CP inválidos son errores", async () => {
    const { impl } = fakeFetch({});
    const row = await buildRow(
      input({ phone: "abc", postalCode: "7600;" }),
      [],
      impl,
    );
    expect(row.problems).toHaveLength(2);
  });
});

describe("chooseMapsUrl", () => {
  it("usa el link largo si entra en la columna", () => {
    expect(chooseMapsUrl(LARGO, -38.03, -57.55, null)).toEqual({
      url: LARGO,
      note: null,
    });
  });
  it("el borde exacto de 500 caracteres entra, 501 no", () => {
    const base = "https://www.google.com/maps/place/";
    const exact = base + "a".repeat(MAPS_URL_MAX - base.length);
    expect(exact).toHaveLength(MAPS_URL_MAX);
    expect(chooseMapsUrl(exact, -38.03345, -57.55219, null).url).toBe(exact);
    const over = exact + "a";
    const r = chooseMapsUrl(over, -38.03345, -57.55219, "ChIJabc12345");
    expect(r.url).toBe(
      "https://www.google.com/maps/search/?api=1&query=-38.033450,-57.552190&query_place_id=ChIJabc12345",
    );
    expect(r.note).not.toBeNull();
  });
  it("usa el link canónico si el largo trae punto y coma, barra invertida, control o -->", () => {
    for (const bad of [
      `${LARGO};x`,
      `${LARGO}\\x`,
      `${LARGO}\u0001`,
      `${LARGO}-->`,
    ]) {
      const r = chooseMapsUrl(bad, -38.03345, -57.55219, null);
      expect(r.url).toBe(
        "https://www.google.com/maps/search/?api=1&query=-38.033450,-57.552190",
      );
      expect(r.note).not.toBeNull();
    }
  });
});

describe("sqlString", () => {
  it("duplica comillas simples y escapa la barra invertida", () => {
    expect(sqlString("a'b")).toBe("'a''b'");
    expect(sqlString("a\\b")).toBe("'a\\\\b'");
    expect(sqlString("x'; DROP TABLE users;--")).toBe(
      "'x''; DROP TABLE users;--'",
    );
  });
});

function row(over: Partial<SedeRow>): SedeRow {
  return {
    code: "ALEM",
    lat: null,
    lng: null,
    precisionOk: null,
    placeId: null,
    mapsUrl: null,
    phone: null,
    postalCode: null,
    notes: [],
    problems: [],
    empty: false,
    ...over,
  };
}

describe("renderMigrationSql", () => {
  const full = row({
    code: "ALEM",
    lat: -38.0334512,
    lng: -57.5521989,
    precisionOk: true,
    placeId: "ChIJabc1234567",
    mapsUrl: LARGO,
    phone: "+5492234792626",
    postalCode: "B7600",
  });

  it("un UPDATE por sede keyed por code y tenant_id = 1, con coordenadas a 6 decimales", () => {
    const sql = renderMigrationSql([full], "2026-10-07");
    expect(sql).toContain("latitude = -38.033451,");
    expect(sql).toMatch(/longitude = -57\.552199,\n/);
    expect(sql).toContain("place_id = 'ChIJabc1234567'");
    expect(sql).toContain("phone = '+5492234792626'");
    expect(sql).toContain("postal_code = 'B7600'");
    expect(sql).toContain("WHERE code = 'ALEM' AND tenant_id = 1;");
    expect(sql).toContain("2026-10-07");
    expect(sql).toContain("links de Google Maps provistos por Franco");
    expect(sql).toContain(MIGRATION_FILE);
  });

  it("solo las columnas con dato", () => {
    const sql = renderMigrationSql(
      [row({ code: "BCN", phone: "+34680774331" })],
      "2026-10-07",
    );
    expect(sql).toContain("SET phone = '+34680774331'");
    expect(sql).not.toContain("latitude");
    expect(sql).not.toContain("place_id");
    expect(sql).not.toContain("maps_url");
    expect(sql).not.toContain("postal_code");
  });

  it("omite las entradas vacías y las que tienen problemas", () => {
    const sql = renderMigrationSql(
      [
        row({ code: "CONST", empty: true }),
        row({ code: "JUJUY", phone: "+5492230000000", problems: ["x"] }),
        row({ code: "MORENO", phone: "+5492231111111" }),
      ],
      "2026-10-07",
    );
    expect(sql).not.toContain("'CONST'");
    expect(sql).not.toContain("'JUJUY'");
    expect(sql).toContain("'MORENO'");
  });

  it("sin punto y coma dentro de comentarios y con el separador entre sentencias: el runner parte bien", () => {
    const sql = renderMigrationSql(
      [
        full,
        row({ code: "BCN", phone: "+34680774331" }),
        row({ code: "PARK", postalCode: "7600" }),
      ],
      "2026-10-07",
    );
    for (const line of sql.split("\n")) {
      if (
        line.trimStart().startsWith("--") &&
        !line.includes("--> statement-breakpoint")
      ) {
        expect(line).not.toContain(";");
      }
    }
    const statements = splitSqlStatements(sql);
    // el primer fragmento incluye la cabecera de comentarios
    expect(statements).toHaveLength(3);
    expect(statements.every((s) => s.includes("UPDATE branches"))).toBe(true);
    expect(
      statements.every((s) => s.trimEnd().endsWith("tenant_id = 1;")),
    ).toBe(true);
  });

  it("escapa comillas simples en los valores", () => {
    const sql = renderMigrationSql(
      [
        row({
          postalCode: "x",
          mapsUrl: "https://www.google.com/maps/place/L'Eixample",
        }),
      ],
      "2026-10-07",
    );
    expect(sql).toContain(
      "maps_url = 'https://www.google.com/maps/place/L''Eixample'",
    );
  });

  it("cada sentencia filtra por code y tenant_id = 1 (nunca un UPDATE sin WHERE)", () => {
    const sql = renderMigrationSql(
      [full, row({ code: "BCN", phone: "+34680774331" })],
      "2026-10-07",
    );
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    for (const stmt of statements) {
      expect(
        stmt.match(/WHERE code = '[A-Z]+' AND tenant_id = 1;$/),
      ).not.toBeNull();
    }
  });
});

describe("renderTable", () => {
  it("muestra code, coordenadas, precisión y problemas", () => {
    const table = renderTable([
      row({
        code: "ALEM",
        lat: -38.0334512,
        lng: -57.5521989,
        precisionOk: true,
        phone: "+5492234792626",
      }),
      row({ code: "CONST", empty: true }),
      row({ code: "BCN", precisionOk: false, problems: ["x"] }),
    ]);
    expect(table).toContain("ALEM");
    expect(table).toContain("-38.0334512");
    expect(table).toContain("OK");
    expect(table).toContain("BAJA");
    expect(table).toContain("(sin datos, se saltea)");
    expect(table).toContain("1 (ver abajo)");
  });
});
