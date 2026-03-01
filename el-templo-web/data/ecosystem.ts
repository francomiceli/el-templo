/**
 * Ecosystem pathway data — 4 growth paths within El Templo.
 *
 * Each pathway represents a progression step:
 * Entren\u00E1 (train) \u2192 Formate (certify) \u2192 Invert\u00ED (invest) \u2192 Equip\u00E1te (equip)
 *
 * Copy uses plain unicode characters; HTML entities are applied
 * in the component template where needed.
 */

export interface EcosystemPathway {
  id: string;
  tag: string;
  title: string;
  description: string;
  ctaText: string;
  ctaHref: string;
  variant: "online" | "academy" | "franchise" | "gladius";
}

export const pathways: EcosystemPathway[] = [
  {
    id: "online",
    tag: "Entren\u00E1",
    title: "El m\u00E9todo, donde est\u00E9s.",
    description:
      "Templo Online lleva el m\u00E9todo a tu tel\u00E9fono. Test de nivel, rutinas progresivas y seguimiento real. Entren\u00E1 con la misma estructura que en nuestras sedes, desde cualquier lugar del mundo.",
    ctaText: "Descarg\u00E1 la app",
    ctaHref: "/app",
    variant: "online",
  },
  {
    id: "academy",
    tag: "Formate",
    title: "Convertite en entrenador certificado.",
    description:
      "Academy es la formaci\u00F3n oficial de El Templo. Aprend\u00E9 el m\u00E9todo desde adentro, con la gu\u00EDa de Ignacio Bord\u00F3n y su equipo. Formamos entrenadores que entienden la calistenia como ciencia y como pr\u00E1ctica.",
    ctaText: "Conoc\u00E9 Academy",
    ctaHref: "/academy",
    variant: "academy",
  },
  {
    id: "franchise",
    tag: "Invert\u00ED",
    title: "S\u00E9 due\u00F1o de tu propio Templo.",
    description:
      "El modelo de franquicia viene con todo: m\u00E9todo patentado, equipamiento Gladius, formaci\u00F3n de tu equipo y respaldo de una marca con 8 sedes y m\u00E1s de 10.000 alumnos. Invert\u00ED en algo que crece.",
    ctaText: "Explorar franquicias",
    ctaHref: "/franquicias",
    variant: "franchise",
  },
  {
    id: "gladius",
    tag: "Equip\u00E1te",
    title: "Las barras que usamos, ahora en tu espacio.",
    description:
      "Gladius es nuestra l\u00EDnea de barras y paralelas. Dise\u00F1adas en El Templo, probadas en 8 sedes, construidas para durar. Para tu casa, tu parque, tu gimnasio.",
    ctaText: "Ver Gladius",
    ctaHref: "/gladius",
    variant: "gladius",
  },
];
