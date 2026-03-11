<template>
  <div>
    <!-- Add note section -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <q-input
          v-model="newNoteContent"
          type="textarea"
          :rows="2"
          outlined
          placeholder="Agregar nota..."
          :disable="addingNote"
        />
        <div class="q-mt-sm text-right">
          <q-btn
            label="Agregar"
            color="primary"
            :disable="!newNoteContent.trim() || addingNote"
            :loading="addingNote"
            @click="onAddNote"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Loading -->
    <div v-if="loadingNotes" class="flex flex-center q-pa-lg">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <!-- Empty state -->
    <div v-else-if="notes.length === 0" class="text-center q-pa-lg">
      <div class="text-grey-5 text-italic">Sin notas</div>
    </div>

    <!-- Notes timeline -->
    <q-list v-else separator>
      <q-item v-for="note in notes" :key="note.id" class="q-py-md">
        <q-item-section avatar top>
          <q-avatar color="primary" text-color="white" size="36px">
            {{ authorInitials(note.authorName) }}
          </q-avatar>
        </q-item-section>

        <q-item-section>
          <!-- View mode -->
          <template v-if="editingNoteId !== note.id">
            <q-item-label>
              <span class="text-weight-bold">{{ note.authorName }}</span>
              <span class="text-caption text-grey-6 q-ml-sm">
                {{ formatNoteDate(note.createdAt) }}
                <template v-if="note.updatedAt !== note.createdAt"> (editada) </template>
              </span>
            </q-item-label>
            <q-item-label class="q-mt-xs" style="white-space: pre-wrap">{{
              note.content
            }}</q-item-label>
          </template>

          <!-- Edit mode -->
          <template v-else>
            <q-input v-model="editContent" type="textarea" :rows="2" outlined dense autofocus />
            <div class="q-mt-sm q-gutter-sm">
              <q-btn
                size="sm"
                label="Guardar"
                color="primary"
                :loading="savingNote"
                :disable="!editContent.trim()"
                @click="onSaveEdit(note)"
              />
              <q-btn size="sm" flat label="Cancelar" @click="cancelEdit" />
            </div>
          </template>
        </q-item-section>

        <!-- Action buttons (only in view mode) -->
        <q-item-section v-if="canEdit(note) && editingNoteId !== note.id" side top>
          <div class="q-gutter-xs">
            <q-btn flat dense round icon="edit" size="sm" color="grey-7" @click="startEdit(note)">
              <q-tooltip>Editar</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              round
              icon="delete"
              size="sm"
              color="grey-7"
              @click="onDeleteNote(note)"
            >
              <q-tooltip>Eliminar</q-tooltip>
            </q-btn>
          </div>
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useMembersApi } from 'src/composables/useMembersApi';
import type { MemberNote } from 'src/types/member';

const log = createLogger('MemberNotesTab');
const $q = useQuasar();
const membersApi = useMembersApi();

// =========================================================================
// Props
// =========================================================================

const props = defineProps<{
  userId: number;
  currentUserId: number;
  currentUserRole: string;
}>();

// =========================================================================
// State
// =========================================================================

const notes = ref<MemberNote[]>([]);
const loadingNotes = ref(false);
const newNoteContent = ref('');
const addingNote = ref(false);
const editingNoteId = ref<number | null>(null);
const editContent = ref('');
const savingNote = ref(false);

// =========================================================================
// Data loading
// =========================================================================

async function loadNotes() {
  loadingNotes.value = true;
  try {
    notes.value = await membersApi.getNotes(props.userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading notes', { error: message, userId: props.userId });
    $q.notify({ type: 'negative', message: 'Error cargando notas' });
  } finally {
    loadingNotes.value = false;
  }
}

// =========================================================================
// Add note
// =========================================================================

async function onAddNote() {
  const content = newNoteContent.value.trim();
  if (!content) return;

  addingNote.value = true;
  try {
    const note = await membersApi.createNote(props.userId, { content });
    notes.value.unshift(note);
    newNoteContent.value = '';
    $q.notify({ type: 'positive', message: 'Nota agregada' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error creating note', { error: message });
    $q.notify({ type: 'negative', message: 'Error agregando nota' });
  } finally {
    addingNote.value = false;
  }
}

// =========================================================================
// Edit note
// =========================================================================

function startEdit(note: MemberNote) {
  editingNoteId.value = note.id;
  editContent.value = note.content;
}

function cancelEdit() {
  editingNoteId.value = null;
  editContent.value = '';
}

async function onSaveEdit(note: MemberNote) {
  const content = editContent.value.trim();
  if (!content) return;

  savingNote.value = true;
  try {
    const updated = await membersApi.updateNote(props.userId, note.id, { content });
    const idx = notes.value.findIndex((n) => n.id === note.id);
    if (idx !== -1) {
      notes.value[idx] = updated;
    }
    editingNoteId.value = null;
    editContent.value = '';
    $q.notify({ type: 'positive', message: 'Nota actualizada' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error updating note', { error: message });
    $q.notify({ type: 'negative', message: 'Error actualizando nota' });
  } finally {
    savingNote.value = false;
  }
}

// =========================================================================
// Delete note
// =========================================================================

function onDeleteNote(note: MemberNote) {
  $q.dialog({
    title: 'Eliminar nota',
    message: 'Eliminar esta nota?',
    cancel: { flat: true, label: 'Cancelar' },
    ok: { color: 'negative', label: 'Eliminar' },
  }).onOk(async () => {
    try {
      await membersApi.deleteNote(props.userId, note.id);
      notes.value = notes.value.filter((n) => n.id !== note.id);
      $q.notify({ type: 'positive', message: 'Nota eliminada' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error deleting note', { error: message });
      $q.notify({ type: 'negative', message: 'Error eliminando nota' });
    }
  });
}

// =========================================================================
// Permissions
// =========================================================================

function canEdit(note: MemberNote): boolean {
  if (props.currentUserRole === 'admin' || props.currentUserRole === 'superadmin') return true;
  return note.authorId === props.currentUserId;
}

// =========================================================================
// Helpers
// =========================================================================

function authorInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return '?';
}

function formatNoteDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadNotes();
});
</script>
