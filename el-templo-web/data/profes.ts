/**
 * Profes publicados en la web (fase 195, D-27).
 *
 * Archivo editable por el equipo (D-27): sumar un profe = agregar un objeto con
 * foto en public/images/photos/ y publicar con el boton 'solo web'. No sale de
 * la DB.
 *
 * Un profe se publica solo si `publicado` es true, tiene `foto` y al menos un
 * parrafo de `bio` (ver `publishedProfes`). `sedes` = slugs de sedes (los de
 * `/sedes/<slug>`). `sameAs` = perfiles publicos (Instagram, etc.), puede ser [].
 * El verificador del build lee este archivo con una regex: mantener un objeto
 * por profe, con `slug`, `foto`, `bio` y `publicado` como estan abajo.
 */

export interface Profe {
  slug: string;
  nombre: string;
  rol: string;
  bio: string[];
  foto: string | null;
  /** Slugs de sedes (`/sedes/<slug>`). */
  sedes: string[];
  sameAs: string[];
  publicado: boolean;
}

export const profes: Profe[] = [
  {
    slug: "ignacio-bordon",
    nombre: "Ignacio Bordón",
    rol: "Fundador de El Templo Calistenia y creador del método",
    bio: [
      "Ignacio Bordón. Ex gimnasta de alto rendimiento. Más de 20 años de experiencia en calistenia y entrenamiento con el peso del cuerpo.",
      "El Templo nació en septiembre de 2020, en el garage de su casa en Mar del Plata. Lo que empezó como un método personal se convirtió en un sistema internacional con sedes en dos continentes.",
      "La visión: democratizar el movimiento con el peso del cuerpo. Que cualquier persona pueda dominar su cuerpo a través de un método progresivo, sin importar desde dónde empiece.",
    ],
    foto: "/images/photos/ignacio-bordon.webp",
    sedes: [],
    sameAs: [],
    publicado: true,
  },
  // EJEMPLO para completar (NO se publica: publicado false y sin foto).
  // Para sumar un profe: copiar este objeto, completar nombre, rol, bio y
  // sedes con datos reales, subir su foto a public/images/photos/, poner
  // `foto` y pasar `publicado` a true.
  {
    slug: "profe-de-ejemplo",
    nombre: "Nombre del profe (EJEMPLO, completar)",
    rol: "Entrenador (EJEMPLO, completar)",
    bio: ["Bio de ejemplo: completar con el texto real del profe."],
    foto: null,
    sedes: [],
    sameAs: [],
    publicado: false,
  },
];

export const DEFAULT_BLOG_AUTHOR_SLUG = "ignacio-bordon";

/** Profes que se publican: con `publicado`, foto y bio cargadas a proposito. */
export const publishedProfes: Profe[] = profes.filter(
  (p) => p.publicado && p.foto && p.bio.length > 0,
);

export function findProfe(slug: string): Profe | undefined {
  return publishedProfes.find((p) => p.slug === slug);
}
