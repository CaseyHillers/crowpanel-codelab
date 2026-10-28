export const CROWPANEL_USB_FILTER = Object.freeze({
  usbVendorId: 0x1a86,
  usbProductId: 0x7522,
});

export function requireCrowPanelPort(port) {
  const info = port.getInfo?.();
  if (info?.usbVendorId !== CROWPANEL_USB_FILTER.usbVendorId ||
      info?.usbProductId !== CROWPANEL_USB_FILTER.usbProductId) {
    throw new Error("Select the supported CrowPanel (USB 1a86:7522). Connect it by USB; other revisions and Bluetooth ports are not supported.");
  }
}
