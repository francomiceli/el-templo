<!-- Badge de estado de Renovaciones con menú para cambiarlo a mano
     (feedback 2026-09-29: "poder marcar 'no renueva' sin entrar a la ficha,
     trabajamos las dos sobre la misma planilla").

     Solo En proceso ⇄ No renueva es manual. Renovó / Volvió tarde / Pausada se
     derivan de las membresías (ver docblock del service en la API): el menú
     lo explica en vez de ofrecer una opción que el sistema pisaría. El motivo
     sigue siendo obligatorio (alimenta los KPIs), por eso "No renueva" abre
     un submenú con los motivos activos — dos clicks. -->
<template>
  <q-badge
    :color="meta.color"
    :label="renewalStatusLabel(row)"
    class="cursor-pointer renewal-status-badge"
    role="button"
    :aria-label="`Estado: ${renewalStatusLabel(row)}. Cambiar estado`"
  >
    <q-icon v-if="isManual" name="arrow_drop_down" size="14px" class="q-ml-xs" />
    <q-menu anchor="bottom left" self="top left">
      <q-list dense style="min-width: 220px">
        <template v-if="isManual">
          <q-item v-if="row.status === 'no_renovo'" clickable v-close-popup @click="setEnProceso">
            <q-item-section avatar><q-icon name="undo" size="18px" /></q-item-section>
            <q-item-section>Volver a En proceso</q-item-section>
          </q-item>

          <q-item clickable>
            <q-item-section avatar
              ><q-icon name="cancel" color="negative" size="18px"
            /></q-item-section>
            <q-item-section>
              {{ row.status === 'no_renovo' ? 'Cambiar motivo' : 'No renueva' }}
            </q-item-section>
            <q-item-section side><q-icon name="keyboard_arrow_right" /></q-item-section>

            <q-menu anchor="top end" self="top start">
              <q-list dense style="min-width: 180px">
                <q-item-label header>Motivo</q-item-label>
                <q-item
                  v-for="reason in reasons"
                  :key="reason.id"
                  clickable
                  v-close-popup
                  :active="row.status === 'no_renovo' && row.reasonId === reason.id"
                  @click="setNoRenueva(reason.id)"
                >
                  <q-item-section>{{ reason.label }}</q-item-section>
                </q-item>
                <q-item v-if="reasons.length === 0">
                  <q-item-section class="text-grey-6">No hay motivos activos</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-item>

          <q-separator />
          <q-item clickable v-close-popup @click="emit('open-details')">
            <q-item-section avatar><q-icon name="edit_note" size="18px" /></q-item-section>
            <q-item-section>Más opciones (nota del motivo)…</q-item-section>
          </q-item>
        </template>

        <q-item v-else>
          <q-item-section class="text-caption text-grey-7" style="max-width: 240px">
            {{ derivedExplanation }}
          </q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </q-badge>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { renewalStatusMeta, renewalStatusLabel } from 'src/utils/renewal-status';
import type { RenewalRow, RenewalReason, RenewalFollowupUpdateInput } from 'src/types/renewals';

const props = defineProps<{
  row: RenewalRow;
  reasons: RenewalReason[];
}>();

const emit = defineEmits<{
  change: [input: RenewalFollowupUpdateInput];
  'open-details': [];
}>();

const meta = computed(() => renewalStatusMeta(props.row.status));

/** Solo En proceso / No renueva se cambian a mano — el resto lo detecta el sistema. */
const isManual = computed(
  () => props.row.status === 'en_proceso' || props.row.status === 'no_renovo'
);

const derivedExplanation = computed(() => {
  switch (props.row.status) {
    case 'renovo':
      return 'Se detecta solo: tiene una membresía nueva cargada dentro de la ventana.';
    case 'volvio_tarde':
      return 'Se detecta solo: cargó una membresía nueva después de la ventana de 5 días.';
    case 'pausada':
      return 'Se detecta sola: la membresía está pausada. Se cambia desde la ficha del alumno.';
    default:
      return '';
  }
});

function setEnProceso() {
  emit('change', { manualStatus: 'en_proceso' });
}

function setNoRenueva(reasonId: number) {
  emit('change', { manualStatus: 'no_renovo', reasonId });
}
</script>

<style scoped lang="scss">
.renewal-status-badge {
  user-select: none;
}
</style>
