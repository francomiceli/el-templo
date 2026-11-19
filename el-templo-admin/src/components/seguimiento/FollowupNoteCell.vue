<!-- Observación editable en la celda (feedback 2026-09-29, mismo gesto que Comentarios
     en SP): click → escribir → se guarda al salir del campo, Esc cancela. Cada guardado
     es una nota NUEVA (la anterior queda en el historial de la ficha), por eso el campo
     arranca vacío en vez de precargar la última. Lo comparten Renovaciones e Invitaciones.

     `save` hace el POST y devuelve true si guardó: si falla (false o excepción) el
     borrador queda abierto para no perder lo escrito. -->
<template>
  <q-input
    v-if="editing"
    v-model="draft"
    type="textarea"
    autogrow
    dense
    outlined
    autofocus
    maxlength="2000"
    placeholder="Nueva observación…"
    :loading="saving"
    @blur="onBlur"
    @keydown.esc.prevent="cancel"
  />
  <div v-else class="cursor-pointer note-display" @click="start">
    <template v-if="note">
      <span class="ellipsis-note">{{ note.content }}</span>
      <q-tooltip max-width="320px">
        <div style="white-space: pre-wrap">{{ note.content }}</div>
        <div class="text-caption q-mt-xs">
          {{ formatDate(note.createdAt) }}
          <template v-if="note.authorName"> · {{ note.authorName }} </template>
          — click para agregar otra
        </div>
      </q-tooltip>
    </template>
    <span v-else class="text-grey-5"> <q-icon name="edit" size="14px" /> Agregar… </span>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { formatDate } from 'src/utils/format-date';

const props = defineProps<{
  note: { content: string; createdAt: string; authorName: string | null } | null;
  /** Guarda la observación; true = guardada (se cierra el campo), false = falló (queda abierto). */
  save: (content: string) => Promise<boolean>;
}>();

const emit = defineEmits<{
  /** Se abrió o cerró el campo (para que la pantalla no se refresque mientras se escribe). */
  'editing-change': [editing: boolean];
}>();

const editing = ref(false);
const saving = ref(false);
const draft = ref('');

watch(editing, (value) => emit('editing-change', value));

// Si la fila desaparece con el campo abierto (filtro, recarga) hay que avisar que ya no se edita.
onBeforeUnmount(() => {
  if (editing.value) emit('editing-change', false);
});

function start() {
  editing.value = true;
  draft.value = '';
}

function cancel() {
  editing.value = false;
  draft.value = '';
}

async function onBlur() {
  // `@blur` puede dispararse de nuevo mientras se guarda (el input pierde el foco al
  // pasar a loading): el primer guardado manda.
  if (saving.value) return;
  const content = draft.value.trim();
  if (!content) {
    cancel();
    return;
  }
  saving.value = true;
  try {
    if (await props.save(content)) cancel();
  } catch {
    // `save` es quien avisa el error; acá solo se deja el borrador abierto.
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
.ellipsis-note {
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.note-display {
  min-height: 20px;
}
</style>
