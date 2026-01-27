/**
 * Type declarations for @capacitor-community/keep-awake
 *
 * This plugin is an optional dependency - only installed for native builds.
 * Declaring types here allows TypeScript to compile even when the plugin
 * is not installed, since we dynamically import and catch errors at runtime.
 */
declare module '@capacitor-community/keep-awake' {
  export interface KeepAwakePlugin {
    /**
     * Keep the screen awake / prevent device from sleeping
     */
    keepAwake(): Promise<void>;

    /**
     * Allow the screen to turn off / device to sleep normally
     */
    allowSleep(): Promise<void>;

    /**
     * Check if keep awake is currently active
     */
    isKeptAwake(): Promise<{ isKeptAwake: boolean }>;
  }

  export const KeepAwake: KeepAwakePlugin;
}
