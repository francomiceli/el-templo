import { describe, expect, it } from 'vitest'
import { PHOTO_CTA_TEXT, headerSubline } from '../mi-templo-header'

const base = {
  hasShownPhoto: false,
  hasPendingPhoto: false,
  auraVisible: true,
  tenure: 'Hace 8 meses en El Templo',
}

describe('headerSubline (#17)', () => {
  it('sin foto de ninguna clase y con Aura: invita a subirla', () => {
    expect(headerSubline(base)).toEqual({ kind: 'cta', text: 'Subí tu foto y sumá Aura' })
    expect(PHOTO_CTA_TEXT).toBe('Subí tu foto y sumá Aura')
  })

  it('con foto (propia aprobada o de la ficha): la antigüedad, como hoy', () => {
    expect(headerSubline({ ...base, hasShownPhoto: true })).toEqual({
      kind: 'tenure',
      text: 'Hace 8 meses en El Templo',
    })
  })

  it('con la foto en revisión: la antigüedad', () => {
    expect(headerSubline({ ...base, hasPendingPhoto: true })).toEqual({
      kind: 'tenure',
      text: 'Hace 8 meses en El Templo',
    })
  })

  it('con el módulo de Aura apagado no promete Aura: queda la antigüedad', () => {
    expect(headerSubline({ ...base, auraVisible: false })).toEqual({
      kind: 'tenure',
      text: 'Hace 8 meses en El Templo',
    })
  })

  it('sin foto, sin Aura y sin antigüedad: nada', () => {
    expect(headerSubline({ ...base, auraVisible: false, tenure: null })).toBeNull()
    expect(headerSubline({ ...base, auraVisible: false, tenure: '  ' })).toBeNull()
  })

  it('con foto y sin antigüedad: nada', () => {
    expect(headerSubline({ ...base, hasShownPhoto: true, tenure: null })).toBeNull()
  })

  it('la invitación sale aunque no haya dato de antigüedad', () => {
    expect(headerSubline({ ...base, tenure: null })).toEqual({
      kind: 'cta',
      text: 'Subí tu foto y sumá Aura',
    })
  })
})
