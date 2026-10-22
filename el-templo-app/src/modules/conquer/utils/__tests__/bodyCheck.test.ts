import { describe, it, expect } from 'vitest'
import type { BodyCheckView, CheckComparison } from '../../types'
import {
  CONQUER_POSES,
  MEASURE_FIELDS,
  POSE_LABELS,
  POSE_TIPS,
  REJECTED_PHOTO_TEXT,
  STORAGE_PHOTO_TEXT,
  UNAVAILABLE_PHOTO_TEXT,
  buildMeasuresBody,
  draftsFromCheck,
  emptyDrafts,
  findTodayCheck,
  formatDiff,
  formatNumberEs,
  fromLabel,
  isRetryable,
  localIsoDate,
  measureRows,
  mimeFromCameraFormat,
  parseMeasure,
  parseWeight,
  toLabel,
  toUploadFile,
  uploadFailureText,
  type UploadFailureKind,
} from '../bodyCheck'

describe('poses', () => {
  it('son tres y van en el orden en que se sacan', () => {
    expect(CONQUER_POSES).toEqual(['frente', 'perfil', 'espalda'])
  })

  it.each(CONQUER_POSES)('la pose %s tiene nombre y consejo con la regla de luz', (pose) => {
    expect(POSE_LABELS[pose].length).toBeGreaterThan(0)
    expect(POSE_TIPS[pose]).toContain('Misma luz, misma hora, sin entrenar antes.')
  })

  it('los nombres son Frente, Perfil y Espalda', () => {
    expect(CONQUER_POSES.map((p) => POSE_LABELS[p])).toEqual(['Frente', 'Perfil', 'Espalda'])
  })
})

describe('parseMeasure', () => {
  it.each([
    ['34,5', 34.5],
    ['34.5', 34.5],
    [' 35 ', 35],
    ['10', 10],
    ['300', 300],
    ['35,54', 35.5],
  ])('%s es válido y vale %s', (raw, value) => {
    expect(parseMeasure(raw)).toEqual({ ok: true, value })
  })

  it('vacío es "no cargado"', () => {
    expect(parseMeasure('')).toEqual({ ok: true, value: null })
    expect(parseMeasure('   ')).toEqual({ ok: true, value: null })
  })

  it.each(['9', '9,9', '301', '400', 'abc', '3 4', '-5', '1,2,3'])(
    '%s es inválido y explica por qué en español',
    (raw) => {
      const result = parseMeasure(raw)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message.length).toBeGreaterThan(0)
    },
  )

  it('fuera de rango dice el rango en cm', () => {
    expect(parseMeasure('301')).toEqual({ ok: false, message: 'Entre 10 y 300 cm' })
    expect(parseMeasure('9')).toEqual({ ok: false, message: 'Entre 10 y 300 cm' })
  })
})

describe('parseWeight', () => {
  it('19 está fuera de rango y 80.2 vale 80,2', () => {
    expect(parseWeight('19')).toEqual({ ok: false, message: 'Entre 20 y 400 kg' })
    expect(parseWeight('80.2')).toEqual({ ok: true, value: 80.2 })
  })

  it.each([
    ['20', true],
    ['400', true],
    ['401', false],
    ['', true],
    ['peso', false],
  ])('%s -> ok %s', (raw, ok) => {
    expect(parseWeight(raw).ok).toBe(ok)
  })
})

describe('mimeFromCameraFormat', () => {
  it.each([
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['JPEG', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ])('%s -> %s', (format, mime) => {
    expect(mimeFromCameraFormat(format)).toBe(mime)
  })

  it.each(['heic', 'gif', '', undefined])('%s no se puede subir', (format) => {
    expect(mimeFromCameraFormat(format)).toBeNull()
  })
})

describe('formatDiff', () => {
  it('suma con + y resta con el menos tipográfico', () => {
    expect(formatDiff(1.5, 'cm')).toBe('+1,5 cm')
    expect(formatDiff(-0.5, 'cm')).toBe('−0,5 cm')
    expect(formatDiff(-0.5, 'cm').charCodeAt(0)).toBe(0x2212)
  })

  it('cero y casi cero valen "0"', () => {
    expect(formatDiff(0, 'cm')).toBe('0 cm')
    expect(formatDiff(-0.04, 'kg')).toBe('0 kg')
  })

  it('un entero no lleva decimales y respeta la unidad', () => {
    expect(formatDiff(2, 'kg')).toBe('+2 kg')
    expect(formatDiff(-3, 'cm')).toBe('−3 cm')
  })

  it('formatNumberEs usa coma', () => {
    expect(formatNumberEs(35.5)).toBe('35,5')
    expect(formatNumberEs(36)).toBe('36')
  })
})

describe('uploadFailureText', () => {
  it.each<[UploadFailureKind, boolean]>([
    ['offline', true],
    ['unavailable', true],
    ['storage', true],
    ['rejected', false],
    ['cancelled', false],
  ])('%s: reintentable %s', (kind, retryable) => {
    expect(isRetryable(kind)).toBe(retryable)
  })

  it('503 (unavailable) dice que se guardan las medidas y se sacan después', () => {
    expect(uploadFailureText('unavailable')).toBe(UNAVAILABLE_PHOTO_TEXT)
    expect(UNAVAILABLE_PHOTO_TEXT).toContain('Las fotos no están disponibles por ahora')
  })

  it('storage invita a reintentar', () => {
    expect(uploadFailureText('storage')).toBe(STORAGE_PHOTO_TEXT)
  })

  it('rejected muestra el mensaje del servidor, o uno fijo si viene vacío', () => {
    expect(uploadFailureText('rejected', 'La foto es demasiado pesada')).toBe(
      'La foto es demasiado pesada',
    )
    expect(uploadFailureText('rejected', '  ')).toBe(REJECTED_PHOTO_TEXT)
    expect(uploadFailureText('rejected')).toBe(REJECTED_PHOTO_TEXT)
  })
})

describe('toUploadFile', () => {
  it('arma un File (no un Blob) con el mime y la extensión de la pose', () => {
    const file = toUploadFile('aGVsbG8=', 'image/png', 'perfil')
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('perfil.png')
    expect(file.type).toBe('image/png')
    expect(file.size).toBe(5)
  })

  it('tolera el prefijo data: y los saltos de línea', () => {
    const file = toUploadFile('data:image/jpeg;base64,aGVs\nbG8=', 'image/jpeg', 'frente')
    expect(file.name).toBe('frente.jpg')
    expect(file.size).toBe(5)
  })

  it('un base64 inválido tira', () => {
    expect(() => toUploadFile('%%%', 'image/webp', 'espalda')).toThrow()
  })
})

function checkView(overrides: Partial<BodyCheckView>): BodyCheckView {
  return {
    id: 1,
    checkDate: '2026-10-21',
    kind: 'dia0',
    photos: { frente: false, perfil: false, espalda: false },
    armCm: null,
    chestCm: null,
    shouldersCm: null,
    waistCm: null,
    weightKg: null,
    ...overrides,
  }
}

describe('buildMeasuresBody', () => {
  it('manda solo los campos cargados, con coma o punto', () => {
    const result = buildMeasuresBody({
      ...emptyDrafts(),
      arm: '34,5',
      waist: '80.2',
      weight: '70',
    })
    expect(result).toEqual({
      ok: true,
      body: { armCm: 34.5, waistCm: 80.2, weightKg: 70 },
      filled: 3,
    })
  })

  it('todo vacío es válido y no manda nada (filled 0)', () => {
    expect(buildMeasuresBody(emptyDrafts())).toEqual({ ok: true, body: {}, filled: 0 })
  })

  it('junta TODOS los errores y no manda body', () => {
    const result = buildMeasuresBody({ ...emptyDrafts(), arm: '9', chest: 'x', weight: '19' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['arm', 'chest', 'weight'])
      expect(result.errors.weight).toBe('Entre 20 y 400 kg')
      expect(result.errors.arm).toBe('Entre 10 y 300 cm')
    }
  })

  it('el peso usa el rango del peso y no el de los perímetros', () => {
    expect(buildMeasuresBody({ ...emptyDrafts(), weight: '350' }).ok).toBe(true)
    expect(buildMeasuresBody({ ...emptyDrafts(), arm: '350' }).ok).toBe(false)
  })

  it('hay 4 perímetros y el peso, en ese orden', () => {
    expect(MEASURE_FIELDS.map((f) => [f.key, f.unit])).toEqual([
      ['arm', 'cm'],
      ['chest', 'cm'],
      ['shoulders', 'cm'],
      ['waist', 'cm'],
      ['weight', 'kg'],
    ])
  })
})

describe('draftsFromCheck', () => {
  it('sin control, campos vacíos', () => {
    expect(draftsFromCheck(null)).toEqual(emptyDrafts())
  })

  it('precarga lo guardado en formato argentino', () => {
    expect(draftsFromCheck(checkView({ armCm: 31.5, waistCm: 80, weightKg: 70.2 }))).toEqual({
      arm: '31,5',
      chest: '',
      shoulders: '',
      waist: '80',
      weight: '70,2',
    })
  })
})

describe('control de hoy en la lista', () => {
  it('localIsoDate arma YYYY-MM-DD con el reloj local', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localIsoDate(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31')
  })

  it('findTodayCheck devuelve el de la fecha de hoy o null', () => {
    const checks = [
      checkView({ id: 3, checkDate: '2026-10-21', kind: 'periodico' }),
      checkView({ id: 1, checkDate: '2026-09-23' }),
    ]
    expect(findTodayCheck(checks, '2026-10-21')?.id).toBe(3)
    expect(findTodayCheck(checks, '2026-10-22')).toBeNull()
    expect(findTodayCheck([], '2026-10-21')).toBeNull()
  })
})

describe('comparador', () => {
  const compare: CheckComparison = {
    from: { id: 1, checkDate: '2026-09-23' },
    to: { id: 3, checkDate: '2026-10-21' },
    weeks: 4,
    measures: [
      { key: 'arm', label: 'Brazo', from: 30, to: 31.5, diff: 1.5 },
      { key: 'chest', label: 'Pecho', from: 100, to: 99.5, diff: -0.5 },
      { key: 'shoulders', label: 'Hombros', from: null, to: 120, diff: null },
      { key: 'waist', label: 'Cintura', from: 82, to: 82, diff: 0 },
      { key: 'weight', label: 'Peso', from: 70, to: 72.5, diff: 2.5 },
    ],
  }

  it('títulos de las hornacinas', () => {
    expect(fromLabel({ kind: 'dia0' })).toBe('Día 0')
    expect(fromLabel({ kind: 'periodico' })).toBe('Primer control')
    expect(toLabel(4)).toBe('Semana 4')
    expect(toLabel(0)).toBe('Hoy')
  })

  it('las filas llevan el cambio con signo y la unidad de cada medida', () => {
    expect(measureRows(compare).map((r) => [r.key, r.from, r.to, r.change])).toEqual([
      ['arm', '30', '31,5', '+1,5 cm'],
      ['chest', '100', '99,5', '−0,5 cm'],
      ['shoulders', '—', '120', '—'],
      ['waist', '82', '82', '0 cm'],
      ['weight', '70', '72,5', '+2,5 kg'],
    ])
  })
})
