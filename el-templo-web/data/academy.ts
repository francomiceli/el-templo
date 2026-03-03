/**
 * Academy page data — centralized content for all /academy sections.
 *
 * 10 sections: Hero, QueEs, Programa, Niveles, Flywheel, Modalidades,
 * QuienEnsena, Inversion, FAQ, Form.
 * No component logic — typed exports only.
 */

// --- Interfaces ---

export interface AcademyValueCard {
  id: string;
  title: string;
  description: string;
}

export interface AcademyModule {
  id: string;
  number: number;
  title: string;
  description: string;
}

export interface CertificationLevel {
  id: string;
  level: number;
  name: string;
  certName: string;
  tagline: string;
  description: string;
  details: Record<string, string>;
  active: boolean;
  badgeColor?: string;
}

export interface AcademyModalidad {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  details: { label: string; value: string }[];
}

export interface FlywheelNode {
  id: string;
  title: string;
  description: string;
  color: string;
}

export interface FlywheelTool {
  name: string;
  description: string;
}

export interface AcademyFaqItem {
  question: string;
  answer: string;
}

export interface AcademySideMenuItem {
  label: string;
  anchor: string;
}

export interface IgnacioStat {
  value: string;
  suffix?: string;
  label: string;
}

export interface AcademyFormSelect {
  value: string;
  label: string;
}

// --- Config ---

export const academyConfig = {
  whatsappUrl: "https://wa.link/ci8dpl",
  notificationEmail: "ignaciobordon@eltemplo.org",
};

// --- Side Menu ---

export const sideMenuItems: AcademySideMenuItem[] = [
  { label: "Hero", anchor: "hero-academy" },
  { label: "\u00BFQu\u00E9 es?", anchor: "que-es-academy" },
  { label: "Programa", anchor: "programa-academy" },
  { label: "Niveles", anchor: "niveles-academy" },
  { label: "Flywheel", anchor: "flywheel-academy" },
  { label: "Modalidades", anchor: "modalidades-academy" },
  { label: "Qui\u00E9n Ense\u00F1a", anchor: "quien-ensena-academy" },
  { label: "Inversi\u00F3n", anchor: "inversion-academy" },
  { label: "FAQ", anchor: "faq-academy" },
  { label: "Formulario", anchor: "formulario-academy" },
];

// --- Value Cards (QueEs section) ---

export const valueCards: AcademyValueCard[] = [
  {
    id: "metodo",
    title: "M\u00E9todo Probado",
    description:
      "No es teor\u00EDa gen\u00E9rica. Es el sistema que ya funciona en 8 sedes y 2 pa\u00EDses. Aprend\u00E9 de lo que ya se aplica.",
  },
  {
    id: "certificacion",
    title: "Certificaci\u00F3n Profesional",
    description:
      "Certificaci\u00F3n de Entrenador de Calistenia por El Templo en 3 niveles progresivos. Respaldo de marca con presencia internacional.",
  },
  {
    id: "salida-laboral",
    title: "Salida Laboral Real",
    description:
      "Entrenadores certificados pueden trabajar en sedes de El Templo, en franquicias, o de forma independiente con nuestro aval.",
  },
];

// --- Program Modules (Programa section) ---

export const programModules: AcademyModule[] = [
  {
    id: "biomecanica",
    number: 1,
    title: "Biomec\u00E1nica del Movimiento",
    description:
      "C\u00F3mo se mueve el cuerpo. Palancas, cadenas cin\u00E9ticas, rangos de movimiento y principios f\u00EDsicos detr\u00E1s de cada ejercicio.",
  },
  {
    id: "anatomia",
    number: 2,
    title: "Anatom\u00EDa y Fisiolog\u00EDa Aplicada",
    description:
      "Sistema muscular, articular y nervioso. Lo que necesit\u00E1s saber para programar con criterio y prevenir lesiones.",
  },
  {
    id: "patrones",
    number: 3,
    title: "Patrones de Movimiento",
    description:
      "Los patrones fundamentales: empuje, tracci\u00F3n, sentadilla, bisagra, rotaci\u00F3n. C\u00F3mo evaluar, corregir y progresar cada uno.",
  },
  {
    id: "tecnicas",
    number: 4,
    title: "T\u00E9cnicas de Calistenia",
    description:
      "Desde los b\u00E1sicos hasta las progresiones avanzadas. Ejecuci\u00F3n t\u00E9cnica, errores comunes y m\u00E9todo de ense\u00F1anza.",
  },
  {
    id: "periodizacion",
    number: 5,
    title: "Periodizaci\u00F3n y Programaci\u00F3n",
    description:
      "C\u00F3mo estructurar mesociclos, microciclos y sesiones. La l\u00F3gica detr\u00E1s de la progresi\u00F3n del M\u00E9todo El Templo.",
  },
  {
    id: "nutricion",
    number: 6,
    title: "Nutrici\u00F3n para el Rendimiento",
    description:
      "Principios de nutrici\u00F3n deportiva aplicada. Energ\u00EDa, recuperaci\u00F3n, composici\u00F3n corporal y gu\u00EDa para alumnos.",
  },
  {
    id: "liderazgo",
    number: 7,
    title: "Liderazgo de Sesi\u00F3n",
    description:
      "C\u00F3mo dirigir una sesi\u00F3n de El Templo: comunicaci\u00F3n, correcci\u00F3n en tiempo real, manejo de grupo y energ\u00EDa.",
  },
];

// --- Certification Levels (Niveles section) ---

export const certificationLevels: CertificationLevel[] = [
  {
    id: "nivel-1",
    level: 1,
    name: "Nivel 1 \u2014 Trainer",
    certName: "Trainer by El Templo",
    tagline: "Las bases para entrenar y ense\u00F1ar calistenia con criterio.",
    description:
      "Entr\u00E1s al camino de la formaci\u00F3n profesional. Aprend\u00E9s biomec\u00E1nica, anatom\u00EDa, t\u00E9cnicas de calistenia, periodizaci\u00F3n y nutrici\u00F3n. Sal\u00EDs con las herramientas para liderar sesiones y la certificaci\u00F3n que te respalda.",
    details: {
      "Duraci\u00F3n": "Intensivo de 1 mes",
      "Carga horaria (presencial)": "16hs online + 8hs presenciales (24hs totales)",
      "Carga horaria (online)": "24 horas en plataforma (a tu ritmo)",
      "Dictado por (presencial)":
        "Ignacio Bordon \u2014 Founder, ex gimnasta de alto rendimiento",
      "Contenido online":
        "Sistema dise\u00F1ado por Ignacio, disponible en el ecosistema Templo Online",
      Requisitos: "Ninguno. Abierto a cualquier persona.",
      "Certificaci\u00F3n":
        "F\u00EDsica y digital. Entrenador de Calistenia Nivel 1 por El Templo.",
      "Evaluaci\u00F3n": "Te\u00F3rica y pr\u00E1ctica",
    },
    active: true,
  },
  {
    id: "nivel-2",
    level: 2,
    name: "Nivel 2 \u2014 Olympic Trainer",
    certName: "Olympic Trainer by El Templo",
    tagline: "Profundizaci\u00F3n t\u00E9cnica y programaci\u00F3n avanzada.",
    description:
      "Ya sos Trainer. Ahora profundiz\u00E1s. Ejercicios intermedios, programaci\u00F3n avanzada y las herramientas para llevar tus sesiones al siguiente nivel. Solo para entrenadores certificados con horas de pr\u00E1ctica real.",
    details: {
      "Duraci\u00F3n": "Aproximadamente 3 meses",
      "Carga horaria": "~72 horas (triple del Nivel 1)",
      "Contenido core":
        "Ejercicios intermedios, programaci\u00F3n de entrenamiento avanzada, periodizaci\u00F3n compleja",
      Requisitos:
        "Trainer by El Templo (Nivel 1) certificado + horas de pr\u00E1ctica como entrenador en sedes de El Templo",
      "Certificaci\u00F3n":
        "F\u00EDsica y digital. Olympic Trainer by El Templo.",
    },
    active: false,
    badgeColor: "--color-aged-gold",
  },
  {
    id: "nivel-3",
    level: 3,
    name: "Nivel 3 \u2014 Spartan Trainer",
    certName: "Spartan Trainer by El Templo",
    tagline: "Liderazgo, gesti\u00F3n y maestr\u00EDa.",
    description:
      "El nivel m\u00E1s alto. Gesti\u00F3n de gimnasio, progresiones avanzadas, coaching profesional y liderazgo de equipos. Preparaci\u00F3n completa para operar una sede o tu propia franquicia. Reservado para quienes ya recorrieron el camino completo.",
    details: {
      "Duraci\u00F3n": "Aproximadamente 6 meses",
      "Carga horaria": "~144 horas (s\u00E9xtuple del Nivel 1)",
      "Contenido core":
        "Gesti\u00F3n de gimnasio, progresiones avanzadas, coaching profesional, formaci\u00F3n de equipos",
      Requisitos:
        "Olympic Trainer by El Templo (Nivel 2) certificado + horas de pr\u00E1ctica extendidas",
      "Certificaci\u00F3n":
        "F\u00EDsica y digital. Spartan Trainer by El Templo.",
    },
    active: false,
    badgeColor: "#7A6543",
  },
];

// --- Flywheel (Section 5) ---

export const flywheelNodes: FlywheelNode[] = [
  {
    id: "entrena",
    title: "ENTREN\u00C1",
    description:
      "Entr\u00E1s como alumno a una sede de El Templo. Entren\u00E1s con el m\u00E9todo, progres\u00E1s por los 6 niveles, descubr\u00EDs que el entrenamiento es un camino, no un destino.",
    color: "var(--color-terracotta)",
  },
  {
    id: "formate",
    title: "FORMATE",
    description:
      "Te certific\u00E1s como Trainer en Olympic Academy. Aprend\u00E9s la ciencia detr\u00E1s del m\u00E9todo, domin\u00E1s la t\u00E9cnica y te prepar\u00E1s para ense\u00F1ar.",
    color: "var(--color-aged-gold)",
  },
  {
    id: "lidera",
    title: "LIDER\u00C1",
    description:
      "Lider\u00E1s sesiones en sedes de El Templo. Aplic\u00E1s lo que aprendiste, crec\u00E9s como profesional, te convert\u00EDs en referente de tu comunidad.",
    color: "#7A6543",
  },
  {
    id: "inverti",
    title: "INVERT\u00CD",
    description:
      "Abr\u00EDs tu propio Templo. Conoc\u00E9s el m\u00E9todo desde adentro, ten\u00E9s la formaci\u00F3n, ten\u00E9s la experiencia. Tu sede genera nuevos alumnos que arrancan el ciclo.",
    color: "var(--color-deep-charcoal)",
  },
];

export const flywheelTools: FlywheelTool[] = [
  {
    name: "App Templo Online",
    description: "Entrenamiento + seguimiento + test de nivel",
  },
  {
    name: "Olympic Academy Online",
    description: "Formaci\u00F3n profesional desde cualquier lugar",
  },
  {
    name: "Aret\u0113",
    description: "App de h\u00E1bitos para alinear mente y cuerpo",
  },
  {
    name: "Comunidad Digital",
    description: "Red de alumnos, entrenadores y franquiciados",
  },
];

// --- Modalidades (Section 6) ---

export const modalidades: AcademyModalidad[] = [
  {
    id: "presencial",
    title: "Modalidad Presencial",
    subtitle: "Con Ignacio Bordon. En persona.",
    description:
      "Formaci\u00F3n intensiva dictada por el fundador de El Templo. 16 horas de contenido online + 8 horas presenciales con correcci\u00F3n en vivo y acceso directo al creador del m\u00E9todo.",
    details: [
      { label: "Duraci\u00F3n", value: "1 mes intensivo" },
      { label: "Carga", value: "16hs online + 8hs presenciales" },
      {
        label: "Dictado por",
        value: "Ignacio Bordon (founder, ex gimnasta)",
      },
      {
        label: "Ubicaci\u00F3n",
        value: "Sedes de El Templo, Mar del Plata",
      },
      {
        label: "Incluye",
        value:
          "Material de estudio + plataforma online + certificaci\u00F3n f\u00EDsica y digital",
      },
      { label: "Cupos", value: "Limitados por edici\u00F3n" },
    ],
  },
  {
    id: "online",
    title: "Modalidad Online",
    subtitle: "El m\u00E9todo completo. Desde donde est\u00E9s.",
    description:
      "Programa 100% online dise\u00F1ado por Ignacio Bordon, disponible en el ecosistema Templo Online. Materiales de estudio, videos demostrativos y evaluaciones. Avanz\u00E1s a tu ritmo.",
    details: [
      { label: "Duraci\u00F3n", value: "A tu ritmo (estimado 1 mes)" },
      { label: "Carga", value: "24hs de contenido en plataforma" },
      { label: "Dise\u00F1ado por", value: "Ignacio Bordon" },
      {
        label: "Plataforma",
        value: "Ecosistema Templo Online, cualquier dispositivo",
      },
      {
        label: "Incluye",
        value:
          "Videos + material descargable + evaluaciones + certificaci\u00F3n digital",
      },
      {
        label: "Disponibilidad",
        value: "Inscripci\u00F3n abierta permanente",
      },
    ],
  },
];

// --- Ignacio Stats (QuienEnsena section) ---

export const ignacioStats: IgnacioStat[] = [
  { value: "+20", label: "a\u00F1os de experiencia" },
  { value: "8", label: "sedes fundadas" },
  { value: "2", label: "pa\u00EDses con presencia activa" },
];

export const ignacioCredentials: string[] = [
  "Ex gimnasta de alto rendimiento",
  "Creador del M\u00E9todo El Templo",
  "Todos los entrenadores de la red formados por \u00E9l",
];

// --- FAQ (Section 9) ---

export const academyFaqItems: AcademyFaqItem[] = [
  {
    question: "\u00BFNecesito experiencia previa para inscribirme?",
    answer:
      "No. El Nivel 1 est\u00E1 dise\u00F1ado para personas con o sin experiencia. Si ya entren\u00E1s, profundiz\u00E1s. Si reci\u00E9n empez\u00E1s, aprend\u00E9s desde las bases.",
  },
  {
    question: "\u00BFEl certificado tiene validez oficial?",
    answer:
      "La certificaci\u00F3n es emitida por El Templo Calistenia. Est\u00E1 respaldada por una marca con presencia internacional, un m\u00E9todo probado en 8 sedes y 2 pa\u00EDses, y es requisito para trabajar en cualquier sede de la red.",
  },
  {
    question:
      "\u00BFPuedo trabajar en El Templo despu\u00E9s de certificarme?",
    answer:
      "S\u00ED. La certificaci\u00F3n es requisito para formar parte del equipo de entrenadores. No garantiza un puesto, pero abre la puerta.",
  },
  {
    question:
      "\u00BFCu\u00E1l es la diferencia entre presencial y online?",
    answer:
      "El contenido es el mismo. La diferencia es que en presencial ten\u00E9s 8 horas de pr\u00E1ctica con Ignacio Bordon, correcci\u00F3n en vivo y contacto directo con el creador del m\u00E9todo.",
  },
  {
    question: "\u00BFC\u00F3mo paso de Nivel 1 a Nivel 2?",
    answer:
      "Necesit\u00E1s tener el Nivel 1 aprobado y horas de pr\u00E1ctica como entrenador en sedes de El Templo. No alcanza con estudiar \u2014 ten\u00E9s que haber entrenado gente.",
  },
  {
    question:
      "\u00BFSoy franquiciado. Mis entrenadores pagan el curso?",
    answer:
      "No. La formaci\u00F3n de entrenadores est\u00E1 incluida en el paquete de franquicia.",
  },
  {
    question:
      "\u00BFCu\u00E1ndo arranca el pr\u00F3ximo programa presencial?",
    answer:
      "Las fechas se comunican por email y redes. Complet\u00E1 el formulario y te avisamos.",
  },
  {
    question: "\u00BFHay facilidades de pago?",
    answer:
      "Consult\u00E1 opciones completando el formulario o escribinos por WhatsApp.",
  },
];

// --- Form Selects ---

export const formSelects = {
  nivelInteres: [
    {
      value: "nivel-1-trainer",
      label: "Nivel 1 \u2014 Trainer",
    },
    {
      value: "nivel-2-olympic-trainer",
      label: "Nivel 2 \u2014 Olympic Trainer (pr\u00F3ximamente)",
    },
    {
      value: "nivel-3-spartan-trainer",
      label: "Nivel 3 \u2014 Spartan Trainer (pr\u00F3ximamente)",
    },
  ] as AcademyFormSelect[],
  modalidad: [
    { value: "presencial", label: "Presencial" },
    { value: "online", label: "Online" },
    { value: "ambas", label: "Ambas" },
  ] as AcademyFormSelect[],
  experiencia: [
    { value: "calistenia", label: "S\u00ED, en calistenia" },
    { value: "otro-entrenamiento", label: "S\u00ED, en otro entrenamiento" },
    { value: "sin-experiencia", label: "Sin experiencia" },
    { value: "entrenador", label: "Ya soy entrenador" },
  ] as AcademyFormSelect[],
  alumnoElTemplo: [
    { value: "si", label: "S\u00ED" },
    { value: "no", label: "No" },
    { value: "fui-alumno", label: "Fui alumno/a" },
  ] as AcademyFormSelect[],
  origen: [
    { value: "instagram", label: "Instagram" },
    { value: "web", label: "Web El Templo" },
    { value: "recomendacion", label: "Recomendaci\u00F3n" },
    { value: "google", label: "Google" },
    { value: "otro", label: "Otro" },
  ] as AcademyFormSelect[],
};
