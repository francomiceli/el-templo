// Module: aura — reglas puras del regalo (fase 215)
/**
 * Reglas del regalo de Aura, sin base de datos ni reloj propio: los servicios,
 * rutas y textos de los planes siguientes leen una sola definición.
 *
 * - D-05: el tope de regalos por persona rige por semana de lunes a domingo.
 * - D-10: el regalo de un alumno vale `AURA_AMOUNTS.giftMember`.
 * - D-11: el regalo del profe arranca en 2 y solo acepta enteros de 1 a 10.
 * - D-12: se puede regalar el día de la clase y hasta el fin del día siguiente.
 * - D-16: cuatro motivos fijos; el texto sale siempre de `GIFT_REASONS`.
 * - D-19: el aviso dice quién dio y el motivo.
 * - D-21: porcentaje de quienes regalaron, para la medición.
 * - D-22: ningún texto promete discreción: el aviso dice siempre quién dio.
 * - ME-01 y #38 (revisión del 2026-11-18): si la otra persona HOY está oculta de
 *   las listas, o quien regaló no tiene nombre, el texto no la nombra ni dice
 *   "Alguien": solo la cantidad y el motivo ("Te dieron 1 de Aura por
 *   Constancia"). El profe nunca es anónimo: sin nombre es "Tu profe".
 */

import type {
  AuraGiftGiverKind,
  AuraGiftReason,
} from "../../db/schema/aura-gifts";
import { addDays } from "../shared/date-utils";
import { AURA_AMOUNTS } from "./amounts";
import { isoWeekStart } from "../ratings/roster-attribution";

export type GiftReason = AuraGiftReason;
export type GiftGiverKind = AuraGiftGiverKind;

/** Motivos que elige quien regala (D-16), en el orden en que se muestran. */
export const GIFT_REASONS: readonly { code: GiftReason; label: string }[] = [
  { code: "tecnica", label: "Buena técnica" },
  { code: "constancia", label: "Constancia" },
  { code: "energia", label: "Buena energía" },
  { code: "ayudo", label: "Me ayudó" },
];

export function isGiftReason(value: unknown): value is GiftReason {
  return GIFT_REASONS.some((reason) => reason.code === value);
}

export function giftReasonLabel(code: GiftReason): string {
  return GIFT_REASONS.find((reason) => reason.code === code)?.label ?? "";
}

/**
 * D-12: la clase de `classDate` se puede regalar ese día y el siguiente.
 * Una fecha de clase futura nunca vale. Ambas fechas son `YYYY-MM-DD` del día
 * local de la sede.
 */
export function isWithinGiftWindow(classDate: string, today: string): boolean {
  return classDate === today || addDays(classDate, 1) === today;
}

/** Último día en que se puede regalar la clase de `classDate` (D-12). */
export function giftExpiresOn(classDate: string): string {
  return addDays(classDate, 1);
}

/** D-05: semana de lunes a domingo que contiene `date` (`YYYY-MM-DD`). */
export function giftWeekRange(date: string): { start: string; end: string } {
  const start = isoWeekStart(date);
  return { start, end: addDays(start, 6) };
}

/** D-05: regalos que una persona puede darle a otra por semana. */
export const GIFT_WEEKLY_CAP = 2;

/** D-11: valor del regalo del profe (editable por el gimnasio dentro del rango). */
export const COACH_GIFT_AMOUNT = { default: 2, min: 1, max: 10 } as const;

export function isValidCoachGiftAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= COACH_GIFT_AMOUNT.min &&
    value <= COACH_GIFT_AMOUNT.max
  );
}

/** Referencias del ledger de Aura: el regalo y su anulación. */
export const GIFT_REFERENCE = {
  gift: "aura_gift",
  void: "aura_gift_void",
} as const;

/** D-21: porcentaje entero (redondeado) de `givers` sobre `total`. Sin base, 0. */
export function giversPct(givers: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((givers * 100) / total);
}

/** Destino de la push y de la fila de la bandeja: el detalle de Aura. */
export const GIFT_ROUTE = "/mi-templo?aura=detalle";

/** Texto del movimiento de un regalo anulado. */
export const GIFT_VOID_LABEL = "Regalo anulado";

/** Texto del movimiento cuando el regalo ya no se encuentra. */
const GIFT_UNKNOWN_LABEL = "Regalo de Aura";

/** Datos que hacen falta para redactar un regalo recibido (planes 11 y 14). */
export interface GiftLabelInput {
  giverKind: GiftGiverKind;
  giverFirstName: string | null;
  giverLastInitial: string | null;
  reason: GiftReason;
  /** ME-01: quien dio (alumno) hoy está oculto de las listas. */
  giverHidden?: boolean;
  /** Puntos del regalo. Sin dato rige el valor del regalo de un alumno. */
  amount?: number;
}

/**
 * ME-01 y #38: el aviso no nombra a quien dio. Solo vale para un alumno: oculto
 * hoy o sin nombre de pila. El profe se muestra siempre ("Tu profe").
 */
export function isAnonymousGiver(input: GiftLabelInput): boolean {
  if (input.giverKind === "profe") return false;
  return (
    input.giverHidden === true || (input.giverFirstName ?? "").trim() === ""
  );
}

/** "Te dieron 1 de Aura" (título de la push sin nombre). */
function receivedAmountPhrase(input: GiftLabelInput): string {
  return `Te dieron ${input.amount ?? AURA_AMOUNTS.giftMember} de Aura`;
}

/**
 * "Sofía M." / "Sofía" / "Alguien". Recorta espacios; la inicial es la primera
 * letra de `lastInitial`.
 */
export function giftPersonName(
  firstName: string | null | undefined,
  lastInitial: string | null | undefined,
): string {
  const first = (firstName ?? "").trim();
  if (first === "") return "Alguien";
  const initial = (lastInitial ?? "").trim().charAt(0);
  return initial === "" ? first : `${first} ${initial}.`;
}

/**
 * Quién dio, en la forma en que se lee en la push y en el detalle. El profe va
 * solo con nombre de pila: "Tu profe Fran".
 */
function giverPhrase(input: GiftLabelInput): string {
  if (input.giverKind === "profe") {
    const first = (input.giverFirstName ?? "").trim().split(/\s+/)[0] ?? "";
    return first === "" ? "Tu profe" : `Tu profe ${first}`;
  }
  return giftPersonName(input.giverFirstName, input.giverLastInitial);
}

/** Título y cuerpo de la push del regalo (D-19). */
export function giftPushText(input: GiftLabelInput): {
  title: string;
  body: string;
} {
  if (isAnonymousGiver(input)) {
    return {
      title: receivedAmountPhrase(input),
      body: `Motivo: ${giftReasonLabel(input.reason)}.`,
    };
  }
  return {
    title: `${giverPhrase(input)} te dio Aura`,
    body: `Motivo: ${giftReasonLabel(input.reason)}.`,
  };
}

/** Texto del movimiento en el detalle de Aura (D-19). */
export function giftMovementLabel(input: GiftLabelInput | null): string {
  if (input === null) return GIFT_UNKNOWN_LABEL;
  if (isAnonymousGiver(input)) {
    return `${receivedAmountPhrase(input)} por ${giftReasonLabel(input.reason)}`;
  }
  return `${giverPhrase(input)} te dio Aura · ${giftReasonLabel(input.reason)}`;
}
