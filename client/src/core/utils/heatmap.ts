/**
 * Heatmap color utility for days-since metrics.
 * Maps a numeric "days since" value to a background + text color
 * using a smooth gradient: green → yellow → orange → red.
 *
 * Thresholds:
 *   0-10  = vibrant green (healthy)
 *   10-30 = fading green
 *   30-60 = yellow / amber (caution)
 *   60-100 = orange-red (warning)
 *   100+  = deepening red (critical)
 */

export interface HeatmapColor {
  background: string;
  text: string;
}

/**
 * Returns CSS background and text colors for a given days-since value.
 * Returns null if the value is null/undefined (no data = no color).
 */
export function getDaysSinceHeatmap(days: number | null | undefined): HeatmapColor | null {
  if (days == null) return null;

  // Clamp to a reasonable range for interpolation
  const d = Math.max(0, days);

  let hue: number;
  let saturation: number;
  let lightness: number;
  let bgAlpha: number;

  if (d <= 10) {
    // Green zone: hue 142 (green), high sat
    hue = 142;
    saturation = 70;
    lightness = 45;
    bgAlpha = 0.15;
  } else if (d <= 30) {
    // Green fading toward yellow-green: hue 142 → 80
    const t = (d - 10) / 20; // 0..1
    hue = 142 - t * 62; // 142 → 80
    saturation = 70 - t * 10; // 70 → 60
    lightness = 45 + t * 5; // 45 → 50
    bgAlpha = 0.15 - t * 0.03; // 0.15 → 0.12
  } else if (d <= 60) {
    // Yellow zone: hue 80 → 45
    const t = (d - 30) / 30; // 0..1
    hue = 80 - t * 35; // 80 → 45
    saturation = 60 + t * 20; // 60 → 80
    lightness = 50; // flat
    bgAlpha = 0.12 + t * 0.02; // 0.12 → 0.14
  } else if (d <= 100) {
    // Orange → Red: hue 45 → 10
    const t = (d - 60) / 40; // 0..1
    hue = 45 - t * 35; // 45 → 10
    saturation = 80 + t * 10; // 80 → 90
    lightness = 50 - t * 5; // 50 → 45
    bgAlpha = 0.14 + t * 0.04; // 0.14 → 0.18
  } else {
    // Deep red: hue 10 → 0, getting deeper
    const t = Math.min((d - 100) / 200, 1); // 0..1 over next 200 days
    hue = 10 - t * 10; // 10 → 0
    saturation = 90;
    lightness = 45 - t * 10; // 45 → 35
    bgAlpha = 0.18 + t * 0.12; // 0.18 → 0.30
  }

  const bg = `hsla(${hue}, ${saturation}%, ${lightness}%, ${bgAlpha})`;
  const text = `hsl(${hue}, ${saturation}%, ${Math.min(lightness + 15, 70)}%)`;

  return { background: bg, text };
}
