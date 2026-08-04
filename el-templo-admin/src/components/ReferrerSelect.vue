<!--
  Typeahead de socios para elegir un referidor (fase 173).

  Nació de una duplicación real: el mismo select vivía en MemberFormDialog (alta,
  157-05) y hacía falta otra vez en MemberReferralsTab (atribución retroactiva).
  Como el `v-model` es el id y no el objeto de la opción, el consumidor no tiene
  que conocer el shape del typeahead — solo recibe `number | null`.

  Nunca busca con menos de 2 caracteres: el endpoint devolvería medio padrón.
-->
<template>
  <q-select
    :model-value="selected"
    :options="options"
    option-value="id"
    option-label="displayLabel"
    :label="label"
    :hint="hint"
    :loading="searching"
    :disable="disable"
    dense
    outlined
    clearable
    use-input
    input-debounce="300"
    @update:model-value="onSelect"
    @filter="onSearch"
  >
    <template #no-option>
      <q-item>
        <q-item-section class="text-grey">No se encontró ningún socio</q-item-section>
      </q-item>
    </template>
  </q-select>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { createLogger } from 'src/utils/logger';
import { useMembersApi } from 'src/composables/useMembersApi';

interface ReferrerOption {
  id: number;
  displayLabel: string;
}

const log = createLogger('ReferrerSelect');
const membersApi = useMembersApi();

withDefaults(
  defineProps<{
    label?: string;
    hint?: string;
    disable?: boolean;
  }>(),
  {
    label: 'Referido por',
    hint: 'Buscá por nombre o DNI al socio que lo refirió',
    disable: false,
  }
);

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>();

const selected = ref<ReferrerOption | null>(null);
const options = ref<ReferrerOption[]>([]);
const searching = ref(false);

function onSelect(value: ReferrerOption | null): void {
  selected.value = value;
  emit('update:modelValue', value?.id ?? null);
}

/** Limpia la selección desde el padre (post-submit, reset del formulario). */
function reset(): void {
  selected.value = null;
  options.value = [];
}

defineExpose({ reset });

function onSearch(val: string, update: (fn: () => void) => void, _abort: () => void): void {
  if (!val || val.length < 2) {
    update(() => {
      options.value = [];
    });
    return;
  }
  searching.value = true;
  membersApi
    .searchMembers(val, 10)
    .then((members) => {
      update(() => {
        options.value = members.map((m) => ({
          id: m.id,
          displayLabel: `${m.firstName} ${m.lastName}${m.dni ? ` (${m.dni})` : ''}`,
        }));
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error searching referrer', { error: message });
      update(() => {
        options.value = [];
      });
    })
    .finally(() => {
      searching.value = false;
    });
}
</script>
