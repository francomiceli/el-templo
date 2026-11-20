import { describe, expect, it } from 'vitest'
import {
  parsePhotoRulesRecord,
  photoRulesKey,
  recordAcceptance,
  recordAfterPhotoChange,
  shouldShowPhotoRules,
} from '../photo-rules-memory'

describe('shouldShowPhotoRules (#6)', () => {
  it('la primera vez (sin memoria) se muestran, con cualquier estado de foto', () => {
    expect(shouldShowPhotoRules(null, 'none')).toBe(true)
    expect(shouldShowPhotoRules(null, 'rechazada')).toBe(true)
    expect(shouldShowPhotoRules(null, undefined)).toBe(true)
  })

  it('ya aceptadas y sin rechazo: no vuelven en cada "Elegir otra"', () => {
    const record = recordAcceptance('none')
    expect(shouldShowPhotoRules(record, 'none')).toBe(false)
    expect(shouldShowPhotoRules(record, 'pendiente')).toBe(false)
    expect(shouldShowPhotoRules(record, 'aprobada')).toBe(false)
  })

  it('tras un rechazo se muestran de nuevo', () => {
    const record = recordAcceptance('none')
    expect(shouldShowPhotoRules(record, 'rechazada')).toBe(true)
  })

  it('aceptadas estando rechazada: no se repiten mientras siga rechazada', () => {
    const record = recordAcceptance('rechazada')
    expect(record).toEqual({ acceptedWhileRejected: true })
    expect(shouldShowPhotoRules(record, 'rechazada')).toBe(false)
  })

  it('subir o quitar una foto reinicia la marca: un segundo rechazo las pide otra vez', () => {
    const afterFirstRejection = recordAcceptance('rechazada')
    const afterUpload = recordAfterPhotoChange(afterFirstRejection)
    expect(afterUpload).toEqual({ acceptedWhileRejected: false })
    expect(shouldShowPhotoRules(afterUpload, 'pendiente')).toBe(false)
    expect(shouldShowPhotoRules(afterUpload, 'rechazada')).toBe(true)
  })

  it('sin memoria previa, cambiar la foto no inventa una aceptación', () => {
    expect(recordAfterPhotoChange(null)).toBeNull()
  })
})

describe('parsePhotoRulesRecord', () => {
  it('lee un registro válido', () => {
    expect(parsePhotoRulesRecord('{"acceptedWhileRejected":true}')).toEqual({
      acceptedWhileRejected: true,
    })
    expect(parsePhotoRulesRecord('{"acceptedWhileRejected":false}')).toEqual({
      acceptedWhileRejected: false,
    })
  })

  it('un valor ausente, corrupto o con otra forma cuenta como sin registro', () => {
    expect(parsePhotoRulesRecord(null)).toBeNull()
    expect(parsePhotoRulesRecord('')).toBeNull()
    expect(parsePhotoRulesRecord('no es json')).toBeNull()
    expect(parsePhotoRulesRecord('{}')).toBeNull()
    expect(parsePhotoRulesRecord('{"acceptedWhileRejected":"si"}')).toBeNull()
    expect(parsePhotoRulesRecord('null')).toBeNull()
    expect(parsePhotoRulesRecord('true')).toBeNull()
  })
})

describe('photoRulesKey', () => {
  it('es una clave por persona', () => {
    expect(photoRulesKey(7)).not.toBe(photoRulesKey(8))
  })
})
