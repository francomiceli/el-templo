/**
 * Fase 200 (D3/P3): contrato del modelo de anatomía. Fuente única de
 * músculo → zona → ruta → rol. Todo el contenido nace en borrador (D5).
 *
 * Este archivo NO tiene imports (así Node lo carga tal cual para verificar la
 * sintaxis del contenido sin instalar dependencias). Lo consumen todos los
 * archivos de `content/`, el validador y las proyecciones.
 */

/**
 * Rol de un músculo en una ruta. El orden de `ROLES` es la prioridad cuando un
 * músculo tiene dos roles en la misma ruta: motor > sinergista > estabilizador
 * > antagonista > estira.
 */
export type Rol =
  | "motor"
  | "sinergista"
  | "estabilizador"
  | "antagonista"
  | "estira";

/** Los 5 roles en orden de prioridad. */
export const ROLES: readonly Rol[] = [
  "motor",
  "sinergista",
  "estabilizador",
  "antagonista",
  "estira",
];

/** Los 3 grupos que ve el alumno en lugar de los 5 roles (D14). */
export type GrupoAlumno = "fuerte" | "sostiene" | "estira";

/**
 * Rol del profe → grupo del alumno. `antagonista` es `null`: al alumno no se le
 * muestra (D14).
 */
export const GRUPO_DE_ROL: Readonly<Record<Rol, GrupoAlumno | null>> = {
  motor: "fuerte",
  sinergista: "fuerte",
  estabilizador: "sostiene",
  antagonista: null,
  estira: "estira",
};

/**
 * Qué tan fiel es la zona del dibujo para un músculo (D4): `exacta` pinta ese
 * músculo y nada más, `agrupada` pinta un grupo, `aproximada` está cerca.
 */
export type Precision = "exacta" | "agrupada" | "aproximada";

/** Vista de la figura (mismas claves que `mFront`/`mBack` de anatomia.json). */
export type Vista = "front" | "back" | "both";

/** Los 6 grupos de zona (los chips de la tab Libre de la fase 197). */
export type GrupoZona =
  | "hombros"
  | "pecho"
  | "espalda"
  | "core"
  | "piernas"
  | "brazos";

/** D5: en v1 no existe otro estado que `borrador` (falta el kinesiólogo humano). */
export type EstadoContenido = "borrador";

/** Marcas de evidencia con letra (nivel de la fuente, ver investigación §1.1). */
export type MarcaLetra =
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L5"
  | "C"
  | "M"
  | "R"
  | "H"
  | "N";

/** Una marca es el número de una cita (1..109) o una letra de `MarcaLetra`. */
export type Marca = number | MarcaLetra;

/** Texto + marcas de evidencia. Las marcas nunca van pegadas en el texto. */
export interface Afirmacion {
  readonly t: string;
  readonly c: readonly Marca[];
}

/**
 * Quién resuelve un pendiente: `H` kinesiólogo humano, `N` Nacho, `fuente` la
 * investigación no lo cubre.
 */
export type QuienResuelve = "H" | "N" | "fuente";

/** Sección que todavía no se puede escribir: es un estado real de la UI. */
export interface Pendiente {
  readonly pendiente: string;
  readonly quien: QuienResuelve;
}

/** Una sección con contenido `T` o pendiente. */
export type Seccion<T> = T | Pendiente;

/** Type guard de `Pendiente`. */
export function esPendiente(x: unknown): x is Pendiente {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.pendiente === "string" &&
    (o.quien === "H" || o.quien === "N" || o.quien === "fuente")
  );
}

/** Región del dibujo (D4: zonas como datos, no enum cableado). */
export interface RegionDef {
  readonly slug: string;
  readonly nombre: string;
  readonly vista: Vista;
  readonly grupo: GrupoZona;
  /** `true` si la región viaja a la TV (las 15 del poll). */
  readonly enTv: boolean;
}

/** Músculo (P2: 28). `zona: null` = profundo, no se ve en el dibujo (D10). */
export interface MusculoDef {
  readonly id: string;
  readonly nombre: string;
  readonly zona: { readonly slug: string; readonly vista: Vista } | null;
  /** `null` si y solo si `zona` es `null`. */
  readonly precision: Precision | null;
  /** Qué hace, en tono alumno (D14). */
  readonly queHaceAlumno: string;
  readonly nota?: Afirmacion;
}

/** Relación músculo-ruta con las marcas de la celda fuente. `m` = id de músculo. */
export interface Relacion {
  readonly m: string;
  readonly c: readonly Marca[];
  readonly nota?: string;
}

/** Relaciones de una ruta por rol. */
export type Relaciones = Readonly<Record<Rol, readonly Relacion[]>>;

/** Patrón principal de la ruta. */
export type Patron = "PUSH" | "PULL" | "LOWER" | "CORE" | "MOVILIDAD" | "FLOW";

/** Fase del movimiento en la ficha de profe. */
export interface FaseFicha {
  readonly nombre: string;
  readonly texto: Afirmacion;
}

/** Fila de la tabla de análisis articular. */
export interface FilaArticular {
  readonly articulacion: string;
  readonly accion: string;
  readonly musculos: string;
  readonly contraccion: string;
  readonly c: readonly Marca[];
}

/** Compensación habitual y por qué pasa. */
export interface Compensacion {
  readonly error: string;
  readonly porque: Afirmacion;
}

/** Bandera propia de la ruta (bloque 6 de la investigación). */
export interface BanderaRuta {
  readonly nivel: "urgencia" | "derivar";
  readonly texto: Afirmacion;
}

/**
 * Escalones de la progresión: `mapa` = salen de
 * `ROUTE_PROGRESSION_MAP[code].steps` (sin doble fuente, solo rutas
 * `strategy: "token"`); `ficha` = lista propia; o pendiente.
 */
export type Escalones =
  | { readonly fuente: "mapa" }
  | { readonly fuente: "ficha"; readonly pasos: readonly string[] }
  | Pendiente;

/** Ficha de la ruta para el profe. */
export interface FichaProfe {
  readonly resumen: Seccion<Afirmacion>;
  readonly tipo: string;
  readonly brazo: string | null;
  readonly escalones: Escalones;
  readonly fases: Seccion<readonly FaseFicha[]>;
  readonly articulaciones: Seccion<readonly FilaArticular[]>;
  readonly progresa: Seccion<readonly Afirmacion[]>;
  readonly siente: Seccion<Afirmacion>;
  readonly compensa: Seccion<readonly Compensacion[]>;
  readonly cues: Seccion<readonly Afirmacion[]>;
  readonly banderasRuta: Seccion<readonly BanderaRuta[]>;
  readonly evidencia: Afirmacion;
  readonly gestos: readonly string[];
  readonly pendientes: readonly Pendiente[];
}

/** Error común en tono alumno, con su consecuencia. */
export interface ErrorComun {
  readonly error: string;
  readonly texto: string;
}

/** Ficha de la ruta para el alumno (D15): tono alumno, sin códigos ni latín. */
export interface FichaAlumno {
  readonly que: Seccion<string>;
  readonly siente: Seccion<string>;
  readonly tips: Seccion<readonly string[]>;
  readonly errores: Seccion<readonly ErrorComun[]>;
}

/**
 * Contenido de una ruta. `fichaProfe`/`fichaAlumno` en `null` = "ficha en
 * preparación": es un estado real que la UI trata como tal.
 */
export interface RutaContenido {
  readonly code: string;
  readonly slug: string;
  readonly patron: Patron;
  readonly categoria: string;
  readonly estado: EstadoContenido;
  readonly relaciones: Relaciones;
  readonly fichaProfe: FichaProfe | null;
  readonly fichaAlumno: FichaAlumno | null;
}

/** Entrada del glosario de roles (D8/D9). */
export interface GlosarioRol {
  readonly rol: Rol;
  readonly titulo: string;
  /** Frase con la que se lee el rol: "<músculo> es motor en: <rutas>". */
  readonly frase: string;
  readonly definicion: string;
  readonly ejemplo: string;
}

/** Entrada genérica del glosario (contracciones, precisión de zona). */
export interface GlosarioEntrada {
  readonly clave: string;
  readonly titulo: string;
  readonly definicion: string;
  readonly ejemplo?: string;
}

/** Grupo que ve el alumno (D14). */
export interface GrupoAlumnoDef {
  readonly id: GrupoAlumno;
  readonly frase: string;
  readonly definicion: string;
  readonly roles: readonly Rol[];
}

/** Nivel de una bandera de derivación. */
export type NivelBandera = "urgencia" | "derivar" | "precaucion";

/**
 * Bandera del catálogo. `senal` y `accion` son lo que ve el profe;
 * `notaInterna` (rótulos clínicos) no sale del API.
 */
export interface BanderaDef {
  readonly id: string;
  readonly nivel: NivelBandera;
  readonly senal: string;
  readonly accion: string;
  readonly rutas: readonly string[] | "todas";
  readonly notaInterna: string | null;
  readonly fuente: string;
  /** `true` si el umbral lo tiene que fijar el kinesiólogo humano (⚑H). */
  readonly umbralH: boolean;
}

/** Cita bibliográfica del Apéndice A, con su lectura en palabras llanas. */
export interface CitaDef {
  readonly id: number | "L1" | "L2" | "L3" | "L4" | "L5";
  readonly texto: string;
  readonly lectura: string;
}
