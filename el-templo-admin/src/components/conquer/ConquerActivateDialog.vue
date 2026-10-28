<!--
  Alta de un alumno en Conquer (fase 201, S12-1, §7.2): tres campos — alumno, nivel y días.
  Si llega `member` (desde la lista de pedidos) el alumno ya viene elegido; si no, se lo busca
  por nombre o DNI. Los días se filtran por nivel con LEVEL_DAYS (espejo de la regla del API,
  A14). La plantilla y las progresiones iniciales las arma el API solo.
-->
<template>
  <q-dialog :model-value="modelValue" @update:model-value="onDialogModel">
    <q-card style="width: 420px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Activar Conquer</div>
        <q-space />
        <q-btn icon="close" flat round dense :disable="submitting" @click="close" />
      </q-card-section>

      <q-card-section class="q-gutter-md">
        <div v-if="member" class="text-subtitle1 text-weight-medium" data-test="conquer-member">
          {{ member.name }}
        </div>
        <q-select
          v-else
          v-model="selected"
          :options="options"
          option-value="userId"
          option-label="label"
          label="Alumno *"
          hint="Buscá por nombre o DNI"
          :loading="searching"
          :disable="submitting"
          dense
          outlined
          clearable
          use-input
          input-debounce="300"
          @filter="onSearch"
        >
          <template #no-option>
            <q-item>
              <q-item-section class="text-grey-8">No se encontró ningún alumno</q-item-section>
            </q-item>
          </template>
        </q-select>

        <q-select
          v-model="level"
          :options="levelOptions"
          label="Nivel *"
          hint="En la duda, el más bajo"
          emit-value
          map-options
          dense
          outlined
          :disable="submitting"
        />

        <q-select
          v-model="daysCount"
          :options="dayOptions"
          label="Días por semana *"
          emit-value
          map-options
          dense
          outlined
          :disable="submitting"
        />

        <div class="text-body2 text-grey-8">
          La plantilla y las progresiones iniciales salen solas; la semana 1 las ajusta.
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Cancelar" color="accent" :disable="submitting" @click="close" />
        <q-btn
          unelevated
          label="Activar"
          color="secondary"
          :loading="submitting"
          :disable="!canSubmit"
          data-test="conquer-activate"
          @click="onSubmit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useAdminStore } from 'src/stores/useAdminStore';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { LEVELS, LEVEL_DAYS, LEVEL_LABELS, type Level } from 'src/types/conquer';
import { createLogger } from 'src/utils/logger';

interface MemberOption {
  userId: number;
  label: string;
}

const props = defineProps<{
  modelValue: boolean;
  /** Alumno ya elegido (desde Pedidos). Sin él, el diálogo trae el buscador. */
  member?: { userId: number; name: string } | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  activated: [userId: number];
}>();

const log = createLogger('ConquerActivateDialog');
const $q = useQuasar();
const adminStore = useAdminStore();
const conquerApi = useConquerAdminApi();
const membersApi = useMembersApi();

// "En la duda, el más bajo" (§2.2): arranca en Ternero con su primera opción de días.
const DEFAULT_LEVEL: Level = 'ternero';

const level = ref<Level>(DEFAULT_LEVEL);
const daysCount = ref<number>(LEVEL_DAYS[DEFAULT_LEVEL][0] ?? 2);
const selected = ref<MemberOption | null>(null);
const options = ref<MemberOption[]>([]);
const searching = ref(false);
const submitting = ref(false);

const levelOptions = LEVELS.map((value) => ({ label: LEVEL_LABELS[value], value }));
const dayOptions = computed(() =>
  LEVEL_DAYS[level.value].map((n) => ({ label: `${n} días`, value: n }))
);

const targetUserId = computed<number | null>(
  () => props.member?.userId ?? selected.value?.userId ?? null
);
const canSubmit = computed(() => targetUserId.value !== null && !submitting.value);

// Al cambiar el nivel, si los días elegidos ya no valen se pasa al primero válido.
watch(level, (next) => {
  const valid = LEVEL_DAYS[next];
  if (!valid.includes(daysCount.value)) {
    daysCount.value = valid[0] ?? daysCount.value;
  }
});

// Cada vez que se abre arranca limpio (el diálogo se reutiliza entre alumnos).
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    level.value = DEFAULT_LEVEL;
    daysCount.value = LEVEL_DAYS[DEFAULT_LEVEL][0] ?? 2;
    selected.value = null;
    options.value = [];
  }
);

function onDialogModel(value: boolean): void {
  if (submitting.value && !value) return;
  emit('update:modelValue', value);
}

function close(): void {
  emit('update:modelValue', false);
}

function onSearch(val: string, update: (fn: () => void) => void): void {
  // Nunca busca con menos de 2 caracteres: el endpoint devolvería medio padrón.
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
          userId: m.id,
          label: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() + (m.dni ? ` (${m.dni})` : ''),
        }));
      });
    })
    .catch((err: unknown) => {
      log.warn('member search failed', {
        error: err instanceof Error ? err.message : 'unknown',
      });
      update(() => {
        options.value = [];
      });
    })
    .finally(() => {
      searching.value = false;
    });
}

async function onSubmit(): Promise<void> {
  const userId = targetUserId.value;
  if (userId === null) return;
  submitting.value = true;
  try {
    await conquerApi.activate({ userId, level: level.value, daysCount: daysCount.value });
    $q.notify({ type: 'positive', message: 'Conquer activado' });
    // El pedido ya no cuenta: la pelotita del menú se actualiza sin esperar a la próxima ruta.
    void adminStore.fetchConquerRequestsCount();
    emit('activated', userId);
    close();
  } catch (err: unknown) {
    // El API manda el motivo en español (p. ej. CONQUER_YA_ACTIVO).
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'No pudimos activar a este alumno',
    });
  } finally {
    submitting.value = false;
  }
}
</script>
