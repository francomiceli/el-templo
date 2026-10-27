<template>
  <!-- Fase 201 D-25: sin tutorial cargado no hay botón (ni hueco) -->
  <div v-if="url" class="cq-tutorial">
    <button
      type="button"
      class="cq-textlink cq-tutorial__btn"
      :aria-label="`Ver cómo se hace: ${name}`"
      @click="open = true"
    >
      <svg class="cq-tutorial__icon" viewBox="0 0 12 14" aria-hidden="true" focusable="false">
        <path d="M1 1.2v11.6a.6.6 0 0 0 .9.5l9.3-5.8a.6.6 0 0 0 0-1L1.9.7A.6.6 0 0 0 1 1.2Z" />
      </svg>
      Ver cómo se hace
    </button>
    <CqVideoSheet v-model="open" :title="`Cómo se hace: ${name}`" :url="url" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import '../../styles/conquer.scss'
import { useConquerStore } from '../../stores/conquerStore'
import type { ComboKey } from '../../types'
import CqVideoSheet from './CqVideoSheet.vue'

// Fase 201 D-25, DA-49: "Ver cómo se hace" de un ejercicio (`exerciseId`, el de `TodayExercise`/`ProgressExercise`)
// o de un combo (`comboKey`). Lee la URL del store (las pantallas llaman `loadTutorials()` al montar):
// sin pedido propio. Si no hay URL, no renderiza nada.
const props = defineProps<{
  exerciseId?: number
  comboKey?: ComboKey
  name: string
}>()

const store = useConquerStore()
const open = ref(false)

const url = computed<string | null>(() => {
  if (props.exerciseId !== undefined) return store.exerciseTutorialUrl(props.exerciseId)
  if (props.comboKey !== undefined) return store.comboTutorialUrl(props.comboKey)
  return null
})
</script>
