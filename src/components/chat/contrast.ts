/**
 * WCAG relative-luminance contrast helpers for the monochrome theme.
 *
 * Pure functions, no imports: safe for `node --test` in addition to
 * browser/server use. Regression coverage for the Task 25BF contrast
 * findings (sidebar secondary text, header/helper text).
 */

function channelToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const clean = hex.replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const lighter = relativeLuminance(foreground);
  const darker = relativeLuminance(background);
  const [hi, lo] =
    lighter >= darker ? [lighter, darker] : [darker, lighter];
  return (hi + 0.05) / (lo + 0.05);
}
