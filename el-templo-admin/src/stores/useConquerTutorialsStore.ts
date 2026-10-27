import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type { AdminTutorials, ComboKey } from 'src/types/conquer';

/**
 * Fase 202 D-25: vista de los tutoriales en video de Conquer, compartida por Catálogo (un video por
 * ejercicio) y Ajustes (un video por combo). `load()` es silencioso: si falla deja `view` en null
 * y el log ya quedó en el cliente; las pantallas muestran "sin video" y la subida sigue ofreciéndose
 * solo si `view.storageReady`. Las mutaciones devuelven la vista completa: se reemplaza con `apply`.
 */
export const useConquerTutorialsStore = defineStore('conquerTutorials', () => {
  const view = ref<AdminTutorials | null>(null);
  const loading = ref(false);

  async function load(): Promise<void> {
    loading.value = true;
    try {
      view.value = await useConquerAdminApi().getTutorials();
    } catch {
      // `call` de useConquerAdminApi ya registró el error; la pantalla degrada a "sin tutoriales".
      view.value = null;
    } finally {
      loading.value = false;
    }
  }

  function apply(next: AdminTutorials): void {
    view.value = next;
  }

  /** URL del tutorial del ejercicio (`conquer_exercises.id`), o null si no tiene. */
  function exerciseUrl(exerciseId: number): string | null {
    return view.value?.exercises.find((e) => e.exerciseId === exerciseId)?.url ?? null;
  }

  /** Fila del combo (label + url), o null si todavía no se cargó la vista. */
  function comboTutorial(key: ComboKey): { label: string; url: string | null } | null {
    const found = view.value?.combos.find((c) => c.comboKey === key);
    return found ? { label: found.label, url: found.url } : null;
  }

  return { view, loading, load, apply, exerciseUrl, comboTutorial };
});
