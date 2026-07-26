/**
 * Arranque del kiosco `/tv/`: cablea el runtime de red con el render y crea los tiempos.
 *
 * Es el unico lugar del kiosco donde se crean temporizadores, y se crean UNA vez:
 *
 *   poll     2500 ms  — un `GET /api/tv/state` (o un paso de la vinculacion)
 *   tick      250 ms  — reloj de pared y timer local; a 250 ms el segundero y los digitos
 *                       cambian dentro del mismo cuarto de segundo en que les toca, sin
 *                       saltarse un valor ni verse a destiempo
 *   version    60 s   — chequeo de `version.txt` para la actualizacion segura (D-22)
 *
 * Un televisor de sede queda prendido todo el dia sin que nadie lo mire: tres tiempos
 * fijos y ningun `setTimeout` encadenado es lo que hace que a las 14 horas siga igual que
 * a los 5 minutos (Pitfall 13). Por el mismo motivo el kiosco no pide mantener la pantalla
 * encendida por API — en el motor de un webOS esa promesa se cuelga sin resolver nunca.
 * Eso se resuelve por configuracion del televisor, y esta documentado en el runbook de la
 * fase (plan 164-13).
 *
 * `quotes` llega por parametro desde `main.ts`: las frases del PDF entran al bundle en un
 * unico punto (D-06 reposo / D-08 cierre) en vez de que cada modulo importe
 * `src/utils/pdf/quotes` por su cuenta.
 */

import { createTvLogger } from './logger';
import { checkVersion, pollTick, reportClientError, startPolling } from './poll';
import { renderPairing, renderState, setQuotes, tickClock, tickTimer } from './render';
import { scaleTv } from './scale';
import type { SessionQuote } from '../utils/pdf/quotes';

const log = createTvLogger('boot');

const POLL_MS = 2500;
const TICK_MS = 250;
const VERSION_MS = 60 * 1000;

/**
 * Corre una tarea del kiosco sin dejar que una excepcion la mate.
 *
 * Cada tick es una invocacion independiente, asi que una excepcion no detiene el reloj —
 * pero si el error es permanente, la pantalla se congela y nadie en la sede puede verlo.
 * Por eso ademas se reporta al server (con el techo de uno por minuto que aplica
 * `reportClientError`), que es la unica consola que tiene un televisor colgado en la pared.
 */
function guard(what: string, fn: () => void): void {
  try {
    fn();
  } catch (err: unknown) {
    log.error('fallo ' + what, { detalle: String(err) });
    reportClientError(what + ': ' + String(err), 'boot');
  }
}

/** Excepciones que se escapan de todo lo demas (incluido el codigo del navegador). */
function installGlobalErrorHook(): void {
  window.onerror = function (message, source, lineno) {
    reportClientError(
      String(message) + ' @ ' + String(source) + ':' + String(lineno),
      'window.onerror'
    );
    return false;
  };
}

export function boot(quotes: SessionQuote[]): void {
  log.info('kiosco arrancando', {
    version: window.__TV_VERSION__,
    quotes: quotes.length,
  });

  setQuotes(quotes);
  installGlobalErrorHook();
  // Idempotente: `main.ts` ya la llamo al cargar la pagina y en cada resize.
  scaleTv();

  startPolling({
    onState: function (payload) {
      renderState(payload);
    },
    onPairing: function (userCode) {
      renderPairing(userCode);
    },
  });

  setInterval(function () {
    guard('el poll', pollTick);
  }, POLL_MS);

  setInterval(function () {
    guard('el tick de pantalla', function () {
      tickClock();
      tickTimer();
    });
  }, TICK_MS);

  setInterval(function () {
    guard('el chequeo de version', checkVersion);
  }, VERSION_MS);
}
