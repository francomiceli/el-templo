import { describe, expect, it } from 'vitest'
import { GIFT_REASONS, giftReasonLabel } from 'src/constants/gift-reasons'
import type { GivenGift, PendingGift } from 'src/types/aura-gifts'
import {
  HIDDEN_GIFT_NOTICE,
  HIDDEN_GIFT_NOTICE_TEXT,
  blockedAriaLabel,
  candidateName,
  giftCardAriaLabel,
  giftCardHelp,
  giftCardState,
  giveErrorOutcome,
  giveSuccessMessage,
  givenTodayText,
  sheetFooterLabel,
  sheetHelp,
  sheetSubtitle,
  weeklyCapNote,
} from '../gift-view'

const HOY = '2026-11-18'
const AYER = '2026-11-17'

function pend(sessionDate: string, startTime = '18:00'): PendingGift {
  return {
    attendanceId: 1,
    sessionDate,
    startTime,
    activityName: 'Funcional',
    expiresOn: '2026-11-19',
  }
}

function given(firstName = 'Sofía', reason: GivenGift['reason'] = 'energia'): GivenGift {
  return {
    attendanceId: 9,
    receiver: { firstName, lastInitial: 'M', photoUrl: null, anonymous: false },
    reason,
    amount: 1,
  }
}

/** Regalo a alguien oculto o sin nombre: el servidor manda el nombre "" y sin inicial ni foto. */
function givenAnonymous(reason: GivenGift['reason'] = 'constancia', amount = 1): GivenGift {
  return {
    attendanceId: 10,
    receiver: { firstName: '', lastInitial: null, photoUrl: null, anonymous: true },
    reason,
    amount,
  }
}

describe('motivos', () => {
  it('tiene los cuatro motivos en orden', () => {
    expect(GIFT_REASONS.map((r) => r.code)).toEqual(['tecnica', 'constancia', 'energia', 'ayudo'])
    expect(GIFT_REASONS.map((r) => r.label)).toEqual([
      'Buena técnica',
      'Constancia',
      'Buena energía',
      'Me ayudó',
    ])
  })

  it('giftReasonLabel devuelve la etiqueta', () => {
    expect(giftReasonLabel('ayudo')).toBe('Me ayudó')
    expect(giftReasonLabel('tecnica')).toBe('Buena técnica')
  })
})

describe('giftCardState', () => {
  it('sin nada no hay fila', () => {
    expect(giftCardState([], [])).toBeNull()
  })

  it('con un pendiente ofrece el regalo', () => {
    const p = pend(HOY)
    expect(giftCardState([p], [])).toEqual({ kind: 'offer', first: p, count: 1 })
  })

  it('con pendientes y dados manda lo pendiente', () => {
    const a = pend(AYER)
    const b = pend(HOY)
    expect(giftCardState([a, b], [given()])).toEqual({ kind: 'offer', first: a, count: 2 })
  })

  it('sin pendientes y con dados muestra el primero dado', () => {
    const g = given('Sofía')
    expect(giftCardState([], [g, given('Juli')])).toEqual({ kind: 'given', gift: g })
  })
})

describe('giftCardState: oculto (#31)', () => {
  it('sin nada y con el motivo "oculto" muestra el texto para activar la visibilidad', () => {
    expect(giftCardState([], [], 'oculto')).toEqual({ kind: 'hidden' })
  })

  it('sin el motivo del servidor (null) no hay fila: la app no lo deduce', () => {
    expect(giftCardState([], [], null)).toBeNull()
    expect(giftCardState([], [])).toBeNull()
  })

  it('lo pendiente y lo dado mandan sobre el texto del oculto', () => {
    const p = pend(HOY)
    expect(giftCardState([p], [], 'oculto')).toEqual({ kind: 'offer', first: p, count: 1 })
    const g = given()
    expect(giftCardState([], [g], 'oculto')).toEqual({ kind: 'given', gift: g })
  })

  it('el texto es el de la revisión y marca en negrita el nombre del interruptor', () => {
    expect(HIDDEN_GIFT_NOTICE_TEXT).toBe(
      'Para dar Aura, activá Aparecer en las listas en tu Perfil',
    )
    expect(HIDDEN_GIFT_NOTICE.filter((part) => part.strong).map((part) => part.text)).toEqual([
      'Aparecer en las listas',
    ])
  })
})

describe('giftCardHelp', () => {
  it('clase de hoy', () => {
    expect(giftCardHelp([pend(HOY)], HOY)).toBe(
      'Tenés un regalo de Aura por la clase de hoy. Podés darlo hasta mañana a la noche.',
    )
  })

  it('clase de ayer', () => {
    expect(giftCardHelp([pend(AYER)], HOY)).toBe(
      'Tenés un regalo de Aura por la clase de ayer. Podés darlo hasta hoy a la noche.',
    )
  })

  it('dos regalos, el primero de ayer vence hoy', () => {
    expect(giftCardHelp([pend(AYER), pend(HOY)], HOY)).toBe(
      'Tenés 2 regalos de Aura para dar. El primero vence hoy a la noche.',
    )
  })

  it('dos regalos, el primero de hoy vence mañana', () => {
    expect(giftCardHelp([pend(HOY), pend(HOY, '20:00')], HOY)).toBe(
      'Tenés 2 regalos de Aura para dar. El primero vence mañana a la noche.',
    )
  })

  it('sin pendientes devuelve vacío', () => {
    expect(giftCardHelp([], HOY)).toBe('')
  })

  it('ayer cruza el cambio de mes y de año', () => {
    expect(giftCardHelp([pend('2026-02-28')], '2026-03-01')).toContain('clase de ayer')
    expect(giftCardHelp([pend('2025-12-31')], '2026-01-01')).toContain('clase de ayer')
    expect(giftCardHelp([pend('2025-12-31'), pend('2026-01-01')], '2026-01-01')).toContain(
      'vence hoy a la noche',
    )
  })
})

describe('giftCardAriaLabel', () => {
  it('de hoy', () => {
    expect(giftCardAriaLabel(pend(HOY), HOY)).toBe(
      'Dale Aura a un compañero de tu clase de hoy de las 18:00',
    )
  })

  it('de ayer', () => {
    expect(giftCardAriaLabel(pend(AYER), HOY)).toBe(
      'Dale Aura a un compañero de tu clase de ayer de las 18:00',
    )
  })

  it('acepta la hora con segundos', () => {
    expect(giftCardAriaLabel(pend(HOY, '18:00:00'), HOY)).toBe(
      'Dale Aura a un compañero de tu clase de hoy de las 18:00',
    )
  })
})

describe('textos de la fila y de la hoja', () => {
  it('givenTodayText', () => {
    expect(givenTodayText({ receiver: { firstName: 'Sofía' }, reason: 'energia' })).toBe(
      'Le diste Aura a Sofía · Buena energía',
    )
    expect(givenTodayText(given('Sofía', 'energia'))).toBe('Le diste Aura a Sofía · Buena energía')
  })

  it('givenTodayText con la otra persona oculta o sin nombre: monto y motivo, sin nombrar a nadie', () => {
    const text = givenTodayText(givenAnonymous('constancia', 1))
    expect(text).toBe('Diste 1 de Aura por Constancia')
    expect(text).not.toContain('Alguien')
    expect(text).not.toContain('Le diste')
    expect(givenTodayText(givenAnonymous('tecnica', 2))).toBe('Diste 2 de Aura por Buena técnica')
  })

  it('givenTodayText anónimo sin monto del servidor usa el valor del regalo de un alumno (1)', () => {
    expect(givenTodayText({ receiver: { firstName: '', anonymous: true }, reason: 'ayudo' })).toBe(
      'Diste 1 de Aura por Me ayudó',
    )
  })

  it('sheetSubtitle de hoy y de ayer', () => {
    expect(sheetSubtitle(pend(HOY), HOY)).toBe('Hoy 18:00 · elegí a una sola persona')
    expect(sheetSubtitle(pend(AYER), HOY)).toBe('Ayer 18:00 · elegí a una sola persona')
  })

  it('candidateName con y sin inicial', () => {
    expect(candidateName({ firstName: 'Sofía', lastInitial: 'M' })).toBe('Sofía M.')
    expect(candidateName({ firstName: 'Sofía', lastInitial: null })).toBe('Sofía')
    expect(candidateName({ firstName: 'Sofía', lastInitial: '  ' })).toBe('Sofía')
  })

  it('sheetFooterLabel según la selección', () => {
    expect(sheetFooterLabel({ person: null, reason: false, sending: false })).toBe(
      'Elegí a quién y por qué',
    )
    expect(sheetFooterLabel({ person: 'Sofía', reason: false, sending: false })).toBe(
      'Elegí un motivo',
    )
    expect(sheetFooterLabel({ person: null, reason: true, sending: false })).toBe('Elegí a quién')
    expect(sheetFooterLabel({ person: 'Sofía', reason: true, sending: false })).toBe(
      'Darle Aura a Sofía',
    )
    expect(sheetFooterLabel({ person: 'Sofía', reason: true, sending: true })).toBe('Dando Aura…')
  })

  it('sheetHelp con y sin persona', () => {
    expect(sheetHelp('Sofía')).toBe(
      'A Sofía le llega un aviso con tu nombre y el motivo. A vos no te descuenta nada.',
    )
    expect(sheetHelp(null)).toBe(
      'A esa persona le llega un aviso con tu nombre y el motivo. A vos no te descuenta nada.',
    )
  })

  it('weeklyCapNote según cuántos', () => {
    expect(weeklyCapNote([])).toBeNull()
    expect(weeklyCapNote(['Martín D.'])).toBe(
      'Martín D. ya recibió 2 regalos tuyos esta semana. Vas a poder darle de nuevo el lunes.',
    )
    expect(weeklyCapNote(['Martín D.', 'Juli S.'])).toBe(
      'Martín D. y Juli S. ya recibieron 2 regalos tuyos esta semana. Vas a poder darles de nuevo el lunes.',
    )
    expect(weeklyCapNote(['Martín D.', 'Juli S.', 'Ana P.'])).toBe(
      '3 compañeros ya recibieron 2 regalos tuyos esta semana. Vas a poder darles de nuevo el lunes.',
    )
  })

  it('blockedAriaLabel y giveSuccessMessage', () => {
    expect(blockedAriaLabel('Martín D.')).toBe('Martín D. Ya le diste 2 esta semana')
    expect(giveSuccessMessage('Sofía')).toBe('Le diste Aura a Sofía')
  })
})

describe('giveErrorOutcome', () => {
  it('tope semanal: queda abierta y vuelve a pedir candidatos', () => {
    expect(giveErrorOutcome({ status: 409, code: 'REGALO_TOPE_SEMANAL' }, 'Sofía')).toEqual({
      message: 'Ya le diste 2 a Sofía esta semana. Elegí a otra persona.',
      type: 'warning',
      close: false,
      reloadCandidates: true,
      clearSelection: false,
      reloadPending: false,
    })
  })

  it('ya dado: cierra y vuelve a pedir lo pendiente', () => {
    expect(giveErrorOutcome({ status: 409, code: 'REGALO_YA_DADO' }, 'Sofía')).toEqual({
      message: 'Ya diste el regalo de esta clase.',
      type: 'info',
      close: true,
      reloadCandidates: false,
      clearSelection: false,
      reloadPending: true,
    })
  })

  it('vencido: cierra y vuelve a pedir lo pendiente', () => {
    expect(giveErrorOutcome({ status: 409, code: 'REGALO_VENCIDO' }, 'Sofía')).toEqual({
      message: 'Se terminó el plazo para dar este regalo.',
      type: 'info',
      close: true,
      reloadCandidates: false,
      clearSelection: false,
      reloadPending: true,
    })
  })

  it('no disponible o 404: borra la elección y vuelve a pedir candidatos', () => {
    const expected = {
      message: 'Sofía ya no está en la lista. Elegí a otra persona.',
      type: 'warning',
      close: false,
      reloadCandidates: true,
      clearSelection: true,
      reloadPending: false,
    }
    expect(giveErrorOutcome({ status: 409, code: 'REGALO_NO_DISPONIBLE' }, 'Sofía')).toEqual(
      expected,
    )
    expect(giveErrorOutcome({ status: 404, code: 'REGALO_NO_ENCONTRADO' }, 'Sofía')).toEqual(
      expected,
    )
    expect(giveErrorOutcome({ status: 404 }, 'Sofía')).toEqual(expected)
  })

  it('429: queda abierta con la elección', () => {
    expect(giveErrorOutcome({ status: 429 }, 'Sofía')).toEqual({
      message: 'Esperá un momento y probá de nuevo.',
      type: 'warning',
      close: false,
      reloadCandidates: false,
      clearSelection: false,
      reloadPending: false,
    })
  })

  it('red, 5xx o código desconocido: error genérico y la hoja sigue abierta', () => {
    const expected = {
      message: 'No pudimos dar el Aura. Probá de nuevo.',
      type: 'negative',
      close: false,
      reloadCandidates: false,
      clearSelection: false,
      reloadPending: false,
    }
    expect(giveErrorOutcome({ status: null }, 'Sofía')).toEqual(expected)
    expect(giveErrorOutcome({ status: 500 }, 'Sofía')).toEqual(expected)
    expect(giveErrorOutcome({ status: 503, code: 'OTRA' }, 'Sofía')).toEqual(expected)
    expect(giveErrorOutcome({ status: 409, code: 'OTRA' }, 'Sofía')).toEqual(expected)
  })

  it('sin nombre usa una forma neutra', () => {
    expect(giveErrorOutcome({ status: 409, code: 'REGALO_TOPE_SEMANAL' }, null).message).toBe(
      'Ya le diste 2 a esa persona esta semana. Elegí a otra persona.',
    )
    expect(giveErrorOutcome({ status: 404 }, null).message).toBe(
      'Esa persona ya no está en la lista. Elegí a otra persona.',
    )
  })
})

describe('ningún texto promete privacidad (D-22)', () => {
  it('nada contiene "privad"', () => {
    const textos: string[] = [
      giftCardHelp([pend(HOY)], HOY),
      giftCardHelp([pend(AYER)], HOY),
      giftCardHelp([pend(AYER), pend(HOY)], HOY),
      giftCardAriaLabel(pend(HOY), HOY),
      givenTodayText({ receiver: { firstName: 'Sofía' }, reason: 'ayudo' }),
      sheetSubtitle(pend(HOY), HOY),
      sheetHelp('Sofía'),
      sheetHelp(null),
      sheetFooterLabel({ person: null, reason: false, sending: false }),
      weeklyCapNote(['Martín D.']) ?? '',
      weeklyCapNote(['Martín D.', 'Juli S.']) ?? '',
      weeklyCapNote(['A', 'B', 'C']) ?? '',
      blockedAriaLabel('Martín D.'),
      giveSuccessMessage('Sofía'),
      ...[
        { status: 409, code: 'REGALO_TOPE_SEMANAL' },
        { status: 409, code: 'REGALO_YA_DADO' },
        { status: 409, code: 'REGALO_VENCIDO' },
        { status: 409, code: 'REGALO_NO_DISPONIBLE' },
        { status: 404 },
        { status: 429 },
        { status: 500 },
      ].map((e) => giveErrorOutcome(e, 'Sofía').message),
    ]
    for (const t of textos) expect(t.toLowerCase()).not.toContain('privad')
  })
})
