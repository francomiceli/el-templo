/**
 * Trial Follow-up Scheduler
 *
 * After a trial class, sends a follow-up message asking how it went
 * and offering membership information.
 *
 * TODO: Implement.
 *
 * Pattern:
 * 1. Acquire Redis distributed lock
 * 2. Query attendance + users for trial members who attended in last 24-48h
 * 3. Filter: not already followed up, not already converted to member
 * 4. Send WhatsApp template with friendly follow-up
 * 5. Mark as followed up
 * 6. Release lock
 *
 * Schedule: Run every 60 minutes via node-cron
 */

export {};

// TODO: export function startTrialFollowupScheduler(): void { ... }
