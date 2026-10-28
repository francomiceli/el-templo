import { describe, it, expect, beforeEach } from 'vitest'
import {
  FIRST_TOUCH_KEY,
  buildSignupAttribution,
  captureFirstTouch,
  registerHeaderText,
  toSignupPlatform,
} from '../attribution'

/** Storage falso en memoria. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    data,
  }
}

const NOW = 1760000000000

describe('FIRST_TOUCH_KEY', () => {
  it('es la clave versionada acordada (distinta de la de la web, que es et_ft_v1)', () => {
    expect(FIRST_TOUCH_KEY).toBe('et_ft_app_v1')
  })
})

describe('captureFirstTouch', () => {
  let storage: ReturnType<typeof fakeStorage>
  beforeEach(() => {
    storage = fakeStorage()
  })

  it('guarda el first-touch con ts cuando hay utm/fbclid y el storage está vacío', () => {
    const saved = captureFirstTouch({ utm_source: 'meta', fbclid: 'x' }, '', storage, NOW)
    expect(saved).toBe(true)
    expect(JSON.parse(storage.data.get(FIRST_TOUCH_KEY) as string)).toEqual({
      utm_source: 'meta',
      fbclid: 'x',
      ft: String(NOW),
    })
  })

  it('una segunda llamada con otra query NO lo pisa', () => {
    captureFirstTouch({ utm_source: 'meta' }, '', storage, NOW)
    const again = captureFirstTouch({ utm_source: 'google', gclid: 'g' }, '', storage, NOW + 5000)
    expect(again).toBe(false)
    expect(JSON.parse(storage.data.get(FIRST_TOUCH_KEY) as string)).toEqual({
      utm_source: 'meta',
      ft: String(NOW),
    })
  })

  it('sin ningún dato de origen no guarda nada', () => {
    expect(captureFirstTouch({}, '', storage, NOW)).toBe(false)
    expect(captureFirstTouch({ branchId: '3', foo: 'bar' }, '', storage, NOW)).toBe(false)
    expect(storage.data.size).toBe(0)
  })

  it('landing, fbp o ft solos no cuentan como origen', () => {
    expect(
      captureFirstTouch(
        { landing: '/sedes/x/', fbp: 'fb.1.2.3', ft: '1760000000000' },
        '',
        storage,
        NOW,
      ),
    ).toBe(false)
    expect(storage.data.size).toBe(0)
  })

  it.each(['gclid', 'promo', 'src_ref', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'])(
    '%s solo ya cuenta como origen',
    (key) => {
      expect(captureFirstTouch({ [key]: 'valor' }, '', storage, NOW)).toBe(true)
    },
  )

  it('un referrer externo cuenta y se guarda como src_ref (host)', () => {
    const saved = captureFirstTouch({}, 'https://l.instagram.com/?u=abc', storage, NOW)
    expect(saved).toBe(true)
    expect(JSON.parse(storage.data.get(FIRST_TOUCH_KEY) as string)).toEqual({
      src_ref: 'l.instagram.com',
      ft: String(NOW),
    })
  })

  it('un referrer interno (eltemplo.org, www, app) o inválido no cuenta', () => {
    for (const referrer of [
      'https://eltemplo.org/sedes/x',
      'https://www.eltemplo.org/',
      'https://app.eltemplo.org/login',
      'no es una url',
      '',
    ]) {
      expect(captureFirstTouch({}, referrer, storage, NOW)).toBe(false)
    }
    expect(storage.data.size).toBe(0)
  })

  it('eltemplo.org.evil.com y noeltemplo.org son externos', () => {
    expect(captureFirstTouch({}, 'https://eltemplo.org.evil.com/', storage, NOW)).toBe(true)
    storage.data.clear()
    expect(captureFirstTouch({}, 'https://noeltemplo.org/', storage, NOW)).toBe(true)
  })

  it('el host del referrer se guarda en minúsculas y truncado a 255', () => {
    captureFirstTouch({}, 'https://L.Instagram.COM/x', storage, NOW)
    expect(JSON.parse(storage.data.get(FIRST_TOUCH_KEY) as string).src_ref).toBe('l.instagram.com')
    storage.data.clear()
    captureFirstTouch({}, `https://${'a'.repeat(300)}.com/`, storage, NOW)
    expect(JSON.parse(storage.data.get(FIRST_TOUCH_KEY) as string).src_ref).toHaveLength(255)
  })

  it('el src_ref de la query gana al referrer del documento', () => {
    captureFirstTouch({ src_ref: 'chatgpt.com' }, 'https://l.instagram.com/', storage, NOW)
    expect(JSON.parse(storage.data.get(FIRST_TOUCH_KEY) as string).src_ref).toBe('chatgpt.com')
  })

  it('conserva el ft que trae la web en vez del de ahora', () => {
    captureFirstTouch({ utm_source: 'meta', ft: '1759000000000' }, '', storage, NOW)
    expect(JSON.parse(storage.data.get(FIRST_TOUCH_KEY) as string).ft).toBe('1759000000000')
  })

  it('un ft inválido de la query se reemplaza por el de ahora', () => {
    captureFirstTouch({ utm_source: 'meta', ft: 'abc' }, '', storage, NOW)
    expect(JSON.parse(storage.data.get(FIRST_TOUCH_KEY) as string).ft).toBe(String(NOW))
  })

  it('trunca a los largos de la API y descarta claves ajenas', () => {
    captureFirstTouch(
      { utm_source: 's'.repeat(400), landing: '/' + 'a'.repeat(900), secreto: 'x' },
      '',
      storage,
      NOW,
    )
    const saved = JSON.parse(storage.data.get(FIRST_TOUCH_KEY) as string)
    expect(saved.utm_source).toHaveLength(150)
    expect(saved.landing).toHaveLength(500)
    expect(saved.secreto).toBeUndefined()
  })

  it('no lanza si el storage falla', () => {
    const roto = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(captureFirstTouch({ utm_source: 'meta' }, '', roto, NOW)).toBe(false)
    const roto2 = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => undefined,
    }
    expect(captureFirstTouch({ utm_source: 'meta' }, '', roto2, NOW)).toBe(false)
  })
})

describe('buildSignupAttribution', () => {
  it('con la query de la web arma el payload con esas claves y la plataforma', () => {
    const attribution = buildSignupAttribution(
      {
        utm_source: 'meta',
        utm_medium: 'paid',
        utm_campaign: 'jbj-octubre',
        utm_content: 'video-1',
        utm_term: 'calistenia',
        fbclid: 'abc',
        gclid: 'g1',
        src_ref: 'l.instagram.com',
        landing: '/sedes/juan-b-justo/',
        fbp: 'fb.1.1.2',
        ft: '1760000000000',
        // Claves que NO son atribución no viajan.
        branchId: '3',
        branchName: 'Juan B. Justo',
        promo: 'MES1',
      },
      fakeStorage(),
      'android',
    )
    expect(attribution).toEqual({
      utm_source: 'meta',
      utm_medium: 'paid',
      utm_campaign: 'jbj-octubre',
      utm_content: 'video-1',
      utm_term: 'calistenia',
      fbclid: 'abc',
      gclid: 'g1',
      src_ref: 'l.instagram.com',
      landing: '/sedes/juan-b-justo/',
      fbp: 'fb.1.1.2',
      ft: '1760000000000',
      platform: 'android',
    })
  })

  it('sin query pero con first-touch guardado usa el guardado', () => {
    const storage = fakeStorage()
    captureFirstTouch({ utm_source: 'instagram', fbclid: 'x' }, '', storage, NOW)
    expect(buildSignupAttribution({}, storage, 'ios')).toEqual({
      utm_source: 'instagram',
      fbclid: 'x',
      ft: String(NOW),
      platform: 'ios',
    })
  })

  it('la query actual gana al first-touch y lo completa donde falta', () => {
    const storage = fakeStorage()
    captureFirstTouch({ utm_source: 'instagram', utm_campaign: 'vieja' }, '', storage, NOW)
    expect(buildSignupAttribution({ utm_source: 'google' }, storage, 'web')).toEqual({
      utm_source: 'google',
      utm_campaign: 'vieja',
      ft: String(NOW),
      platform: 'web',
    })
  })

  it('con query vacía y sin first-touch devuelve solo la plataforma', () => {
    expect(buildSignupAttribution({}, fakeStorage(), 'web')).toEqual({ platform: 'web' })
    expect(buildSignupAttribution({ branchId: '3' }, fakeStorage(), 'android')).toEqual({
      platform: 'android',
    })
  })

  it('ft solo, sin ningún origen, no se manda', () => {
    expect(buildSignupAttribution({ ft: '1760000000000' }, fakeStorage(), 'web')).toEqual({
      platform: 'web',
    })
  })

  it('omite claves vacías o en blanco', () => {
    expect(
      buildSignupAttribution(
        { utm_source: '  ', utm_medium: '', fbclid: 'x' },
        fakeStorage(),
        'web',
      ),
    ).toEqual({ fbclid: 'x', platform: 'web' })
  })

  it('trunca a los largos del schema de la API', () => {
    const attribution = buildSignupAttribution(
      {
        utm_source: 's'.repeat(400),
        utm_medium: 'm'.repeat(151),
        utm_campaign: 'c'.repeat(151),
        utm_content: 'n'.repeat(151),
        utm_term: 't'.repeat(151),
        fbclid: 'f'.repeat(300),
        gclid: 'g'.repeat(300),
        src_ref: 'h'.repeat(300),
        landing: '/' + 'a'.repeat(700),
        fbp: 'p'.repeat(200),
      },
      fakeStorage(),
      'web',
    )
    expect(attribution.utm_source).toHaveLength(150)
    expect(attribution.utm_medium).toHaveLength(150)
    expect(attribution.utm_campaign).toHaveLength(150)
    expect(attribution.utm_content).toHaveLength(150)
    expect(attribution.utm_term).toHaveLength(150)
    expect(attribution.fbclid).toHaveLength(255)
    expect(attribution.gclid).toHaveLength(255)
    expect(attribution.src_ref).toHaveLength(255)
    expect(attribution.landing).toHaveLength(500)
    expect(attribution.fbp).toHaveLength(100)
  })

  it('saca caracteres de control de los valores', () => {
    expect(
      buildSignupAttribution({ utm_source: 'go\u0000o\ngle\u007f' }, fakeStorage(), 'web')
        .utm_source,
    ).toBe('google')
  })

  it('nunca lanza, ni con una query inválida', () => {
    expect(buildSignupAttribution(null as unknown as Record<string, unknown>, null, 'web')).toEqual(
      {
        platform: 'web',
      },
    )
  })

  it('un ft que no son dígitos (o de más de 15) se descarta: la API lo rechazaría con 400', () => {
    const attribution = buildSignupAttribution(
      { utm_source: 'meta', ft: '17600000000ab' },
      fakeStorage(),
      'web',
    )
    expect(attribution.ft).toBeUndefined()
    expect(
      buildSignupAttribution({ utm_source: 'meta', ft: '1'.repeat(16) }, fakeStorage(), 'web').ft,
    ).toBeUndefined()
  })

  it('toma el primer valor si la query trae un array y descarta no-strings', () => {
    expect(
      buildSignupAttribution(
        { utm_source: ['a', 'b'], utm_medium: 5, utm_term: null },
        fakeStorage(),
        'web',
      ),
    ).toEqual({ utm_source: 'a', platform: 'web' })
  })

  it('un first-touch manipulado en sessionStorage se revalida', () => {
    const storage = fakeStorage({
      [FIRST_TOUCH_KEY]: JSON.stringify({
        utm_source: 'x'.repeat(500),
        ft: 'no-digitos',
        otra: 'clave',
        landing: 42,
      }),
    })
    const attribution = buildSignupAttribution({}, storage, 'web')
    expect(attribution.utm_source).toHaveLength(150)
    expect(attribution.ft).toBeUndefined()
    expect(attribution.landing).toBeUndefined()
    expect(Object.keys(attribution).sort()).toEqual(['platform', 'utm_source'])
  })

  it.each(['no es json', '[1,2]', '"texto"', 'null'])(
    'un first-touch corrupto (%s) se ignora',
    (raw) => {
      expect(buildSignupAttribution({}, fakeStorage({ [FIRST_TOUCH_KEY]: raw }), 'web')).toEqual({
        platform: 'web',
      })
    },
  )

  it('sin storage (null) usa solo la query, y un storage que lanza no rompe', () => {
    expect(buildSignupAttribution({ gclid: 'g' }, null, 'web')).toEqual({
      gclid: 'g',
      platform: 'web',
    })
    const roto = {
      getItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(buildSignupAttribution({ gclid: 'g' }, roto, 'web')).toEqual({
      gclid: 'g',
      platform: 'web',
    })
  })

  it('arma el flujo completo: aterriza en otra pantalla, y luego /register sin query', () => {
    const storage = fakeStorage()
    // 1) boot al aterrizar en /login?utm_source=chatgpt.com
    captureFirstTouch({ utm_source: 'chatgpt.com' }, 'https://chatgpt.com/', storage, NOW)
    // 2) /register sin query
    const attribution = buildSignupAttribution({ branchId: '3' }, storage, 'web')
    expect(attribution.utm_source).toBe('chatgpt.com')
    expect(attribution.src_ref).toBe('chatgpt.com')
    expect(attribution.platform).toBe('web')
  })
})

describe('toSignupPlatform', () => {
  it('solo android e ios; cualquier otro valor es web', () => {
    expect(toSignupPlatform('android')).toBe('android')
    expect(toSignupPlatform('ios')).toBe('ios')
    expect(toSignupPlatform('web')).toBe('web')
    expect(toSignupPlatform('electron')).toBe('web')
    expect(toSignupPlatform('')).toBe('web')
  })
})

describe('registerHeaderText (Pitfall 14: ya no dice Park para cualquier sede)', () => {
  it('con branchName muestra esa sede', () => {
    expect(registerHeaderText({ branchId: '3', branchName: 'Juan B. Justo' })).toBe(
      'Registrarse en Juan B. Justo',
    )
    expect(registerHeaderText({ branchName: 'Constitución' })).toBe('Registrarse en Constitución')
  })

  it('con solo branchId mantiene Park (QR impresos del Park)', () => {
    expect(registerHeaderText({ branchId: '2' })).toBe('Registrarse en Park')
  })

  it('sin sede muestra el saludo genérico', () => {
    expect(registerHeaderText({})).toBe('Bienvenido al Templo')
    expect(registerHeaderText({ branchId: '' })).toBe('Bienvenido al Templo')
    expect(registerHeaderText({ branchName: '   ' })).toBe('Bienvenido al Templo')
  })

  it('trunca branchName a 60 caracteres, recorta blancos y saca caracteres de control', () => {
    const largo = registerHeaderText({ branchName: 'x'.repeat(100) })
    expect(largo).toBe(`Registrarse en ${'x'.repeat(60)}`)
    expect(registerHeaderText({ branchName: '  Alberti\n' })).toBe('Registrarse en Alberti')
  })

  it('ignora un branchName que no es string', () => {
    expect(registerHeaderText({ branchName: ['a', 'b'] })).toBe('Registrarse en a')
    expect(registerHeaderText({ branchName: 5, branchId: '1' })).toBe('Registrarse en Park')
  })
})
