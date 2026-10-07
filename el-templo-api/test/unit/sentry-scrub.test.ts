import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REDACTED,
  scrubBreadcrumb,
  scrubSecretParams,
  scrubSentryEvent,
  scrubValue,
} from "../../src/sentry-scrub";

/**
 * Fase 195-08 (T-195-31): ningún secreto llega a Sentry. El token de Meta viaja
 * en la URL del GET de Insights, así que el breadcrumb HTTP lo llevaría.
 */
describe("scrubSecretParams", () => {
  it.each([
    "access_token",
    "refresh_token",
    "client_secret",
    "assertion",
    "token",
    "password",
    "currentPassword",
    "newPassword",
  ])("redacta %s en una URL con otros parámetros", (key) => {
    const url = `https://graph.facebook.com/v26.0/act_1/insights?level=campaign&${key}=SECRETO123&limit=500`;
    const out = scrubSecretParams(url);
    expect(out).not.toContain("SECRETO123");
    expect(out).toContain(`${key}=${REDACTED}`);
    expect(out).toContain("level=campaign");
    expect(out).toContain("limit=500");
  });

  it("redacta al principio de una query string y en medio de un texto", () => {
    expect(scrubSecretParams("access_token=abc&x=1")).toBe(
      `access_token=${REDACTED}&x=1`,
    );
    expect(scrubSecretParams("fallo con access_token=abc en la llamada")).toBe(
      `fallo con access_token=${REDACTED} en la llamada`,
    );
  });

  it("es insensible a mayúsculas en la clave", () => {
    expect(scrubSecretParams("?Access_Token=abc")).toBe(
      `?Access_Token=${REDACTED}`,
    );
  });

  it("no toca claves que solo terminan igual (x_token, mytoken)", () => {
    expect(scrubSecretParams("?csrf_token=abc&mytoken=1")).toBe(
      "?csrf_token=abc&mytoken=1",
    );
  });

  it("redacta JSON serializado dentro de un texto", () => {
    const text = '{"error":"x","access_token":"ABC","token" : "DEF","n":1}';
    const out = scrubSecretParams(text);
    expect(out).not.toContain("ABC");
    expect(out).not.toContain("DEF");
    expect(out).toContain('"n":1');
  });

  it("deja intacto un texto sin secretos", () => {
    expect(scrubSecretParams("GET /api/health 200")).toBe(
      "GET /api/health 200",
    );
  });
});

describe("scrubValue", () => {
  it("redacta por clave en cualquier profundidad, también dentro de arrays", () => {
    const out = scrubValue({
      email: "a@b.c",
      password: "p1",
      nested: { access_token: "t1", list: [{ refresh_token: "t2" }, "ok"] },
      client_secret: "s",
      assertion: "a",
      token: "t",
      currentPassword: "c",
      newPassword: "n",
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/"(p1|t1|t2|s|a|t|c|n)"/);
    expect(out.email).toBe("a@b.c");
    expect((out.nested as { list: unknown[] }).list[1]).toBe("ok");
    for (const k of [
      "password",
      "client_secret",
      "assertion",
      "token",
      "currentPassword",
      "newPassword",
    ]) {
      expect(out[k]).toBe(REDACTED);
    }
  });

  it("las claves se comparan sin distinguir mayúsculas", () => {
    expect(
      (scrubValue({ Access_Token: "x" }) as Record<string, unknown>)
        .Access_Token,
    ).toBe(REDACTED);
  });

  it("limpia parámetros dentro de los strings y no muta la entrada", () => {
    const input = { url: "https://x/y?token=abc", n: 1 };
    const out = scrubValue(input) as { url: string; n: number };
    expect(out.url).toBe(`https://x/y?token=${REDACTED}`);
    expect(out.n).toBe(1);
    expect(input.url).toBe("https://x/y?token=abc");
  });

  it("valores no objeto pasan tal cual y una estructura muy profunda no cuelga", () => {
    expect(scrubValue(5)).toBe(5);
    expect(scrubValue(null)).toBeNull();
    let deep: Record<string, unknown> = { password: "x" };
    for (let i = 0; i < 50; i += 1) deep = { child: deep };
    expect(() => scrubValue(deep)).not.toThrow();
  });
});

describe("scrubSentryEvent", () => {
  it("limpia request.data, url, query_string, extra y breadcrumbs", () => {
    const event = scrubSentryEvent({
      request: {
        data: { password: "p", nested: { access_token: "t" } },
        url: "https://api.eltemplo.org/x?token=URLTOKEN",
        query_string: "a=1&refresh_token=QSTOKEN",
      },
      extra: { client_secret: "CS", note: "ok" },
      breadcrumbs: [
        {
          message: "POST ?access_token=MSGTOKEN",
          data: {
            url: "https://graph.facebook.com/v26.0/act_1/insights?access_token=CRUMBTOKEN",
            status_code: 200,
          },
        },
        { message: "sin datos" },
      ],
    });
    const raw = JSON.stringify(event);
    for (const secret of [
      '"p"',
      '"t"',
      "URLTOKEN",
      "QSTOKEN",
      '"CS"',
      "MSGTOKEN",
      "CRUMBTOKEN",
    ]) {
      expect(raw).not.toContain(secret);
    }
    expect(event.extra?.note).toBe("ok");
    expect(event.breadcrumbs?.[0].data?.status_code).toBe(200);
    expect(event.breadcrumbs?.[1].message).toBe("sin datos");
  });

  it("query_string como objeto también se redacta", () => {
    const event = scrubSentryEvent({
      request: { query_string: { access_token: "OBJTOKEN", a: "1" } },
    });
    expect(JSON.stringify(event)).not.toContain("OBJTOKEN");
    expect((event.request?.query_string as Record<string, string>).a).toBe("1");
  });

  it("un evento sin nada que limpiar pasa igual", () => {
    expect(scrubSentryEvent({})).toEqual({});
    expect(scrubSentryEvent({ request: {} })).toEqual({ request: {} });
  });
});

describe("scrubBreadcrumb", () => {
  it("devuelve el breadcrumb con la URL limpia", () => {
    const crumb = scrubBreadcrumb({
      message: "GET",
      data: {
        url: "https://graph.facebook.com/v26.0/x?access_token=ZZZ&limit=1",
      },
    });
    expect(JSON.stringify(crumb)).not.toContain("ZZZ");
    expect(crumb.data?.url).toContain("limit=1");
  });

  it("un breadcrumb sin data pasa", () => {
    expect(scrubBreadcrumb({ message: "hola" })).toEqual({ message: "hola" });
  });
});

describe("instrument.ts conecta el scrub a Sentry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@sentry/node");
  });

  it("beforeSend y beforeBreadcrumb limpian secretos (con DSN)", async () => {
    vi.resetModules();
    const init = vi.fn();
    vi.doMock("@sentry/node", () => ({ init }));
    vi.stubEnv("SENTRY_DSN", "https://key@example.ingest.sentry.io/1");

    await import("../../src/instrument.js");

    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0][0] as {
      beforeSend: (event: unknown, hint: unknown) => unknown;
      beforeBreadcrumb: (crumb: unknown) => unknown;
    };

    const event = options.beforeSend(
      {
        request: { data: { password: "PW", access_token: "TOK" } },
        breadcrumbs: [{ data: { url: "https://g/x?access_token=CRUMB" } }],
      },
      {},
    );
    const raw = JSON.stringify(event);
    for (const secret of ["PW", "TOK", "CRUMB"])
      expect(raw).not.toContain(secret);

    const crumb = options.beforeBreadcrumb({
      data: { url: "https://g/x?refresh_token=RT&a=1" },
    });
    expect(JSON.stringify(crumb)).not.toContain("RT&");
    expect(JSON.stringify(crumb)).toContain("a=1");
  });

  it("sin DSN no inicia Sentry", async () => {
    vi.resetModules();
    const init = vi.fn();
    vi.doMock("@sentry/node", () => ({ init }));
    vi.stubEnv("SENTRY_DSN", "");

    await import("../../src/instrument.js");

    expect(init).not.toHaveBeenCalled();
  });
});
