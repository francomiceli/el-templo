import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPublicKey,
  createVerify,
  generateKeyPairSync,
} from "node:crypto";
import {
  GOOGLE_TOKEN_URL,
  GoogleApiError,
  SEARCH_CONSOLE_SCOPE,
  buildServiceAccountJwt,
  refreshTokenAccessToken,
  serviceAccountAccessToken,
} from "../../src/modules/marketing/google/auth";
import {
  getGbpConfig,
  getSearchConsoleConfig,
  resolveGbpConfig,
  resolveSearchConsoleConfig,
} from "../../src/modules/marketing/google/config";

/**
 * Fase 195-09: autenticación de Google sin SDK (JWT RS256 con node:crypto) y
 * config por entorno. `fetch` va siempre mockeado: este archivo NUNCA llama a
 * Google.
 */
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const PRIVATE_PEM = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
const PUBLIC_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();

const SA = {
  client_email: "sc-reader@proyecto.iam.gserviceaccount.com",
  private_key: PRIVATE_PEM,
  private_key_id: "kid-123",
};

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("buildServiceAccountJwt", () => {
  const NOW = 1_790_000_000;

  it("produce un JWT de 3 partes con header RS256 y claims correctos", () => {
    const jwt = buildServiceAccountJwt(SA, SEARCH_CONSOLE_SCOPE, NOW);
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    expect(decode(parts[0])).toEqual({
      alg: "RS256",
      typ: "JWT",
      kid: "kid-123",
    });
    expect(decode(parts[1])).toEqual({
      iss: SA.client_email,
      scope: SEARCH_CONSOLE_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: NOW,
      exp: NOW + 3600,
    });
  });

  it("la firma verifica con la clave pública (RSA-SHA256)", () => {
    const jwt = buildServiceAccountJwt(SA, SEARCH_CONSOLE_SCOPE, NOW);
    const [h, c, s] = jwt.split(".");
    const ok = createVerify("RSA-SHA256")
      .update(`${h}.${c}`)
      .verify(createPublicKey(PUBLIC_PEM), Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });

  it("la firma NO verifica si se altera el contenido", () => {
    const jwt = buildServiceAccountJwt(SA, SEARCH_CONSOLE_SCOPE, NOW);
    const [h, , s] = jwt.split(".");
    const tampered = Buffer.from(
      JSON.stringify({
        iss: "otro@x.com",
        scope: "x",
        aud: GOOGLE_TOKEN_URL,
        iat: NOW,
        exp: NOW + 3600,
      }),
    ).toString("base64url");
    const ok = createVerify("RSA-SHA256")
      .update(`${h}.${tampered}`)
      .verify(createPublicKey(PUBLIC_PEM), Buffer.from(s, "base64url"));
    expect(ok).toBe(false);
  });

  it("sin private_key_id el header no lleva kid", () => {
    const { client_email, private_key } = SA;
    const jwt = buildServiceAccountJwt({ client_email, private_key }, "s", NOW);
    expect(decode(jwt.split(".")[0])).toEqual({ alg: "RS256", typ: "JWT" });
  });

  it("una clave privada inválida lanza sin filtrar la clave", () => {
    const bad = {
      client_email: "a@b.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nSECRETO-DE-PRUEBA\n-----END PRIVATE KEY-----",
    };
    let message = "";
    try {
      buildServiceAccountJwt(bad, "s", NOW);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GoogleApiError);
      message = err instanceof Error ? err.message : "";
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("SECRETO-DE-PRUEBA");
  });
});

describe("serviceAccountAccessToken", () => {
  it("canjea el JWT en el token endpoint y devuelve el access_token", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ access_token: "tok", expires_in: 3599 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await serviceAccountAccessToken(
      SA,
      SEARCH_CONSOLE_SCOPE,
      1_790_000_000,
    );

    expect(token).toBe("tok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    expect(body.get("assertion")?.split(".")).toHaveLength(3);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("400 invalid_grant lanza sin incluir la clave privada ni la assertion", async () => {
    let assertion = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        assertion =
          new URLSearchParams(String(init.body)).get("assertion") ?? "";
        return new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: `Bad JWT ${assertion}`,
          }),
          { status: 400 },
        );
      }),
    );

    let message = "";
    let status = -1;
    try {
      await serviceAccountAccessToken(SA, SEARCH_CONSOLE_SCOPE);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GoogleApiError);
      message = err instanceof Error ? err.message : "";
      status = err instanceof GoogleApiError ? err.status : -1;
    }
    expect(status).toBe(400);
    expect(message).toContain("400");
    expect(message).toContain("invalid_grant");
    expect(assertion.length).toBeGreaterThan(20);
    expect(message).not.toContain(assertion);
    expect(message).not.toContain("BEGIN PRIVATE KEY");
    expect(message).not.toContain("Bad JWT");
  });

  it("respuesta sin access_token lanza", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ foo: 1 }))),
    );
    await expect(serviceAccountAccessToken(SA, "s")).rejects.toThrow(
      /access_token/,
    );
  });

  it("error de red lanza sin el mensaje crudo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed: assertion=SECRETO");
      }),
    );
    let message = "";
    try {
      await serviceAccountAccessToken(SA, "s");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GoogleApiError);
      message = err instanceof Error ? err.message : "";
    }
    expect(message).toMatch(/red/);
    expect(message).not.toContain("SECRETO");
  });
});

describe("refreshTokenAccessToken", () => {
  it("manda grant_type=refresh_token con las 3 credenciales", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ access_token: "gbp-tok" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await refreshTokenAccessToken({
      clientId: "cid",
      clientSecret: "csecret",
      refreshToken: "rtoken",
    });

    expect(token).toBe("gbp-tok");
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("client_secret")).toBe("csecret");
    expect(body.get("refresh_token")).toBe("rtoken");
  });

  it("401 invalid_client lanza sin client_secret ni refresh_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "invalid_client" }), {
            status: 401,
          }),
      ),
    );
    let message = "";
    try {
      await refreshTokenAccessToken({
        clientId: "cid",
        clientSecret: "csecret-xyz",
        refreshToken: "rtoken-xyz",
      });
    } catch (err: unknown) {
      message = err instanceof Error ? err.message : "";
    }
    expect(message).toContain("401");
    expect(message).toContain("invalid_client");
    expect(message).not.toContain("csecret-xyz");
    expect(message).not.toContain("rtoken-xyz");
  });
});

describe("config de Google", () => {
  function saBase64(sa: object): string {
    return Buffer.from(JSON.stringify(sa)).toString("base64");
  }

  describe("getSearchConsoleConfig", () => {
    it("null sin GOOGLE_SC_SERVICE_ACCOUNT_BASE64", () => {
      vi.stubEnv("GOOGLE_SC_SERVICE_ACCOUNT_BASE64", "");
      expect(getSearchConsoleConfig()).toBeNull();
      expect(resolveSearchConsoleConfig().reason).toContain(
        "GOOGLE_SC_SERVICE_ACCOUNT_BASE64",
      );
    });

    it("null si el base64 no es JSON", () => {
      vi.stubEnv(
        "GOOGLE_SC_SERVICE_ACCOUNT_BASE64",
        Buffer.from("no soy json").toString("base64"),
      );
      expect(getSearchConsoleConfig()).toBeNull();
      expect(resolveSearchConsoleConfig().reason).not.toBeNull();
    });

    it.each([
      ["sin client_email", { private_key: "k" }],
      ["sin private_key", { client_email: "a@b.com" }],
      ["client_email vacío", { client_email: "  ", private_key: "k" }],
      ["private_key no string", { client_email: "a@b.com", private_key: 7 }],
    ])("null %s", (_n, sa) => {
      vi.stubEnv("GOOGLE_SC_SERVICE_ACCOUNT_BASE64", saBase64(sa));
      expect(getSearchConsoleConfig()).toBeNull();
    });

    it("config válida con el siteUrl por defecto", () => {
      vi.stubEnv("GOOGLE_SC_SERVICE_ACCOUNT_BASE64", saBase64(SA));
      vi.stubEnv("GOOGLE_SC_SITE_URL", "");
      const config = getSearchConsoleConfig();
      expect(config?.siteUrl).toBe("sc-domain:eltemplo.org");
      expect(config?.serviceAccount.client_email).toBe(SA.client_email);
      expect(config?.serviceAccount.private_key_id).toBe("kid-123");
    });

    it("respeta GOOGLE_SC_SITE_URL", () => {
      vi.stubEnv("GOOGLE_SC_SERVICE_ACCOUNT_BASE64", saBase64(SA));
      vi.stubEnv("GOOGLE_SC_SITE_URL", "https://eltemplo.org/");
      expect(getSearchConsoleConfig()?.siteUrl).toBe("https://eltemplo.org/");
    });

    it("el motivo nunca incluye la clave", () => {
      vi.stubEnv(
        "GOOGLE_SC_SERVICE_ACCOUNT_BASE64",
        saBase64({ client_email: "a@b.com", private_key: 0 }),
      );
      const { reason } = resolveSearchConsoleConfig();
      expect(reason).not.toContain("a@b.com");
    });
  });

  describe("getGbpConfig", () => {
    function gbpEnv(over: Record<string, string> = {}): void {
      const all: Record<string, string> = {
        GBP_SYNC_MODE: "dry-run",
        GBP_OAUTH_CLIENT_ID: "cid",
        GBP_OAUTH_CLIENT_SECRET: "csecret",
        GBP_REFRESH_TOKEN: "rtoken",
        ...over,
      };
      for (const [k, v] of Object.entries(all)) vi.stubEnv(k, v);
    }

    it("null por defecto (GBP_SYNC_MODE vacío o 'off')", () => {
      gbpEnv({ GBP_SYNC_MODE: "" });
      expect(getGbpConfig()).toBeNull();
      expect(resolveGbpConfig().reason).toContain("off");
      gbpEnv({ GBP_SYNC_MODE: "off" });
      expect(getGbpConfig()).toBeNull();
    });

    it("modo inválido → null con motivo, aunque haya credenciales", () => {
      gbpEnv({ GBP_SYNC_MODE: "apply!" });
      const r = resolveGbpConfig();
      expect(r.config).toBeNull();
      expect(r.reason).toContain("inválido");
    });

    it.each([
      "GBP_OAUTH_CLIENT_ID",
      "GBP_OAUTH_CLIENT_SECRET",
      "GBP_REFRESH_TOKEN",
    ])("null si falta %s", (name) => {
      gbpEnv({ [name]: "" });
      const r = resolveGbpConfig();
      expect(r.config).toBeNull();
      expect(r.reason).toContain(name);
    });

    it("dry-run y apply con credenciales completas", () => {
      gbpEnv({ GBP_SYNC_MODE: "dry-run" });
      expect(getGbpConfig()).toEqual({
        mode: "dry-run",
        clientId: "cid",
        clientSecret: "csecret",
        refreshToken: "rtoken",
      });
      gbpEnv({ GBP_SYNC_MODE: "apply" });
      expect(getGbpConfig()?.mode).toBe("apply");
    });

    it("el modo es case-insensitive y se recorta", () => {
      gbpEnv({ GBP_SYNC_MODE: "  APPLY " });
      expect(getGbpConfig()?.mode).toBe("apply");
    });

    it("el motivo no incluye valores de credenciales", () => {
      gbpEnv({ GBP_REFRESH_TOKEN: "" });
      const { reason } = resolveGbpConfig();
      expect(reason).not.toContain("csecret");
      expect(reason).not.toContain("cid");
    });
  });
});
