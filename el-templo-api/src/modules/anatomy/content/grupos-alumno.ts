import type { GrupoAlumnoDef } from "../types";

/**
 * Fase 200 D14: tres grupos en vez de cinco roles para el alumno (motor +
 * sinergista juntos; el antagonista no se muestra). Textos del sketch 020
 * (`GRUPOS_ALUMNO`). Todo en borrador (D5).
 */
export const GRUPOS_ALUMNO = [
  {
    id: "fuerte",
    frase: "Trabaja fuerte en",
    definicion: "Es uno de los que hacen el movimiento.",
    roles: ["motor", "sinergista"],
  },
  {
    id: "sostiene",
    frase: "Te sostiene en",
    definicion: "No hace el movimiento pero sustenta los músculos que lo hacen.",
    roles: ["estabilizador"],
  },
  {
    id: "estira",
    frase: "Se estira en",
    definicion:
      "Queda estirado en la posición. Muchas veces es el que te limita el rango.",
    roles: ["estira"],
  },
] as const satisfies readonly GrupoAlumnoDef[];
