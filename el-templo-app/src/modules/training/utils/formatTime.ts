/**
 * Format elapsed time in human-readable format
 *
 * Displays time in MM:SS format for durations under an hour,
 * or H:MM:SS format for longer durations.
 *
 * @param totalSeconds - Total elapsed time in seconds
 * @returns Formatted time string (e.g., "01:15" or "1:01:05")
 *
 * @example
 * formatElapsedTime(0)    // "00:00"
 * formatElapsedTime(75)   // "01:15"
 * formatElapsedTime(3665) // "1:01:05"
 */
export function formatElapsedTime(totalSeconds: number): string {
  // Ensure we're working with a non-negative integer
  const seconds = Math.max(0, Math.floor(totalSeconds));

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  // Pad minutes and seconds with leading zeros
  const paddedMinutes = minutes.toString().padStart(2, '0');
  const paddedSeconds = remainingSeconds.toString().padStart(2, '0');

  if (hours > 0) {
    // H:MM:SS format for durations >= 1 hour
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }

  // MM:SS format for durations < 1 hour
  return `${paddedMinutes}:${paddedSeconds}`;
}

/**
 * Format rest time in seconds to a display string
 *
 * Shows rest time in seconds with "s" suffix, or as minutes
 * for longer rest periods.
 *
 * @param seconds - Rest time in seconds
 * @returns Formatted rest string (e.g., "30s", "90s", "2min")
 *
 * @example
 * formatRestTime(30)  // "30s"
 * formatRestTime(90)  // "90s"
 * formatRestTime(120) // "2min"
 */
export function formatRestTime(seconds: number): string {
  if (seconds >= 120 && seconds % 60 === 0) {
    // Show as minutes if >= 2 minutes and evenly divisible
    return `${seconds / 60}min`;
  }
  return `${seconds}s`;
}
