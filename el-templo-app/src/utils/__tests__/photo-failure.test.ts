import { describe, expect, it } from 'vitest'
import { PHOTO_FAILURE_CAUSE_MAX, photoFailureCause } from '../photo-failure'

describe('photoFailureCause', () => {
  it('error del plugin de iOS: guarda su texto, no el nombre genérico "Error"', () => {
    expect(photoFailureCause(new Error('Error loading image'))).toEqual({
      cause: 'Error loading image',
      code: null,
    })
  })

  it('error con código del plugin (CapacitorException): guarda texto y código', () => {
    const err = Object.assign(new Error('Unable to convert image to jpeg'), {
      code: 'OS-PLUG-CAMR-0010',
    })
    expect(photoFailureCause(err)).toEqual({
      cause: 'Unable to convert image to jpeg',
      code: 'OS-PLUG-CAMR-0010',
    })
  })

  it('código que no es texto o está vacío: queda null', () => {
    expect(photoFailureCause(Object.assign(new Error('x'), { code: 5 })).code).toBeNull()
    expect(photoFailureCause(Object.assign(new Error('x'), { code: '  ' })).code).toBeNull()
  })

  it('error sin texto: usa el nombre del error', () => {
    expect(photoFailureCause(new TypeError('')).cause).toBe('TypeError')
    expect(photoFailureCause(new Error('   ')).cause).toBe('Error')
  })

  it('rechazo con un string suelto: lo usa', () => {
    expect(photoFailureCause('User denied access to photos').cause).toBe(
      'User denied access to photos',
    )
  })

  it('cualquier otra cosa: unknown', () => {
    expect(photoFailureCause(undefined)).toEqual({ cause: 'unknown', code: null })
    expect(photoFailureCause(null)).toEqual({ cause: 'unknown', code: null })
    expect(photoFailureCause({})).toEqual({ cause: 'unknown', code: null })
    expect(photoFailureCause('')).toEqual({ cause: 'unknown', code: null })
  })

  it('texto largo: se recorta con puntos suspensivos', () => {
    const long = 'a'.repeat(PHOTO_FAILURE_CAUSE_MAX + 50)
    const { cause } = photoFailureCause(new Error(long))
    expect(cause).toBe(`${'a'.repeat(PHOTO_FAILURE_CAUSE_MAX)}…`)
  })

  it('texto justo en el tope: no se recorta', () => {
    const exact = 'b'.repeat(PHOTO_FAILURE_CAUSE_MAX)
    expect(photoFailureCause(new Error(exact)).cause).toBe(exact)
  })
})
