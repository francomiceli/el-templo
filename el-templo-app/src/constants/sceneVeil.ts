/**
 * Foto + velo de las pantallas "de escena" sobre la estatua (Guía, transición entre bloques,
 * 3-2-1). Un solo lugar para el velo "noche": GuiaPage y el player lo comparten, así que si cambia
 * acá cambian los dos.
 *
 * La foto es `public/bars-open.webp`, la misma del login y de la primera historia de Guía.
 */

/** Velo oscuro (180deg, más denso arriba, detrás del kicker y el título). */
export const NOCHE_GRADIENT =
  'linear-gradient(180deg, rgba(20,18,16,0.87) 0%, rgba(20,18,16,0.78) 42%, rgba(26,23,20,0.55) 68%, rgba(33,30,27,0.4) 100%)'

/**
 * Velo claro de las historias de día (180deg). Liviano a propósito: el texto de esas historias va en un
 * panel blanco centrado, así que el velo ya no sostiene la lectura y la foto puede asomar.
 */
export const DIA_GRADIENT =
  'linear-gradient(180deg, rgba(242,236,226,0.25) 0%, rgba(242,236,226,0.45) 100%)'

/** Capa de abajo: oscurece el pie de la pantalla (el botón y los textos chicos quedan sobre fondo firme). */
export const NOCHE_FOOT_GRADIENT = 'linear-gradient(180deg, transparent, rgba(20,18,16,0.92))'

/** Estilo de fondo: el velo encima de la foto, a pantalla completa (`cover`, centrada). */
export function sceneBackgroundStyle(gradient: string): Record<string, string> {
  return { ...scenePhotoStyle(), backgroundImage: `${gradient}, url(/bars-open.webp)` }
}

/**
 * Solo la foto, sin velo. Para pantallas donde el velo cambia (historias de día/noche): el velo va en
 * capas aparte que se funden por opacidad. Animar `background-image` hace que el navegador redibuje la
 * foto sin `cover` durante el fundido y se ve un zoom de ida y vuelta.
 */
export function scenePhotoStyle(): Record<string, string> {
  return {
    backgroundImage: 'url(/bars-open.webp)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
}
