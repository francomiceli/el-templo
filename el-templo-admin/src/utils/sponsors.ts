/**
 * Helpers PUROS del editor de patrocinadores (Fase 199, sin Vue/Quasar).
 *
 * Los límites y las reglas espejan las del server (el-templo-api/src/modules/
 * sponsors/schemas.ts y service.ts `validateBrand`): el admin valida en el
 * cliente para dar feedback inmediato, pero el server revalida SIEMPRE y su
 * mensaje de error (400) es el que manda si llega.
 */
import type {
  AdminSponsor,
  SponsorCountry,
  SponsorFormInput,
  SponsorRedeemType,
} from 'src/composables/useSponsorsApi';
import { MIN_TEXT_CONTRAST, contrastRatio, formatRatio, isHexColor } from 'src/utils/contrast';

/** Largos máximos (espejo de `sponsorBodyProperties` del API). */
export const SPONSOR_LIMITS = {
  name: 60,
  category: 60,
  benefit: 12,
  detail: 80,
  conditions: 600,
  redeemCode: 40,
} as const;

/** Piso del tamaño del beneficio (px): bajo este valor solo queda la elipsis del CSS. */
export const SPONSOR_BENEFIT_MIN_PX = 16;

/**
 * Tamaño inicial (px) del beneficio según su largo en caracteres (no en bytes):
 * hasta 8 → 30, 9-10 → 26, 11 o más → 22.
 *
 * Espejo de `el-templo-app/src/modules/progression/utils/sponsors.ts`: la vista
 * previa tiene que verse igual que la card (UAT D6). Cambiar los dos juntos.
 */
export function sponsorBenefitFontPx(benefit: string): number {
  const len = Array.from(benefit.trim()).length;
  if (len <= 8) return 30;
  if (len <= 10) return 26;
  return 22;
}

/**
 * Ajuste por medición: devuelve el primer tamaño desde `startPx` bajando de a 1 px
 * para el que `fits(px)` es verdadero. Si ninguno entra, devuelve `floorPx`. Nunca
 * devuelve más que `startPx`. El beneficio nunca se corta (UAT D6): glifos anchos
 * (M, W) no entran con un tamaño fijo, así que se mide el elemento real.
 *
 * Espejo de `el-templo-app/src/modules/progression/utils/sponsors.ts`.
 */
export function fitBenefitFontPx(
  startPx: number,
  fits: (px: number) => boolean,
  floorPx = SPONSOR_BENEFIT_MIN_PX
): number {
  if (startPx <= floorPx) return startPx;
  for (let px = startPx; px >= floorPx; px--) {
    if (fits(px)) return px;
  }
  return floorPx;
}

export const SPONSOR_COUNTRY_OPTIONS: { label: string; value: SponsorCountry }[] = [
  { label: 'Argentina', value: 'AR' },
  { label: 'España', value: 'ES' },
];

export const REDEEM_TYPE_OPTIONS: { label: string; value: SponsorRedeemType }[] = [
  { label: 'Código', value: 'code' },
  { label: 'Mostrá tu carnet', value: 'carnet' },
];

const REDEEM_CODE_REGEX = /^[A-Za-z0-9_-]{1,40}$/;
const ICON_REGEX = /^[a-z0-9_]{1,40}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Iniciales para el fallback sin logo: 2 primeras palabras en mayúscula; con
 * una sola palabra, sus 2 primeras letras. Misma regla que la app del socio.
 */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('').toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join('')
    .toUpperCase();
}

export function emptySponsorForm(): SponsorFormInput {
  return {
    name: '',
    category: '',
    logoUrl: null,
    icon: null,
    bgColor: '#3d3732',
    textColor: '#f2ede5',
    benefit: '',
    detail: '',
    conditions: null,
    redeemType: 'carnet',
    redeemCode: null,
    countries: ['AR'],
    startsOn: null,
    endsOn: null,
    isActive: false,
    sortOrder: 0,
    partnerId: null,
  };
}

export function sponsorToForm(s: AdminSponsor): SponsorFormInput {
  return {
    name: s.name,
    category: s.category,
    logoUrl: s.logoUrl,
    icon: s.icon,
    bgColor: s.bgColor,
    textColor: s.textColor,
    benefit: s.benefit,
    detail: s.detail,
    conditions: s.conditions,
    redeemType: s.redeemType,
    redeemCode: s.redeemCode,
    countries: [...s.countries],
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    isActive: s.isActive,
    sortOrder: s.sortOrder,
    partnerId: s.partnerId,
  };
}

function trimmedOrNull(value: string | null): string | null {
  if (value === null) return null;
  const t = value.trim();
  return t === '' ? null : t;
}

/**
 * Forma lista para enviar: obligatorios con trim, opcionales vacíos -> `null`
 * (el API rechaza `""` en `redeemCode`/`icon`/fechas por sus patrones) y países
 * ordenados. Se usa tanto en el alta como de base del diff.
 */
export function normalizeSponsorForm(form: SponsorFormInput): SponsorFormInput {
  return {
    ...form,
    name: form.name.trim(),
    category: form.category.trim(),
    benefit: form.benefit.trim(),
    detail: form.detail.trim(),
    logoUrl: trimmedOrNull(form.logoUrl),
    icon: trimmedOrNull(form.icon),
    conditions: trimmedOrNull(form.conditions),
    redeemCode: trimmedOrNull(form.redeemCode),
    startsOn: trimmedOrNull(form.startsOn),
    endsOn: trimmedOrNull(form.endsOn),
    countries: [...form.countries].sort(),
  };
}

function sameCountries(a: SponsorCountry[], b: SponsorCountry[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((c) => setB.has(c));
}

/**
 * PUT parcial: solo los campos cambiados respecto de la marca original.
 * `countries` se compara como conjunto; los opcionales vacíos cuentan como
 * `null` (así "" sobre un null no genera un cambio falso).
 */
export function diffSponsorForm(
  original: AdminSponsor,
  form: SponsorFormInput
): Partial<SponsorFormInput> {
  const before = normalizeSponsorForm(sponsorToForm(original));
  const after = normalizeSponsorForm(form);
  const changes: Partial<SponsorFormInput> = {};

  function assign<K extends keyof SponsorFormInput>(key: K): void {
    if (before[key] !== after[key]) changes[key] = after[key];
  }

  assign('name');
  assign('category');
  assign('logoUrl');
  assign('icon');
  assign('bgColor');
  assign('textColor');
  assign('benefit');
  assign('detail');
  assign('conditions');
  assign('redeemType');
  assign('redeemCode');
  assign('startsOn');
  assign('endsOn');
  assign('isActive');
  assign('sortOrder');
  assign('partnerId');
  if (!sameCountries(before.countries, after.countries)) changes.countries = after.countries;

  return changes;
}

function isRealDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Mensajes de error (español) del formulario; vacío = válido. El server revalida. */
export function validateSponsorForm(form: SponsorFormInput): string[] {
  const f = normalizeSponsorForm(form);
  const errors: string[] = [];

  const required: [string, string, number][] = [
    ['El nombre', f.name, SPONSOR_LIMITS.name],
    ['El rubro', f.category, SPONSOR_LIMITS.category],
    ['El beneficio', f.benefit, SPONSOR_LIMITS.benefit],
    ['El detalle', f.detail, SPONSOR_LIMITS.detail],
  ];
  for (const [label, value, max] of required) {
    if (value === '') errors.push(`${label} no puede estar vacío`);
    else if (value.length > max) errors.push(`${label} puede tener hasta ${max} caracteres`);
  }

  if (f.conditions !== null && f.conditions.length > SPONSOR_LIMITS.conditions) {
    errors.push(`Las condiciones pueden tener hasta ${SPONSOR_LIMITS.conditions} caracteres`);
  }
  if (f.icon !== null && !ICON_REGEX.test(f.icon)) {
    errors.push('El ícono solo admite minúsculas, números y guion bajo');
  }
  if (f.logoUrl !== null && !f.logoUrl.startsWith('https://')) {
    errors.push('El logo tiene que ser una URL https');
  }

  const bgOk = isHexColor(f.bgColor);
  const textOk = isHexColor(f.textColor);
  if (!bgOk) errors.push('El color de fondo tiene que ser #rrggbb');
  if (!textOk) errors.push('El color de texto tiene que ser #rrggbb');
  if (bgOk && textOk) {
    const ratio = contrastRatio(f.bgColor, f.textColor);
    if (ratio < MIN_TEXT_CONTRAST) {
      errors.push(`Contraste ${formatRatio(ratio)}: tiene que ser al menos ${MIN_TEXT_CONTRAST}:1`);
    }
  }

  if (f.redeemType === 'code') {
    if (f.redeemCode === null) errors.push('Las marcas con código de canje necesitan el código');
    else if (!REDEEM_CODE_REGEX.test(f.redeemCode)) {
      errors.push('El código solo admite letras, números, guion y guion bajo (hasta 40)');
    }
  } else if (f.redeemCode !== null && !REDEEM_CODE_REGEX.test(f.redeemCode)) {
    errors.push('El código solo admite letras, números, guion y guion bajo (hasta 40)');
  }

  if (f.countries.length === 0) errors.push('Elegí al menos un país');

  for (const [label, date] of [
    ['inicio', f.startsOn],
    ['fin', f.endsOn],
  ] as const) {
    if (date !== null && !isRealDate(date)) errors.push(`La fecha de ${label} no es válida`);
  }
  if (
    f.startsOn &&
    f.endsOn &&
    isRealDate(f.startsOn) &&
    isRealDate(f.endsOn) &&
    f.startsOn > f.endsOn
  ) {
    errors.push('La fecha de inicio no puede ser posterior a la de fin');
  }

  return errors;
}
