<!-- Vista previa estática de la card "Novedades" de Mi Templo (variante D del
     sketch 004, SIN íconos de tipo — decisión D-8). Réplica de lo que ve el
     socio en la app, pero SIN auto-rotación: se pasa de una novedad a otra
     tocando los puntos. Muestra una por vez, con el filete terracota y el
     "NUEVO" de una novedad no vista (acá se asume que el socio no vio
     ninguna: es la mejor forma de ver cómo luce).

     Solo lectura. El texto se interpola con `{{ }}` (Vue escapa) — PROHIBIDA
     la directiva de HTML crudo de Vue: una novedad con HTML nunca debe
     ejecutarse en el admin (mismo criterio que AvisoPreview.vue, T-193-42).

     El stage tiene alto fijo (como en la app): UNA línea de texto + la meta
     (decisión de Franco 2026-10-14). Lo que no entra se corta con "…". -->
<template>
  <div class="nov-preview">
    <div v-if="!items.length" class="nov-preview__empty">
      {{ emptyText }}
    </div>

    <div v-else class="nov-card">
      <div class="nov-card__head">
        <span class="nov-card__title">Novedades</span>
        <span v-if="showNew" class="nov-card__count">
          {{ items.length }} {{ items.length === 1 ? 'nueva' : 'nuevas' }}
        </span>
        <span v-if="items.length > 1" class="nov-card__dots">
          <button
            v-for="(item, i) in items"
            :key="item.key"
            type="button"
            class="nov-card__dot"
            :class="{ 'nov-card__dot--on': i === current }"
            :aria-label="`Ver novedad ${i + 1} de ${items.length}`"
            :aria-current="i === current"
            @click="current = i"
          />
        </span>
      </div>

      <div class="nov-card__stage">
        <div class="nov-item" :class="{ 'nov-item--new': showNew }">
          <div class="nov-item__body">
            <div class="nov-item__text">{{ currentItem.text }}</div>
            <div class="nov-item__meta">
              <span v-if="showNew" class="nov-item__new">NUEVO</span>
              <span v-if="currentItem.branchLabel" class="nov-item__sede">
                <q-icon name="location_on" size="13px" />{{ currentItem.branchLabel }}
              </span>
              <span>{{ currentItem.whenLabel }}</span>
            </div>
          </div>
          <q-icon v-if="currentItem.hasDestination" name="chevron_right" class="nov-item__chev" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { NovedadPreviewItem } from 'src/utils/novedades';

const props = withDefaults(
  defineProps<{
    items: NovedadPreviewItem[];
    showNew?: boolean;
    emptyText?: string;
  }>(),
  {
    showNew: true,
    emptyText: 'Sin novedades para esta sede: la sección no se muestra en la app.',
  }
);

const current = ref(0);

// Si la lista se achica (cambió la sede, se pausó una) no quedamos fuera de rango.
watch(
  () => props.items.length,
  (length) => {
    if (current.value >= length) current.value = 0;
  }
);

const currentItem = computed<NovedadPreviewItem>(
  () => props.items[current.value] ?? props.items[0]!
);
</script>

<style lang="scss" scoped>
// Paleta de marca copiada del sketch 004 (themes/default.css) y de
// el-templo-app/src/css/_brand.scss — mismo criterio que AvisoPreview.vue.
$terracotta: #96593a;
$clay: #7d5d42;
$charcoal: #3d3732;
$olive-stone: #6b6459;
$border: #e5dbcd;

.nov-preview {
  width: 100%;
  max-width: 375px;
}

.nov-preview__empty {
  padding: 16px;
  border: 1px dashed $border;
  border-radius: 16px;
  font-size: 0.8125rem;
  color: $olive-stone;
  text-align: center;
  background-color: rgba(#fff, 0.6);
}

.nov-card {
  position: relative;
  overflow: hidden;
  background-color: #fff;
  border: 1px solid $border;
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba($terracotta, 0.1);
}

.nov-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 2px;
}

.nov-card__title {
  font-family: 'Montserrat', system-ui, sans-serif;
  font-weight: 800;
  font-size: 15px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $terracotta;
}

.nov-card__count {
  background-color: $terracotta;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
}

.nov-card__dots {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 5px;
}

// Botones (no <i>) para que se puedan tocar con teclado; el área clickeable
// se agranda con padding transparente sin mover el punto.
.nov-card__dot {
  width: 6px;
  height: 6px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background-color: #e2d6c6;
  cursor: pointer;
  transition: all 0.25s ease;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: -8px -3px;
  }

  &--on {
    width: 18px;
    background-color: $terracotta;
  }

  &:focus-visible {
    outline: 2px solid $terracotta;
    outline-offset: 3px;
  }
}

.nov-card__stage {
  position: relative;
  // 1 línea de texto (14.5 × 1.38 ≈ 20px) + meta (4 + 16px) + padding 10+10.
  height: 62px;
  overflow: hidden;
}

.nov-item {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;

  // Filete izquierdo de 3px: novedad no vista.
  &--new::before {
    content: '';
    position: absolute;
    left: 0;
    top: 12px;
    bottom: 12px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background-color: $terracotta;
  }
}

.nov-item__body {
  flex: 1;
  min-width: 0;
}

.nov-item__text {
  font-size: 14.5px;
  line-height: 1.38;
  font-weight: 500;
  color: $charcoal;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nov-item--new .nov-item__text {
  font-weight: 600;
}

.nov-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 11.5px;
  color: $olive-stone;
}

.nov-item__new {
  color: $terracotta;
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.05em;
}

.nov-item__sede {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
  color: $clay;
}

.nov-item__chev {
  flex-shrink: 0;
  color: #c7b9a6;
  font-size: 20px;
}
</style>
