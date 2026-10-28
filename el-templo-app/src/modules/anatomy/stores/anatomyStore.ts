import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import type { MusculoAlumno, RegionAlumno, RutaAlumno, VistaAlumno } from '../types'

const log = createLogger('anatomyStore')

const LOAD_ERROR = 'No pudimos cargar Tus músculos.'

/**
 * Vista de alumno de la anatomía funcional (fase 200 D14): regiones, músculos, rutas y textos de
 * los tres grupos, de `GET /api/anatomy`. Es contenido estático por deploy: se trae una vez y queda
 * cacheado. Lo usan Tus músculos (plan 15) y el cuerpo tocable de Entrenar (plan 16), ambos detrás de
 * `ANATOMIA_ALUMNOS_ENABLED`.
 */
export const useAnatomyStore = defineStore('anatomy', () => {
  // State
  const vista = ref<VistaAlumno | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** Pedido en curso: dos `cargar()` simultáneos comparten una sola llamada. */
  let enCurso: Promise<void> | null = null

  // Helpers
  function region(slug: string): RegionAlumno | null {
    return vista.value?.regiones.find((r) => r.slug === slug) ?? null
  }

  function musculo(id: string): MusculoAlumno | null {
    return vista.value?.musculos.find((m) => m.id === id) ?? null
  }

  /** Músculos de una zona, en el orden de la región. */
  function musculosDeZona(slug: string): MusculoAlumno[] {
    const reg = region(slug)
    if (!reg) return []
    return reg.musculos.map((id) => musculo(id)).filter((m): m is MusculoAlumno => m !== null)
  }

  function ruta(slug: string): RutaAlumno | null {
    return vista.value?.rutas.find((r) => r.slug === slug) ?? null
  }

  // Actions
  async function pedir(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await api.get<VistaAlumno>('/anatomy')
      vista.value = response.data
    } catch (err: unknown) {
      error.value = LOAD_ERROR
      log.error('No se pudo cargar la vista de alumno de anatomía', {
        error: extractError(err, 'desconocido'),
      })
    } finally {
      loading.value = false
      enCurso = null
    }
  }

  /** Trae la vista de alumno; no repite si ya la tiene ni si hay un pedido en curso. */
  async function cargar(): Promise<void> {
    if (vista.value) return
    if (enCurso) return enCurso
    enCurso = pedir()
    return enCurso
  }

  return {
    vista,
    loading,
    error,
    region,
    musculo,
    musculosDeZona,
    ruta,
    cargar,
  }
})
