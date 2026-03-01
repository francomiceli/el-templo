/**
 * Community section data — testimonials, stats, gallery photos.
 *
 * All copy from spec8 (Community + AURA CLUB).
 * Placeholder names marked with [Nombre] for future replacement.
 * Numbers are parametrizable — update values here when they change.
 */

export interface Testimonial {
  quote: string;
  name: string;
  level: string;
  duration: string;
}

export interface CommunityStat {
  value: number;
  prefix: string;
  suffix: string;
  label: string;
}

export interface GalleryPhoto {
  id: number;
  alt: string;
  label: string;
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "Llegu\u00E9 sin poder hacer una flexi\u00F3n. Hoy hago muscle ups. Pero lo que m\u00E1s me cambi\u00F3 no fue la fuerza \u2014 fue encontrar un lugar donde el entrenamiento tiene sentido.",
    name: "[Nombre]",
    level: "Nivel Sigma",
    duration: "2 a\u00F1os en El Templo",
  },
  {
    quote:
      "Pens\u00E9 que la calistenia era para pibes j\u00F3venes. Tengo 45 y es lo mejor que hice por mi cuerpo. El m\u00E9todo se adapta a vos, no al rev\u00E9s.",
    name: "[Nombre]",
    level: "Nivel Delta",
    duration: "1 a\u00F1o en El Templo",
  },
  {
    quote:
      "Lo que me enamor\u00F3 es la comunidad. Ven\u00EDs a entrenar y te vas con amigos. No conozco otro lugar as\u00ED.",
    name: "[Nombre]",
    level: "Nivel Alfa",
    duration: "6 meses en El Templo",
  },
];

export const communityStats: CommunityStat[] = [
  {
    value: 1000,
    prefix: "+",
    suffix: "",
    label: "alumnos por semana",
  },
  {
    value: 8,
    prefix: "",
    suffix: "",
    label: "sedes",
  },
  {
    value: 10000,
    prefix: "+",
    suffix: "",
    label: "alumnos formados",
  },
  {
    value: 10,
    prefix: "+",
    suffix: "",
    label: "a\u00F1os de m\u00E9todo",
  },
];

export const galleryPhotos: GalleryPhoto[] = [
  {
    id: 1,
    alt: "Entrenamiento grupal de calistenia en El Templo",
    label: "Entrenamiento grupal",
  },
  {
    id: 2,
    alt: "Sesi\u00F3n de barras en equipo",
    label: "Sesi\u00F3n de barras",
  },
  {
    id: 3,
    alt: "Saludos post-sesi\u00F3n entre alumnos",
    label: "Saludos post-sesi\u00F3n",
  },
  {
    id: 4,
    alt: "Momento grupal en El Templo",
    label: "Momento grupal",
  },
  {
    id: 5,
    alt: "Entrenamiento al aire libre en Templo Park",
    label: "Templo Park",
  },
  {
    id: 6,
    alt: "Celebraci\u00F3n de logro en la comunidad",
    label: "Celebraci\u00F3n de logro",
  },
  {
    id: 7,
    alt: "Sesi\u00F3n grupal con coach en sede",
    label: "Sesi\u00F3n con coach",
  },
  {
    id: 8,
    alt: "Comunidad El Templo en Barcelona",
    label: "Barcelona",
  },
  {
    id: 9,
    alt: "Alumnos entrenando calistenia avanzada",
    label: "Calistenia avanzada",
  },
];
