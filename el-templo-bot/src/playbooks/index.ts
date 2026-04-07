/**
 * Playbook Engine — Public Barrel
 *
 * Single import surface for the playbook module. Consumers (the WhatsApp
 * handler, the system-prompt builder, tests) should only import from here.
 */

export * from "./types.js";
export { PLAYBOOKS } from "./definitions.js";
// Resolver exports are wired up in Task 2 (plan 82-01). Intentionally left
// out of this commit so `pnpm tsc --noEmit` passes on the scaffolding
// commit; uncomment the line below after `resolver.ts` exists:
// export { resolvePlaybook, type ResolveResult } from "./resolver.js";
