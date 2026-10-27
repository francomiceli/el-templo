<!--
  Fase 204 (D-05 / D-21): "Unir con alumno existente". Desde la ficha de un visitante
  Wellhub puro, el admin busca al alumno existente (el mismo que entró por Wellhub con
  otro email), lee exactamente qué se mueve y confirma. No hay deshacer. El servidor
  decide (destino con otro ID de Wellhub, choque de reservas, origen que no es puro):
  si rechaza, el motivo en español se muestra acá y el diálogo queda abierto.
-->
<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    @update:model-value="$emit('update:modelValue', $event)"
    @hide="onHide"
  >
    <q-card style="width: 520px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">Unir con alumno existente</div>
        <div class="text-caption text-grey-7">
          Usá esto cuando un ex-alumno entró por Wellhub con otro email y quedó una ficha duplicada.
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <q-select
          v-model="target"
          :options="options"
          label="Alumno existente *"
          hint="Buscá por nombre o DNI (mínimo 2 letras)"
          dense
          outlined
          use-input
          hide-selected
          fill-input
          clearable
          input-debounce="300"
          :loading="searching"
          :disable="submitting"
          @filter="onFilter"
        >
          <template #no-option>
            <q-item>
              <q-item-section class="text-grey-6 text-italic">
                {{
                  searchText.trim().length >= MIN_SEARCH_LENGTH
                    ? 'Sin resultados'
                    : 'Escribí para buscar'
                }}
              </q-item-section>
            </q-item>
          </template>
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.label }}</q-item-label>
                <q-item-label v-if="scope.opt.caption" caption>{{
                  scope.opt.caption
                }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>

        <q-banner v-if="target" dense rounded class="bg-orange-1 text-grey-9 q-mt-md">
          <div>
            Se mueven a <strong>{{ target.fullName }}</strong
            >: el ID de Wellhub ({{ gympassId }}), las reservas, las visitas y las notas.
          </div>
          <div class="q-mt-sm">
            La ficha <strong>{{ sourceName }}</strong> se da de baja.
            <strong>No se puede deshacer.</strong>
          </div>
        </q-banner>

        <q-banner v-if="failureMessage" dense rounded class="bg-red-1 text-negative q-mt-md">
          {{ failureMessage }}
        </q-banner>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat no-caps label="Cancelar" :disable="submitting" @click="onCancel" />
        <q-btn
          color="negative"
          no-caps
          label="Unir fichas"
          :loading="submitting"
          :disable="!target"
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useMembersApi, type MemberSearchResult } from 'src/composables/useMembersApi';
import { useWellhubApi } from 'src/composables/useWellhubApi';

const log = createLogger('WellhubMergeDialog');

const props = defineProps<{
  modelValue: boolean;
  /** Ficha duplicada (visitante Wellhub puro): la que se da de baja. */
  sourceUserId: number;
  sourceName: string;
  /** ID de Wellhub que se muda al alumno existente. */
  gympassId: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  merged: [targetUserId: number];
}>();

interface TargetOption {
  /** Texto que ve el staff en la lista: "Apellido, Nombre · DNI". */
  label: string;
  /** Nombre natural ("Nombre Apellido") para el resumen de la confirmación. */
  fullName: string;
  caption: string;
  value: number;
}

// Mismo piso de búsqueda que el resto de los typeahead del admin.
const MIN_SEARCH_LENGTH = 2;

const $q = useQuasar();
const membersApi = useMembersApi();
const wellhubApi = useWellhubApi();

const target = ref<TargetOption | null>(null);
const options = ref<TargetOption[]>([]);
const searching = ref(false);
const searchText = ref('');
const submitting = ref(false);
// Motivo (en español, del servidor) del último rechazo: se muestra en el diálogo.
const failureMessage = ref<string | null>(null);
// Descarta respuestas de búsquedas viejas (el staff sigue tipeando).
let searchSeq = 0;

function buildOption(m: MemberSearchResult): TargetOption {
  const last = (m.lastName ?? '').trim();
  const first = (m.firstName ?? '').trim();
  const names = [last, first].filter(Boolean).join(', ') || `Usuario #${m.id}`;
  const fullName = [first, last].filter(Boolean).join(' ') || `Usuario #${m.id}`;
  return {
    label: m.dni ? `${names} · ${m.dni}` : names,
    fullName,
    caption: m.planName ?? 'Sin plan',
    value: m.id,
  };
}

function onFilter(val: string, update: (fn: () => void) => void, _abort: () => void): void {
  searchText.value = val;
  const seq = ++searchSeq;
  if (val.trim().length < MIN_SEARCH_LENGTH) {
    searching.value = false;
    update(() => {
      options.value = [];
    });
    return;
  }
  searching.value = true;
  membersApi
    .searchMembers(val.trim(), 15)
    .then((members) => {
      if (seq !== searchSeq) return;
      // Fuera de la lista: la propia ficha duplicada y cualquiera ya vinculado a Wellhub
      // (el servidor rechazaría ese destino igual; esto evita el viaje de ida y vuelta).
      const candidates = members.filter((m) => m.id !== props.sourceUserId && m.isWellhub !== true);
      update(() => {
        options.value = candidates.map(buildOption);
      });
    })
    .catch((err: unknown) => {
      if (seq !== searchSeq) return;
      log.error('Error buscando alumnos para unir', {
        error: err instanceof Error ? err.message : String(err),
      });
      update(() => {
        options.value = [];
      });
    })
    .finally(() => {
      if (seq === searchSeq) searching.value = false;
    });
}

function reset(): void {
  searchSeq++;
  target.value = null;
  options.value = [];
  searchText.value = '';
  searching.value = false;
  submitting.value = false;
  failureMessage.value = null;
}

// Cada apertura arranca limpia: un destino elegido antes no puede filtrarse a otra ficha.
watch(
  () => props.modelValue,
  (open) => {
    if (open) reset();
  }
);

// Si el staff cambia de destino, el rechazo anterior ya no aplica.
watch(target, () => {
  failureMessage.value = null;
});

async function onConfirm(): Promise<void> {
  if (!target.value || submitting.value) return;
  const targetId = target.value.value;
  submitting.value = true;
  failureMessage.value = null;
  try {
    await wellhubApi.mergeInto(props.sourceUserId, targetId);
    $q.notify({ type: 'positive', message: 'Fichas unidas' });
    emit('merged', targetId);
    emit('update:modelValue', false);
  } catch (err: unknown) {
    // Rechazos de negocio (otro ID de Wellhub, choque de reservas, no es puro): el
    // servidor manda el motivo en español.
    const message = extractError(err, 'No se pudieron unir las fichas');
    failureMessage.value = message;
    log.warn('No se pudieron unir las fichas', {
      message,
      sourceUserId: props.sourceUserId,
      targetUserId: targetId,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}

function onCancel(): void {
  emit('update:modelValue', false);
}

function onHide(): void {
  reset();
  wellhubApi.cleanup();
}
</script>
