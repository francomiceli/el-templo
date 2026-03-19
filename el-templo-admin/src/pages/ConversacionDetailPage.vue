<template>
  <q-page class="column" style="height: calc(100vh - 50px)">
    <!-- Header bar -->
    <div class="row items-center q-pa-sm bg-grey-2 no-wrap" style="min-height: 56px">
      <q-btn flat dense round icon="arrow_back" @click="goBack" />
      <div class="q-ml-sm column">
        <div class="text-weight-bold">
          {{ conversation?.contactName || conversation?.phone || 'Cargando...' }}
        </div>
        <div v-if="conversation?.contactName" class="text-caption text-grey-7">
          {{ conversation.phone }}
        </div>
      </div>
      <q-space />
      <q-badge
        v-if="conversation"
        :color="statusColor(conversation.status)"
        :label="statusLabel(conversation.status)"
        class="q-mr-sm"
      />
      <q-badge
        v-if="conversation"
        :color="clientStateColor(conversation.clientState)"
        :label="clientStateLabel(conversation.clientState)"
        class="q-mr-sm"
      />
      <!-- Takeover button -->
      <q-btn
        v-if="conversation?.status === 'active'"
        dense
        no-caps
        icon="pan_tool"
        label="Tomar control"
        color="orange"
        size="sm"
        class="q-mr-sm"
        :loading="whatsappApi.loading.value"
        :disable="whatsappApi.loading.value"
        @click="handleTakeover"
      />
      <!-- Resume bot button -->
      <q-btn
        v-if="conversation?.status === 'human_takeover'"
        dense
        no-caps
        icon="smart_toy"
        label="Devolver al bot"
        color="green"
        size="sm"
        class="q-mr-sm"
        :loading="whatsappApi.loading.value"
        :disable="whatsappApi.loading.value"
        @click="handleResumeBot"
      />
      <q-btn
        v-if="conversation?.linkedMemberId"
        flat
        dense
        icon="person"
        :label="conversation.linkedMemberName || 'Ver alumno'"
        color="primary"
        size="sm"
        @click="router.push(`/alumnos/${conversation.linkedMemberId}`)"
      />
    </div>

    <!-- Error banner -->
    <q-banner v-if="errorMessage" class="bg-negative text-white">
      {{ errorMessage }}
    </q-banner>

    <!-- Chat area -->
    <div ref="chatContainer" class="col scroll q-pa-md" style="overflow-y: auto">
      <q-inner-loading :showing="loading" />

      <!-- Load older messages button -->
      <div v-if="hasMoreMessages" class="text-center q-mb-md">
        <q-btn
          flat
          dense
          color="primary"
          label="Cargar mensajes anteriores"
          :loading="loadingOlder"
          @click="loadOlderMessages"
        />
      </div>

      <!-- Empty state -->
      <div v-if="!loading && messages.length === 0" class="text-center text-grey-5 q-pa-xl">
        Sin mensajes
      </div>

      <!-- Messages -->
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="row q-mb-sm"
        :class="msg.direction === 'inbound' ? 'justify-start' : 'justify-end'"
      >
        <div class="chat-bubble q-pa-sm" :class="bubbleClass(msg.direction)" style="max-width: 70%">
          <div class="text-body2" style="white-space: pre-wrap">{{ msg.content }}</div>
          <div class="row items-center justify-end q-mt-xs" style="gap: 4px">
            <span v-if="msg.direction !== 'inbound'" class="text-caption text-grey-6">
              {{ msg.direction === 'outbound_bot' ? 'Bot' : 'Admin' }}
            </span>
            <span class="text-caption text-grey-5">
              {{ formatTime(msg.createdAt) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Bottom sentinel for auto-scroll -->
      <div ref="bottomSentinel" />
    </div>

    <!-- Message input bar (only in human_takeover mode) -->
    <div
      v-if="conversation?.status === 'human_takeover'"
      class="row items-center q-pa-sm bg-grey-1"
      style="border-top: 1px solid #e0e0e0"
    >
      <q-input
        v-model="newMessage"
        outlined
        dense
        placeholder="Escribi un mensaje..."
        class="col"
        @keyup.enter="handleSendMessage"
      />
      <q-btn
        round
        dense
        flat
        icon="send"
        color="primary"
        class="q-ml-sm"
        :loading="whatsappApi.sending.value"
        :disable="whatsappApi.sending.value || !newMessage.trim()"
        @click="handleSendMessage"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useWhatsappApi } from 'src/composables/useWhatsappApi';
import type {
  ConversationRecord,
  MessageRecord,
  ConversationStatus,
  ClientState,
  MessageDirection,
} from 'src/types/whatsapp';

const log = createLogger('ConversacionDetailPage');
const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const whatsappApi = useWhatsappApi();

// =========================================================================
// State
// =========================================================================

const conversation = ref<ConversationRecord | null>(null);
const messages = ref<MessageRecord[]>([]);
const totalMessages = ref(0);
const loading = ref(false);
const loadingOlder = ref(false);
const errorMessage = ref<string | null>(null);
const chatContainer = ref<HTMLDivElement | null>(null);
const bottomSentinel = ref<HTMLDivElement | null>(null);
const newMessage = ref('');
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null);

const messagePage = ref(1);
const messageLimit = 50;

const hasMoreMessages = ref(false);

// =========================================================================
// Badge helpers
// =========================================================================

function statusColor(status: ConversationStatus): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'human_takeover':
      return 'orange';
    case 'closed':
      return 'grey';
    default:
      return 'grey';
  }
}

function statusLabel(status: ConversationStatus): string {
  switch (status) {
    case 'active':
      return 'Activo';
    case 'human_takeover':
      return 'Humano';
    case 'closed':
      return 'Cerrado';
    default:
      return status;
  }
}

function clientStateColor(state: ClientState): string {
  switch (state) {
    case 'lead':
      return 'blue';
    case 'trial':
      return 'purple';
    case 'active_member':
      return 'green';
    case 'inactive_member':
      return 'orange';
    case 'expired_member':
      return 'red';
    default:
      return 'grey';
  }
}

function clientStateLabel(state: ClientState): string {
  switch (state) {
    case 'lead':
      return 'Lead';
    case 'trial':
      return 'Trial';
    case 'active_member':
      return 'Activo';
    case 'inactive_member':
      return 'Inactivo';
    case 'expired_member':
      return 'Expirado';
    default:
      return state;
  }
}

// =========================================================================
// Chat bubble styling
// =========================================================================

function bubbleClass(direction: MessageDirection): string {
  switch (direction) {
    case 'inbound':
      return 'bubble-inbound';
    case 'outbound_bot':
      return 'bubble-bot';
    case 'outbound_human':
      return 'bubble-human';
    default:
      return '';
  }
}

// =========================================================================
// Display helpers
// =========================================================================

function formatTime(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

// =========================================================================
// Navigation
// =========================================================================

function goBack() {
  router.push('/conversaciones');
}

// =========================================================================
// Scroll
// =========================================================================

function scrollToBottom() {
  nextTick(() => {
    bottomSentinel.value?.scrollIntoView({ behavior: 'instant' });
  });
}

// =========================================================================
// Data loading
// =========================================================================

async function loadConversation() {
  const id = Number(route.params.id);
  if (Number.isNaN(id)) {
    errorMessage.value = 'ID de conversacion invalido';
    return;
  }

  loading.value = true;
  errorMessage.value = null;
  try {
    const result = await whatsappApi.getConversation(id, messagePage.value, messageLimit);
    conversation.value = result.conversation;
    messages.value = result.messages;
    totalMessages.value = result.totalMessages;
    hasMoreMessages.value = result.messages.length < result.totalMessages;
    scrollToBottom();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading conversation', { error: message });
    errorMessage.value = whatsappApi.error.value ?? 'Error cargando conversacion';
  } finally {
    loading.value = false;
  }
}

async function loadOlderMessages() {
  const id = Number(route.params.id);
  if (Number.isNaN(id)) return;

  loadingOlder.value = true;
  try {
    const nextPage = messagePage.value + 1;
    const result = await whatsappApi.getConversation(id, nextPage, messageLimit);
    // Prepend older messages
    messages.value = [...result.messages, ...messages.value];
    messagePage.value = nextPage;
    hasMoreMessages.value = messages.value.length < result.totalMessages;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading older messages', { error: message });
  } finally {
    loadingOlder.value = false;
  }
}

// =========================================================================
// Actions: takeover, resume, send
// =========================================================================

async function handleTakeover() {
  const id = Number(route.params.id);
  if (Number.isNaN(id)) return;

  errorMessage.value = null;
  try {
    const updated = await whatsappApi.takeover(id);
    conversation.value = updated;
    $q.notify({ type: 'positive', message: 'Control tomado' });
  } catch {
    errorMessage.value = whatsappApi.error.value ?? 'Error tomando control';
  }
}

async function handleResumeBot() {
  const id = Number(route.params.id);
  if (Number.isNaN(id)) return;

  errorMessage.value = null;
  try {
    const updated = await whatsappApi.resumeBot(id);
    conversation.value = updated;
    $q.notify({ type: 'positive', message: 'Bot reactivado' });
  } catch {
    errorMessage.value = whatsappApi.error.value ?? 'Error devolviendo al bot';
  }
}

async function handleSendMessage() {
  const id = Number(route.params.id);
  const content = newMessage.value.trim();
  if (Number.isNaN(id) || !content) return;

  errorMessage.value = null;
  try {
    const msg = await whatsappApi.sendMessage(id, content);
    messages.value.push(msg);
    newMessage.value = '';
    scrollToBottom();
  } catch {
    errorMessage.value = whatsappApi.error.value ?? 'Error enviando mensaje';
  }
}

// =========================================================================
// Polling
// =========================================================================

async function pollMessages() {
  const id = Number(route.params.id);
  if (Number.isNaN(id)) return;

  try {
    const result = await whatsappApi.getConversation(id, 1, messageLimit);

    // Update conversation status if changed
    if (conversation.value && result.conversation.status !== conversation.value.status) {
      conversation.value = result.conversation;
    }

    // Update messages if total changed (new messages arrived)
    if (result.totalMessages !== totalMessages.value) {
      messages.value = result.messages;
      totalMessages.value = result.totalMessages;
      hasMoreMessages.value = result.messages.length < result.totalMessages;
      scrollToBottom();
    }
  } catch (err: unknown) {
    // Silent polling failure -- don't overwrite user-facing errors
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Polling error', { error: message });
  }
}

function startPolling() {
  stopPolling();
  pollTimer.value = setInterval(() => {
    void pollMessages();
  }, 5000);
}

function stopPolling() {
  if (pollTimer.value !== null) {
    clearInterval(pollTimer.value);
    pollTimer.value = null;
  }
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(async () => {
  await loadConversation();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
  whatsappApi.cleanup();
});
</script>

<style scoped>
.chat-bubble {
  border-radius: 12px;
  word-break: break-word;
}

.bubble-inbound {
  background-color: #f5f5f5;
  border-bottom-left-radius: 0;
}

.bubble-bot {
  background-color: #dcedc8;
  border-bottom-right-radius: 0;
}

.bubble-human {
  background-color: #bbdefb;
  border-bottom-right-radius: 0;
}
</style>
