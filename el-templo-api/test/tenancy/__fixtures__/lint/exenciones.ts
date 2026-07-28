/**
 * Fixture del motor del lint (fase 170, CON-06): el anclaje de exenciones.
 *
 * NO ES CÓDIGO DE PRODUCCIÓN. Cuatro accesos, dos eximidos y dos que siguen
 * siendo violación aunque el autor haya escrito la anotación, porque la
 * escribió de una forma que no exime:
 *
 *   - motivo vacío: indistinguible de un olvido (T-169-36);
 *   - comentario de línea: el tag solo cuenta en un comentario de BLOQUE.
 *
 * Esos dos casos son la mitad controlada de la mitigación de T-170-09; la otra
 * mitad se afirma contra los dos sitios reales de `origin/master`.
 */

import * as schema from "../../../../src/db/schema";
import type { FakeDb } from "./tipos";

/** EXIMIDO (site) — comentario de bloque, tag pegado a la apertura, con motivo. */
export function conExencionValida(db: FakeDb): FakeDb {
  /* tenant-safe: fixture del lint: exencion de sitio con motivo escrito */
  return db.select().from(schema.bookings);
}

/** VIOLACIÓN — la anotación pelada no exime: sin motivo no hay exención. */
export function conMotivoVacio(db: FakeDb): FakeDb {
  /* tenant-safe: */
  return db.select().from(schema.users);
}

/** VIOLACIÓN — un comentario de línea no exime (rechazo tipo `schema/tv.ts`). */
export function conComentarioDeLinea(db: FakeDb): FakeDb {
  // tenant-safe: un comentario de linea NO exime, por mas motivo que tenga
  return db.select().from(schema.attendance);
}

/** EXIMIDO (site) — anotación TRAILING, como en `src/modules/tv/pairing.ts`. */
export function conExencionTrailing(db: FakeDb): FakeDb {
  return db
    .insert(
      schema.bookings,
    ) /* tenant-safe: fixture del lint: exencion trailing */
    .values({ id: 1 });
}
