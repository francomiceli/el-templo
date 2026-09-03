<!-- Card genérica de un ítem de Comunicaciones (Fase 193, Plan B, pedido de
     Franco 2026-09-03) — reemplaza las `q-table` de Push/Avisos/Tarjetas/TV
     por una grilla de cards homogénea. El chip de origen (Sistema/Propia)
     es SOLO informativo: las 4 categorías editan y borran igual sin
     importar el origen (homogeneidad, ver plan). -->
<template>
  <q-card flat bordered class="comm-card">
    <q-card-section class="comm-card__header">
      <div class="row items-start justify-between no-wrap q-gutter-x-sm">
        <div class="col comm-card__titles">
          <div class="comm-card__title">{{ title }}</div>
          <div v-if="subtitle" class="comm-card__subtitle">{{ subtitle }}</div>
        </div>
        <span
          class="comm-card__origin"
          :class="origin === 'system' ? 'comm-card__origin--system' : 'comm-card__origin--custom'"
        >
          {{ origin === 'system' ? 'Sistema' : 'Propia' }}
        </span>
      </div>

      <div class="row items-center q-gutter-x-sm q-mt-sm">
        <q-toggle
          :model-value="enabled"
          color="positive"
          dense
          :disable="toggleDisabled"
          @update:model-value="(val: boolean) => emit('update:enabled', val)"
        />
        <span class="text-caption text-grey-7">{{ enabled ? 'Activo' : 'Pausado' }}</span>
      </div>
    </q-card-section>

    <q-separator />

    <q-card-section v-if="meta.length" class="comm-card__meta">
      <div v-for="(m, idx) in meta" :key="idx" class="comm-card__meta-line">
        <q-icon :name="m.icon" size="16px" class="q-mr-xs" />
        <span>{{ m.text }}</span>
      </div>
    </q-card-section>

    <q-card-section v-if="metrics.length" class="comm-card__metrics">
      <div v-for="(m, idx) in metrics" :key="idx" class="comm-card__metric">
        <div class="comm-card__metric-value">{{ m.value }}</div>
        <div class="comm-card__metric-label">
          {{ m.label }}
          <q-tooltip v-if="m.hint">{{ m.hint }}</q-tooltip>
        </div>
      </div>
    </q-card-section>

    <slot name="preview" />

    <q-separator />

    <q-card-actions align="right">
      <slot name="extra-actions" />
      <q-btn flat round dense icon="edit" color="primary" @click="emit('edit')">
        <q-tooltip>Editar</q-tooltip>
      </q-btn>
      <q-btn flat round dense icon="delete" color="negative" @click="emit('delete')">
        <q-tooltip>Borrar</q-tooltip>
      </q-btn>
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    origin: 'system' | 'custom';
    enabled: boolean;
    toggleDisabled?: boolean;
    meta?: Array<{ icon: string; text: string }>;
    metrics?: Array<{ label: string; value: string | number; hint?: string }>;
  }>(),
  {
    subtitle: undefined,
    toggleDisabled: false,
    meta: () => [],
    metrics: () => [],
  },
);

const emit = defineEmits<{
  'update:enabled': [value: boolean];
  edit: [];
  delete: [];
}>();
</script>

<style lang="scss" scoped>
$warm-stone: #d9cfc1;
$aged-gold: #b89b5e;
$terracotta: #96593a;
$olive-stone: #6b6459;
$charcoal: #3d3732;

.comm-card {
  border-color: $warm-stone;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.comm-card__header {
  padding-bottom: 4px;
}

.comm-card__titles {
  min-width: 0;
}

.comm-card__title {
  font-weight: 600;
  color: $charcoal;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.comm-card__subtitle {
  font-size: 0.8125rem;
  color: $olive-stone;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin-top: 2px;
}

.comm-card__origin {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-radius: 10px;
  padding: 3px 10px;
  white-space: nowrap;

  &--system {
    background-color: rgba($aged-gold, 0.18);
    color: darken($aged-gold, 22%);
  }

  &--custom {
    background-color: rgba($terracotta, 0.14);
    color: $terracotta;
  }
}

.comm-card__meta {
  padding-top: 8px;
  padding-bottom: 8px;
}

.comm-card__meta-line {
  display: flex;
  align-items: flex-start;
  font-size: 0.8125rem;
  color: $charcoal;
  line-height: 1.4;
  margin-bottom: 4px;

  .q-icon {
    color: $terracotta;
    margin-top: 2px;
  }

  &:last-child {
    margin-bottom: 0;
  }
}

.comm-card__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding-top: 8px;
  padding-bottom: 8px;
}

.comm-card__metric-value {
  font-weight: 700;
  color: $charcoal;
  font-variant-numeric: tabular-nums;
}

.comm-card__metric-label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: $olive-stone;
}
</style>
