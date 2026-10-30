export function withBrowserClock(source, now = new Date()) {
  const year = now.getUTCFullYear();
  if (!Number.isFinite(now.getTime()) || year < 2026 || year > 9999) {
    throw new Error("Check your computer's clock before running Weather; HTTPS needs the correct date and time.");
  }
  const datetime = [year, now.getUTCMonth() + 1, now.getUTCDate(),
    (now.getUTCDay() + 6) % 7, now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), 0];
  return `from machine import RTC\nRTC().datetime((${datetime.join(", ")}))\n` + source;
}
