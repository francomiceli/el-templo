import { describe, expect, it } from 'vitest'
import type { MemberPhotoState } from 'src/types/community'
import {
  HEADER_PHOTO_HIDDEN_AT,
  isHeaderPhotoHidden,
  showsBarPhoto,
  shownPhotoUrl,
} from '../bar-profile-photo'

const photo = (over: Partial<MemberPhotoState>): MemberPhotoState => ({
  url: null,
  status: 'none',
  pendingUrl: null,
  rejectionReason: null,
  ...over,
})

describe('shownPhotoUrl', () => {
  it('sin perfil o sin dato de foto: null', () => {
    expect(shownPhotoUrl(null)).toBeNull()
    expect(shownPhotoUrl(undefined)).toBeNull()
    expect(shownPhotoUrl(photo({}))).toBeNull()
  })

  it('con foto aprobada: esa', () => {
    expect(shownPhotoUrl(photo({ url: 'https://x/aprobada.jpg' }))).toBe('https://x/aprobada.jpg')
  })

  it('solo con una foto en revisión: la que está en revisión', () => {
    expect(shownPhotoUrl(photo({ pendingUrl: 'https://x/pendiente.jpg' }))).toBe(
      'https://x/pendiente.jpg',
    )
  })

  it('con aprobada y otra en revisión: gana la aprobada', () => {
    expect(
      shownPhotoUrl(photo({ url: 'https://x/aprobada.jpg', pendingUrl: 'https://x/nueva.jpg' })),
    ).toBe('https://x/aprobada.jpg')
  })
})

describe('isHeaderPhotoHidden', () => {
  it('arriba de todo y hasta un px antes del umbral: la foto del encabezado se ve', () => {
    expect(isHeaderPhotoHidden(0)).toBe(false)
    expect(isHeaderPhotoHidden(HEADER_PHOTO_HIDDEN_AT - 1)).toBe(false)
  })

  it('desde el umbral: tapada', () => {
    expect(isHeaderPhotoHidden(HEADER_PHOTO_HIDDEN_AT)).toBe(true)
    expect(isHeaderPhotoHidden(900)).toBe(true)
  })

  it('rebote de iOS (scroll negativo): la foto del encabezado se ve', () => {
    expect(isHeaderPhotoHidden(-30)).toBe(false)
  })
})

describe('showsBarPhoto', () => {
  const base = {
    url: 'https://x/foto.jpg',
    failed: false,
    isMiTemplo: true,
    headerPhotoHidden: false,
  }

  it('Mi Templo arriba de todo: queda el ícono (la foto ya está en el encabezado)', () => {
    expect(showsBarPhoto(base)).toBe(false)
  })

  it('Mi Templo scrolleado: la foto reemplaza al ícono', () => {
    expect(showsBarPhoto({ ...base, headerPhotoHidden: true })).toBe(true)
  })

  it('fuera de Mi Templo: la foto está siempre, sin importar el scroll', () => {
    expect(showsBarPhoto({ ...base, isMiTemplo: false })).toBe(true)
    expect(showsBarPhoto({ ...base, isMiTemplo: false, headerPhotoHidden: true })).toBe(true)
  })

  it('sin foto: ícono en todas las pantallas', () => {
    expect(showsBarPhoto({ ...base, url: null, headerPhotoHidden: true })).toBe(false)
    expect(showsBarPhoto({ ...base, url: null, isMiTemplo: false })).toBe(false)
    expect(showsBarPhoto({ ...base, url: '', isMiTemplo: false })).toBe(false)
  })

  it('la imagen no cargó: vuelve el ícono', () => {
    expect(showsBarPhoto({ ...base, failed: true, headerPhotoHidden: true })).toBe(false)
    expect(showsBarPhoto({ ...base, failed: true, isMiTemplo: false })).toBe(false)
  })
})
