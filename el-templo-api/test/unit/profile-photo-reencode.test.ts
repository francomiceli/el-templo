/**
 * Re-codificación de la foto de perfil (fase 215, decisión 5 / 214 ME-04).
 *
 * Función pura: se prueba con imágenes que genera `sharp` en memoria, sin
 * storage ni base. La prueba central es la de privacidad: una foto con EXIF y
 * GPS sale sin ningún metadato.
 */
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  InvalidPhotoError,
  PHOTO_MAX_SIDE_PX,
  hasJpegSignature,
  reencodeProfilePhoto,
} from "../../src/modules/members/photo-reencode";

/** JPEG con EXIF y GPS (ubicación en Mar del Plata) y orientación opcional. */
async function jpegConUbicacion(
  width: number,
  height: number,
  orientation?: number,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 90, b: 60 },
    },
  })
    .withExif({
      IFD0: { Copyright: "dato personal", Artist: "Alumno de prueba" },
      IFD3: {
        GPSLatitudeRef: "S",
        GPSLatitude: "38/1 0/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "57/1 33/1 0/1",
      },
    })
    .withMetadata(orientation === undefined ? {} : { orientation })
    .jpeg()
    .toBuffer();
}

describe("reencodeProfilePhoto", () => {
  it("la imagen de entrada realmente trae EXIF (control de la prueba)", async () => {
    const original = await jpegConUbicacion(200, 100);
    const meta = await sharp(original).metadata();
    expect(meta.exif).toBeDefined();
    expect(original.includes(Buffer.from("Alumno de prueba"))).toBe(true);
  });

  it("después de re-codificar no queda EXIF, GPS ni perfil de metadatos", async () => {
    const original = await jpegConUbicacion(200, 100);

    const limpia = await reencodeProfilePhoto(original);
    const meta = await sharp(limpia).metadata();

    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(limpia.includes(Buffer.from("Alumno de prueba"))).toBe(false);
    expect(limpia.includes(Buffer.from("dato personal"))).toBe(false);
    expect(limpia.includes(Buffer.from("GPS"))).toBe(false);
  });

  it("aplica la orientación EXIF: una foto de costado sale derecha y sin etiqueta de orientación", async () => {
    // 200 de ancho x 100 de alto con orientación 6 (girar 90 grados): se ve 100 x 200.
    const original = await jpegConUbicacion(200, 100, 6);
    const antes = await sharp(original).metadata();
    expect(antes.orientation).toBe(6);

    const limpia = await reencodeProfilePhoto(original);
    const despues = await sharp(limpia).metadata();

    expect(despues.width).toBe(100);
    expect(despues.height).toBe(200);
    expect(despues.orientation).toBeUndefined();
  });

  it("limita el lado mayor a 1024 px sin deformar", async () => {
    const grande = await jpegConUbicacion(3000, 1500);

    const limpia = await reencodeProfilePhoto(grande);
    const meta = await sharp(limpia).metadata();

    expect(meta.width).toBe(PHOTO_MAX_SIDE_PX);
    expect(meta.height).toBe(512);
  });

  it("no agranda una foto chica", async () => {
    const chica = await jpegConUbicacion(300, 200);

    const limpia = await reencodeProfilePhoto(chica);
    const meta = await sharp(limpia).metadata();

    expect(meta.width).toBe(300);
    expect(meta.height).toBe(200);
  });

  it("rechaza un archivo que no es una imagen aunque venga etiquetado como JPEG", async () => {
    await expect(
      reencodeProfilePhoto(Buffer.from("esto no es una foto, es texto")),
    ).rejects.toBeInstanceOf(InvalidPhotoError);
    await expect(reencodeProfilePhoto(Buffer.alloc(0))).rejects.toBeInstanceOf(
      InvalidPhotoError,
    );
  });

  it("rechaza un PNG: la app solo sube JPEG", async () => {
    const png = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .png()
      .toBuffer();

    await expect(reencodeProfilePhoto(png)).rejects.toBeInstanceOf(
      InvalidPhotoError,
    );
  });

  it("rechaza un JPEG con la firma pero con el cuerpo corrupto, sin filtrar el error de sharp", async () => {
    const corrupto = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from("basura que no es un jpeg de verdad"),
    ]);

    const error = await reencodeProfilePhoto(corrupto).catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(InvalidPhotoError);
    expect((error as Error).message).toBe("La foto no es una imagen válida");
  });
});

describe("hasJpegSignature", () => {
  it("reconoce FF D8 FF y nada más", () => {
    expect(hasJpegSignature(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe(true);
    expect(hasJpegSignature(Buffer.from([0xff, 0xd8]))).toBe(false);
    expect(hasJpegSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(hasJpegSignature(new Uint8Array())).toBe(false);
  });
});
