// Fase 193 Plan 01 (COM-01, D-01) — el repo no tiene un paquete de tipos
// compartido entre las 3 apps: `APP_SECTIONS` se duplica a mano en
// `el-templo-admin/src/config/destinations.ts` y
// `el-templo-app/src/config/destinations.ts`. Este test es la única red que
// evita que un espejo divierja de la fuente de verdad (la API, importada
// directo — no hace falta regex porque comparte tsconfig/vitest).
//
// FAIL-CLOSED: si un archivo espejo no se puede leer, el test FALLA con el
// path en el mensaje (no hay skip silencioso).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { APP_SECTIONS } from "../../src/modules/communications/destinations";

interface ExtractedSection {
  key: string;
  label: string;
  route: string;
}

const TUPLE_PATTERN =
  /key:\s*'([a-z_]+)',\s*\n?\s*label:\s*'([^']*)',\s*\n?\s*route:\s*'([^']*)'/g;

function extractSections(filePath: string): ExtractedSection[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `destinations-sync: no se pudo leer ${filePath} (${reason}) — el espejo ` +
        `no existe o el path relativo cambió`,
    );
  }

  const sections: ExtractedSection[] = [];
  for (const match of content.matchAll(TUPLE_PATTERN)) {
    sections.push({ key: match[1], label: match[2], route: match[3] });
  }
  return sections;
}

describe("communications/destinations-sync", () => {
  const apiSections: ExtractedSection[] = APP_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    route: section.route,
  }));

  const adminPath = path.resolve(
    __dirname,
    "../../../el-templo-admin/src/config/destinations.ts",
  );
  const appPath = path.resolve(
    __dirname,
    "../../../el-templo-app/src/config/destinations.ts",
  );

  const adminSections = extractSections(adminPath);
  const appSections = extractSections(appPath);

  it("la API tiene exactamente 7 secciones", () => {
    expect(apiSections).toHaveLength(7);
  });

  it("el espejo del admin tiene exactamente 7 secciones", () => {
    expect(adminSections).toHaveLength(7);
  });

  it("el espejo de la app tiene exactamente 7 secciones", () => {
    expect(appSections).toHaveLength(7);
  });

  it("el espejo del admin es profundamente igual a la API", () => {
    expect(adminSections).toEqual(apiSections);
  });

  it("el espejo de la app es profundamente igual a la API", () => {
    expect(appSections).toEqual(apiSections);
  });

  it("los dos espejos son profundamente iguales entre sí", () => {
    expect(adminSections).toEqual(appSections);
  });
});
