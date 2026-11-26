// Mirrors backend/src/lib/constants.js's STATE_PATH_IDS/SEQUENTIAL_BLUE
// (itself ported from nigeria_map.py) — small enough to duplicate rather
// than share a package between the two apps.
export const STATE_PATH_IDS: Record<string, string> = {
  Lagos: "3108",
  Ogun: "3110",
  Oyo: "3114",
  Edo: "3120",
  Delta: "3118",
  Kaduna: "3123",
  Abuja: "3786",
};

export const SEQUENTIAL_BLUE = [
  "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7",
  "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b",
];

export function sequentialBlue(frac: number): string {
  const clamped = Math.max(0, Math.min(1, frac));
  const idx = Math.round(clamped * (SEQUENTIAL_BLUE.length - 1));
  return SEQUENTIAL_BLUE[idx];
}
