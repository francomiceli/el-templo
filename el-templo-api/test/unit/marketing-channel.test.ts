import { describe, it, expect } from "vitest";
import {
  AI_HOSTS,
  CHANNELS,
  MANUAL_ORIGINS,
  MANUAL_ORIGIN_CHANNEL,
  classifyChannel,
} from "../../src/modules/marketing/channel";

describe("classifyChannel — IA (D-21.1)", () => {
  it.each([
    "chatgpt.com",
    "chat.openai.com",
    "www.perplexity.ai",
    "gemini.google.com",
    "copilot.microsoft.com",
    "claude.ai",
    "www.claude.ai",
    "chat.deepseek.com",
    "grok.com",
    "poe.com",
  ])("referrer %s -> ia", (referrerHost) => {
    expect(classifyChannel({ referrerHost })).toBe("ia");
  });

  it.each([
    "chatgpt.com",
    "perplexity",
    "gemini",
    "copilot",
    "claude.ai",
    "CHATGPT.COM",
    "  chatgpt.com  ",
  ])("utm_source %s -> ia", (utmSource) => {
    expect(classifyChannel({ utmSource })).toBe("ia");
  });

  it("cada host de AI_HOSTS clasifica como ia, por referrer y por utm_source", () => {
    for (const host of AI_HOSTS) {
      expect(classifyChannel({ referrerHost: host }), host).toBe("ia");
      expect(classifyChannel({ utmSource: host }), host).toBe("ia");
    }
  });

  it("no confunde dominios parecidos con IA", () => {
    expect(classifyChannel({ referrerHost: "chatgpt.com.evil.com" })).toBe(
      "otro_sitio",
    );
    expect(classifyChannel({ referrerHost: "notclaude.ai" })).toBe(
      "otro_sitio",
    );
  });

  it("utm_source=meta (anuncios) NO es IA aunque meta.ai lo sea", () => {
    expect(classifyChannel({ utmSource: "meta", utmMedium: "paid" })).toBe(
      "meta_ads",
    );
  });

  it("IA gana sobre utm de campaña, click ids, ref y promo", () => {
    expect(
      classifyChannel({
        referrerHost: "chatgpt.com",
        utmSource: "meta",
        utmMedium: "paid",
        gclid: "x",
        fbclid: "y",
        refCode: "ABC",
        promoCode: "X",
      }),
    ).toBe("ia");
    expect(
      classifyChannel({ utmSource: "chatgpt.com", refCode: "ABC", gclid: "x" }),
    ).toBe("ia");
  });

  it("gemini.google.com es IA y no buscador", () => {
    expect(classifyChannel({ referrerHost: "gemini.google.com" })).toBe("ia");
    expect(classifyChannel({ referrerHost: "www.google.com" })).toBe(
      "buscador",
    );
  });
});

describe("classifyChannel — Meta", () => {
  it("meta + medio pago -> meta_ads", () => {
    expect(classifyChannel({ utmSource: "meta", utmMedium: "paid" })).toBe(
      "meta_ads",
    );
    expect(
      classifyChannel({ utmSource: "facebook", utmMedium: "paid_social" }),
    ).toBe("meta_ads");
    expect(classifyChannel({ utmSource: "ig", utmMedium: "cpc" })).toBe(
      "meta_ads",
    );
  });

  it("fbclid sin utm -> meta_ads", () => {
    expect(classifyChannel({ fbclid: "x" })).toBe("meta_ads");
  });

  it("utm_source=meta solo (sin medio) -> meta_ads: es la etiqueta de los anuncios", () => {
    expect(classifyChannel({ utmSource: "meta" })).toBe("meta_ads");
  });

  it("un utm_source desconocido con fbclid sigue siendo otro (el utm explícito manda)", () => {
    expect(classifyChannel({ utmSource: "tiktok", fbclid: "x" })).toBe("otro");
  });

  it("instagram sin medio pago -> instagram (y con medio pago -> meta_ads)", () => {
    expect(classifyChannel({ utmSource: "instagram" })).toBe("instagram");
    expect(
      classifyChannel({ utmSource: "instagram", utmMedium: "social" }),
    ).toBe("instagram");
    expect(classifyChannel({ utmSource: "ig" })).toBe("instagram");
    expect(classifyChannel({ utmSource: "instagram", utmMedium: "paid" })).toBe(
      "meta_ads",
    );
  });

  it("facebook sin medio pago -> facebook", () => {
    expect(classifyChannel({ utmSource: "facebook" })).toBe("facebook");
    expect(classifyChannel({ utmSource: "fb", utmMedium: "social" })).toBe(
      "facebook",
    );
  });

  it("el utm_source explícito gana al fbclid que agrega Instagram", () => {
    expect(classifyChannel({ utmSource: "instagram", fbclid: "x" })).toBe(
      "instagram",
    );
  });

  it("referrers de Instagram y Facebook", () => {
    expect(classifyChannel({ referrerHost: "l.instagram.com" })).toBe(
      "instagram",
    );
    expect(classifyChannel({ referrerHost: "instagram.com" })).toBe(
      "instagram",
    );
    expect(classifyChannel({ referrerHost: "m.facebook.com" })).toBe(
      "facebook",
    );
    expect(classifyChannel({ referrerHost: "l.facebook.com" })).toBe(
      "facebook",
    );
  });
});

describe("classifyChannel — Google", () => {
  it("gclid -> google_ads", () => {
    expect(classifyChannel({ gclid: "x" })).toBe("google_ads");
  });

  it("google + cpc/paid -> google_ads", () => {
    expect(classifyChannel({ utmSource: "google", utmMedium: "cpc" })).toBe(
      "google_ads",
    );
    expect(classifyChannel({ utmSource: "google", utmMedium: "paid" })).toBe(
      "google_ads",
    );
  });

  it("google + gclid sin medio -> google_ads", () => {
    expect(classifyChannel({ utmSource: "google", gclid: "x" })).toBe(
      "google_ads",
    );
  });

  it("google + campaña gbp-* -> google_maps (Business Profile)", () => {
    expect(
      classifyChannel({
        utmSource: "google",
        utmCampaign: "gbp-juan-b-justo",
      }),
    ).toBe("google_maps");
    expect(
      classifyChannel({
        utmSource: "google",
        utmMedium: "organic",
        utmCampaign: "GBP-Alberti",
      }),
    ).toBe("google_maps");
    expect(classifyChannel({ utmSource: "google", utmMedium: "gbp" })).toBe(
      "google_maps",
    );
    expect(classifyChannel({ utmSource: "gbp" })).toBe("google_maps");
  });

  it("google sin pago ni gbp -> buscador", () => {
    expect(classifyChannel({ utmSource: "google", utmMedium: "organic" })).toBe(
      "buscador",
    );
  });

  it("referrer de buscador sin utm -> buscador", () => {
    expect(classifyChannel({ referrerHost: "www.google.com.ar" })).toBe(
      "buscador",
    );
    expect(classifyChannel({ referrerHost: "google.es" })).toBe("buscador");
    expect(classifyChannel({ referrerHost: "www.bing.com" })).toBe("buscador");
    expect(classifyChannel({ referrerHost: "duckduckgo.com" })).toBe(
      "buscador",
    );
    expect(classifyChannel({ referrerHost: "search.yahoo.com" })).toBe(
      "buscador",
    );
  });

  it("referrer de Google Maps -> google_maps", () => {
    expect(classifyChannel({ referrerHost: "maps.google.com" })).toBe(
      "google_maps",
    );
  });

  it("un host que solo contiene 'google' no es buscador", () => {
    expect(classifyChannel({ referrerHost: "google.com.evil.com" })).toBe(
      "otro_sitio",
    );
    expect(classifyChannel({ referrerHost: "notgoogle.com" })).toBe(
      "otro_sitio",
    );
  });
});

describe("classifyChannel — QR, email, ref, promo, web", () => {
  it("qr por medio o por fuente", () => {
    expect(classifyChannel({ utmMedium: "qr" })).toBe("qr");
    expect(classifyChannel({ utmSource: "flyer" })).toBe("qr");
    expect(classifyChannel({ utmSource: "volante" })).toBe("qr");
  });

  it("email por medio o por fuente", () => {
    expect(classifyChannel({ utmMedium: "email" })).toBe("email");
    expect(classifyChannel({ utmSource: "newsletter" })).toBe("email");
  });

  it("ref sin utm -> referido; promo sin utm -> promo", () => {
    expect(classifyChannel({ refCode: "ABC" })).toBe("referido");
    expect(classifyChannel({ promoCode: "X" })).toBe("promo");
  });

  it("ref gana a promo y ambos ganan al referrer", () => {
    expect(classifyChannel({ refCode: "ABC", promoCode: "X" })).toBe(
      "referido",
    );
    expect(
      classifyChannel({ promoCode: "X", referrerHost: "www.google.com" }),
    ).toBe("promo");
    expect(
      classifyChannel({ refCode: "ABC", referrerHost: "l.instagram.com" }),
    ).toBe("referido");
  });

  it("un utm explícito gana a ref y promo", () => {
    expect(classifyChannel({ utmSource: "instagram", refCode: "ABC" })).toBe(
      "instagram",
    );
    expect(classifyChannel({ utmMedium: "qr", promoCode: "X" })).toBe("qr");
  });

  it("referrer propio sin utm -> web; otro host -> otro_sitio", () => {
    expect(classifyChannel({ referrerHost: "eltemplo.org" })).toBe("web");
    expect(classifyChannel({ referrerHost: "www.eltemplo.org" })).toBe("web");
    expect(classifyChannel({ referrerHost: "app.eltemplo.org" })).toBe("web");
    expect(classifyChannel({ referrerHost: "blog.example.com" })).toBe(
      "otro_sitio",
    );
    expect(classifyChannel({ referrerHost: "eltemplo.org.evil.com" })).toBe(
      "otro_sitio",
    );
  });

  it("utm que no se reconoce -> otro", () => {
    expect(classifyChannel({ utmSource: "tiktok" })).toBe("otro");
    expect(classifyChannel({ utmMedium: "banner" })).toBe("otro");
  });

  it("nada -> directo; vacíos, nulos y blancos también", () => {
    expect(classifyChannel({})).toBe("directo");
    expect(
      classifyChannel({
        utmSource: "",
        utmMedium: "  ",
        referrerHost: null,
        fbclid: "",
        gclid: null,
        refCode: " ",
        promoCode: undefined,
        manualOrigin: "",
      }),
    ).toBe("directo");
  });

  it("una campaña sola (sin fuente ni medio) no cambia el canal", () => {
    expect(classifyChannel({ utmCampaign: "volante-octubre" })).toBe("directo");
  });

  it("tolera un referrer con esquema, ruta o puerto", () => {
    expect(
      classifyChannel({ referrerHost: "https://chatgpt.com/c/123?x=1" }),
    ).toBe("ia");
    expect(classifyChannel({ referrerHost: "L.Instagram.com:443" })).toBe(
      "instagram",
    );
  });
});

describe("classifyChannel — origen manual del admin", () => {
  it("paso_por_la_puerta -> presencial", () => {
    expect(classifyChannel({ manualOrigin: "paso_por_la_puerta" })).toBe(
      "presencial",
    );
  });

  it("volante_qr -> qr y google -> buscador", () => {
    expect(classifyChannel({ manualOrigin: "volante_qr" })).toBe("qr");
    expect(classifyChannel({ manualOrigin: "google" })).toBe("buscador");
  });

  it("cada valor de MANUAL_ORIGINS mapea a un canal de CHANNELS", () => {
    expect(Object.keys(MANUAL_ORIGIN_CHANNEL).sort()).toEqual(
      [...MANUAL_ORIGINS].sort(),
    );
    for (const origin of MANUAL_ORIGINS) {
      const channel = classifyChannel({ manualOrigin: origin });
      expect(CHANNELS, origin).toContain(channel);
      expect(channel, origin).toBe(MANUAL_ORIGIN_CHANNEL[origin]);
    }
  });

  it("un origen manual inventado se ignora", () => {
    expect(classifyChannel({ manualOrigin: "inventado" })).toBe("directo");
  });
});
