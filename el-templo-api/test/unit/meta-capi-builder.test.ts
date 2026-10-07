import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hashedUserData,
  normalizeEmail,
  normalizePhoneForMeta,
  sha256Hex,
} from "../../src/modules/marketing/meta/hash";
import {
  REGISTER_SOURCE_URL,
  buildPurchaseEvent,
  buildRegistrationEvent,
  buildTrialEvent,
  decideEventStatus,
  isWithinWindow,
  registrationActionSource,
} from "../../src/modules/marketing/meta/capi-builder";
import {
  getMetaCapiConfig,
  getMetaSpendConfig,
} from "../../src/modules/marketing/meta/config";

// Vectores calculados por fuera del código (python hashlib), no con la función
// bajo prueba: el primero es el ejemplo de la documentación de Meta.
const H_EMAIL =
  "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b";
const H_PHONE_AR =
  "2ba6f5dd98125761418c65c6383b27df04888d408d04206e5b7fbadc2cce4021";
const H_PHONE_ES =
  "5c29c4397807d2f598c0d1aee6e1dad64be756e2c611047b5298a95fa7e463af";
const H_COUNTRY_AR =
  "ab5b62081b1d305e78d0daadb2cd23470b3faeb65af7370627798b7219ea2061";
const H_COUNTRY_ES =
  "c0bc1e08f9743b2d50d5f1607503bf4e849af0e729fca896515bea955d70a33e";
const H_EXTERNAL_1_7 =
  "3d5f0fd838606f1f7c5b2a7cf3cfaa325e5552bc8f28ff26559445531a30fa60";
const H_EXTERNAL_2_7 =
  "7bcddfc2024dd9347260a4fa5ecac2bd4da9c4dca0a189f63196eb9f7f3b4bc0";
const H_JUAN =
  "ed08c290d7e22f7bb324b15cbadce35b0b348564fd2d5f95752388d86d71bcca";
const H_PEREZ =
  "a5ed602ee512bda8b2b18d6d4b06d6f176e7e3fb15a0cf5b23028b9849bd0d62";

describe("hash — SHA-256 con vectores conocidos", () => {
  it("sha256Hex del email normalizado coincide con el vector de Meta", () => {
    expect(sha256Hex(normalizeEmail("  Test@Example.COM ") as string)).toBe(
      H_EMAIL,
    );
  });

  it("normalizeEmail: trim + minúsculas, vacío o nulo → null", () => {
    expect(normalizeEmail("  Test@Example.COM ")).toBe("test@example.com");
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });

  it("sha256Hex es hex de 64 caracteres y es determinista", () => {
    expect(sha256Hex("5492235820521")).toBe(H_PHONE_AR);
    expect(sha256Hex("5492235820521")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("normalizePhoneForMeta", () => {
  it.each([
    ["0223 582-0521", "AR", "5492235820521"],
    ["+54 9 223 582 0521", "AR", "5492235820521"],
    ["5492235820521", "AR", "5492235820521"],
    ["2235820521", "AR", "5492235820521"],
    ["680 77 43 31", "ES", "34680774331"],
    ["+34 680 77 43 31", "ES", "34680774331"],
  ] as const)("%s (%s) → %s", (raw, country, expected) => {
    expect(normalizePhoneForMeta(raw, country)).toBe(expected);
  });

  it("formato ambiguo, vacío o nulo → null (no se adivina)", () => {
    expect(normalizePhoneForMeta("223 15 582 0521", "AR")).toBeNull();
    expect(normalizePhoneForMeta("15 5622097", "AR")).toBeNull();
    expect(normalizePhoneForMeta("680 77 43", "ES")).toBeNull();
    expect(normalizePhoneForMeta("", "AR")).toBeNull();
    expect(normalizePhoneForMeta("   ", "AR")).toBeNull();
    expect(normalizePhoneForMeta(null, "AR")).toBeNull();
    expect(normalizePhoneForMeta(undefined, "ES")).toBeNull();
    expect(normalizePhoneForMeta("abc", "AR")).toBeNull();
  });

  it("fuera del rango E.164 (8 a 15 dígitos) → null", () => {
    expect(normalizePhoneForMeta("+1234", "AR")).toBeNull();
    expect(normalizePhoneForMeta("+1234567890123456", "AR")).toBeNull();
    expect(normalizePhoneForMeta("+1234567", "AR")).toBeNull();
    expect(normalizePhoneForMeta("+12345678", "AR")).toBe("12345678");
    expect(normalizePhoneForMeta("+123456789012345", "AR")).toBe(
      "123456789012345",
    );
  });
});

describe("hashedUserData", () => {
  const base = {
    email: "Test@Example.com",
    phone: "0223 582-0521",
    country: "AR" as const,
    tenantId: 1,
    userId: 7,
  };

  it("hashea email, teléfono, country y external_id (tenant:user)", () => {
    expect(hashedUserData(base)).toEqual({
      em: [H_EMAIL],
      ph: [H_PHONE_AR],
      country: [H_COUNTRY_AR],
      external_id: [H_EXTERNAL_1_7],
    });
  });

  it("el external_id incluye el tenant (mismo usuario en otro gimnasio ≠ mismo hash)", () => {
    expect(hashedUserData({ ...base, tenantId: 2 }).external_id).toEqual([
      H_EXTERNAL_2_7,
    ]);
  });

  it("country ES hashea 'es'", () => {
    expect(hashedUserData({ ...base, country: "ES" }).country).toEqual([
      H_COUNTRY_ES,
    ]);
  });

  it("teléfono null o ambiguo → sin la clave `ph` (viaja con el email)", () => {
    for (const phone of [null, "", "223 15 582 0521"]) {
      const ud = hashedUserData({ ...base, phone });
      expect("ph" in ud).toBe(false);
      expect(ud.em).toEqual([H_EMAIL]);
      expect(ud.external_id).toEqual([H_EXTERNAL_1_7]);
    }
  });

  it("email ausente → sin `em`", () => {
    expect("em" in hashedUserData({ ...base, email: null })).toBe(false);
  });

  it("nombre y apellido se hashean normalizados y solo si vienen", () => {
    const ud = hashedUserData({
      ...base,
      firstName: " JUAN ",
      lastName: "PEREZ ",
    });
    expect(ud.fn).toEqual([H_JUAN]);
    expect(ud.ln).toEqual([H_PEREZ]);
    const sin = hashedUserData(base);
    expect("fn" in sin).toBe(false);
    expect("ln" in sin).toBe(false);
  });

  it("fbc y fbp viajan SIN hashear; vacío se omite", () => {
    const ud = hashedUserData({
      ...base,
      fbc: "fb.1.1700000000000.AbC",
      fbp: "fb.1.1.2",
    });
    expect(ud.fbc).toBe("fb.1.1700000000000.AbC");
    expect(ud.fbp).toBe("fb.1.1.2");
    const vacio = hashedUserData({ ...base, fbc: "", fbp: null });
    expect("fbc" in vacio).toBe(false);
    expect("fbp" in vacio).toBe(false);
  });

  it("IP y user agent solo con includeClientContext, y SIN hashear", () => {
    const con = hashedUserData({
      ...base,
      clientIp: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      includeClientContext: true,
    });
    expect(con.client_ip_address).toBe("203.0.113.7");
    expect(con.client_user_agent).toBe("Mozilla/5.0");

    const sin = hashedUserData({
      ...base,
      clientIp: "203.0.113.7",
      userAgent: "Mozilla/5.0",
    });
    expect("client_ip_address" in sin).toBe(false);
    expect("client_user_agent" in sin).toBe(false);

    const soloUa = hashedUserData({
      ...base,
      userAgent: "UA",
      includeClientContext: true,
    });
    expect("client_ip_address" in soloUa).toBe(false);
    expect(soloUa.client_user_agent).toBe("UA");
  });
});

describe("builders de eventos", () => {
  const person = {
    userId: 7,
    tenantId: 1,
    email: "Test@Example.com",
    phone: "0223 582-0521",
    country: "AR" as const,
  };
  const t = new Date("2026-10-01T12:00:00.000Z");
  const unix = Math.floor(t.getTime() / 1000);

  it("Purchase: physical_store, custom_data con valor y moneda, user_data hasheado y fbc sin hashear", () => {
    const ev = buildPurchaseEvent({
      ...person,
      subscriptionId: 55,
      eventTime: t,
      value: 45000,
      currency: "ARS",
      fbc: "fb.1.1700000000000.AbC",
    });
    expect(ev).toEqual({
      event_name: "Purchase",
      event_time: unix,
      event_id: "purchase-55",
      action_source: "physical_store",
      user_data: {
        em: [H_EMAIL],
        ph: [H_PHONE_AR],
        country: [H_COUNTRY_AR],
        external_id: [H_EXTERNAL_1_7],
        fbc: "fb.1.1700000000000.AbC",
      },
      custom_data: { value: 45000, currency: "ARS" },
    });
    expect("event_source_url" in ev).toBe(false);
  });

  it("event_time es entero en segundos (trunca los milisegundos)", () => {
    const ev = buildTrialEvent({
      ...person,
      bookingId: 1,
      eventTime: new Date("2026-10-01T12:00:00.999Z"),
    });
    expect(ev.event_time).toBe(unix);
    expect(Number.isInteger(ev.event_time)).toBe(true);
  });

  it("Registro web: website + url + IP/UA sin hashear", () => {
    const ev = buildRegistrationEvent({
      ...person,
      eventTime: t,
      platform: "web",
      clientIp: "203.0.113.7",
      userAgent: "Mozilla/5.0",
    });
    expect(ev.event_name).toBe("CompleteRegistration");
    expect(ev.event_id).toBe("reg-7");
    expect(ev.action_source).toBe("website");
    expect(ev.event_source_url).toBe("https://app.eltemplo.org/register");
    expect(REGISTER_SOURCE_URL).toBe("https://app.eltemplo.org/register");
    expect(ev.user_data.client_ip_address).toBe("203.0.113.7");
    expect(ev.user_data.client_user_agent).toBe("Mozilla/5.0");
    expect(ev.custom_data).toBeUndefined();
  });

  it.each(["android", "admin"])(
    "Registro %s: system_generated, sin url ni IP/UA aunque vengan",
    (platform) => {
      const ev = buildRegistrationEvent({
        ...person,
        eventTime: t,
        platform,
        clientIp: "203.0.113.7",
        userAgent: "Mozilla/5.0",
      });
      expect(ev.action_source).toBe("system_generated");
      expect("event_source_url" in ev).toBe(false);
      expect("client_ip_address" in ev.user_data).toBe(false);
      expect("client_user_agent" in ev.user_data).toBe(false);
    },
  );

  it("Registro web SIN user agent baja a system_generated (website lo exige y un evento inválido rechaza el lote)", () => {
    const ev = buildRegistrationEvent({
      ...person,
      eventTime: t,
      platform: "web",
      clientIp: "203.0.113.7",
      userAgent: null,
    });
    expect(ev.action_source).toBe("system_generated");
    expect("event_source_url" in ev).toBe(false);
    expect("client_ip_address" in ev.user_data).toBe(false);
  });

  it("Schedule: trial-<bookingId>, system_generated, sin IP/UA", () => {
    const ev = buildTrialEvent({
      ...person,
      bookingId: 91,
      eventTime: t,
      fbp: "fb.1.1.2",
    });
    expect(ev.event_name).toBe("Schedule");
    expect(ev.event_id).toBe("trial-91");
    expect(ev.action_source).toBe("system_generated");
    expect(ev.user_data.fbp).toBe("fb.1.1.2");
    expect("client_ip_address" in ev.user_data).toBe(false);
    expect(ev.custom_data).toBeUndefined();
  });

  it("el teléfono ambiguo no tira el evento: viaja sin ph", () => {
    const ev = buildPurchaseEvent({
      ...person,
      phone: "15 5622097",
      subscriptionId: 1,
      eventTime: t,
      value: 1,
      currency: "ARS",
    });
    expect("ph" in ev.user_data).toBe(false);
    expect(ev.user_data.em).toEqual([H_EMAIL]);
  });
});

describe("isWithinWindow", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");
  const DAY = 24 * 60 * 60 * 1000;
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("website y system_generated: hasta 7 días (borde inclusive)", () => {
    for (const src of ["website", "system_generated"] as const) {
      expect(isWithinWindow(ago(0), src, now)).toBe(true);
      expect(isWithinWindow(ago(7 * DAY), src, now)).toBe(true);
      expect(isWithinWindow(ago(7 * DAY + 1000), src, now)).toBe(false);
      expect(isWithinWindow(ago(10 * DAY), src, now)).toBe(false);
    }
  });

  it("physical_store: hasta 62 días", () => {
    expect(isWithinWindow(ago(10 * DAY), "physical_store", now)).toBe(true);
    expect(isWithinWindow(ago(62 * DAY), "physical_store", now)).toBe(true);
    expect(isWithinWindow(ago(62 * DAY + 1000), "physical_store", now)).toBe(
      false,
    );
  });

  it("futuro: hasta 1 hora de tolerancia, más no", () => {
    expect(isWithinWindow(ago(-30 * 60 * 1000), "website", now)).toBe(true);
    expect(isWithinWindow(ago(-60 * 60 * 1000), "website", now)).toBe(true);
    expect(isWithinWindow(ago(-60 * 60 * 1000 - 1000), "website", now)).toBe(
      false,
    );
    expect(
      isWithinWindow(ago(-2 * 60 * 60 * 1000), "physical_store", now),
    ).toBe(false);
  });
});

describe("config de Meta (no-op sin credenciales)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubAll(env: Record<string, string>) {
    for (const k of [
      "META_ACCESS_TOKEN",
      "META_PIXEL_ID",
      "META_CAPI_START_AT",
      "META_AD_ACCOUNT_IDS",
      "META_GRAPH_VERSION",
      "META_CAPI_TEST_EVENT_CODE",
    ]) {
      vi.stubEnv(k, env[k] ?? "");
    }
  }

  const FULL = {
    META_ACCESS_TOKEN: "tok",
    META_PIXEL_ID: "123456",
    META_CAPI_START_AT: "2026-10-10T00:00:00Z",
  };

  it("CAPI: sin nada, null", () => {
    stubAll({});
    expect(getMetaCapiConfig()).toBeNull();
  });

  it.each(["META_ACCESS_TOKEN", "META_PIXEL_ID", "META_CAPI_START_AT"])(
    "CAPI: falta %s → null (string vacío del heredoc cuenta como ausente)",
    (missing) => {
      stubAll({ ...FULL, [missing]: "" });
      expect(getMetaCapiConfig()).toBeNull();
      stubAll({ ...FULL, [missing]: "   " });
      expect(getMetaCapiConfig()).toBeNull();
    },
  );

  it("CAPI: fecha de activación inválida → null", () => {
    stubAll({ ...FULL, META_CAPI_START_AT: "mañana" });
    expect(getMetaCapiConfig()).toBeNull();
  });

  it("CAPI: pixel no numérico → null (viaja en la ruta de la URL)", () => {
    stubAll({ ...FULL, META_PIXEL_ID: "123/../me" });
    expect(getMetaCapiConfig()).toBeNull();
  });

  it("CAPI: config completa con defaults", () => {
    stubAll(FULL);
    const cfg = getMetaCapiConfig();
    expect(cfg).toEqual({
      token: "tok",
      pixelId: "123456",
      graphVersion: "v26.0",
      startAt: new Date("2026-10-10T00:00:00Z"),
      testEventCode: null,
    });
  });

  it("CAPI: versión y test_event_code opcionales; una versión malformada cae al default", () => {
    stubAll({
      ...FULL,
      META_GRAPH_VERSION: "v27.1",
      META_CAPI_TEST_EVENT_CODE: "TEST123",
    });
    const cfg = getMetaCapiConfig();
    expect(cfg?.graphVersion).toBe("v27.1");
    expect(cfg?.testEventCode).toBe("TEST123");
    stubAll({ ...FULL, META_GRAPH_VERSION: "latest/../x" });
    expect(getMetaCapiConfig()?.graphVersion).toBe("v26.0");
  });

  it("Gasto: sin token o sin cuentas → null", () => {
    stubAll({ META_AD_ACCOUNT_IDS: "123" });
    expect(getMetaSpendConfig()).toBeNull();
    stubAll({ META_ACCESS_TOKEN: "tok" });
    expect(getMetaSpendConfig()).toBeNull();
    stubAll({ META_ACCESS_TOKEN: "tok", META_AD_ACCOUNT_IDS: " , ,abc, act_" });
    expect(getMetaSpendConfig()).toBeNull();
  });

  it("Gasto: normaliza act_ y espacios, descarta lo no numérico, no necesita pixel ni fecha", () => {
    stubAll({
      META_ACCESS_TOKEN: "tok",
      META_AD_ACCOUNT_IDS: "act_111, 222 ,ACT_333,mal/../1",
    });
    expect(getMetaSpendConfig()).toEqual({
      token: "tok",
      graphVersion: "v26.0",
      adAccountIds: ["111", "222", "333"],
    });
  });

  it("CAPI y gasto son independientes: pixel y fecha no afectan al gasto, y las cuentas no afectan a CAPI", () => {
    stubAll({ ...FULL, META_AD_ACCOUNT_IDS: "" });
    expect(getMetaCapiConfig()).not.toBeNull();
    expect(getMetaSpendConfig()).toBeNull();
    stubAll({ META_ACCESS_TOKEN: "tok", META_AD_ACCOUNT_IDS: "1" });
    expect(getMetaSpendConfig()).not.toBeNull();
    expect(getMetaCapiConfig()).toBeNull();
  });
});

describe("decideEventStatus (orden de las exclusiones)", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");
  const fresh = new Date("2026-10-20T11:00:00.000Z");
  const base = {
    countries: ["AR", null] as Array<string | null>,
    platform: "web" as string | null,
    eventTime: fresh,
    actionSource: "website" as const,
    now,
  };

  it("todo en regla: pending (web, android y admin)", () => {
    for (const platform of ["web", "android", "admin"]) {
      expect(decideEventStatus({ ...base, platform })).toBe("pending");
    }
  });

  it("cualquier sede que no sea Argentina: skipped_es, aunque otra sea AR", () => {
    expect(decideEventStatus({ ...base, countries: ["AR", "ES"] })).toBe(
      "skipped_es",
    );
    expect(decideEventStatus({ ...base, countries: ["ES"] })).toBe(
      "skipped_es",
    );
    expect(decideEventStatus({ ...base, countries: ["es"] })).toBe(
      "skipped_es",
    );
    // Fail-closed: un país nuevo tampoco viaja hasta que alguien lo decida.
    expect(decideEventStatus({ ...base, countries: ["CL"] })).toBe(
      "skipped_es",
    );
  });

  it("iOS: skipped_ios; unknown, null o una plataforma inventada: skipped_no_origin", () => {
    expect(decideEventStatus({ ...base, platform: "ios" })).toBe("skipped_ios");
    expect(decideEventStatus({ ...base, platform: "unknown" })).toBe(
      "skipped_no_origin",
    );
    expect(decideEventStatus({ ...base, platform: null })).toBe(
      "skipped_no_origin",
    );
    expect(decideEventStatus({ ...base, platform: "windows-phone" })).toBe(
      "skipped_no_origin",
    );
  });

  it("fuera de ventana: skipped_window", () => {
    const old = new Date("2026-10-10T12:00:00.000Z");
    expect(decideEventStatus({ ...base, eventTime: old })).toBe(
      "skipped_window",
    );
    expect(
      decideEventStatus({
        ...base,
        eventTime: old,
        actionSource: "physical_store",
      }),
    ).toBe("pending");
  });

  it("precedencia: España gana a iOS, iOS gana a la ventana, el origen gana a la ventana", () => {
    const old = new Date("2026-09-01T12:00:00.000Z");
    expect(
      decideEventStatus({ ...base, countries: ["ES"], platform: "ios" }),
    ).toBe("skipped_es");
    expect(
      decideEventStatus({ ...base, countries: ["ES"], platform: null }),
    ).toBe("skipped_es");
    expect(
      decideEventStatus({ ...base, platform: "ios", eventTime: old }),
    ).toBe("skipped_ios");
    expect(decideEventStatus({ ...base, platform: null, eventTime: old })).toBe(
      "skipped_no_origin",
    );
  });
});

describe("registrationActionSource", () => {
  it("website solo con plataforma web Y user agent", () => {
    expect(registrationActionSource("web", "Mozilla/5.0")).toBe("website");
    expect(registrationActionSource("web", null)).toBe("system_generated");
    expect(registrationActionSource("web", "")).toBe("system_generated");
    expect(registrationActionSource("android", "Mozilla/5.0")).toBe(
      "system_generated",
    );
    expect(registrationActionSource("admin", undefined)).toBe(
      "system_generated",
    );
  });
});
