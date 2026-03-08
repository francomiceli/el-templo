/**
 * Curated facto catalog for El Templo lifestyle module.
 *
 * 42 factos curated from Arete's 60 universal factos (f01-f60),
 * prioritized by El Templo brand fit: stoic warriors, classical philosophy,
 * temple/warrior identity.
 *
 * All 20 Arete-specific factos (f61-f80, Mediterranean wellness / feminine focus)
 * are excluded -- not El Templo's brand.
 *
 * All text in rioplatense Spanish, warm tone, no emojis.
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
    | "deporte";
}

// ---------------------------------------------------------------------------
// Catalog (42 curated factos)
// ---------------------------------------------------------------------------

export const FACTO_SEEDS = [
  // -------------------------------------------------------------------------
  // Marco Aurelio (6) -- core stoic emperor, perfect fit
  // -------------------------------------------------------------------------
  {
    id: "f01",
    text: "Marco Aurelio escribia sus Meditaciones cada noche en su tienda de campana durante las guerras marcomanas, convirtiendo la reflexion diaria en su arma mas poderosa.",
    source: "Meditaciones",
    figure: "Marco Aurelio",
    era: "Roma Imperial",
    category: "filosofia",
  },
  {
    id: "f02",
    text: "Marco Aurelio goberno Roma durante una pandemia que mato a cinco millones de personas. En lugar de esconderse, recorrio las provincias personalmente para organizar la respuesta.",
    source: "Historia Augusta",
    figure: "Marco Aurelio",
    era: "Roma Imperial",
    category: "politica",
  },
  {
    id: "f04",
    text: "A los once anos, Marco Aurelio adopto la capa aspera de los filosofos y dormia en el suelo. Su madre le rogo que volviera a la cama; el acepto solo para no preocuparla.",
    source: "Meditaciones",
    figure: "Marco Aurelio",
    era: "Roma Imperial",
    category: "filosofia",
  },
  {
    id: "f05",
    text: 'Marco Aurelio escribio: "Al amanecer, cuando te cueste levantarte, pensa: me despierto para hacer el trabajo de un ser humano." Lo decia un emperador que podia quedarse en la cama.',
    source: "Meditaciones, V.1",
    figure: "Marco Aurelio",
    era: "Roma Imperial",
    category: "filosofia",
  },
  {
    id: "f09",
    text: "Marco Aurelio entrenaba con gladiadores reales usando armas de madera. Creia que un emperador que no conoce el esfuerzo fisico no puede pedir sacrificios a sus soldados.",
    source: "Historia Augusta",
    figure: "Marco Aurelio",
    era: "Roma Imperial",
    category: "deporte",
  },
  {
    id: "f10",
    text: "Marco Aurelio nunca inicio una guerra ofensiva. Todas sus campanas fueron defensivas. Decia que la verdadera victoria es la que no necesita ser peleada.",
    source: "Meditaciones",
    figure: "Marco Aurelio",
    era: "Roma Imperial",
    category: "guerra",
  },

  // -------------------------------------------------------------------------
  // Seneca (5) -- core stoic philosopher, perfect fit
  // -------------------------------------------------------------------------
  {
    id: "f11",
    text: "Seneca practicaba la premeditatio malorum: cada manana imaginaba los peores escenarios posibles para que nada del dia pudiera sorprenderlo.",
    source: "Cartas a Lucilio",
    figure: "Seneca",
    era: "Roma Imperial",
    category: "filosofia",
  },
  {
    id: "f13",
    text: "Seneca era uno de los hombres mas ricos de Roma, pero una vez al mes vivia como un pobre: comida simple, ropa aspera, cama dura. Decia que asi la pobreza nunca podria asustarlo.",
    source: "Cartas a Lucilio, XVIII",
    figure: "Seneca",
    era: "Roma Imperial",
    category: "filosofia",
  },
  {
    id: "f14",
    text: "Seneca escribio que no es que tengamos poco tiempo, sino que perdemos mucho. La vida es larga si sabes usarla.",
    source: "Sobre la brevedad de la vida",
    figure: "Seneca",
    era: "Roma Imperial",
    category: "filosofia",
  },
  {
    id: "f17",
    text: "Seneca caminaba todos los dias sin importar el clima. Decia que el movimiento del cuerpo aclara las ideas que el sedentarismo oscurece.",
    source: "Cartas a Lucilio, XV",
    figure: "Seneca",
    era: "Roma Imperial",
    category: "deporte",
  },
  {
    id: "f18",
    text: "Seneca revisaba su dia cada noche en silencio, repasando cada accion y cada palabra. Lo llamaba su tribunal privado.",
    source: "De la Ira, III",
    figure: "Seneca",
    era: "Roma Imperial",
    category: "filosofia",
  },

  // -------------------------------------------------------------------------
  // Epicteto (4) -- core stoic, perfect fit
  // -------------------------------------------------------------------------
  {
    id: "f19",
    text: "Epicteto, nacido esclavo, enseno que la libertad absoluta reside en lo unico que controlamos: nuestra respuesta a lo que sucede.",
    source: "Discursos",
    figure: "Epicteto",
    era: "Roma Imperial",
    category: "filosofia",
  },
  {
    id: "f20",
    text: 'El amo de Epicteto le retorcio la pierna como castigo. Epicteto le dijo con calma: "La vas a romper." Cuando se rompio, anadio: "Te dije que la ibas a romper." Nunca grito.',
    source: "Discursos",
    figure: "Epicteto",
    era: "Roma Imperial",
    category: "filosofia",
  },
  {
    id: "f21",
    text: 'Epicteto vivia en una choza con una estera, un banco y una lampara de barro. Cuando le robaron la lampara, dijo: "El ladron se va a llevar una sorpresa manana cuando busque algo mas."',
    source: "Discursos",
    figure: "Epicteto",
    era: "Roma Imperial",
    category: "filosofia",
  },
  {
    id: "f22",
    text: "Epicteto ensenaba que sufrimos no por los eventos, sino por nuestros juicios sobre ellos. Veinte siglos despues, la terapia cognitiva redescubrio el mismo principio.",
    source: "Enchiridion",
    figure: "Epicteto",
    era: "Roma Imperial",
    category: "filosofia",
  },

  // -------------------------------------------------------------------------
  // Socrates (4) -- foundation of Western philosophy
  // -------------------------------------------------------------------------
  {
    id: "f25",
    text: "Socrates caminaba descalzo por Atenas en invierno para probar que la incomodidad es una opinion, no un hecho.",
    source: "El Banquete",
    figure: "Socrates",
    era: "Grecia Clasica",
    category: "filosofia",
  },
  {
    id: "f26",
    text: "Socrates fue declarado el hombre mas sabio por el Oraculo de Delfos. Su respuesta fue dedicar el resto de su vida a demostrar que no sabia nada.",
    source: "Apologia",
    figure: "Socrates",
    era: "Grecia Clasica",
    category: "filosofia",
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
    id: "f28",
    text: "Cuando le ofrecieron escapar de la prision, Socrates se nego. Dijo que un hombre que huye de la ley que acepto toda su vida no merece llamarse justo.",
    source: "Criton",
    figure: "Socrates",
    era: "Grecia Clasica",
    category: "filosofia",
  },

  // -------------------------------------------------------------------------
  // Platon (2) -- f30 (Academia), f31 (wrestler)
  // -------------------------------------------------------------------------
  {
    id: "f30",
    text: "Platon fundo la Academia, la primera universidad del mundo occidental. Funciono ininterrumpidamente durante 900 anos.",
    source: "Vidas de los Filosofos",
    figure: "Platon",
    era: "Grecia Clasica",
    category: "ciencia",
  },
  {
    id: "f31",
    text: 'Platon era luchador antes que filosofo. Compitio en los Juegos Istmicos y su nombre real era Aristocles; "Platon" era su apodo por sus hombros anchos.',
    source: "Vidas de los Filosofos",
    figure: "Platon",
    era: "Grecia Clasica",
    category: "deporte",
  },

  // -------------------------------------------------------------------------
  // Aristoteles (3) -- f33 (peripatetics), f34 (habits), f36 (virtue/mean)
  // -------------------------------------------------------------------------
  {
    id: "f33",
    text: "Aristoteles ensenaba caminando. Sus alumnos, los peripateticos, recorrian los jardines del Liceo mientras debatian. Para el, pensar y moverse eran inseparables.",
    source: "Vidas de los Filosofos",
    figure: "Aristoteles",
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
    id: "f36",
    text: "Aristoteles ensenaba que la virtud esta en el punto medio: la valentia entre la cobardia y la temeridad, la generosidad entre la avaricia y el derroche.",
    source: "Etica Nicomaquea",
    figure: "Aristoteles",
    era: "Grecia Clasica",
    category: "filosofia",
  },

  // -------------------------------------------------------------------------
  // Alejandro Magno (2) -- f37 (Iliada), f38 (water in desert)
  // -------------------------------------------------------------------------
  {
    id: "f37",
    text: "Alejandro Magno dormia con la Iliada bajo la almohada. Decia que Aquiles era su modelo, pero a diferencia de Aquiles, el elegia la disciplina sobre la ira.",
    source: "Vidas Paralelas",
    figure: "Alejandro Magno",
    era: "Helenismo",
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

  // -------------------------------------------------------------------------
  // Leonidas y Esparta (3) -- warrior ethos, core brand
  // -------------------------------------------------------------------------
  {
    id: "f40",
    text: "Los espartanos entrenaban descalzos en la nieve para que ninguna incomodidad del campo de batalla les resultara nueva.",
    source: "Vidas Paralelas",
    figure: "Plutarco",
    era: "Grecia Clasica",
    category: "guerra",
  },
  {
    id: "f41",
    text: 'Leonidas desayuno con sus 300 sabiendo que era su ultima comida. Les dijo: "Coman bien, porque esta noche cenaremos en el Hades." Ninguno dejo de comer.',
    source: "Vidas Paralelas",
    figure: "Leonidas",
    era: "Grecia Clasica",
    category: "guerra",
  },
  {
    id: "f42",
    text: 'Las madres espartanas les decian a sus hijos al partir a la guerra: "Con el escudo o sobre el." Volver sin escudo significaba haberlo tirado para correr mas rapido.',
    source: "Moralia",
    figure: "Plutarco",
    era: "Grecia Clasica",
    category: "guerra",
  },

  // -------------------------------------------------------------------------
  // Diogenes (2) -- radical simplicity, strong brand fit
  // -------------------------------------------------------------------------
  {
    id: "f44",
    text: "Diogenes vivia en una tinaja de ceramica en el mercado de Atenas. Cuando le preguntaron por que, dijo que queria demostrar cuanto se puede eliminar sin perder lo esencial.",
    source: "Vidas de los Filosofos",
    figure: "Diogenes",
    era: "Grecia Clasica",
    category: "filosofia",
  },
  {
    id: "f45",
    text: 'Diogenes caminaba por Atenas con una lampara encendida a plena luz del dia. Cuando le preguntaron que buscaba, respondio: "Un ser humano honesto."',
    source: "Vidas de los Filosofos",
    figure: "Diogenes",
    era: "Grecia Clasica",
    category: "filosofia",
  },

  // -------------------------------------------------------------------------
  // Heraclito (1) -- f47 (river/change, iconic)
  // -------------------------------------------------------------------------
  {
    id: "f47",
    text: "Heraclito escribio que nadie se bana dos veces en el mismo rio. El agua cambia, pero tambien la persona que entra. El cambio constante no es el enemigo: es la unica constante.",
    source: "Fragmentos",
    figure: "Heraclito",
    era: "Grecia Clasica",
    category: "filosofia",
  },

  // -------------------------------------------------------------------------
  // Pitagoras (1) -- f49 (5 years silence)
  // -------------------------------------------------------------------------
  {
    id: "f49",
    text: "Pitagoras exigia a sus alumnos cinco anos de silencio antes de poder hablar en clase. Decia que la primera disciplina del pensador es saber callar.",
    source: "Vidas de los Filosofos",
    figure: "Pitagoras",
    era: "Grecia Clasica",
    category: "filosofia",
  },

  // -------------------------------------------------------------------------
  // Hipatia (2) -- science/wisdom, good diversity
  // -------------------------------------------------------------------------
  {
    id: "f51",
    text: "Hipatia de Alejandria ensenaba matematicas, astronomia y filosofia en un mundo que no se lo facilitaba. Sus alumnos incluian paganos, cristianos y judios por igual.",
    source: "Suda",
    figure: "Hipatia",
    era: "Roma Imperial",
    category: "ciencia",
  },
  {
    id: "f52",
    text: "Hipatia perfecciono el astrolabio, el instrumento que permitia a los navegantes calcular su posicion con las estrellas. Su precision era virtud convertida en herramienta.",
    source: "Suda",
    figure: "Hipatia",
    era: "Roma Imperial",
    category: "ciencia",
  },

  // -------------------------------------------------------------------------
  // Zenon de Citio (2) -- founder of Stoicism
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Caton el Joven (3) -- stoic politician/warrior
  // -------------------------------------------------------------------------
  {
    id: "f56",
    text: "Caton el Joven caminaba por Roma descalzo y con ropa simple cuando todos los senadores competian en lujo. No lo hacia por pobreza sino por principio.",
    source: "Vidas Paralelas",
    figure: "Caton el Joven",
    era: "Roma Republicana",
    category: "politica",
  },
  {
    id: "f57",
    text: "Caton leia el Fedon de Platon la noche antes de su muerte. Lo leyo dos veces completo. Despues tomo su decision con la misma calma con la que habia pasado las paginas.",
    source: "Vidas Paralelas",
    figure: "Caton el Joven",
    era: "Roma Republicana",
    category: "filosofia",
  },
  {
    id: "f58",
    text: "Caton marchaba a pie junto a sus soldados en lugar de montar a caballo. Decia que un lider que no comparte las dificultades de su tropa no merece su lealtad.",
    source: "Vidas Paralelas",
    figure: "Caton el Joven",
    era: "Roma Republicana",
    category: "guerra",
  },

  // -------------------------------------------------------------------------
  // Tales de Mileto (1) -- knowledge as weapon
  // -------------------------------------------------------------------------
  {
    id: "f59",
    text: "Tales de Mileto predijo un eclipse solar en el 585 a.C. y detuvo una guerra entre lidios y medos. A veces, el conocimiento es la unica arma que necesitas.",
    source: "Historias",
    figure: "Tales de Mileto",
    era: "Grecia Clasica",
    category: "ciencia",
  },

  // -------------------------------------------------------------------------
  // Cineas (1) -- great philosophical question
  // -------------------------------------------------------------------------
  {
    id: "f60",
    text: 'Cineas le pregunto a Pirro: "Cuando conquistes Roma, que haras?" "Descansar." "Y por que no descansas ahora?" La mejor pregunta que un consejero le hizo a un rey.',
    source: "Vidas Paralelas",
    figure: "Cineas",
    era: "Helenismo",
    category: "politica",
  },
] as const satisfies readonly FactoSeed[];
