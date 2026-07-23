/**
 * Frases de cierre del PDF de sesión.
 *
 * Cada frase viene partida en dos: `text` se imprime en navy y `goldText` es el
 * remate en dorado. El corte es editorial — define dónde cae el golpe visual —
 * así que al reemplazar una frase hay que elegir el punto de corte a mano.
 * `goldText` vacío imprime la frase entera en navy (sirve para las muy cortas).
 *
 * `text` termina en espacio cuando sigue un remate: los dos tramos se
 * concatenan sin separador al renderizar (ver buildClosingPage).
 *
 * Las comillas van como escapes \u201C / \u201D (mismo criterio que tenía el
 * builder antes de esta extracción) para que no dependan del editor ni de la
 * codificación del archivo. Los acentos sí van literales.
 *
 * Rotan por `semana * 7 + día`, así que con 10 frases el ciclo se repite cada
 * 10 días de sesión.
 */
export interface SessionQuote {
  text: string;
  goldText: string;
  author: string;
}

/** Tanda vigente desde 2026-07 (reemplazó a RETIRED_QUOTES). */
export const QUOTES: SessionQuote[] = [
  {
    text: '\u201CLA FORTUNA FAVORECE A ',
    goldText: 'LOS AUDACES.\u201D',
    author: 'Virgilio.',
  },
  {
    text: '\u201CNO NOS ATREVEMOS A MUCHAS COSAS PORQUE SON DIFÍCILES, ',
    goldText: 'PERO SON DIFÍCILES PORQUE NO NOS ATREVEMOS A HACERLAS.\u201D',
    author: 'Séneca.',
  },
  {
    text: '\u201CLA VIDA SE CONTRAE O SE EXPANDE ',
    goldText: 'EN PROPORCIÓN A NUESTRO CORAJE.\u201D',
    author: 'Anaïs Nin.',
  },
  {
    text: '\u201CQUIEN MUEVE UNA MONTAÑA ',
    goldText: 'COMIENZA MOVIENDO PEQUEÑAS PIEDRAS.\u201D',
    author: 'Confucio.',
  },
  {
    text: '\u201CLA CREATIVIDAD REQUIERE TENER EL VALOR ',
    goldText: 'DE DESPRENDERSE DE LAS CERTEZAS.\u201D',
    author: 'Erich Fromm.',
  },
  {
    text: '\u201CLA VIDA SOLO PUEDE SER COMPRENDIDA MIRANDO HACIA ATRÁS, ',
    goldText: 'PERO HA DE SER VIVIDA MIRANDO HACIA ADELANTE.\u201D',
    author: 'Søren Kierkegaard.',
  },
  {
    text: '\u201CEN CUALQUIER MOMENTO PODEMOS ELEGIR ENTRE ',
    goldText: 'AVANZAR HACIA EL CRECIMIENTO O RETROCEDER HACIA LA SEGURIDAD.\u201D',
    author: 'Abraham Maslow.',
  },
  {
    text: '\u201CHASTA QUE LO INCONSCIENTE SE HAGA CONSCIENTE, ',
    goldText: 'DIRIGIRÁ TU VIDA Y LO LLAMARÁS DESTINO.\u201D',
    author: 'Carl Jung.',
  },
  {
    text: '\u201CLA BUENA VIDA ES UN PROCESO, NO UN ESTADO DEL SER. ',
    goldText: 'ES UNA DIRECCIÓN, NO UN DESTINO.\u201D',
    author: 'Carl Rogers.',
  },
  {
    text: '\u201CLA RAÍZ ES QUIZÁS ',
    goldText: 'LA NECESIDAD MÁS IMPORTANTE Y MÁS DESCONOCIDA DEL ALMA HUMANA.\u201D',
    author: 'Simone Weil.',
  },
];

/**
 * Tanda anterior, retirada en 2026-07. Se guarda entera (con su corte navy/oro
 * original) para poder volver a rotarla sin tener que reconstruir los cortes.
 * No se importa desde ningún lado a propósito: es un archivo, no una fuente
 * activa. Para reponerla, mové las entradas que quieras a QUOTES.
 */
export const RETIRED_QUOTES: SessionQuote[] = [
  {
    text: '\u201CLAS CADENAS DE LA DISCIPLINA SON LIGERAS COMPARADAS CON ',
    goldText: 'EL PESO DEL ARREPENTIMIENTO.\u201D',
    author: 'Jim Rohn.',
  },
  {
    text: '\u201CES UNA PENA ENVEJECER SIN NUNCA VER ',
    goldText: 'LA BELLEZA Y LA FUERZA DE LA QUE TU CUERPO ES CAPAZ.\u201D',
    author: 'Sócrates.',
  },
  {
    text: '\u201CLOS OBSTÁCULOS SON ESAS COSAS ESPANTOSAS QUE VES ',
    goldText: 'CUANDO APARTAS LOS OJOS DE TU META.\u201D',
    author: 'Henry Ford.',
  },
  { text: '\u201CVENI, VIDI, VICI.\u201D', goldText: '', author: 'Julio César.' },
  {
    text: '\u201CEL QUE TIENE UN PORQUÉ PARA VIVIR ',
    goldText: 'PUEDE SOPORTAR CASI CUALQUIER CÓMO.\u201D',
    author: 'Friedrich Nietzsche.',
  },
  { text: '\u201CNO EXPLIQUES TU FILOSOFÍA. ', goldText: 'ENCÁRNALA.\u201D', author: 'Epicteto.' },
  {
    text: '\u201CLA VERDADERA GENEROSIDAD HACIA EL FUTURO CONSISTE EN ',
    goldText: 'ENTREGARLO TODO AL PRESENTE.\u201D',
    author: 'Albert Camus.',
  },
  {
    text: '\u201CTODO LO QUE HACEMOS REPETIDAMENTE NOS DEFINE. ',
    goldText: 'LA EXCELENCIA ES UN HÁBITO.\u201D',
    author: 'Aristóteles.',
  },
  {
    text: '\u201CATREVERSE ES PERDER EL EQUILIBRIO MOMENTÁNEAMENTE; ',
    goldText: 'NO ATREVERSE ES PERDERSE A UNO MISMO.\u201D',
    author: 'Søren Kierkegaard.',
  },
  {
    text: '\u201CEL VERDADERO MÉTODO SIGUE ',
    goldText: 'LA NATURALEZA DE LAS COSAS.\u201D',
    author: 'Edmund Husserl.',
  },
];
