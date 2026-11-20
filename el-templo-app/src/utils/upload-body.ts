/**
 * Cuerpo de un PUT binario (foto, video) a una URL firmada que llegue intacto también en la app
 * nativa.
 *
 * La app activa `CapacitorHttp` (`src-capacitor/capacitor.config.ts`), que en Android e iOS
 * reemplaza `window.fetch`. Su conversión del cuerpo (`convertBody` del native-bridge) solo manda
 * los bytes tal cual cuando el cuerpo es un `File`: lo lee en base64 y el lado nativo lo
 * decodifica. Un `Blob` suelto cae en la rama "json" y al bucket llega `{}`; un `Uint8Array` se
 * decodifica como texto y rompe los bytes. En el navegador `fetch` es el nativo y un `File` anda
 * igual que un `Blob`.
 *
 * Incidente (2026-11-20): la foto de perfil se subía como `Blob`. En la web (staging) andaba; en la
 * app de las tiendas todos los `confirm` daban 400 ("No pudimos procesar la foto") porque el
 * servidor recibía `{}` en vez de un JPEG.
 */
export function asUploadFile(body: Blob, name: string, type: string): File {
  if (body instanceof File && body.type === type) return body
  return new File([body], name, { type })
}
