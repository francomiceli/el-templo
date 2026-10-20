<template>
  <div
    ref="rootRef"
    class="entrenar-tabs"
    :class="{ 'entrenar-tabs--static': !interactive }"
    :inert="interactive ? undefined : true"
  >
    <div class="entrenar-tabs__doors" role="tablist" aria-label="Secciones de Entrenar">
      <button
        v-for="tab in TABS"
        :id="tabId(tab.key)"
        :key="tab.key"
        type="button"
        role="tab"
        class="entrenar-tabs__tab"
        :class="{ 'entrenar-tabs__tab--on': tab.key === modelValue }"
        :aria-selected="tab.key === modelValue"
        :aria-controls="paneId(tab.key)"
        :tabindex="tab.key === modelValue ? 0 : -1"
        @click="select(tab.key)"
        @keydown="onKeydown($event, tab.key)"
      >
        <span class="entrenar-tabs__label">{{ tab.label }}</span>
        <template v-if="tab.soon">
          <i class="entrenar-tabs__soon" aria-hidden="true" />
          <span class="entrenar-tabs__sr">pronto</span>
        </template>
      </button>
    </div>
  </div>
</template>

<script lang="ts">
export type TabKey = 'semana' | 'libre' | 'desafios' | 'conquer'

/** Ids compartidos con los `role="tabpanel"` de EntrenarView (aria-controls / aria-labelledby) */
export function tabId(key: TabKey): string {
  return `entrenar-tab-${key}`
}

export function paneId(key: TabKey): string {
  return `entrenar-pane-${key}`
}
</script>

<script setup lang="ts">
import { nextTick, ref } from 'vue'

// Fase 197 D-02: 4 tabs "puertas" SIN íconos (sketch 015 ronda 3). Desafíos y Conquer llevan un
// punto ocre de "pronto" (D-05). Tablist accesible: flechas izquierda/derecha mueven la selección.
const props = withDefaults(
  defineProps<{
    modelValue: TabKey
    /** false en la vidriera sin plan (D-06): no emite nada */
    interactive?: boolean
  }>(),
  { interactive: true },
)

const emit = defineEmits<{
  'update:modelValue': [value: TabKey]
}>()

interface TabDef {
  key: TabKey
  label: string
  soon: boolean
}

const TABS: readonly TabDef[] = [
  { key: 'semana', label: 'Semana', soon: false },
  { key: 'libre', label: 'Libre', soon: false },
  { key: 'desafios', label: 'Desafíos', soon: true },
  { key: 'conquer', label: 'Conquer', soon: true },
]

const rootRef = ref<HTMLElement | null>(null)

function select(key: TabKey): void {
  if (!props.interactive) return
  emit('update:modelValue', key)
}

function focusTab(key: TabKey): void {
  void nextTick(() => {
    rootRef.value?.querySelector<HTMLButtonElement>(`#${tabId(key)}`)?.focus()
  })
}

function onKeydown(event: KeyboardEvent, key: TabKey): void {
  if (!props.interactive) return
  const index = TABS.findIndex((t) => t.key === key)
  let target = index
  if (event.key === 'ArrowRight') target = (index + 1) % TABS.length
  else if (event.key === 'ArrowLeft') target = (index - 1 + TABS.length) % TABS.length
  else if (event.key === 'Home') target = 0
  else if (event.key === 'End') target = TABS.length - 1
  else return
  event.preventDefault()
  const next = TABS[target].key
  select(next)
  focusTab(next)
}
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/premium-card';

// Contenedor pegajoso: queda debajo del header fijo (EntrenarView mide su alto y lo publica en
// `--entrenar-tabs-top`; sin header, 0). El fondo es un tinte del fondo, no un color de texto.
.entrenar-tabs {
  position: sticky;
  top: var(--entrenar-tabs-top, 0px);
  z-index: 5;
  padding: 12px 16px 10px;
  background: rgba($brand-cream, 0.96);

  &--static {
    position: static;
  }

  &__doors {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  &__tab {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 2px;
    overflow: hidden;
    border: 1px solid $pd-light-line;
    border-radius: 14px;
    background: white;
    color: $pd-ink;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid $pd-terra-ink;
      outline-offset: 2px;
    }

    // Elegida: oscura, crema, sin sombra, con la línea luminosa abajo
    &--on {
      border-color: $pd-surface;
      background: $pd-surface;
      color: $pd-cream;

      &::after {
        @include pd-line;
        left: 10px;
        right: 10px;
        content: '';
      }
    }
  }

  &__label {
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.06em;
    line-height: 1.15;
    text-transform: uppercase;
    text-align: center;
  }

  // Punto ocre de "pronto" (D-02, D-05)
  &__soon {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $pd-soon-dot;
  }

  // Solo para lectores de pantalla
  &__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>
