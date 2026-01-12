/**
 * Hover effect management for KonvaScatter component
 */
import { createShape, createErrorBarGroup } from './shapeFactory';
import { HOVER_DIM_OPACITY } from './constants';

/**
 * Apply CSS opacity dimming to canvas layers.
 * Uses direct CSS manipulation for O(1) performance.
 *
 * @param {Konva.Layer} circlesLayer - The circles layer
 * @param {Konva.Layer|null} errorBarsLayer - The error bars layer (optional)
 * @param {boolean} dimmed - true to dim, false to restore
 */
export const setLayerDimming = (circlesLayer, errorBarsLayer, dimmed) => {
  const opacity = dimmed ? String(HOVER_DIM_OPACITY) : '1';
  circlesLayer.getCanvas()._canvas.style.opacity = opacity;
  if (errorBarsLayer) {
    errorBarsLayer.getCanvas()._canvas.style.opacity = opacity;
  }
};

/**
 * Clear all children from hover layer except the connecting line.
 *
 * @param {Konva.Layer} hoverLayer - The hover layer
 * @param {Konva.Line|null} cachedHoverLine - The connecting line to preserve
 */
export const clearHoverLayerShapes = (hoverLayer, cachedHoverLine) => {
  // Use slice() to avoid modifying array during iteration
  hoverLayer.children.slice().forEach((child) => {
    if (child !== cachedHoverLine) {
      child.destroy();
    }
  });
};

/**
 * Create hover shapes in the hover layer.
 *
 * @param {Object} params - Parameters
 * @param {Array} params.hoveredShapes - Original shapes to recreate
 * @param {Konva.Layer} params.hoverLayer - The hover layer to add shapes to
 * @param {Function} params.xScale - d3 x scale
 * @param {Function} params.yScale - d3 y scale
 * @param {Function} params.colorScale - Color scale (optional)
 * @param {Function} params.getX - X accessor
 * @param {Function} params.getY - Y accessor
 * @param {Function} params.getColor - Color accessor
 * @param {Function} params.getRadius - Radius accessor
 * @param {Function} params.getShape - Shape type accessor
 * @param {Function} params.getHollow - Hollow accessor
 * @param {string} params.hoverStroke - Hover stroke color
 * @param {number} params.hoverStrokeWidth - Hover stroke width
 * @returns {Array<{x, y, color}>} Points for connecting line
 */
export const createHoverShapes = (params) => {
  const {
    hoveredShapes,
    hoverLayer,
    xScale,
    yScale,
    colorScale,
    getX,
    getY,
    getColor,
    getRadius,
    getShape,
    getHollow,
    hoverStroke,
    hoverStrokeWidth,
  } = params;

  const points = [];

  hoveredShapes.forEach((originalShape) => {
    const dp = originalShape.getAttr('dataPoint');
    if (!dp) return;

    const screenX = xScale(getX(dp));
    const screenY = yScale(getY(dp));
    const colorVal = getColor(dp);
    const fill = colorScale ? colorScale(colorVal) : colorVal;

    const shape = createShape({
      shapeType: getShape(dp),
      x: screenX,
      y: screenY,
      radius: getRadius(dp),
      fill,
      isHollow: getHollow(dp),
      stroke: hoverStroke,
      strokeWidth: hoverStrokeWidth,
    });

    shape.setAttr('dataPoint', dp);
    hoverLayer.add(shape);
    points.push({ x: screenX, y: screenY, color: fill });
  });

  return points;
};

/**
 * Create hover error bars in the hover layer.
 *
 * @param {Object} params - Parameters
 * @param {Array} params.hoveredErrorBars - Original error bars to recreate
 * @param {Konva.Layer} params.hoverLayer - The hover layer to add error bars to
 * @param {Function} params.xScale - d3 x scale
 * @param {Function} params.yScale - d3 y scale
 * @param {Function} params.colorScale - Color scale (optional)
 * @param {Function} params.getX - X accessor
 * @param {Function} params.getY - Y accessor
 * @param {Function} params.getColor - Color accessor
 * @param {Function} params.getCiLower - CI lower accessor
 * @param {Function} params.getCiUpper - CI upper accessor
 */
export const createHoverErrorBars = (params) => {
  const {
    hoveredErrorBars,
    hoverLayer,
    xScale,
    yScale,
    colorScale,
    getX,
    getY,
    getColor,
    getCiLower,
    getCiUpper,
  } = params;

  hoveredErrorBars.forEach((originalErrorBar) => {
    const dp = originalErrorBar.getAttr('dataPoint');
    if (!dp) return;

    const screenX = xScale(getX(dp));
    const screenY = yScale(getY(dp));
    const colorVal = getColor(dp);
    const fill = colorScale ? colorScale(colorVal) : colorVal;

    const ciLower = getCiLower ? getCiLower(dp) : null;
    const ciUpper = getCiUpper ? getCiUpper(dp) : null;
    const yLower = ciLower != null && !isNaN(ciLower) ? yScale(ciLower) : null;
    const yUpper = ciUpper != null && !isNaN(ciUpper) ? yScale(ciUpper) : null;

    const errorBarGroup = createErrorBarGroup({
      screenX,
      screenY,
      yLower,
      yUpper,
      stroke: fill,
    });

    if (errorBarGroup) {
      errorBarGroup.setAttr('dataPoint', dp);
      hoverLayer.add(errorBarGroup);
    }
  });
};

/**
 * Update the connecting line between hover points.
 *
 * @param {Konva.Line} cachedLine - The cached connecting line
 * @param {Array<{x, y}>} points - Points to connect
 */
export const updateConnectingLine = (cachedLine, points) => {
  if (points.length > 1) {
    points.sort((a, b) => a.y - b.y);
    cachedLine.points(points.flatMap((p) => [p.x, p.y]));
    cachedLine.visible(true);
  } else if (cachedLine) {
    cachedLine.visible(false);
  }
};
