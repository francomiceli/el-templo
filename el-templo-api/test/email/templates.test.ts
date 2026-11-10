/**
 * Tanda 1 (#21): escape HTML en los mails. Unitario, sin app ni DB.
 */
import { describe, it, expect } from "vitest";
import { passwordSetEmailHtml } from "../../src/modules/email/templates";
import { escapeHtml } from "../../src/modules/shared/html";

describe("escapeHtml", () => {
  it("escapa & < > \" '", () => {
    expect(escapeHtml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });

  it("escapa & primero: no doble-escapa las entidades que genera", () => {
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("deja intacto el texto sin caracteres especiales", () => {
    expect(escapeHtml("Hola María 123")).toBe("Hola María 123");
  });
});

describe("passwordSetEmailHtml", () => {
  it("escapa el nombre: un <a href> inyectado queda como texto", () => {
    const html = passwordSetEmailHtml(
      '<a href="https://x.invalid">x</a>',
      "clave123",
    );
    expect(html).not.toContain("<a href");
    expect(html).toContain("&lt;a href");
    expect(html).toContain("&quot;https://x.invalid&quot;");
  });

  it("escapa la contraseña temporal", () => {
    const html = passwordSetEmailHtml("Ana", "p<w&'x\"");
    expect(html).toContain("p&lt;w&amp;&#39;x&quot;");
    expect(html).not.toContain("p<w");
  });

  it("control: un nombre y una clave normales salen tal cual", () => {
    const html = passwordSetEmailHtml("Ana", "eltemplo2026");
    expect(html).toContain("Bienvenido a El Templo, Ana");
    expect(html).toContain(">eltemplo2026<");
  });
});
