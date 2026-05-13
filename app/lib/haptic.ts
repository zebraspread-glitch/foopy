/**
 * Haptic feedback shim.
 * On iOS Safari the Web Vibration API is not supported; on Android it is.
 * We also attempt the iOS-only AudioContext 0-duration trick as a no-op
 * so the call is safe everywhere.
 */

type HapticStyle = "selection" | "light" | "medium" | "heavy" | "success" | "error";

const PATTERNS: Record<HapticStyle, number | number[]> = {
  selection: 8,
  light:     12,
  medium:    20,
  heavy:     30,
  success:   [10, 30, 10],
  error:     [30, 20, 30],
};

export function haptic(style: HapticStyle = "light") {
  if (typeof navigator === "undefined") return;
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate(PATTERNS[style]);
    }
  } catch {
    // silently ignore — some browsers throw on vibrate
  }
}
