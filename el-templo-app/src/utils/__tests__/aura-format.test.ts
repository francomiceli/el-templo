import { describe, expect, it } from 'vitest'
import {
  formatAura,
  formatMovementDate,
  formatMovementDateLong,
  movementAriaLabel,
} from '../aura-format'

const BA = 'America/Argentina/Buenos_Aires'
// Reloj fijo: martes 2026-11-17 12:00 en Buenos Aires (15:00 UTC).
const NOW = new Date('2026-11-17T15:00:00Z')

describe('formatAura', () => {
  it('separador de miles es-AR', () => {
    expect(formatAura(1240)).toBe('1.240')
    expect(formatAura(1234567)).toBe('1.234.567')
  })

  it('cero y cifras de 4 dígitos sin perder el separador', () => {
    expect(formatAura(0)).toBe('0')
    expect(formatAura(5)).toBe('5')
    expect(formatAura(1000)).toBe('1.000')
  })
})

describe('formatMovementDate', () => {
  it('Hoy y Ayer en la zona de la sede', () => {
    expect(formatMovementDate('2026-11-17T14:00:00Z', BA, NOW)).toBe('Hoy')
    expect(formatMovementDate('2026-11-16T14:00:00Z', BA, NOW)).toBe('Ayer')
  })

  it('otra fecha del año en curso: día abreviado con mayúscula, número y mes sin punto', () => {
    // 2026-11-10 es martes.
    expect(formatMovementDate('2026-11-10T14:00:00Z', BA, NOW)).toBe('Mar 10 nov')
    // 2026-01-05 es lunes.
    expect(formatMovementDate('2026-01-05T14:00:00Z', BA, NOW)).toBe('Lun 5 ene')
  })

  it('de otro año suma el año', () => {
    // 2025-11-10 es lunes.
    expect(formatMovementDate('2025-11-10T14:00:00Z', BA, NOW)).toBe('Lun 10 nov 2025')
  })

  it('un createdAt de la 01:00 UTC cuenta en el día local de Buenos Aires', () => {
    // 2026-11-17T01:00Z = 16/11 22:00 en Buenos Aires: es "Ayer", no "Hoy".
    expect(formatMovementDate('2026-11-17T01:00:00Z', BA, NOW)).toBe('Ayer')
    // 2026-11-11T01:00Z = 10/11 22:00 en Buenos Aires.
    expect(formatMovementDate('2026-11-11T01:00:00Z', BA, NOW)).toBe('Mar 10 nov')
  })

  it('el "hoy" es el de la sede aunque en UTC ya sea otro día', () => {
    // 2026-11-18T01:00Z = 17/11 22:00 en Buenos Aires: sigue siendo "Hoy".
    expect(formatMovementDate('2026-11-17T20:00:00Z', BA, new Date('2026-11-18T01:00:00Z'))).toBe(
      'Hoy',
    )
  })

  it('una fecha ilegible no rompe', () => {
    expect(formatMovementDate('basura', BA, NOW)).toBe('')
  })
})

describe('formatMovementDateLong', () => {
  it('hoy y ayer en minúscula', () => {
    expect(formatMovementDateLong('2026-11-17T14:00:00Z', BA, NOW)).toBe('hoy')
    expect(formatMovementDateLong('2026-11-16T14:00:00Z', BA, NOW)).toBe('ayer')
  })

  it('día de la semana, número y mes en letras', () => {
    // 2025-11-06 es jueves.
    expect(formatMovementDateLong('2025-11-06T14:00:00Z', BA, NOW)).toBe(
      'jueves 6 de noviembre de 2025',
    )
    // 2026-11-10 es martes.
    expect(formatMovementDateLong('2026-11-10T14:00:00Z', BA, NOW)).toBe('martes 10 de noviembre')
  })
})

describe('movementAriaLabel', () => {
  it('monto positivo: "más N"', () => {
    expect(movementAriaLabel({ label: 'Asistencia a clase', amount: 5 }, 'Hoy')).toBe(
      'Asistencia a clase, hoy, más 5',
    )
  })

  it('monto negativo: "menos N" con la fecha larga', () => {
    expect(
      movementAriaLabel({ label: 'Asistencia anulada', amount: -5 }, 'jueves 6 de noviembre'),
    ).toBe('Asistencia anulada, jueves 6 de noviembre, menos 5')
  })

  it('usa el separador de miles', () => {
    expect(movementAriaLabel({ label: 'Hito', amount: 1240 }, 'ayer')).toBe('Hito, ayer, más 1.240')
  })
})
