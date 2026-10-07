/**
 * Una ruta es de Espana si es `/es` o cuelga de `/es/` (nunca `/espacio...`).
 * Sin imports: lo usan el head (usePageSeo), el consentimiento y el loader de
 * analytics.
 */
export function isEsPath(path: string): boolean {
  const clean = path.split(/[?#]/)[0] ?? path;
  return clean === "/es" || clean.startsWith("/es/");
}
