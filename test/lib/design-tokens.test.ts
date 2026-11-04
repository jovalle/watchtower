import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { tokens } from "~/lib/design/tokens";

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

it("keeps every foreground readable on each app surface", () => {
  for (const foreground of Object.values(tokens.foreground)) {
    for (const background of Object.values(tokens.background)) {
      expect(contrast(foreground, background), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(contrast(tokens.accent.foreground, tokens.accent.primary)).toBeGreaterThanOrEqual(4.5);
});

it("keeps browser-surface CSS variables aligned with component tokens", () => {
  const css = readFileSync("app/tailwind.css", "utf8");
  for (const [group, values] of Object.entries(tokens)) {
    for (const [name, value] of Object.entries(values)) {
      expect(css, `${group}.${name}`).toContain(`--color-${group}-${name}: ${value}`);
    }
  }
});
