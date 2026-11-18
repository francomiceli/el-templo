<template>
  <div
    class="level-trigger"
    :class="[`level-trigger--${variant}`, { 'level-trigger--compact': compact }]"
    role="button"
    tabindex="0"
    aria-haspopup="menu"
    :aria-label="triggerLabel"
    @keydown.enter.prevent="menuRef?.toggle()"
    @keydown.space.prevent="menuRef?.toggle()"
  >
    <span class="level-trigger__symbol" aria-hidden="true">{{ greek }}</span>
    <span v-if="!compact" class="level-trigger__name" aria-hidden="true">{{ displayName }}</span>
    <q-icon name="expand_more" class="level-trigger__chevron" aria-hidden="true" />
    <q-menu
      ref="menuRef"
      fit
      anchor="bottom right"
      self="top right"
      class="level-menu"
      :offset="[0, 8]"
    >
      <q-list class="level-menu__list">
        <!-- SPEC "Empezá acá" A3: aclarar la diferencia entre el nivel que
             se está VIENDO y el nivel real del socio, sin cambiar la
             lógica de selección de abajo. -->
        <div class="level-menu__banner">
          <div class="level-menu__banner-row">
            <span class="level-menu__banner-label">Tu nivel:</span>
            <span class="level-menu__banner-value">{{ ownDisplayName }}</span>
          </div>
          <div v-if="isViewingOther" class="level-menu__banner-row level-menu__banner-row--viewing">
            <span class="level-menu__banner-label">Estás viendo:</span>
            <span class="level-menu__banner-value">{{ displayName }}</span>
          </div>
        </div>
        <q-separator class="level-menu__banner-separator" />

        <q-item
          v-for="lvl in TRAINING_LEVELS"
          :key="lvl"
          v-close-popup
          clickable
          class="level-menu__item"
          :class="{ 'level-menu__item--selected': lvl === activeLevel }"
          @click="onSelect(lvl)"
        >
          <q-item-section avatar class="level-menu__greek">
            {{ LEVEL_GREEK_MAP[lvl] }}
          </q-item-section>
          <q-item-section>
            <span class="level-menu__label">{{ LEVEL_DISPLAY_MAP[lvl] }}</span>
            <span v-if="lvl === ownLevel" class="level-menu__own">Tu Nivel</span>
          </q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuasar, type QMenu } from 'quasar'
import { useUserStore } from 'src/stores/useUserStore'
import {
  TRAINING_LEVELS,
  LEVEL_GREEK_MAP,
  LEVEL_DISPLAY_MAP,
  type Level,
} from 'src/modules/training/level-display'

// Fase 214 (D-62): `bar` = pastilla oscura sobre la barra de arriba (celular);
// `light` = pastilla clara arriba de las pestañas de Entrenar (escritorio).
// Revisión 2026-11-18 (#19): `compact` = solo el ícono (la letra griega) del nivel, sin el nombre, para
// los celulares angostos. El nombre sigue en el `aria-label` del disparador y en el menú.
withDefaults(defineProps<{ variant?: 'bar' | 'light'; compact?: boolean }>(), {
  variant: 'bar',
  compact: false,
})

const $q = useQuasar()
const menuRef = ref<QMenu | null>(null)
const userStore = useUserStore()

const activeLevel = computed<Level | null>(() => userStore.activeLevel)
const ownLevel = computed<Level | null>(() => {
  const lvl = userStore.profile?.level
  return lvl ? (lvl as Level) : null
})
const greek = computed(() => (activeLevel.value ? LEVEL_GREEK_MAP[activeLevel.value] : ''))
const displayName = computed(() => (activeLevel.value ? LEVEL_DISPLAY_MAP[activeLevel.value] : ''))
const triggerLabel = computed(() => `Nivel que estás viendo: ${displayName.value}. Cambiar nivel`)

// SPEC "Empezá acá" A3: el badge del header YA muestra `activeLevel` (lo que
// se está viendo); el menú aclara además cuál es el nivel REAL del socio y,
// si difiere, que está viendo otro. Pura presentación — no toca setLevel.
const ownDisplayName = computed(() => (ownLevel.value ? LEVEL_DISPLAY_MAP[ownLevel.value] : ''))
const isViewingOther = computed(
  () => !!activeLevel.value && !!ownLevel.value && activeLevel.value !== ownLevel.value,
)

async function onSelect(lvl: Level): Promise<void> {
  if (lvl === activeLevel.value) return
  await userStore.setLevel(lvl)
  $q.notify({
    type: 'positive',
    message: `Nivel cambiado a ${LEVEL_DISPLAY_MAP[lvl]}`,
    position: 'top',
    timeout: 2000,
  })
}
</script>

<style lang="scss" scoped>
@import 'src/css/_brand.scss';
@import 'src/css/premium-card';

// Disparador común: pastilla de 36 de alto; el área tocable llega a 44 con pd-hit-44.
.level-trigger {
  @include pd-hit-44;

  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 4px 0 8px;
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;

  &__symbol {
    // Misma fuente que antes (la del cuerpo): Montserrat no trae las letras griegas.
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
  }

  &__name {
    font-family: 'Montserrat', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1;
  }

  &__chevron {
    font-size: 20px;
  }

  // Solo el ícono del nivel: letra + flecha, lo más angosto que se puede sin perder el toque.
  &--compact {
    gap: 2px;
    padding: 0 2px 0 8px;
  }

  &:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  &--bar {
    background: rgba(44, 35, 24, 0.22);
    border: 1px solid rgba(255, 255, 255, 0.45);
    color: #fff;
  }

  &--light {
    background: #fff;
    border: 1px solid $pd-light-edge;

    .level-trigger__symbol {
      color: $pd-terra-ink;
    }

    .level-trigger__name {
      color: $pd-ink;
    }

    .level-trigger__chevron {
      color: $pd-ink-2;
    }

    &:focus-visible {
      outline-color: $pd-terra-ink;
    }
  }
}

:deep(.level-menu) {
  background: transparent;
  box-shadow: 0 8px 24px rgba($brand-aged-gold, 0.2);
  overflow: hidden;
}

.level-menu__list {
  min-width: 200px;
  padding: 6px 0;
  background: $brand-cream;
  border: 1px solid rgba($brand-aged-gold, 0.25);
}

.level-menu__banner {
  padding: 8px 14px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.level-menu__banner-row {
  display: flex;
  align-items: baseline;
  gap: 6px;

  &--viewing {
    color: $brand-terracotta;
  }
}

.level-menu__banner-label {
  font-size: 11px;
  color: #6b6459;
  font-family: 'Montserrat', sans-serif;
}

.level-menu__banner-value {
  font-size: 13px;
  font-weight: 700;
  color: #96593a;
  font-family: 'Montserrat', sans-serif;
}

.level-menu__banner-separator {
  margin: 4px 0;
}

.level-menu__item {
  min-height: 44px;
  padding: 6px 14px;
  color: #96593a;
  font-family: 'Montserrat', sans-serif;
  border-left: 3px solid transparent;
  transition:
    background 120ms ease,
    border-color 120ms ease;

  &:hover {
    background: rgba($brand-aged-gold, 0.1);
    color: #96593a;
  }

  &--selected {
    background: rgba($brand-aged-gold, 0.18);
    border-left-color: $brand-aged-gold;
    color: #96593a;
    font-weight: 600;
  }
}

.level-menu__greek {
  min-width: 40px !important;
  padding-right: 20px !important;
  font-size: 22px;
  color: $brand-terracotta;
  line-height: 1;
  justify-content: center;
}

.level-menu__label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.level-menu__own {
  font-size: 10px;
  font-weight: 700;
  color: #7d5d42;
  font-style: italic;
  margin-top: 2px;
}
</style>
