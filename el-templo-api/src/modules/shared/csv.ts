/**
 * Helpers de CSV compartidos.
 *
 * `csvEscape` hace dos cosas, en este orden:
 *  1. Neutraliza inyección de fórmulas (CSV injection / OWASP): una celda que
 *     empiece con `=`, `@`, TAB o CR, o con `+`/`-` seguido de algo que no sea
 *     solo dígitos, espacios, paréntesis o guiones, se guarda con un `'` al
 *     principio. Así Excel/Sheets la tratan como texto. Los teléfonos
 *     (`+54 9 223 555-1234`) y los números negativos (`-5`) quedan intactos.
 *  2. Escape RFC 4180: campos con `,`, `"`, CR o LF van entre comillas y las
 *     comillas se duplican.
 *
 * Excel (`shared/excel.ts`) NO pasa por acá: exceljs guarda las celdas de texto
 * tipadas como string y Excel no las evalúa como fórmula.
 */

const SIGNED_SAFE_TAIL = /^[\d\s()-]*$/;

/** Antepone `'` si el valor podría interpretarse como fórmula. */
export function neutralizeFormula(s: string): string {
  if (s.length === 0) return s;
  const first = s[0];
  if (first === "=" || first === "@" || first === "\t" || first === "\r") {
    return `'${s}`;
  }
  if (first === "+" || first === "-") {
    return SIGNED_SAFE_TAIL.test(s.slice(1)) ? s : `'${s}`;
  }
  return s;
}

/** RFC 4180 CSV escape + neutralización de fórmulas. */
export function csvEscape(raw: string): string {
  const s = neutralizeFormula(raw);
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
