import { CROWPANEL_USB_FILTER, requireCrowPanelPort } from "./usb-devices.js";

export function detectHostOs(navigatorLike) {
  const hints = [
    navigatorLike?.userAgentData?.platform,
    navigatorLike?.platform,
    navigatorLike?.userAgent,
  ].map((hint) => typeof hint === "string" ? hint : "");

  if (navigatorLike?.userAgentData?.mobile === true ||
      hints.some((hint) => /iphone|ipad|ipod|android|cros|chrome\s*os/i.test(hint)) ||
      (hints[1].trim().toLowerCase() === "macintel" && navigatorLike?.maxTouchPoints > 1)) {
    return null;
  }

  for (const hint of hints) {
    if (/\b(?:macos|macintosh|macintel|macppc|mac68k|mac os(?: x)?)\b/i.test(hint)) return "macos";
    if (/\b(?:windows|win32|win64)\b/i.test(hint)) return "windows";
    if (/\blinux\b/i.test(hint)) return "linux";
  }
  return null;
}

export async function checkUsbDevice(serial) {
  if (typeof serial?.requestPort !== "function") {
    throw new Error("Web Serial is unavailable. Use desktop Chrome or Edge on HTTPS or localhost, then retry the USB check.");
  }
  const port = await serial.requestPort({ filters: [CROWPANEL_USB_FILTER] });
  requireCrowPanelPort(port);
  const info = port.getInfo();
  return { vendorId: info.usbVendorId, productId: info.usbProductId };
}
