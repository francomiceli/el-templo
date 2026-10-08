import { isFinanceBlindRole } from "../shared/permissions";

/**
 * Checklist de cierre de jornada (2026-09-07) — fuente única de las keys
 * que el staff tiene que marcar en `true` para cerrar el check-out.
 *
 * `GET /me` lo devuelve tal cual para que el front pinte los labels sin
 * hardcodearlos, y el service valida el body de `POST /check-out` contra las
 * KEYS de acá (no contra lo que mande el cliente) — ver docblock de
 * `service.ts:checkOut`.
 */
export const STAFF_CHECKOUT_CHECKLIST = [
  { key: "cobros", label: "Cargué todos los cobros del día", required: true },
  {
    key: "espacio",
    label: "Dejé el espacio limpio y ordenado",
    required: true,
  },
  {
    key: "lote",
    label: "Cerré el lote del posnet (tarjetas)",
    required: true,
  },
  // 2026-10-08 (pedido de Franco): solo profes (rol `coach`), ver
  // checklistForDow. Por ahora es un RECORDATORIO: se ofrece y se registra
  // si lo tildó, pero no bloquea el cierre. Para volverlo obligatorio,
  // `required: true` (el front ya lo respeta).
  {
    key: "videos",
    label: "Grabé videos de ejercicios para la app",
    required: false,
  },
] as const;

export type StaffChecklistKey =
  (typeof STAFF_CHECKOUT_CHECKLIST)[number]["key"];

/** Las 3 keys, como array — usado por el service para validar el body sin
 *  confiar en las claves que el cliente mande (ASVS: nunca confiar en el shape
 *  del payload por sobre el contrato del servidor). */
export const STAFF_CHECKLIST_KEYS = STAFF_CHECKOUT_CHECKLIST.map(
  (item) => item.key,
);

/**
 * Cierre de lote del posnet (2026-09-08, pedido de Franco): solo miércoles y
 * sábados. ISO day-of-week (1=lun … 7=dom), calculado en la zona horaria de la
 * sede (`dowInTz(branch.timezone)`), no en la del servidor.
 */
export const LOTE_DAYS: readonly number[] = [3, 6];

/** Rol que además graba videos de ejercicios para la app (2026-10-08). */
const VIDEOS_ROLE = "coach";

/**
 * Ítems del checklist que aplican en un día dado (ISO dow) y, opcionalmente,
 * para un rol. 2026-10-06: un rol ciego a las finanzas (coach_actividad) no
 * cobra ni cierra posnet, así que SOLO tiene `espacio` — sin `cobros` ni
 * `lote`. 2026-10-08: `videos` solo para los profes (`coach`), todos los
 * días. Sin `role` el comportamiento es el histórico (sin `videos`).
 */
export function checklistForDow(dow: number, role?: string) {
  const sinPlata = role !== undefined && isFinanceBlindRole(role);
  return STAFF_CHECKOUT_CHECKLIST.filter((item) => {
    if (item.key === "videos") return role === VIDEOS_ROLE;
    if (sinPlata) return item.key === "espacio";
    return item.key !== "lote" || LOTE_DAYS.includes(dow);
  });
}

/** Keys que se OFRECEN en el check-out en un día dado (ISO dow) y rol,
 *  obligatorias o recordatorio. */
export function offeredKeysForDow(
  dow: number,
  role?: string,
): StaffChecklistKey[] {
  return checklistForDow(dow, role).map((item) => item.key);
}

/** Keys obligatorias del check-out en un día dado (ISO dow) y rol. */
export function requiredKeysForDow(
  dow: number,
  role?: string,
): StaffChecklistKey[] {
  return checklistForDow(dow, role)
    .filter((item) => item.required)
    .map((item) => item.key);
}

/**
 * Mensaje del 400 de check-out cuando falta algún ítem exigido hoy, con las
 * etiquetas de lo que falta. Si un ítem exigido ni siquiera vino en el body,
 * el cliente armó la lista otro día (la página quedó abierta desde antes de
 * medianoche) o corre un bundle viejo: se le pide recargar. Incidente
 * 2026-09-09, primer miércoles con el lote condicional.
 */
export function checklistIncompletoMessage(
  faltantes: readonly StaffChecklistKey[],
  enviado: Record<string, unknown>,
): string {
  const labels = STAFF_CHECKOUT_CHECKLIST.filter((item) =>
    faltantes.includes(item.key),
  ).map((item) => item.label);
  const base = `Falta marcar: ${labels.join(", ")}`;
  const noVino = faltantes.some((key) => enviado[key] === undefined);
  return noVino
    ? `${base}. Hoy también se pide ese ítem: recargá la página y volvé a escanear el QR`
    : base;
}
