// Fase 193 Plan 01 (COM-01) — test unitario de `destinations.ts`. Sin DB: es
// un módulo puro (tipos + validación + resolución).
import { describe, it, expect } from "vitest";
import {
  APP_SECTIONS,
  CONTACT_SALES_ROUTE,
  FALLBACK_ROUTE,
  DEFAULT_WHATSAPP_TEXT,
  WHATSAPP_TEXT_MAX_LENGTH,
  isAppSectionKey,
  resolveDestinationRoute,
  fallbackRouteFor,
  validateWhatsAppText,
  validateDestination,
  type Destination,
} from "../../src/modules/communications/destinations";

describe("communications/destinations", () => {
  it("APP_SECTIONS tiene exactamente 7 entradas", () => {
    expect(APP_SECTIONS).toHaveLength(7);
  });

  it("cada key de app_section resuelve su ruta curada", () => {
    for (const section of APP_SECTIONS) {
      const destination: Destination = {
        type: "app_section",
        section: section.key,
        whatsappText: null,
      };
      expect(resolveDestinationRoute(destination)).toBe(section.route);
    }
  });

  it("whatsapp_sales resuelve /contacto-ventas y su fallback es /mi-templo", () => {
    const destination: Destination = {
      type: "whatsapp_sales",
      section: null,
      whatsappText: null,
    };
    expect(resolveDestinationRoute(destination)).toBe(CONTACT_SALES_ROUTE);
    expect(fallbackRouteFor(destination)).toBe(FALLBACK_ROUTE);
  });

  it("fallbackRouteFor de un app_section es su propia ruta (no /mi-templo)", () => {
    const destination: Destination = {
      type: "app_section",
      section: "reservas",
      whatsappText: null,
    };
    expect(fallbackRouteFor(destination)).toBe("/reservas");
  });

  it("una key desconocida cae en /mi-templo (fail-closed, nunca lanza)", () => {
    const destination = {
      type: "app_section",
      section: "no-existe",
      whatsappText: null,
    } as unknown as Destination;
    expect(() => resolveDestinationRoute(destination)).not.toThrow();
    expect(resolveDestinationRoute(destination)).toBe(FALLBACK_ROUTE);
  });

  it("isAppSectionKey distingue keys válidas de inválidas", () => {
    expect(isAppSectionKey("mi_templo")).toBe(true);
    expect(isAppSectionKey("no-existe")).toBe(false);
    expect(isAppSectionKey(42)).toBe(false);
    expect(isAppSectionKey(null)).toBe(false);
  });

  describe("validateWhatsAppText", () => {
    it("rechaza texto con https://", () => {
      const result = validateWhatsAppText("Mirá esto: https://evil.example");
      expect(result.ok).toBe(false);
    });

    it("rechaza texto con http://", () => {
      const result = validateWhatsAppText("Mirá esto: http://evil.example");
      expect(result.ok).toBe(false);
    });

    it("rechaza texto con wa.me", () => {
      const result = validateWhatsAppText("Escribinos a wa.me/123456");
      expect(result.ok).toBe(false);
    });

    it("rechaza texto vacío", () => {
      const result = validateWhatsAppText("   ");
      expect(result.ok).toBe(false);
    });

    it("rechaza texto de 301 caracteres", () => {
      const text = "a".repeat(WHATSAPP_TEXT_MAX_LENGTH + 1);
      const result = validateWhatsAppText(text);
      expect(result.ok).toBe(false);
    });

    it("acepta texto de exactamente 300 caracteres", () => {
      const text = "a".repeat(WHATSAPP_TEXT_MAX_LENGTH);
      const result = validateWhatsAppText(text);
      expect(result.ok).toBe(true);
    });

    it("rechaza más de 3 saltos de línea", () => {
      const result = validateWhatsAppText("a\nb\nc\nd\ne");
      expect(result.ok).toBe(false);
    });

    it("acepta hasta 3 saltos de línea", () => {
      const result = validateWhatsAppText("a\nb\nc\nd");
      expect(result.ok).toBe(true);
    });

    it("acepta el texto por defecto global", () => {
      const result = validateWhatsAppText(DEFAULT_WHATSAPP_TEXT);
      expect(result.ok).toBe(true);
    });
  });

  describe("validateDestination", () => {
    it("rechaza { type: 'app_section', section: 'no-existe' }", () => {
      const result = validateDestination({
        type: "app_section",
        section: "no-existe",
      });
      expect(result.ok).toBe(false);
    });

    it("rechaza { type: 'app_section', section: 'reservas', whatsappText: 'x' }", () => {
      const result = validateDestination({
        type: "app_section",
        section: "reservas",
        whatsappText: "x",
      });
      expect(result.ok).toBe(false);
    });

    it("acepta un app_section válido sin whatsappText", () => {
      const result = validateDestination({
        type: "app_section",
        section: "mi_templo",
        whatsappText: null,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          type: "app_section",
          section: "mi_templo",
          whatsappText: null,
        });
      }
    });

    it("acepta whatsapp_sales sin texto propio (usa el default)", () => {
      const result = validateDestination({
        type: "whatsapp_sales",
        section: null,
        whatsappText: null,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.whatsappText).toBeNull();
      }
    });

    it("acepta whatsapp_sales con texto propio válido", () => {
      const result = validateDestination({
        type: "whatsapp_sales",
        section: null,
        whatsappText: "Hola, quiero info",
      });
      expect(result.ok).toBe(true);
    });

    it("rechaza whatsapp_sales con section no nula", () => {
      const result = validateDestination({
        type: "whatsapp_sales",
        section: "mi_templo",
        whatsappText: null,
      });
      expect(result.ok).toBe(false);
    });

    it("rechaza whatsapp_sales con texto inválido (link)", () => {
      const result = validateDestination({
        type: "whatsapp_sales",
        section: null,
        whatsappText: "mirá https://evil.example",
      });
      expect(result.ok).toBe(false);
    });

    it("rechaza un tipo desconocido", () => {
      const result = validateDestination({ type: "carta_documento" });
      expect(result.ok).toBe(false);
    });

    it("rechaza input que no es un objeto", () => {
      expect(validateDestination(null).ok).toBe(false);
      expect(validateDestination("string").ok).toBe(false);
      expect(validateDestination(42).ok).toBe(false);
    });
  });
});
