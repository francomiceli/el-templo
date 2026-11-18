/**
 * Unit tests de las reglas puras de la bandeja de avisos (fase 215, plan 12).
 *
 * Todo es puro, sin DB: cursor de paginación, tipo de aviso y clave
 * anti-duplicado de los avisos de quien no tiene push.
 */

import { describe, it, expect } from "vitest";
import {
  INBOX_DEDUPE_KEY_MAX,
  INBOX_GIFT_KIND,
  INBOX_PAGE_DEFAULT,
  INBOX_PAGE_MAX,
  INBOX_RETENTION_DAYS,
  formatInboxCursor,
  inboxDedupeKey,
  inboxKindFor,
  parseInboxCursor,
} from "../../src/modules/notifications/inbox-rules";

const SHOWN_AT = new Date("2026-11-18T13:00:00Z");

describe("constantes de la bandeja", () => {
  it("retención, página y tipo del regalo", () => {
    expect(INBOX_RETENTION_DAYS).toBe(90);
    expect(INBOX_PAGE_DEFAULT).toBe(30);
    expect(INBOX_PAGE_MAX).toBe(50);
    expect(INBOX_GIFT_KIND).toBe("aura_gift");
    expect(INBOX_DEDUPE_KEY_MAX).toBe(160);
  });
});

describe("cursor", () => {
  it("formatea epoch en milisegundos y id", () => {
    expect(formatInboxCursor(new Date(1763500000000), 42)).toBe(
      "1763500000000.42",
    );
  });

  it("parsea un cursor válido", () => {
    expect(parseInboxCursor("1763500000000.42")).toEqual({
      shownAtMs: 1763500000000,
      id: 42,
    });
  });

  it("ida y vuelta", () => {
    const cursor = formatInboxCursor(SHOWN_AT, 7);
    expect(parseInboxCursor(cursor)).toEqual({
      shownAtMs: SHOWN_AT.getTime(),
      id: 7,
    });
  });

  it.each(["abc", "1.2.3", "-1.5", "", "1.", ".5", "1.5a", "1.0"])(
    "rechaza el cursor inválido %j",
    (raw) => {
      expect(parseInboxCursor(raw)).toBeNull();
    },
  );
});

describe("inboxKindFor", () => {
  it("el tipo explícito gana sobre la categoría", () => {
    expect(
      inboxKindFor({ inboxKind: "aura_gift", category: "motivacion" }),
    ).toBe("aura_gift");
  });

  it("sin tipo explícito usa la categoría", () => {
    expect(inboxKindFor({ inboxKind: null, category: "planes" })).toBe(
      "planes",
    );
  });

  it("sin nada es otro", () => {
    expect(inboxKindFor({ inboxKind: null, category: null })).toBe("otro");
  });

  it("corta a 32 caracteres", () => {
    const largo = "x".repeat(50);
    expect(inboxKindFor({ inboxKind: largo, category: null })).toBe(
      "x".repeat(32),
    );
  });
});

describe("inboxDedupeKey", () => {
  const HEX16 = /[0-9a-f]{16}$/;

  it("plantilla con reserva no depende de la fecha ni del texto", () => {
    const a = inboxDedupeKey({
      source: "template",
      templateKey: "class_reminder",
      bookingId: 77,
      shownAt: SHOWN_AT,
      title: "A",
      body: "B",
    });
    const b = inboxDedupeKey({
      source: "template",
      templateKey: "class_reminder",
      bookingId: 77,
      shownAt: new Date("2026-12-01T00:00:00Z"),
      title: "otro",
      body: "otro",
    });
    expect(a).toBe("t:class_reminder:b77");
    expect(b).toBe(a);
  });

  it("plantilla sin reserva lleva día UTC y huella del texto", () => {
    const key = inboxDedupeKey({
      source: "template",
      templateKey: "plan_expiring",
      shownAt: SHOWN_AT,
      title: "A",
      body: "B",
    });
    expect(key.startsWith("t:plan_expiring:2026-11-18:")).toBe(true);
    expect(key).toMatch(HEX16);
    expect(key.split(":")[3]).toHaveLength(16);
  });

  it("misma entrada da la misma clave", () => {
    const input = {
      source: "template" as const,
      templateKey: "plan_expiring",
      shownAt: SHOWN_AT,
      title: "A",
      body: "B",
    };
    expect(inboxDedupeKey(input)).toBe(inboxDedupeKey({ ...input }));
  });

  it("mismo día con otro título da otra clave", () => {
    const base = {
      source: "template" as const,
      templateKey: "plan_expiring",
      shownAt: SHOWN_AT,
      body: "B",
    };
    expect(inboxDedupeKey({ ...base, title: "A" })).not.toBe(
      inboxDedupeKey({ ...base, title: "C" }),
    );
  });

  it("otro día con el mismo texto da otra clave", () => {
    const base = {
      source: "template" as const,
      templateKey: "plan_expiring",
      title: "A",
      body: "B",
    };
    expect(inboxDedupeKey({ ...base, shownAt: SHOWN_AT })).not.toBe(
      inboxDedupeKey({ ...base, shownAt: new Date("2026-11-19T13:00:00Z") }),
    );
  });

  it("el título y el cuerpo no se confunden al unirse", () => {
    const base = {
      source: "template" as const,
      templateKey: "plan_expiring",
      shownAt: SHOWN_AT,
    };
    expect(inboxDedupeKey({ ...base, title: "ab", body: "c" })).not.toBe(
      inboxDedupeKey({ ...base, title: "a", body: "bc" }),
    );
  });

  it("aviso suelto con referencia no depende de la fecha ni del texto", () => {
    const key = inboxDedupeKey({
      source: "adhoc",
      inboxKind: "aura_gift",
      inboxRefId: 9,
      category: "motivacion",
      shownAt: SHOWN_AT,
      title: "A",
      body: "B",
    });
    expect(key).toBe("a:aura_gift:9");
  });

  it("aviso suelto con referencia y sin tipo usa la categoría", () => {
    const key = inboxDedupeKey({
      source: "adhoc",
      inboxRefId: 3,
      category: "anuncios",
      shownAt: SHOWN_AT,
      title: "A",
      body: "B",
    });
    expect(key).toBe("a:anuncios:3");
  });

  it("aviso suelto sin referencia lleva día UTC y huella", () => {
    const key = inboxDedupeKey({
      source: "adhoc",
      category: "anuncios",
      shownAt: SHOWN_AT,
      title: "Hola",
      body: "x",
    });
    expect(key.startsWith("a:anuncios:2026-11-18:")).toBe(true);
    expect(key).toMatch(HEX16);
  });

  it("una plantilla larga sin reserva no pasa de 160 caracteres", () => {
    const key = inboxDedupeKey({
      source: "template",
      templateKey: "k".repeat(100),
      shownAt: SHOWN_AT,
      title: "A",
      body: "B",
    });
    expect(key.length).toBeLessThanOrEqual(INBOX_DEDUPE_KEY_MAX);
  });

  it("si la clave pasa de 160 se devuelve h: más sha1 completo", () => {
    const key = inboxDedupeKey({
      source: "template",
      templateKey: "k".repeat(100),
      bookingId: 123456789,
      shownAt: SHOWN_AT,
      title: "A",
      body: "B",
    });
    // "t:" + 100 + ":b" + 9 dígitos = 113: no pasa. Se fuerza con una
    // categoría enorme en el aviso suelto.
    expect(key.length).toBeLessThanOrEqual(INBOX_DEDUPE_KEY_MAX);

    const largo = inboxDedupeKey({
      source: "adhoc",
      category: "c".repeat(170),
      shownAt: SHOWN_AT,
      title: "A",
      body: "B",
    });
    expect(largo).toMatch(/^h:[0-9a-f]{40}$/);
    expect(largo).toHaveLength(42);
  });
});
