<template>
  <div class="libre-tab">
    <header class="libre-tab__head">
      <h2 class="libre-tab__title">Elegí qué trabajar</h2>
      <p class="libre-tab__subtitle">
        Bloques de las planis de tu nivel. Tocá una zona del cuerpo.
      </p>
    </header>

    <span
      v-if="store.loaded"
      class="libre-tab__aura"
      :class="store.auraAvailableToday ? 'libre-tab__aura--on' : 'libre-tab__aura--off'"
    >
      <q-icon name="auto_awesome" size="16px" />
      {{ auraText }}
    </span>

    <section v-if="store.loaded && suggestion" class="libre-tab__tip">
      <q-icon name="tips_and_updates" size="20px" class="libre-tab__tip-icon" />
      <div class="libre-tab__tip-body">
        <p class="libre-tab__tip-label">{{ suggestion.label }}:</p>
        <div class="libre-tab__tip-groups">
          <button
            v-for="g in suggestion.groups"
            :key="g"
            type="button"
            class="libre-tab__tip-btn"
            :class="{ 'libre-tab__tip-btn--on': store.group === g }"
            :aria-pressed="store.group === g"
            @click="toggleGroup(g)"
          >
            {{ ZONE_GROUP_LABELS[g] }}
          </button>
        </div>
      </div>
    </section>

    <div class="libre-tab__stage">
      <span class="libre-tab__halo" aria-hidden="true" />
      <BodyFigure
        :gender="gender"
        :lit="litZones"
        :dim="store.group !== null"
        :height="188"
        interactive
        @select-group="toggleGroup"
      />
    </div>

    <ZoneChips :selected="store.group" @select="onSelectZone" />

    <p class="libre-tab__count" aria-live="polite">{{ countText }}</p>

    <div v-if="store.error" class="libre-tab__error" role="alert">
      <span class="libre-tab__error-text">{{ store.error }}</span>
      <button type="button" class="libre-tab__link" @click="onRetry">Reintentar</button>
    </div>

    <div v-if="store.loading" class="libre-tab__loading">
      <TemploLoader size="md" />
    </div>

    <template v-else-if="showList">
      <div v-if="store.items.length > 0" class="libre-tab__list">
        <FreeBlockCard v-for="item in store.items" :key="item.blockId" :item="item" />
      </div>
      <div v-else-if="store.loaded && !store.error" class="libre-tab__empty">
        <p class="libre-tab__empty-text">{{ emptyBasketText(store.group) }}</p>
        <button
          v-if="store.group !== null"
          type="button"
          class="libre-tab__link"
          @click="onSelectZone(null)"
        >
          Quitar filtro
        </button>
      </div>

      <button
        v-if="store.hasMore && store.items.length > 0"
        type="button"
        class="libre-tab__link libre-tab__more"
        :disabled="store.loadingMore"
        @click="onLoadMore"
      >
        <TemploLoader v-if="store.loadingMore" size="sm" />
        <template v-else>Ver más bloques</template>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import BodyFigure from 'src/components/anatomy/BodyFigure.vue'
import TemploLoader from 'src/components/TemploLoader.vue'
import { ZONE_GROUPS, ZONE_GROUP_LABELS } from 'src/components/anatomy/zones'
import type { ZoneGroup } from 'src/components/anatomy/zones'
import { useUserStore } from 'src/stores/useUserStore'
import { useFreeBlocksStore } from '../../stores/freeBlocksStore'
import { basketCountLabel, complementSuggestion, emptyBasketText } from '../../utils/libre'
import FreeBlockCard from './FreeBlockCard.vue'
import ZoneChips from './ZoneChips.vue'

// Fase 197 D-04, D-12: tab Libre. Container con el store de la canasta: aviso de AURA del día,
// sugerencia de complemento, figura tocable + chips equivalentes (eligen un GRUPO), contador y
// lista de 20 en 20.
const store = useFreeBlocksStore()
const userStore = useUserStore()

/** Qué pedido falló, para que "Reintentar" repita el correcto (la primera página o "ver más") */
const failedRequest = ref<'first' | 'more'>('first')

const gender = computed(() => userStore.profile?.gender ?? null)

const litZones = computed(() => (store.group ? ZONE_GROUPS[store.group] : []))

const suggestion = computed(() =>
  complementSuggestion({
    todayZones: store.todayZones,
    weekWorkedZones: store.weekWorkedZones,
  }),
)

const auraText = computed(() =>
  store.auraAvailableToday
    ? '+5 AURA con el primero de hoy'
    : 'Ya sumaste tu AURA de hoy · podés seguir entrenando',
)

// Mientras se recarga el contador queda vacío: el total viejo no es del grupo nuevo
const countText = computed(() =>
  store.loaded && !store.loading ? basketCountLabel(store.total, store.group) : '',
)

// Si falló la primera página, la lista del store es la del grupo anterior: no se muestra
const showList = computed(() => !(store.error && failedRequest.value === 'first'))

function loadFirst(): void {
  failedRequest.value = 'first'
  void store.loadFirstPage()
}

function onSelectZone(group: ZoneGroup | null): void {
  failedRequest.value = 'first'
  void store.setGroup(group)
}

// Figura y botones de la sugerencia: tocar el grupo ya elegido lo deselecciona
function toggleGroup(group: ZoneGroup): void {
  onSelectZone(store.group === group ? null : group)
}

function onLoadMore(): void {
  failedRequest.value = 'more'
  void store.loadMore()
}

function onRetry(): void {
  if (failedRequest.value === 'more' && store.items.length > 0) {
    onLoadMore()
    return
  }
  loadFirst()
}

onMounted(() => {
  if (!store.loaded) loadFirst()
})

// Cambio de nivel en el header: recarga. La hidratación del perfil (null -> nivel) no cuenta.
watch(
  () => userStore.activeLevel,
  (next, prev) => {
    if (prev === null || next === prev) return
    loadFirst()
  },
)
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.libre-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px 24px;

  &__title {
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 28px;
    line-height: 1.15;
    color: $pd-ink;
  }

  &__subtitle {
    margin: 4px 0 0;
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    color: $pd-ink-2;
  }

  &__aura {
    align-self: flex-start;

    &--on {
      @include pd-chip-aura(light, true);
    }

    &--off {
      @include pd-chip-aura(light, false);
    }
  }

  // Sugerencia de complemento (D-04): tarjeta salvia
  &__tip {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 14px;
    background: $pd-sage-tint;
  }

  &__tip-icon {
    flex: none;
    color: $pd-sage;
  }

  &__tip-body {
    min-width: 0;
  }

  &__tip-label {
    margin: 0 0 8px;
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    color: $pd-ink;
  }

  &__tip-groups {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  &__tip-btn {
    @include pd-hit-44;
    height: 32px;
    padding: 0 12px;
    border: 1px solid $pd-sage;
    border-radius: 999px;
    background: white;
    color: $pd-sage;
    font-family: 'Geologica', sans-serif;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid $pd-ink;
      outline-offset: 2px;
    }

    &--on {
      background: $pd-sage;
      color: white;
    }
  }

  // Halo decorativo detrás de la figura (solo adorno, sin texto)
  &__stage {
    position: relative;
    isolation: isolate;
    // Gap 197-24 (hallazgo 4): figura 210 -> 188 y sin padding vertical (-30 px): el "Empezar" de la
    // primera card termina en ~763 a 390x844 (antes 793, tapado por la tab bar). Mismo orden y layout.
    padding: 0;
  }

  &__halo {
    position: absolute;
    top: 52%;
    left: 50%;
    z-index: -1;
    width: 280px;
    height: 170px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(163, 95, 60, 0.16), transparent);
    pointer-events: none;
  }

  &__count {
    @include pd-label-11;
    margin: 0;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__loading {
    display: flex;
    justify-content: center;
    padding: 24px 0;
  }

  &__error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border: 1px solid $pd-neg-a;
    border-radius: 14px;
    background: white;
  }

  &__error-text {
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    color: $pd-neg-title;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 18px 16px;
    border: 1px dashed $pd-light-edge;
    border-radius: 16px;
    text-align: center;
  }

  &__empty-text {
    margin: 0;
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    color: $pd-ink-2;
  }

  // Link terracota subrayado, alto 44 (Ver más bloques, Quitar filtro, Reintentar)
  &__link {
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: $pd-kicker-ink;
    font-family: 'Geologica', sans-serif;
    font-weight: 600;
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid $pd-ink;
      outline-offset: 2px;
    }

    &:disabled {
      cursor: default;
    }
  }

  &__more {
    align-self: flex-start;
  }
}
</style>
