import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Fase 201 DA-17 (T-201-103, T-201-105): la hoja de Conquer define sus tokens SOLO dentro de
// `.cq-root` y cada par texto/fondo cumple el contraste WCAG 2.x. Se lee el SCSS como texto (el
// entorno de vitest es `node`) y los neutros `#{$pd-…}` se resuelven contra `_premium-card.scss`.

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

const SCSS = read('../conquer.scss')
const PREMIUM = read('../../../../css/_premium-card.scss')
const BRAND = read('../../../../css/_brand.scss')

// Hex de la submarca: no pueden aparecer fuera de `.cq-root`
const SUBMARCA_HEX = [
  '#131d44',
  '#1f2b5c',
  '#cfae6b',
  '#f6e2a4',
  '#fdf3d3',
  '#7a5a1c',
  '#a08548',
  '#c3c9df',
]

// Reparte el SCSS entre lo que vive dentro de bloques `.cq-root { }` de primer nivel y lo demás
// (imports, keyframes, @media sueltos). Las llaves de `#{...}` van balanceadas, así que el conteo
// de profundidad no se confunde; los comentarios de línea completa se ignoran.
function splitScope(source: string): { inside: string; outside: string } {
  const text = source
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n')
  let depth = 0
  let head = ''
  let blockStart = 0
  let last = 0
  let inside = ''
  let outside = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') {
      if (depth === 0) {
        head = text.slice(last, i)
        blockStart = i
      }
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        const body = text.slice(blockStart, i + 1)
        // `head` puede traer sentencias previas (`@import …;`): el selector es lo que sigue al último `;`
        const cut = head.lastIndexOf(';') + 1
        if (head.slice(cut).trim() === '.cq-root') {
          inside += body
          outside += head.slice(0, cut)
        } else {
          outside += head + body
        }
        last = i + 1
      }
    }
  }
  outside += text.slice(last)
  return { inside, outside }
}

const { inside, outside } = splitScope(SCSS)

function normalizeHex(hex: string): string {
  const h = hex.toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(h)) return '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]
  return h
}

// Variable SCSS de un archivo (`$nombre: #hex;`)
function scssVariable(source: string, name: string): string {
  const match = source.match(new RegExp(`\\$${name}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`))
  if (!match) throw new Error(`no encuentro la variable $${name}`)
  return normalizeHex(match[1])
}

function tokenValues(block: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of block.matchAll(/(--cq-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(m[1], m[2].trim())
  }
  return map
}

const TOKENS = tokenValues(inside)

// Color de un token (`--cq-<nombre>`), resolviendo `#{$pd-…}`; `page` es el crema del app
function colorOf(name: string): string {
  if (name === 'page') return scssVariable(BRAND, 'brand-cream')
  const raw = TOKENS.get(`--cq-${name}`)
  if (raw === undefined) throw new Error(`falta el token --cq-${name} dentro de .cq-root`)
  const interpolated = raw.match(/^#\{\$([a-z0-9-]+)\}$/)
  if (interpolated) return scssVariable(PREMIUM, interpolated[1])
  if (/^#[0-9a-fA-F]{3,6}$/.test(raw)) return normalizeHex(raw)
  throw new Error(`--cq-${name} no es un color plano: ${raw}`)
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('contrast (fórmula WCAG)', () => {
  it('negro sobre blanco es 21:1', () => {
    expect(Math.round(contrast('#000000', '#ffffff') * 100) / 100).toBe(21)
  })

  it('un color sobre sí mismo es 1:1', () => {
    expect(contrast('#7a5a1c', '#7a5a1c')).toBe(1)
  })
})

describe('alcance de .cq-root (T-201-103)', () => {
  const REQUIRED = [
    'surface',
    'surface-2',
    'sand',
    'text',
    'text-2',
    'line',
    'edge',
    'field-edge',
    'sage',
    'sage-tint',
    'on-sage',
    'night',
    'night-2',
    'deco-gold',
    'text-gold',
    'edge-gold',
    'tint-cream',
    'on-night',
    'on-night-hi',
    'on-night-gold',
    'on-night-2',
    'font-body',
    'font-head',
    'font-kicker',
    'font-greek',
  ]

  it.each(REQUIRED)('--cq-%s está definido dentro de .cq-root', (name) => {
    expect(TOKENS.has(`--cq-${name}`)).toBe(true)
  })

  it('fuera de .cq-root no se define ningún token --cq-*', () => {
    expect(outside.match(/--cq-[a-z0-9-]+\s*:/g) ?? []).toEqual([])
  })

  it.each(SUBMARCA_HEX)('el hex %s no aparece fuera de .cq-root', (hex) => {
    expect(new RegExp(hex, 'i').test(outside)).toBe(false)
  })
})

// Fase 201 plan 34 (hallazgo 2): el cielo, el sol y las nubes ya no existen. Estos tokens y clases
// eran de la versión vieja (bloque LEGADO de la hoja); que no vuelvan a definirse.
const TOKENS_DEL_CIELO = [
  'sky1',
  'sky2',
  'sky3',
  'deep',
  'sun',
  'muted',
  'cloud',
  'cloud2',
  'cloud3',
  'ink',
  'ink2',
  'glass',
  'hair',
  'hair2',
  'display',
  'body',
  'pad-x',
  'pad-top',
  'pad-bottom',
  'gold',
  'gold-hi',
  'cream',
  'subir-bg',
  'subir-ink',
]

const CLASES_DEL_CIELO = [
  '.cq-foot',
  '.cq-cta',
  '.cq-display',
  '.cq-ital',
  '.cq-caps',
  '.cq-small',
  '.cq-toast',
  '.cq-link',
  '.cq-rule',
  '.cq-grow',
  '.cq-sky',
]

describe('sin restos del cielo (hallazgo 2)', () => {
  it.each(TOKENS_DEL_CIELO)('--cq-%s no está definido', (name) => {
    const definition = new RegExp(`(?<![a-z0-9-])--cq-${name}\\s*:`)
    expect(definition.test(inside + outside)).toBe(false)
  })

  it.each(CLASES_DEL_CIELO)('%s no existe como selector', (selector) => {
    const escaped = selector.replace('.', '\\.')
    expect(new RegExp(`${escaped}(?![a-z0-9_-])`).test(inside + outside)).toBe(false)
  })

  it('la hoja no tiene un bloque LEGADO', () => {
    expect(/LEGADO/.test(SCSS)).toBe(false)
  })
})

describe('tipografía (DA-15, T-201-104)', () => {
  it('no importa @fontsource (las fuentes las carga app.scss)', () => {
    expect(/@import\s+['"]@fontsource/.test(SCSS)).toBe(false)
  })

  it('no nombra Cormorant', () => {
    expect(/cormorant/i.test(SCSS)).toBe(false)
  })

  it('el kicker usa Cinzel y el resto las fuentes del app', () => {
    expect(TOKENS.get('--cq-font-kicker')).toBe("'Cinzel', serif")
    expect(TOKENS.get('--cq-font-head')).toBe("'Montserrat', sans-serif")
    expect(TOKENS.get('--cq-font-body')).toBe("'Geologica', sans-serif")
    expect(TOKENS.get('--cq-font-greek')).toBe("'Geologica', sans-serif")
  })
})

describe('contraste de los pares de tokens (T-201-105)', () => {
  // [texto, fondo, mínimo]: texto ≥ 4,5, texto sobre azul noche ≥ 7, bordes de control ≥ 3
  const PARES: [string, string, number][] = [
    ['on-night', 'night', 7],
    ['on-night-hi', 'night', 7],
    ['on-night-2', 'night', 7],
    ['on-night-gold', 'night', 4.5],
    ['text', 'surface', 4.5],
    ['text', 'sand', 4.5],
    ['text', 'page', 4.5],
    ['text-2', 'surface', 4.5],
    ['text-2', 'sand', 4.5],
    ['text-2', 'page', 4.5],
    ['text-gold', 'surface', 4.5],
    ['text-gold', 'tint-cream', 4.5],
    ['text-gold', 'page', 4.5],
    ['night', 'surface', 4.5],
    ['night', 'tint-cream', 4.5],
    ['sage', 'sage-tint', 4.5],
    ['on-sage', 'sage', 4.5],
    ['edge-gold', 'surface', 3],
    ['edge', 'surface', 3],
    ['field-edge', 'surface', 3],
  ]

  it.each(PARES)('--cq-%s sobre --cq-%s llega a %s:1', (fg, bg, min) => {
    expect(contrast(colorOf(fg), colorOf(bg))).toBeGreaterThanOrEqual(min)
  })
})
