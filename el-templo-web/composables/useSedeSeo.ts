/**
 * useSedeSeo -- head (title, description, canonical, og) y JSON-LD de la
 * pagina de una sede (fase 195, D-03/D-12).
 *
 * Lo comparten `/sedes/[slug]` (AR) y `/es/sedes/[slug]` (ES). Una sede con
 * clases emite `ExerciseGym`, un espacio de comunidad emite `Place` (nunca
 * `ExerciseGym`). Sin horarios publicados el ExerciseGym sale igual, sin
 * `openingHoursSpecification`.
 */
import { brandName, webData } from "~/data/sedes";
import type { WebSede } from "~/data/web-data.types";
import {
  SITE_URL,
  breadcrumbNode,
  communitySpaceNode,
  gymNode,
  jsonLdScript,
  organizationNode,
  sedeUrl,
} from "~/utils/schema-graph";

export function useSedeSeo(sede: WebSede): void {
  const url = sedeUrl(sede);
  const isCommunity = sede.kind === "community_space";
  const locality = sede.address.locality ?? "";
  const title = isCommunity
    ? `${brandName} — ${sede.publicName} | Espacio de comunidad`
    : `${brandName} — ${sede.publicName} | Calistenia en ${locality}`;

  const classActivities = sede.activities
    .filter((a) => !a.isSpecial)
    .map((a) => a.name);
  const where = [sede.address.street, locality].filter(Boolean).join(", ");
  const description = isCommunity
    ? `Espacio de comunidad de ${brandName} en el Parque Primavesi (${where}). No es una sede: para entrenar con el método, elegí una sede.`
    : `Calistenia en ${where}. ${
        classActivities.length
          ? `Clases de ${classActivities.join(", ")}. `
          : ""
      }Tu primera clase es gratis.`;

  const hubName = "Sedes";
  useHead({
    // Barcelona vive bajo /es: declara es-ES (el resto hereda es-AR de app.vue).
    ...(sede.country === "ES" ? { htmlAttrs: { lang: "es-ES" } } : {}),
    title,
    meta: [
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: brandName },
    ],
    link: [{ rel: "canonical", href: url }],
    script: [
      jsonLdScript([
        organizationNode(webData),
        isCommunity ? communitySpaceNode(sede, webData) : gymNode(sede, webData),
        breadcrumbNode([
          { name: "Inicio", url: `${SITE_URL}/` },
          { name: hubName, url: `${SITE_URL}/sedes` },
          { name: sede.publicName },
        ]),
      ]),
    ],
  });
}
