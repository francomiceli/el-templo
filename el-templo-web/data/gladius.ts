/**
 * Gladius page data — centralized content for all Gladius sections.
 *
 * Serves Plan 02: Hero, Philosophy, InAction, Catalog, Contact.
 * No component logic — typed exports only.
 */

// --- Feature items for Philosophy section ---
export interface GladiusFeature {
  title: string;
  text: string;
}

// --- Photo placeholder for InAction gallery ---
export interface GladiusPhoto {
  id: number;
  alt: string;
}

// --- Config ---
export const gladiusConfig = {
  whatsappUrl: "https://wa.link/ci8dpl",

  hero: {
    title: "EQUIPAMIENTO DE CALISTENIA FORJADO PARA LOS QUE ENTRENAN EN SERIO.",
    subtitle:
      "Barras de calistenia dise\u00F1adas en El Templo. Probadas en 8 sedes. Construidas para durar.",
    cta: "VER PRODUCTOS",
    ctaAnchor: "#catalogo-gladius",
    ctaSecondary: "CONSULTAR",
    ctaSecondaryAnchor: "#contacto-gladius",
  },

  philosophy: {
    title: "EQUIPAMIENTO DE CALISTENIA PROFESIONAL",
    body: "Gladius naci\u00F3 dentro de El Templo. Las mismas barras con las que entrenan m\u00E1s de 1000 alumnos cada semana, ahora en tu casa, tu parque, tu espacio. No es equipamiento gen\u00E9rico. Es la herramienta que us\u00E1s cuando entren\u00E1s con tu propio peso y quer\u00E9s que el fierro est\u00E9 a la altura.",
    features: [
      {
        title: "Dise\u00F1o Propio",
        text: "Cada barra est\u00E1 pensada para calistenia real, no fitness gen\u00E9rico.",
      },
      {
        title: "Probadas en 8 Sedes",
        text: "El mismo equipamiento que usan m\u00E1s de 1000 alumnos cada semana.",
      },
      {
        title: "Construidas para Durar",
        text: "Materiales y terminaciones pensados para uso intensivo diario.",
      },
    ] satisfies GladiusFeature[],
  },

  inAction: {
    title: "EQUIPAMIENTO DE CALISTENIA EN ACCI\u00D3N",
    subtitle:
      "El mismo equipamiento que us\u00E1s en El Templo. En cada sede, cada sesi\u00F3n, cada d\u00EDa.",
    socialProof: "Las mismas barras que usan +1000 alumnos en 8 sedes.",
    photos: Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      alt: `Gladius en uso - foto ${i + 1}`,
    })) satisfies GladiusPhoto[],
  },

  contact: {
    title: "CONSULT\u00C1 POR TU EQUIPAMIENTO DE CALISTENIA",
    subtitle:
      "Escribinos para conocer disponibilidad, precios y opciones de env\u00EDo.",
    whatsappCta: "CONSULTAR POR WHATSAPP",
  },
};
