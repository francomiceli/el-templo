#!/usr/bin/env node
/**
 * Validador de los archivos de deep links (fase 195, D-14).
 *
 * Revisa `public/.well-known/assetlinks.json` (Android App Links) y
 * `public/.well-known/apple-app-site-association` (iOS Universal Links).
 *
 * - Errores (exit 1): JSON invalido, estructura incorrecta, appID mal formado,
 *   paquete faltante o fingerprint con formato invalido.
 * - Placeholders `TODO_...` en los fingerprints: WARNING y exit 0, salvo con
 *   `--strict` (exit 1). Los fingerprints reales los copia Franco de Play
 *   Console: NO se inventan.
 *
 * Uso: node scripts/check-well-known.mjs [--strict] [--dir=<carpeta .well-known>]
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_PACKAGES = ['com.eltemplo.app', 'com.eltemplo.app.staging']
const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/
const APP_ID_RE = /^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]*$/

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const dirArg = args.find((a) => a.startsWith('--dir='))
const here = dirname(fileURLToPath(import.meta.url))
const dir = dirArg
  ? resolve(dirArg.slice('--dir='.length))
  : resolve(here, '..', 'public', '.well-known')

/** @type {string[]} */
const errors = []
/** @type {string[]} */
const warnings = []

function readJson(name) {
  const file = join(dir, name)
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    errors.push(`${name}: no se pudo leer como JSON valido (${reason})`)
    return null
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function checkAasa(json) {
  if (!isRecord(json) || !isRecord(json.applinks) || !Array.isArray(json.applinks.details)) {
    errors.push('apple-app-site-association: falta applinks.details[]')
    return
  }
  const details = json.applinks.details
  if (details.length === 0) {
    errors.push('apple-app-site-association: applinks.details esta vacio')
    return
  }
  details.forEach((detail, i) => {
    const label = `apple-app-site-association: details[${i}]`
    if (!isRecord(detail)) {
      errors.push(`${label} no es un objeto`)
      return
    }
    if (typeof detail.appID !== 'string' || !APP_ID_RE.test(detail.appID)) {
      errors.push(
        `${label}.appID debe tener formato <TEAMID>.<bundle> (recibido: ${JSON.stringify(detail.appID)})`,
      )
    }
    const paths = detail.paths
    if (
      !Array.isArray(paths) ||
      paths.length === 0 ||
      paths.some((p) => typeof p !== 'string' || p.length === 0)
    ) {
      errors.push(`${label}.paths debe ser un array no vacio de strings`)
    }
  })
}

function checkAssetlinks(json) {
  if (!Array.isArray(json)) {
    errors.push('assetlinks.json: debe ser un array de statements')
    return
  }
  const seen = new Set()
  json.forEach((statement, i) => {
    const target = isRecord(statement) ? statement.target : null
    if (
      !isRecord(target) ||
      target.namespace !== 'android_app' ||
      typeof target.package_name !== 'string'
    ) {
      errors.push(`assetlinks.json: statement[${i}] sin target android_app/package_name`)
      return
    }
    const pkg = target.package_name
    seen.add(pkg)
    const prints = target.sha256_cert_fingerprints
    if (!Array.isArray(prints) || prints.length === 0) {
      errors.push(`assetlinks.json: ${pkg} no tiene sha256_cert_fingerprints`)
      return
    }
    for (const fp of prints) {
      if (typeof fp !== 'string') {
        errors.push(`assetlinks.json: ${pkg} tiene un fingerprint que no es string`)
      } else if (fp.startsWith('TODO_')) {
        warnings.push(
          `assetlinks.json: ${pkg} todavia tiene un fingerprint TODO (${fp.split(':')[0]}), lo carga Franco desde Play Console`,
        )
      } else if (!FINGERPRINT_RE.test(fp)) {
        errors.push(
          `assetlinks.json: ${pkg} fingerprint con formato invalido (esperado 32 pares hex en mayuscula separados por ":")`,
        )
      }
    }
  })
  for (const pkg of REQUIRED_PACKAGES) {
    if (!seen.has(pkg)) errors.push(`assetlinks.json: falta el paquete ${pkg}`)
  }
}

const aasa = readJson('apple-app-site-association')
if (aasa !== null) checkAasa(aasa)
const assetlinks = readJson('assetlinks.json')
if (assetlinks !== null) checkAssetlinks(assetlinks)

for (const w of warnings) process.stdout.write(`WARNING ${w}\n`)
for (const e of errors) process.stderr.write(`ERROR ${e}\n`)

if (errors.length > 0) {
  process.stderr.write(`check-well-known: ${errors.length} error(es)\n`)
  process.exit(1)
}
if (strict && warnings.length > 0) {
  process.stderr.write(
    `check-well-known --strict: ${warnings.length} fingerprint(s) TODO sin completar\n`,
  )
  process.exit(1)
}
process.stdout.write(
  warnings.length > 0
    ? `check-well-known: OK con ${warnings.length} warning(s)\n`
    : 'check-well-known: OK\n',
)
