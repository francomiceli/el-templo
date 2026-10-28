/**
 * WhatsApp de ventas por pais (fase 195, D-16).
 *
 * El numero sale de `data/generated/web-data.json` (endpoint de la API, que lo
 * lee de `tenant_settings`): nunca se escribe a mano en componentes o datos.
 * Importa el JSON directo (y no `data/sedes.ts`) para no crear un ciclo, ya que
 * `data/sedes.ts` usa esta funcion.
 */
import rawData from "~/data/generated/web-data.json";
import type { WebCountry, WebData } from "~/data/web-data.types";

const webData = rawData as unknown as WebData;

export const DEFAULT_TRIAL_TEXT =
  "Hola! Quiero reservar mi primera sesión de prueba";

/** `https://wa.me/<numero>` (+ `?text=` codificado si se pasa `text`). */
export function salesWhatsappUrl(country: WebCountry, text?: string): string {
  const base = `https://wa.me/${salesNumber(country)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Numero de ventas del pais, solo digitos (lanza si no esta configurado). */
function salesNumber(country: WebCountry): string {
  const number = webData.countries[country]?.salesWhatsapp;
  if (!number) {
    throw new Error(
      `Falta el WhatsApp de ventas de ${country} en web-data.json (whatsapp.sales_number.${country}).`,
    );
  }
  return number;
}

/** `tel:+<numero>` del telefono de ventas (es el mismo numero del WhatsApp). */
export function salesPhoneHref(country: WebCountry): string {
  return `tel:+${salesNumber(country)}`;
}

/**
 * Numero de ventas legible: `+54 9 223 582-0521` para un celular argentino
 * (549 + area de 3 digitos), `+<digitos>` para cualquier otro formato.
 */
export function salesPhoneDisplay(country: WebCountry): string {
  const number = salesNumber(country);
  const ar = /^549(\d{3})(\d{3})(\d{4})$/.exec(number);
  return ar ? `+54 9 ${ar[1]} ${ar[2]}-${ar[3]}` : `+${number}`;
}
