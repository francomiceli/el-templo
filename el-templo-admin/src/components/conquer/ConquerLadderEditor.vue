<!--
  Editor de una escalera de Conquer (fase 201, §8.1, D-04, D-14): los peldaños de más difícil
  (arriba) a más fácil (abajo). Por peldaño: subir/bajar de lugar, renombrar, marcar brazos rectos
  (fallo técnico) y por lado (unilateral), activar/desactivar (nunca se borra) y el chip "En uso"
  si algún alumno lo tiene como progresión. Abajo, el alta de un peldaño nuevo, que entra como el
  más fácil. Cada mutación devuelve la escalera completa (`changed`): el catálogo reemplaza su
  copia con esa respuesta. El API valida todo (arranque, último activo, orden completo) y su
  mensaje en español se muestra tal cual; si algo falla se pide releer el catálogo (`failed`).
  Escrito de cero: no se copia el editor de escaleras de la 196 (acoplado a ejercicios, con el orden al revés).
-->
<template>
  <div data-test="conquer-ladder-editor">
    <div class="text-caption text-grey-8 q-mb-xs">
      <q-icon name="north" size="14px" /> Más difícil
    </div>

    <q-list bordered separator class="rounded-borders">
      <q-item
        v-for="(rung, idx) in rungs"
        :key="rung.id"
        class="items-start conquer-rung"
        :class="{ 'conquer-rung--off': !rung.isActive }"
        data-test="conquer-rung"
      >
        <q-item-section side class="q-pr-sm">
          <div class="column items-center">
            <q-btn
              flat
              round
              dense
              icon="arrow_upward"
              color="accent"
              :disable="busy || idx === 0"
              :aria-label="`Subir ${rung.name}`"
              style="min-width: 44px; min-height: 44px"
              data-test="conquer-rung-up"
              @click="move(idx, -1)"
            />
            <q-btn
              flat
              round
              dense
              icon="arrow_downward"
              color="accent"
              :disable="busy || idx === rungs.length - 1"
              :aria-label="`Bajar ${rung.name}`"
              style="min-width: 44px; min-height: 44px"
              data-test="conquer-rung-down"
              @click="move(idx, 1)"
            />
          </div>
        </q-item-section>

        <q-item-section>
          <div class="row items-center q-col-gutter-sm">
            <div class="col-12 col-sm">
              <q-input
                :model-value="drafts[rung.id] ?? rung.name"
                dense
                outlined
                maxlength="60"
                :label="`Peldaño ${idx + 1}`"
                :disable="busy"
                data-test="conquer-rung-name"
                @update:model-value="setDraft(rung.id, $event)"
                @blur="commitName(rung)"
                @keyup.enter="commitName(rung)"
              />
            </div>
            <div class="col-auto row items-center q-gutter-xs">
              <q-chip v-if="rung.inUse" dense square outline color="accent" class="q-ma-none">
                En uso
              </q-chip>
              <q-chip v-if="!rung.isActive" dense square color="grey-3" text-color="accent">
                Desactivado
              </q-chip>
            </div>
          </div>

          <div class="row items-center q-gutter-x-md q-mt-xs">
            <q-checkbox
              :model-value="rung.brazosRectos"
              dense
              color="secondary"
              label="Brazos rectos (fallo técnico)"
              :disable="busy"
              data-test="conquer-rung-straight"
              @update:model-value="patch(rung, { brazosRectos: Boolean($event) })"
            />
            <q-checkbox
              :model-value="rung.unilateral"
              dense
              color="secondary"
              label="Por lado (unilateral)"
              :disable="busy"
              data-test="conquer-rung-unilateral"
              @update:model-value="patch(rung, { unilateral: Boolean($event) })"
            />
            <q-toggle
              :model-value="rung.isActive"
              dense
              color="secondary"
              label="Activo"
              :disable="busy"
              data-test="conquer-rung-active"
              @update:model-value="patch(rung, { isActive: Boolean($event) })"
            />
          </div>
        </q-item-section>

        <q-inner-loading :showing="busyRungId === rung.id">
          <q-spinner size="24px" color="secondary" />
        </q-inner-loading>
      </q-item>
    </q-list>

    <div class="text-caption text-grey-8 q-mt-xs">
      <q-icon name="south" size="14px" /> Más fácil
    </div>

    <form class="row items-start q-col-gutter-sm q-mt-sm" @submit.prevent="addRung">
      <div class="col-12 col-sm">
        <q-input
          v-model="newName"
          dense
          outlined
          maxlength="60"
          label="Nuevo peldaño (más fácil)"
          :disable="busy"
          data-test="conquer-rung-new-name"
        />
      </div>
      <div class="col-12 col-sm-auto">
        <q-btn
          type="submit"
          unelevated
          no-caps
          color="secondary"
          icon="add"
          label="Agregar"
          :loading="busyRungId === NEW_RUNG"
          :disable="busy || newName.trim() === ''"
          style="min-height: 44px"
          data-test="conquer-rung-add"
        />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type { AdminLadder, AdminRung, UpdateRungBody } from 'src/types/conquer';

const props = defineProps<{
  ladder: AdminLadder;
}>();

const emit = defineEmits<{
  /** El API devolvió la escalera completa: el catálogo reemplaza la suya. */
  changed: [ladder: AdminLadder];
  /** Una mutación falló: el catálogo se relee para no mostrar un estado viejo. */
  failed: [];
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

const NEW_RUNG = -1;

// Posición 0 = el más difícil: el orden de la lista es el de `position`.
const rungs = computed<AdminRung[]>(() =>
  [...props.ladder.rungs].sort((a, b) => a.position - b.position)
);

// Nombres en edición (se confirman al salir del campo o con Enter).
const drafts = reactive<Record<number, string>>({});
const newName = ref('');
// Una sola mutación a la vez: el resto de los controles quedan deshabilitados.
const busyRungId = ref<number | null>(null);
const busy = computed(() => busyRungId.value !== null);

// Cuando llega la escalera nueva, los borradores ya no hacen falta.
watch(
  () => props.ladder,
  () => {
    for (const key of Object.keys(drafts)) delete drafts[Number(key)];
  }
);

function setDraft(rungId: number, value: string | number | null): void {
  drafts[rungId] = value === null ? '' : String(value);
}

async function run(rungId: number, action: () => Promise<AdminLadder>): Promise<boolean> {
  busyRungId.value = rungId;
  try {
    emit('changed', await action());
    return true;
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'No pudimos guardar el cambio',
    });
    // El borrador descartado vuelve al nombre guardado.
    delete drafts[rungId];
    emit('failed');
    return false;
  } finally {
    busyRungId.value = null;
  }
}

async function patch(rung: AdminRung, body: UpdateRungBody): Promise<void> {
  await run(rung.id, () => conquerApi.updateRung(rung.id, body));
}

async function commitName(rung: AdminRung): Promise<void> {
  const draft = drafts[rung.id];
  if (draft === undefined || busy.value) return;
  const name = draft.trim();
  if (name === '' || name === rung.name) {
    delete drafts[rung.id];
    return;
  }
  await patch(rung, { name });
}

async function move(index: number, delta: -1 | 1): Promise<void> {
  const target = index + delta;
  const ordered = rungs.value.map((r) => r.id);
  if (target < 0 || target >= ordered.length) return;
  const moved = ordered[index];
  const other = ordered[target];
  if (moved === undefined || other === undefined) return;
  ordered[index] = other;
  ordered[target] = moved;
  // El API pide TODOS los ids de la escalera (también los desactivados), del más difícil al más fácil.
  await run(moved, () => conquerApi.reorderRungs(props.ladder.id, ordered));
}

async function addRung(): Promise<void> {
  const name = newName.value.trim();
  if (name === '' || busy.value) return;
  const ok = await run(NEW_RUNG, () =>
    conquerApi.createRung(props.ladder.id, { name, brazosRectos: false, unilateral: false })
  );
  if (ok) newName.value = '';
}
</script>

<style scoped lang="scss">
.conquer-rung {
  position: relative;
}

.conquer-rung--off {
  background: $grey-2;
  color: $grey-8;
}
</style>
