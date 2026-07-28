/**
 * Fixture del motor del lint (fase 170, CON-06): exención de ARCHIVO.
 *
 * NO ES CÓDIGO DE PRODUCCIÓN. La anotación de abajo va como comentario de
 * bloque APARTE del docblock —un comentario de bloque no se puede anidar
 * (hallazgo 169-07)— y cubre todos los accesos del archivo, incluidos los que
 * todavía no se escribieron. Ese alcance mayor es T-170-06 y por eso el
 * inventario reporta el `scope` de cada exención (D-12).
 *
 * Dos accesos esperados, los dos eximidos con `scope: "file"`.
 */

/* tenant-safe: fixture del lint: exencion de archivo, alcance mayor a proposito */

import * as schema from "../../../../src/db/schema";
import type { FakeDb } from "./tipos";

export function unAcceso(db: FakeDb): FakeDb {
  return db.select().from(schema.bookings);
}

export function otroAcceso(db: FakeDb): FakeDb {
  return db.delete(schema.users);
}
