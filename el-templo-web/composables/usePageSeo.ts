/**
 * usePageSeo -- head (title, description, canonical, og) y JSON-LD de las
 * paginas de contenido de la fase 195 (disciplinas, planes, profes, primera
 * clase gratis).
 *
 * El grafo siempre lleva el `Organization` raiz, un `BreadcrumbList` y los
 * nodos propios de la pagina (`extraNodes`). El JSON-LD sale solo por
 * `jsonLdScript` (escapa `<`).
 */
import { brandName, webData } from "~/data/sedes";
import { isEsPath } from "~/utils/es-path";
import { hreflangLinks } from "~/utils/hreflang";
import {
  SITE_URL,
  breadcrumbNode,
  jsonLdScript,
  organizationNode,
  type JsonLdNode,
} from "~/utils/schema-graph";

export interface PageSeoInput {
  /** Titulo completo del `<title>` (incluye la marca si corresponde). */
  title: string;
  description: string;
  /** Ruta absoluta de la pagina (`/disciplinas/yoga`). */
  path: string;
  /** Migas de pan intermedias + la pagina actual (sin Inicio). */
  breadcrumb: Array<{ name: string; path?: string }>;
  extraNodes?: JsonLdNode[];
  ogType?: "website" | "profile";
}

export function usePageSeo(input: PageSeoInput): void {
  const url = `${SITE_URL}${input.path}`;
  const es = isEsPath(input.path);
  useHead({
    // Las paginas de Espana declaran es-ES (el resto hereda es-AR de app.vue).
    ...(es ? { htmlAttrs: { lang: "es-ES" } } : {}),
    title: input.title,
    meta: [
      { name: "description", content: input.description },
      { property: "og:title", content: input.title },
      { property: "og:description", content: input.description },
      { property: "og:url", content: url },
      { property: "og:type", content: input.ogType ?? "website" },
      { property: "og:site_name", content: brandName },
    ],
    link: [{ rel: "canonical", href: url }, ...hreflangLinks(input.path)],
    script: [
      jsonLdScript([
        organizationNode(webData),
        ...(input.extraNodes ?? []),
        breadcrumbNode([
          { name: "Inicio", url: es ? `${SITE_URL}/es` : `${SITE_URL}/` },
          ...input.breadcrumb.map((item) => ({
            name: item.name,
            url: item.path ? `${SITE_URL}${item.path}` : undefined,
          })),
        ]),
      ]),
    ],
  });
}
