import { describe, it, expect } from 'vitest'
import {
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  checkVideo,
  formatSeconds,
  videoMimeOf,
  videoSeconds,
  type VideoMime,
} from '../videoFile'

// Fase 202 DA-39/DA-40: el app da feedback temprano; el API hace cumplir (T-201-152).

const MP4: VideoMime = 'video/mp4'

describe('topes', () => {
  it('espejan los del API: 30 s y 100 MB', () => {
    expect(VIDEO_MAX_SECONDS).toBe(30)
    expect(VIDEO_MAX_BYTES).toBe(100 * 1024 * 1024)
  })
})

describe('videoMimeOf', () => {
  it.each([
    ['mp4 por type', 'video/mp4', 'a', 'video/mp4'],
    ['quicktime por type', 'video/quicktime', 'a', 'video/quicktime'],
    ['type vacío y .MOV en mayúsculas', '', 'IMG_1.MOV', 'video/quicktime'],
    ['type vacío y .mov', '', 'clip.mov', 'video/quicktime'],
    ['type vacío y .m4v', '', 'x.m4v', 'video/mp4'],
    ['type vacío y .mp4', '', 'x.mp4', 'video/mp4'],
    ['type de otro formato, aunque la extensión sirva', 'video/webm', 'x.mp4', null],
    ['type de otro formato y extensión de otro formato', 'video/webm', 'x.webm', null],
    ['type vacío sin extensión', '', 'x', null],
    ['type vacío y extensión ajena', '', 'x.avi', null],
    ['type vacío y la extensión es solo parte del nombre', '', 'mp4', null],
  ])('%s', (_caso, type, name, esperado) => {
    expect(videoMimeOf({ type, name })).toBe(esperado)
  })
})

describe('checkVideo', () => {
  const ok: { mime: VideoMime | null; size: number; durationSec: number | null } = {
    mime: MP4,
    size: 5_000_000,
    durationSec: 12,
  }

  it('un video bueno pasa y devuelve los segundos redondeados', () => {
    expect(checkVideo(ok)).toEqual({ ok: true, seconds: 12 })
  })

  it('tipo no soportado', () => {
    const res = checkVideo({ ...ok, mime: null })
    expect(res).toEqual({
      ok: false,
      reason: 'tipo',
      message: 'Solo se pueden mandar videos MP4 o MOV.',
    })
  })

  it('archivo vacío', () => {
    expect(checkVideo({ ...ok, size: 0 })).toEqual({
      ok: false,
      reason: 'vacio',
      message: 'El video está vacío. Probá con otro.',
    })
  })

  it('pesa más de 100 MB: el tope es inclusivo', () => {
    const res = checkVideo({ ...ok, size: VIDEO_MAX_BYTES + 1 })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('pesado')
      expect(res.message).toContain('100 MB')
    }
    expect(checkVideo({ ...ok, size: VIDEO_MAX_BYTES })).toEqual({ ok: true, seconds: 12 })
  })

  it.each([
    ['null', null],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['negativa', -3],
  ])('duración ilegible (%s)', (_caso, durationSec) => {
    const res = checkVideo({ ...ok, durationSec })
    expect(res).toEqual({
      ok: false,
      reason: 'duracion',
      message: 'No pudimos leer el video. Probá con otro.',
    })
  })

  it.each([
    [30, 30],
    [30.5, 30],
    [0.4, 1],
    [0, 1],
    [24.4, 24],
    [24.5, 25],
  ])('duración %s s pasa con %s s', (durationSec, seconds) => {
    expect(checkVideo({ ...ok, durationSec })).toEqual({ ok: true, seconds })
  })

  it('30,6 s es largo y el mensaje dice cuántos segundos dura', () => {
    const res = checkVideo({ ...ok, durationSec: 30.6 })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('largo')
      expect(res.message).toContain('31 s')
      expect(res.message).toContain('30 s')
    }
  })

  it('el orden importa: tipo antes que peso', () => {
    const res = checkVideo({ mime: null, size: VIDEO_MAX_BYTES + 1, durationSec: 99 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('tipo')
  })

  it.each([
    ['vacío antes que pesado/largo', { size: 0, durationSec: 99 }, 'vacio'],
    [
      'pesado antes que duración ilegible',
      { size: VIDEO_MAX_BYTES + 1, durationSec: null },
      'pesado',
    ],
    ['pesado antes que largo', { size: VIDEO_MAX_BYTES + 1, durationSec: 99 }, 'pesado'],
    ['duración ilegible antes que larga', { durationSec: Number.NaN }, 'duracion'],
  ] as const)('el orden importa: %s', (_caso, override, reason) => {
    const res = checkVideo({ ...ok, ...override })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe(reason)
  })
})

describe('videoSeconds', () => {
  it.each([
    [0.2, 1],
    [1, 1],
    [11.6, 12],
    [30, 30],
    [30.4, 30],
    [45, 30],
  ])('%s -> %s', (d, esperado) => {
    expect(videoSeconds(d)).toBe(esperado)
  })
})

describe('formatSeconds', () => {
  it.each([
    [24, '0:24'],
    [5, '0:05'],
    [30, '0:30'],
    [0, '0:00'],
    [60, '1:00'],
    [75, '1:15'],
  ])('%s -> %s', (s, esperado) => {
    expect(formatSeconds(s)).toBe(esperado)
  })
})
