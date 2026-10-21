import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from 'src/boot/axios';
import { createLogger } from 'src/utils/logger';
import type { MusculoProfe, RutaProfe, VistaProfe } from 'src/types/anatomy';

const log = createLogger('anatomyStore');

/**
 * Fase 200 D6/D7: vista de profe de Anatomía (GET /api/admin/anatomy). Se pide UNA vez por
 * sesión: el contenido es estático por deploy, así que la hoja y la ficha leen de acá.
 */
export const useAnatomyStore = defineStore('anatomy', () => {
  const vista = ref<VistaProfe | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function cargar(): Promise<void> {
    // Cacheado: si ya hay vista no se repite; si hay una carga en curso tampoco se duplica.
    if (vista.value || loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<VistaProfe>('/admin/anatomy');
      vista.value = data;
    } catch (err: unknown) {
      log.error('No se pudo cargar la vista de Anatomía', {
        error: err instanceof Error ? err.message : String(err),
      });
      error.value = 'No pudimos cargar Anatomía.';
    } finally {
      loading.value = false;
    }
  }

  /** Músculos cuya zona del dibujo es `slug` (más de uno = "esta zona es un grupo"). */
  function musculosDeZona(slug: string): MusculoProfe[] {
    return (vista.value?.musculos ?? []).filter((m) => m.zona?.slug === slug);
  }

  function rutaPorSlug(slug: string): RutaProfe | undefined {
    return vista.value?.rutas.find((r) => r.slug === slug);
  }

  function rutaPorCodigo(code: string): RutaProfe | undefined {
    return vista.value?.rutas.find((r) => r.code === code);
  }

  function musculoPorId(id: string): MusculoProfe | undefined {
    return vista.value?.musculos.find((m) => m.id === id);
  }

  /** Músculos profundos (sin zona en el dibujo, D10). */
  const profundos = computed<MusculoProfe[]>(() =>
    (vista.value?.musculos ?? []).filter((m) => m.zona === null)
  );

  return {
    vista,
    loading,
    error,
    cargar,
    musculosDeZona,
    rutaPorSlug,
    rutaPorCodigo,
    musculoPorId,
    profundos,
  };
});
