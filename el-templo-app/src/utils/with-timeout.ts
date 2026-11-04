/**
 * Tope de espera de un pedido de red del que depende una pantalla entera (boot, perfil, semana).
 * 8 s: más que el tope visual de las cards (`LOAD_DEADLINE_MS`, 6 s) y bastante menos que los
 * 600 s de iOS.
 */
export const NETWORK_WAIT_MS = 8000

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Se dejó de esperar la respuesta tras ${ms} ms`)
    this.name = 'TimeoutError'
  }
}

/**
 * Deja de ESPERAR una promesa pasados `ms` milisegundos: rechaza con el error de `makeError`
 * (por defecto un {@link TimeoutError}). NO la cancela: el pedido sigue su curso y, si resuelve
 * tarde, su resultado se descarta acá (quien lo necesite tiene que protegerse de respuestas viejas).
 *
 * Existe porque en nativo `CapacitorHttp` reemplaza el XHR y no aplica el `timeout` de axios
 * (iOS espera hasta 600 s, Android sin límite): sin un tope propio, un pedido colgado deja la
 * pantalla cargando para siempre.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  makeError: () => Error = () => new TimeoutError(ms),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(makeError()), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
