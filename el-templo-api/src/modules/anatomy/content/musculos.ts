import type { MusculoDef } from "../types";

/**
 * Fase 200 P2: los 28 músculos del sketch 019. Las relaciones por rol viven en
 * content/rutas/ (por ruta) y la vista por músculo se deriva.
 *
 * `zona` = región del dibujo + vista (D4). `null` = músculo profundo que no se
 * ve en el dibujo (D10): serrato, manguito, iliopsoas. `precision` es null si y
 * solo si `zona` es null. `queHaceAlumno` es anatomía estándar (L1) en tono
 * alumno (D14, sketch 020 `QUE_HACE`). Todo en borrador (D5).
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
    queHaceAlumno: "Ayuda al dorsal a bajar el brazo.",
  },
  {
    id: "romboides",
    nombre: "Romboides y trapecio medio",
    zona: { slug: "upper-back", vista: "back" },
    precision: "agrupada",
    queHaceAlumno: "Junta los omóplatos hacia atrás.",
  },
  {
    id: "trap-inf",
    nombre: "Trapecio inferior",
    zona: { slug: "trapezius", vista: "back" },
    precision: "aproximada",
    queHaceAlumno: "Baja los omóplatos: aleja los hombros de las orejas.",
  },
  {
    id: "trap-sup",
    nombre: "Trapecio superior",
    zona: { slug: "trapezius", vista: "both" },
    precision: "exacta",
    queHaceAlumno: "Sube los hombros. En los colgados no tiene que mandar él.",
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
      "Lleva el brazo hacia adelante y hacia el centro. Es el de empujar.",
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
    queHaceAlumno: "Lleva el brazo hacia atrás.",
  },
  {
    id: "triceps",
    nombre: "Tríceps braquial",
    zona: { slug: "triceps", vista: "both" },
    precision: "exacta",
    queHaceAlumno: "Estira el codo.",
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
    queHaceAlumno: "Dobla el codo, junto con el bíceps.",
  },
  {
    id: "antebrazo",
    nombre: "Flexores de muñeca y dedos",
    zona: { slug: "forearm", vista: "both" },
    precision: "exacta",
    queHaceAlumno: "Cierra la mano y sostiene el agarre.",
  },
  {
    id: "serrato",
    nombre: "Serrato anterior",
    zona: null,
    precision: null,
    queHaceAlumno:
      "Pega el omóplato a las costillas y lo lleva hacia adelante.",
  },
  {
    id: "manguito",
    nombre: "Manguito rotador",
    zona: null,
    precision: null,
    queHaceAlumno: "Mantiene el hombro centrado y firme.",
  },
  {
    id: "recto-abd",
    nombre: "Recto abdominal",
    zona: { slug: "abs", vista: "front" },
    precision: "exacta",
    queHaceAlumno:
      "Acerca las costillas a la pelvis y evita que la espalda se arquee.",
  },
  {
    id: "oblicuos",
    nombre: "Oblicuos",
    zona: { slug: "obliques", vista: "front" },
    precision: "exacta",
    queHaceAlumno: "Giran e inclinan el tronco, y evitan que rote.",
  },
  {
    id: "erectores",
    nombre: "Erectores espinales",
    zona: { slug: "lower-back", vista: "back" },
    precision: "agrupada",
    queHaceAlumno: "Estiran la espalda y la mantienen derecha.",
  },
  {
    id: "cuadrado",
    nombre: "Cuadrado lumbar",
    zona: { slug: "lower-back", vista: "back" },
    precision: "aproximada",
    queHaceAlumno: "Inclina el tronco al costado y mantiene firme la pelvis.",
  },
  {
    id: "gluteo-mayor",
    nombre: "Glúteo mayor",
    zona: { slug: "gluteal", vista: "back" },
    precision: "agrupada",
    queHaceAlumno: "Estira la cadera: es el que te para y empuja el piso.",
  },
  {
    id: "gluteo-medio",
    nombre: "Glúteo medio y menor",
    zona: { slug: "gluteal", vista: "back" },
    precision: "agrupada",
    queHaceAlumno: "Mantiene la pelvis nivelada cuando estás en una pierna.",
  },
  {
    id: "vastos",
    nombre: "Cuádriceps (vastos)",
    zona: { slug: "quadriceps", vista: "front" },
    precision: "exacta",
    queHaceAlumno: "Estiran la rodilla.",
  },
  {
    id: "recto-fem",
    nombre: "Recto femoral",
    zona: { slug: "quadriceps", vista: "front" },
    precision: "agrupada",
    queHaceAlumno: "Estira la rodilla y levanta la pierna.",
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
    queHaceAlumno: "Levanta la pierna: dobla la cadera.",
  },
  {
    id: "isquios",
    nombre: "Isquiotibiales",
    zona: { slug: "hamstring", vista: "back" },
    precision: "exacta",
    queHaceAlumno: "Doblan la rodilla y estiran la cadera.",
  },
  {
    id: "aductores",
    nombre: "Aductores",
    zona: { slug: "adductors", vista: "both" },
    precision: "agrupada",
    queHaceAlumno: "Juntan las piernas.",
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
