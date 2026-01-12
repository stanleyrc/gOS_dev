/**
 * Zoom and pan math utilities for KonvaScatter component
 */

/**
 * Clamp a domain [min, max] to limits while preserving range size.
 * @param {number} min - Current min
 * @param {number} max - Current max
 * @param {number} limitMin - Hard minimum limit
 * @param {number} limitMax - Hard maximum limit
 * @returns {[number, number]} Clamped [min, max]
 */
export const clampDomain = (min, max, limitMin, limitMax) => {
  const range = max - min;
  let newMin = min;
  let newMax = max;

  if (newMin < limitMin) {
    newMin = limitMin;
    newMax = limitMin + range;
  }
  if (newMax > limitMax) {
    newMax = limitMax;
    newMin = limitMax - range;
  }

  return [newMin, newMax];
};

/**
 * Convert mouse pixel position to data coordinate.
 * @param {number} mousePixel - Mouse X in pixels
 * @param {number} plotLeft - Plot area left edge in pixels
 * @param {number} plotWidth - Plot area width in pixels
 * @param {[number, number]} domain - Current [min, max] domain
 * @returns {number} Data coordinate at mouse position
 */
export const pixelToDataPosition = (mousePixel, plotLeft, plotWidth, domain) => {
  const ratio = Math.max(0, Math.min(1, (mousePixel - plotLeft) / plotWidth));
  return domain[0] + ratio * (domain[1] - domain[0]);
};

/**
 * Calculate panned domain from pixel delta.
 * @param {[number, number]} domain - Current domain
 * @param {number} deltaPixels - Drag delta in pixels (negative = dragging right)
 * @param {number} plotWidth - Plot width in pixels
 * @param {[number, number]} limits - [min, max] limits
 * @returns {[number, number]} New clamped domain
 */
export const calculatePannedDomain = (domain, deltaPixels, plotWidth, limits) => {
  const dataRange = domain[1] - domain[0];
  const dataDelta = (deltaPixels / plotWidth) * dataRange;
  const newMin = domain[0] - dataDelta;
  const newMax = domain[1] - dataDelta;
  return clampDomain(newMin, newMax, limits[0], limits[1]);
};
