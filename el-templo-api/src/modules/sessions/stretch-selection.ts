/**
 * Regla de seleccion de estiramientos post-clase como funcion PURA (fase 213).
 *
 * Sin DB, sin reloj y sin azar: el servicio (plan posterior) junta la movilidad
 * prescrita del dia, las rutas de los bloques y la lista curada activa del
 * gimnasio (`stretch_catalog`, ya filtrada por tenant e `isActive`) y llama a
 * `seleccionarEstiramientos`. Se testea en CI sin MySQL.
 *
 * Referencias:
 *   - SPEC 4.1: pasos 1-7 y tabla de referencia (verdad fija de los tests).
 *   - D-01: la rutina sale de la movilidad prescrita del dia.
 *   - D-03: complemento de tren superior por rutas (entra ultimo, nunca desplaza).
 *   - D-04: la familia `PL` cuenta como `FL`.
 *   - D-05: dosis fija para todos (5 estiramientos, 45 s por lado, 5-8 min,
 *     rotacion por dia).
 *   - D-06: `rom` no ofrece estiramiento.
 *
 * Es un port 1 a 1 de `.planning/phases/213-estiramiento-post-clase/consultas/
 * regla_simulacion.py` (funcion `regla`). Cualquier cambio de la lista regenera
 * la tabla con ese script y el test se actualiza en el mismo cambio.
 */
import type { StretchFamily } from "../../db/schema/stretch";

/** Cantidad objetivo de estiramientos por rutina (D-05). */
export const STRETCH_TARGET_COUNT = 5;
/** Segundos por lado de cada estiramiento (D-05). */
export const STRETCH_SECONDS_PER_SIDE = 45;
/** Segundos de transicion entre estiramientos (D-05). */
export const STRETCH_TRANSITION_SECONDS = 10;
/** Piso de duracion de la rutina: por debajo se agrega el siguiente candidato. */
export const STRETCH_MIN_SECONDS = 300;
/** Techo de duracion de la rutina: por encima se quita el ultimo. */
export const STRETCH_MAX_SECONDS = 480;

/** Familia de la base de ejercicios (`mobility_related`) -> familia de la lista (D-04: PL cuenta como FL). */
export const FAMILIA_DE_BASE: Readonly<Record<string, StretchFamily>> = {
  "LS ( LUNGES )": "LS",
  MN: "MN",
  FL: "FL",
  PL: "FL",
  "TTB / HF": "TTB",
};

/** Rutas de empuje o traccion que piden complemento de tren superior (supuesto de arranque D-03: FL, FLR, PL y DS quedan afuera hasta que un profe diga). */
export const RUTAS_TREN_SUPERIOR: ReadonlySet<string> = new Set([
  "HS",
  "HSPU",
  "PHS",
  "OAPU",
  "PLPU",
  "MU",
  "OAP",
  "OAR",
  "BL",
]);

/** Dias de la semana en el orden que usa el indice de rotacion. */
export const DIAS_SEMANA = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
] as const;

export type DiaSemana = (typeof DIAS_SEMANA)[number];

/** Movilidad prescrita del dia, en orden de bloque. */
export interface PrescritoMovilidad {
  nombre: string;
  /** `mobility_related` de la base de ejercicios, o null si no tiene. */
  familiaBase: string | null;
}

/** Una fila activa de `stretch_catalog`. */
export interface EntradaCatalogo {
  exerciseId: number;
  nombre: string;
  familia: StretchFamily;
  orden: number;
  lados: 1 | 2;
  /** Posicion en la lista de base (para completar), o null si no es de base. */
  ordenBase: number | null;
}

export interface EntradaSeleccion {
  prescritos: readonly PrescritoMovilidad[];
  /** Ruta de cada bloque que no es INITIUM. */
  rutas: readonly string[];
  catalogo: readonly EntradaCatalogo[];
  semana: number;
  dia: DiaSemana;
}

export interface EstiramientoElegido {
  exerciseId: number;
  nombre: string;
  familia: StretchFamily;
  lados: 1 | 2;
}

export interface ResultadoSeleccion {
  /** Familias del dia en su orden final. Vacio si se uso la rutina de base. */
  familias: string[];
  estiramientos: EstiramientoElegido[];
  duracionSegundos: number;
}

/** Nombre canonico para comparar prescrito contra catalogo. */
export function normalizarNombre(nombre: string): string {
  return nombre.trim().toUpperCase();
}

/** 45 s por lado + 10 s de transicion por estiramiento. */
export function duracionRutina(
  estiramientos: ReadonlyArray<{ lados: 1 | 2 }>,
): number {
  let total = 0;
  for (const e of estiramientos) {
    total += e.lados * STRETCH_SECONDS_PER_SIDE + STRETCH_TRANSITION_SECONDS;
  }
  return total;
}

/** D-06: solo las clases `regular`, `combos` y `tecnica` ofrecen estiramiento (ROM no). */
export function modoOfreceEstiramiento(mode: string): boolean {
  return mode === "regular" || mode === "combos" || mode === "tecnica";
}

function familiaDeBase(familiaBase: string | null): StretchFamily | null {
  if (familiaBase === null) return null;
  return Object.prototype.hasOwnProperty.call(FAMILIA_DE_BASE, familiaBase)
    ? FAMILIA_DE_BASE[familiaBase]
    : null;
}

/** Rota la lista `k` posiciones hacia adelante (k = off % largo). */
function rotar<T>(lista: readonly T[], desplazamiento: number): T[] {
  if (lista.length === 0) return [];
  const k = desplazamiento % lista.length;
  return [...lista.slice(k), ...lista.slice(0, k)];
}

/** Grupo de candidatos: una familia del dia o (familia null) la lista de base. */
interface GrupoCandidatos {
  familia: StretchFamily | null;
  candidatos: EntradaCatalogo[];
}

/**
 * Elige los estiramientos del dia (SPEC 4.1). Determinista: la misma entrada
 * produce siempre la misma salida y las entradas no se mutan.
 */
export function seleccionarEstiramientos(
  entrada: EntradaSeleccion,
): ResultadoSeleccion {
  const { prescritos, rutas, catalogo, semana, dia } = entrada;

  const porNombre = new Map<string, EntradaCatalogo>();
  for (const c of catalogo) {
    const clave = normalizarNombre(c.nombre);
    if (!porNombre.has(clave)) porNombre.set(clave, c);
  }
  const base = catalogo
    .filter((c) => c.ordenBase !== null)
    .sort((a, b) => (a.ordenBase ?? 0) - (b.ordenBase ?? 0));

  // Paso 1: familias del dia por cantidad de apariciones (empate: la primera).
  const familias: StretchFamily[] = [];
  const apariciones = new Map<StretchFamily, number>();
  for (const p of prescritos) {
    const enLista = porNombre.get(normalizarNombre(p.nombre));
    const familia = enLista ? enLista.familia : familiaDeBase(p.familiaBase);
    if (familia === null) continue;
    if (!apariciones.has(familia)) familias.push(familia);
    apariciones.set(familia, (apariciones.get(familia) ?? 0) + 1);
  }
  familias.sort(
    (a, b) => (apariciones.get(b) ?? 0) - (apariciones.get(a) ?? 0),
  );

  // Paso 2: complemento de tren superior (D-03), siempre al final.
  if (
    !familias.includes("TS") &&
    rutas.some((r) => RUTAS_TREN_SUPERIOR.has(r))
  ) {
    familias.push("TS");
  }

  // Pasos 4 y 7: candidatos por familia, o la lista de base si no hay familias.
  const desplazamiento = semana + DIAS_SEMANA.indexOf(dia);
  const grupos: GrupoCandidatos[] =
    familias.length === 0
      ? [{ familia: null, candidatos: [...base] }]
      : familias.map((familia) => {
          const deLaFamilia = catalogo
            .filter((c) => c.familia === familia)
            .sort((a, b) => a.orden - b.orden);
          const prescritosEnLista: EntradaCatalogo[] = [];
          for (const p of prescritos) {
            const c = porNombre.get(normalizarNombre(p.nombre));
            if (c && c.familia === familia && !prescritosEnLista.includes(c)) {
              prescritosEnLista.push(c);
            }
          }
          const resto = deLaFamilia.filter(
            (c) => !prescritosEnLista.includes(c),
          );
          return {
            familia,
            candidatos: [...prescritosEnLista, ...rotar(resto, desplazamiento)],
          };
        });

  // Paso 3 y 5: reparto en ronda con puntero que persiste entre llamadas.
  const elegidos: EntradaCatalogo[] = [];
  let puntero = 0;
  const yaElegido = (c: EntradaCatalogo): boolean => elegidos.includes(c);

  function tomarSiguiente(): boolean {
    for (let intento = 0; intento < grupos.length; intento++) {
      const grupo = grupos[puntero % grupos.length];
      puntero += 1;
      const libre = grupo.candidatos.find((c) => !yaElegido(c));
      if (libre) {
        elegidos.push(libre);
        return true;
      }
    }
    const deBase = base.find((c) => !yaElegido(c));
    if (deBase) {
      elegidos.push(deBase);
      return true;
    }
    return false;
  }

  // Paso 6: llenar hasta 5, recortar si pasa de 8 min, completar si no llega a 5.
  while (elegidos.length < STRETCH_TARGET_COUNT && tomarSiguiente()) {
    // cada vuelta agrega un ejercicio nuevo o corta
  }
  while (duracionRutina(elegidos) > STRETCH_MAX_SECONDS) elegidos.pop();
  while (duracionRutina(elegidos) < STRETCH_MIN_SECONDS && tomarSiguiente()) {
    // idem
  }

  return {
    familias: familias.map((f) => f),
    estiramientos: elegidos.map((c) => ({
      exerciseId: c.exerciseId,
      nombre: c.nombre,
      familia: c.familia,
      lados: c.lados,
    })),
    duracionSegundos: duracionRutina(elegidos),
  };
}
