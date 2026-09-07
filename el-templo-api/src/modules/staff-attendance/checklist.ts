/**
 * Checklist de cierre de jornada (2026-09-07) — fuente única de las 3 keys
 * que el staff tiene que marcar en `true` para cerrar el check-out.
 *
 * `GET /me` lo devuelve tal cual para que el front pinte los labels sin
 * hardcodearlos, y el service valida el body de `POST /check-out` contra las
 * KEYS de acá (no contra lo que mande el cliente) — ver docblock de
 * `service.ts:checkOut`.
 */
export const STAFF_CHECKOUT_CHECKLIST = [
  { key: "cobros", label: "Cargué todos los cobros del día" },
  { key: "espacio", label: "Dejé el espacio limpio y ordenado" },
  { key: "lote", label: "Cerré el lote del posnet (tarjetas)" },
] as const;

export type StaffChecklistKey =
  (typeof STAFF_CHECKOUT_CHECKLIST)[number]["key"];

/** Las 3 keys, como array — usado por el service para validar el body sin
 *  confiar en las claves que el cliente mande (ASVS: nunca confiar en el shape
 *  del payload por sobre el contrato del servidor). */
export const STAFF_CHECKLIST_KEYS = STAFF_CHECKOUT_CHECKLIST.map(
  (item) => item.key,
);
