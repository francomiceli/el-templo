/**
 * Disciplinas de El Templo (fase 195, D-12): una pagina indexable por
 * disciplina en `/disciplinas/<slug>`.
 *
 * Los textos se arman SOLO con el copy ya publicado en el sitio
 * (SectionMethod, SectionLevels, SectionApproaches) y con los nombres reales de
 * las actividades y pases del catalogo: sin precios, sin horarios fijos, sin
 * cantidades inventadas. Los niveles replican el copy de
 * `components/SectionLevels.vue` (si se edita uno, editar el otro).
 *
 * Contenido editable: se publica con el boton "solo web" (D-11).
 *
 * `matchers` se comparan (minusculas, sin acentos, por palabra completa) contra
 * `sede.activities[].name` de los datos reales: una sede aparece en "Donde se
 * dicta" solo si tiene una actividad publicada que coincide.
 */
import type { WebSede } from "./web-data.types";

export interface DisciplinaSeccion {
  titulo: string;
  texto: string;
}

export interface DisciplinaNivel {
  nombre: string;
  descripcion: string;
  foto: string;
}

export interface Disciplina {
  slug: string;
  nombre: string;
  titulo: string;
  /** Meta description de la pagina. */
  descripcion: string;
  intro: string;
  secciones: DisciplinaSeccion[];
  niveles?: DisciplinaNivel[];
  matchers: string[];
}

const niveles: DisciplinaNivel[] = [
  {
    nombre: "Alfa",
    descripcion:
      "Tu cuerpo aprende a moverse de nuevo. Patrones básicos de fuerza, movilidad y control. No importa de dónde venís — importa hacia dónde vas. Alfa es el cimiento sobre el que se construye todo lo demás.",
    foto: "/images/photos/nivel-alfa.webp",
  },
  {
    nombre: "Delta",
    descripcion:
      "Los movimientos empiezan a fluir. La fuerza aparece donde antes no estaba. Tu cuerpo ya no solo se adapta — responde. Delta es donde el método empieza a demostrarte por qué funciona.",
    foto: "/images/photos/nivel-delta.webp",
  },
  {
    nombre: "Sigma",
    descripcion:
      "Movimientos avanzados. Potencia real. Tu cuerpo hace cosas que antes parecían imposibles. Sigma es donde la calistenia deja de ser ejercicio y se convierte en dominio. El método no afloja — vos tampoco.",
    foto: "/images/photos/nivel-sigma.webp",
  },
  {
    nombre: "Omega",
    descripcion:
      "Progresiones avanzadas, control absoluto, fuerza que se ve y se siente. Omega es para quienes llevan años en el camino y siguen buscando más. No es el final — es donde el entrenamiento se vuelve arte.",
    foto: "/images/photos/nivel-omega.webp",
  },
  {
    nombre: "Spartan",
    descripcion:
      "Ya no entrenás solo para vos. Tu presencia eleva a la comunidad. Spartan es el nivel de quien lidera desde la práctica, no desde la teoría. Un referente dentro del Templo.",
    foto: "/images/photos/nivel-spartan.webp",
  },
  {
    nombre: "Olympic",
    descripcion:
      "Excelencia física, mental y espiritual. Olympic no es un destino — es un estándar. La búsqueda permanente de ser mejor en el cuerpo, la mente y la vida. El nivel más alto del Templo es también el más humilde: quien más sabe es quien más practica.",
    foto: "/images/photos/nivel-olympic.webp",
  },
];

export const disciplinas: Disciplina[] = [
  {
    slug: "calistenia",
    nombre: "Calistenia",
    titulo: "Calistenia: el método y sus 6 niveles",
    descripcion:
      "Calistenia con método: sesiones de 1 hora en 4 bloques, 6 niveles de progresión con peso corporal y un entrenador que te asigna tu nivel.",
    intro:
      "Un método de entrenamiento con peso corporal. Nada es al azar. Un sistema de entrenamiento progresivo diseñado para que cada sesión tenga propósito y cada mes tenga dirección. Tus resultados no dependen de la suerte. Dependen de la estructura.",
    secciones: [
      {
        titulo: "Estructura de cada sesión",
        texto:
          "Cada sesión dura 1 hora y está dividida en 4 bloques específicos. Cada bloque tiene un objetivo claro. Entrenamos todos los sistemas energéticos de manera técnica y progresiva.",
      },
      {
        titulo: "01 · Initium (Inicio)",
        texto:
          "Movilidad, activación y entrada en calor. Preparamos el cuerpo y la mente para lo que viene. Cada sesión empieza con intención, no con apuro.",
      },
      {
        titulo: "02 · Nucleus (Núcleo)",
        texto:
          "El patrón principal de fuerza. El corazón de la sesión. Acá se trabaja el movimiento central del día con progresión real y técnica precisa.",
      },
      {
        titulo: "03 · Deuteros (Complementario)",
        texto:
          "Técnica, control y trabajo complementario. Refuerza lo que el Nucleus construye. Equilibra el cuerpo y profundiza el dominio del movimiento.",
      },
      {
        titulo: "04 · Athlos (Desafío)",
        texto:
          "Retos, juegos de fuerza, trabajo en equipo y cierre. La parte que pone a prueba lo entrenado y construye comunidad. Cada sesión termina con energía, no con agotamiento.",
      },
      {
        titulo: "ROM · Range of Motion",
        texto:
          "Sesiones dedicadas a la movilidad, flexibilidad y rango de movimiento. Porque la fuerza sin movilidad es fuerza limitada. El cuerpo necesita moverse libre para moverse fuerte.",
      },
      {
        titulo: "SKILLS · Trabajo específico",
        texto:
          "Sesiones enfocadas en un skill puntual: handstand, muscle up, front lever, planche. El espacio para obsesionarte con un movimiento hasta dominarlo.",
      },
      {
        titulo: "Los 5 enfoques",
        texto:
          "En El Templo no entrenamos músculos. Entrenamos capacidades. Cinco enfoques — Kallós (el centro), Sthenos (la fuerza), Motus (el movimiento), Pyros (el fuego) y Dynamis (el dominio) — que son dimensiones del movimiento humano y trabajan juntas.",
      },
    ],
    niveles,
    matchers: ["sesion grupal", "rom"],
  },
  {
    slug: "actividades-con-aura",
    nombre: "Actividades con Aura",
    titulo: "Actividades con Aura: Verticales, Acrobacias y Open Gym",
    descripcion:
      "Actividades especiales de El Templo con cupo propio: Verticales, Acrobacias y Open Gym. Se reservan con el pase de Actividades con Aura.",
    intro:
      "Verticales, Acrobacias y Open Gym son actividades especiales de El Templo, con cupo propio y por fuera de tu plan mensual. Se reservan con el pase de Actividades con Aura.",
    secciones: [
      {
        titulo: "Cómo funciona el pase",
        texto:
          "El pase de Actividades con Aura tiene versión para socios y para externos, con distintas cantidades de accesos. Para conocer cómo reservar tu lugar, consultá por WhatsApp.",
      },
    ],
    matchers: ["verticales", "acrobacias", "open gym"],
  },
  {
    slug: "yoga",
    nombre: "Yoga",
    titulo: "Yoga en El Templo: para calisténicos y regenerativo",
    descripcion:
      "Clases de yoga en El Templo: Yoga para calisténicos y Yoga regenerativo, con clase de prueba y pases propios.",
    intro:
      "Dos clases de yoga dentro de El Templo: Yoga para calisténicos y Yoga regenerativo. Son actividades especiales, con pase propio.",
    secciones: [
      {
        titulo: "Cómo se reservan",
        texto:
          "El yoga tiene clase de prueba y pases propios: clase suelta, pack de clases y la opción de 2 veces por semana. Consultá por WhatsApp para saber cuál te conviene.",
      },
    ],
    matchers: ["yoga"],
  },
];

export function findDisciplina(slug: string): Disciplina | undefined {
  return disciplinas.find((d) => d.slug === slug);
}

/** Minusculas y sin acentos, para comparar nombres de actividades. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** `matcher` como palabra(s) completa(s) dentro del nombre normalizado. */
function nameMatches(name: string, matcher: string): boolean {
  const words = ` ${normalize(name).replace(/[^a-z0-9]+/g, " ")} `;
  return words.includes(` ${normalize(matcher)} `);
}

/**
 * Sedes con clases (kind gym) que dictan la disciplina: tienen una actividad
 * publicada cuyo nombre coincide con algun matcher. Puede devolver [].
 */
export function sedesForDisciplina(
  sedes: WebSede[],
  disciplina: Disciplina,
): WebSede[] {
  return sedes.filter(
    (sede) =>
      sede.kind === "gym" &&
      sede.activities.some((activity) =>
        disciplina.matchers.some((matcher) =>
          nameMatches(activity.name, matcher),
        ),
      ),
  );
}
