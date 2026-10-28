<!-- Selector de sedes de una novedad con casillas (pedido de Franco 2026-10-15,
     reemplaza al q-select múltiple). Tres niveles, cada uno tilda/destilda lo
     de abajo y muestra estado intermedio si está a medias:
       ☐ Todas las sedes            (solo owner: guarda null = también las futuras)
         ☐ Todas las sedes de <país> (atajo: tilda sus sedes, se guardan los IDs)
           ☐ sede  ☐ sede …
     v-model = IDs tildados. Convertir a alcance (`scopeFromSelection`) lo hace
     el editor. -->
<template>
  <div class="nov-sedes">
    <q-checkbox
      v-if="allowGlobal"
      :model-value="triState(allIds)"
      label="Todas las sedes"
      class="text-weight-medium"
      @update:model-value="setMany(allIds, $event === true)"
    />
    <div v-if="allowGlobal" class="text-caption text-grey-7 nov-sedes__hint">
      Incluye las sedes que se abran más adelante.
    </div>

    <div
      v-for="group in groups"
      :key="group.country"
      :class="allowGlobal ? 'nov-sedes__group--nested' : ''"
    >
      <q-checkbox
        :model-value="triState(group.branches.map((b) => b.id))"
        :label="`Todas las sedes de ${group.label}`"
        @update:model-value="
          setMany(
            group.branches.map((b) => b.id),
            $event === true
          )
        "
      />
      <div class="row nov-sedes__branches">
        <q-checkbox
          v-for="branch in group.branches"
          :key="branch.id"
          :model-value="modelValue.includes(branch.id)"
          :label="branch.name"
          dense
          class="col-6 col-sm-4"
          @update:model-value="setMany([branch.id], $event === true)"
        />
      </div>
    </div>

    <div v-if="modelValue.length === 0" class="text-caption text-negative q-mt-xs">
      Elegí al menos una sede.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BranchOption } from 'src/types/member';
import { groupBranchesByCountry } from 'src/utils/novedades';

const props = defineProps<{
  modelValue: number[];
  branches: BranchOption[];
  /** Owner: muestra "Todas las sedes" (las sedes que ve son todas las del tenant). */
  allowGlobal: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: number[]] }>();

const groups = computed(() => groupBranchesByCountry(props.branches));
const allIds = computed(() => props.branches.map((b) => b.id));

/** true = todas tildadas, false = ninguna, null = algunas (estado intermedio). */
function triState(ids: readonly number[]): boolean | null {
  const checked = ids.filter((id) => props.modelValue.includes(id)).length;
  if (checked === 0) return false;
  return checked === ids.length ? true : null;
}

/**
 * Tilda o destilda un conjunto de sedes. Sin `toggle-indeterminate`, Quasar
 * emite true→false, false→true e intermedio(null)→true: un click en un grupo
 * a medias lo completa.
 */
function setMany(ids: readonly number[], checked: boolean): void {
  const next = checked
    ? [...new Set([...props.modelValue, ...ids])]
    : props.modelValue.filter((id) => !ids.includes(id));
  emit('update:modelValue', next);
}
</script>

<style lang="scss" scoped>
.nov-sedes__hint {
  margin: -6px 0 4px 40px;
}
.nov-sedes__group--nested {
  padding-left: 24px;
}
.nov-sedes__branches {
  padding-left: 40px;
}
</style>
