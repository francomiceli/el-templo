// Capa "alumno" sobre los datos del sketch 019 (../019-anatomia-profes-admin/data.js).
// Mismo modelo, otro tono: sin códigos, sin antagonista, sin banderas de derivación.
// Las funciones de cada músculo son anatomía estándar (L1). Todo en BORRADOR hasta la validación humana (D5).

window.QUE_HACE = {
  dorsal:
    "Baja el brazo y lo lleva hacia atrás. Es el que te sube en la dominada.",
  redondo: "Ayuda al dorsal a bajar el brazo.",
  romboides: "Junta los omóplatos hacia atrás.",
  "trap-inf": "Baja los omóplatos: aleja los hombros de las orejas.",
  "trap-sup": "Sube los hombros. En los colgados no tiene que mandar él.",
  pectoral:
    "Lleva el brazo hacia adelante y hacia el centro. Es el de empujar.",
  "delt-ant": "Levanta el brazo hacia adelante y arriba.",
  "delt-post": "Lleva el brazo hacia atrás.",
  triceps: "Estira el codo.",
  biceps: "Dobla el codo y gira la palma hacia arriba.",
  braquial: "Dobla el codo, junto con el bíceps.",
  antebrazo: "Cierra la mano y sostiene el agarre.",
  serrato: "Pega el omóplato a las costillas y lo lleva hacia adelante.",
  manguito: "Mantiene el hombro centrado y firme.",
  "recto-abd":
    "Acerca las costillas a la pelvis y evita que la espalda se arquee.",
  oblicuos: "Giran e inclinan el tronco, y evitan que rote.",
  erectores: "Estiran la espalda y la mantienen derecha.",
  cuadrado: "Inclina el tronco al costado y mantiene firme la pelvis.",
  "gluteo-mayor": "Estira la cadera: es el que te para y empuja el piso.",
  "gluteo-medio": "Mantiene la pelvis nivelada cuando estás en una pierna.",
  vastos: "Estiran la rodilla.",
  "recto-fem": "Estira la rodilla y levanta la pierna.",
  psoas: "Levanta la pierna: dobla la cadera.",
  isquios: "Doblan la rodilla y estiran la cadera.",
  aductores: "Juntan las piernas.",
  gemelo: "Te pone en puntas de pie.",
  soleo: "Te pone en puntas de pie, sobre todo con la rodilla doblada.",
  tibial: "Levanta la punta del pie.",
};

// Tres grupos en vez de cinco roles (motor + sinergista juntos; antagonista no se muestra)
window.GRUPOS_ALUMNO = [
  {
    id: "fuerte",
    roles: ["M", "S"],
    frase: "Trabaja fuerte en",
    def: "Es uno de los que hacen el movimiento.",
    color: "M",
  },
  {
    id: "sostiene",
    roles: ["Est"],
    frase: "Te sostiene en",
    def: "No hace el movimiento: hace fuerza para que el cuerpo quede firme mientras otros trabajan.",
    color: "Est",
  },
  {
    id: "estira",
    roles: ["Al"],
    frase: "Se estira en",
    def: "Queda estirado en la posición. Muchas veces es el que te limita el rango.",
    color: "Al",
  },
];

// Lo que ve el alumno de una ruta (versión corta). Solo FL y PS en el sketch.
window.RUTA_ALUMNO = {
  FL: {
    que: "Quedarte horizontal colgado de la barra, boca arriba, con los brazos rectos.",
    siente: "Espalda (dorsales), abdomen y el pliegue del codo.",
    tips: [
      "Tirá la barra hacia las caderas, brazos rectos.",
      "Costillas abajo, abdomen duro.",
      "Hombros lejos de las orejas.",
    ],
    errores: [
      ["Caderas caídas", "Se arquea la espalda baja."],
      ["Caderas altas", "Parece más fácil, pero no es el front."],
      ["Codos doblados", "Ya no es el mismo ejercicio."],
    ],
  },
  PS: {
    que: "Sentadilla a una pierna, con la otra estirada adelante.",
    siente: "Muslo de adelante y glúteo de la pierna que apoya.",
    tips: [
      "Apoyá todo el pie: talón, dedo gordo y meñique.",
      "Sentate hacia atrás y abajo, no te dejes caer.",
      "Brazos adelante para equilibrar.",
    ],
    errores: [
      ["Rodilla hacia adentro", "Llevala en línea con el pie."],
      ["Talón que se levanta", "Falta tobillo: tu profe te da una variante."],
      ["Pierna libre que toca el piso", "Probá con una caja más alta."],
    ],
  },
};
