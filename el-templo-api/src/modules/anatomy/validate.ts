/**
 * Fase 200 (T-200-01/02): validador puro del contenido de anatomía.
 *
 * Cada `validarX` devuelve la lista de errores legibles (vacía = contenido
 * válido). `validarContenido()` los junta y un test de CI exige `[]`. El
 * plan 04 suma las rutas a `validarContenido`.
 */
import { ROUTE_PROGRESSION_MAP } from "../exercises/route-progression-map";
import { BANDERAS } from "./content/banderas";
import { CITAS } from "./content/citas";
import {
  GLOSARIO_CONTRACCIONES,
  GLOSARIO_PRECISION,
  GLOSARIO_ROLES,
} from "./content/glosario";
import { GRUPOS_ALUMNO } from "./content/grupos-alumno";
import { MUSCULOS } from "./content/musculos";
import { REGIONES } from "./content/regiones";
import { GRUPO_DE_ROL, ROLES } from "./types";
import type {
  BanderaDef,
  CitaDef,
  GrupoAlumnoDef,
  GrupoZona,
  Marca,
  MarcaLetra,
  MusculoDef,
  Precision,
  RegionDef,
} from "./types";

const GRUPOS_ZONA_VALIDOS: readonly GrupoZona[] = [
  "hombros",
  "pecho",
  "espalda",
  "core",
  "piernas",
  "brazos",
];

const MARCAS_LETRA: readonly MarcaLetra[] = [
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "C",
  "M",
  "R",
  "H",
  "N",
];

const PRECISIONES: readonly Precision[] = ["exacta", "agrupada", "aproximada"];

/** Última cita numerada del Apéndice A de la investigación. */
const MAX_CITA = 109;

/** Ids de cita que existen en el catálogo (las marcas se validan contra esto). */
const IDS_CITA: ReadonlySet<number | string> = new Set(
  CITAS.map((cita) => cita.id),
);

/** Nivel que le corresponde a cada letra del id de una bandera (a1, b3, c2). */
const NIVEL_DE_LETRA: Readonly<Record<string, BanderaDef["nivel"]>> = {
  a: "urgencia",
  b: "derivar",
  c: "precaucion",
};

/**
 * Banderas que pueden quedar sin rutas en v1: b17 aplicaba solo a PLYO y
 * CARDIO, fuera de las 30 rutas por D2.
 */
const BANDERAS_SIN_RUTAS_V1: readonly string[] = ["b17"];

/**
 * Rótulos clínicos que no pueden aparecer en la señal ni en la acción de una
 * bandera (T21): van solo en `notaInterna`. Minúsculas, sin tildes.
 */
export const ROTULOS_CLINICOS: readonly string[] = [
  "cauda equina",
  "rabdomiolisis",
  "epifisiolisis",
  "escafoides",
  "slump",
  "maniobra",
];

const ID_KEBAB = /^[a-z]+(-[a-z]+)*$/;

/**
 * Términos que no pueden aparecer en un texto de alumno (D14/D15): jerga de
 * roles, latín, rótulos clínicos. En minúsculas, sin tildes; se buscan por
 * substring sobre el texto normalizado.
 */
export const TERMINOS_ALUMNO_BLOQUEADOS: readonly string[] = [
  "antagonista",
  "agonista",
  "sinergista",
  "isometric",
  "excentric",
  "concentric",
  "latissimus",
  "brachii",
  "femoris",
  "gluteus",
  "rectus",
  "abdominis",
  "serratus",
  "gastrocnemius",
  "soleus",
  "cauda equina",
  "rabdomiolisis",
  "epifisiolisis",
  "escafoides",
  "hernia",
];

/**
 * Códigos de ruta que no pueden aparecer en un texto de alumno. Se excluye `L`
 * por ambigüedad: es una letra suelta que aparece en prosa legítima ("L" de
 * L-sit no se distingue de una inicial o de una marca de lista).
 */
const CODIGOS_RUTA_BLOQUEADOS: readonly string[] = Object.keys(
  ROUTE_PROGRESSION_MAP,
).filter((code) => code !== "L");

function escaparRegExp(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Minúsculas y sin tildes. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Problemas de un texto que ve el alumno: términos bloqueados (por substring,
 * sin tildes ni mayúsculas) y códigos de ruta en mayúscula con límite de
 * palabra (FL, PS, "MN/RP"...). `donde` identifica el texto en el mensaje.
 */
export function textoAlumnoProblemas(texto: string, donde: string): string[] {
  const errores: string[] = [];
  const normal = normalizar(texto);
  for (const termino of TERMINOS_ALUMNO_BLOQUEADOS) {
    if (normal.includes(termino)) {
      errores.push(`${donde}: el texto de alumno contiene "${termino}"`);
    }
  }
  for (const code of CODIGOS_RUTA_BLOQUEADOS) {
    const patron = new RegExp(
      `(?<![A-Z0-9])${escaparRegExp(code)}(?![A-Z0-9])`,
    );
    if (patron.test(texto)) {
      errores.push(`${donde}: el texto de alumno contiene el código "${code}"`);
    }
  }
  return errores;
}

/**
 * Marcas de evidencia: citas enteras 1..109 que existen en `CITAS`, letras
 * conocidas (L1..L5 también deben existir en `CITAS`), sin repetidas.
 */
export function validarMarcas(
  marcas: readonly Marca[],
  donde: string,
): string[] {
  const errores: string[] = [];
  const vistas = new Set<Marca>();
  for (const marca of marcas) {
    if (typeof marca === "number") {
      if (!Number.isInteger(marca) || marca < 1 || marca > MAX_CITA) {
        errores.push(`${donde}: marca numérica inválida ${String(marca)}`);
      } else if (!IDS_CITA.has(marca)) {
        errores.push(`${donde}: la marca ${marca} no existe en las citas`);
      }
    } else if (!MARCAS_LETRA.includes(marca)) {
      errores.push(`${donde}: marca desconocida "${String(marca)}"`);
    } else if (marca.startsWith("L") && !IDS_CITA.has(marca)) {
      errores.push(`${donde}: la marca ${marca} no existe en las citas`);
    }
    if (vistas.has(marca)) {
      errores.push(`${donde}: marca repetida ${String(marca)}`);
    }
    vistas.add(marca);
  }
  return errores;
}

/** Slugs únicos, grupo válido y nombre no vacío. */
export function validarRegiones(regiones: readonly RegionDef[]): string[] {
  const errores: string[] = [];
  const slugs = new Set<string>();
  for (const region of regiones) {
    if (slugs.has(region.slug)) {
      errores.push(`región ${region.slug}: slug duplicado`);
    }
    slugs.add(region.slug);
    if (!GRUPOS_ZONA_VALIDOS.includes(region.grupo)) {
      errores.push(`región ${region.slug}: grupo inválido "${region.grupo}"`);
    }
    if (region.nombre.trim() === "") {
      errores.push(`región ${region.slug}: nombre vacío`);
    }
  }
  return errores;
}

/** Una región `both` acepta cualquier vista; `front`/`back` solo la suya. */
function vistaCompatible(
  region: RegionDef,
  vista: RegionDef["vista"],
): boolean {
  return region.vista === "both" || region.vista === vista;
}

/** Ids únicos kebab, zona existente y compatible, precisión coherente. */
export function validarMusculos(
  musculos: readonly MusculoDef[],
  regiones: readonly RegionDef[],
): string[] {
  const errores: string[] = [];
  const ids = new Set<string>();
  for (const musculo of musculos) {
    const donde = `músculo ${musculo.id}`;
    if (ids.has(musculo.id)) errores.push(`${donde}: id duplicado`);
    ids.add(musculo.id);
    if (!ID_KEBAB.test(musculo.id)) {
      errores.push(`${donde}: id fuera del formato kebab-case`);
    }
    if (musculo.nombre.trim() === "") errores.push(`${donde}: nombre vacío`);

    if (musculo.zona !== null) {
      const { slug, vista } = musculo.zona;
      const region = regiones.find((r) => r.slug === slug);
      if (!region) {
        errores.push(`${donde}: la zona "${slug}" no existe en las regiones`);
      } else if (!vistaCompatible(region, vista)) {
        errores.push(
          `${donde}: zona ${slug} con vista ${vista} no compatible (la región es ${region.vista})`,
        );
      }
    }

    if ((musculo.zona === null) !== (musculo.precision === null)) {
      errores.push(
        `${donde}: la precisión debe ser null si y solo si no hay zona`,
      );
    }
    if (
      musculo.precision !== null &&
      !PRECISIONES.includes(musculo.precision)
    ) {
      errores.push(`${donde}: precisión inválida "${musculo.precision}"`);
    }

    if (musculo.queHaceAlumno.trim() === "") {
      errores.push(`${donde}: queHaceAlumno vacío`);
    } else {
      errores.push(
        ...textoAlumnoProblemas(
          musculo.queHaceAlumno,
          `${donde} queHaceAlumno`,
        ),
      );
    }
    if (musculo.nota) {
      errores.push(...validarMarcas(musculo.nota.c, `${donde} nota`));
    }
  }
  return errores;
}

/** 5 roles en orden, 3 contracciones, 3 precisiones, textos no vacíos. */
export function validarGlosario(): string[] {
  const errores: string[] = [];
  const roles = GLOSARIO_ROLES.map((g) => g.rol);
  if (roles.join(",") !== ROLES.join(",")) {
    errores.push(
      `glosario: los roles deben ser ${ROLES.join(",")} en ese orden (hay ${roles.join(",")})`,
    );
  }
  for (const g of GLOSARIO_ROLES) {
    for (const campo of ["titulo", "frase", "definicion", "ejemplo"] as const) {
      if (g[campo].trim() === "") {
        errores.push(`glosario rol ${g.rol}: ${campo} vacío`);
      }
    }
  }
  const contracciones = GLOSARIO_CONTRACCIONES.map((g) => g.clave);
  if (contracciones.join(",") !== "C,E,I") {
    errores.push(
      `glosario: las contracciones deben ser C,E,I (hay ${contracciones.join(",")})`,
    );
  }
  const precisiones = GLOSARIO_PRECISION.map((g) => g.clave);
  if (precisiones.join(",") !== PRECISIONES.join(",")) {
    errores.push(
      `glosario: las precisiones deben ser ${PRECISIONES.join(",")} (hay ${precisiones.join(",")})`,
    );
  }
  for (const g of [...GLOSARIO_CONTRACCIONES, ...GLOSARIO_PRECISION]) {
    if (g.titulo.trim() === "" || g.definicion.trim() === "") {
      errores.push(`glosario ${g.clave}: título o definición vacíos`);
    }
  }
  return errores;
}

/**
 * Grupos de alumno (D14): 3 grupos, los roles cubren motor/sinergista/
 * estabilizador/estira, no incluyen antagonista y coinciden con `GRUPO_DE_ROL`.
 */
export function validarGruposAlumno(
  grupos: readonly GrupoAlumnoDef[] = GRUPOS_ALUMNO,
): string[] {
  const errores: string[] = [];
  if (grupos.length !== 3) {
    errores.push(`grupos de alumno: se esperaban 3 y hay ${grupos.length}`);
  }
  const cubiertos = new Set<string>();
  for (const grupo of grupos) {
    if (grupo.frase.trim() === "" || grupo.definicion.trim() === "") {
      errores.push(`grupo de alumno ${grupo.id}: frase o definición vacías`);
    }
    errores.push(
      ...textoAlumnoProblemas(grupo.frase, `grupo de alumno ${grupo.id} frase`),
      ...textoAlumnoProblemas(
        grupo.definicion,
        `grupo de alumno ${grupo.id} definición`,
      ),
    );
    for (const rol of grupo.roles) {
      if (rol === "antagonista") {
        errores.push(
          `grupo de alumno ${grupo.id}: no incluye antagonista (D14)`,
        );
      }
      if (GRUPO_DE_ROL[rol] !== grupo.id) {
        errores.push(
          `grupo de alumno ${grupo.id}: el rol ${rol} pertenece a ${String(GRUPO_DE_ROL[rol])}`,
        );
      }
      cubiertos.add(rol);
    }
  }
  const requeridos = [
    "motor",
    "sinergista",
    "estabilizador",
    "estira",
  ] as const;
  for (const rol of requeridos) {
    if (!cubiertos.has(rol)) {
      errores.push(`grupos de alumno: ningún grupo cubre el rol ${rol}`);
    }
  }
  return errores;
}

/** Ids únicos, enteros 1..109 o L1..L5, texto y lectura no vacíos. */
export function validarCitas(citas: readonly CitaDef[]): string[] {
  const errores: string[] = [];
  const ids = new Set<number | string>();
  for (const cita of citas) {
    const donde = `cita ${String(cita.id)}`;
    if (ids.has(cita.id)) errores.push(`${donde}: id duplicado`);
    ids.add(cita.id);
    if (typeof cita.id === "number") {
      if (!Number.isInteger(cita.id) || cita.id < 1 || cita.id > MAX_CITA) {
        errores.push(`${donde}: id numérico fuera de 1..${MAX_CITA}`);
      }
    } else if (!/^L[1-5]$/.test(cita.id)) {
      errores.push(`${donde}: id de libro fuera de L1..L5`);
    }
    if (cita.texto.trim() === "") errores.push(`${donde}: texto vacío`);
    if (cita.lectura.trim() === "") errores.push(`${donde}: lectura vacía`);
  }
  return errores;
}

/**
 * Banderas (T21): ids únicos `a|b|c` + número, nivel coherente con la letra,
 * rutas = "todas" o códigos de las 30 rutas sin repetir, y sin rótulos clínicos
 * en la señal ni en la acción (van en `notaInterna`).
 */
export function validarBanderas(
  banderas: readonly BanderaDef[] = BANDERAS,
): string[] {
  const errores: string[] = [];
  const ids = new Set<string>();
  const codigos = Object.keys(ROUTE_PROGRESSION_MAP);
  for (const bandera of banderas) {
    const donde = `bandera ${bandera.id}`;
    if (ids.has(bandera.id)) errores.push(`${donde}: id duplicado`);
    ids.add(bandera.id);
    if (!/^[abc][0-9]+$/.test(bandera.id)) {
      errores.push(`${donde}: id fuera del formato [abc][0-9]+`);
    } else if (NIVEL_DE_LETRA[bandera.id[0]] !== bandera.nivel) {
      errores.push(
        `${donde}: el nivel "${bandera.nivel}" no corresponde a la letra ${bandera.id[0]}`,
      );
    }
    if (bandera.senal.trim() === "") errores.push(`${donde}: señal vacía`);
    if (bandera.accion.trim() === "") errores.push(`${donde}: acción vacía`);
    if (bandera.fuente.trim() === "") errores.push(`${donde}: fuente vacía`);

    if (bandera.rutas !== "todas") {
      if (
        bandera.rutas.length === 0 &&
        !BANDERAS_SIN_RUTAS_V1.includes(bandera.id)
      ) {
        errores.push(`${donde}: rutas vacías (usar "todas" o una lista)`);
      }
      const vistas = new Set<string>();
      for (const code of bandera.rutas) {
        if (!codigos.includes(code)) {
          errores.push(`${donde}: la ruta "${code}" no está entre las 30`);
        }
        if (vistas.has(code)) errores.push(`${donde}: ruta repetida "${code}"`);
        vistas.add(code);
      }
    }

    const visible = normalizar(`${bandera.senal} ${bandera.accion}`);
    for (const rotulo of ROTULOS_CLINICOS) {
      if (visible.includes(rotulo)) {
        errores.push(
          `${donde}: rótulo clínico "${rotulo}" en el texto visible (va en notaInterna)`,
        );
      }
    }
  }
  return errores;
}

/**
 * Todo el contenido de anatomía. Hoy: regiones, músculos, glosario, grupos de
 * alumno, citas y banderas. El plan 04 suma las rutas.
 */
export function validarContenido(): string[] {
  return [
    ...validarRegiones(REGIONES),
    ...validarMusculos(MUSCULOS, REGIONES),
    ...validarGlosario(),
    ...validarGruposAlumno(),
    ...validarCitas(CITAS),
    ...validarBanderas(BANDERAS),
  ];
}
