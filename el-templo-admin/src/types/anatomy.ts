/**
 * Espejo A PROPÓSITO del payload de GET /api/admin/anatomy (fase 200). Cambiar los dos juntos.
 *
 * Fuente: `el-templo-api/src/modules/anatomy/serializers.ts` (VistaProfe y derivados) y
 * `el-templo-api/src/modules/anatomy/types.ts` (tipos base). Sin imports de valor: solo tipos y
 * el type guard `esPendiente`.
 */

/** Rol de un músculo en una ruta (orden = prioridad). */
export type Rol = 'motor' | 'sinergista' | 'estabilizador' | 'antagonista' | 'estira';

/** Qué tan fiel es la zona del dibujo para un músculo (D4). */
export type Precision = 'exacta' | 'agrupada' | 'aproximada';

/** Vista de la figura. */
export type Vista = 'front' | 'back' | 'both';

export type GrupoZona = 'hombros' | 'pecho' | 'espalda' | 'core' | 'piernas' | 'brazos';

export type Patron = 'PUSH' | 'PULL' | 'LOWER' | 'CORE' | 'MOVILIDAD' | 'FLOW';

export type NivelBandera = 'urgencia' | 'derivar' | 'precaucion';

/** Marcas de evidencia con letra. */
export type MarcaLetra = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'C' | 'M' | 'R' | 'H' | 'N';

/** Una marca es el número de una cita o una letra. */
export type Marca = number | MarcaLetra;

/** Texto + marcas de evidencia. Las marcas nunca van pegadas en el texto. */
export interface Afirmacion {
  readonly t: string;
  readonly c: readonly Marca[];
}

/** Quién resuelve un pendiente: `H` kinesiólogo humano, `N` Nacho, `fuente` la investigación. */
export type QuienResuelve = 'H' | 'N' | 'fuente';

/** Sección que todavía no se puede escribir: es un estado real de la UI. */
export interface Pendiente {
  readonly pendiente: string;
  readonly quien: QuienResuelve;
}

/** Una sección con contenido `T` o pendiente. */
export type Seccion<T> = T | Pendiente;

/** Type guard de `Pendiente`. */
export function esPendiente(x: unknown): x is Pendiente {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.pendiente === 'string' && (o.quien === 'H' || o.quien === 'N' || o.quien === 'fuente')
  );
}

export interface FaseFicha {
  readonly nombre: string;
  readonly texto: Afirmacion;
}

export interface FilaArticular {
  readonly articulacion: string;
  readonly accion: string;
  readonly musculos: string;
  readonly contraccion: string;
  readonly c: readonly Marca[];
}

export interface Compensacion {
  readonly error: string;
  readonly porque: Afirmacion;
}

export interface BanderaRuta {
  readonly nivel: 'urgencia' | 'derivar';
  readonly texto: Afirmacion;
}

/** Ficha de la ruta para el profe, tal como viaja (escalones ya resueltos). */
export interface FichaProfeVista {
  readonly resumen: Seccion<Afirmacion>;
  readonly tipo: string;
  readonly brazo: string | null;
  readonly escalones: string[] | Pendiente;
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

/** Región del dibujo; `musculos` = ids de los músculos con esa zona (>1 = grupo). */
export interface RegionVista {
  slug: string;
  nombre: string;
  vista: Vista;
  grupo: GrupoZona;
  musculos: string[];
}

export interface ZonaMusculo {
  slug: string;
  vista: Vista;
}

export interface MusculoProfe {
  id: string;
  nombre: string;
  /** `null` = profundo, no se ve en el dibujo (D10). */
  zona: ZonaMusculo | null;
  precision: Precision | null;
  nota: Afirmacion | null;
  /** Códigos de ruta por rol. */
  roles: Record<Rol, string[]>;
}

export interface RelacionVista {
  m: string;
  nombre: string;
  c: Marca[];
  nota: string | null;
}

/** Bandera del catálogo global (una vez cada una). Sin notaInterna. */
export interface BanderaProfe {
  id: string;
  nivel: NivelBandera;
  senal: string;
  accion: string;
  fuente: string;
  umbralH: boolean;
}

export interface RutaProfe {
  code: string;
  nombre: string;
  slug: string;
  patron: Patron;
  categoria: string;
  estado: 'borrador';
  nEjercicios: number;
  ejercicios: string[];
  relaciones: Record<Rol, RelacionVista[]>;
  /** Una entrada por (slug, vista): un slug puede repetirse con vistas distintas. */
  zonasFicha: { slug: string; vista: Vista; rol: Rol }[];
  sinDibujo: { m: string; nombre: string; rol: Rol }[];
  /** Ids de `VistaProfe.banderas` que aplican a la ruta. */
  banderaIds: string[];
  /** `null` = "ficha en preparación". */
  fichaProfe: FichaProfeVista | null;
}

export interface GlosarioRol {
  readonly rol: Rol;
  readonly titulo: string;
  readonly frase: string;
  readonly definicion: string;
  readonly ejemplo: string;
}

export interface GlosarioEntrada {
  readonly clave: string;
  readonly titulo: string;
  readonly definicion: string;
  readonly ejemplo?: string;
}

export interface CitaDef {
  readonly id: number | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  readonly texto: string;
  readonly lectura: string;
}

export interface VistaProfe {
  estado: 'borrador';
  regiones: RegionVista[];
  musculos: MusculoProfe[];
  rutas: RutaProfe[];
  banderas: BanderaProfe[];
  glosario: {
    roles: GlosarioRol[];
    contracciones: GlosarioEntrada[];
    precision: GlosarioEntrada[];
  };
  citas: CitaDef[];
  leyenda: Record<'C' | 'M' | 'R' | 'H' | 'N', string>;
}
