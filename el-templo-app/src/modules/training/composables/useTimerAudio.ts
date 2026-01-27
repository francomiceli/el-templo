/**
 * Timer audio and haptic feedback composable
 *
 * Provides audio cues (via Web Audio API) and haptic feedback (via Capacitor Haptics)
 * for timer transitions and completions.
 *
 * Audio is generated programmatically using OscillatorNode to avoid external file dependencies.
 * Haptic calls are wrapped in try/catch for graceful web fallback.
 */

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

interface TimerAudioReturn {
  playBeep: () => void;
  playComplete: () => void;
  playWarning: () => void;
  unlockAudio: () => void;
}

/**
 * Audio and haptic cue management for timer events
 *
 * Call unlockAudio() on first user interaction (e.g., "Start Timer" button)
 * to enable audio playback (browser autoplay restrictions).
 */
export function useTimerAudio(): TimerAudioReturn {
  let audioContext: AudioContext | null = null;

  /**
   * Get or create AudioContext
   * Lazy initialization to avoid autoplay restrictions
   */
  function getAudioContext(): AudioContext {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContext;
  }

  /**
   * Play a tone with specified frequency and duration
   *
   * @param frequency - Frequency in Hz (e.g., 440 for A4)
   * @param durationMs - Duration in milliseconds
   */
  function playTone(frequency: number, durationMs: number): void {
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      // Fade in/out for smoother sound
      const now = ctx.currentTime;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01); // Quick fade in
      gainNode.gain.linearRampToValueAtTime(0, now + durationMs / 1000); // Fade out

      oscillator.start(now);
      oscillator.stop(now + durationMs / 1000);
    } catch (error) {
      // Fail silently if audio not available
      console.warn('Audio playback failed:', error);
    }
  }

  /**
   * Play two-tone sequence with delay
   *
   * @param freq1 - First tone frequency
   * @param freq2 - Second tone frequency
   * @param duration1 - First tone duration in ms
   * @param duration2 - Second tone duration in ms
   * @param gap - Gap between tones in ms
   */
  function playTwoTones(
    freq1: number,
    freq2: number,
    duration1: number,
    duration2: number,
    gap: number
  ): void {
    playTone(freq1, duration1);
    setTimeout(() => {
      playTone(freq2, duration2);
    }, duration1 + gap);
  }

  /**
   * Play beep sound for EMOM round transitions
   * 440Hz (A4) for 150ms + medium haptic impact
   */
  function playBeep(): void {
    playTone(440, 150);

    // Haptic feedback
    try {
      void Haptics.impact({ style: ImpactStyle.Medium });
    } catch (error) {
      // Gracefully handle web platform where haptics aren't available
      console.debug('Haptics not available:', error);
    }
  }

  /**
   * Play completion sound for timer finish
   * Two-tone sequence: 440Hz + 880Hz (A4 + A5) + success haptic
   */
  function playComplete(): void {
    playTwoTones(440, 880, 150, 150, 50);

    // Haptic feedback
    try {
      void Haptics.notification({ type: NotificationType.Success });
    } catch (error) {
      console.debug('Haptics not available:', error);
    }
  }

  /**
   * Play warning sound for countdown alerts (5s, 10s remaining)
   * 330Hz (E4) for 100ms - lower, shorter tone
   */
  function playWarning(): void {
    playTone(330, 100);
  }

  /**
   * Unlock audio context on first user interaction
   * Call this from "Start Timer" button to enable audio playback
   */
  function unlockAudio(): void {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  return {
    playBeep,
    playComplete,
    playWarning,
    unlockAudio,
  };
}
