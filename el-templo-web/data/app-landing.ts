/**
 * App landing page data — centralized content for all /app sections.
 *
 * Serves Plans 02 (hero, ecosystem, arete, el-templo),
 * 03 (academy, labs, flywheel, download), and 04 (forms, SEO, cross-site).
 * No component logic — typed exports only.
 */

// --- Module definition ---
export interface AppModule {
  id: string;
  name: string;
  tagline: string;
  description: string;
  features: string[];
  properties: { label: string; value: string }[];
  accentColor: string;
  badgeText: string;
  badgeClass: string;
  isActive: boolean;
  iconPlaceholder: string;
}

export const modules: AppModule[] = [
  {
    id: "arete",
    name: "Aret\u0113",
    tagline: "Aline\u00E1 mente y cuerpo. El punto de partida.",
    description:
      "Aret\u0113 es el m\u00F3dulo de h\u00E1bitos. Tu punto de entrada al ecosistema. M\u00F3dulos gratuitos para construir una rutina consciente: cuerpo, mente, alimentaci\u00F3n, descanso. Sin compromiso.",
    features: [
      "Tracking de h\u00E1bitos diarios",
      "M\u00F3dulos gratuitos de bienestar",
      "Contenido de filosof\u00EDa y mindset",
      "Puerta de entrada accesible",
    ],
    properties: [
      { label: "Modelo", value: "Freemium" },
      { label: "P\u00FAblico", value: "Cualquier persona" },
      { label: "Estado", value: "OPERATIVO" },
      { label: "Stores", value: "App Store + Google Play" },
    ],
    accentColor: "--color-terracotta",
    badgeText: "ACTIVO",
    badgeClass: "app-landing-badge--terracotta",
    isActive: true,
    iconPlaceholder: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="20" cy="12" r="6" /><path d="M10 34c0-5.523 4.477-10 10-10s10 4.477 10 10" /><path d="M20 22v6" /><path d="M16 28h8" /></svg>`,
  },
  {
    id: "el-templo",
    name: "El Templo",
    tagline: "El m\u00E9todo completo. Desde donde est\u00E9s.",
    description:
      "El m\u00F3dulo de entrenamiento. Todo el sistema que funciona en 8 sedes y 2 pa\u00EDses en formato digital. Test de nivel, Ruta del H\u00E9roe, rutinas personalizadas, seguimiento y comunidad.",
    features: [
      "Test de Nivel",
      "Ruta del H\u00E9roe \u2014 Progresi\u00F3n guiada",
      "Rutinas personalizadas seg\u00FAn nivel y objetivos",
      "Seguimiento de progreso",
      "Comunidad online",
    ],
    properties: [
      { label: "Modelo", value: "Premium" },
      { label: "P\u00FAblico", value: "Alumnos + cualquier persona" },
      { label: "Estado", value: "OPERATIVO" },
      { label: "Contenido", value: "M\u00E9todo patentado de El Templo" },
    ],
    accentColor: "--color-terracotta",
    badgeText: "ACTIVO",
    badgeClass: "app-landing-badge--terracotta",
    isActive: true,
    iconPlaceholder: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4L6 14h28L20 4z" /><line x1="10" y1="14" x2="10" y2="30" /><line x1="16" y1="14" x2="16" y2="30" /><line x1="24" y1="14" x2="24" y2="30" /><line x1="30" y1="14" x2="30" y2="30" /><line x1="4" y1="30" x2="36" y2="30" /><line x1="4" y1="34" x2="36" y2="34" /></svg>`,
  },
  {
    id: "olympic-academy",
    name: "Olympic Academy",
    tagline: "Form\u00E1 entrenadores. Desde la app.",
    description:
      "El programa completo de formaci\u00F3n profesional dentro de la plataforma. 3 niveles: Trainer, Olympic Trainer, Spartan Trainer. Videos, material, evaluaciones y certificaci\u00F3n digital.",
    features: [
      "3 niveles de certificaci\u00F3n",
      "Videos y material descargable",
      "Evaluaciones te\u00F3ricas y pr\u00E1cticas",
      "Certificaci\u00F3n digital por nivel",
    ],
    properties: [
      { label: "Modelo", value: "Premium (por nivel o suscripci\u00F3n)" },
      { label: "Estado", value: "PR\u00D3XIMAMENTE" },
      {
        label: "Relaci\u00F3n /academy",
        value:
          "Mismo programa; /academy explica, el m\u00F3dulo es donde se cursa",
      },
    ],
    accentColor: "--color-aged-gold",
    badgeText: "PR\u00D3XIMAMENTE",
    badgeClass: "app-landing-badge--aged-gold",
    isActive: false,
    iconPlaceholder: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4l4 8h8l-6 5 2 9-8-5-8 5 2-9-6-5h8z" /><path d="M12 34h16" /><path d="M16 34v-4" /><path d="M24 34v-4" /></svg>`,
  },
  {
    id: "labs",
    name: "Labs",
    tagline: "Gestion\u00E1 tu gimnasio. Simple.",
    description:
      "Labs es el m\u00F3dulo de gesti\u00F3n. Naci\u00F3 de a\u00F1os de resolver problemas reales: de un garage a una cadena internacional. Intuitiva para pymes, emprendedores y franquiciados.",
    features: [
      "Turnos \u2014 Reservas, horarios, capacidad",
      "Socios \u2014 Altas, bajas, historial, comunicaci\u00F3n",
      "Finanzas \u2014 Cobros, facturaci\u00F3n, reportes",
      "Mensajer\u00EDa \u2014 Directa con socios y equipo",
      "CRM \u2014 Leads, pipeline, conversi\u00F3n",
      "M\u00E9tricas \u2014 Dashboard con KPIs",
    ],
    properties: [
      { label: "Modelo", value: "SaaS (suscripci\u00F3n mensual)" },
      {
        label: "P\u00FAblico 1",
        value: "Franquiciados (incluido en franquicia)",
      },
      { label: "P\u00FAblico 2", value: "Gimnasios externos" },
      { label: "Estado", value: "PR\u00D3XIMAMENTE" },
      {
        label: "Diferencial",
        value: "Simplicidad nacida de experiencia real de escalar gimnasios",
      },
    ],
    accentColor: "--color-azul-noche",
    badgeText: "PR\u00D3XIMAMENTE",
    badgeClass: "app-landing-badge--azul-noche",
    isActive: false,
    iconPlaceholder: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="8" width="28" height="24" rx="3" /><line x1="6" y1="14" x2="34" y2="14" /><line x1="14" y1="14" x2="14" y2="32" /><circle cx="24" cy="23" r="4" /><path d="M24 19v4l2 2" /></svg>`,
  },
];

// --- Hero content ---
export interface HeroContent {
  title: string;
  subtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  ctaSecondaryHref: string;
  badgeLine: string;
}

export const heroContent: HeroContent = {
  title: "EL TEMPLO EN TU BOLSILLO.",
  subtitle:
    "Una plataforma. Cuatro m\u00F3dulos. Todo el ecosistema de El Templo en versi\u00F3n digital: h\u00E1bitos, entrenamiento, formaci\u00F3n y gesti\u00F3n.",
  ctaPrimary: "DESCARG\u00C1 LA APP",
  ctaSecondary: "CONOC\u00C9 LOS M\u00D3DULOS",
  ctaSecondaryHref: "#modulos",
  badgeLine:
    "Disponible en App Store y Google Play \u2022 M\u00F3dulos gratuitos y premium",
};

// --- Ecosystem section ---
export interface EcosystemContent {
  title: string;
  subtitle: string;
  unlockFlow: string[];
}

export const ecosystemContent: EcosystemContent = {
  title: "UNA PLATAFORMA. TODO EL CAMINO.",
  subtitle:
    "Cada m\u00F3dulo acompa\u00F1a una etapa de tu evoluci\u00F3n. Desbloqu\u00E9 a tu ritmo.",
  unlockFlow: ["gratis", "entren\u00E1", "formate", "gestion\u00E1"],
};

// --- Flywheel section (Plan 03) ---
export interface FlywheelStage {
  name: string;
  verb: string;
}

export interface FlywheelContent {
  title: string;
  subtitle: string;
  connectionText: string;
  stages: FlywheelStage[];
}

export const flywheelContent: FlywheelContent = {
  title: "EL CICLO COMPLETO. EN DIGITAL.",
  subtitle:
    "Cada m\u00F3dulo te lleva al siguiente. Cada paso te acerca m\u00E1s al dominio completo.",
  connectionText:
    "El mismo camino que viv\u00EDs en nuestras sedes \u2014 entren\u00E1, formate, lider\u00E1, invert\u00ED \u2014 ahora tiene su versi\u00F3n digital.",
  stages: [
    { name: "Aret\u0113", verb: "aline\u00E1" },
    { name: "El Templo", verb: "entren\u00E1" },
    { name: "Olympic Academy", verb: "formate" },
    { name: "Labs", verb: "gestion\u00E1" },
  ],
};

// --- Download section (Plan 03) ---
export interface DownloadContent {
  title: string;
  subtitle: string;
  badgeText: string;
}

export const downloadContent: DownloadContent = {
  title: "EMPEZ\u00C1 AHORA.",
  subtitle:
    "Descarg\u00E1 El Templo Online y comenz\u00E1 con Aret\u0113 \u2014 gratis.",
  badgeText: "Disponible en iOS y Android. Empez\u00E1 con Aret\u0113 gratis.",
};

// --- Store links ---
export const storeLinks = {
  appStore: "#",
  googlePlay: "#",
};

// --- Page config ---
export interface AppLandingSection {
  id: string;
  label: string;
}

export const appLandingConfig = {
  whatsappUrl: "https://wa.link/ci8dpl",
  sections: [
    { id: "hero-app", label: "Inicio" },
    { id: "modulos", label: "M\u00F3dulos" },
    { id: "modulo-arete", label: "Aret\u0113" },
    { id: "modulo-el-templo", label: "El Templo" },
    { id: "modulo-academy", label: "Academy" },
    { id: "modulo-labs", label: "Labs" },
    { id: "flywheel-digital", label: "Flywheel" },
    { id: "descarga-app", label: "Descarga" },
  ] as AppLandingSection[],
};
