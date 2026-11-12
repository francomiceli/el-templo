/**
 * Formato "evento" de los avisos de TV (2026-11-12, API migración 0332):
 * helpers PUROS compartidos por la pantalla del televisor (`render.ts`) y la
 * vista previa del editor (`TvAvisoPreview.vue`), para que las dos armen la
 * tarjeta con las mismas reglas. Los estilos viven en `src/css/tv-evento.css`.
 *
 * Sin `Date` con strings ni formateadores por zona horaria: la fecha del
 * evento es un día calendario (`YYYY-MM-DD`), no un instante.
 */
import type { TvAvisoEventoPayload } from './poll';

const DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES_CORTOS = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
];

/** Las tres líneas de la hoja de calendario: "SÁB" / "14" / "NOV". */
export interface EventoCalendario {
  dia: string;
  num: string;
  mes: string;
}

/**
 * `YYYY-MM-DD` → hoja de calendario. `null` si la fecha no es un día real
 * (el API ya la valida; esto cubre el borrador a medio escribir del editor).
 */
export function eventoCalendario(fecha: string): EventoCalendario | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) {
    return null;
  }
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return {
    dia: DIAS_CORTOS[d.getUTCDay()] ?? '',
    num: String(dia),
    mes: MESES_CORTOS[mes - 1] ?? '',
  };
}

/** Tamaños del nombre (en unidades de TV), de mayor a menor: niveles 1..6. */
const NOMBRE_TAMANIOS = [7.6, 6.4, 5.4, 4.6, 3.8, 3.2];
/** Ancho libre para el nombre, a la derecha de la hoja de calendario. */
const NOMBRE_ANCHO_CON_FOTO = 39;
const NOMBRE_ANCHO_SIN_FOTO = 67;

/** Ancho aproximado de un texto en Nunito Sans Bold, en `em`. */
function anchoEstimadoEm(texto: string): number {
  let em = 0;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charAt(i);
    if (ch === ' ') {
      em += 0.26;
    } else if (ch !== ch.toLowerCase() || /[0-9]/.test(ch)) {
      em += 0.66; // mayúsculas y dígitos
    } else {
      em += 0.5;
    }
  }
  return em;
}

/**
 * Nivel de tamaño (1 = el más grande … 6) con el que el nombre entra en UNA
 * línea. Si ni el más chico alcanza, queda en 6 y el CSS lo deja partir en
 * dos líneas. La clase es `tvEvento__nombre--t<nivel>`.
 */
export function eventoNombreNivel(nombre: string, conFoto: boolean): number {
  const disponible = conFoto ? NOMBRE_ANCHO_CON_FOTO : NOMBRE_ANCHO_SIN_FOTO;
  const ancho = anchoEstimadoEm(nombre.trim());
  for (let i = 0; i < NOMBRE_TAMANIOS.length; i++) {
    if (ancho * (NOMBRE_TAMANIOS[i] ?? 0) <= disponible) {
      return i + 1;
    }
  }
  return NOMBRE_TAMANIOS.length;
}

/** Subtítulo y lugar bajan un escalón de tamaño cuando el texto es largo. */
export const EVENTO_SUB_LARGO = 26;
export const EVENTO_LUGAR_LARGO = 30;

/** Todo lo que la tarjeta necesita, ya resuelto: una sola fuente para TV y preview. */
export interface EventoVista {
  calendario: EventoCalendario | null;
  nombre: string;
  nombreClase: string;
  sub: string;
  subClase: string;
  hora: string;
  lugar: string;
  lugarClase: string;
  sello: string;
  selloClase: string;
  fotoUrl: string;
  fotoClase: string;
}

/**
 * Arma la vista de la tarjeta a partir del aviso. `title` es el nombre del
 * evento y `body` el subtítulo (así un televisor con el bundle viejo muestra
 * una placa legible con esos dos textos).
 */
export function eventoVista(
  title: string,
  body: string,
  evento: TvAvisoEventoPayload
): EventoVista {
  const fotoUrl = evento.imageUrl ? evento.imageUrl : '';
  const sello = evento.sello ? evento.sello : '';
  return {
    calendario: eventoCalendario(evento.fecha),
    nombre: title,
    nombreClase: 'tvEvento__nombre tvEvento__nombre--t' + eventoNombreNivel(title, fotoUrl !== ''),
    sub: body,
    subClase:
      body.length > EVENTO_SUB_LARGO ? 'tvEvento__sub tvEvento__sub--chico' : 'tvEvento__sub',
    hora: evento.hora,
    lugar: evento.lugar,
    lugarClase:
      evento.lugar.length > EVENTO_LUGAR_LARGO
        ? 'tvEvento__valor tvEvento__valor--chico'
        : 'tvEvento__valor',
    sello,
    selloClase: sello === '' ? 'tvEvento__sello tvEvento__sello--sin' : 'tvEvento__sello',
    fotoUrl,
    fotoClase: fotoUrl === '' ? 'tvEvento__foto tvEvento__foto--sin' : 'tvEvento__foto',
  };
}

/** `background-image` seguro para una URL: sin comillas, barras invertidas ni saltos. */
export function eventoFotoCss(url: string): string {
  if (url === '') {
    return 'none';
  }
  return 'url("' + url.replace(/["\\\n\r]/g, '') + '")';
}
