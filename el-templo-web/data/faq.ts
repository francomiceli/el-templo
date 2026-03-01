/**
 * FAQ data — 9 Q&A pairs addressing key user objections.
 *
 * Order is deliberate:
 * 1-3: "Can I do this?" (experience, duration, strength)
 * 4: Economic friction (free first session)
 * 5: Differentiation from gyms
 * 6: Physical accessibility
 * 7-9: Practical/functional (schedules, app, franchise)
 *
 * IMPORTANT: Never use "clase" — always "sesi\u00F3n" per brand spec.
 */

export interface FaqItem {
  question: string;
  answer: string;
}

export const faqItems: FaqItem[] = [
  {
    question: "\u00BFNecesito experiencia previa para empezar?",
    answer:
      "No. El m\u00E9todo est\u00E1 dise\u00F1ado para que cualquier persona pueda empezar desde cero. Tu primera sesi\u00F3n es una evaluaci\u00F3n donde un entrenador te ubica en tu nivel. A partir de ah\u00ED, todo es progresivo.",
  },
  {
    question: "\u00BFCu\u00E1nto dura una sesi\u00F3n?",
    answer:
      "1 hora. Cada sesi\u00F3n tiene 4 bloques con objetivos espec\u00EDficos: Initium, Nucleus, Deuteros y Athlos. No se improvisa.",
  },
  {
    question: "\u00BFQu\u00E9 pasa si no tengo fuerza?",
    answer:
      "La fuerza se construye. Para eso existe el m\u00E9todo. El nivel Alfa est\u00E1 dise\u00F1ado para personas que est\u00E1n empezando. No necesit\u00E1s llegar fuerte \u2014 necesit\u00E1s llegar.",
  },
  {
    question: "\u00BFLa primera sesi\u00F3n tiene costo?",
    answer:
      "No. Tu primera sesi\u00F3n es sin cargo. Ven\u00ED, entren\u00E1, conoc\u00E9 el m\u00E9todo y despu\u00E9s decid\u00EDs.",
  },
  {
    question: "\u00BFQu\u00E9 diferencia hay con un gimnasio convencional?",
    answer:
      "En un gym hac\u00E9s ejercicios. En El Templo segu\u00EDs un m\u00E9todo. Cada sesi\u00F3n tiene estructura, progresi\u00F3n y prop\u00F3sito. Entren\u00E1s con tu peso corporal, sin m\u00E1quinas, con un sistema de 6 niveles que te lleva de donde est\u00E1s a donde quer\u00E9s llegar.",
  },
  {
    question:
      "\u00BFPuedo entrenar si tengo una lesi\u00F3n o limitaci\u00F3n f\u00EDsica?",
    answer:
      "Depende del caso. En tu primera sesi\u00F3n, el entrenador eval\u00FAa tu situaci\u00F3n y adapta el entrenamiento. Si hay algo que no pod\u00E9s hacer, se modifica. Lo importante es entrenar inteligente.",
  },
  {
    question: "\u00BFHay diferentes horarios y sedes?",
    answer:
      "S\u00ED. Tenemos 8 sedes (7 en Mar del Plata y 1 en Barcelona) con m\u00FAltiples horarios. Pod\u00E9s elegir la sede y el horario que mejor te quede.",
  },
  {
    question: "\u00BFQu\u00E9 es Templo Online?",
    answer:
      "Es nuestra app. Pod\u00E9s hacer el test de nivel, seguir rutinas del m\u00E9todo y entrenar desde cualquier lugar. Es ideal si no ten\u00E9s una sede cerca o quer\u00E9s complementar tu entrenamiento presencial.",
  },
  {
    question: "\u00BFPuedo abrir mi propio Templo?",
    answer:
      "S\u00ED. Tenemos un modelo de franquicia con m\u00E9todo, equipamiento Gladius, formaci\u00F3n y respaldo de marca. Visit\u00E1 la secci\u00F3n de Franquicias para m\u00E1s informaci\u00F3n.",
  },
];
