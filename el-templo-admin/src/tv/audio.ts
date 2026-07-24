/**
 * Beeps del kiosco (D-19).
 *
 * Son una MEJORA OPCIONAL, nunca un requisito: arrancan apagados y los prende el profe
 * desde el celular. Todo el archivo esta escrito con esa premisa —
 *
 *  - Un televisor puede no tener WebAudio (el motor viejo de una sede), puede bloquear el
 *    audio por politica de autoplay (no hubo gesto del usuario: en un kiosco NUNCA lo hay)
 *    o puede tener el volumen en cero. Ninguno de esos casos puede tirar el render abajo,
 *    asi que cada camino esta envuelto en try/catch y degrada a silencio.
 *  - **Un solo `AudioContext`, creado perezosamente.** Uno por beep dejaria cientos de
 *    contextos abiertos en una clase (cada uno con su hilo de audio): es la fuga de
 *    Pitfall 13 con otro disfraz. Si el sonido nunca se activa, el contexto no se crea.
 *
 * Compatibilidad (D-20): el constructor sale de `AudioContext` o del prefijado
 * `webkitAudioContext`, que es el que traen varios browsers de TV.
 */

/** Que paso: un cambio de fase (o de ronda) o el fin del bloque. */
export type TvBeep = 'phase' | 'end';

/** Duracion del pitido. Corto: acompaña, no tapa la voz del profe. */
const BEEP_SECONDS = 0.25;

/** Volumen inicial de la envolvente. El resto lo maneja el TV. */
const BEEP_GAIN = 0.15;

/** Frecuencias del mockup v8 validado: agudo para la fase, mas grave para el final. */
const BEEP_HZ = { phase: 880, end: 660 };

interface AudioCtors {
  AudioContext?: new () => AudioContext;
  webkitAudioContext?: new () => AudioContext;
}

let ctx: AudioContext | null = null;
/** Una vez que el motor dijo que no hay audio, no se vuelve a intentar en cada beep. */
let disponible = true;

function audioContext(): AudioContext | null {
  if (ctx) {
    return ctx;
  }
  if (!disponible) {
    return null;
  }
  try {
    const w = window as unknown as AudioCtors;
    const Ctor = w.AudioContext ? w.AudioContext : w.webkitAudioContext;
    if (!Ctor) {
      disponible = false;
      return null;
    }
    ctx = new Ctor();
    return ctx;
  } catch {
    disponible = false;
    return null;
  }
}

/**
 * Suena un beep si el profe activo el sonido para esta sede.
 *
 * `enabled` entra por parametro (y no como estado del modulo) porque el dueño de ese dato
 * es el estado de clase que publica el API: el kiosco no tiene una segunda copia que se
 * pueda desincronizar.
 */
export function beep(kind: TvBeep, enabled: boolean): void {
  if (!enabled) {
    return;
  }
  try {
    const ac = audioContext();
    if (!ac) {
      return;
    }
    // Un contexto creado sin gesto del usuario nace suspendido en varios motores.
    if (ac.state === 'suspended' && typeof ac.resume === 'function') {
      const reanudado = ac.resume() as Promise<void> | undefined;
      if (reanudado && typeof reanudado.catch === 'function') {
        reanudado.catch(function () {
          /* el TV no deja sonar: silencio y a otra cosa */
        });
      }
    }
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = kind === 'end' ? BEEP_HZ.end : BEEP_HZ.phase;
    gain.gain.setValueAtTime(BEEP_GAIN, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + BEEP_SECONDS);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + BEEP_SECONDS);
  } catch {
    /* sin audio el kiosco funciona igual: el timer es visual */
  }
}
