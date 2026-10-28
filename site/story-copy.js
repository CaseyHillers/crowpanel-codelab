function clampProgress(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function storyCopyState(value, reducedMotion = false) {
  const progress = clampProgress(value);
  const beat = Math.min(3, Math.floor(progress * 4));
  const weights = [0, 0, 0, 0];
  weights[beat] = 1;
  if (!reducedMotion) {
    for (let boundary = 1; boundary < 4; boundary++) {
      const distance = progress - boundary / 4;
      if (Math.abs(distance) > .035) continue;
      const amount = (distance + .035) / .07;
      const blend = amount * amount * (3 - 2 * amount);
      weights.fill(0);
      weights[boundary - 1] = 1 - blend;
      weights[boundary] = blend;
    }
  }
  return weights.map((opacity, index) => ({
    opacity,
    offset: reducedMotion ? 0 : Math.max(-36, Math.min(36, (index + .5 - progress * 4) * 36)),
  }));
}
