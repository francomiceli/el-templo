import type { MemberPhotoState } from 'src/types/community'

/**
 * Foto de perfil en la barra de arriba (2026-11-19, pedido de Franco tras el sketch 038): al
 * scrollear Mi Templo, cuando la foto del encabezado queda tapada por la barra, la foto reemplaza al
 * ícono de perfil, "así en todo momento el usuario se siente él". Fuera de Mi Templo no hay
 * encabezado, así que la foto está siempre. Sin foto queda el ícono.
 */

/**
 * Px de scroll a partir de los cuales la foto del encabezado de Mi Templo se da por tapada. El
 * encabezado tiene 8 de aire arriba y la foto mide 52: a los 44 quedan 16 a la vista (menos de un
 * tercio) y ya no se lee como una foto.
 */
export const HEADER_PHOTO_HIDDEN_AT = 44

export function isHeaderPhotoHidden(scrollTop: number): boolean {
  return scrollTop >= HEADER_PHOTO_HIDDEN_AT
}

/**
 * Estado siguiente de "la foto del encabezado está tapada" ante un aviso de scroll del layout.
 *
 * `scrollLocked`: hay un diálogo u hoja abierta. Quasar fija el `body` mientras tanto y la posición
 * de scroll pasa a 0 aunque el socio no se haya movido; al cerrar la devuelve a donde estaba. Esos
 * avisos no son un scroll del socio y se ignoran: si no, la barra cambiaría la foto por el ícono (y
 * de vuelta) cada vez que se abre una hoja estando scrolleado.
 */
export function nextHeaderPhotoHidden(
  current: boolean,
  scrollTop: number,
  scrollLocked: boolean,
): boolean {
  return scrollLocked ? current : isHeaderPhotoHidden(scrollTop)
}

/**
 * La foto que el socio ve como suya: la aprobada (o la de la ficha) y, si no hay, la que tiene en
 * revisión. Es la misma regla del encabezado de Mi Templo.
 */
export function shownPhotoUrl(photo: MemberPhotoState | null | undefined): string | null {
  return photo?.url ?? photo?.pendingUrl ?? null
}

export interface BarPhotoInput {
  /** `shownPhotoUrl` del perfil; null si no hay foto (o todavía no hay perfil). */
  url: string | null
  /** La imagen no cargó (por ejemplo, URL firmada vencida): vuelve el ícono. */
  failed: boolean
  /** La pantalla es Mi Templo: ahí la foto ya está en el encabezado mientras se vea. */
  isMiTemplo: boolean
  /** La foto del encabezado de Mi Templo quedó tapada por la barra. */
  headerPhotoHidden: boolean
}

/** true = la barra muestra la foto en lugar del ícono de perfil. */
export function showsBarPhoto(input: BarPhotoInput): boolean {
  if (!input.url || input.failed) return false
  if (!input.isMiTemplo) return true
  return input.headerPhotoHidden
}
