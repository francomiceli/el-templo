import { describe, expect, it } from 'vitest'
import { asUploadFile } from '../upload-body'

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

async function bytesOf(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

describe('asUploadFile', () => {
  it('convierte un Blob en File (lo único que CapacitorHttp manda intacto)', async () => {
    const blob = new Blob([JPEG_BYTES], { type: 'image/jpeg' })

    const file = asUploadFile(blob, 'avatar.jpg', 'image/jpeg')

    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('avatar.jpg')
    expect(file.type).toBe('image/jpeg')
    expect(file.size).toBe(JPEG_BYTES.length)
    expect(await bytesOf(file)).toEqual(Array.from(JPEG_BYTES))
  })

  it('pone el tipo pedido aunque el Blob no traiga tipo', () => {
    const file = asUploadFile(new Blob([JPEG_BYTES]), 'avatar.jpg', 'image/jpeg')

    expect(file.type).toBe('image/jpeg')
  })

  it('devuelve el mismo File si ya tiene el tipo pedido', () => {
    const original = new File([JPEG_BYTES], 'foto.jpg', { type: 'image/jpeg' })

    expect(asUploadFile(original, 'avatar.jpg', 'image/jpeg')).toBe(original)
  })

  it('re-envuelve un File con otro tipo (el Content-Type que manda el nativo sale del File)', async () => {
    const original = new File([JPEG_BYTES], 'foto.png', { type: 'image/png' })

    const file = asUploadFile(original, 'avatar.jpg', 'image/jpeg')

    expect(file).not.toBe(original)
    expect(file.type).toBe('image/jpeg')
    expect(await bytesOf(file)).toEqual(Array.from(JPEG_BYTES))
  })

  it('un Blob vacío queda como File vacío (no inventa bytes)', () => {
    const file = asUploadFile(new Blob([]), 'avatar.jpg', 'image/jpeg')

    expect(file.size).toBe(0)
  })
})
