// Small, pure helpers for parsing URL query parameters in route handlers.

export interface IntParamOptions {
  /** Used when the value is missing or not a number. */
  fallback: number;
  min: number;
  max: number;
}

/**
 * Parse an integer query parameter and clamp it to [min, max]. A missing or
 * non-numeric value yields `fallback` instead of NaN (Math.min/Math.max
 * propagate NaN, which previously turned `?limit=abc` into an empty result).
 */
export function parseIntParam(raw: string | null, opts: IntParamOptions): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return opts.fallback;
  return Math.min(Math.max(n, opts.min), opts.max);
}
