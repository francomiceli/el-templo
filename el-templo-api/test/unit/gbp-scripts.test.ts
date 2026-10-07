import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_PORT,
  REDIRECT_URI,
  buildConsentUrl,
  exchangeAuthorizationCode,
} from "../../scripts/gbp-authorize";
import {
  SEDES_SEED,
  listAllLocations,
  matchLocationsToSedes,
  renderMigrationSql,
  type GbpLocation,
} from "../../scripts/gbp-list-locations";

/**
 * Fase 195-09: scripts locales de GBP (refresh token y mapeo ficha → sede).
 * Solo lógica con mocks: `fetch` va siempre mockeado y estos tests NUNCA
 * hablan con Google ni levantan el servidor de loopback.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

function loc(id: string, title: string, address: string): GbpLocation {
  return { name: `locations/${id}`, title, address };
}

/** Una ficha por sede, con la dirección real del seed. */
function fullSet(): GbpLocation[] {
  return [
    loc("1", "El Templo Constitución", "Av. Constitución 6745, Mar del Plata"),
    loc("2", "El Templo Jujuy", "Jujuy 3761, Mar del Plata"),
    loc("3", "El Templo Moreno", "Moreno 3751, Mar del Plata"),
    loc("4", "El Templo JBJ", "Juan B. Justo 1018, Mar del Plata"),
    loc("5", "El Templo Alberti", "Alberti 2024, Mar del Plata"),
    loc("6", "El Templo Mario Bravo", "Mario Bravo 618, Mar del Plata"),
    loc("7", "El Templo Barcelona", "Carrer de Provença 368, Barcelona"),
  ];
}

describe("gbp-authorize", () => {
  it("la redirect URI es el loopback 127.0.0.1:53682/callback", () => {
    expect(AUTH_PORT).toBe(53682);
    expect(REDIRECT_URI).toBe("http://127.0.0.1:53682/callback");
  });

  it("la URL de consentimiento pide acceso offline, consentimiento forzado y solo business.manage", () => {
    const url = new URL(buildConsentUrl("cid-123", "estado-xyz"));
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    const p = url.searchParams;
    expect(p.get("client_id")).toBe("cid-123");
    expect(p.get("redirect_uri")).toBe("http://127.0.0.1:53682/callback");
    expect(p.get("response_type")).toBe("code");
    expect(p.get("scope")).toBe(
      "https://www.googleapis.com/auth/business.manage",
    );
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("state")).toBe("estado-xyz");
  });

  it("canjea el código y devuelve el refresh token", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        access_token: "acc-secreto",
        refresh_token: "ref-1",
        expires_in: 3599,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await exchangeAuthorizationCode({
      clientId: "cid",
      clientSecret: "csec",
      code: "code-abc",
    });

    expect(token).toBe("ref-1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-abc");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("client_secret")).toBe("csec");
    expect(body.get("redirect_uri")).toBe(REDIRECT_URI);
  });

  it("un rechazo de Google lanza sin client secret, código ni access token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          { error: "invalid_grant", error_description: "Bad code code-abc" },
          400,
        ),
      ),
    );
    let message = "";
    try {
      await exchangeAuthorizationCode({
        clientId: "cid",
        clientSecret: "csec-secreto",
        code: "code-abc",
      });
    } catch (err: unknown) {
      message = err instanceof Error ? err.message : "";
    }
    expect(message).toContain("400");
    expect(message).toContain("invalid_grant");
    expect(message).not.toContain("csec-secreto");
    expect(message).not.toContain("code-abc");
  });

  it("sin refresh_token en la respuesta explica cómo revocar y repetir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ access_token: "acc" })),
    );
    await expect(
      exchangeAuthorizationCode({
        clientId: "c",
        clientSecret: "s",
        code: "x",
      }),
    ).rejects.toThrow(/refresh_token/);
  });
});

describe("matchLocationsToSedes", () => {
  it("mapea las 7 sedes por número de calle", () => {
    const r = matchLocationsToSedes(fullSet());
    expect(r.unmatchedSedes).toEqual([]);
    expect(r.unmatchedLocations).toEqual([]);
    expect(
      Object.fromEntries(r.matches.map((m) => [m.code, m.locationId])),
    ).toEqual({
      CONST: "1",
      JUJUY: "2",
      MORENO: "3",
      ALEM: "4",
      ALBERTI: "5",
      MOGOTES: "6",
      BCN: "7",
    });
  });

  it("el seed cubre las 7 sedes con sus números de calle", () => {
    expect(SEDES_SEED.map((s) => `${s.code}:${s.streetNumber}`)).toEqual([
      "CONST:6745",
      "JUJUY:3761",
      "MORENO:3751",
      "ALEM:1018",
      "ALBERTI:2024",
      "MOGOTES:618",
      "BCN:368",
    ]);
  });

  it("una sede sin ficha queda sin mapear y las fichas ajenas se informan", () => {
    const set = fullSet().filter((l) => l.name !== "locations/6");
    set.push(loc("99", "Otro negocio", "Calle Cualquiera 77, Rosario"));
    const r = matchLocationsToSedes(set);
    expect(r.unmatchedSedes).toEqual([
      { code: "MOGOTES", reason: "sin_ficha" },
    ]);
    expect(r.unmatchedLocations.map((l) => l.name)).toEqual(["locations/99"]);
    expect(r.matches).toHaveLength(6);
  });

  it("dos fichas con el mismo número de calle: la sede queda ambigua (no se adivina)", () => {
    const set = [
      ...fullSet(),
      loc("8", "El Templo Jujuy (duplicada)", "Jujuy 3761, Mar del Plata"),
    ];
    const r = matchLocationsToSedes(set);
    expect(r.unmatchedSedes).toEqual([{ code: "JUJUY", reason: "ambigua" }]);
    expect(r.matches.map((m) => m.code)).not.toContain("JUJUY");
  });

  it("una ficha que encaja con dos sedes no se asigna a ninguna", () => {
    const r = matchLocationsToSedes([
      loc("5", "Rara", "Esquina 618 y 3761, Mar del Plata"),
    ]);
    expect(r.matches).toEqual([]);
    expect(
      r.unmatchedSedes
        .filter((s) => s.reason === "ambigua")
        .map((s) => s.code)
        .sort(),
    ).toEqual(["JUJUY", "MOGOTES"]);
  });

  it("no confunde un número más largo que contiene el de calle", () => {
    const r = matchLocationsToSedes([
      loc("1", "No es", "Ruta 61000, Mar del Plata"),
      loc("2", "Tampoco", "Calle 36810, Mar del Plata"),
    ]);
    expect(r.matches).toEqual([]);
  });

  it("un nombre de ficha con id no numérico no se mapea", () => {
    const r = matchLocationsToSedes([
      { name: "locations/abc", title: "Rota", address: "Jujuy 3761" },
    ]);
    expect(r.matches).toEqual([]);
    expect(r.unmatchedSedes.find((s) => s.code === "JUJUY")?.reason).toBe(
      "ambigua",
    );
  });
});

describe("renderMigrationSql", () => {
  const matches = matchLocationsToSedes(fullSet()).matches;

  it("escribe un UPDATE por coincidencia keyed por code y tenant_id = 1", () => {
    const sql = renderMigrationSql(matches);
    expect(sql).toContain(
      "UPDATE branches SET gbp_location_id = '1' WHERE code = 'CONST' AND tenant_id = 1;",
    );
    expect(sql).toContain(
      "UPDATE branches SET gbp_location_id = '7' WHERE code = 'BCN' AND tenant_id = 1;",
    );
    expect(sql.match(/^UPDATE branches/gm)).toHaveLength(7);
  });

  it("la cabecera avisa que es un borrador a revisar", () => {
    const sql = renderMigrationSql(matches);
    expect(sql).toMatch(/BORRADOR/);
    expect(sql).toMatch(/REVISAR A MANO/);
  });

  it("ningún comentario contiene punto y coma (el runner parte por ;)", () => {
    const evil = [
      {
        ...matches[0],
        location: { ...matches[0].location, title: "Sede; DROP TABLE x\nmás" },
      },
    ];
    const sql = renderMigrationSql(evil);
    const comments = sql.split("\n").filter((l) => l.startsWith("--"));
    expect(comments.length).toBeGreaterThan(3);
    expect(comments.filter((l) => l.includes(";"))).toEqual([]);
    expect(sql).not.toContain("DROP TABLE x\n");
  });

  it("sin coincidencias no genera ningún UPDATE", () => {
    expect(renderMigrationSql([]).match(/^UPDATE/gm)).toBeNull();
  });
});

describe("listAllLocations", () => {
  it("lista cuentas y ubicaciones con paginado y token de lectura", async () => {
    const calls: Array<{ url: string; auth: string | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init: RequestInit) => {
        const raw = String(url);
        calls.push({
          url: raw,
          auth: (init.headers as Record<string, string>).authorization,
        });
        if (
          raw ===
          "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
        ) {
          return json({
            accounts: [{ name: "accounts/10" }, { name: "evil/../x" }],
          });
        }
        const u = new URL(raw);
        expect(u.pathname).toBe("/v1/accounts/10/locations");
        expect(u.searchParams.get("readMask")).toBe(
          "name,title,storefrontAddress",
        );
        if (!u.searchParams.get("pageToken")) {
          return json({
            locations: [
              {
                name: "locations/1",
                title: "Uno",
                storefrontAddress: {
                  addressLines: ["Jujuy 3761"],
                  locality: "Mar del Plata",
                  administrativeArea: "Buenos Aires",
                },
              },
            ],
            nextPageToken: "p2",
          });
        }
        return json({ locations: [{ name: "locations/2", title: "Dos" }] });
      }),
    );

    const result = await listAllLocations("tok-lectura");

    expect(result).toEqual([
      {
        name: "locations/1",
        title: "Uno",
        address: "Jujuy 3761, Mar del Plata, Buenos Aires",
      },
      { name: "locations/2", title: "Dos", address: "" },
    ]);
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.auth === "Bearer tok-lectura")).toBe(true);
    // Solo GET de lectura a las dos APIs de listado: nada de escritura.
    expect(calls.every((c) => !c.url.includes("validateOnly"))).toBe(true);
  });

  it("un error de Google lanza con el status y sin el token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({}, 403)),
    );
    let message = "";
    try {
      await listAllLocations("tok-secreto");
    } catch (err: unknown) {
      message = err instanceof Error ? err.message : "";
    }
    expect(message).toContain("403");
    expect(message).not.toContain("tok-secreto");
  });
});
