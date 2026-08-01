import { describe, expect, it } from "vitest";

// Exact scoped values from index.css. The calculation below is deterministic;
// browser QA separately verifies the applied computed colors.
const HOME_MUTED = { light: "#625e53", dark: "#b8b09e" } as const;

function srgbChannel(value: number) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * srgbChannel((value >> 16) & 255)
    + 0.7152 * srgbChannel((value >> 8) & 255)
    + 0.0722 * srgbChannel(value & 255);
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

describe("HomePage muted text contrast", () => {
  it.each([
    ["paper", "#fbf9f4", 6.1499],
    ["canvas", "#e4dfd2", 4.8638],
  ])("meets WCAG AA on the light %s background", (_name, background, expectedRatio) => {
    const ratio = contrastRatio(HOME_MUTED.light, background);

    expect(ratio).toBeCloseTo(expectedRatio, 4);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["paper", "#24231e", 7.3018],
    ["canvas", "#151511", 8.4916],
  ])("preserves AA contrast on the dark %s background", (_name, background, expectedRatio) => {
    const ratio = contrastRatio(HOME_MUTED.dark, background);

    expect(ratio).toBeCloseTo(expectedRatio, 4);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
