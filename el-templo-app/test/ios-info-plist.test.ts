import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// En iOS, `Camera.getPhoto()` de @capacitor/camera revisa que el Info.plist tenga TODAS las
// claves de `CameraPropertyListKeys` antes de abrir la cámara o la galería. Si falta una,
// rechaza al instante ("You are missing ... in your Info.plist file"), aunque la app nunca
// use ese permiso. Pasó con NSPhotoLibraryAddUsageDescription (sacada en d056957ea, mayo
// 2026): foto de perfil, Desafío de la Barra y control físico de Conquer quedaron rotos en
// iPhone hasta 1.9.9. Las claves se leen del código Swift del plugin instalado, así que si
// una versión nueva del plugin exige otra, este test lo avisa.

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const infoPlist = readFileSync(join(appRoot, 'src-capacitor/ios/App/App/Info.plist'), 'utf8')

function cameraPluginRequiredKeys(): string[] {
  const require = createRequire(import.meta.url)
  const pluginRoot = dirname(require.resolve('@capacitor/camera/package.json'))
  const swift = readFileSync(join(pluginRoot, 'ios/Sources/CameraPlugin/CameraTypes.swift'), 'utf8')
  const enumBody = /enum CameraPropertyListKeys[^{]*\{([\s\S]*?)\n\s*var /.exec(swift)?.[1] ?? ''
  return [...enumBody.matchAll(/case \w+ = "(NS\w+UsageDescription)"/g)].map((m) => m[1] as string)
}

function hasNonEmptyKey(plist: string, key: string): boolean {
  const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist)
  return (match?.[1]?.trim().length ?? 0) > 0
}

describe('iOS Info.plist', () => {
  it('lee las claves que exige @capacitor/camera (sanity check del parser)', () => {
    const keys = cameraPluginRequiredKeys()
    expect(keys).toEqual(
      expect.arrayContaining([
        'NSCameraUsageDescription',
        'NSPhotoLibraryUsageDescription',
        'NSPhotoLibraryAddUsageDescription',
      ]),
    )
  })

  it.each(cameraPluginRequiredKeys())('tiene %s con texto (si falta, getPhoto falla en iPhone)', (key) => {
    expect(hasNonEmptyKey(infoPlist, key)).toBe(true)
  })

  it('tiene NSMicrophoneUsageDescription (grabar videos para el coach en Conquer)', () => {
    expect(hasNonEmptyKey(infoPlist, 'NSMicrophoneUsageDescription')).toBe(true)
  })
})
