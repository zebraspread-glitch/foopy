import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const isNative = Capacitor.isNativePlatform();

/** Light tap — use on every button/card press */
export async function hapticLight() {
  if (!isNative) return;
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
}

/** Medium tap — use on confirm actions, selections */
export async function hapticMedium() {
  if (!isNative) return;
  try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
}

/** Heavy tap — use on destructive actions, big moments */
export async function hapticHeavy() {
  if (!isNative) return;
  try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
}

/** Success notification — use when something completes successfully */
export async function hapticSuccess() {
  if (!isNative) return;
  try { await Haptics.notification({ type: NotificationType.Success }); } catch {}
}

/** Error notification — use on failure */
export async function hapticError() {
  if (!isNative) return;
  try { await Haptics.notification({ type: NotificationType.Error }); } catch {}
}

/** Warning notification */
export async function hapticWarning() {
  if (!isNative) return;
  try { await Haptics.notification({ type: NotificationType.Warning }); } catch {}
}
