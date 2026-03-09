/**
 * Curated facto catalog for El Templo lifestyle module.
 *
 * 46 factos curated from arete-web's 160-facto canonical catalog.
 * Source pool: 134 'both' + 38 'arete' = 172 eligible (0 'aurea').
 *
 * Category distribution:
 *   filosofia(14), ciencia(9), bienestar(7), guerra(6), politica(5), arte(4), deporte(1)
 *
 * Curation criteria:
 * - Diverse category spread (not philosophy-heavy)
 * - Greek/classical bias with some modern science for variety
 * - Broad figure diversity (not concentrated on a few philosophers)
 * - Brand field dropped -- all content is El Templo content now
 *
 * All text in rioplatense Spanish, warm tone, no emojis.
 *
 * @see Phase 46 -- Lifestyle Content Extraction (REDO from arete-web)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FactoSeed {
  readonly id: string;
  readonly text: string;
  readonly source: string;
  readonly figure: string;
  readonly era: string;
  readonly category:
    | "filosofia"
    | "guerra"
    | "politica"
    | "ciencia"
    | "arte"
    | "deporte"
    | "bienestar";
}

// ---------------------------------------------------------------------------
// Catalog (46 curated factos)
// ---------------------------------------------------------------------------

export const FACTO_SEEDS = [
  // -------------------------------------------------------------------------
  // FILOSOFIA (14)
  // -------------------------------------------------------------------------
  {
    id: "f01",
    text: "Aristoteles caminaba con sus alumnos por los jardines del Liceo mientras ensenaba. Los llamaban los peripateticos, los que caminan. Para el, el cuerpo en movimiento era condicion del pensamiento claro.",
    source: "Vidas de los Filosofos",
    figure: "Aristoteles",
    era: "Grecia Clasica",
    category: "filosofia",
  },
  {
    id: "f02",
    text: "Socrates recorria el agora de Atenas descalzo, dialogando con cualquiera que se cruzara: zapateros, generales, poetas. Creia que la filosofia no pertenece a una elite sino a la calle.",
    source: "Apologia",
    figure: "Socrates",
    era: "Grecia Clasica",
    category: "filosofia",
  },
  {
    id: "f04",
    text: "Heraclito rechazo gobernar Efeso, una de las ciudades mas ricas de Jonia, para dedicarse a pensar en soledad. Decia que la mayoria vive dormida y que despertar exige alejarse del ruido.",
    source: "Fragmentos",
    figure: "Heraclito",
    era: "Grecia Clasica",
    category: "filosofia",
  },
  {
    id: "f06",
    text: "Pitagoras exigia a sus nuevos alumnos cinco anos de silencio absoluto antes de poder hablar en clase. Creia que aprender a escuchar es la primera disciplina de cualquier pensador serio.",
    source: "Vidas de los Filosofos",
    figure: "Pitagoras",
    era: "Grecia Clasica",
    category: "filosofia",
  },
  {
    id: "f09",
    text: "Diogenes vivia en una tinaja en el agora de Atenas y se banaba en fuentes publicas. Lo acusaban de loco, pero el decia que la locura verdadera es trabajar toda la vida para comprar cosas que no necesitas.",
    source: "Vidas de los Filosofos",
    figure: "Diogenes",
    era: "Grecia Clasica",
    category: "filosofia",
  },
  {
    id: "f22",
    text: "Socrates ensenaba que sufrimos no por los eventos sino por nuestros juicios sobre ellos. Veinte siglos despues, la terapia cognitiva redescubrio el mismo principio y lo llamo reestructuracion cognitiva.",
    source: "Apologia",
    figure: "Socrates",
    era: "Grecia Clasica",
    category: "filosofia",
  },
  {
    id: "f25",
    text: "Socrates caminaba descalzo por Atenas en invierno para probar que la incomodidad es una opinion, no un hecho.",
    source: "El Banquete",
    figure: "Socrates",
    era: "Grecia Clasica",
    category: "filosofia",
  },
  {
    id: "f28",
    text: "Cuando le ofrecieron escapar de la prision, Socrates se nego. Dijo que un hombre que huye de la ley que acepto toda su vida no merece llamarse justo.",
    source: "Criton",
    figure: "Socrates",
    era: "Grecia Clasica",
    category: "filosofia",
  },
  {
    id: "f34",
    text: "Aristoteles escribio que somos lo que hacemos repetidamente. La excelencia no es un acto, sino un habito. Lo dijo 2.400 anos antes de la ciencia del comportamiento.",
    source: "Etica Nicomaquea",
    figure: "Aristoteles",
    era: "Grecia Clasica",
    category: "filosofia",
  },
  {
    id: "f39",
    text: 'Cuando Alejandro visito a Diogenes y le pregunto que deseaba, el filosofo le respondio: "Que te corras, me estas tapando el sol." Alejandro dijo: "Si no fuera Alejandro, querria ser Diogenes."',
    source: "Vidas Paralelas",
    figure: "Alejandro Magno",
    era: "Helenismo",
    category: "filosofia",
  },
  {
    id: "f47",
    text: "Heraclito escribio que nadie se bana dos veces en el mismo rio. El agua cambia, pero tambien la persona que entra. El cambio constante no es el enemigo: es la unica constante.",
    source: "Fragmentos",
    figure: "Heraclito",
    era: "Grecia Clasica",
    category: "filosofia",
  },
  {
    id: "f53",
    text: "Zenon de Citio fundo el estoicismo en un portico pintado (la Stoa). Ensenaba gratis a cualquiera que se acercara. La filosofia mas influyente de Roma nacio en una vereda.",
    source: "Vidas de los Filosofos",
    figure: "Zenon de Citio",
    era: "Helenismo",
    category: "filosofia",
  },
  {
    id: "f54",
    text: 'Zenon perdio toda su fortuna en un naufragio. Dijo: "La fortuna me ordena filosofar con menos equipaje." Del desastre nacio una escuela que duro 500 anos.',
    source: "Vidas de los Filosofos",
    figure: "Zenon de Citio",
    era: "Helenismo",
    category: "filosofia",
  },
  {
    id: "f101",
    text: "Los griegos distinguian entre chronos (tiempo cuantitativo) y kairos (el momento oportuno). No se trata de cuanto tiempo tenes, sino de saber cuando actuar y cuando esperar.",
    source: "Retorica",
    figure: "Aristoteles",
    era: "Grecia Clasica",
    category: "filosofia",
  },

  // -------------------------------------------------------------------------
  // CIENCIA (9)
  // -------------------------------------------------------------------------
  {
    id: "f07",
    text: "Tales de Mileto cayo en un pozo mientras miraba las estrellas. Una sirvienta tracia se rio de el. Pero ese mismo Tales predijo un eclipse solar y detuvo una guerra entre lidios y medos en el 585 a.C.",
    source: "Teeteto / Historias",
    figure: "Tales de Mileto",
    era: "Grecia Clasica",
    category: "ciencia",
  },
  {
    id: "f08",
    text: "Democrito viajo por Egipto, Persia, Etiopia y la India buscando conocimiento. Gasto toda su herencia en el viaje y volvio sin un centavo pero con una filosofia atomica que anticipo la fisica moderna por dos milenios.",
    source: "Vidas de los Filosofos",
    figure: "Democrito",
    era: "Grecia Clasica",
    category: "ciencia",
  },
  {
    id: "f10",
    text: "Hipatia de Alejandria ensenaba matematicas, astronomia y filosofia en una epoca que no se lo facilitaba. Sus clases reunian a paganos, cristianos y judios. El conocimiento era su unico dogma.",
    source: "Suda",
    figure: "Hipatia",
    era: "Antiguedad tardia",
    category: "ciencia",
  },
  {
    id: "f24",
    text: "Hipatia perfecciono el astrolabio, el instrumento que permitia a los navegantes calcular su posicion mirando las estrellas. Su precision era virtud convertida en herramienta, conocimiento hecho objeto.",
    source: "Suda",
    figure: "Hipatia",
    era: "Antiguedad tardia",
    category: "ciencia",
  },
  {
    id: "f30",
    text: "Platon fundo la Academia, la primera universidad del mundo occidental. Funciono ininterrumpidamente durante 900 anos.",
    source: "Vidas de los Filosofos",
    figure: "Platon",
    era: "Grecia Clasica",
    category: "ciencia",
  },
  {
    id: "f83",
    text: "Caminar 30 minutos al dia aumenta el volumen del hipocampo, la region del cerebro responsable de la memoria. Los griegos que filosofaban caminando estimulaban su cerebro sin saberlo.",
    source: "PNAS, 2011",
    figure: "Kirk Erickson",
    era: "Contemporanea",
    category: "ciencia",
  },
  {
    id: "f90",
    text: "La gratitud activa la corteza prefrontal y libera dopamina y serotonina. Escribir tres cosas por las que estas agradecido antes de dormir cambia literalmente la quimica de tu cerebro.",
    source: "Journal of Personality and Social Psychology",
    figure: "Robert Emmons",
    era: "Contemporanea",
    category: "ciencia",
  },
  {
    id: "f94",
    text: "La meditacion regular aumenta la densidad de materia gris en areas asociadas al autocontrol y la empatia. Ocho semanas bastan para que el cerebro muestre cambios medibles.",
    source: "Psychiatry Research: Neuroimaging",
    figure: "Sara Lazar",
    era: "Contemporanea",
    category: "ciencia",
  },
  {
    id: "f119",
    text: "Se necesitan en promedio 66 dias para que un comportamiento nuevo se automatice, no los 21 que dice el mito. La paciencia con uno mismo es parte del proceso, no un obstaculo.",
    source: "European Journal of Social Psychology",
    figure: "Phillippa Lally",
    era: "Contemporanea",
    category: "ciencia",
  },

  // -------------------------------------------------------------------------
  // BIENESTAR (7)
  // -------------------------------------------------------------------------
  {
    id: "f73",
    text: 'Hipocrates prescribia caminatas, buena alimentacion y descanso antes que cualquier remedio. Decia: "Que tu alimento sea tu medicina y tu medicina sea tu alimento." La base de la salud es lo cotidiano.',
    source: "Aforismos",
    figure: "Hipocrates",
    era: "Grecia Clasica",
    category: "bienestar",
  },
  {
    id: "f76",
    text: "Hipocrates recomendaba respiraciones lentas y profundas para calmar la ansiedad. Dos mil anos despues, la neurociencia confirmo que activar el nervio vago regula el estres. La sabiduria griega se adelanto a la ciencia.",
    source: "Aforismos",
    figure: "Hipocrates",
    era: "Grecia Clasica",
    category: "bienestar",
  },
  {
    id: "f84",
    text: "La exposicion a la luz solar matutina durante 10 minutos sincroniza el reloj circadiano y mejora la calidad del sueno esa noche. Los antiguos que despertaban con el sol lo hacian por instinto y por sabiduria.",
    source: "Journal of Clinical Sleep Medicine",
    figure: "Andrew Huberman",
    era: "Contemporanea",
    category: "bienestar",
  },
  {
    id: "f87",
    text: "Masticar lentamente mejora la digestion, reduce la ansiedad y aumenta la saciedad. Los banquetes griegos duraban horas no por gula sino porque entendian que comer rapido es comer sin consciencia.",
    source: "American Journal of Clinical Nutrition",
    figure: "Tradicion griega",
    era: "Contemporanea",
    category: "bienestar",
  },
  {
    id: "f92",
    text: "El contacto con la tierra descalzo reduce los niveles de cortisol y mejora la variabilidad cardiaca. Los filosofos griegos ensenaban descalzos no por pobreza sino por conexion.",
    source: "Journal of Environmental and Public Health",
    figure: "Tradicion griega",
    era: "Contemporanea",
    category: "bienestar",
  },
  {
    id: "f95",
    text: "Las comunidades mediterraneas con mayor longevidad comparten tres habitos: caminan a diario, comen en compania y duermen siesta. Ningun farmaco reproduce esa combinacion.",
    source: "The Blue Zones",
    figure: "Dan Buettner",
    era: "Contemporanea",
    category: "bienestar",
  },
  {
    id: "f100",
    text: "Pasar dos horas semanales en la naturaleza mejora significativamente la salud mental y fisica, independientemente de la actividad. No hace falta escalar una montana: un parque alcanza.",
    source: "Scientific Reports, 2019",
    figure: "Mathew White",
    era: "Contemporanea",
    category: "bienestar",
  },

  // -------------------------------------------------------------------------
  // GUERRA (6)
  // -------------------------------------------------------------------------
  {
    id: "f15",
    text: "Alejandro Magno dormia con la Iliada bajo la almohada y llevaba una copia anotada por Aristoteles, su maestro, a cada campana. Decia que Aquiles era su modelo pero que la disciplina vale mas que la ira.",
    source: "Vidas Paralelas",
    figure: "Alejandro Magno",
    era: "Helenismo",
    category: "guerra",
  },
  {
    id: "f17",
    text: 'Leonidas desayuno con sus 300 sabiendo que era su ultima comida. Les dijo: "Coman bien, porque esta noche cenaremos en el Hades." Ninguno se levanto de la mesa.',
    source: "Vidas Paralelas",
    figure: "Leonidas",
    era: "Grecia Clasica",
    category: "guerra",
  },
  {
    id: "f27",
    text: "Socrates peleo como hoplita en Potidea, Anfipolis y Delio. Sus companeros decian que era el ultimo en retirarse y el primero en compartir su racion.",
    source: "El Banquete",
    figure: "Socrates",
    era: "Grecia Clasica",
    category: "guerra",
  },
  {
    id: "f38",
    text: "En el desierto de Gedrosia, un soldado le ofrecio agua a Alejandro en su casco. El la derramo en la arena frente a todo el ejercito: si sus hombres tenian sed, el tambien.",
    source: "Vidas Paralelas",
    figure: "Alejandro Magno",
    era: "Helenismo",
    category: "guerra",
  },
  {
    id: "f40",
    text: "Los espartanos entrenaban descalzos en la nieve para que ninguna incomodidad del campo de batalla les resultara nueva.",
    source: "Vidas Paralelas",
    figure: "Plutarco",
    era: "Grecia Clasica",
    category: "guerra",
  },
  {
    id: "f133",
    text: "Leonidas eligio el paso de las Termopilas porque ahi la superioridad numerica persa no servia de nada. Trescientos hombres bien posicionados detuvieron un imperio. La estrategia vale mas que los numeros.",
    source: "Historias",
    figure: "Herodoto",
    era: "Grecia Clasica",
    category: "guerra",
  },

  // -------------------------------------------------------------------------
  // POLITICA (5)
  // -------------------------------------------------------------------------
  {
    id: "f03",
    text: "Platon viajo a Siracusa tres veces intentando convertir al tirano Dionisio en un rey filosofo. Fracaso las tres veces, pero nunca dejo de creer que la educacion puede transformar hasta al peor gobernante.",
    source: "Carta VII",
    figure: "Platon",
    era: "Grecia Clasica",
    category: "politica",
  },
  {
    id: "f12",
    text: "Pericles goberno la Atenas dorada durante treinta anos sin ningun titulo oficial. Su autoridad venia del respeto, no del cargo. Lideraba porque la gente elegia escucharlo, no porque estuviera obligada.",
    source: "Historia de la Guerra del Peloponeso",
    figure: "Pericles",
    era: "Grecia Clasica",
    category: "politica",
  },
  {
    id: "f60",
    text: 'Cineas le pregunto a Pirro: "Cuando conquistes Roma, que haras?" "Descansar." "Y por que no descansas ahora?" La mejor pregunta que un consejero le hizo a un rey.',
    source: "Vidas Paralelas",
    figure: "Cineas",
    era: "Helenismo",
    category: "politica",
  },
  {
    id: "f131",
    text: "Solon de Atenas viajo por Egipto y Lidia buscando leyes justas para su ciudad. Cuando volvio, reformo la constitucion ateniense y se exilio voluntariamente para que nadie pudiera presionarlo a cambiarla.",
    source: "Vidas Paralelas",
    figure: "Plutarco",
    era: "Grecia Clasica",
    category: "politica",
  },
  {
    id: "f145",
    text: "Licurgo, el legislador espartano, prohibio las monedas de oro y plata en Esparta. Impuso monedas de hierro tan pesadas que nadie podia acumular riqueza. Quito el incentivo a la codicia por diseno.",
    source: "Vida de Licurgo",
    figure: "Plutarco",
    era: "Grecia Clasica",
    category: "politica",
  },

  // -------------------------------------------------------------------------
  // ARTE (4)
  // -------------------------------------------------------------------------
  {
    id: "f05",
    text: 'Safo de Lesbos fue llamada "la decima musa" por Platon. Su poesia era tan admirada que los griegos la consideraban a la par de Homero, algo impensable en una epoca dominada por voces masculinas.',
    source: "Antologia Palatina",
    figure: "Safo",
    era: "Grecia Arcaica",
    category: "arte",
  },
  {
    id: "f14",
    text: "Homero era, segun la tradicion, un poeta ciego que recitaba de memoria miles de versos. La Iliada y la Odisea fueron la Biblia de los griegos: todo nino las aprendia, todo general las citaba, todo filosofo las debatia.",
    source: "Tradicion homerica",
    figure: "Homero",
    era: "Grecia Arcaica",
    category: "arte",
  },
  {
    id: "f18",
    text: "Penelope tejia y destejia cada noche durante veinte anos mientras esperaba a Odiseo. No era pasividad: era la estrategia mas brillante del poema. Con paciencia e ingenio, mantuvo el control de su casa frente a cien pretendientes armados.",
    source: "Odisea",
    figure: "Penelope",
    era: "Grecia Arcaica",
    category: "arte",
  },
  {
    id: "f142",
    text: "Demostenes, el mayor orador de Atenas, tartamudeaba de chico. Se ponia piedras en la boca y recitaba frente al mar para superar su defecto. La elocuencia que el mundo admiro fue fabricada con disciplina.",
    source: "Vidas Paralelas",
    figure: "Plutarco",
    era: "Grecia Clasica",
    category: "arte",
  },

  // -------------------------------------------------------------------------
  // DEPORTE (1)
  // -------------------------------------------------------------------------
  {
    id: "f31",
    text: 'Platon era luchador antes que filosofo. Compitio en los Juegos Istmicos y su nombre real era Aristocles; "Platon" era su apodo por sus hombros anchos.',
    source: "Vidas de los Filosofos",
    figure: "Platon",
    era: "Grecia Clasica",
    category: "deporte",
  },
] as const satisfies readonly FactoSeed[];
