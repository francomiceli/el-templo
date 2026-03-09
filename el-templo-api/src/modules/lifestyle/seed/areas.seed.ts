/**
 * Area seed data for El Templo's lifestyle module.
 *
 * Extracted from arete-web/src/constants/areas.ts (canonical source).
 * 6 life areas with Greek philosophical names, philosophy text, colors, and icons.
 *
 * SACRED: Philosophy text references ONLY Greek philosophers.
 * NEVER reference Roman stoics (Marco Aurelio, Seneca, Epicteto).
 *
 * Tone: Argentine Spanish (rioplatense), warm, encouraging.
 *
 * @see Phase 46 -- Lifestyle Content Extraction
 */

export interface AreaSeed {
  readonly key:
    | "mente"
    | "cuerpo"
    | "coherencia"
    | "accion"
    | "vinculo"
    | "reflexion";
  readonly label: string;
  readonly greekName: string;
  readonly philosophyText: string;
  readonly colorVar: string;
  readonly icon: string;
  readonly habitPrefix: string;
}

/**
 * 6 area definitions keyed by area name.
 * Greek names: Nous, Soma, Sophrosyne, Praxis, Philia, Theoria.
 */
export const AREA_SEEDS = {
  mente: {
    key: "mente",
    label: "Mente",
    greekName: "Nous",
    philosophyText:
      "Aristoteles ensenaba que el nous -- la capacidad de contemplar y comprender -- es lo que nos distingue. Socrates decia que una vida sin examen no vale la pena ser vivida. Cultivar tu mente es el primer acto de cuidado hacia vos.",
    colorVar: "mente",
    icon: "Brain",
    habitPrefix: "MEN",
  },
  cuerpo: {
    key: "cuerpo",
    label: "Cuerpo",
    greekName: "Soma",
    philosophyText:
      "Para los griegos, el cuerpo no era un obstaculo sino un templo. Heraclito ensenaba que todo fluye, y tu cuerpo es ese rio constante. Mover, respirar y cuidar tu soma es honrar la vida que llevas adentro.",
    colorVar: "cuerpo",
    icon: "Heart",
    habitPrefix: "CUE",
  },
  coherencia: {
    key: "coherencia",
    label: "Coherencia",
    greekName: "Sophrosyne",
    philosophyText:
      'Sophrosyne era la virtud mas admirada en la Grecia antigua: la armonia entre lo que pensas, decis y haces. El oraculo de Delfos lo resumio en "Conocete a vos mismo". Ser coherente es el camino mas directo hacia la paz interior.',
    colorVar: "coherencia",
    icon: "Scale",
    habitPrefix: "COH",
  },
  accion: {
    key: "accion",
    label: "Accion",
    greekName: "Praxis",
    philosophyText:
      "Aristoteles distinguia entre saber y hacer -- la phronesis, sabiduria practica, solo se cultiva en la accion. No alcanza con entender; el coraje esta en animarte a dar el paso. Cada accion consciente te acerca a quien queres ser.",
    colorVar: "accion",
    icon: "Zap",
    habitPrefix: "ACC",
  },
  vinculo: {
    key: "vinculo",
    label: "Vinculo",
    greekName: "Philia",
    philosophyText:
      "Aristoteles dedico libros enteros a la philia -- el vinculo profundo entre personas que se quieren bien. Safo escribio sobre la fuerza del lazo humano con una ternura que sigue resonando. Cuidar tus vinculos es cuidarte a vos.",
    colorVar: "vinculo",
    icon: "Users",
    habitPrefix: "VIN",
  },
  reflexion: {
    key: "reflexion",
    label: "Reflexion",
    greekName: "Theoria",
    philosophyText:
      'Theoria era para los griegos la contemplacion mas elevada: mirar hacia adentro con honestidad. Heraclito decia "me busque a mi mismo" como acto fundacional del pensar. Reflexionar es darte el espacio de escucharte sin apuro.',
    colorVar: "reflexion",
    icon: "BookOpen",
    habitPrefix: "REF",
  },
} as const satisfies Record<string, AreaSeed>;

/** Display order for areas -- used by radar chart and area lists. */
export const AREAS_ORDERED = [
  AREA_SEEDS.mente,
  AREA_SEEDS.cuerpo,
  AREA_SEEDS.coherencia,
  AREA_SEEDS.accion,
  AREA_SEEDS.vinculo,
  AREA_SEEDS.reflexion,
] as const satisfies readonly AreaSeed[];
