import { describe, expect, it } from 'vitest'
import { photoErrorMessage, rejectionReasonLabel } from '../photo-messages'

const NO_DISPONIBLE = 'Las fotos no están disponibles por ahora. Probá más tarde.'
const NO_SUBIDA = 'No pudimos subir la foto. Revisá tu conexión y probá de nuevo.'
const INVALIDA = 'No pudimos procesar la foto. Probá con otra.'
const DECODE = 'Ese formato no se puede abrir. Elegí una foto JPG o PNG.'
const PERMISO =
  'No tenemos permiso para usar la cámara. Podés habilitarlo en los ajustes del teléfono o elegir una foto de la galería.'

/** Forma de un error de axios con respuesta HTTP. */
function httpError(status: number): unknown {
  return { isAxiosError: true, response: { status } }
}

describe('photoErrorMessage', () => {
  it('503: fotos no disponibles', () => {
    expect(photoErrorMessage(httpError(503))).toBe(NO_DISPONIBLE)
  })

  it('409: no se pudo subir', () => {
    expect(photoErrorMessage(httpError(409))).toBe(NO_SUBIDA)
  })

  it('400: no se pudo procesar', () => {
    expect(photoErrorMessage(httpError(400))).toBe(INVALIDA)
  })

  it('error de red de axios (sin respuesta): no se pudo subir', () => {
    expect(photoErrorMessage({ isAxiosError: true, response: undefined })).toBe(NO_SUBIDA)
  })

  it('PUT fallido (código PUT) y errores de fetch: no se pudo subir', () => {
    expect(photoErrorMessage({ code: 'PUT' })).toBe(NO_SUBIDA)
    expect(photoErrorMessage(new TypeError('Failed to fetch'))).toBe(NO_SUBIDA)
  })

  it('código DECODE: formato que no se abre', () => {
    expect(photoErrorMessage({ code: 'DECODE' })).toBe(DECODE)
    const err = Object.assign(new Error('x'), { code: 'DECODE' })
    expect(photoErrorMessage(err)).toBe(DECODE)
  })

  it('código PERMISSION: permiso de cámara', () => {
    expect(photoErrorMessage({ code: 'PERMISSION' })).toBe(PERMISO)
  })

  it('cualquier otra cosa cae en el texto de subida', () => {
    expect(photoErrorMessage(undefined)).toBe(NO_SUBIDA)
    expect(photoErrorMessage('boom')).toBe(NO_SUBIDA)
    expect(photoErrorMessage(httpError(500))).toBe(NO_SUBIDA)
  })

  it('ningún mensaje habla de peso (D-33)', () => {
    const all = [
      httpError(503),
      httpError(409),
      httpError(400),
      httpError(413),
      httpError(500),
      { code: 'DECODE' },
      { code: 'PERMISSION' },
      { code: 'PUT' },
      new Error('x'),
      null,
    ].map(photoErrorMessage)
    for (const msg of all) expect(msg.toLowerCase()).not.toContain('pesad')
  })
})

describe('rejectionReasonLabel', () => {
  it('etiquetas del staff', () => {
    expect(rejectionReasonLabel('sin_cara')).toBe('No se te ve la cara')
    expect(rejectionReasonLabel('no_es_propia')).toBe('No es una foto tuya')
    expect(rejectionReasonLabel('contenido')).toBe('Contenido que no va')
  })

  it('otro y null no tienen etiqueta', () => {
    expect(rejectionReasonLabel('otro')).toBeNull()
    expect(rejectionReasonLabel(null)).toBeNull()
  })
})
