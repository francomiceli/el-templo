<!-- Badge de estado de un seguimiento con menú para cambiarlo a mano. Lo comparten
     Renovaciones (RenewalStatusMenu) e Invitaciones (InvitationStatusChip): el
     estado "negativo" (No renueva / No sigue) exige un motivo de la lista, por eso
     abre un submenú con los motivos activos — dos clicks — y "Más opciones" deja
     cargar también la nota del motivo.

     Solo lo manual se cambia desde acá; si el estado lo deriva el sistema, el menú
     (cuando hay `explanation`) lo explica en vez de ofrecer algo que se pisaría.
     Sin `editable` y sin `explanation` el badge es solo una etiqueta, sin menú. -->
<template>
  <q-badge
    :color="color"
    :label="label"
    class="followup-status-badge"
    :class="{ 'cursor-pointer': hasMenu }"
    :role="hasMenu ? 'button' : undefined"
    :aria-label="hasMenu ? `Estado: ${label}. Cambiar estado` : undefined"
  >
    <q-icon v-if="editable" name="arrow_drop_down" size="14px" class="q-ml-xs" />
    <q-menu v-if="hasMenu" anchor="bottom left" self="top left">
      <q-list dense style="min-width: 220px">
        <template v-if="editable">
          <q-item v-if="negative" clickable v-close-popup @click="emit('reset')">
            <q-item-section avatar><q-icon name="undo" size="18px" /></q-item-section>
            <q-item-section>{{ resetLabel }}</q-item-section>
          </q-item>

          <q-item clickable>
            <q-item-section avatar
              ><q-icon name="cancel" color="negative" size="18px"
            /></q-item-section>
            <q-item-section>
              {{ negative ? 'Cambiar motivo' : negativeLabel }}
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
                  :active="negative && reasonId === reason.id"
                  @click="emit('negative', reason.id)"
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
            {{ explanation }}
          </q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </q-badge>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RenewalReason } from 'src/types/renewals';

const props = withDefaults(
  defineProps<{
    label: string;
    color: string;
    /** Se puede cambiar a mano: muestra la flecha y las opciones. */
    editable: boolean;
    /** Ya está en el estado negativo manual (marca el motivo activo y ofrece volver). */
    negative: boolean;
    reasonId: number | null;
    reasons: RenewalReason[];
    /** "No renueva" / "No sigue". */
    negativeLabel: string;
    /** "Volver a En proceso" / "Volver a Para contactar". */
    resetLabel: string;
    /** Qué se muestra en el menú cuando no es editable; vacío = sin menú. */
    explanation?: string;
  }>(),
  { explanation: '' }
);

const emit = defineEmits<{
  reset: [];
  negative: [reasonId: number];
  'open-details': [];
}>();

const hasMenu = computed(() => props.editable || props.explanation !== '');
</script>

<style scoped lang="scss">
.followup-status-badge {
  user-select: none;
}
</style>
