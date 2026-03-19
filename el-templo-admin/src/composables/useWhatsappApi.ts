/**
 * WhatsApp API composable.
 * Provides methods for fetching WhatsApp conversations and messages.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type { ConversationRecord, MessageRecord, ConversationListParams } from 'src/types/whatsapp';

export function useWhatsappApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ─── Conversations ──────────────────────────────────────────────────────

  async function getConversations(
    params?: Partial<ConversationListParams>
  ): Promise<{ conversations: ConversationRecord[]; total: number; page: number; limit: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{
        conversations: ConversationRecord[];
        total: number;
        page: number;
        limit: number;
      }>('/admin/whatsapp/conversations', { params });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando conversaciones');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getConversation(
    id: number,
    messagePage?: number,
    messageLimit?: number
  ): Promise<{
    conversation: ConversationRecord;
    messages: MessageRecord[];
    totalMessages: number;
  }> {
    loading.value = true;
    error.value = null;
    try {
      const params: Record<string, unknown> = {};
      if (messagePage !== undefined) params.messagePage = messagePage;
      if (messageLimit !== undefined) params.messageLimit = messageLimit;
      const { data } = await api.get<{
        conversation: ConversationRecord;
        messages: MessageRecord[];
        totalMessages: number;
      }>(`/admin/whatsapp/conversations/${id}`, { params });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando conversacion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getActiveCount(): Promise<number> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{
        conversations: ConversationRecord[];
        total: number;
        page: number;
        limit: number;
      }>('/admin/whatsapp/conversations', {
        params: { status: 'active', limit: 1 },
      });
      return data.total;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando conteo de conversaciones');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    getConversations,
    getConversation,
    getActiveCount,
    cleanup,
  };
}
