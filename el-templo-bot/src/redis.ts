/**
 * Redis Client Singleton
 *
 * Shared Redis connection for conversation context, customer memory,
 * distributed locks, and bot state.
 *
 * TODO: Implement with ioredis.
 * See digital-initiatives/whatsapp-agent-renovafacil/redis_client.py for pattern.
 *
 * Key patterns:
 * - wa:context:{phone}  — last N messages for AI context (TTL: 6h)
 * - wa:profile:{phone}  — persistent customer profile (TTL: 90d)
 * - wa:lock:{scheduler}  — distributed lock for schedulers
 * - wa:bot_state:{phone} — 'active' | 'human_takeover'
 */

export {};

// TODO: Export Redis singleton
// TODO: Export helper functions (getContext, setContext, getProfile, setProfile, acquireLock, releaseLock)
