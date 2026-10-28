// Textos nuevos de la revisión de Franco (2026-10-23). Un solo lugar para los dos sketches (023 y 024).
// Va después de ../019-anatomia-profes-admin/data.js y ../020-guia-anatomia-app/alumno.js.

// Rótulos de los tres grupos (elegido por Franco 2026-10-23: "Hace el movimiento")
window.ROL_FUERTE = "Hace el movimiento";
window.ROL_SOSTIENE = "Te sostiene";
window.ROL_ESTIRA = "Se estira";
window.DEF_SOSTIENE = "No hace el movimiento pero sustenta los músculos que lo hacen.";

GRUPOS_ALUMNO[0].frase = `${ROL_FUERTE} en`;
GRUPOS_ALUMNO[1].def = DEF_SOSTIENE;

// Nombre de la sección que hoy se llama "Tu cuerpo": Franco quiere otro. Candidatos para probar
// con el selector de arriba de la página; el elegido se recuerda entre 023 y 024.
window.NOMBRES_CUERPO = ["Tus músculos", "Mapa del cuerpo", "Anatomía", "Qué trabajás", "Tu cuerpo"];
window.NOMBRE_CUERPO = NOMBRES_CUERPO[0];
try {
  const guardado = localStorage.getItem("sk023-nombre");
  if (guardado && NOMBRES_CUERPO.includes(guardado)) window.NOMBRE_CUERPO = guardado;
} catch (e) {
  /* sin storage: queda el primero */
}

/** Selector de nombre: pinta los botones en `el` y llama a `onChange` al elegir. */
window.selectorNombre = function (el, onChange) {
  const pintar = () => {
    el.innerHTML =
      `<span class="nom-lbl">Nombre de la sección:</span>` +
      NOMBRES_CUERPO.map(
        (n) => `<button class="${n === NOMBRE_CUERPO ? "on" : ""}" data-nombre="${n}">${n}${n === "Tu cuerpo" ? " (hoy)" : ""}</button>`,
      ).join("");
  };
  pintar();
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-nombre]");
    if (!b) return;
    window.NOMBRE_CUERPO = b.dataset.nombre;
    try {
      localStorage.setItem("sk023-nombre", NOMBRE_CUERPO);
    } catch (err) {
      /* sin storage */
    }
    pintar();
    onChange();
  });
};

// Las 17 definiciones revisadas (.docs/revision-definiciones-musculos-2026-10-23.md), ya en el código
Object.assign(QUE_HACE, {
  redondo: "Baja el brazo junto con el dorsal.",
  romboides: "Juntan los omóplatos hacia atrás.",
  "trap-inf": "Baja los omóplatos y los gira al subir los brazos.",
  "trap-sup": "Encoge los hombros y gira los omóplatos al subir los brazos.",
  pectoral: "Lleva el brazo adelante y al centro: trabaja al empujar y al tirar.",
  "delt-post": "Abre el brazo hacia atrás.",
  triceps: "Endereza el codo.",
  braquial: "Doblan el codo, junto con el bíceps.",
  antebrazo: "Cierran la mano: dan agarre y equilibrio.",
  serrato: "Pega el omóplato a las costillas y lo lleva adelante y arriba.",
  oblicuos: "Giran e inclinan el tronco, o lo frenan.",
  erectores: "Enderezan la espalda y la mantienen firme.",
  "gluteo-mayor": "Endereza la cadera: te levanta de la sentadilla.",
  "gluteo-medio": "Abren la pierna y te nivelan la pelvis en un pie.",
  vastos: "Enderezan la rodilla.",
  "recto-fem": "Endereza la rodilla y levanta la pierna.",
  isquios: "Doblan la rodilla y enderezan la cadera.",
});

// Nombres como los muestra la app (route-labels.ts), no los códigos de la investigación
Object.assign(RUTA_NOMBRE, { OAP: "Dominadas", OAPU: "Push Ups", OAR: "Remos" });

// Push Ups: "qué es" genérico (la ruta es la escalera completa, no solo el final a un brazo)
RUTA_ALUMNO.OAPU = {
  que: "Flexión de brazos: con el cuerpo recto como una tabla, bajás el pecho hasta el piso y empujás para subir.",
  siente: "Pecho, la parte de atrás del brazo (tríceps) y el hombro de adelante.",
  tips: [
    "Cuerpo en una línea: de los talones a la cabeza.",
    "Empujá el piso lejos.",
    "Codos a 45°, cerca del cuerpo.",
  ],
  errores: [
    ["La cadera se cae", "Apretá abdomen y glúteos: el cuerpo es una tabla."],
    ["Bajar a medias", "Mejor menos repeticiones, con el pecho cerca del piso."],
    ["Codos muy abiertos", "Llevalos cerca del cuerpo, a 45°."],
  ],
};
