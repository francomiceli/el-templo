import type { GlosarioEntrada, GlosarioRol } from "../types";

/**
 * Fase 200 D8/D9: glosario para profes (definiciones estándar de anatomía,
 * L1). Textos del sketch 019 (`GLOSARIO`) y frases de `ROLE_FRASE`. Cada rol
 * se lee como frase: "<músculo> es motor en: <rutas>". Todo en borrador (D5).
 */
export const GLOSARIO_ROLES = [
  {
    rol: "motor",
    titulo: "Motor",
    frase: "Es motor en",
    definicion:
      "El que hace el movimiento principal. También se le dice agonista.",
    ejemplo: "En el pistol, el cuádriceps extiende la rodilla para subir.",
  },
  {
    rol: "sinergista",
    titulo: "Sinergista",
    frase: "Es sinergista en",
    definicion: "Ayuda al motor en el mismo movimiento, sin ser el principal.",
    ejemplo:
      "En el pistol, isquios y aductor mayor ayudan al glúteo a extender la cadera al subir.",
  },
  {
    rol: "estabilizador",
    titulo: "Estabilizador",
    frase: "Estabiliza en",
    definicion:
      "No genera el movimiento: hace fuerza para que una articulación quede firme y el motor pueda trabajar.",
    ejemplo:
      "En el front lever, el bíceps mantiene el codo bloqueado con el brazo recto.",
  },
  {
    rol: "antagonista",
    titulo: "Antagonista",
    frase: "Es antagonista en",
    definicion:
      "Hace el movimiento contrario al motor. Se activa a la vez para frenar o controlar.",
    ejemplo: "En el back lever, el dorsal ancho.",
  },
  {
    rol: "estira",
    titulo: "Se estira",
    frase: "Se estira en",
    definicion:
      "Queda alargado en la posición. No es el que hace fuerza: muchas veces es el que limita el rango.",
    ejemplo:
      "En el pistol, los isquios de la pierna libre: suelen ser el primer limitante.",
  },
] as const satisfies readonly GlosarioRol[];

/** Los tres tipos de contracción (marcas C/E/I de la tabla articular). */
export const GLOSARIO_CONTRACCIONES = [
  {
    clave: "C",
    titulo: "Concéntrica",
    definicion: "El músculo se acorta mientras hace fuerza.",
    ejemplo: "Subir del pistol.",
  },
  {
    clave: "E",
    titulo: "Excéntrica",
    definicion: "El músculo se alarga mientras hace fuerza: frena.",
    ejemplo: "Bajar del pistol en 3 segundos.",
  },
  {
    clave: "I",
    titulo: "Isométrica",
    definicion: "Hace fuerza sin cambiar de largo: sostiene.",
    ejemplo: "Sostener el front lever.",
  },
] as const satisfies readonly GlosarioEntrada[];

/** Las tres precisiones de zona (D4). La clave es el valor de `Precision`. */
export const GLOSARIO_PRECISION = [
  {
    clave: "exacta",
    titulo: "Zona exacta",
    definicion: "El dibujo pinta ese músculo y nada más.",
  },
  {
    clave: "agrupada",
    titulo: "Zona agrupada",
    definicion:
      "El dibujo pinta un grupo: varios músculos comparten la misma zona (p. ej. Espalda alta = dorsal + redondo + romboides).",
  },
  {
    clave: "aproximada",
    titulo: "Zona aproximada",
    definicion:
      "El músculo está cerca de esa zona pero no coincide del todo (p. ej. braquial en el antebrazo).",
  },
] as const satisfies readonly GlosarioEntrada[];
