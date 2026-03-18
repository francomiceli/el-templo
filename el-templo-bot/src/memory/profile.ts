/**
 * Customer Profile Memory (Redis, TTL: 90 days)
 *
 * Persistent profile that survives across conversations.
 * Stores customer details (name, injuries, preferences, notes)
 * and is injected into AI context on each message.
 *
 * Degrades silently when Redis is unavailable -- returns null / no-op.
 */

import pino from "pino";
import { redis, isRedisAvailable } from "../redis.js";
import type { ClientState } from "../state/machine.js";

const log = pino({ name: "el-templo-bot:profile" });

/** TTL for customer profiles: 90 days in seconds */
export const PROFILE_TTL = 7_776_000;

/** Max character length for notes (~500 tokens) */
export const MAX_NOTES_LENGTH = 2000;

/** Redis key prefix for customer profiles */
const KEY_PREFIX = "wa:profile:";

export interface CustomerProfile {
  name?: string;
  clientState: ClientState;
  membershipPlan?: string;
  branchPreference?: string;
  injuries?: string[];
  classPreferences?: string[];
  notes: string;
  linkedUserId?: number;
  updatedAt: number;
}

/**
 * Build the Redis key for a phone number's profile.
 */
function profileKey(phone: string): string {
  return `${KEY_PREFIX}${phone}`;
}

/**
 * Retrieve the customer profile for a phone number.
 * Returns null if Redis is unavailable, key does not exist, or on error.
 */
export async function getProfile(
  phone: string,
): Promise<CustomerProfile | null> {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const raw = await redis.get(profileKey(phone));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as CustomerProfile;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, phone }, "Failed to get customer profile");
    return null;
  }
}

/**
 * Store or update the customer profile for a phone number.
 * Applies notes cap before storing. Silently no-ops on failure.
 */
export async function updateProfile(
  phone: string,
  profile: CustomerProfile,
): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }

  try {
    // Enforce notes cap -- truncate from the beginning (oldest notes dropped)
    if (profile.notes && profile.notes.length > MAX_NOTES_LENGTH) {
      profile.notes = profile.notes.slice(-MAX_NOTES_LENGTH);
    }

    profile.updatedAt = Date.now();

    await redis.set(
      profileKey(phone),
      JSON.stringify(profile),
      "EX",
      PROFILE_TTL,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, phone }, "Failed to update customer profile");
  }
}

/**
 * Build a profile context string for the AI system prompt.
 * Only includes fields that have values.
 */
export function buildProfileContext(profile: CustomerProfile): string {
  const parts: string[] = [];

  if (profile.name) {
    parts.push(`Nombre: ${profile.name}`);
  }
  if (profile.injuries && profile.injuries.length > 0) {
    parts.push(`Lesiones: ${profile.injuries.join(", ")}`);
  }
  if (profile.classPreferences && profile.classPreferences.length > 0) {
    parts.push(
      `Preferencias de clases: ${profile.classPreferences.join(", ")}`,
    );
  }
  if (profile.branchPreference) {
    parts.push(`Sede preferida: ${profile.branchPreference}`);
  }
  if (profile.membershipPlan) {
    parts.push(`Plan: ${profile.membershipPlan}`);
  }
  if (profile.notes) {
    parts.push(`Notas: ${profile.notes}`);
  }

  return parts.join("\n");
}
