/**
 * Heatmap color utility for days-since metrics.
 * Maps a numeric "days since" value to a background + text color
 * using a smooth gradient: green → yellow → orange → red.
 *
 * Theme-aware: detects [data-theme="light"] and adjusts contrast accordingly.
 *
 * Thresholds:
 *   0-10  = vibrant green (healthy)
 *   10-30 = fading green
 *   30-60 = yellow / amber (caution)
 *   60-100 = orange-red (warning)
 *   100+  = deepening red (critical)
 */

export interface HeatmapColor {
  background?: string;
  text: string;
}

/** Check if we're in light mode */
function isLightMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.theme === 'light';
}

/**
 * Returns CSS background and text colors for a given days-since value.
 * Returns null if the value is null/undefined (no data = no color).
 */
export function getDaysSinceHeatmap(days: number | null | undefined): HeatmapColor | null {
  if (days == null) return null;

  const d = Math.max(0, days);
  const light = isLightMode();

  if (light) {
    // Professional Light Mode: Crisp text colors, no muddy backgrounds.
    if (d <= 10) return { text: '#15803D' }; // High-contrast green
    if (d <= 30) return { text: '#16A34A' }; // Green
    if (d <= 60) return { text: '#B45309' }; // Amber
    if (d <= 100) return { text: '#EA580C' }; // Orange
    return { text: '#DC2626' }; // Red
  }

  // Dark Mode: Traditional glowing pastel heatmap
  let hue: number;
  let saturation: number;
  let lightness: number;
  let bgAlpha: number;

  if (d <= 10) {
    hue = 142; saturation = 70; lightness = 45; bgAlpha = 0.15;
  } else if (d <= 30) {
    const t = (d - 10) / 20;
    hue = 142 - t * 62; saturation = 70 - t * 10; lightness = 45 + t * 5; bgAlpha = 0.15 - t * 0.03;
  } else if (d <= 60) {
    const t = (d - 30) / 30;
    hue = 80 - t * 35; saturation = 60 + t * 20; lightness = 50; bgAlpha = 0.12 + t * 0.02;
  } else if (d <= 100) {
    const t = (d - 60) / 40;
    hue = 45 - t * 35; saturation = 80 + t * 10; lightness = 50 - t * 5; bgAlpha = 0.14 + t * 0.04;
  } else {
    const t = Math.min((d - 100) / 200, 1);
    hue = 10 - t * 10; saturation = 90; lightness = 45 - t * 10; bgAlpha = 0.18 + t * 0.12;
  }

  const bg = `hsla(${hue}, ${saturation}%, ${lightness}%, ${bgAlpha})`;
  const text = `hsl(${hue}, ${saturation}%, ${Math.min(lightness + 15, 70)}%)`;
  return { background: bg, text };
}

/**
 * Heatmap for communication recency (days since last contact).
 */
export function getCommDaysHeatmap(days: number | null | undefined): HeatmapColor | null {
  if (days == null) return null;
  const d = Math.max(0, days);
  const light = isLightMode();

  if (light) {
    // Professional Light Mode: Crisp text colors, no muddy backgrounds.
    if (d <= 14) return { text: '#15803D' }; 
    if (d <= 30) return { text: '#16A34A' };
    if (d <= 60) return { text: '#B45309' };
    return { text: '#DC2626' }; 
  }

  // Dark Mode
  let hue: number;
  let saturation: number;
  let lightness: number;
  let bgAlpha: number;

  if (d <= 14) {
    hue = 142; saturation = 70; lightness = 45; bgAlpha = 0.15;
  } else if (d <= 30) {
    const t = (d - 14) / 16;
    hue = 142 - t * 62; saturation = 70 - t * 10; lightness = 45 + t * 5; bgAlpha = 0.15 - t * 0.03;
  } else if (d <= 60) {
    const t = (d - 30) / 30;
    hue = 80 - t * 35; saturation = 60 + t * 20; lightness = 50; bgAlpha = 0.12 + t * 0.04;
  } else {
    const t = Math.min((d - 60) / 120, 1);
    hue = 45 - t * 45; saturation = 80 + t * 10; lightness = 50 - t * 15; bgAlpha = 0.16 + t * 0.14;
  }

  const bg = `hsla(${hue}, ${saturation}%, ${lightness}%, ${bgAlpha})`;
  const text = `hsl(${hue}, ${saturation}%, ${Math.min(lightness + 15, 70)}%)`;
  return { background: bg, text };
}
