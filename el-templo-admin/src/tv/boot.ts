/**
 * Arranque del kiosco: pairing, poll, relojes y render de las 4 pantallas.
 *
 * STUB — TODO(plan 164-11): armar el ciclo de poll (token en localStorage, offset de
 * reloj, chequeo de version) y los dos intervalos (reloj de pared y timer), y delegar
 * el dibujo a `render.ts`.
 *
 * `quotes` llega por parametro desde `main.ts` a proposito: las frases del PDF entran al
 * bundle en un unico punto (D-06 reposo / D-08 cierre) en vez de que cada modulo importe
 * `src/utils/pdf/quotes` por su cuenta.
 */

import { createTvLogger } from './logger';
import type { SessionQuote } from '../utils/pdf/quotes';

const log = createTvLogger('boot');

export function boot(quotes: SessionQuote[]): void {
  log.info('kiosco en andamiaje — sin implementar (plan 164-11)', {
    version: window.__TV_VERSION__,
    quotes: quotes.length,
  });
}
