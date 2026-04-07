/**
 * Playbook Engine — Public Barrel
 *
 * Single import surface for the playbook module. Consumers (the WhatsApp
 * handler, the system-prompt builder, tests) should only import from here.
 */

export * from "./types.js";
export { PLAYBOOKS } from "./definitions.js";
export { resolvePlaybook } from "./resolver.js";
export type { ResolveResult } from "./resolver.js";
