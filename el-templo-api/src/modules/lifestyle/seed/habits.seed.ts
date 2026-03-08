/**
 * Habit seed data for El Templo's lifestyle module.
 *
 * Extracted from the Arete codebase (habits.ts + habit-details.ts),
 * filtered to Level 1-2 starter set, brand-adapted to El Templo voice.
 *
 * 6 life areas: Mente, Cuerpo, Coherencia, Accion, Vinculo, Reflexion
 * Tone: Argentine Spanish (rioplatense), warm, encouraging.
 *
 * @see Phase 46 — Lifestyle Content Extraction
 */

export type HabitArea =
  | "mente"
  | "cuerpo"
  | "coherencia"
  | "accion"
  | "vinculo"
  | "reflexion";

export type HabitMoment = "manana" | "dia" | "noche" | "semanal" | "libre";

export interface HabitSeed {
  readonly id: string;
  readonly area: HabitArea;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly moment: HabitMoment;
  readonly minLevel: number;
  readonly durationMinutes: number | null;
  readonly howTo: string;
  readonly whyItMatters: string;
  readonly tips: readonly string[];
}

/**
 * Level 1-2 habits with full details (howTo, whyItMatters, tips).
 *
 * 17 habits total:
 * - Level 1 (5): MEN-01, CUE-01, COH-01, ACC-01, REF-01
 * - Level 2 (12): MEN-02, MEN-03, MEN-04, CUE-02, CUE-03, CUE-04,
 *                  COH-02, ACC-02, VIN-01, VIN-02, REF-02, REF-03
 */
export const HABIT_SEEDS = [
  // ---------------------------------------------------------------------------
  // MENTE — Level 1-2 (4 habits)
  // ---------------------------------------------------------------------------
  {
    id: "MEN-01",
    area: "mente",
    code: "MEN-01",
    name: "Meditacion matutina",
    description: "Dedica 5 minutos al silencio interior al despertar",
    moment: "manana",
    minLevel: 1,
    durationMinutes: 5,
    howTo:
      'Apenas te despertes, antes de mirar el celular, sentate en un lugar tranquilo. Cerra los ojos y enfocate solo en tu respiracion durante 5 minutos. No intentes "no pensar" -- simplemente observa lo que aparece y dejalo pasar, como nubes en el cielo. Si te distraes, volve al aire entrando y saliendo. Eso es todo.',
    whyItMatters:
      'La neurociencia mostro que solo 5 minutos diarios de meditacion reducen el cortisol y fortalecen la corteza prefrontal, la zona del cerebro que te ayuda a tomar mejores decisiones. Los estoicos la llamaban "la ciudadela interior": ese espacio de calma que nadie te puede sacar.',
    tips: [
      "Deja el celular en otra habitacion hasta que termines",
      "Si 5 minutos te parece mucho, empeza con 2 y subi de a poco",
      "Usa siempre el mismo lugar -- tu cerebro lo va a asociar con calma",
      'No juzgues la sesion como "buena" o "mala", el acto de sentarte ya cuenta',
    ],
  },
  {
    id: "MEN-02",
    area: "mente",
    code: "MEN-02",
    name: "Visualizacion de objetivos",
    description: "Visualiza con claridad el dia que deseas construir",
    moment: "manana",
    minLevel: 2,
    durationMinutes: 5,
    howTo:
      "Despues de tu meditacion matutina (o al despertarte), cerra los ojos y visualiza tu dia ideal con la mayor cantidad de detalles posible. Imagina como te sentis al completar lo importante, como te moves, como hablas. No es fantasia: es un ensayo mental. Hacelo durante 5 minutos con intencion, sintiendo las emociones como si ya estuvieran pasando.",
    whyItMatters:
      "Los estudios en neurociencia del deporte demostraron que el cerebro no distingue bien entre una experiencia vivida y una visualizada vividamente: se activan las mismas redes neuronales. Los atletas olimpicos lo usan hace decadas. Si podes verlo con claridad, tu mente ya empieza a construir el camino.",
    tips: [
      "Inclui detalles sensoriales: que ves, que escuchas, que sentis en el cuerpo",
      "Enfocate en 1-3 momentos clave del dia, no en cada minuto",
      "Visualiza tambien como manejas los obstaculos, no solo los exitos",
    ],
  },
  {
    id: "MEN-03",
    area: "mente",
    code: "MEN-03",
    name: "Practica de atencion plena",
    description: "Detente y observa el presente sin juicio durante 10 minutos",
    moment: "dia",
    minLevel: 2,
    durationMinutes: 10,
    howTo:
      "En algun momento del dia, pausa lo que estas haciendo. Puede ser caminando, comiendo, o en una pausa del trabajo. Durante 10 minutos, presta atencion plena a lo que sea que estes haciendo: los sonidos alrededor, las sensaciones en tu cuerpo, los colores que ves. Si un pensamiento te lleva, notalo y volve al presente. No hay que hacer nada especial, solo estar realmente aca.",
    whyItMatters:
      'Jon Kabat-Zinn demostro que el mindfulness reduce la ansiedad y mejora la regulacion emocional. Pero mas alla de la ciencia, hay algo profundo en aprender a estar donde estas. Marco Aurelio escribio: "No te perturba lo que pasa, sino lo que pensas sobre lo que pasa." La atencion plena te da ese espacio entre el estimulo y tu respuesta.',
    tips: [
      "Elegi una actividad cotidiana (lavar los platos, caminar) como tu ancla de atencion plena",
      'Pone una alarma random en el celular como recordatorio de "volver al presente"',
      "Si te cuesta, empeza notando 5 cosas que ves, 4 que tocas, 3 que escuchas",
      "No lo conviertas en otra tarea: es una pausa, no un esfuerzo",
    ],
  },
  {
    id: "MEN-04",
    area: "mente",
    code: "MEN-04",
    name: "Diario de pensamientos",
    description: "Registra los pensamientos que dominaron tu mente hoy",
    moment: "noche",
    minLevel: 2,
    durationMinutes: 10,
    howTo:
      "Antes de dormir, agarra un cuaderno o abri una nota en el celular. Escribi los 2-3 pensamientos que mas te ocuparon la cabeza hoy. No los analices: solo registralos tal cual aparecen. Despues, al lado de cada uno, escribi si ese pensamiento te sumo o te resto energia. Con el tiempo, vas a empezar a ver patrones.",
    whyItMatters:
      "La terapia cognitivo-conductual (TCC) demostro que registrar pensamientos es una de las herramientas mas efectivas para cambiar patrones mentales negativos. Epicteto decia que no son las cosas las que nos perturban, sino nuestros juicios sobre ellas. Este diario te ayuda a ver esos juicios con claridad.",
    tips: [
      "No busques escribir bonito, escribi honesto",
      "Si un pensamiento se repite muchos dias seguidos, prestale atencion especial",
      "Mantene el cuaderno al lado de la cama para que sea facil",
    ],
  },

  // ---------------------------------------------------------------------------
  // CUERPO — Level 1-2 (4 habits)
  // ---------------------------------------------------------------------------
  {
    id: "CUE-01",
    area: "cuerpo",
    code: "CUE-01",
    name: "Hidratacion consciente",
    description:
      "Bebe un vaso de agua al despertar, antes de cualquier otra cosa",
    moment: "manana",
    minLevel: 1,
    durationMinutes: null,
    howTo:
      "Ni bien te levantes, antes de mate, cafe o cualquier otra cosa, toma un vaso grande de agua (300-500ml). Podes dejar el vaso preparado la noche anterior al lado de tu cama para que sea automatico. No hace falta que sea tibia ni con limon: solo agua. Tomala despacio, consciente de que estas rehidratando tu cuerpo despues de 7-8 horas sin liquido.",
    whyItMatters:
      "Tu cuerpo pierde entre 500ml y 1 litro de agua durante la noche solo respirando y transpirando. La deshidratacion leve reduce la funcion cognitiva hasta un 25%. Es el habito mas simple con mayor retorno: un vaso de agua marca literalmente como arranca tu dia a nivel celular.",
    tips: [
      "Deja el vaso lleno en la mesita de luz antes de acostarte",
      'Si te olvidas, vinculalo a otra accion fija: "piso el piso, agarro el vaso"',
      "No lo reemplaces con mate o cafe, eso viene despues",
    ],
  },
  {
    id: "CUE-02",
    area: "cuerpo",
    code: "CUE-02",
    name: "Caminata al aire libre",
    description: "Camina al menos 20 minutos conectando con tu entorno",
    moment: "dia",
    minLevel: 2,
    durationMinutes: 20,
    howTo:
      "Sali a caminar al menos 20 minutos, idealmente sin auriculares ni celular (o con el celular en modo avion). Camina a un ritmo que te permita respirar con comodidad pero que no sea un paseo lento. Presta atencion a lo que te rodea: arboles, cielo, gente, sonidos. No es ejercicio cardiovascular intenso: es movimiento consciente en contacto con el exterior.",
    whyItMatters:
      'Nietzsche decia que "las mejores ideas llegan caminando." La ciencia le dio la razon: caminar aumenta el flujo sanguineo cerebral un 15-20% y estimula la creatividad segun estudios de Stanford. Ademas, la exposicion a espacios abiertos reduce marcadores de estres. Peripateticos, estoicos, budistas: todas las grandes tradiciones caminaban para pensar.',
    tips: [
      "Si podes, camina por un parque o zona con arboles: el efecto se potencia con naturaleza",
      "Usalo como momento de reflexion o simplemente de presencia, no de productividad",
      "Si llueve, sali igual con paraguas: el habito no negocia con el clima",
      "Camina despues de comer: mejora la digestion y regula la glucosa en sangre",
    ],
  },
  {
    id: "CUE-03",
    area: "cuerpo",
    code: "CUE-03",
    name: "Exposicion al sol matutino",
    description: "Recibe la luz del sol en los primeros minutos del dia",
    moment: "manana",
    minLevel: 2,
    durationMinutes: 10,
    howTo:
      "En los primeros 30-60 minutos despues de despertarte, sali al exterior y expone tu cara y ojos (sin mirar directo al sol) a la luz natural durante 10 minutos. No sirve a traves de una ventana porque el vidrio filtra los rayos UV que tu cuerpo necesita. Si hace frio, abrigate, pero sali. Podes combinarlo con tu cafe o mate afuera, o con la caminata matutina.",
    whyItMatters:
      "Andrew Huberman, neurocientifico de Stanford, popularizo la evidencia de que la luz solar matutina sincroniza tu reloj circadiano, mejora el sueno nocturno, eleva la serotonina y regula la produccion de melatonina. Es gratuito, no tiene efectos secundarios, y es probablemente el hack de salud mas subestimado que existe.",
    tips: [
      "No uses anteojos de sol en estos 10 minutos: tu retina necesita la luz",
      "En dias nublados tambien sirve: la luz exterior nublada es 10x mas potente que la luz indoor",
      "Combinalo con CUE-01: agua en mano y 10 minutos afuera",
    ],
  },
  {
    id: "CUE-04",
    area: "cuerpo",
    code: "CUE-04",
    name: "Respiracion controlada",
    description: "Practica respiracion profunda para dominar tu estado interno",
    moment: "libre",
    minLevel: 2,
    durationMinutes: 5,
    howTo:
      "En cualquier momento del dia que necesites un reset, hace respiracion controlada durante 5 minutos. Tecnica basica: inhala por la nariz durante 4 segundos, retene 4 segundos, exhala por la boca durante 6-8 segundos. Repeti. Si queres algo mas activante, proba la respiracion tipo Wim Hof: 30 respiraciones profundas rapidas, retencion con pulmones vacios. Elegi segun lo que necesites: calma o energia.",
    whyItMatters:
      'La respiracion es el unico sistema autonomo del cuerpo que podes controlar voluntariamente. Al extender la exhalacion, activas el nervio vago y pasas del modo "pelear o huir" al modo "descansar y digerir." Los Navy SEALs usan la respiracion 4-4-6 bajo fuego real. Si les funciona a ellos, te va a funcionar a vos.',
    tips: [
      "Usala antes de una reunion importante o conversacion dificil",
      "La tecnica 4-7-8 (inhalar 4, retener 7, exhalar 8) es excelente para dormir",
      "Si te mareas con la retencion, empeza solo con inhalaciones y exhalaciones lentas",
      "Practica con la mano en el abdomen: tiene que subir al inhalar, no el pecho",
    ],
  },

  // ---------------------------------------------------------------------------
  // COHERENCIA — Level 1-2 (2 habits)
  // ---------------------------------------------------------------------------
  {
    id: "COH-01",
    area: "coherencia",
    code: "COH-01",
    name: "Revision nocturna",
    description: "Antes de dormir, revisa mentalmente 3 acciones del dia",
    moment: "noche",
    minLevel: 1,
    durationMinutes: 5,
    howTo:
      'Antes de apagar la luz, sentate en la cama y repasa mentalmente tres acciones del dia. No busques solo los "logros": revisa una accion que hiciste bien, una que podrias haber hecho mejor, y una en la que fuiste fiel a tus valores. Son 5 minutos de revision honesta. Los pitagoricos hacian esto cada noche como practica sagrada.',
    whyItMatters:
      "La revision nocturna era una practica central de los pitagoricos y los estoicos. Seneca la practicaba cada noche y la documento en sus cartas. La psicologia moderna confirma que la reflexion diaria mejora la autorregulacion y el aprendizaje experiencial. Sin revision, repetis los mismos errores; con revision, cada dia te ensena algo.",
    tips: [
      "Hacelo mentalmente o en un cuaderno, como prefieras",
      "Se brutal pero no cruel con vos mismo: honestidad sin autocastigo",
      'Si no se te ocurre nada, preguntate: "De que me siento orgulloso hoy? De que no?"',
    ],
  },
  {
    id: "COH-02",
    area: "coherencia",
    code: "COH-02",
    name: "Promesa diaria",
    description: "Haz una promesa al comenzar el dia y cumplela sin excepcion",
    moment: "manana",
    minLevel: 2,
    durationMinutes: null,
    howTo:
      'Cada manana, hacete una promesa concreta y alcanzable para ese dia. No tiene que ser epica: "Hoy no voy a quejarme", "Hoy voy a terminar ese informe", "Hoy voy a llamar a mi viejo." Decila en voz alta o escribila. Lo importante es que sea UNA sola cosa, clara, y que a la noche puedas verificar si la cumpliste. Si la cumplis, bien. Si no, anota por que y ajusta.',
    whyItMatters:
      'La coherencia se construye promesa a promesa. Cada promesa cumplida refuerza la confianza en vos mismo, que es la base de la autoestima genuina. Los estoicos lo llamaban "prohairesis": la capacidad de elegir y sostener tu eleccion. No hay nada que destruya mas la confianza interna que acostumbrarte a no cumplirte a vos mismo.',
    tips: [
      "Empeza con promesas faciles para construir el musculo del cumplimiento",
      "Decila en voz alta: verbalizar crea compromiso neurologico",
      "Anotala en un lugar visible: la pantalla del celular, un post-it en el espejo",
    ],
  },

  // ---------------------------------------------------------------------------
  // ACCION — Level 1-2 (2 habits)
  // ---------------------------------------------------------------------------
  {
    id: "ACC-01",
    area: "accion",
    code: "ACC-01",
    name: "Primera tarea importante",
    description: "Completa tu tarea mas importante antes del mediodia",
    moment: "dia",
    minLevel: 1,
    durationMinutes: null,
    howTo:
      'Identifica la tarea mas importante de tu dia -- esa que si la completas, el dia fue productivo aunque no hagas nada mas. Hacela PRIMERO, antes de chequear mails, redes o cualquier tarea menor. Bloquea las primeras horas de tu manana para esto. Si no sabes cual es la mas importante, preguntate: "Cual de todas me sentiria mal si no hago hoy?"',
    whyItMatters:
      'Mark Twain decia: "Si tu trabajo es comerte un sapo, es mejor hacerlo a primera hora de la manana." La ciencia del rendimiento confirma que la fuerza de voluntad y la capacidad de concentracion son maximas en las primeras horas. Gastar esas horas en emails es como usar nafta premium para calentar agua. Tu mejor energia merece tu mejor tarea.',
    tips: [
      "Defini tu tarea #1 la noche anterior para no perder tiempo decidiendo por la manana",
      "Pone el celular en modo avion durante las primeras 2 horas",
      'Si la tarea es muy grande, defini cual es el "minimo viable" que podes completar hoy',
    ],
  },
  {
    id: "ACC-02",
    area: "accion",
    code: "ACC-02",
    name: "Eliminacion de distraccion",
    description: "Identifica y elimina una distraccion que roba tu atencion",
    moment: "dia",
    minLevel: 2,
    durationMinutes: null,
    howTo:
      "Hoy, identifica UNA distraccion que regularmente te roba tiempo o atencion y eliminala o reducila drasticamente. Puede ser silenciar las notificaciones de un grupo de WhatsApp, desinstalar una app de redes por un dia, poner el celular en otra habitacion mientras trabajas, o cerrar las pestanas del navegador que no necesitas. Una sola distraccion menos puede liberar horas de atencion.",
    whyItMatters:
      'Cal Newport, en "Deep Work", demostro que cada interrupcion te cuesta entre 15 y 25 minutos de recuperacion de foco. Si te interrumpen 10 veces al dia, perdiste mas de 3 horas. La atencion es el recurso mas valioso que tenes y es finito. Protegerlo es un acto de respeto hacia tus propios objetivos.',
    tips: [
      "Empeza con la distraccion que mas tiempo te roba: probablemente ya sabes cual es",
      'Usa la tecnica del "bloqueo": defini horarios donde SI podes mirar redes y respeta el resto',
      "Desactiva notificaciones de todo excepto llamadas y mensajes directos",
      "Si no podes eliminarla, ponele friccion: saca la app de la pantalla principal",
    ],
  },

  // ---------------------------------------------------------------------------
  // VINCULO — Level 2 (2 habits)
  // ---------------------------------------------------------------------------
  {
    id: "VIN-01",
    area: "vinculo",
    code: "VIN-01",
    name: "Conversacion profunda",
    description:
      "Sostene una conversacion autentica que trascienda lo superficial",
    moment: "dia",
    minLevel: 2,
    durationMinutes: null,
    howTo:
      'Hoy, busca tener al menos una conversacion que vaya mas alla del "todo bien?" y el "si, ahi andamos." Preguntale a alguien que le esta costando ultimamente, que esta aprendiendo, o que piensa sobre algo que le importa. Mostra curiosidad genuina. No hace falta que sea de 2 horas: 10 minutos de conversacion profunda vale mas que 3 horas de charla superficial.',
    whyItMatters:
      'El estudio de Harvard sobre la felicidad (el mas largo de la historia, 85+ anos) concluyo que la calidad de las relaciones es el predictor numero uno de bienestar y longevidad. No la cantidad, LA CALIDAD. Aristoteles llamaba a las amistades profundas "amistades de virtud" y las consideraba esenciales para la vida buena. Conectar de verdad con otro ser humano es una de las experiencias mas poderosas que existen.',
    tips: [
      "Empeza con las personas cercanas: pareja, familia, amigos de confianza",
      "Pregunta cosas que te interesen genuinamente: la curiosidad no se finge",
      "Guarda el celular cuando hablas con alguien: atencion dividida no es atencion",
    ],
  },
  {
    id: "VIN-02",
    area: "vinculo",
    code: "VIN-02",
    name: "Acto de servicio",
    description: "Ayuda a alguien sin esperar nada a cambio",
    moment: "dia",
    minLevel: 2,
    durationMinutes: null,
    howTo:
      'Hoy, hace algo concreto por otra persona sin que te lo pidan y sin esperar nada a cambio. Puede ser prepararle el desayuno a alguien, ayudar a un companero con un proyecto, hacerle un mandado a un familiar, o simplemente preguntarle a alguien "en que te puedo dar una mano?" El acto tiene que tener costo para vos (tiempo, esfuerzo, incomodidad) -- si no cuesta, no es servicio.',
    whyItMatters:
      'La investigacion en psicologia positiva muestra que los actos de servicio generan mas bienestar duradero en quien da que en quien recibe. Adam Grant, en "Give and Take", demostro que los "givers" (dadores) estrategicos son los que mas exito tienen a largo plazo. Los estoicos veian el servicio como una obligacion natural: somos partes de un todo, y servir al todo es servirse a uno mismo.',
    tips: [
      "Empeza con actos pequenos pero consistentes: lo importante es el habito, no la escala",
      "Presta atencion a lo que la gente necesita sin decirlo: ahi estan las mejores oportunidades",
      "No busques reconocimiento ni cuentes lo que hiciste: eso lo convierte en otra cosa",
    ],
  },

  // ---------------------------------------------------------------------------
  // REFLEXION — Level 1-2 (3 habits)
  // ---------------------------------------------------------------------------
  {
    id: "REF-01",
    area: "reflexion",
    code: "REF-01",
    name: "Lectura reflexiva",
    description: "Lee al menos 10 paginas de un libro que te desafie",
    moment: "libre",
    minLevel: 1,
    durationMinutes: 10,
    howTo:
      "Lee al menos 10 minutos de un libro que te haga pensar. No vale scrollear articulos ni noticias: tiene que ser un libro (fisico o digital) que desafie tu mente. Mientras lees, si una idea te impacta, detenete. No sigas de largo. Releela, pensa que significa para tu vida, anotala si podes. La lectura reflexiva no es consumo: es dialogo con el autor.",
    whyItMatters:
      'Schopenhauer decia que "leer es pensar con la cabeza de otro." Pero la lectura reflexiva va mas alla: es tomar esas ideas ajenas y pasarlas por tu propio filtro. Los estudios muestran que leer ficcion aumenta la empatia, leer no-ficcion expande modelos mentales, y ambos tipos mejoran la conectividad neuronal. En un mundo de tiktoks de 30 segundos, leer un libro es un acto de resistencia intelectual.',
    tips: [
      'Tene siempre un libro empezado: elimina la friccion de "que leo?"',
      "Lee a la manana o antes de dormir: evita las horas donde tu cerebro esta agotado",
      "Alterna entre generos: filosofia, ciencia, historia, ficcion, biografias",
    ],
  },
  {
    id: "REF-02",
    area: "reflexion",
    code: "REF-02",
    name: "Pregunta del dia",
    description: "Hacete una pregunta profunda y dejala habitar en ti",
    moment: "noche",
    minLevel: 2,
    durationMinutes: null,
    howTo:
      'Antes de dormir, hacete una pregunta profunda y dejala resonar en vos sin buscar una respuesta inmediata. Puede ser: "Que haria si no tuviera miedo?", "A que le estoy diciendo que si cuando deberia decir que no?", "Que me diria mi yo de 80 anos sobre como estoy viviendo hoy?", "Que creo que es verdad pero nunca cuestione?" No la googles. Dormi con ella. Deja que tu mente inconsciente trabaje.',
    whyItMatters:
      "Las mejores preguntas son mas valiosas que las mejores respuestas. Socrates construyo toda su filosofia sobre el arte de preguntar. La neurociencia del sueno muestra que el cerebro procesa preguntas abiertas durante la noche, generando insights al despertar. Darle a tu mente una pregunta poderosa antes de dormir es como darle una mision a tu subconsciente.",
    tips: [
      "Tene una lista de preguntas poderosas guardada para los dias que no se te ocurra ninguna",
      "No busques respuestas definitivas: las mejores preguntas son las que te acompanan dias",
      "Si una pregunta te incomoda, probablemente sea la correcta",
      "Anota las respuestas que te lleguen al dia siguiente, aunque parezcan raras",
    ],
  },
  {
    id: "REF-03",
    area: "reflexion",
    code: "REF-03",
    name: "Observacion sin juicio",
    description: "Observa una situacion del dia sin emitir juicio alguno",
    moment: "dia",
    minLevel: 2,
    durationMinutes: null,
    howTo:
      "En algun momento del dia, elegi una situacion, persona o evento y observalo sin emitir juicio alguno. No lo clasifiques como bueno o malo, correcto o incorrecto. Solo mira. Si te sorprendes juzgando (y te vas a sorprender), notalo sin juzgarte por juzgar. Puede ser observar a la gente en la calle, una discusion ajena, tu propia reaccion emocional, o simplemente el clima. El objetivo es entrenar la mirada limpia.",
    whyItMatters:
      'Los estoicos distinguian entre el evento y tu juicio sobre el evento. Epicteto lo resumio: "No son las cosas las que te perturban, sino tus opiniones sobre las cosas." El mindfulness budista trabaja el mismo principio. La observacion sin juicio es la base de la claridad mental: cuando dejas de etiquetar todo, empezas a ver las cosas como realmente son.',
    tips: [
      "Empeza con cosas neutras (el clima, los sonidos) y avanza hacia situaciones cargadas",
      'Cuando notes un juicio automatico, etiquetalo internamente: "juicio" y soltalo',
      "Practicalo con personas que te molestan: ahi es donde mas aprendes",
    ],
  },
] as const satisfies readonly HabitSeed[];
