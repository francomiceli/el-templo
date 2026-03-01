/**
 * Franquicias page data — centralized content for all franchise sections.
 *
 * Serves Plans 02 (hero, value props, models, includes),
 * 03 (expansion, timeline, founder), and 04 (application form).
 * No component logic — typed exports only.
 */

// --- Value Props (FRAN-02) ---
export interface ValueProp {
  id: string;
  title: string;
  description: string;
  iconLabel: string;
}

export const valueProps: ValueProp[] = [
  {
    id: "metodo",
    title: "M\u00E9todo Propio",
    description:
      "Sistema de entrenamiento patentado con 4 bloques, 5 enfoques y 6 niveles de progresi\u00F3n. No depend\u00E9s de tendencias \u2014 depend\u00E9s de un sistema que funciona.",
    iconLabel: "M\u00E9todo",
  },
  {
    id: "marca",
    title: "Marca Premium",
    description:
      "Identidad visual, posicionamiento y tono de comunicaci\u00F3n que te diferencia de cualquier gym del mercado. Manual de marca, branding completo y soporte creativo.",
    iconLabel: "Marca",
  },
  {
    id: "ecosistema",
    title: "Ecosistema Completo",
    description:
      "Acceso a Olympic Academy (formaci\u00F3n), Gladius (equipamiento propio), app de entrenamiento, comunidad online y eventos AURA CLUB.",
    iconLabel: "Ecosistema",
  },
  {
    id: "acompanamiento",
    title: "Acompa\u00F1amiento Real",
    description:
      "Desde la b\u00FAsqueda del local hasta la apertura. Formaci\u00F3n de entrenadores, setup de sede, lanzamiento y seguimiento operativo.",
    iconLabel: "Acompa\u00F1amiento",
  },
];

// --- Franchise Models (FRAN-03) ---
export interface FranchiseModel {
  id: "activa" | "pasiva";
  title: string;
  tagline: string;
  description: string;
  accentColor: "terracotta" | "aged-gold";
}

export const franchiseModels: FranchiseModel[] = [
  {
    id: "activa",
    title: "Franquicia Activa",
    tagline: "Oper\u00E1s tu Templo.",
    description:
      "Para quienes quieren estar adentro del negocio. Oper\u00E1s la sede, lider\u00E1s al equipo y viv\u00EDs la cultura de El Templo desde adentro. Ideal si ten\u00E9s pasi\u00F3n por el movimiento o quer\u00E9s un emprendimiento con prop\u00F3sito.",
    accentColor: "terracotta",
  },
  {
    id: "pasiva",
    title: "Franquicia Pasiva",
    tagline: "Invert\u00ED en un Templo.",
    description:
      "Para inversores que buscan rentabilidad con un modelo probado. El Templo se encarga de la operaci\u00F3n, el equipo y la gesti\u00F3n. Vos aport\u00E1s el capital y particip\u00E1s del crecimiento.",
    accentColor: "aged-gold",
  },
];

// --- Includes (FRAN-04) ---
export interface IncludesItem {
  id: string;
  title: string;
  description: string;
  iconLabel: string;
}

export const includesItems: IncludesItem[] = [
  {
    id: "metodo",
    title: "M\u00E9todo El Templo",
    description:
      "Sistema completo de entrenamiento: 4 bloques, 5 enfoques, 6 niveles. Planificaci\u00F3n, progresiones y protocolos.",
    iconLabel: "M\u00E9todo",
  },
  {
    id: "formacion",
    title: "Formaci\u00F3n de Entrenadores",
    description:
      "Capacitaci\u00F3n v\u00EDa Olympic Academy para todo tu equipo. Certificaci\u00F3n oficial.",
    iconLabel: "Formaci\u00F3n",
  },
  {
    id: "gladius",
    title: "Equipamiento Gladius",
    description:
      "Barras, paralelas y equipamiento dise\u00F1ado por El Templo. Setup completo de sede.",
    iconLabel: "Gladius",
  },
  {
    id: "marca",
    title: "Marca y Branding",
    description:
      "Manual de identidad visual, naming de sede, se\u00F1al\u00E9tica, presencia digital y soporte creativo.",
    iconLabel: "Marca",
  },
  {
    id: "apertura",
    title: "Acompa\u00F1amiento en Apertura",
    description:
      "Desde la selecci\u00F3n del local hasta el d\u00EDa de apertura. Lanzamiento, marketing y operativa.",
    iconLabel: "Apertura",
  },
  {
    id: "digital",
    title: "Ecosistema Digital",
    description:
      "Acceso a app, comunidad online, eventos AURA CLUB y red de franquicias.",
    iconLabel: "Digital",
  },
];

// --- Expansion Stats (FRAN-05) - used by Plan 03 ---
export interface ExpansionStat {
  value: number;
  prefix: string;
  label: string;
}

export const expansionStats: ExpansionStat[] = [
  { value: 7, prefix: "", label: "sedes en Mar del Plata" },
  { value: 1, prefix: "", label: "sede internacional" },
  { value: 30000, prefix: "+", label: "personas en la comunidad" },
  { value: 1, prefix: "", label: "parque p\u00FAblico de calistenia" },
];

// --- Expansion sede list (FRAN-05) ---
export interface ExpansionCity {
  city: string;
  sedes: string;
}

export const expansionCities: ExpansionCity[] = [
  {
    city: "Mar del Plata, Argentina",
    sedes:
      "Constituci\u00F3n \u2022 Jujuy \u2022 Moreno \u2022 Alem \u2022 Mogotes \u2022 Chapa",
  },
  {
    city: "Mar del Plata (Outdoor)",
    sedes: "El Templo Park \u2014 Parque Primavesi",
  },
  {
    city: "Barcelona, Espa\u00F1a",
    sedes: "Diagonal (inauguraci\u00F3n marzo 2026)",
  },
];

// --- Founder Timeline (FRAN-06) - used by Plan 03 ---
export interface TimelineMilestone {
  year: string;
  description: string;
  isFuture?: boolean;
}

export const founderTimeline: TimelineMilestone[] = [
  {
    year: "2020",
    description: "Nace El Templo en un garage de Mar del Plata.",
  },
  { year: "2021", description: "Primera sede oficial: Constituci\u00F3n." },
  {
    year: "2023",
    description: "5 sedes en Mar del Plata. Nace Olympic Academy.",
  },
  { year: "2025", description: "7 sedes. Lanzamiento de Gladius y app." },
  {
    year: "2026",
    description: "Apertura Barcelona. Expansi\u00F3n internacional.",
  },
  { year: "Pr\u00F3ximo", description: "\u00BFTu ciudad?", isFuture: true },
];

// --- Video/PDF config (FRAN-05 conditionals) - used by Plan 03 ---
export const franquiciasConfig = {
  videoUrl: null as string | null,
  pdfUrl: null as string | null,
  whatsappUrl: "https://wa.link/ci8dpl",
  investmentFigure: "USD 50.000",
};

// --- Form selects (FRAN-07) - used by Plan 04 ---
export const formSelects = {
  modelo: [
    { value: "activa", label: "Franquicia Activa" },
    { value: "pasiva", label: "Franquicia Pasiva" },
    { value: "ambas", label: "Ambas" },
  ],
  experiencia: [
    { value: "fitness", label: "S\u00ED, en fitness" },
    { value: "negocios", label: "S\u00ED, en negocios" },
    { value: "ambas", label: "Ambas" },
    { value: "sin_experiencia", label: "Sin experiencia previa" },
  ],
  capital: [
    { value: "menos_50k", label: "Menos de USD 50.000" },
    { value: "entre_50k_100k", label: "USD 50.000\u2013100.000" },
    { value: "mas_100k", label: "M\u00E1s de USD 100.000" },
  ],
  origen: [
    { value: "instagram", label: "Instagram" },
    { value: "web", label: "Web" },
    { value: "recomendacion", label: "Recomendaci\u00F3n" },
    { value: "google", label: "Google" },
    { value: "otro", label: "Otro" },
  ],
};
