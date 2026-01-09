/**
 * Tooltip management for KonvaScatter component
 */
import Konva from 'konva';
import {
  TOOLTIP_PADDING,
  TOOLTIP_FONT_SIZE,
  TOOLTIP_LINE_HEIGHT,
  TOOLTIP_CORNER_RADIUS,
  TOOLTIP_BG_COLOR,
  TOOLTIP_TEXT_COLOR,
  TOOLTIP_OFFSET,
} from './constants';

/**
 * Create tooltip elements and add to layer.
 *
 * @param {Konva.Layer} layer - The tooltip layer to add elements to
 * @returns {Object} Object containing tooltipGroup, tooltipRect, tooltipText
 */
export const createTooltipElements = (layer) => {
  const tooltipGroup = new Konva.Group({ visible: false });

  const tooltipRect = new Konva.Rect({
    fill: TOOLTIP_BG_COLOR,
    cornerRadius: TOOLTIP_CORNER_RADIUS,
  });

  const tooltipText = new Konva.Text({
    fill: TOOLTIP_TEXT_COLOR,
    fontSize: TOOLTIP_FONT_SIZE,
    padding: TOOLTIP_PADDING,
    lineHeight: TOOLTIP_LINE_HEIGHT,
  });

  tooltipGroup.add(tooltipRect);
  tooltipGroup.add(tooltipText);
  layer.add(tooltipGroup);

  return { tooltipGroup, tooltipRect, tooltipText };
};

/**
 * Calculate tooltip position to keep it within bounds.
 * Flips tooltip to opposite side if it would overflow.
 *
 * @param {Object} params - Position parameters
 * @param {Object} params.mousePos - Current mouse position {x, y}
 * @param {number} params.tooltipWidth - Width of tooltip
 * @param {number} params.tooltipHeight - Height of tooltip
 * @param {number} params.canvasWidth - Width of canvas
 * @param {number} params.canvasHeight - Height of canvas
 * @returns {Object} Calculated position {x, y}
 */
export const calculateTooltipPosition = (params) => {
  const { mousePos, tooltipWidth, tooltipHeight, canvasWidth, canvasHeight } = params;

  // Horizontal: flip left if would overflow right
  const xPos = mousePos.x + TOOLTIP_OFFSET + tooltipWidth > canvasWidth
    ? mousePos.x - tooltipWidth - TOOLTIP_OFFSET
    : mousePos.x + TOOLTIP_OFFSET;

  // Vertical: flip up if would overflow bottom
  const yPos = mousePos.y + TOOLTIP_OFFSET + tooltipHeight > canvasHeight
    ? mousePos.y - tooltipHeight - TOOLTIP_OFFSET
    : mousePos.y + TOOLTIP_OFFSET;

  return { x: xPos, y: yPos };
};

/**
 * Update tooltip content and size.
 *
 * @param {Object} params - Update parameters
 * @param {Konva.Text} params.tooltipText - Tooltip text element
 * @param {Konva.Rect} params.tooltipRect - Tooltip background rect
 * @param {string} params.content - Text content to display
 */
export const updateTooltipContent = (params) => {
  const { tooltipText, tooltipRect, content } = params;

  tooltipText.text(content);
  const textWidth = tooltipText.width();
  const textHeight = tooltipText.height();
  tooltipRect.size({ width: textWidth, height: textHeight });
};

/**
 * Format tooltip content from data point.
 *
 * @param {Object} dataPoint - The data point to format
 * @param {Function} [tooltipAccessor] - Optional custom accessor
 * @returns {string} Formatted tooltip text
 */
export const formatTooltipContent = (dataPoint, tooltipAccessor) => {
  const getTooltipContent = tooltipAccessor
    ? (typeof tooltipAccessor === 'function' ? tooltipAccessor : (d) => d[tooltipAccessor])
    : (d) =>
        Object.keys(d)
          .filter((k) => !k.startsWith('_'))
          .slice(0, 8)
          .map((k) => ({ label: k, value: d[k] }));

  const content = getTooltipContent(dataPoint);
  return content
    .map((item) => `${item.label}: ${String(item.value)}`)
    .join('\n');
};
