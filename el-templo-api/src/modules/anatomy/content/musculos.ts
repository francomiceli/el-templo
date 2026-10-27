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
      "Es el músculo grande que te sube en las Dominadas: baja el brazo desde arriba hacia el costado del cuerpo, y en el Muscle Up es el que arranca el tirón. En el Front Lever hace lo mismo con los brazos rectos y es el que evita que el cuerpo caiga, como si quisieras llevar la barra hacia la cadera. Si le falta largo, en el Bridge no te deja abrir los hombros y la espalda baja termina compensando.",
  },
  {
    id: "redondo",
    nombre: "Redondo mayor",
    zona: { slug: "upper-back", vista: "back" },
    precision: "agrupada",
    queHaceAlumno:
      "Trabaja pegado al dorsal y hace casi lo mismo: baja el brazo desde arriba, lo lleva hacia atrás y lo gira hacia adentro. Por eso suma en cada tirón de las Dominadas, los Remos y el Muscle Up, y en el Front Lever ayuda al dorsal a sostener el cuerpo con los brazos rectos. En el Bridge se estira junto con el dorsal, así que si está corto también te frena al abrir los hombros.",
  },
  {
    id: "romboides",
    nombre: "Romboides y trapecio medio",
    zona: { slug: "upper-back", vista: "back" },
    precision: "agrupada",
    queHaceAlumno:
      "Juntan los omóplatos hacia la columna: son los que sentís entre los omóplatos al final de cada Remo. En las Dominadas y el Front Lever llevan los hombros hacia atrás para que no se redondeen, y en el Back Lever no mueven nada: mantienen el omóplato firme mientras colgás. Si les falta fuerza, en el Remo los hombros se van hacia adelante y el tirón queda corto.",
  },
  {
    id: "trap-inf",
    nombre: "Trapecio inferior",
    zona: { slug: "trapezius", vista: "back" },
    precision: "aproximada",
    queHaceAlumno:
      "Tira del omóplato hacia abajo y ayuda a girarlo cuando el brazo sube por encima de la cabeza. En las Dominadas y el Front Lever es el que mantiene los hombros lejos de las orejas mientras tirás. En la Handstand cumple otra función: no baja el hombro, sino que ayuda a girar el omóplato para que los brazos queden bien arriba, en línea con el cuerpo.",
  },
  {
    id: "trap-sup",
    nombre: "Trapecio superior",
    zona: { slug: "trapezius", vista: "both" },
    precision: "exacta",
    queHaceAlumno:
      "Es el que sube los hombros hacia las orejas, y en la Handstand eso es justo lo que querés: junto con el giro del omóplato, te deja empujar el piso con los brazos bien estirados. También trabaja fuerte en el Handstand Push Up y en el Bridge, cuando empujás para abrir los hombros. En los colgados es al revés: si toma el mando, el hombro se encoge y pierde la posición baja.",
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
      "Es el músculo del pecho y trabaja tanto al empujar como al tirar: en los Push Ups, los Fondos y el Planche empuja llevando el brazo hacia adelante, y en las Dominadas ayuda al dorsal a bajarlo. En el Back Lever, boca abajo y con los brazos atrás, frena que los hombros se vayan más hacia atrás. En el Bridge se estira y, si está corto, limita cuánto abrís los hombros.",
  },
  {
    id: "delt-ant",
    nombre: "Deltoides anterior",
    zona: { slug: "deltoids", vista: "front" },
    precision: "agrupada",
    queHaceAlumno:
      "Es la parte de adelante del hombro y levanta el brazo hacia adelante y arriba. En el Planche y el Handstand Push Up es de los que más trabajan, y en el Back Lever, con los brazos atrás del cuerpo, frena que se vayan todavía más hacia atrás. En la Handstand, en cambio, no empuja tanto: ayuda a mantener los brazos en línea con el cuerpo.",
  },
  {
    id: "delt-post",
    nombre: "Deltoides posterior",
    zona: { slug: "deltoids", vista: "back" },
    precision: "agrupada",
    queHaceAlumno:
      "Es la parte de atrás del hombro: lleva el brazo hacia atrás y lo abre, como al remar. Lo sentís en los Remos y el Front Lever Row cuando el codo pasa por detrás del cuerpo, y en el Front Lever ayuda al dorsal a sostener el cuerpo con los brazos rectos. En las Dominadas no tira tanto: acompaña y mantiene firme el hombro.",
  },
  {
    id: "triceps",
    nombre: "Tríceps braquial",
    zona: { slug: "triceps", vista: "both" },
    precision: "exacta",
    queHaceAlumno:
      "Endereza el codo: es el que te empuja hacia arriba en los Push Ups, los Fondos y el Handstand Push Up, y el que termina el Muscle Up arriba de la barra. Una de sus partes cruza el hombro y ayuda a llevar el brazo hacia atrás, por eso también trabaja en el Front Lever y el Manna aunque el codo no se mueva. En la Handstand sostiene los brazos bien estirados.",
  },
  {
    id: "biceps",
    nombre: "Bíceps braquial",
    zona: { slug: "biceps", vista: "front" },
    precision: "exacta",
    queHaceAlumno:
      "Dobla el codo y gira la palma hacia arriba, y tira junto con la espalda en las Dominadas, los Remos y el Muscle Up. Su tendón largo pasa por delante del hombro, y en el Planche y el Back Lever trabaja aunque el brazo esté recto, sosteniendo el hombro. Por eso en esos dos conviene avanzar de a poco: el tendón se adapta más lento que el músculo.",
  },
  {
    id: "braquial",
    nombre: "Braquial y braquiorradial",
    zona: { slug: "forearm", vista: "both" },
    precision: "aproximada",
    queHaceAlumno:
      "Doblan el codo junto con el bíceps, y el braquial lo hace con la palma mirando para cualquier lado, así que trabaja con todos los agarres. Por eso cargan en cada tirón de las Dominadas, los Remos y el Muscle Up, y se sienten en la parte baja del brazo y en el antebrazo. En el Back Lever no doblan nada: evitan que el codo se pase de recto.",
  },
  {
    id: "antebrazo",
    nombre: "Flexores de muñeca y dedos",
    zona: { slug: "forearm", vista: "both" },
    precision: "exacta",
    queHaceAlumno:
      "Cierran la mano y doblan la muñeca: tu agarre en las Dominadas y el Toe to Bar depende de ellos. En la Handstand son los que más corrigen el equilibrio: cuando sentís que te pasás, clavan los dedos en el piso para volverte a la vertical. En el Bridge, con la muñeca doblada al máximo hacia atrás, son los que se estiran.",
  },
  {
    id: "serrato",
    nombre: "Serrato anterior",
    zona: null,
    precision: null,
    debajoDe: "chest",
    queHaceAlumno:
      "Mantiene el omóplato pegado a las costillas y lo lleva hacia adelante, como cuando empujás el piso lejos de vos. En los Push Ups y el Planche es el que redondea apenas la espalda alta, y en la Handstand gira el omóplato para que los brazos lleguen bien arriba. Si le falta fuerza, el omóplato se despega de la espalda y el empuje pierde base.",
  },
  {
    id: "manguito",
    nombre: "Manguito rotador",
    zona: null,
    precision: null,
    debajoDe: "deltoids",
    queHaceAlumno:
      "Son cuatro músculos chicos que rodean el hombro y mantienen la cabeza del hueso del brazo centrada mientras los grandes hacen la fuerza. No son los que mueven el brazo, pero lo sostienen en casi todo lo que hacés: las Dominadas, los Fondos, el Planche, la Handstand. Cuando se cansan o les falta fuerza, el hombro pierde estabilidad bajo carga.",
  },
  {
    id: "recto-abd",
    nombre: "Recto abdominal",
    zona: { slug: "abs", vista: "front" },
    precision: "exacta",
    queHaceAlumno:
      "Es el abdomen de adelante: acerca las costillas a la pelvis y cierra el cuerpo. En el Toe to Bar y el Manna es el que te dobla para subir las piernas, y en el Front Lever evita que la espalda se arquee y la cadera caiga. En los Push Ups, el Planche y la Handstand no mueve nada, pero si se afloja la espalda baja se arquea; en el Bridge, en cambio, se estira.",
  },
  {
    id: "oblicuos",
    nombre: "Oblicuos",
    zona: { slug: "obliques", vista: "front" },
    precision: "exacta",
    queHaceAlumno:
      "Son los abdominales del costado: giran e inclinan el tronco y, sobre todo, frenan que se gire o se incline cuando no querés. En las planchas laterales sostienen el costado, y en el Toe to Bar y el Front Lever trabajan con el abdomen para mantener el cuerpo cerrado y firme. En el Pistol Squat y el Lunge no mueven nada: mantienen la pelvis y la espalda quietas mientras trabajan las piernas.",
  },
  {
    id: "erectores",
    nombre: "Erectores espinales",
    zona: { slug: "lower-back", vista: "back" },
    precision: "agrupada",
    queHaceAlumno:
      "Son los músculos largos a los costados de la columna: enderezan la espalda y la sostienen. En los Espinales hacen el trabajo principal, y en el Back Lever y el Planche, con el cuerpo boca abajo, junto con los glúteos evitan que la cadera y las piernas caigan hacia el piso. En el Pistol Squat y el Lunge mantienen la espalda firme, y en el Pike se estiran cuando redondeás la espalda.",
  },
  {
    id: "cuadrado",
    nombre: "Cuadrado lumbar",
    zona: { slug: "lower-back", vista: "back" },
    precision: "aproximada",
    queHaceAlumno:
      "Es un músculo profundo de la espalda baja, a cada lado, entre la última costilla y la cadera: inclina el tronco al costado y mantiene firme la pelvis. En las planchas laterales es de los que más trabajan, del lado de abajo, para que la cadera no se hunda. En el Side Pancake, al inclinarte hacia una pierna, el del otro lado se estira y a la vez frena la bajada.",
  },
  {
    id: "gluteo-mayor",
    nombre: "Glúteo mayor",
    zona: { slug: "gluteal", vista: "back" },
    precision: "agrupada",
    queHaceAlumno:
      "Es el músculo más grande de la cadera y la endereza: te levanta al salir de abajo en el Pistol Squat, el Lunge y el Step Up, y es el que empuja en el Hip Thrust. En el Planche y el Back Lever, con el cuerpo boca abajo, sostiene las piernas para que no caigan. En la Handstand lo apretás para que la cadera quede en línea, y en el Pike se estira cuando doblás la cadera.",
  },
  {
    id: "gluteo-medio",
    nombre: "Glúteo medio y menor",
    zona: { slug: "gluteal", vista: "back" },
    precision: "agrupada",
    queHaceAlumno:
      "Están al costado de la cadera y abren la pierna, pero su trabajo más importante es mantener nivelada la pelvis cuando estás en un solo pie. En el Pistol Squat y el Step Up no te suben: evitan que la cadera se caiga de costado y que la rodilla se vaya hacia adentro. En las planchas laterales trabajan fuerte del lado de abajo para sostener la cadera arriba.",
  },
  {
    id: "vastos",
    nombre: "Cuádriceps (vastos)",
    zona: { slug: "quadriceps", vista: "front" },
    precision: "exacta",
    queHaceAlumno:
      "Son la mayor parte del frente del muslo y enderezan la rodilla. En el Pistol Squat, el Lunge y el Step Up frenan la bajada y te empujan para subir. En el Sissy Squat y el Quad Curl el cuerpo va inclinado hacia atrás y el peso queda lejos de la rodilla, así que aun sin carga extra tienen que frenar mucho: por eso se sienten tanto.",
  },
  {
    id: "recto-fem",
    nombre: "Recto femoral",
    zona: { slug: "quadriceps", vista: "front" },
    precision: "agrupada",
    queHaceAlumno:
      "Es la única parte del cuádriceps que además cruza la cadera: endereza la rodilla y también levanta la pierna. Por eso sube las piernas en el Toe to Bar y el Manna, las sostiene en línea en el Front Lever y mantiene en el aire la pierna libre del Pistol Squat. Se estira en la pierna de atrás del Spagat y en el Bridge, con la cadera bien extendida: si está corto, ahí te frena.",
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
      "Es el flexor profundo de la cadera: acerca la pierna al tronco, o el tronco a la pierna. Sube las piernas en el Toe to Bar y el Manna, las sostiene en el Front Lever, y en el Sissy Squat evita que el tronco se te vaya hacia atrás. Con la pierna libre en alto en el Pistol Squat trabaja muy acortado y por eso suele acalambrarse; en el Lunge y el Spagat se estira en la pierna de atrás.",
  },
  {
    id: "isquios",
    nombre: "Isquiotibiales",
    zona: { slug: "hamstring", vista: "back" },
    precision: "exacta",
    queHaceAlumno:
      "Son los músculos de atrás del muslo: doblan la rodilla y llevan la pierna hacia atrás, enderezando la cadera. En el Nordic Curl son los que frenan la caída del cuerpo hacia adelante, y en el Hip Thrust, el Step Up y el Lunge ayudan al glúteo. En el Pike y en la pierna de adelante del Spagat se estiran con la rodilla recta, y suelen ser los que marcan hasta dónde llegás.",
  },
  {
    id: "aductores",
    nombre: "Aductores",
    zona: { slug: "adductors", vista: "both" },
    precision: "agrupada",
    queHaceAlumno:
      "Son los músculos de la cara interna del muslo: además de juntar las piernas, el más grande ayuda al glúteo a enderezar la cadera al subir en el Pistol Squat, el Step Up y el Hip Thrust. En el Manna mantienen las piernas juntas y firmes, y en el Press to Handstand con piernas abiertas son los que las cierran al llegar arriba. En el Side Pancake se estiran y suelen marcar cuánto abrís.",
  },
  {
    id: "gemelo",
    nombre: "Gemelo",
    zona: { slug: "calves", vista: "both" },
    precision: "agrupada",
    queHaceAlumno:
      "Es la parte de la pantorrilla que más se ve: te pone en puntas de pie y, como cruza la rodilla, también ayuda a doblarla. Empuja al final de la subida en el Step Up y en los saltos del Animal Flow. Con la rodilla doblada pierde fuerza, por eso en el Pistol Squat solo sostiene; en el Pike se estira si llevás la punta del pie hacia vos.",
  },
  {
    id: "soleo",
    nombre: "Sóleo",
    zona: { slug: "calves", vista: "both" },
    precision: "agrupada",
    queHaceAlumno:
      "Está debajo del gemelo y también te pone en puntas de pie, pero es el que más trabaja con la rodilla doblada, porque ahí el gemelo pierde fuerza. En el Pistol Squat controla cómo avanza la rodilla sobre el pie al bajar y empuja al subir, y en el Lunge frena ese avance. Si el tobillo no deja avanzar la rodilla, la sentadilla se queda corta o se levanta el talón.",
  },
  {
    id: "tibial",
    nombre: "Tibial anterior",
    zona: { slug: "tibialis", vista: "front" },
    precision: "exacta",
    queHaceAlumno:
      "Es el músculo del frente de la canilla y levanta la punta del pie hacia vos. En el Pistol Squat y el Lunge no hace la bajada, pero cuando sentís que el peso se te va hacia atrás es el que tira de la canilla hacia adelante y te devuelve sobre el pie: por eso se nota más cuanto más atrás quedás.",
  },
] as const satisfies readonly MusculoDef[];

/** Id de uno de los 28 músculos. */
export type MusculoId = (typeof MUSCULOS)[number]["id"];
