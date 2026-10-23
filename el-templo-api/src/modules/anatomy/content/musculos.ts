import type { MusculoDef } from "../types";

/**
 * Fase 200 P2: los 28 músculos del sketch 019. Las relaciones por rol viven en
 * content/rutas/ (por ruta) y la vista por músculo se deriva.
 *
 * `zona` = región del dibujo + vista (D4). `null` = músculo profundo que no se
 * ve en el dibujo (D10): serrato, manguito, iliopsoas. `debajoDe` = región cuya
 * hoja los muestra "más adentro" (obligatorio en los profundos, prohibido en
 * el resto). `precision` es null si y solo si `zona` es null. `queHaceAlumno`
 * es anatomía estándar (L1) en tono alumno (D14, sketch 020 `QUE_HACE`). Todo
 * en borrador (D5).
 */
export const MUSCULOS = [
  {
    id: "dorsal",
    nombre: "Dorsal ancho",
    zona: { slug: "upper-back", vista: "back" },
    precision: "agrupada",
    queHaceAlumno:
      "Baja el brazo y lo lleva hacia atrás. Es el que te sube en la dominada.",
  },
  {
    id: "redondo",
    nombre: "Redondo mayor",
    zona: { slug: "upper-back", vista: "back" },
    precision: "agrupada",
    queHaceAlumno: "Trabaja con el dorsal: baja el brazo desde arriba.",
  },
  {
    id: "romboides",
    nombre: "Romboides y trapecio medio",
    zona: { slug: "upper-back", vista: "back" },
    precision: "agrupada",
    queHaceAlumno: "Juntan los omóplatos atrás, como cuando sacás pecho.",
  },
  {
    id: "trap-inf",
    nombre: "Trapecio inferior",
    zona: { slug: "trapezius", vista: "back" },
    precision: "aproximada",
    queHaceAlumno:
      "Baja los omóplatos y los acomoda para que puedas subir los brazos por encima de la cabeza.",
  },
  {
    id: "trap-sup",
    nombre: "Trapecio superior",
    zona: { slug: "trapezius", vista: "both" },
    precision: "exacta",
    queHaceAlumno:
      "Sube los hombros hacia las orejas y acompaña cuando levantás los brazos por encima de la cabeza.",
    nota: {
      t: 'En los colgados no tiene que dominar: es el que "encoge los hombros".',
      c: [],
    },
  },
  {
    id: "pectoral",
    nombre: "Pectoral mayor",
    zona: { slug: "chest", vista: "front" },
    precision: "exacta",
    queHaceAlumno:
      "Lleva el brazo hacia adelante y hacia el centro, como al abrazar. Trabaja al empujar y también al tirar.",
  },
  {
    id: "delt-ant",
    nombre: "Deltoides anterior",
    zona: { slug: "deltoids", vista: "front" },
    precision: "agrupada",
    queHaceAlumno: "Levanta el brazo hacia adelante y arriba.",
  },
  {
    id: "delt-post",
    nombre: "Deltoides posterior",
    zona: { slug: "deltoids", vista: "back" },
    precision: "agrupada",
    queHaceAlumno:
      "Lleva el brazo hacia atrás y hacia afuera, como cuando abrís los brazos en cruz.",
  },
  {
    id: "triceps",
    nombre: "Tríceps braquial",
    zona: { slug: "triceps", vista: "both" },
    precision: "exacta",
    queHaceAlumno:
      "Endereza el codo. Es el que te empuja hacia arriba en las flexiones y los fondos.",
  },
  {
    id: "biceps",
    nombre: "Bíceps braquial",
    zona: { slug: "biceps", vista: "front" },
    precision: "exacta",
    queHaceAlumno: "Dobla el codo y gira la palma hacia arriba.",
  },
  {
    id: "braquial",
    nombre: "Braquial y braquiorradial",
    zona: { slug: "forearm", vista: "both" },
    precision: "aproximada",
    queHaceAlumno: "Doblan el codo, junto con el bíceps.",
  },
  {
    id: "antebrazo",
    nombre: "Flexores de muñeca y dedos",
    zona: { slug: "forearm", vista: "both" },
    precision: "exacta",
    queHaceAlumno:
      "Cierran la mano para agarrar fuerte la barra. En la vertical, los dedos te mantienen en equilibrio.",
  },
  {
    id: "serrato",
    nombre: "Serrato anterior",
    zona: null,
    precision: null,
    debajoDe: "chest",
    queHaceAlumno:
      "Pega el omóplato a las costillas. Lo empuja hacia adelante y lo sube cuando levantás los brazos.",
  },
  {
    id: "manguito",
    nombre: "Manguito rotador",
    zona: null,
    precision: null,
    debajoDe: "deltoids",
    queHaceAlumno:
      "Son músculos chiquitos que mantienen el hombro en su lugar mientras movés el brazo.",
  },
  {
    id: "recto-abd",
    nombre: "Recto abdominal",
    zona: { slug: "abs", vista: "front" },
    precision: "exacta",
    queHaceAlumno:
      "Acerca las costillas a la cadera, como en un abdominal, y no deja que la espalda se arquee.",
  },
  {
    id: "oblicuos",
    nombre: "Oblicuos",
    zona: { slug: "obliques", vista: "front" },
    precision: "exacta",
    queHaceAlumno:
      "Giran el tronco y lo inclinan al costado. También lo frenan para que no gire cuando no querés.",
  },
  {
    id: "erectores",
    nombre: "Erectores espinales",
    zona: { slug: "lower-back", vista: "back" },
    precision: "agrupada",
    queHaceAlumno:
      "Van a los costados de la columna: enderezan la espalda y la mantienen derecha.",
  },
  {
    id: "cuadrado",
    nombre: "Cuadrado lumbar",
    zona: { slug: "lower-back", vista: "back" },
    precision: "aproximada",
    queHaceAlumno: "Inclina el tronco al costado y mantiene firme la cadera.",
  },
  {
    id: "gluteo-mayor",
    nombre: "Glúteo mayor",
    zona: { slug: "gluteal", vista: "back" },
    precision: "agrupada",
    queHaceAlumno:
      "Es el que te levanta al subir de una sentadilla y lleva la cadera hacia adelante.",
  },
  {
    id: "gluteo-medio",
    nombre: "Glúteo medio y menor",
    zona: { slug: "gluteal", vista: "back" },
    precision: "agrupada",
    queHaceAlumno:
      "Abren la pierna hacia el costado y mantienen la cadera derecha cuando estás en un pie.",
  },
  {
    id: "vastos",
    nombre: "Cuádriceps (vastos)",
    zona: { slug: "quadriceps", vista: "front" },
    precision: "exacta",
    queHaceAlumno: "Enderezan la rodilla, como al subir un escalón.",
  },
  {
    id: "recto-fem",
    nombre: "Recto femoral",
    zona: { slug: "quadriceps", vista: "front" },
    precision: "agrupada",
    queHaceAlumno:
      "Endereza la rodilla y levanta la pierna hacia adelante. Es la parte del cuádriceps que llega hasta la cadera.",
    nota: {
      t: "También flexiona la cadera: en FL sostiene las piernas en línea (isométrico).",
      c: ["R"],
    },
  },
  {
    id: "psoas",
    nombre: "Iliopsoas (flexores de cadera)",
    zona: null,
    precision: null,
    debajoDe: "abs",
    queHaceAlumno:
      "Levanta la pierna hacia el pecho, como al subir la rodilla.",
  },
  {
    id: "isquios",
    nombre: "Isquiotibiales",
    zona: { slug: "hamstring", vista: "back" },
    precision: "exacta",
    queHaceAlumno:
      "Están atrás del muslo: doblan la rodilla y llevan la pierna hacia atrás.",
  },
  {
    id: "aductores",
    nombre: "Aductores",
    zona: { slug: "adductors", vista: "both" },
    precision: "agrupada",
    queHaceAlumno:
      "Están en la parte de adentro del muslo: juntan las piernas.",
  },
  {
    id: "gemelo",
    nombre: "Gemelo",
    zona: { slug: "calves", vista: "both" },
    precision: "agrupada",
    queHaceAlumno: "Te pone en puntas de pie.",
  },
  {
    id: "soleo",
    nombre: "Sóleo",
    zona: { slug: "calves", vista: "both" },
    precision: "agrupada",
    queHaceAlumno:
      "Te pone en puntas de pie, sobre todo con la rodilla doblada.",
  },
  {
    id: "tibial",
    nombre: "Tibial anterior",
    zona: { slug: "tibialis", vista: "front" },
    precision: "exacta",
    queHaceAlumno: "Levanta la punta del pie.",
  },
] as const satisfies readonly MusculoDef[];

/** Id de uno de los 28 músculos. */
export type MusculoId = (typeof MUSCULOS)[number]["id"];
